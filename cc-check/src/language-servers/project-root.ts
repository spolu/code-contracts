import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";

/**
 * @cc [author:spolu,label:architecture] language-project-root
 * Project-scoped language adapters use the nearest ancestor containing one of their explicit
 * workspace markers. They reject files without a marker instead of querying an inferred workspace
 * that may return incomplete relationships.
 */
export function findProjectRoot(filePath: string, markers: string[]): string {
  let directory = dirname(filePath);
  const root = parse(directory).root;

  while (true) {
    if (markers.some((marker) => existsSync(join(directory, marker)))) {
      return directory;
    }
    if (directory === root) {
      break;
    }
    directory = dirname(directory);
  }

  throw new Error(`${markers.join(" or ")} not found for ${filePath}.`);
}
