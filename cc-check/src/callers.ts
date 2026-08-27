import { relative } from "node:path";

import { parseLocationLike } from "./file-location.js";
import type {
  Caller,
  LanguageServerFactory,
  SourceRange,
} from "./language-server.js";
import { startLanguageServer } from "./language-servers/index.js";

export interface CallersCommandOptions {
  workingDirectory?: string;
  writeLine?: (line: string) => void;
  startServer?: LanguageServerFactory;
}

const displayPath = (filePath: string, workingDirectory: string): string =>
  relative(workingDirectory, filePath) || filePath;

const formatLocation = (range: SourceRange, workingDirectory: string): string =>
  `${displayPath(range.filePath, workingDirectory)}:${range.start.line}:${range.start.column}`;

const callerLocations = (caller: Caller): SourceRange[] =>
  caller.callSites.length > 0 ? caller.callSites : [caller.declaration];

/**
 * @cc [author:spolu,label:product] callers-output
 * The callers command prints one deterministic line per direct call site as
 * `<path>:<line>:<column>\t<caller-name>`, using paths relative to the working directory. It prints
 * nothing when the target has no callers and falls back to the caller declaration when a language
 * server omits call-site ranges.
 */
/**
 * @cc [author:spolu,label:architecture] callers-session-ownership
 * A callers invocation creates one language-server session and disposes it before returning,
 * including when location resolution or protocol requests fail.
 */
export async function runCallersCommand(
  input: string,
  options: CallersCommandOptions = {},
): Promise<void> {
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const writeLine = options.writeLine ?? console.log;
  const startServer = options.startServer ?? startLanguageServer;
  const position = parseLocationLike(input, workingDirectory);
  const server = await startServer(position);

  try {
    const callers = await server.callers(position);
    for (const caller of callers) {
      for (const location of callerLocations(caller)) {
        writeLine(
          `${formatLocation(location, workingDirectory)}\t${caller.name}`,
        );
      }
    }
  } finally {
    await server.dispose();
  }
}
