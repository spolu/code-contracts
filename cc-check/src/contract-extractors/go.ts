import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import type { SyntaxNode, Tree } from "@lezer/common";
import { parser } from "@lezer/go";

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
  "ConstDecl",
  "ConstSpec",
  "FieldDecl",
  "FunctionDecl",
  "MethodDecl",
  "MethodElem",
  "TypeDecl",
  "TypeSpec",
  "VarDecl",
  "VarSpec",
]);

interface GoContractDocument extends ContractDocument {
  from: number;
  to: number;
  range: SourceRange;
}

interface GoDeclaration {
  node: SyntaxNode;
  parent?: GoDeclaration;
  depth: number;
  declaration: ContractDeclaration;
}

export const isGoSourceFile = (filePath: string): boolean =>
  extname(filePath).toLowerCase() === ".go";

const children = (node: SyntaxNode): SyntaxNode[] => {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    result.push(child);
  }
  return result;
};

const directChild = (node: SyntaxNode, name: string): SyntaxNode | undefined =>
  children(node).find((child) => child.name === name);

const directChildren = (node: SyntaxNode, name: string): SyntaxNode[] =>
  children(node).filter((child) => child.name === name);

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

const leadingWhitespaceLength = (line: string): number =>
  /^[ \t]*/.exec(line)?.[0].length ?? 0;

const normalizeLineComments = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  comments: SyntaxNode[],
): GoContractDocument => {
  const first = comments[0];
  const last = comments.at(-1);
  if (!first || !last) {
    throw new Error("Cannot normalize an empty Go line-comment group.");
  }

  const sourceColumns: number[] = [];
  const normalized = comments
    .map((comment) => {
      const text = source.slice(comment.from + 2, comment.to);
      const decorationLength = text.startsWith(" ") ? 1 : 0;
      const start = positionAt(lines, comment.from);
      sourceColumns.push(start.column + 2 + decorationLength);
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
  };
};

const normalizeBlockComment = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  comment: SyntaxNode,
): GoContractDocument => {
  const rawComment = source.slice(comment.from, comment.to);
  const openingLength = rawComment.startsWith("/**") ? 3 : 2;
  const body = rawComment
    .slice(openingLength, -2)
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
        index === 0 ? start.column + openingLength + removed : removed + 1,
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
  };
};

const continuesLineCommentGroup = (gap: string): boolean =>
  /^(?:\r\n|\r|\n)[ \t]*$/.test(gap);

const commentDocuments = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  tree: Tree,
): GoContractDocument[] => {
  const comments = [
    ...descendants(tree.topNode, "LineComment"),
    ...descendants(tree.topNode, "BlockComment"),
  ].toSorted((left, right) => left.from - right.from);
  const documents: GoContractDocument[] = [];

  for (let index = 0; index < comments.length; index += 1) {
    const comment = comments[index];
    if (!comment) {
      continue;
    }
    if (comment.name === "BlockComment") {
      documents.push(normalizeBlockComment(filePath, source, lines, comment));
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
        !continuesLineCommentGroup(source.slice(previous.to, next.from))
      ) {
        break;
      }
      group.push(next);
      index += 1;
    }
    documents.push(normalizeLineComments(filePath, source, lines, group));
  }

  return documents;
};

const declarationSpecifications = (
  node: SyntaxNode,
  name: string,
): SyntaxNode[] =>
  children(node).flatMap((child) => {
    if (child.name === name) {
      return [child];
    }
    return child.name === "SpecList" ? directChildren(child, name) : [];
  });

const namesFromNodes = (
  nodes: SyntaxNode[],
  source: string,
): string | undefined => {
  const names = nodes.map((node) => source.slice(node.from, node.to));
  return names.length > 0 ? names.join(", ") : undefined;
};

const declarationName = (
  node: SyntaxNode,
  source: string,
): string | undefined => {
  switch (node.name) {
    case "FunctionDecl":
    case "TypeSpec":
      return namesFromNodes(directChildren(node, "DefName"), source);
    case "MethodDecl":
    case "MethodElem":
    case "FieldDecl":
      return namesFromNodes(directChildren(node, "FieldName"), source);
    case "ConstSpec":
    case "VarSpec":
      return namesFromNodes(directChildren(node, "DefName"), source);
    case "TypeDecl":
      return namesFromNodes(
        declarationSpecifications(node, "TypeSpec").flatMap((specification) =>
          directChildren(specification, "DefName"),
        ),
        source,
      );
    case "ConstDecl":
      return namesFromNodes(
        declarationSpecifications(node, "ConstSpec").flatMap((specification) =>
          directChildren(specification, "DefName"),
        ),
        source,
      );
    case "VarDecl":
      return namesFromNodes(
        declarationSpecifications(node, "VarSpec").flatMap((specification) =>
          directChildren(specification, "DefName"),
        ),
        source,
      );
    default:
      return undefined;
  }
};

const declarationKind = (node: SyntaxNode): string => {
  switch (node.name) {
    case "FunctionDecl":
      return "function";
    case "MethodDecl":
      return "method";
    case "MethodElem":
      return "method-signature";
    case "FieldDecl":
      return "field";
    case "TypeDecl":
    case "TypeSpec":
      return "type";
    case "ConstDecl":
    case "ConstSpec":
      return "constant";
    case "VarDecl":
    case "VarSpec":
      return "variable";
    default:
      return "declaration";
  }
};

