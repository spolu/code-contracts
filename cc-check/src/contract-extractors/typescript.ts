import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import ts from "typescript";

import { parseContracts, type CodeContract } from "../contract.js";
import type { SourcePosition, SourceRange } from "../language-server.js";
import type {
  ContractDeclaration,
  DeclarationContracts,
  LocalContractExtractor,
} from "../local-contracts.js";

const SCRIPT_KINDS = new Map<string, ts.ScriptKind>([
  [".ts", ts.ScriptKind.TS],
  [".tsx", ts.ScriptKind.TSX],
  [".mts", ts.ScriptKind.TS],
  [".cts", ts.ScriptKind.TS],
]);

interface DeclarationCandidate {
  node: ts.Node;
  depth: number;
}

const isContractDeclaration = (node: ts.Node): boolean =>
  ts.isVariableStatement(node) ||
  ts.isFunctionDeclaration(node) ||
  ts.isClassDeclaration(node) ||
  ts.isInterfaceDeclaration(node) ||
  ts.isTypeAliasDeclaration(node) ||
  ts.isEnumDeclaration(node) ||
  ts.isModuleDeclaration(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node) ||
  ts.isPropertyDeclaration(node) ||
  ts.isMethodSignature(node) ||
  ts.isPropertySignature(node) ||
  ts.isCallSignatureDeclaration(node) ||
  ts.isConstructSignatureDeclaration(node) ||
  ts.isIndexSignatureDeclaration(node) ||
  ts.isEnumMember(node);

const declarationName = (
  node: ts.Node,
  sourceFile: ts.SourceFile,
): string | undefined => {
  if (ts.isConstructorDeclaration(node)) {
    return "constructor";
  }
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations
      .map((declaration) => declaration.name.getText(sourceFile))
      .join(", ");
  }

  const name = (node as ts.NamedDeclaration).name;
  return name?.getText(sourceFile);
};

const declarationKind = (node: ts.Node): string => {
  if (ts.isVariableStatement(node)) return "variable";
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isModuleDeclaration(node)) return "module";
  if (ts.isMethodDeclaration(node)) return "method";
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (ts.isGetAccessorDeclaration(node)) return "getter";
  if (ts.isSetAccessorDeclaration(node)) return "setter";
  if (ts.isPropertyDeclaration(node)) return "property";
  if (ts.isMethodSignature(node)) return "method-signature";
  if (ts.isPropertySignature(node)) return "property-signature";
  if (ts.isCallSignatureDeclaration(node)) return "call-signature";
  if (ts.isConstructSignatureDeclaration(node)) return "construct-signature";
  if (ts.isIndexSignatureDeclaration(node)) return "index-signature";
  if (ts.isEnumMember(node)) return "enum-member";
  return "declaration";
};

const toSourceRange = (
  sourceFile: ts.SourceFile,
  start: number,
  end: number,
): SourceRange => {
  const startPosition = sourceFile.getLineAndCharacterOfPosition(start);
  const endPosition = sourceFile.getLineAndCharacterOfPosition(end);
  return {
    filePath: sourceFile.fileName,
    start: {
      line: startPosition.line + 1,
      column: startPosition.character + 1,
    },
    end: {
      line: endPosition.line + 1,
      column: endPosition.character + 1,
    },
  };
};

const normalizeDocumentationComment = (comment: string): string => {
  const body = comment.slice(3, -2);
  return body
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line, index) => {
      if (index === 0) {
        return line.startsWith(" ") ? line.slice(1) : line;
      }
      return line.replace(/^[ \t]*\* ?/, "");
    })
    .join("\n");
};

const contractComments = (
  node: ts.Node,
  sourceFile: ts.SourceFile,
  source: string,
): CodeContract[] => {
  const contracts: CodeContract[] = [];
  const leadingComments =
    ts.getLeadingCommentRanges(source, node.getFullStart()) ?? [];
  const comments: ts.CommentRange[] = [];

  for (const comment of leadingComments.toReversed()) {
    const rawComment = source.slice(comment.pos, comment.end);
    if (
      comment.kind !== ts.SyntaxKind.MultiLineCommentTrivia ||
      !rawComment.startsWith("/**")
    ) {
      break;
    }
    comments.unshift(comment);
  }

  for (const comment of comments) {
    const rawComment = source.slice(comment.pos, comment.end);
    const normalized = normalizeDocumentationComment(rawComment);
    if (!normalized.split("\n").some((line) => /^@cc(?: |$)/.test(line))) {
      continue;
    }

    const commentStart = sourceFile.getLineAndCharacterOfPosition(comment.pos);
    const parsed = parseContracts(
      normalized,
      sourceFile.fileName,
      commentStart.line,
    );
    if (parsed.length !== 1) {
      throw new Error(
        `Documentation comment at ${sourceFile.fileName}:${commentStart.line + 1} must contain exactly one @cc directive.`,
      );
    }

    const contract = parsed[0];
    if (!contract) {
      continue;
    }
    contracts.push({
      id: contract.id,
      attributes: contract.attributes,
      directive: contract.directive,
      prose: contract.prose,
      source: toSourceRange(sourceFile, comment.pos, comment.end),
    });
  }

  return contracts;
};

