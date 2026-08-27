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
 * A language-specific local extractor returns contracts attached to the declaration containing the
 * source location and its syntactic declaration ancestors, ordered outermost to innermost. It does
 * not follow definitions, callers, references, inheritance, or other semantic relationships.
 * Declarations without contracts are omitted, and an empty result means no local contracts apply.
 */
export interface LocalContractExtractor {
  declarationsAt(position: SourcePosition): Promise<DeclarationContracts[]>;
}

export type LocalContractExtractorFactory = (
  position: SourcePosition,
) => Promise<LocalContractExtractor>;
