import { extname } from "node:path";

import type {
  LanguageServer,
  LanguageServerFactory,
  SourcePosition,
} from "../language-server.js";
import { startPythonLanguageServer } from "./python.js";
import { startTypeScriptLanguageServer } from "./typescript.js";

const LANGUAGE_SERVERS = new Map([
  [".ts", startTypeScriptLanguageServer],
  [".tsx", startTypeScriptLanguageServer],
  [".mts", startTypeScriptLanguageServer],
  [".cts", startTypeScriptLanguageServer],
  [".py", startPythonLanguageServer],
  [".pyi", startPythonLanguageServer],
]);

/**
 * @cc [author:spolu,label:architecture] language-adapter-selection
 * Language selection is isolated in this factory. The callers and references commands depend only
 * on the language-agnostic `LanguageServer` interface.
 */
export const startLanguageServer: LanguageServerFactory = async (
  position: SourcePosition,
): Promise<LanguageServer> => {
  const start = LANGUAGE_SERVERS.get(extname(position.filePath).toLowerCase());
  if (!start) {
    throw new Error(
      `Unsupported source file "${position.filePath}". Callers and references support TypeScript and Python.`,
    );
  }
  return start(position);
};
