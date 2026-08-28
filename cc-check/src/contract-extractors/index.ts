import type {
  LocalContractExtractor,
  LocalContractExtractorFactory,
} from "../local-contracts.js";
import type { ContractDocument } from "./contract-document.js";
import {
  extractGoContractDocuments,
  isGoSourceFile,
  startGoLocalContractExtractor,
} from "./go.js";
import {
  extractPythonContractDocuments,
  isPythonSourceFile,
  startPythonLocalContractExtractor,
} from "./python.js";
import { extractTypeScriptContractDocuments } from "./typescript-documentation.js";
import { typeScriptScriptKind } from "./typescript-documentation.js";
import { startTypeScriptLocalContractExtractor } from "./typescript.js";

/**
 * @cc [author:spolu,label:architecture] local-extractor-selection
 * Language selection for source contract documents and declaration attachment is isolated here.
 * The check and list commands depend only on language-neutral extraction interfaces, while
 * directory contract discovery remains separate and language-independent.
 */
export const startLocalContractExtractor: LocalContractExtractorFactory = (
  filePath: string,
): Promise<LocalContractExtractor> => {
  if (typeScriptScriptKind(filePath) !== undefined) {
    return startTypeScriptLocalContractExtractor();
  }
  if (isPythonSourceFile(filePath)) {
    return startPythonLocalContractExtractor();
  }
  if (isGoSourceFile(filePath)) {
    return startGoLocalContractExtractor();
  }
  return Promise.reject(new Error(`Unsupported source file type: ${filePath}`));
};

export const isSupportedContractSource = (filePath: string): boolean =>
  typeScriptScriptKind(filePath) !== undefined ||
  isPythonSourceFile(filePath) ||
  isGoSourceFile(filePath);

export const extractSourceContractDocuments = (
  filePath: string,
  source: string,
): ContractDocument[] => {
  if (typeScriptScriptKind(filePath) !== undefined) {
    return extractTypeScriptContractDocuments(filePath, source);
  }
  if (isPythonSourceFile(filePath)) {
    return extractPythonContractDocuments(filePath, source);
  }
  if (isGoSourceFile(filePath)) {
    return extractGoContractDocuments(filePath, source);
  }
  throw new Error(`Unsupported source file type: ${filePath}`);
};
