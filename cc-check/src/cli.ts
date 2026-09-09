import { Command } from "commander";

import { runFormatCommand } from "./format.js";
import { runListCommand } from "./list.js";

const VERSION = "0.2.0";

/**
 * @cc [owner:spolu,label:product] format-command
 * `cc-check format [file-like]` reports malformed `@cc` syntax and duplicate contract IDs in the
 * targeted file or the current directory recursively when omitted, printing each recursively
 * selected file. It does not assess contract prose or implementation compliance.
 */
function addFormatCommand(program: Command): void {
  program
    .command("format")
    .description("Inspect @cc format and contract ID uniqueness")
    .argument(
      "[file-like]",
      "Source or CONTRACTS file; defaults to the current directory",
    )
    .action(runFormatCommand);
}

/**
 * @cc [owner:spolu,label:product] list-command
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
 * @cc [owner:spolu,label:product] command-surface
 * The CLI exposes:
 * - `format [file-like]`
 * - `list <file-like|location-like>`
 */
export function createProgram(): Command {
  const program = new Command()
    .name("cc-check")
    .description("Discover and inspect code contracts")
    .version(VERSION);

  addFormatCommand(program);
  addListCommand(program);

  return program;
}
