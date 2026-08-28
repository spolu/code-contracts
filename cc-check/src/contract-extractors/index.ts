import type {
  LocalContractExtractor,
  LocalContractExtractorFactory,
} from "../local-contracts.js";
import { typeScriptScriptKind } from "./typescript-documentation.js";
import { startTypeScriptLocalContractExtractor } from "./typescript.js";

/**
 * @cc [author:spolu,label:architecture] local-extractor-selection
 * Language selection for declaration-attached contracts is isolated in this factory. The list
 * command depends only on the language-neutral local extractor interface, while directory contract
 * discovery remains separate and language-independent.
 */
export const startLocalContractExtractor: LocalContractExtractorFactory = (
  filePath: string,
): Promise<LocalContractExtractor> => {
  if (typeScriptScriptKind(filePath) !== undefined) {
    return startTypeScriptLocalContractExtractor();
  }
  return Promise.reject(new Error(`Unsupported source file type: ${filePath}`));
};
