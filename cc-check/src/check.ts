import { readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

import {
  ContractParseError,
  parseContracts,
  type ParsedContract,
} from "./contract.js";
import {
  extractTypeScriptContractDocuments,
  typeScriptScriptKind,
  type TypeScriptContractDocument,
} from "./contract-extractors/typescript-documentation.js";

export interface CheckCommandOptions {
  workingDirectory?: string;
}

const documentationCommentError = (
  filePath: string,
  document: TypeScriptContractDocument,
  contracts: ParsedContract[],
): ContractParseError | undefined => {
  if (contracts.length === 1) {
    return undefined;
  }

  const line = contracts[1]?.startLine ?? document.lineOffset + 1;
  return sourceContractError(
    "Documentation comments must contain exactly one @cc directive",
    filePath,
    line,
    document,
  );
};

const sourceContractError = (
  description: string,
  filePath: string,
  line: number,
  document: TypeScriptContractDocument,
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

const checkTypeScriptSource = (
  filePath: string,
  source: string,
): ContractParseError[] => {
  const errors: ContractParseError[] = [];

  for (const document of extractTypeScriptContractDocuments(filePath, source)) {
    try {
      const contracts = parseContracts(
        document.source,
        filePath,
        document.lineOffset,
      );
      const error = documentationCommentError(filePath, document, contracts);
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

/**
 * @cc [author:spolu,label:product] check-file-scope
 * `check` validates a `CONTRACTS` file as one contract document or every JSDoc-style documentation
 * comment with a potential `@cc` directive in a supported TypeScript file. Source comments must
 * contain exactly one directive; comments without `@cc` are ignored, and unsupported file types are
 * rejected.
 */
/**
 * @cc [author:spolu,label:product] check-result
 * A compliant file produces no output. Grammar failures reject the command with source-relative
 * `<path>:<line>:<column>: error: <description>` diagnostics and a non-zero exit status.
 */
export async function runCheckCommand(
  input: string,
  options: CheckCommandOptions = {},
): Promise<void> {
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const filePath = resolve(workingDirectory, input);
  const source = await readFile(filePath, "utf8");
  let errors: ContractParseError[] = [];

  if (basename(filePath) === "CONTRACTS") {
    try {
      parseContracts(source, filePath);
    } catch (error) {
      if (!(error instanceof ContractParseError)) {
        throw error;
      }
      errors = [error];
    }
  } else if (typeScriptScriptKind(filePath) !== undefined) {
    errors = checkTypeScriptSource(filePath, source);
  } else {
    throw new Error(
      `Unsupported file "${input}". Expected a CONTRACTS or TypeScript source file.`,
    );
  }

  if (errors.length > 0) {
    throw new Error(
      errors
        .map((error) => formatDiagnostic(error, workingDirectory))
        .join("\n"),
    );
  }
}
