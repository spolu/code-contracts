# cc-check

Command-line tooling for discovering and checking code contracts.

`check`, `list`, `callers`, and `references` support TypeScript, Python, Rust, and Go.

## Installation

```sh
npm install --global cc-check
cc-check --version
cc-check --help
```

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
[contracts grammar](https://github.com/spolu/code-contracts#specification-and-grammar) and enforces
ID uniqueness within the check perimeter. With a file argument, it checks every
`@cc` JSDoc-style `/** ... */` comment in a TypeScript source file, every `@cc` triple-quoted
docstring in a Python source file, every `@cc` line-comment group or block comment in a Go source
file, every `@cc` Rust doc comment, or every contract in a `CONTRACTS` file. Without an argument, it
recursively checks all supported files under the current directory, excluding `.git`,
`node_modules`, `vendor`, `.venv`, `venv`, and `__pycache__`. A source documentation comment or
docstring must contain exactly one directive; documentation without `@cc` is ignored. Python source
support includes `.py` and `.pyi` files; Go and Rust support `.go` and `.rs` files, respectively.
An argument-free check prints each selected relative file path in deterministic discovery order.

```sh
cc-check check src/example.ts
cc-check check CONTRACTS
cc-check check
```

A compliant targeted file produces no output. Invalid grammar or ID uniqueness produces
source-located diagnostics and a non-zero exit status:

```text
cc-check: src/example.ts:12:1: error: Invalid @cc directive
```

Attached IDs must be unique within a declaration, but may repeat on distinct declarations.
`CONTRACTS` IDs must be unique along ancestor chains included in the check perimeter, but may repeat
in sibling directory branches. A targeted file is the entire check perimeter; an argument-free run
uses every recursively discovered file.

`check` does not assess whether prose is true or whether implementation meets a contract.

## Callers

For TypeScript, Python, Rust, or Go files, pass a declaration's file and one-based line. A one-based
column is optional:

```sh
cc-check callers src/example.ts:42
cc-check callers src/example.ts:42:10
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
cc-check references src/example.ts:42
```

```text
src/user.ts:12:7
src/user.ts:28:14
```

For both commands, a line-only location targets the innermost enclosing declaration. Supplying a
column instead targets the symbol at that exact position.

## List

`list` accepts a TypeScript, Python, Rust, or Go source file or source location. For a file, it prints
contracts attached to every supported declaration in source order. For a location, it prints
contracts attached to the declaration containing that location and its applicable declaration
ancestors. Both forms discover `CONTRACTS` files from the repository root through the source file's
directory:

```sh
cc-check list src/example.ts
cc-check list src/example.ts:42
cc-check list --no-global src/example.ts:42:10
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
receiver type's contracts when that type is declared in the same file. Rust outer doc comments
attach to supported items and named members across ordinary attributes; inner doc comments are
checked but are not listed. An impl inherits its same-scope declared type's contracts using a
syntax-only name match.
