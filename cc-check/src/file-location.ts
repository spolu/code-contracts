import { resolve } from "node:path";

import type { SourcePosition } from "./language-server.js";

const LOCATION_PATTERN = /^(.*?):([1-9]\d*)(?::([1-9]\d*))?$/;

export interface FileOrLocation {
  filePath: string;
  position?: SourcePosition;
}

/**
 * @cc [author:spolu,label:product] location-like-format
 * A location-like value is `<path>:<line>` with an optional one-based `:<column>`. Relative paths
 * are resolved from the command's working directory.
 */
export function parseLocationLike(
  input: string,
  workingDirectory: string,
): SourcePosition {
  const match = LOCATION_PATTERN.exec(input);
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
    ...(column === undefined ? {} : { column: Number.parseInt(column, 10) }),
  };
}

/**
 * @cc [author:spolu,label:product] file-or-location-like-format
 * A file-or-location-like value is either a path or a location-like value. A trailing one-based
 * line, with an optional column, selects location mode; otherwise the path selects the entire file.
 */
export function parseFileOrLocationLike(
  input: string,
  workingDirectory: string,
): FileOrLocation {
  if (!LOCATION_PATTERN.test(input)) {
    return { filePath: resolve(workingDirectory, input) };
  }

  const position = parseLocationLike(input, workingDirectory);
  return { filePath: position.filePath, position };
}
