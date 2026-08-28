import { readdir, readFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";

import {
  ContractParseError,
  parseContracts,
  type ParsedContract,
} from "./contract.js";
import type { ContractDocument } from "./contract-extractors/contract-document.js";
import {
  extractSourceContractDocuments,
  isSupportedContractSource,
} from "./contract-extractors/index.js";

export interface CheckCommandOptions {
  workingDirectory?: string;
}

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".venv",
  "__pycache__",
  "node_modules",
  "venv",
]);

const isCheckFile = (filePath: string): boolean =>
  basename(filePath) === "CONTRACTS" || isSupportedContractSource(filePath);

const discoverCheckFiles = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort(({ name: left }, { name: right }) =>
    left < right ? -1 : left > right ? 1 : 0,
  );

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(...(await discoverCheckFiles(entryPath)));
      }
    } else if (entry.isFile() && isCheckFile(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
};

const sourceDocumentCardinalityError = (
  filePath: string,
  document: ContractDocument,
  contracts: ParsedContract[],
): ContractParseError | undefined => {
  if (contracts.length === 1) {
    return undefined;
  }

  const line = contracts[1]?.startLine ?? document.lineOffset + 1;
  return sourceContractError(
    "Source documentation must contain exactly one @cc directive",
    filePath,
    line,
    document,
  );
};

const sourceContractError = (
  description: string,
  filePath: string,
  line: number,
  document: ContractDocument,
  normalizedColumn = 1,
): ContractParseError => {
  const documentLine = line - document.lineOffset - 1;
  const sourceColumn = document.sourceColumns[documentLine] ?? 1;
  return new ContractParseError(
    description,
    filePath,
    line,
    sourceColumn + normalizedColumn - 1,
  );
};

const checkSource = (
  filePath: string,
  source: string,
): ContractParseError[] => {
  const errors: ContractParseError[] = [];

  for (const document of extractSourceContractDocuments(filePath, source)) {
    try {
      const contracts = parseContracts(
        document.source,
        filePath,
        document.lineOffset,
      );
      const error = sourceDocumentCardinalityError(
        filePath,
        document,
        contracts,
      );
      if (error) {
        errors.push(error);
      }
    } catch (error) {
      if (error instanceof ContractParseError) {
        errors.push(
          sourceContractError(
            error.description,
            filePath,
            error.line,
            document,
            error.column,
          ),
        );
        continue;
      }
      throw error;
    }
  }

  return errors;
};

const displayPath = (filePath: string, workingDirectory: string): string =>
  relative(workingDirectory, filePath) || filePath;

const formatDiagnostic = (
  error: ContractParseError,
  workingDirectory: string,
): string =>
  `${displayPath(error.sourceName, workingDirectory)}:${error.line}:${error.column}: error: ${error.description}`;

const checkFile = async (filePath: string): Promise<ContractParseError[]> => {
  const source = await readFile(filePath, "utf8");

  if (basename(filePath) === "CONTRACTS") {
    try {
      parseContracts(source, filePath);
      return [];
    } catch (error) {
      if (!(error instanceof ContractParseError)) {
        throw error;
      }
      return [error];
    }
  }

  return checkSource(filePath, source);
};

/**
 * @cc [author:spolu,label:product] check-file-scope
 * `check [file-like]` validates the targeted `CONTRACTS` or supported source file. Without a file,
 * it recursively checks every supported file under the current directory, excluding `.git`,
 * `node_modules`, `.venv`, `venv`, and `__pycache__`. Source documentation must contain exactly one
 * directive; documentation without `@cc` is ignored, and unsupported file types are rejected.
 */
/**
 * @cc [author:spolu,label:product] check-result
 * A compliant file produces no output. Grammar failures reject the command with source-relative
 * `<path>:<line>:<column>: error: <description>` diagnostics and a non-zero exit status.
 */
export async function runCheckCommand(
  input?: string,
  options: CheckCommandOptions = {},
): Promise<void> {
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const filePaths =
    input === undefined
      ? await discoverCheckFiles(workingDirectory)
      : [resolve(workingDirectory, input)];

  if (input !== undefined && !isCheckFile(filePaths[0] ?? "")) {
    throw new Error(
      `Unsupported file "${input}". Expected a CONTRACTS or supported source file.`,
    );
  }

  const errors = (await Promise.all(filePaths.map(checkFile))).flat();

  if (errors.length > 0) {
    throw new Error(
      errors
        .map((error) => formatDiagnostic(error, workingDirectory))
        .join("\n"),
    );
  }
}
