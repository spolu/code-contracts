import { extname } from "node:path";

import type { LanguageServer, SourcePosition } from "../language-server.js";
import { startStdioLanguageServer } from "./lsp.js";
import { findProjectRoot } from "./project-root.js";

/**
 * @cc [author:spolu,label:architecture] go-project-root
 * The Go adapter uses the nearest ancestor containing `go.work` or `go.mod` as the gopls workspace
 * and rejects files without either marker.
 */
/**
 * @cc [author:spolu,label:product] go-language-server-scope
 * Go callers and references use a fresh `gopls serve` process from `PATH` for `.go` files. No
 * server process is cached between invocations.
 */
export async function startGoLanguageServer(
  position: SourcePosition,
): Promise<LanguageServer> {
  if (extname(position.filePath).toLowerCase() !== ".go") {
    throw new Error(`Unsupported Go source file "${position.filePath}".`);
  }

  return startStdioLanguageServer({
    command: "gopls",
    args: ["serve"],
    languageId: "go",
    workspaceRoot: findProjectRoot(position.filePath, ["go.work", "go.mod"]),
  });
}
