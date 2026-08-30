import { Command } from "commander";

import { runCallersCommand } from "./callers.js";
import { runCheckCommand } from "./check.js";
import { runListCommand } from "./list.js";
import { runReferencesCommand } from "./references.js";

const VERSION = "0.1.0";

/**
 * @cc [author:spolu,label:product] check-command
 * `cc-check check [file-like]` reports whether `@cc` directives comply with the code contract
 * grammar and ID uniqueness rules. It checks the targeted file when provided or the current
 * directory recursively when omitted, printing each recursively selected file.
 */
function addCheckCommand(program: Command): void {
  program
    .command("check")
    .description("Check @cc grammar and contract ID uniqueness")
    .argument("[file-like]", "Source file; defaults to the current directory")
    .action(runCheckCommand);
}

/**
 * @cc [author:spolu,label:product] callers-command
 * `cc-check callers <location-like>` lists direct call sites to the call-hierarchy-capable
 * declaration identified by the source location, using a fresh language-server process for each
 * invocation.
 */
function addCallersCommand(program: Command): void {
  program
    .command("callers")
    .description("List callers of the declaration at a source location")
    .argument("<location-like>", "Source file and line, optionally column")
    .action(runCallersCommand);
}

/**
 * @cc [author:spolu,label:product] references-command
 * `cc-check references <location-like>` lists every statically recognized usage of the declaration
 * identified by the source location, excluding the declaration itself.
 */
function addReferencesCommand(program: Command): void {
  program
    .command("references")
    .description("List references to the declaration at a source location")
    .argument("<location-like>", "Source file and line, optionally column")
    .action(runReferencesCommand);
}

/**
 * @cc [author:spolu,label:product] list-command
 * `cc-check list <file-like|location-like>` lists every declaration-attached contract in a source
 * file or contracts attached to the declaration containing a location and its enclosing
 * declarations. It includes applicable directory contracts by default; `--no-global` excludes
 * them.
 */
function addListCommand(program: Command): void {
  program
    .command("list")
    .description("List contracts in a source file or at a source location")
    .argument(
      "<file-like|location-like>",
      "Source file, optionally with line and column",
    )
    .option("--no-global", "Exclude contracts from CONTRACTS files")
    .action((input: string, options: { global: boolean }) =>
      runListCommand(input, {
        includeGlobal: options.global,
      }),
    );
}

/**
 * @cc [author:spolu,label:product] command-surface
 * The CLI exposes:
 * - `check [file-like]`
 * - `callers <location-like>`
 * - `references <location-like>`
 * - `list <file-like|location-like>`
 */
/**
 * @cc [author:spolu,label:product] relationship-target-resolution
 * For line-only locations, `callers` and `references` first resolve the innermost enclosing
 * declaration and use that declaration as the target of the relationship query. When a column is
 * provided, they use the symbol at that exact position instead.
 */
export function createProgram(): Command {
  const program = new Command()
    .name("cc-check")
    .description("Discover and check code contracts")
    .version(VERSION);

  addCheckCommand(program);
  addCallersCommand(program);
  addReferencesCommand(program);
  addListCommand(program);

  return program;
}
