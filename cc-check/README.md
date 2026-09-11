# cc-check

Command-line tooling for discovering and inspecting code contracts.

`format` and `list` support TypeScript, Python, PHP, Rust, and Go.

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
IDs within the selected files. With a file argument, it inspects every
`@cc` JSDoc-style `/** ... */` comment in a TypeScript source file, every `@cc` triple-quoted
docstring in a Python source file, every `@cc` PHPDoc block in a PHP source file, every `@cc`
line-comment group or block comment in a Go source file, every `@cc` Rust doc comment, or every
contract in a `CONTRACTS` file. Without an argument, it recursively inspects all supported files under
the current directory, excluding `.git`, `node_modules`, `vendor`, `.venv`, `venv`, and `__pycache__`.
A source documentation comment or docstring must contain exactly one directive; documentation without
`@cc` is ignored. Python source support includes `.py` and `.pyi` files; PHP, Go, and Rust support
`.php`, `.go`, and `.rs` files, respectively.
An argument-free `format` prints each selected relative file path in deterministic discovery order.

```sh
cc-check format src/example.ts
cc-check format CONTRACTS
cc-check format
```

A targeted file with no format or ID-uniqueness issue produces no output. Malformed syntax or a
duplicate ID produces source-located diagnostics and a non-zero exit status:

```text
cc-check: src/example.ts:12:1: error: Invalid @cc directive
```

Attached IDs must be unique within a declaration, but may repeat on distinct declarations.
`CONTRACTS` IDs must be unique along ancestor chains included in the selected files, but may repeat
in sibling directory branches. A targeted file is the entire inspection scope; an argument-free
run uses every recursively discovered file.

`format` is read-only: it does not rewrite files, assess whether prose is true, or determine whether
implementation meets a contract.

## List

`list` accepts a TypeScript, Python, PHP, Rust, or Go source file or source location. For a file, it
prints contracts attached to every supported declaration in source order. For a location, it prints
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

Contracts may have multiple owners, notification recipients, and labels. Prefer semicolon-separated
values, such as `[owner:spolu;tdraier,notify:spolu;flvndvd,label:product;security]`, instead of
repeating metadata keys. `list` preserves these values in its output. Review agents notify `owner`
usernames when a contract changes and `notify` usernames on each contract violation; `cc-check`
itself does not send notifications.

Directory contracts are included by default; `--no-global` returns only declaration-attached
contracts. Results are ordered from broadest to most specific scope. `list` uses the location only
for source containment and does not follow the symbol at an exact column to its definition. Python
contracts attach through the first triple-quoted docstring in a class or function body; module
docstrings are checked but have no declaration scope to list. Both `.py` and `.pyi` files are
supported. PHP contracts attach from immediately preceding PHPDoc blocks without an intervening
blank line, including when PHPDoc appears before or after declaration attributes. Classes,
interfaces, traits, enums, functions, methods, declared and promoted properties, constants, and enum
cases are supported. Go contracts attach from the
immediately preceding line-comment group or block comment without an intervening blank line. A method
also inherits its receiver type's contracts when that type is declared in the same file. Rust outer
doc comments attach to supported items and named members across ordinary attributes; inner doc
comments are checked but are not listed. An impl inherits its same-scope declared type's contracts
using a syntax-only name match.