const methodReceiverName = (
  node: SyntaxNode,
  source: string,
): string | undefined => {
  const receiver = directChild(node, "Parameters");
  const name = receiver ? descendants(receiver, "TypeName")[0] : undefined;
  return name ? source.slice(name.from, name.to) : undefined;
};

const collectDeclarations = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  tree: Tree,
): GoDeclaration[] => {
  const declarations: GoDeclaration[] = [];

  const visit = (node: SyntaxNode, parent: GoDeclaration | undefined): void => {
    let nextParent = parent;
    if (DECLARATION_NODES.has(node.name)) {
      const declaration: GoDeclaration = {
        node,
        parent,
        depth: parent ? parent.depth + 1 : 0,
        declaration: {
          name: declarationName(node, source),
          kind: declarationKind(node),
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

  const types = new Map(
    declarations
      .filter((declaration) => declaration.node.name === "TypeSpec")
      .flatMap((declaration) =>
        declaration.declaration.name
          ? [[declaration.declaration.name, declaration] as const]
          : [],
      ),
  );
  for (const declaration of declarations) {
    if (declaration.node.name !== "MethodDecl" || declaration.parent) {
      continue;
    }
    const receiver = methodReceiverName(declaration.node, source);
    const receiverType = receiver ? types.get(receiver) : undefined;
    if (receiverType) {
      declaration.parent = receiverType;
      declaration.depth = receiverType.depth + 1;
    }
  }

  return declarations;
};

const attachedDocuments = (
  declaration: GoDeclaration,
  documents: GoContractDocument[],
  source: string,
): GoContractDocument[] => {
  const attached: GoContractDocument[] = [];
  let boundary = declaration.node.from;

  for (let index = documents.length - 1; index >= 0; index -= 1) {
    const document = documents[index];
    if (!document || document.to > boundary) {
      continue;
    }
    const gap = source
      .slice(document.to, boundary)
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n");
    if (/\S/.test(gap) || /\n[ \t]*\n/.test(gap)) {
      break;
    }
    attached.unshift(document);
    boundary = document.from;
  }

  return attached;
};

const contractsForDeclaration = (
  filePath: string,
  declaration: GoDeclaration,
  documents: GoContractDocument[],
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
 * @cc [author:spolu,label:architecture] go-contract-document-extraction
 * Go contract extraction parses the target source directly and never starts a language server.
 * Consecutive line comments form one contract document; each block comment forms another. Their
 * delimiters and conventional decoration are removed before the shared grammar parser receives
 * them, and comment documents without `@cc` are ignored.
 */
export function extractGoContractDocuments(
  filePath: string,
  source: string,
): ContractDocument[] {
  if (!isGoSourceFile(filePath)) {
    throw new Error(`Unsupported source file type: ${filePath}`);
  }

  const lines = sourceLines(source);
  return commentDocuments(filePath, source, lines, parser.parse(source)).filter(
    (document) => hasPotentialContractDirective(document.source),
  );
}

const containsPosition = (
  declaration: GoDeclaration,
  target: SourceTarget,
): boolean => {
  if (target.offset !== undefined) {
    return (
      declaration.node.from <= target.offset &&
      target.offset < declaration.node.to
    );
  }
  const { range } = declaration.declaration;
  return (
    range.start.line - 1 <= target.line && target.line <= range.end.line - 1
  );
};

const declarationPath = (
  declarations: GoDeclaration[],
  position: SourcePosition,
  lines: SourceLine[],
): GoDeclaration[] => {
  const target = validateSourcePosition(position, lines);
  const innermost = declarations
    .filter((declaration) => containsPosition(declaration, target))
    .toSorted(
      (left, right) =>
        right.depth - left.depth ||
        left.node.to - left.node.from - (right.node.to - right.node.from) ||
        left.node.from - right.node.from,
    )[0];
  if (!innermost) {
    return [];
  }

  const path: GoDeclaration[] = [];
  for (
    let declaration: GoDeclaration | undefined = innermost;
    declaration;
    declaration = declaration.parent
  ) {
    path.unshift(declaration);
  }
  return path;
};

const parseGoFile = async (
  filePath: string,
): Promise<{
  source: string;
  lines: SourceLine[];
  documents: GoContractDocument[];
  declarations: GoDeclaration[];
}> => {
  if (!isGoSourceFile(filePath)) {
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

class GoLocalContractExtractor implements LocalContractExtractor {
  /**
   * @cc [author:spolu,label:product] go-local-contract-scope
   * Go location discovery returns contracts attached to the innermost containing declaration and
   * its syntactic ancestors. For a method, it also includes its receiver type when that type is
   * declared in the same file. A line uses whole-line containment; a column narrows containment to
   * that exact source position.
   */
  async declarationsAt(
    position: SourcePosition,
  ): Promise<DeclarationContracts[]> {
    const { source, lines, documents, declarations } = await parseGoFile(
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
   * @cc [author:spolu,label:product] go-file-contract-scope
   * File-wide Go discovery returns contracts attached to functions, methods, types, variables,
   * constants, fields, and interface methods in source order, including grouped declarations.
   */
  async declarationsInFile(filePath: string): Promise<DeclarationContracts[]> {
    const { source, documents, declarations } = await parseGoFile(filePath);
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

export const startGoLocalContractExtractor =
  (): Promise<LocalContractExtractor> =>
    Promise.resolve(new GoLocalContractExtractor());
