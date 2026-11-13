import { posix } from "node:path";

import type { CodeContract } from "./contract.js";
import type { DirectoryContract } from "./directory-contracts.js";
import type { DeclarationContracts } from "./local-contracts.js";

export interface ResolvedIgnore {
  ignore: CodeContract;
  target?: CodeContract;
}

const ignoreSource = (ignore: CodeContract): string | undefined =>
  ignore.attributes.find(({ key }) => key === "from")?.value;

/**
 * @cc [owner:spolu,label:product] ignore-resolution
 * An ignore on `declarations[i]` without `from` MUST target the contract with its ID on the nearest
 * broader declaration `declarations[j]` (`j < i`), otherwise the most specific directory contract
 * with that ID. With `from`, it MUST target only the directory contract with that ID in the
 * `CONTRACTS` file at that repository-relative path. An ignore MUST NOT target a contract on its own
 * declaration; an ignore without a target resolves to `undefined`.
 */
export function resolveIgnores(
  directories: DirectoryContract[],
  declarations: DeclarationContracts[],
  index: number,
): ResolvedIgnore[] {
  const ignores = (declarations[index]?.contracts ?? []).filter(
    ({ kind }) => kind === "ignore",
  );

  return ignores.map((ignore) => {
    const isTarget = (contract: CodeContract): boolean =>
      contract.kind === "contract" && contract.id === ignore.id;
    const source = ignoreSource(ignore);

    if (source !== undefined) {
      const path = posix.normalize(source);
      const target = directories.find(
        ({ contract, repositoryPath }) =>
          repositoryPath === path && isTarget(contract),
      );
      return { ignore, target: target?.contract };
    }

    for (let ancestor = index - 1; ancestor >= 0; ancestor -= 1) {
      const target = declarations[ancestor]?.contracts.find(isTarget);
      if (target) {
        return { ignore, target };
      }
    }

    return {
      ignore,
      target: directories.findLast(({ contract }) => isTarget(contract))
        ?.contract,
    };
  });
}
