import { readdir, readFile } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

import {
  ContractParseError,
  parseContracts,
  type CodeContract,
  type ParsedContract,
} from "./contract.js";
import type { ContractDocument } from "./contract-extractors/contract-document.js";
import {
  extractSourceContractDocuments,
  isSupportedContractSource,
  startLocalContractExtractor,
} from "./contract-extractors/index.js";

export interface CheckCommandOptions {
  workingDirectory?: string;
  writeLine?: (line: string) => void;
}

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".venv",
  "__pycache__",
  "node_modules",
  "vendor",
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

const duplicateDeclarationIdErrors = (
  contracts: CodeContract[],
): ContractParseError[] => {
  const errors: ContractParseError[] = [];
  const ids = new Set<string>();

  for (const contract of contracts) {
    if (ids.has(contract.id)) {
      errors.push(
        new ContractParseError(
          `Contract ID "${contract.id}" is not unique within its declaration`,
          contract.source.filePath,
          contract.source.start.line,
          contract.source.start.column,
        ),
      );
    }
    ids.add(contract.id);
  }

  return errors;
};

interface CheckedFile {
  errors: ContractParseError[];
  filePath: string;
  directoryContracts?: ParsedContract[];
}

const pathDepth = (filePath: string): number =>
  resolve(filePath).split(sep).filter(Boolean).length;

const isWithinDirectory = (
  ancestorDirectory: string,
  candidateDirectory: string,
): boolean => {
  const nestedPath = relative(ancestorDirectory, candidateDirectory);
  return (
    nestedPath === "" ||
    (nestedPath !== ".." &&
      !nestedPath.startsWith(`..${sep}`) &&
      !isAbsolute(nestedPath))
  );
};

const duplicateDirectoryIdErrors = (
  checkedFiles: CheckedFile[],
): ContractParseError[] => {
  const errors: ContractParseError[] = [];
  const directoriesById = new Map<string, string[]>();
  const directoryFiles = checkedFiles
    .filter(
      (file): file is CheckedFile & { directoryContracts: ParsedContract[] } =>
        file.directoryContracts !== undefined,
    )
    .toSorted(
      (left, right) =>
        pathDepth(left.filePath) - pathDepth(right.filePath) ||
        left.filePath.localeCompare(right.filePath),
    );

  for (const file of directoryFiles) {
    const directory = dirname(file.filePath);
    for (const contract of file.directoryContracts) {
      const existingDirectories = directoriesById.get(contract.id) ?? [];
      if (
        existingDirectories.some((existingDirectory) =>
          isWithinDirectory(existingDirectory, directory),
        )
      ) {
        errors.push(
          new ContractParseError(
            `Contract ID "${contract.id}" is not unique within its CONTRACTS ancestry`,
            file.filePath,
            contract.startLine,
          ),
        );
      }
      existingDirectories.push(directory);
      directoriesById.set(contract.id, existingDirectories);
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

const checkFile = async (filePath: string): Promise<CheckedFile> => {
  const source = await readFile(filePath, "utf8");

  if (basename(filePath) === "CONTRACTS") {
    try {
      return {
        directoryContracts: parseContracts(source, filePath),
        errors: [],
        filePath,
      };
    } catch (error) {
      if (!(error instanceof ContractParseError)) {
        throw error;
      }
      return { errors: [error], filePath };
    }
  }

  const errors = checkSource(filePath, source);
  if (errors.length > 0) {
    return { errors, filePath };
  }

  const extractor = await startLocalContractExtractor(filePath);
  const declarations = await extractor.declarationsInFile(filePath);
  return {
    errors: declarations.flatMap(({ contracts }) =>
      duplicateDeclarationIdErrors(contracts),
    ),
    filePath,
  };
};

/**
 * @cc [author:spolu,label:product] check-file-scope
 * `check [file-like]` validates the targeted `CONTRACTS` or supported source file. Without a file,
 * it recursively checks every supported file under the current directory, excluding common
 * repository metadata, dependency, environment, and cache directories. Source documentation must
 * contain exactly one directive; documentation without `@cc` is ignored, and unsupported file
 * types are rejected.
 */
/**
 * @cc [author:spolu,label:product] check-contract-id-uniqueness
 * Within the files selected for checking, `check` rejects repeated IDs attached to one declaration
 * and repeated `CONTRACTS` IDs along an ancestor chain; IDs on distinct declarations or sibling
 * directory branches may repeat.
 */
/**
 * @cc [author:spolu,label:product] check-progress-output
 * An argument-free `check` writes each selected relative file path to stdout in deterministic
 * discovery order; a targeted check remains silent when compliant.
 */
/**
 * @cc [author:spolu,label:product] check-result
 * Grammar or ID uniqueness failures reject `check` with source-relative
 * `<path>:<line>:<column>: error: <description>` diagnostics and a non-zero exit status.
 */
export async function runCheckCommand(
  input?: string,
  options: CheckCommandOptions = {},
): Promise<void> {
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const writeLine = options.writeLine ?? console.log;
  const filePaths =
    input === undefined
      ? await discoverCheckFiles(workingDirectory)
      : [resolve(workingDirectory, input)];

  if (input !== undefined && !isCheckFile(filePaths[0] ?? "")) {
    throw new Error(
      `Unsupported file "${input}". Expected a CONTRACTS or supported source file.`,
    );
  }

  if (input === undefined) {
    filePaths.forEach((filePath) =>
      writeLine(displayPath(filePath, workingDirectory)),
    );
  }

  const checkedFiles = await Promise.all(filePaths.map(checkFile));
  const errors = [
    ...checkedFiles.flatMap(({ errors: fileErrors }) => fileErrors),
    ...duplicateDirectoryIdErrors(checkedFiles),
  ].toSorted(
    (left, right) =>
      left.sourceName.localeCompare(right.sourceName) ||
      left.line - right.line ||
      left.column - right.column,
  );

  if (errors.length > 0) {
    throw new Error(
      errors
        .map((error) => formatDiagnostic(error, workingDirectory))
        .join("\n"),
    );
  }
}
