import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, parse } from "node:path";

import type { LanguageServer, SourcePosition } from "../language-server.js";
import { startStdioLanguageServer } from "./lsp.js";

const require = createRequire(import.meta.url);

const LANGUAGE_IDS = new Map([
  [".ts", "typescript"],
  [".mts", "typescript"],
  [".cts", "typescript"],
  [".tsx", "typescriptreact"],
]);

const findProjectRoot = (filePath: string): string => {
  let directory = dirname(filePath);
  const root = parse(directory).root;

  while (true) {
    if (
      existsSync(join(directory, "tsconfig.json")) ||
      existsSync(join(directory, "jsconfig.json"))
    ) {
      return directory;
    }
    if (directory === root) {
      break;
    }
    directory = dirname(directory);
  }

  throw new Error(`No tsconfig.json or jsconfig.json found for ${filePath}.`);
};

/**
 * @cc [author:spolu,label:architecture] typescript-project-root
 * The TypeScript adapter uses the nearest ancestor containing `tsconfig.json` or `jsconfig.json`
 * as the LSP workspace and rejects files without one rather than returning incomplete inferred-
 * project relationship results.
 */
/**
 * @cc [author:spolu,label:product] typescript-prototype-scope
 * The TypeScript language-server prototype supports `.ts`, `.tsx`, `.mts`, and `.cts` source files.
 */
/**
 * @cc [author:spolu,label:architecture] typescript-semantic-server
 * The TypeScript adapter disables the separate syntax server so the first callers or references
 * request runs against the configured semantic project rather than returning partial results.
 */
export async function startTypeScriptLanguageServer(
  position: SourcePosition,
): Promise<LanguageServer> {
  const languageId = LANGUAGE_IDS.get(extname(position.filePath).toLowerCase());
  if (!languageId) {
    throw new Error(
      `Unsupported source file "${position.filePath}". The prototype supports TypeScript files only.`,
    );
  }

  const packagePath =
    require.resolve("typescript-language-server/package.json");
  const serverPath = join(dirname(packagePath), "lib", "cli.mjs");

  return startStdioLanguageServer({
    command: process.execPath,
    args: [serverPath, "--stdio", "--log-level", "1"],
    initializationOptions: {
      disableAutomaticTypingAcquisition: true,
      tsserver: {
        useSyntaxServer: "never",
      },
    },
    languageId,
    workspaceRoot: findProjectRoot(position.filePath),
  });
}
