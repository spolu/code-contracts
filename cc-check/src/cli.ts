import { Command } from "commander";

const VERSION = "0.0.0";

const notImplemented = (commandName: string): never => {
  throw new Error(`cc-check ${commandName} is not implemented yet.`);
};

/**
 * @cc [author:spolu,label:product] check-command
 * `cc-check check <file-like>` reports whether the `@cc` directives in the targeted file comply
 * with the code contract grammar.
 */
function addCheckCommand(program: Command): void {
  program
    .command("check")
    .description("Check @cc directives against the code contract grammar")
    .argument("<file-like>", "Source file")
    .action(() => notImplemented("check"));
}

/**
 * @cc [author:spolu,label:product] callers-command
 * `cc-check callers <file-line-like>` lists the callers or users of the declaration identified by
 * the source location.
 */
function addCallersCommand(program: Command): void {
  program
    .command("callers")
    .description("List callers of the declaration at a source location")
    .argument("<file-line-like>", "Source file and line")
    .action(() => notImplemented("callers"));
}

/**
 * @cc [author:spolu,label:product] list-command
 * `cc-check list <file-line-or-range-like>` lists the contracts attached to local and enclosing
 * declarations and the directory contracts that apply to the selected source location or range.
 * When no line or range is provided, the selection is the whole file.
 */
function addListCommand(program: Command): void {
  program
    .command("list")
    .description("List contracts related to a source location or range")
    .argument("<file-line-or-range-like>", "Source file and optional line or range")
    .action(() => notImplemented("list"));
}

/**
 * @cc [author:spolu,label:product] command-surface
 * The CLI exposes:
 * - `check <file-like>`
 * - `callers <file-line-like>`
 * - `list <file-line-or-range-like>`
 */
export function createProgram(): Command {
  const program = new Command()
    .name("cc-check")
    .description("Discover and check code contracts")
    .version(VERSION);

  addCheckCommand(program);
  addCallersCommand(program);
  addListCommand(program);

  return program;
}
