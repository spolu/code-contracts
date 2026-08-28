import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import type { SyntaxNode, Tree } from "@lezer/common";
import { parser } from "@lezer/rust";

import { parseContracts, type CodeContract } from "../contract.js";
import type { SourcePosition, SourceRange } from "../language-server.js";
import type {
  ContractDeclaration,
  DeclarationContracts,
  LocalContractExtractor,
} from "../local-contracts.js";
import {
  hasPotentialContractDirective,
  type ContractDocument,
} from "./contract-document.js";
import {
  positionAt,
  sourceLines,
  toSourceRange,
  validateSourcePosition,
  type SourceLine,
  type SourceTarget,
} from "./source-text.js";

const DECLARATION_NODES = new Set([
  "AssociatedType",
  "ConstItem",
  "EnumItem",
  "EnumVariant",
  "FieldDeclaration",
  "ForeignModItem",
  "FunctionItem",
  "ImplItem",
  "MacroDefinition",
  "ModItem",
  "StaticItem",
  "StructItem",
  "TraitItem",
  "TypeItem",
  "UnionItem",
]);

const TYPE_DECLARATION_NODES = new Set([
  "EnumItem",
  "StructItem",
  "TypeItem",
  "UnionItem",
]);

type RustDocumentationStyle = "inner" | "outer";

interface RustContractDocument extends ContractDocument {
  from: number;
  to: number;
  range: SourceRange;
  style: RustDocumentationStyle;
}

interface RustDeclaration {
  node: SyntaxNode;
  rangeNode: SyntaxNode;
  parent?: RustDeclaration;
  depth: number;
  declaration: ContractDeclaration;
}

export const isRustSourceFile = (filePath: string): boolean =>
  extname(filePath).toLowerCase() === ".rs";

const children = (node: SyntaxNode): SyntaxNode[] => {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    result.push(child);
  }
  return result;
};

const directChild = (node: SyntaxNode, name: string): SyntaxNode | undefined =>
  children(node).find((child) => child.name === name);

const descendants = (node: SyntaxNode, name: string): SyntaxNode[] => {
  const result: SyntaxNode[] = [];
  const visit = (candidate: SyntaxNode): void => {
    if (candidate.name === name) {
      result.push(candidate);
    }
    for (const child of children(candidate)) {
      visit(child);
    }
  };
  visit(node);
  return result;
};

const documentationStyle = (
  node: SyntaxNode,
  source: string,
): RustDocumentationStyle | undefined => {
  const comment = source.slice(node.from, node.to);
  if (node.name === "LineComment") {
    if (comment.startsWith("///") && !comment.startsWith("////")) {
      return "outer";
    }
    return comment.startsWith("//!") ? "inner" : undefined;
  }
  if (node.name === "BlockComment") {
    if (comment.startsWith("/**") && !comment.startsWith("/***")) {
      return "outer";
    }
    return comment.startsWith("/*!") ? "inner" : undefined;
  }
  return undefined;
};

const leadingWhitespaceLength = (line: string): number =>
  /^[ \t]*/.exec(line)?.[0].length ?? 0;

const normalizeLineComments = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  comments: SyntaxNode[],
  style: RustDocumentationStyle,
): RustContractDocument => {
  const first = comments[0];
  const last = comments.at(-1);
  if (!first || !last) {
    throw new Error("Cannot normalize an empty Rust line-comment group.");
  }

  const sourceColumns: number[] = [];
  const normalized = comments
    .map((comment) => {
      const text = source.slice(comment.from + 3, comment.to);
      const decorationLength = text.startsWith(" ") ? 1 : 0;
      const start = positionAt(lines, comment.from);
      sourceColumns.push(start.column + 3 + decorationLength);
      return text.slice(decorationLength);
    })
    .join("\n");
  const start = positionAt(lines, first.from);

  return {
    source: normalized,
    lineOffset: start.line - 1,
    sourceColumns,
    from: first.from,
    to: last.to,
    range: toSourceRange(filePath, lines, first.from, last.to),
    style,
  };
};

