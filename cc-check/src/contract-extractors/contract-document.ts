export interface ContractDocument {
  source: string;
  lineOffset: number;
  sourceColumns: number[];
}

export const hasPotentialContractDirective = (source: string): boolean =>
  source.split("\n").some((line) => /^@cc(?![\p{L}\p{N}_])/u.test(line));
