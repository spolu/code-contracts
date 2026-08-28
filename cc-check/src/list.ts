import { relative } from "node:path";

import type { CodeContract } from "./contract.js";
import { startLocalContractExtractor } from "./contract-extractors/index.js";
import {
  discoverDirectoryContracts,
  type DirectoryContract,
} from "./directory-contracts.js";
import { parseFileOrLocationLike } from "./file-location.js";
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
      scope: `declaration ${declaration.kind}${declaration.name ? ` \`${declaration.name}\`` : ""}`,
    })),
  );

const globalContracts = (contracts: DirectoryContract[]): DisplayContract[] =>
  contracts.map(({ contract }) => ({ contract, scope: "directory" }));

const writeSourceHeader = (
  filePath: string,
  writeLine: (line: string) => void,
): void => {
  writeLine(`=> ${filePath} <=`);
  writeLine("");
};

const writeContract = (
  entry: DisplayContract,
  writeLine: (line: string) => void,
): void => {
  const { contract } = entry;
  writeLine(`◆ ${contract.id}:${contract.source.start.line}`);
  const details = [
    `scope:${entry.scope}`,
    ...contract.attributes.map(
      (attribute) => `${attribute.key}:${attribute.value}`,
    ),
  ];
  writeLine(`  ${details.join(" · ")}`);
  writeLine("");
  for (const line of contract.prose.split("\n")) {
    writeLine(line.length === 0 ? "" : `  > ${line}`);
  }
};

const groupBySourceFile = (
  contracts: DisplayContract[],
): Map<string, DisplayContract[]> => {
  const groups = new Map<string, DisplayContract[]>();
  for (const contract of contracts) {
    const filePath = contract.contract.source.filePath;
    const group = groups.get(filePath) ?? [];
    group.push(contract);
    groups.set(filePath, group);
  }
  return groups;
};

/**
 * @cc [author:spolu,label:product] list-output
 * The list command groups applicable contracts under `=> <relative-file> <=`, with directory
 * scopes first and local declarations ordered by containment for a location or by source for a
 * whole file. Each entry shows `◆ <id>:<line>`, scope and metadata, then quoted prose; it omits the
 * `@cc` directive and prints nothing when no contracts apply.
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
  const target = parseFileOrLocationLike(input, workingDirectory);
  const extractor = await startExtractor(target.filePath);

  const [directories, declarations] = await Promise.all([
    options.includeGlobal === false
      ? Promise.resolve([])
      : discoverGlobal(target.filePath),
    target.position
      ? extractor.declarationsAt(target.position)
      : extractor.declarationsInFile(target.filePath),
  ]);
  const contracts = [
    ...globalContracts(directories),
    ...localContracts(declarations),
  ];

  [...groupBySourceFile(contracts)].forEach(([filePath, group], groupIndex) => {
    if (groupIndex > 0) {
      writeLine("");
    }
    writeSourceHeader(displayPath(filePath, workingDirectory), writeLine);
    group.forEach((contract, contractIndex) => {
      if (contractIndex > 0) {
        writeLine("");
      }
      writeContract(contract, writeLine);
    });
  });
}
