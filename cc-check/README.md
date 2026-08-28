# cc-check

Command-line tooling for discovering and checking code contracts.

`check` and `list` have TypeScript prototype implementations. `callers` and `references` support
TypeScript, Python, and Rust.

## Requirements

- Node.js 24.16 or newer
- npm 11.11 or newer
- `rust-analyzer` on `PATH` for Rust callers and references

## Development

```sh
nvm use
npm install
npm run dev -- --help
npm run format
npm test
npm run check
```

`npm test` builds the CLI and runs its integration cases against smoke fixture files using only
Node.js built-ins. Rust relationship cases run when `rust-analyzer` is available.

## Command surface

```text
cc-check check [file-like]
cc-check callers <location-like>
cc-check references <location-like>
cc-check list <file-like|location-like>
```

## Check

`check` validates contracts against the
[contracts grammar](../README.md#specification-and-grammar). With a file argument, it checks every
`@cc` JSDoc-style `/** ... */` comment in a TypeScript source file or every contract in a `CONTRACTS`
file. Without an argument, it recursively checks all supported files under the current directory,
excluding `.git` and `node_modules`. A source documentation comment must contain exactly one
directive. Comments without `@cc` are ignored.

```sh
npm run dev -- check src/example.ts
npm run dev -- check CONTRACTS
npm run dev -- check
```

A compliant file produces no output. Invalid grammar produces source-located diagnostics and a
non-zero exit status:

```text
cc-check: src/example.ts:12:1: error: Invalid @cc directive
```

`check` validates grammar only. It does not assess whether prose is true, whether implementation
meets a contract, or whether contract IDs are unique.

## Callers

For TypeScript, Python, or Rust files, pass a declaration's file and one-based line. A one-based
column is optional:

```sh
npm run dev -- callers src/example.ts:42
npm run dev -- callers src/example.ts:42:10
```

TypeScript files must be under a `tsconfig.json` or `jsconfig.json`; Python files must be under a
`pyrightconfig.json` or `pyproject.toml`; Rust files must be under a `Cargo.toml` or
`rust-project.json`. The prototype supports `.ts`, `.tsx`, `.mts`, `.cts`, `.py`, `.pyi`, and `.rs`
files. It prints one direct call site per line:

```text
src/caller.ts:18:5\tcallerName
```

Each invocation starts a new language-server process and shuts it down before exiting; servers are
not cached between invocations. TypeScript uses `typescript-language-server`, Python uses the
bundled Pyright server, and Rust uses `rust-analyzer` from `PATH`.

## References

`references` accepts the same supported source location as `callers` and prints every statically
recognized usage except the declaration itself:

```sh
npm run dev -- references src/example.ts:42
```

```text
src/user.ts:12:7
src/user.ts:28:14
```

For both commands, a line-only location targets the innermost enclosing declaration. Supplying a
column instead targets the symbol at that exact position.

## List

`list` accepts a TypeScript source file or source location. For a file, it prints contracts attached
to every supported declaration in source order. For a location, it prints contracts attached to the
declaration containing that location and its syntactic declaration ancestors. Both forms discover
`CONTRACTS` files from the repository root through the source file's directory:

```sh
npm run dev -- list src/example.ts
npm run dev -- list src/example.ts:42
npm run dev -- list --no-global src/example.ts:42:10
```

```text
=> src/example.ts <=

◆ balance-post:12
  scope:declaration function `payInvoice` · author:spolu · label:product

  > `from.balance` is decreased by `invoice.amount` and `invoice.status` is set to `paid`.
```

Directory contracts are included by default; `--no-global` returns only declaration-attached
contracts. Results are ordered from broadest to most specific scope. Unlike `callers` and
`references`, `list` uses the location only for source containment and does not follow the symbol at
an exact column to its definition.
