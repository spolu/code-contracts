# cc-check

Command-line tooling for discovering and checking code contracts.

`callers`, `references`, and `list` have TypeScript prototype implementations. `check` is
scaffolded but not yet implemented.

## Requirements

- Node.js 24.16 or newer
- npm 11.11 or newer

## Development

```sh
nvm use
npm install
npm run dev -- --help
npm run format
npm run check
```

## Command surface

```text
cc-check check <file-like>
cc-check callers <location-like>
cc-check references <location-like>
cc-check list <location-like>
```

## Callers

For TypeScript files, pass a declaration's file and one-based line. A one-based column is optional:

```sh
npm run dev -- callers src/example.ts:42
npm run dev -- callers src/example.ts:42:10
```

The source file must be under a `tsconfig.json` or `jsconfig.json`. The prototype supports `.ts`,
`.tsx`, `.mts`, and `.cts` files. It prints one direct call site per line:

```text
src/caller.ts:18:5\tcallerName
```

Each invocation starts a new TypeScript language-server process and shuts it down before exiting;
servers are not cached between invocations.

## References

`references` accepts the same TypeScript source location as `callers` and prints every statically
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

`list` prints every contract applicable to a TypeScript source location. It discovers `CONTRACTS`
files from the repository root through the source file's directory, then adds contracts attached to
the declaration containing the location and its syntactic declaration ancestors:

```sh
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