const normalizeBlockComment = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  comment: SyntaxNode,
  style: RustDocumentationStyle,
): RustContractDocument => {
  const body = source
    .slice(comment.from + 3, comment.to - 2)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
  const rawLines = body.split("\n");
  const decorated = rawLines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .every((line) => /^[ \t]*\*/.test(line));
  const indents = decorated
    ? []
    : rawLines
        .slice(1)
        .filter((line) => line.trim().length > 0)
        .map(leadingWhitespaceLength);
  const commonIndent = indents.length > 0 ? Math.min(...indents) : 0;
  const start = positionAt(lines, comment.from);
  const sourceColumns: number[] = [];
  const normalized = rawLines
    .map((line, index) => {
      let removed: number;
      if (index === 0) {
        removed = line.startsWith(" ") ? 1 : 0;
      } else if (decorated) {
        removed = /^[ \t]*\* ?/.exec(line)?.[0].length ?? 0;
      } else {
        removed = Math.min(leadingWhitespaceLength(line), commonIndent);
      }
      sourceColumns.push(
        index === 0 ? start.column + 3 + removed : removed + 1,
      );
      return line.slice(removed);
    })
    .join("\n");

  return {
    source: normalized,
    lineOffset: start.line - 1,
    sourceColumns,
    from: comment.from,
    to: comment.to,
    range: toSourceRange(filePath, lines, comment.from, comment.to),
    style,
  };
};

const continuesLineCommentGroup = (gap: string): boolean =>
  /^(?:\r\n|\r|\n)[ \t]*$/.test(gap);

const commentDocuments = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  tree: Tree,
): RustContractDocument[] => {
  const comments = [
    ...descendants(tree.topNode, "LineComment"),
    ...descendants(tree.topNode, "BlockComment"),
  ].toSorted((left, right) => left.from - right.from);
  const documents: RustContractDocument[] = [];

  for (let index = 0; index < comments.length; index += 1) {
    const comment = comments[index];
    if (!comment) {
      continue;
    }
    const style = documentationStyle(comment, source);
    if (!style) {
      continue;
    }
    if (comment.name === "BlockComment") {
      documents.push(
        normalizeBlockComment(filePath, source, lines, comment, style),
      );
      continue;
    }

    const group = [comment];
    while (index + 1 < comments.length) {
      const next = comments[index + 1];
      const previous = group.at(-1);
      if (
        !next ||
        !previous ||
        next.name !== "LineComment" ||
        documentationStyle(next, source) !== style ||
        !continuesLineCommentGroup(source.slice(previous.to, next.from))
      ) {
        break;
      }
      group.push(next);
      index += 1;
    }
    documents.push(
      normalizeLineComments(filePath, source, lines, group, style),
    );
  }

  return documents;
};

const nodeText = (
  node: SyntaxNode | undefined,
  source: string,
): string | undefined => (node ? source.slice(node.from, node.to) : undefined);

const implTypes = (node: SyntaxNode): SyntaxNode[] =>
  children(node).filter((child) => child.type.is("Type"));

const implName = (node: SyntaxNode, source: string): string | undefined => {
  const types = implTypes(node);
  const target = types.at(-1);
  if (!target) {
    return undefined;
  }
  const targetName = source.slice(target.from, target.to);
  const implementedTrait = types.length > 1 ? types[0] : undefined;
  return implementedTrait
    ? `${source.slice(implementedTrait.from, implementedTrait.to)} for ${targetName}`
    : targetName;
};

const declarationName = (
  node: SyntaxNode,
  source: string,
): string | undefined => {
  switch (node.name) {
    case "FunctionItem":
    case "ConstItem":
    case "StaticItem":
    case "ModItem":
      return nodeText(directChild(node, "BoundIdentifier"), source);
    case "StructItem":
    case "UnionItem":
    case "EnumItem":
    case "TypeItem":
    case "TraitItem":
    case "AssociatedType":
      return nodeText(directChild(node, "TypeIdentifier"), source);
    case "FieldDeclaration":
      return nodeText(directChild(node, "FieldIdentifier"), source);
    case "EnumVariant":
    case "MacroDefinition":
      return nodeText(directChild(node, "Identifier"), source);
    case "ImplItem":
      return implName(node, source);
    default:
      return undefined;
  }
};

const declarationKind = (
  node: SyntaxNode,
  parent: RustDeclaration | undefined,
): string => {
  switch (node.name) {
    case "FunctionItem":
      if (parent?.node.name === "ImplItem") {
        return "method";
      }
      if (parent?.node.name === "TraitItem") {
        return directChild(node, "Block") ? "method" : "method-signature";
      }
      if (parent?.node.name === "ForeignModItem") {
        return "function-signature";
      }
      return "function";
    case "StructItem":
      return "struct";
    case "UnionItem":
      return "union";
    case "EnumItem":
      return "enum";
    case "TraitItem":
      return "trait";
    case "ImplItem":
      return "impl";
    case "TypeItem":
    case "AssociatedType":
      return parent?.node.name === "ImplItem" ||
        parent?.node.name === "TraitItem"
        ? "associated-type"
        : "type";
    case "ConstItem":
      return parent?.node.name === "ImplItem" ||
        parent?.node.name === "TraitItem"
        ? "associated-constant"
        : "constant";
    case "StaticItem":
      return "static";
    case "ModItem":
      return "module";
    case "ForeignModItem":
      return "extern-block";
    case "FieldDeclaration":
      return "field";
    case "EnumVariant":
      return "enum-variant";
    case "MacroDefinition":
      return "macro";
    default:
      return "declaration";
  }
};

