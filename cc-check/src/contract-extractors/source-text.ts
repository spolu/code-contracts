import type { SourcePosition, SourceRange } from "../language-server.js";

export interface SourceLine {
  start: number;
  end: number;
}

export interface SourceTarget {
  line: number;
  offset?: number;
}

export const sourceLines = (source: string): SourceLine[] => {
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

export const positionAt = (
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

export const toSourceRange = (
  filePath: string,
  lines: SourceLine[],
  start: number,
  end: number,
): SourceRange => ({
  filePath,
  start: positionAt(lines, start),
  end: positionAt(lines, end),
});

export const validateSourcePosition = (
  position: SourcePosition,
  lines: SourceLine[],
): SourceTarget => {
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
