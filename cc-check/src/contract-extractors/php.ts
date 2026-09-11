import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import type { SyntaxNode, Tree } from "@lezer/common";
import { parser } from "@lezer/php";

import { parseContracts, type CodeContract } from "../contract.js";
import type { SourcePosition, SourceRange } from "../file-location.js";
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
  "ClassDeclaration",
  "ConstDeclaration",
  "EnumCase",
  "EnumDeclaration",
  "FunctionDefinition",
  "InterfaceDeclaration",
  "MethodDeclaration",
  "PropertyDeclaration",
  "PropertyParameter",
  "TraitDeclaration",
]);

interface PhpContractDocument extends ContractDocument {
  from: number;
  to: number;
  range: SourceRange;
}

interface PhpDeclaration {
  node: SyntaxNode;
  parent?: PhpDeclaration;
  depth: number;
  declaration: ContractDeclaration;
}

export const isPhpSourceFile = (filePath: string): boolean =>
  extname(filePath).toLowerCase() === ".php";

const BACKED_ENUM_DOUBLE_QUOTED_CASE =
  /(\bcase[ \t]+[A-Za-z_\x80-\uFFFF][A-Za-z0-9_\x80-\uFFFF]*[ \t]*=[ \t]*)("(?:\\[\s\S]|[^"\\])*")/g;

const parserSource = (source: string): string =>
  source.replace(
    BACKED_ENUM_DOUBLE_QUOTED_CASE,
    (_match, prefix: string, value: string) =>
      `${prefix}'${value
        .slice(1, -1)
        .split("")
        .map((character) =>
          character === "\r" || character === "\n" ? character : "x",
        )
        .join("")}'`,
  );

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

const leadingWhitespaceLength = (line: string): number =>
  /^[ \t]*/.exec(line)?.[0].length ?? 0;

const normalizeDocumentationComment = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  comment: SyntaxNode,
): PhpContractDocument => {
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
  };
};

const documentationComments = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  tree: Tree,
): PhpContractDocument[] =>
  descendants(tree.topNode, "BlockComment")
    .filter((comment) => source.startsWith("/**", comment.from))
    .map((comment) =>
      normalizeDocumentationComment(filePath, source, lines, comment),
    );

const nodeText = (
  node: SyntaxNode | undefined,
  source: string,
): string | undefined => {
  if (!node) {
    return undefined;
  }
  const text = source.slice(node.from, node.to);
  return text.length > 0 ? text : undefined;
};

const callableName = (node: SyntaxNode, source: string): string | undefined => {
  const parsedName = nodeText(directChild(node, "Name"), source);
  if (parsedName) {
    return parsedName;
  }

  const functionKeyword = directChild(node, "function");
  const parameters = directChild(node, "ParamList");
  if (!functionKeyword || !parameters) {
    return undefined;
  }
  const candidate = source
    .slice(functionKeyword.to, parameters.from)
    .trim()
    .replace(/^&\s*/, "");
  return candidate.length > 0 ? candidate : undefined;
};

const declaratorName = (
  declarator: SyntaxNode,
  source: string,
): string | undefined => {
  const name =
    nodeText(directChild(declarator, "VariableName"), source) ??
    nodeText(directChild(declarator, "Name"), source);
  if (name) {
    return name;
  }
  const text = source.slice(declarator.from, declarator.to);
  const candidate = text.split("=", 1)[0]?.trim();
  return candidate && candidate.length > 0 ? candidate : undefined;
};

const declaratorNames = (
  node: SyntaxNode,
  source: string,
): string | undefined => {
  const names = children(node)
    .filter((child) => child.name === "VariableDeclarator")
    .flatMap((declarator) => {
      const name = declaratorName(declarator, source);
      return name ? [name] : [];
    });
  return names.length > 0 ? names.join(", ") : undefined;
};

const declarationName = (
  node: SyntaxNode,
  source: string,
): string | undefined => {
  switch (node.name) {
    case "ClassDeclaration":
    case "EnumCase":
    case "EnumDeclaration":
    case "InterfaceDeclaration":
    case "TraitDeclaration":
      return nodeText(directChild(node, "Name"), source);
    case "FunctionDefinition":
    case "MethodDeclaration":
      return callableName(node, source);
    case "PropertyParameter":
      return nodeText(directChild(node, "VariableName"), source);
    case "ConstDeclaration":
    case "PropertyDeclaration":
      return declaratorNames(node, source);
    default:
      return undefined;
  }
};

