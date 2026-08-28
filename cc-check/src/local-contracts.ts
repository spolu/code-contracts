import type { CodeContract } from "./contract.js";
import type { SourcePosition, SourceRange } from "./language-server.js";

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
 * @cc [author:spolu,label:architecture] local-contract-extractor
 * A language-specific local extractor returns declaration-attached contracts for either a source
 * location or an entire file. Location results contain applicable declarations from broadest to
 * most specific, including language-defined ownership such as a Go receiver or Rust impl type;
 * file results contain every declaration with contracts in source order. Declarations without
 * contracts are omitted.
 */
export interface LocalContractExtractor {
  declarationsAt(position: SourcePosition): Promise<DeclarationContracts[]>;
  declarationsInFile(filePath: string): Promise<DeclarationContracts[]>;
}

export type LocalContractExtractorFactory = (
  filePath: string,
) => Promise<LocalContractExtractor>;