const validatePosition = (
  position: SourcePosition,
  source: string,
  sourceFile: ts.SourceFile,
): { line: number; offset?: number } => {
  const lines = source.split(/\r\n|\r|\n/);
  const line = lines[position.line - 1];
  if (line === undefined) {
    throw new Error(
      `Line ${position.line} is outside ${position.filePath}, which has ${lines.length} lines.`,
    );
  }
  if (position.column === undefined) {
    return { line: position.line - 1 };
  }
  if (position.column > line.length + 1) {
    throw new Error(
      `Column ${position.column} is outside ${position.filePath}:${position.line}.`,
    );
  }

  const offset = sourceFile.getPositionOfLineAndCharacter(
    position.line - 1,
    position.column - 1,
  );
  return { line: position.line - 1, offset };
};

const containsPosition = (
  node: ts.Node,
  sourceFile: ts.SourceFile,
  target: { line: number; offset?: number },
): boolean => {
  if (target.offset !== undefined) {
    return (
      node.getFullStart() <= target.offset && target.offset < node.getEnd()
    );
  }

  const start = sourceFile.getLineAndCharacterOfPosition(node.getFullStart());
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return start.line <= target.line && target.line <= end.line;
};

const declarationPath = (
  sourceFile: ts.SourceFile,
  source: string,
  position: SourcePosition,
): DeclarationCandidate[] => {
  const target = validatePosition(position, source, sourceFile);
  const candidates: DeclarationCandidate[] = [];

  const visit = (node: ts.Node, depth: number): void => {
    if (
      isContractDeclaration(node) &&
      containsPosition(node, sourceFile, target)
    ) {
      candidates.push({ node, depth });
    }
    ts.forEachChild(node, (child) => visit(child, depth + 1));
  };
  visit(sourceFile, 0);

  const innermost = candidates.toSorted(
    (left, right) =>
      right.depth - left.depth ||
      left.node.getWidth(sourceFile) - right.node.getWidth(sourceFile) ||
      left.node.getStart(sourceFile) - right.node.getStart(sourceFile),
  )[0];
  if (!innermost) {
    return [];
  }

  const ancestors = new Set<ts.Node>();
  let ancestor: ts.Node | undefined = innermost.node;
  while (ancestor) {
    ancestors.add(ancestor);
    ancestor = ancestor.parent;
  }

  return candidates
    .filter((candidate) => ancestors.has(candidate.node))
    .toSorted((left, right) => left.depth - right.depth);
};

const toDeclaration = (
  node: ts.Node,
  sourceFile: ts.SourceFile,
): ContractDeclaration => ({
  name: declarationName(node, sourceFile),
  kind: declarationKind(node),
  range: toSourceRange(sourceFile, node.getStart(sourceFile), node.getEnd()),
});

/**
 * @cc [author:spolu,label:architecture] typescript-syntax-only-extraction
 * TypeScript local contract extraction parses the target source file directly and does not start
 * or query a language server. `@cc` comments attach to the next supported TypeScript declaration.
 * Multiple consecutive documentation comments attach to the same declaration; an intervening
 * non-documentation comment breaks the sequence.
 */
class TypeScriptLocalContractExtractor implements LocalContractExtractor {
  /**
   * @cc [author:spolu,label:product] typescript-local-contract-scope
   * TypeScript local contract discovery uses source containment only and never performs definition
   * resolution. It returns `@cc` documentation comments attached to the innermost declaration
   * containing the location and each syntactic declaration ancestor, including a containing class
   * for a method location. A line-only location uses the whole line for containment; a column
   * narrows containment to that exact source position.
   */
  async declarationsAt(
    position: SourcePosition,
  ): Promise<DeclarationContracts[]> {
    const scriptKind = SCRIPT_KINDS.get(
      extname(position.filePath).toLowerCase(),
    );
    if (scriptKind === undefined) {
      throw new Error(`Unsupported source file type: ${position.filePath}`);
    }

    const source = await readFile(position.filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      position.filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    return declarationPath(sourceFile, source, position).flatMap(({ node }) => {
      const contracts = contractComments(node, sourceFile, source);
      return contracts.length === 0
        ? []
        : [{ declaration: toDeclaration(node, sourceFile), contracts }];
    });
  }
}

export const startTypeScriptLocalContractExtractor =
  (): Promise<LocalContractExtractor> =>
    Promise.resolve(new TypeScriptLocalContractExtractor());
