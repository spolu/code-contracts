# cc-check

Command-line tooling for discovering and checking code contracts.

`check` and `list` support TypeScript, Python, and Go. `callers` and `references` support TypeScript,
Python, Rust, and Go.

## Requirements

- Node.js 24.16 or newer
- npm 11.11 or newer
- `rust-analyzer` on `PATH` for Rust callers and references
- `gopls` on `PATH` for Go callers and references

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
Node.js built-ins. Rust and Go relationship cases run when their language servers are available.

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
`@cc` JSDoc-style `/** ... */` comment in a TypeScript source file, every `@cc` triple-quoted
docstring in a Python source file, every `@cc` line-comment group or block comment in a Go source
file, or every contract in a `CONTRACTS` file. Without an argument, it recursively checks all
supported files under the current directory, excluding `.git`, `node_modules`, `vendor`, `.venv`,
`venv`, and `__pycache__`. A source documentation comment or docstring must contain exactly one
directive; documentation without `@cc` is ignored. Python source support includes `.py` and `.pyi`
files; Go source support includes `.go` files.

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

For TypeScript, Python, Rust, or Go files, pass a declaration's file and one-based line. A one-based
column is optional:

```sh
npm run dev -- callers src/example.ts:42
npm run dev -- callers src/example.ts:42:10
```

TypeScript files must be under a `tsconfig.json` or `jsconfig.json`; Python files must be under a
`pyrightconfig.json` or `pyproject.toml`; Rust files must be under a `Cargo.toml` or
`rust-project.json`; Go files must be under a `go.work` or `go.mod`. The prototype supports `.ts`,
`.tsx`, `.mts`, `.cts`, `.py`, `.pyi`, `.rs`, and `.go` files. It prints one direct call site per
line:

```text
src/caller.ts:18:5\tcallerName
```

Each invocation starts a new language-server process and shuts it down before exiting; servers are
not cached between invocations. TypeScript uses `typescript-language-server`, Python uses the
bundled Pyright server, Rust uses `rust-analyzer` from `PATH`, and Go uses `gopls` from `PATH`.

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

`list` accepts a TypeScript, Python, or Go source file or source location. For a file, it prints
contracts attached to every supported declaration in source order. For a location, it prints
contracts attached to the declaration containing that location and its applicable declaration
ancestors. Both forms discover `CONTRACTS` files from the repository root through the source file's
directory:

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
an exact column to its definition. Python contracts attach through the first triple-quoted docstring
in a class or function body; module docstrings are checked but have no declaration scope to list.
Both `.py` and `.pyi` files are supported. Go contracts attach from the immediately preceding
line-comment group or block comment without an intervening blank line. A method also inherits its
receiver type's contracts when that type is declared in the same file.
