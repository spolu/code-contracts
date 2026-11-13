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
  parseDirectoryContracts,
  type CodeContract,
  type ParsedContract,
} from "./contract.js";
import type { ContractDocument } from "./contract-extractors/contract-document.js";
import {
  extractSourceContractDocuments,
  isSupportedContractSource,
  startLocalContractExtractor,
} from "./contract-extractors/index.js";
import {
  discoverDirectoryContracts,
  type DirectoryContract,
} from "./directory-contracts.js";
import { resolveIgnores } from "./ignores.js";
import type {
  DeclarationContracts,
  LocalContractExtractor,
} from "./local-contracts.js";

export interface FormatCommandOptions {
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

const isFormatTarget = (filePath: string): boolean =>
  basename(filePath) === "CONTRACTS" || isSupportedContractSource(filePath);

const discoverFormatFiles = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort(({ name: left }, { name: right }) =>
    left < right ? -1 : left > right ? 1 : 0,
  );

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        files.push(...(await discoverFormatFiles(entryPath)));
      }
    } else if (entry.isFile() && isFormatTarget(entryPath)) {
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

const sourceFormatErrors = (
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
  const ignores = new Set<string>();

  for (const contract of contracts) {
    if (contract.kind === "ignore") {
      const from = contract.attributes.find(({ key }) => key === "from");
      const target = `${from?.value ?? ""}#${contract.id}`;
      if (ignores.has(target)) {
        errors.push(
          new ContractParseError(
            `Ignore of "${contract.id}" is not unique within its declaration`,
            contract.source.filePath,
            contract.source.start.line,
            contract.source.start.column,
          ),
        );
      }
      ignores.add(target);
      continue;
    }

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

const sameRange = (
  left: DeclarationContracts,
  right: DeclarationContracts,
): boolean => {
  const { start, end } = left.declaration.range;
  const other = right.declaration.range;
  return (
    start.line === other.start.line &&
    start.column === other.start.column &&
    end.line === other.end.line &&
    end.column === other.end.column
  );
};

const unresolvedIgnoreErrors = async (
  filePath: string,
  extractor: LocalContractExtractor,
  declarations: DeclarationContracts[],
): Promise<ContractParseError[]> => {
  const errors: ContractParseError[] = [];
  let directories: DirectoryContract[] | undefined;

  for (const declaration of declarations) {
    if (!declaration.contracts.some(({ kind }) => kind === "ignore")) {
      continue;
    }

    const { start } = declaration.declaration.range;
    const path = await extractor.declarationsAt({
      filePath,
      line: start.line,
      column: start.column,
    });
    const index = path.findIndex((candidate) =>
      sameRange(candidate, declaration),
    );
    directories ??= await discoverDirectoryContracts(filePath);

    for (const { ignore, target } of resolveIgnores(
      directories,
      index < 0 ? [declaration] : path,
      Math.max(index, 0),
    )) {
      if (!target) {
        errors.push(
          new ContractParseError(
            `Ignore of "${ignore.id}" does not resolve to an inherited contract`,
            ignore.source.filePath,
            ignore.source.start.line,
            ignore.source.start.column,
          ),
        );
      }
    }
  }

  return errors;
};

interface FormatFileResult {
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
  fileResults: FormatFileResult[],
): ContractParseError[] => {
  const errors: ContractParseError[] = [];
  const directoriesById = new Map<string, string[]>();
  const directoryFiles = fileResults
    .filter(
      (
        file,
      ): file is FormatFileResult & {
        directoryContracts: ParsedContract[];
      } => file.directoryContracts !== undefined,
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

const inspectFormatFile = async (
  filePath: string,
): Promise<FormatFileResult> => {
  const source = await readFile(filePath, "utf8");

  if (basename(filePath) === "CONTRACTS") {
    try {
      return {
        directoryContracts: parseDirectoryContracts(source, filePath),
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

  const errors = sourceFormatErrors(filePath, source);
  if (errors.length > 0) {
    return { errors, filePath };
  }

  const extractor = await startLocalContractExtractor(filePath);
  const declarations = await extractor.declarationsInFile(filePath);
  return {
    errors: [
      ...declarations.flatMap(({ contracts }) =>
        duplicateDeclarationIdErrors(contracts),
      ),
      ...(await unresolvedIgnoreErrors(filePath, extractor, declarations)),
    ],
    filePath,
  };
};

/**
 * @cc [owner:spolu,label:product] format-file-scope
 * With an argument, `format` MUST inspect the targeted `CONTRACTS` or supported source file and
 * reject unsupported file types. Without an argument, it MUST recursively inspect those file types
 * under the working directory, excluding `.git`, `.venv`, `__pycache__`, `node_modules`, `vendor`,
 * and `venv` directories.
 */
/**
 * @cc [owner:spolu,label:product] format-source-document-cardinality
 * Each source contract document MUST contain exactly one directive. `format` MUST reject documents
 * with multiple directives and MUST ignore documentation without a potential `@cc` directive.
 */
/**
 * @cc [owner:spolu,label:product] format-contract-id-uniqueness
 * Within the files selected for inspection, `format` rejects repeated IDs attached to one
 * declaration and repeated `CONTRACTS` IDs along an ancestor chain; IDs on distinct declarations
 * or sibling directory branches may repeat. A declaration MUST NOT repeat an ignore with the same
 * ID and `from` value.
 */
/**
 * @cc [owner:spolu,label:product] format-ignore-resolution
 * `format` rejects each `@cc-ignore` that does not resolve, per `ignore-resolution`, to a contract
 * inherited from a broader declaration or an ancestor `CONTRACTS` file of the source file.
 */
/**
 * @cc [owner:spolu,label:product] format-progress-output
 * An argument-free `format` writes each selected relative file path to stdout in deterministic
 * discovery order; a targeted inspection remains silent when no issue is found.
 */
/**
 * @cc [owner:spolu,label:product] format-result
 * Grammar, ID uniqueness, or ignore-target failures reject `format` with source-relative
 * `<path>:<line>:<column>: error: <description>` diagnostics and a non-zero exit status.
 */
/**
 * @cc [owner:spolu,label:product] format-read-only
 * `format` reads selected files without modifying them.
 */
/**
 * @cc [owner:spolu,label:product] format-no-semantic-validation
 * `format` performs structural grammar, directive-cardinality, ID-uniqueness, and ignore-target
 * checks only; it never assesses contract or ignore prose or whether code complies with a contract.
 */
export async function runFormatCommand(
  input?: string,
  options: FormatCommandOptions = {},
): Promise<void> {
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const writeLine = options.writeLine ?? console.log;
  const filePaths =
    input === undefined
      ? await discoverFormatFiles(workingDirectory)
      : [resolve(workingDirectory, input)];

  if (input !== undefined && !isFormatTarget(filePaths[0] ?? "")) {
    throw new Error(
      `Unsupported file "${input}". Expected a CONTRACTS or supported source file.`,
    );
  }

  if (input === undefined) {
    filePaths.forEach((filePath) =>
      writeLine(displayPath(filePath, workingDirectory)),
    );
  }

  const fileResults = await Promise.all(filePaths.map(inspectFormatFile));
  const errors = [
    ...fileResults.flatMap(({ errors: fileErrors }) => fileErrors),
    ...duplicateDirectoryIdErrors(fileResults),
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
