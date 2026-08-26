import { resolve } from "node:path";

import type { SourcePosition } from "./language-server.js";

const FILE_LINE_PATTERN = /^(.*?):([1-9]\d*)(?::([1-9]\d*))?$/;

/**
 * @cc [author:spolu,label:product] file-line-like-format
 * A file-line-like value is `<path>:<line>` with an optional one-based `:<column>`. Relative paths
 * are resolved from the command's working directory.
 */
export function parseFileLineLike(
  input: string,
  workingDirectory: string,
): SourcePosition {
  const match = FILE_LINE_PATTERN.exec(input);
  if (!match) {
    throw new Error(
      `Invalid source location "${input}". Expected <path>:<line>[:<column>].`,
    );
  }

  const [, filePath, line, column] = match;
  if (!filePath || !line) {
    throw new Error(
      `Invalid source location "${input}". Expected <path>:<line>[:<column>].`,
    );
  }

  return {
    filePath: resolve(workingDirectory, filePath),
    line: Number.parseInt(line, 10),
    ...(column === undefined
      ? {}
      : { column: Number.parseInt(column, 10) }),
  };
}
