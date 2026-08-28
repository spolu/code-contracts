import { createRequire } from "node:module";
import { readdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

import type { LanguageServer, SourcePosition } from "../language-server.js";
import { startStdioLanguageServer } from "./lsp.js";
import { findProjectRoot } from "./project-root.js";

const require = createRequire(import.meta.url);
const PYTHON_EXTENSIONS = new Set([".py", ".pyi"]);
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".venv",
  "__pycache__",
  "node_modules",
  "venv",
]);

const discoverPythonFiles = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort(({ name: left }, { name: right }) =>
    left < right ? -1 : left > right ? 1 : 0,
  );

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name)) {
      files.push(...(await discoverPythonFiles(entryPath)));
    } else if (
      entry.isFile() &&
      PYTHON_EXTENSIONS.has(extname(entry.name).toLowerCase())
    ) {
      files.push(entryPath);
    }
  }
  return files;
};

/**
 * @cc [author:spolu,label:architecture] python-project-root
 * The Python adapter uses the nearest ancestor containing `pyrightconfig.json` or `pyproject.toml`
 * as the Pyright workspace and rejects files without either marker.
 */
/**
 * @cc [author:spolu,label:product] python-language-server-scope
 * Python callers and references use a fresh bundled Pyright language server for `.py` and `.pyi`
 * files. The MVP pre-opens workspace Python files, excluding common dependency and cache
 * directories, so cross-file relationships are available before the first query. No server process
 * is cached between invocations.
 */
export async function startPythonLanguageServer(
  position: SourcePosition,
): Promise<LanguageServer> {
  if (!PYTHON_EXTENSIONS.has(extname(position.filePath).toLowerCase())) {
    throw new Error(`Unsupported Python source file "${position.filePath}".`);
  }

  const packagePath = require.resolve("pyright/package.json");
  const serverPath = join(dirname(packagePath), "langserver.index.js");
  const workspaceRoot = findProjectRoot(position.filePath, [
    "pyrightconfig.json",
    "pyproject.toml",
  ]);

  return startStdioLanguageServer({
    command: process.execPath,
    args: [serverPath, "--stdio"],
    languageId: "python",
    preloadFilePaths: await discoverPythonFiles(workspaceRoot),
    settings: {
      python: {
        analysis: {
          diagnosticMode: "workspace",
        },
      },
    },
    workspaceRoot,
  });
}
