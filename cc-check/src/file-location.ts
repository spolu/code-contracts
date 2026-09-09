import { resolve } from "node:path";

/**
 * @cc [owner:spolu,label:architecture] source-position-coordinates
 * Source positions use absolute file paths and one-based lines and columns. A missing column
 * denotes the whole source line; consumers define how they resolve that line to a target.
 */
export interface SourcePosition {
  filePath: string;
  line: number;
  column?: number;
}

/**
 * @cc [owner:spolu,label:architecture] source-range-coordinates
 * Source ranges use absolute file paths and one-based coordinates, and their end position is
 * exclusive.
 */
export interface SourceRange {
  filePath: string;
  start: {
    line: number;
    column: number;
  };
  end: {
    line: number;
    column: number;
  };
}

const LOCATION_PATTERN = /^(.*?):([1-9]\d*)(?::([1-9]\d*))?$/;

export interface FileOrLocation {
  filePath: string;
  position?: SourcePosition;
}

/**
 * @cc [owner:spolu,label:product] location-like-format
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
 * @cc [owner:spolu,label:product] file-or-location-like-format
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
