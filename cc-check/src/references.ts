import { relative } from "node:path";

import { parseFileLineLike } from "./file-location.js";
import type {
  LanguageServerFactory,
  SourceRange,
} from "./language-server.js";
import { startLanguageServer } from "./language-servers/index.js";

export interface ReferencesCommandOptions {
  workingDirectory?: string;
  writeLine?: (line: string) => void;
  startServer?: LanguageServerFactory;
}

const formatLocation = (
  range: SourceRange,
  workingDirectory: string,
): string => {
  const filePath = relative(workingDirectory, range.filePath) || range.filePath;
  return `${filePath}:${range.start.line}:${range.start.column}`;
};

/**
 * @cc [author:spolu,label:product] references-output
 * The references command prints each statically recognized usage except the declaration itself as
 * `<path>:<line>:<column>`, using paths relative to the working directory. It prints nothing when
 * the declaration has no references.
 */
/**
 * @cc [author:spolu,label:architecture] references-session-ownership
 * A references invocation creates one language-server session and disposes it before returning,
 * including when location resolution or protocol requests fail.
 */
export async function runReferencesCommand(
  input: string,
  options: ReferencesCommandOptions = {},
): Promise<void> {
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const writeLine = options.writeLine ?? console.log;
  const startServer = options.startServer ?? startLanguageServer;
  const position = parseFileLineLike(input, workingDirectory);
  const server = await startServer(position);

  try {
    for (const reference of await server.references(position)) {
      writeLine(formatLocation(reference, workingDirectory));
    }
  } finally {
    await server.dispose();
  }
}
