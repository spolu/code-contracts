import { extname } from "node:path";

import type { SourcePosition } from "../language-server.js";
import type {
  LocalContractExtractor,
  LocalContractExtractorFactory,
} from "../local-contracts.js";
import { startTypeScriptLocalContractExtractor } from "./typescript.js";

const TYPESCRIPT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);

/**
 * @cc [author:spolu,label:architecture] local-extractor-selection
 * Language selection for declaration-attached contracts is isolated in this factory. The list
 * command and directory discovery depend only on the language-neutral local extractor interface.
 */
export const startLocalContractExtractor: LocalContractExtractorFactory = (
  position: SourcePosition,
): Promise<LocalContractExtractor> => {
  if (TYPESCRIPT_EXTENSIONS.has(extname(position.filePath).toLowerCase())) {
    return startTypeScriptLocalContractExtractor();
  }
  return Promise.reject(
    new Error(`Unsupported source file type: ${position.filePath}`),
  );
};
