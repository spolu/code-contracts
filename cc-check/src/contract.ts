import type { SourceRange } from "./language-server.js";

const TOKEN_SOURCE = String.raw`[^\s,:\[\]]+`;
const ATTRIBUTE_PATTERN = new RegExp(`^(${TOKEN_SOURCE}):(${TOKEN_SOURCE})$`);
const DIRECTIVE_PATTERN = new RegExp(
  `^@cc +(?:\\[(${TOKEN_SOURCE}:${TOKEN_SOURCE}(?:,${TOKEN_SOURCE}:${TOKEN_SOURCE})*)\\] +)?(${TOKEN_SOURCE})$`,
);
const DIRECTIVE_START_PATTERN = /^@cc(?: |$)/;

export interface ContractAttribute {
  key: string;
  value: string;
}

export interface ParsedContract {
  id: string;
  attributes: ContractAttribute[];
  directive: string;
  prose: string;
  startLine: number;
  endLine: number;
  endColumn: number;
}

export interface CodeContract extends Omit<
  ParsedContract,
  "startLine" | "endLine" | "endColumn"
> {
  source: SourceRange;
}

export class ContractParseError extends Error {
  readonly description: string;
  readonly sourceName: string;
  readonly line: number;
  readonly column: number;

  constructor(
    description: string,
    sourceName: string,
    line: number,
    column = 1,
  ) {
    super(`${description} at ${sourceName}:${line}:${column}.`);
    this.name = "ContractParseError";
    this.description = description;
    this.sourceName = sourceName;
    this.line = line;
    this.column = column;
  }
}

const parseDirective = (
  directive: string,
  sourceName: string,
  line: number,
): Pick<ParsedContract, "id" | "attributes" | "directive"> => {
  const match = DIRECTIVE_PATTERN.exec(directive);
  if (!match) {
    throw new ContractParseError("Invalid @cc directive", sourceName, line);
  }

  const [, metadata, id] = match;
  if (!id) {
    throw new ContractParseError("Invalid @cc directive", sourceName, line);
  }

  const attributes = (metadata ?? "").split(",").flatMap((attribute) => {
    if (attribute.length === 0) {
      return [];
    }

    const attributeMatch = ATTRIBUTE_PATTERN.exec(attribute);
    if (!attributeMatch?.[1] || !attributeMatch[2]) {
      throw new ContractParseError("Invalid @cc metadata", sourceName, line);
    }

    return [{ key: attributeMatch[1], value: attributeMatch[2] }];
  });

  return { id, attributes, directive };
};

/**
 * @cc [author:spolu,label:architecture] shared-contract-parser
 * `CONTRACTS` files and language-specific documentation-comment extractors use the same parser for
 * the core `@cc` directive and prose grammar. The parser preserves attribute order and repeated
 * metadata keys and rejects malformed directives or empty prose instead of returning partial
 * results.
 */
export function parseContracts(
  source: string,
  sourceName: string,
  lineOffset = 0,
): ParsedContract[] {
  const lines = source
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n");
  const contracts: ParsedContract[] = [];
  let lineIndex = 0;

  while (lineIndex < lines.length && lines[lineIndex]?.trim().length === 0) {
    lineIndex += 1;
  }

  while (lineIndex < lines.length) {
    const directive = lines[lineIndex];
    if (directive === undefined || !DIRECTIVE_START_PATTERN.test(directive)) {
      throw new ContractParseError(
        "Expected an @cc directive",
        sourceName,
        lineOffset + lineIndex + 1,
      );
    }

    const parsedDirective = parseDirective(
      directive,
      sourceName,
      lineOffset + lineIndex + 1,
    );
    const proseStart = lineIndex + 1;
    let nextDirective = proseStart;
    while (
      nextDirective < lines.length &&
      !DIRECTIVE_START_PATTERN.test(lines[nextDirective] ?? "")
    ) {
      nextDirective += 1;
    }

    let proseEnd = nextDirective - 1;
    while (proseEnd >= proseStart && lines[proseEnd]?.trim().length === 0) {
      proseEnd -= 1;
    }

    if (proseEnd < proseStart) {
      throw new ContractParseError(
        `Contract "${parsedDirective.id}" has no prose body`,
        sourceName,
        lineOffset + lineIndex + 1,
      );
    }

    const proseLines = lines.slice(proseStart, proseEnd + 1);
    const prose = proseLines.join("\n");
    if (prose.trim().length === 0) {
      throw new ContractParseError(
        `Contract "${parsedDirective.id}" has no prose body`,
        sourceName,
        lineOffset + lineIndex + 1,
      );
    }

    contracts.push({
      ...parsedDirective,
      prose,
      startLine: lineOffset + lineIndex + 1,
      endLine: lineOffset + proseEnd + 1,
      endColumn: (lines[proseEnd]?.length ?? 0) + 1,
    });
    lineIndex = nextDirective;
  }

  return contracts;
}
