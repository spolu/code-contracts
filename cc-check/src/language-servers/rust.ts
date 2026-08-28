import { extname } from "node:path";

import type { LanguageServer, SourcePosition } from "../language-server.js";
import { startStdioLanguageServer } from "./lsp.js";
import { findProjectRoot } from "./project-root.js";

const isQuiescentServerStatus = (params: unknown): boolean =>
  typeof params === "object" &&
  params !== null &&
  "quiescent" in params &&
  params.quiescent === true;

/**
 * @cc [author:spolu,label:architecture] rust-project-root
 * The Rust adapter uses the nearest ancestor containing `Cargo.toml` or `rust-project.json` as the
 * rust-analyzer workspace and rejects files without either marker.
 */
/**
 * @cc [author:spolu,label:product] rust-language-server-scope
 * Rust callers and references use a fresh `rust-analyzer` process from `PATH` for `.rs` files. No
 * relationship query is sent until rust-analyzer reports that its initial background work is
 * quiescent. No server process is cached between invocations.
 */
export async function startRustLanguageServer(
  position: SourcePosition,
): Promise<LanguageServer> {
  if (extname(position.filePath).toLowerCase() !== ".rs") {
    throw new Error(`Unsupported Rust source file "${position.filePath}".`);
  }

  return startStdioLanguageServer({
    command: "rust-analyzer",
    args: [],
    experimentalCapabilities: {
      serverStatusNotification: true,
    },
    languageId: "rust",
    readinessNotification: {
      isReady: isQuiescentServerStatus,
      method: "experimental/serverStatus",
    },
    workspaceRoot: findProjectRoot(position.filePath, [
      "Cargo.toml",
      "rust-project.json",
    ]),
  });
}