const declarationRangeNode = (node: SyntaxNode): SyntaxNode =>
  node.parent?.name === "AttributeItem" ? node.parent : node;

const implTargetName = (
  declaration: RustDeclaration,
  source: string,
): string | undefined => {
  const target = implTypes(declaration.node).at(-1);
  const name = target ? descendants(target, "TypeIdentifier")[0] : undefined;
  return name ? source.slice(name.from, name.to) : undefined;
};

const collectDeclarations = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  tree: Tree,
): RustDeclaration[] => {
  const declarations: RustDeclaration[] = [];

  const visit = (
    node: SyntaxNode,
    parent: RustDeclaration | undefined,
  ): void => {
    let nextParent = parent;
    if (DECLARATION_NODES.has(node.name)) {
      const declaration: RustDeclaration = {
        node,
        rangeNode: declarationRangeNode(node),
        parent,
        depth: parent ? parent.depth + 1 : 0,
        declaration: {
          name: declarationName(node, source),
          kind: declarationKind(node, parent),
          range: toSourceRange(filePath, lines, node.from, node.to),
        },
      };
      declarations.push(declaration);
      nextParent = declaration;
    }

    for (const child of children(node)) {
      visit(child, nextParent);
    }
  };
  visit(tree.topNode, undefined);

  const types = declarations.filter((declaration) =>
    TYPE_DECLARATION_NODES.has(declaration.node.name),
  );
  for (const declaration of declarations) {
    if (declaration.node.name !== "ImplItem") {
      continue;
    }
    const targetName = implTargetName(declaration, source);
    const target = targetName
      ? types.find(
          (candidate) =>
            candidate.declaration.name === targetName &&
            candidate.parent === declaration.parent,
        )
      : undefined;
    if (target) {
      declaration.parent = target;
    }
  }

  for (const declaration of declarations) {
    let depth = 0;
    for (let parent = declaration.parent; parent; parent = parent.parent) {
      depth += 1;
    }
    declaration.depth = depth;
  }

  return declarations;
};

const attachmentAnchors = (node: SyntaxNode): number[] => {
  const anchors = new Set([node.from]);
  let sibling = node.prevSibling;
  while (sibling) {
    if (sibling.name === "Attribute") {
      anchors.add(sibling.from);
    } else if (
      sibling.name !== "LineComment" &&
      sibling.name !== "BlockComment"
    ) {
      break;
    }
    sibling = sibling.prevSibling;
  }
  if (node.parent?.name === "AttributeItem") {
    anchors.add(node.parent.from);
  }
  return [...anchors];
};

const documentsAtAnchor = (
  anchor: number,
  documents: RustContractDocument[],
  source: string,
): RustContractDocument[] => {
  const attached: RustContractDocument[] = [];
  let boundary = anchor;

  for (let index = documents.length - 1; index >= 0; index -= 1) {
    const document = documents[index];
    if (!document || document.style !== "outer" || document.to > boundary) {
      continue;
    }
    if (/\S/.test(source.slice(document.to, boundary))) {
      break;
    }
    attached.unshift(document);
    boundary = document.from;
  }
  return attached;
};

const attachedDocuments = (
  declaration: RustDeclaration,
  documents: RustContractDocument[],
  source: string,
): RustContractDocument[] => {
  const attached = new Map<number, RustContractDocument>();
  for (const anchor of attachmentAnchors(declaration.node)) {
    for (const document of documentsAtAnchor(anchor, documents, source)) {
      attached.set(document.from, document);
    }
  }
  return [...attached.values()].toSorted(
    (left, right) => left.from - right.from,
  );
};

const contractsForDeclaration = (
  filePath: string,
  declaration: RustDeclaration,
  documents: RustContractDocument[],
  source: string,
): CodeContract[] =>
  attachedDocuments(declaration, documents, source).flatMap((document) => {
    if (!hasPotentialContractDirective(document.source)) {
      return [];
    }

    const parsed = parseContracts(
      document.source,
      filePath,
      document.lineOffset,
    );
    if (parsed.length !== 1) {
      throw new Error(
        `Documentation comment at ${filePath}:${document.range.start.line} must contain exactly one @cc directive.`,
      );
    }
    const contract = parsed[0];
    return contract
      ? [
          {
            id: contract.id,
            attributes: contract.attributes,
            directive: contract.directive,
            prose: contract.prose,
            source: document.range,
          },
        ]
      : [];
  });

