import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildParserFile } from "@lezer/generator";
import { applyPatch } from "diff";

const projectDirectory = resolve(import.meta.dirname, "..");
const upstreamDirectory = dirname(
  dirname(fileURLToPath(import.meta.resolve("@lezer/php"))),
);
const outputDirectory = join(projectDirectory, "generated/php");

/**
 * @cc [owner:spolu,label:architecture] php-parser-grammar-patch
 * PHP parser generation MUST apply `patches/lezer-php.patch` to @lezer/php 1.0.6 and fail if the
 * installed version differs or the patch cannot be applied without context mismatches.
 */
/**
 * @cc [owner:spolu,label:architecture] php-parser-build-isolation
 * PHP parser generation MUST write only under `generated/php`; upstream dependency files MUST
 * remain unchanged.
 */
/**
 * @cc [owner:spolu,label:distribution] php-parser-upstream-license
 * The generated PHP parser MUST include the upstream MIT license in its distributed directory.
 */
async function generatePhpParser(): Promise<void> {
  const upstreamPackage = JSON.parse(
    await readFile(join(upstreamDirectory, "package.json"), "utf8"),
  ) as { version?: unknown };
  if (upstreamPackage.version !== "1.0.6") {
    throw new Error("The PHP grammar patch requires @lezer/php 1.0.6.");
  }

  const grammar = await readFile(
    join(upstreamDirectory, "src/php.grammar"),
    "utf8",
  );
  const patch = await readFile(
    join(projectDirectory, "patches/lezer-php.patch"),
    "utf8",
  );
  const correctedGrammar = applyPatch(grammar, patch, { fuzzFactor: 0 });
  if (correctedGrammar === false) {
    throw new Error(
      "The PHP grammar patch does not match the installed grammar.",
    );
  }

  const generated = buildParserFile(correctedGrammar, {
    fileName: "php.grammar",
  });
  // Lezer emits extensionless relative imports; Node ESM requires explicit extensions.
  const parser = generated.parser.replaceAll(
    /from "(\.\/[^".]+)"/g,
    'from "$1.js"',
  );

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "parser.js"), parser);
  await writeFile(join(outputDirectory, "parser.terms.js"), generated.terms);
  for (const file of ["tokens.js", "highlight.js"]) {
    await copyFile(
      join(upstreamDirectory, "src", file),
      join(outputDirectory, file),
    );
  }
  await copyFile(
    join(upstreamDirectory, "LICENSE"),
    join(outputDirectory, "LICENSE"),
  );
}

await generatePhpParser();
