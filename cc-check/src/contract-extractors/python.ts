import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import type { SyntaxNode, Tree } from "@lezer/common";
import { parser } from "@lezer/python";

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

const PYTHON_EXTENSIONS = new Set([".py", ".pyi"]);
const IGNORED_FIRST_CHILDREN = new Set(["Comment", ":", ";"]);

interface SourceLine {
  start: number;
  end: number;
}

interface PythonContractDocument extends ContractDocument {
  range: SourceRange;
}

interface PythonDeclaration {
  node: SyntaxNode;
  rangeNode: SyntaxNode;
  parent?: PythonDeclaration;
  depth: number;
  declaration: ContractDeclaration;
}

export const isPythonSourceFile = (filePath: string): boolean =>
  PYTHON_EXTENSIONS.has(extname(filePath).toLowerCase());

const children = (node: SyntaxNode): SyntaxNode[] => {
  const result: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    result.push(child);
  }
  return result;
};

const directChild = (node: SyntaxNode, name: string): SyntaxNode | undefined =>
  children(node).find((child) => child.name === name);

const sourceLines = (source: string): SourceLine[] => {
  const lines: SourceLine[] = [];
  let start = 0;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character !== "\n" && character !== "\r") {
      continue;
    }

    lines.push({ start, end: index });
    if (character === "\r" && source[index + 1] === "\n") {
      index += 1;
    }
    start = index + 1;
  }

  lines.push({ start, end: source.length });
  return lines;
};