/**
 * @cc [author:spolu,label:architecture] rust-contract-document-extraction
 * Rust contract extraction parses the target source directly and never starts a language server.
 * Consecutive line doc comments form one document and each block doc comment forms another. Outer
 * docs may attach to declarations; inner docs are check-only. Non-doc comments are ignored.
 */
export function extractRustContractDocuments(
  filePath: string,
  source: string,
): ContractDocument[] {
  if (!isRustSourceFile(filePath)) {
    throw new Error(`Unsupported source file type: ${filePath}`);
  }

  const lines = sourceLines(source);
  return commentDocuments(filePath, source, lines, parser.parse(source)).filter(
    (document) => hasPotentialContractDirective(document.source),
  );
}

const declarationContainsPosition = (
  declaration: RustDeclaration,
  target: SourceTarget,
  lines: SourceLine[],
): boolean => {
  if (target.offset !== undefined) {
    return (
      declaration.rangeNode.from <= target.offset &&
      target.offset < declaration.rangeNode.to
    );
  }
  const range = toSourceRange(
    declaration.declaration.range.filePath,
    lines,
    declaration.rangeNode.from,
    declaration.rangeNode.to,
  );
  return (
    range.start.line - 1 <= target.line && target.line <= range.end.line - 1
  );
};

const declarationPath = (
  declarations: RustDeclaration[],
  position: SourcePosition,
  lines: SourceLine[],
): RustDeclaration[] => {
  const target = validateSourcePosition(position, lines);
  const innermost = declarations
    .filter((declaration) =>
      declarationContainsPosition(declaration, target, lines),
    )
    .toSorted(
      (left, right) =>
        right.depth - left.depth ||
        left.rangeNode.to -
          left.rangeNode.from -
          (right.rangeNode.to - right.rangeNode.from) ||
        left.rangeNode.from - right.rangeNode.from,
    )[0];
  if (!innermost) {
    return [];
  }

  const path: RustDeclaration[] = [];
  for (
    let declaration: RustDeclaration | undefined = innermost;
    declaration;
    declaration = declaration.parent
  ) {
    path.unshift(declaration);
  }
  return path;
};

const parseRustFile = async (
  filePath: string,
): Promise<{
  source: string;
  lines: SourceLine[];
  documents: RustContractDocument[];
  declarations: RustDeclaration[];
}> => {
  if (!isRustSourceFile(filePath)) {
    throw new Error(`Unsupported source file type: ${filePath}`);
  }

  const source = await readFile(filePath, "utf8");
  const lines = sourceLines(source);
  const tree = parser.parse(source);
  return {
    source,
    lines,
    documents: commentDocuments(filePath, source, lines, tree),
    declarations: collectDeclarations(filePath, source, lines, tree),
  };
};

class RustLocalContractExtractor implements LocalContractExtractor {
  /**
   * @cc [author:spolu,label:product] rust-local-contract-scope
   * Rust location discovery returns outer-doc contracts on the innermost containing declaration
   * and its applicable declaration ancestors. An impl also inherits its same-scope declared type by
   * syntactic name. A line uses whole-line containment; a column narrows it to the exact position.
   */
  async declarationsAt(
    position: SourcePosition,
  ): Promise<DeclarationContracts[]> {
    const { source, lines, documents, declarations } = await parseRustFile(
      position.filePath,
    );
    return declarationPath(declarations, position, lines).flatMap(
      (declaration) => {
        const contracts = contractsForDeclaration(
          position.filePath,
          declaration,
          documents,
          source,
        );
        return contracts.length > 0
          ? [{ declaration: declaration.declaration, contracts }]
          : [];
      },
    );
  }

  /**
   * @cc [author:spolu,label:product] rust-file-contract-scope
   * File-wide Rust discovery returns outer-doc contracts attached to supported items and named
   * members in source order.
   */
  async declarationsInFile(filePath: string): Promise<DeclarationContracts[]> {
    const { source, documents, declarations } = await parseRustFile(filePath);
    return declarations.flatMap((declaration) => {
      const contracts = contractsForDeclaration(
        filePath,
        declaration,
        documents,
        source,
      );
      return contracts.length > 0
        ? [{ declaration: declaration.declaration, contracts }]
        : [];
    });
  }
}

export const startRustLocalContractExtractor =
  (): Promise<LocalContractExtractor> =>
    Promise.resolve(new RustLocalContractExtractor());
