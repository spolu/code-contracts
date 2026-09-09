import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, parse, resolve } from "node:path";

import {
  parseContracts,
  type CodeContract,
  type ParsedContract,
} from "./contract.js";

export interface DirectoryContract {
  contract: CodeContract;
  contractsFilePath: string;
}

const findRepositoryRoot = (filePath: string): string => {
  let directory = dirname(resolve(filePath));

  while (true) {
    if (existsSync(join(directory, ".git"))) {
      return directory;
    }

    const parent = dirname(directory);
    if (parent === directory || directory === parse(directory).root) {
      throw new Error(`No repository root found for ${filePath}.`);
    }
    directory = parent;
  }
};

const directoryChain = (filePath: string, repositoryRoot: string): string[] => {
  const directories: string[] = [];
  let directory = dirname(resolve(filePath));

  while (true) {
    directories.push(directory);
    if (directory === repositoryRoot) {
      return directories.reverse();
    }
    directory = dirname(directory);
  }
};

const locateContract = (
  contract: ParsedContract,
  contractsFilePath: string,
): CodeContract => ({
  id: contract.id,
  attributes: contract.attributes,
  directive: contract.directive,
  prose: contract.prose,
  source: {
    filePath: contractsFilePath,
    start: { line: contract.startLine, column: 1 },
    end: { line: contract.endLine, column: contract.endColumn },
  },
});

/**
 * @cc [owner:spolu,label:product] directory-contract-discovery
 * Results MUST include contracts from every `CONTRACTS` file between the nearest ancestor with
 * `.git` and the target file's directory, inclusive, ordered from broadest to most specific scope
 * and preserving contract order within each file. With a repository root but no matching
 * `CONTRACTS` files, the result MUST be empty. If no ancestor contains `.git`, discovery MUST reject.
 */
export async function discoverDirectoryContracts(
  filePath: string,
): Promise<DirectoryContract[]> {
  const repositoryRoot = findRepositoryRoot(filePath);
  const contracts: DirectoryContract[] = [];

  for (const directory of directoryChain(filePath, repositoryRoot)) {
    const contractsFilePath = join(directory, "CONTRACTS");
    if (!existsSync(contractsFilePath)) {
      continue;
    }

    const source = await readFile(contractsFilePath, "utf8");
    for (const contract of parseContracts(source, contractsFilePath)) {
      contracts.push({
        contractsFilePath,
        contract: locateContract(contract, contractsFilePath),
      });
    }
  }

  return contracts;
}