const positionAt = (
  lines: SourceLine[],
  offset: number,
): { line: number; column: number } => {
  let low = 0;
  let high = lines.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const line = lines[middle];
    if (!line) {
      break;
    }
    if (line.start <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const lineIndex = Math.max(0, high);
  const line = lines[lineIndex];
  if (!line) {
    return { line: 1, column: 1 };
  }
  return { line: lineIndex + 1, column: offset - line.start + 1 };
};

const toSourceRange = (
  filePath: string,
  lines: SourceLine[],
  start: number,
  end: number,
): SourceRange => ({
  filePath,
  start: positionAt(lines, start),
  end: positionAt(lines, end),
});

const firstStatement = (container: SyntaxNode): SyntaxNode | undefined => {
  const statement = children(container).find(
    (child) => !IGNORED_FIRST_CHILDREN.has(child.name),
  );
  return statement?.name === "StatementGroup"
    ? firstStatement(statement)
    : statement;
};

const unwrapStringExpression = (node: SyntaxNode): SyntaxNode | undefined => {
  if (node.name === "String") {
    return node;
  }
  if (node.name !== "ParenthesizedExpression") {
    return undefined;
  }

  const expressions = children(node).filter(
    (child) => child.name !== "(" && child.name !== ")",
  );
  return expressions.length === 1 && expressions[0]
    ? unwrapStringExpression(expressions[0])
    : undefined;
};

const docstringLiteral = (container: SyntaxNode): SyntaxNode | undefined => {
  const statement = firstStatement(container);
  if (statement?.name !== "ExpressionStatement") {
    return undefined;
  }

  const expression = children(statement)[0];
  return expression ? unwrapStringExpression(expression) : undefined;
};

const leadingWhitespaceLength = (line: string): number =>
  /^[ \t]*/.exec(line)?.[0].length ?? 0;

const normalizeDocstring = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  node: SyntaxNode,
): PythonContractDocument | undefined => {
  const literal = source.slice(node.from, node.to);
  const opening = /^([rRuU]?)("""|''')/.exec(literal);
  const delimiter = opening?.[2];
  if (!opening || !delimiter || !literal.endsWith(delimiter)) {
    return undefined;
  }

  const bodyStart = opening[0].length;
  const body = literal
    .slice(bodyStart, literal.length - delimiter.length)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
  const rawLines = body.split("\n");
  const indents = rawLines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map(leadingWhitespaceLength);
  const commonIndent = indents.length > 0 ? Math.min(...indents) : 0;
  const start = positionAt(lines, node.from);
  const sourceColumns: number[] = [];
  const normalized = rawLines
    .map((line, index) => {
      const indentation = leadingWhitespaceLength(line);
      const removed =
        index === 0 ? indentation : Math.min(indentation, commonIndent);
      sourceColumns.push(
        index === 0 ? start.column + bodyStart + removed : removed + 1,
      );
      return line.slice(removed);
    })
    .join("\n");

  return {
    source: normalized,
    lineOffset: start.line - 1,
    sourceColumns,
    range: toSourceRange(filePath, lines, node.from, node.to),
  };
};

const declarationNode = (node: SyntaxNode): boolean =>
  node.name === "ClassDefinition" || node.name === "FunctionDefinition";

const declarationName = (
  node: SyntaxNode,
  source: string,
): string | undefined => {
  const name = directChild(node, "VariableName");
  return name ? source.slice(name.from, name.to) : undefined;
};

const declarationKind = (
  node: SyntaxNode,
  parent: PythonDeclaration | undefined,
): string => {
  if (node.name === "ClassDefinition") {
    return "class";
  }
  return parent?.declaration.kind === "class" ? "method" : "function";
};

const collectDeclarations = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  tree: Tree,
): PythonDeclaration[] => {
  const declarations: PythonDeclaration[] = [];

  const visit = (
    node: SyntaxNode,
    parent: PythonDeclaration | undefined,
  ): void => {
    let nextParent = parent;
    if (declarationNode(node)) {
      const rangeNode =
        node.parent?.name === "DecoratedStatement" ? node.parent : node;
      const declaration: PythonDeclaration = {
        node,
        rangeNode,
        parent,
        depth: parent ? parent.depth + 1 : 0,
        declaration: {
          name: declarationName(node, source),
          kind: declarationKind(node, parent),
          range: toSourceRange(filePath, lines, rangeNode.from, rangeNode.to),
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

const contractDocuments = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  tree: Tree,
): PythonContractDocument[] => {
  const literals: SyntaxNode[] = [];
  const moduleDocstring = docstringLiteral(tree.topNode);
  if (moduleDocstring) {
    literals.push(moduleDocstring);
  }

  const visit = (node: SyntaxNode): void => {
    if (declarationNode(node)) {
      const body = directChild(node, "Body");
      const literal = body ? docstringLiteral(body) : undefined;
      if (literal) {
        literals.push(literal);
      }
    }
    for (const child of children(node)) {
      visit(child);
    }
  };
  visit(tree.topNode);

  return literals.flatMap((literal) => {
    const document = normalizeDocstring(filePath, source, lines, literal);
    return document && hasPotentialContractDirective(document.source)
      ? [document]
      : [];
  });
};

/**
 * @cc [author:spolu,label:architecture] python-contract-document-extraction
 * Python contract extraction parses the target source directly and never starts a language server.
 * A first-statement triple-quoted module, class, or function docstring is dedented before the shared
 * grammar parser receives it. Module docstrings are check-only; other strings and docstrings without
 * `@cc` are ignored.
 */
export function extractPythonContractDocuments(
  filePath: string,
  source: string,
): ContractDocument[] {
  if (!isPythonSourceFile(filePath)) {
    throw new Error(`Unsupported source file type: ${filePath}`);
  }

  const lines = sourceLines(source);
  return contractDocuments(filePath, source, lines, parser.parse(source));
}

const contractsForDeclaration = (
  filePath: string,
  source: string,
  lines: SourceLine[],
  declaration: PythonDeclaration,
): CodeContract[] => {
  const body = directChild(declaration.node, "Body");
  const literal = body ? docstringLiteral(body) : undefined;
  const document = literal
    ? normalizeDocstring(filePath, source, lines, literal)
    : undefined;
  if (!document || !hasPotentialContractDirective(document.source)) {
    return [];
  }

  const parsed = parseContracts(document.source, filePath, document.lineOffset);
  if (parsed.length !== 1) {
    throw new Error(
      `Docstring at ${filePath}:${document.range.start.line} must contain exactly one @cc directive.`,
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
};

const validatePosition = (
  position: SourcePosition,
  lines: SourceLine[],
): { line: number; offset?: number } => {
  const line = lines[position.line - 1];
  if (!line) {
    throw new Error(
      `Line ${position.line} is outside ${position.filePath}, which has ${lines.length} lines.`,
    );
  }
  if (position.column === undefined) {
    return { line: position.line - 1 };
  }
  if (position.column > line.end - line.start + 1) {
    throw new Error(
      `Column ${position.column} is outside ${position.filePath}:${position.line}.`,
    );
  }
  return {
    line: position.line - 1,
    offset: line.start + position.column - 1,
  };
};

const containsPosition = (
  declaration: PythonDeclaration,
  target: { line: number; offset?: number },
): boolean => {
  if (target.offset !== undefined) {
    return (
      declaration.rangeNode.from <= target.offset &&
      target.offset < declaration.rangeNode.to
    );
  }

  const { range } = declaration.declaration;
  return (
    range.start.line - 1 <= target.line && target.line <= range.end.line - 1
  );
};

const declarationPath = (
  declarations: PythonDeclaration[],
  position: SourcePosition,
  lines: SourceLine[],
): PythonDeclaration[] => {
  const target = validatePosition(position, lines);
  const innermost = declarations
    .filter((declaration) => containsPosition(declaration, target))
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

  const path: PythonDeclaration[] = [];
  for (
    let declaration: PythonDeclaration | undefined = innermost;
    declaration;
    declaration = declaration.parent
  ) {
    path.unshift(declaration);
  }
  return path;
};

const parsePythonFile = async (
  filePath: string,
): Promise<{
  source: string;
  lines: SourceLine[];
  declarations: PythonDeclaration[];
}> => {
  if (!isPythonSourceFile(filePath)) {
    throw new Error(`Unsupported source file type: ${filePath}`);
  }

  const source = await readFile(filePath, "utf8");
  const lines = sourceLines(source);
  const tree = parser.parse(source);
  return {
    source,
    lines,
    declarations: collectDeclarations(filePath, source, lines, tree),
  };
};

class PythonLocalContractExtractor implements LocalContractExtractor {
  /**
   * @cc [author:spolu,label:product] python-local-contract-scope
   * Python location discovery returns contract docstrings on the innermost containing class or
   * function and its syntactic declaration ancestors. A line uses whole-line containment; a column
   * narrows containment to that exact source position.
   */
  async declarationsAt(
    position: SourcePosition,
  ): Promise<DeclarationContracts[]> {
    const { source, lines, declarations } = await parsePythonFile(
      position.filePath,
    );
    return declarationPath(declarations, position, lines).flatMap(
      (declaration) => {
        const contracts = contractsForDeclaration(
          position.filePath,
          source,
          lines,
          declaration,
        );
        return contracts.length > 0
          ? [{ declaration: declaration.declaration, contracts }]
          : [];
      },
    );
  }

  /**
   * @cc [author:spolu,label:product] python-file-contract-scope
   * File-wide Python discovery returns contract docstrings attached to every class and function in
   * source order, including methods and nested declarations.
   */
  async declarationsInFile(filePath: string): Promise<DeclarationContracts[]> {
    const { source, lines, declarations } = await parsePythonFile(filePath);
    return declarations.flatMap((declaration) => {
      const contracts = contractsForDeclaration(
        filePath,
        source,
        lines,
        declaration,
      );
      return contracts.length > 0
        ? [{ declaration: declaration.declaration, contracts }]
        : [];
    });
  }
}

export const startPythonLocalContractExtractor =
  (): Promise<LocalContractExtractor> =>
    Promise.resolve(new PythonLocalContractExtractor());
