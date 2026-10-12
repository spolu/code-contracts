# cc-check

Command-line tooling for discovering and inspecting code contracts.

`format` and `list` support TypeScript, Python, Rust, and Go.

## Installation

```sh
npm install --global @spolu/cc-check
cc-check --version
cc-check --help
```

## Requirements

- Node.js 24.16 or newer
- npm 11.11 or newer

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
Node.js built-ins.

## Command surface

```text
cc-check format [file-like]
cc-check list <file-like|location-like>
```

## Format

`format` reports malformed `@cc` directives according to the
[contracts grammar](https://github.com/spolu/code-contracts#specification-and-grammar) and duplicate
IDs within the selected files, and `@cc-ignore` directives that do not resolve to an inherited
contract. With a file argument, it inspects every
`@cc` JSDoc-style `/** ... */` comment in a TypeScript source file, every `@cc` triple-quoted
docstring in a Python source file, every `@cc` line-comment group or block comment in a Go source
file, every `@cc` Rust doc comment, or every contract in a `CONTRACTS` file. Without an argument, it
recursively inspects all supported files under the current directory, excluding `.git`,
`node_modules`, `vendor`, `.venv`, `venv`, and `__pycache__`. A source documentation comment or
docstring must contain exactly one directive; documentation without `@cc` is ignored. Python source
support includes `.py` and `.pyi` files; Go and Rust support `.go` and `.rs` files, respectively.
An argument-free `format` prints each selected relative file path in deterministic discovery order.

```sh
cc-check format src/example.ts
cc-check format CONTRACTS
cc-check format
```

A targeted file with no format, ID-uniqueness, or ignore issue produces no output. Malformed
syntax, a duplicate ID, or an unresolved ignore produces source-located diagnostics and a non-zero exit status:

```text
cc-check: src/example.ts:12:1: error: Invalid @cc directive
```

Attached IDs must be unique within a declaration, but may repeat on distinct declarations. A
declaration may ignore a given contract once. Each `@cc-ignore` must resolve to a contract on a
broader declaration or, otherwise or with `from`, to a contract in an ancestor `CONTRACTS` file;
`CONTRACTS` files cannot contain `@cc-ignore`. Checking ignores of directory contracts requires a
repository root containing `.git`.
`CONTRACTS` IDs must be unique along ancestor chains included in the selected files, but may repeat
in sibling directory branches. A targeted file is the entire inspection scope; an argument-free
run uses every recursively discovered file.

`format` is read-only: it does not rewrite files, assess whether prose is true, or determine whether
implementation meets a contract.

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
  scope:declaration function `payInvoice` · owner:spolu · label:product

  > `from.balance` is decreased by `invoice.amount` and `invoice.status` is set to `paid`.
```

Ignores are listed with `⊘` and `kind:ignore`. For a location, a contract ignored by an applicable
declaration remains listed with `ignored-by:<file>:<line>` naming the ignore:

```text
◆ database-access-thru-resources:1
  scope:directory · ignored-by:src/bootstrap.ts:3 · owner:spolu · label:architecture
```

Contracts may have multiple owners, notification recipients, and labels. Prefer semicolon-separated
values, such as `[owner:spolu;tdraier,notify:spolu;flvndvd,label:product;security]`, instead of
repeating metadata keys. `list` preserves these values in its output. Review agents notify `owner`
usernames when a contract changes and `notify` usernames on each contract violation; `cc-check`
itself does not send notifications.

Directory contracts are included by default; `--no-global` returns only declaration-attached
contracts. Results are ordered from broadest to most specific scope. `list` uses the location only
for source containment and does not follow the symbol at an exact column to its definition. Python
contracts attach through the first triple-quoted docstring in a class or function body; module
docstrings are checked but have no declaration scope to list.
Both `.py` and `.pyi` files are supported. Go contracts attach from the immediately preceding
line-comment group or block comment without an intervening blank line. A method also inherits its
receiver type's contracts when that type is declared in the same file. Rust outer doc comments
attach to supported items and named members across ordinary attributes; inner doc comments are
checked but are not listed. An impl inherits its same-scope declared type's contracts using a
syntax-only name match.
