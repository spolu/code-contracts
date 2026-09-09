import type { CodeContract } from "./contract.js";
import type { SourcePosition, SourceRange } from "./file-location.js";

export interface ContractDeclaration {
  name?: string;
  kind: string;
  range: SourceRange;
}

export interface DeclarationContracts {
  declaration: ContractDeclaration;
  contracts: CodeContract[];
}

/**
 * @cc [owner:spolu,label:architecture] local-contract-extractor
 * Returned declarations MUST have attached contracts and follow the requested scope:
 * - `declarationsAt` returns applicable declarations from broadest to most specific, including
 *   language-defined ownership such as a Go receiver or Rust impl type.
 * - `declarationsInFile` returns every declaration with contracts in source order.
 */
export interface LocalContractExtractor {
  declarationsAt(position: SourcePosition): Promise<DeclarationContracts[]>;
  declarationsInFile(filePath: string): Promise<DeclarationContracts[]>;
}

export type LocalContractExtractorFactory = (
  filePath: string,
) => Promise<LocalContractExtractor>;
