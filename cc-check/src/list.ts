import { relative } from "node:path";

import type { CodeContract } from "./contract.js";
import { startLocalContractExtractor } from "./contract-extractors/index.js";
import {
  discoverDirectoryContracts,
  type DirectoryContract,
} from "./directory-contracts.js";
import { parseLocationLike } from "./file-location.js";
import type {
  DeclarationContracts,
  LocalContractExtractorFactory,
} from "./local-contracts.js";

type DirectoryContractDiscovery = (
  filePath: string,
) => Promise<DirectoryContract[]>;

interface DisplayContract {
  contract: CodeContract;
  scope: string;
}

export interface ListCommandOptions {
  includeGlobal?: boolean;
  workingDirectory?: string;
  writeLine?: (line: string) => void;
  startExtractor?: LocalContractExtractorFactory;
  discoverGlobal?: DirectoryContractDiscovery;
}

const displayPath = (filePath: string, workingDirectory: string): string =>
  relative(workingDirectory, filePath) || filePath;

const localContracts = (
  declarations: DeclarationContracts[],
): DisplayContract[] =>
  declarations.flatMap(({ declaration, contracts }) =>
    contracts.map((contract) => ({
      contract,
      scope: `declaration ${declaration.kind}${declaration.name ? ` ${declaration.name}` : ""}`,
    })),
  );

const globalContracts = (contracts: DirectoryContract[]): DisplayContract[] =>
  contracts.map(({ contract }) => ({ contract, scope: "directory" }));

const writeContract = (
  entry: DisplayContract,
  workingDirectory: string,
  writeLine: (line: string) => void,
): void => {
  const { contract } = entry;
  writeLine(
    `${displayPath(contract.source.filePath, workingDirectory)}:${contract.source.start.line}:${contract.source.start.column}\t${entry.scope}`,
  );
  writeLine(contract.directive);
  for (const line of contract.prose.split("\n")) {
    writeLine(line);
  }
};

/**
 * @cc [author:spolu,label:product] list-output
 * The list command prints applicable contracts from broadest to most specific: repository-root to
 * nearest-directory contracts, followed by outermost to innermost declaration contracts. Each
 * block includes the contract's source location and scope followed by its directive and prose.
 */
/**
 * @cc [author:spolu,label:product] list-global-option
 * Directory contracts are included by default. `--no-global` excludes every `CONTRACTS` file while
 * preserving declaration-attached contract discovery.
 */
export async function runListCommand(
  input: string,
  options: ListCommandOptions = {},
): Promise<void> {
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const writeLine = options.writeLine ?? console.log;
  const startExtractor = options.startExtractor ?? startLocalContractExtractor;
  const discoverGlobal = options.discoverGlobal ?? discoverDirectoryContracts;
  const position = parseLocationLike(input, workingDirectory);
  const extractor = await startExtractor(position);

  const [directories, declarations] = await Promise.all([
    options.includeGlobal === false
      ? Promise.resolve([])
      : discoverGlobal(position.filePath),
    extractor.declarationsAt(position),
  ]);
  const contracts = [
    ...globalContracts(directories),
    ...localContracts(declarations),
  ];

  contracts.forEach((contract, index) => {
    if (index > 0) {
      writeLine("");
    }
    writeContract(contract, workingDirectory, writeLine);
  });
}