const declarationKind = (
  node: SyntaxNode,
  parent: PhpDeclaration | undefined,
  source: string,
): string => {
  switch (node.name) {
    case "ClassDeclaration":
      return "class";
    case "InterfaceDeclaration":
      return "interface";
    case "TraitDeclaration":
      return "trait";
    case "EnumDeclaration":
      return "enum";
    case "FunctionDefinition":
      return "function";
    case "MethodDeclaration": {
      const name = declarationName(node, source);
      if (name?.toLowerCase() === "__construct") {
        return "constructor";
      }
      return directChild(node, "Block") ||
        parent?.node.name === "TraitDeclaration"
        ? "method"
        : "method-signature";
    }
    case "PropertyDeclaration":
    case "PropertyParameter":
      return "property";
    case "ConstDeclaration":
      return "constant";
    case "EnumCase":
      return "enum-case";
    default:
      return "declaration";
  }
};

const collectDeclarations = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  tree: Tree,
): PhpDeclaration[] => {
  const declarations: PhpDeclaration[] = [];

  const visit = (
    node: SyntaxNode,
    parent: PhpDeclaration | undefined,
  ): void => {
    let nextParent = parent;
    if (DECLARATION_NODES.has(node.name)) {
      const declaration: PhpDeclaration = {
        node,
        parent,
        depth: parent ? parent.depth + 1 : 0,
        declaration: {
          name: declarationName(node, source),
          kind: declarationKind(node, parent, source),
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

  return declarations;
};

const attachmentAnchors = (node: SyntaxNode): number[] => {
  const anchors = new Set([node.from]);
  for (const child of children(node)) {
    if (child.name === "Attributes") {
      anchors.add(child.from);
      continue;
    }
    if (child.name === "BlockComment") {
      continue;
    }
    anchors.add(child.from);
    break;
  }
  return [...anchors];
};

const documentsAtAnchor = (
  anchor: number,
  documents: PhpContractDocument[],
  source: string,
): PhpContractDocument[] => {
  const attached: PhpContractDocument[] = [];
  let boundary = anchor;

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

const attachedDocuments = (
  declaration: PhpDeclaration,
  documents: PhpContractDocument[],
  source: string,
): PhpContractDocument[] => {
  const attached = new Map<number, PhpContractDocument>();
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
  declaration: PhpDeclaration,
  documents: PhpContractDocument[],
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
 * @cc [owner:mattsbl,label:architecture] php-contract-document-extraction
 * PHP contract extraction MUST parse `.php` source directly without a language server, pass only
 * PHPDoc block comments through the shared contract parser, and ignore non-documentation comments.
 */
export function extractPhpContractDocuments(
  filePath: string,
  source: string,
): ContractDocument[] {
  if (!isPhpSourceFile(filePath)) {
    throw new Error(`Unsupported source file type: ${filePath}`);
  }

  const lines = sourceLines(source);
  return documentationComments(
    filePath,
    source,
    lines,
    parser.parse(parserSource(source)),
  ).filter((document) => hasPotentialContractDirective(document.source));
}

const containsPosition = (
  declaration: PhpDeclaration,
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
  declarations: PhpDeclaration[],
  position: SourcePosition,
  lines: SourceLine[],
): PhpDeclaration[] => {
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

  const path: PhpDeclaration[] = [];
  for (
    let declaration: PhpDeclaration | undefined = innermost;
    declaration;
    declaration = declaration.parent
  ) {
    path.unshift(declaration);
  }
  return path;
};

const parsePhpFile = async (
  filePath: string,
): Promise<{
  source: string;
  lines: SourceLine[];
  documents: PhpContractDocument[];
  declarations: PhpDeclaration[];
}> => {
  if (!isPhpSourceFile(filePath)) {
    throw new Error(`Unsupported source file type: ${filePath}`);
  }

  const source = await readFile(filePath, "utf8");
  const lines = sourceLines(source);
  const tree = parser.parse(parserSource(source));
  return {
    source,
    lines,
    documents: documentationComments(filePath, source, lines, tree),
    declarations: collectDeclarations(filePath, source, lines, tree),
  };
};

class PhpLocalContractExtractor implements LocalContractExtractor {
  /**
   * @cc [owner:mattsbl,label:product] php-local-contract-scope
   * PHP location discovery MUST return PHPDoc contracts on the innermost containing declaration and
   * its syntactic declaration ancestors, from broadest to most specific. A line uses whole-line
   * containment; a column narrows containment to that exact source position.
   */
  async declarationsAt(
    position: SourcePosition,
  ): Promise<DeclarationContracts[]> {
    const { source, lines, documents, declarations } = await parsePhpFile(
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
   * @cc [owner:mattsbl,label:product] php-file-contract-scope
   * File-wide PHP discovery MUST return PHPDoc contracts attached to named classes, interfaces,
   * traits, enums, functions, methods, declared or promoted properties, constants, and enum cases in
   * source order.
   */
  async declarationsInFile(filePath: string): Promise<DeclarationContracts[]> {
    const { source, documents, declarations } = await parsePhpFile(filePath);
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

export const startPhpLocalContractExtractor =
  (): Promise<LocalContractExtractor> =>
    Promise.resolve(new PhpLocalContractExtractor());
