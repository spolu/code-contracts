# cc-check

Command-line tooling for discovering and checking code contracts.

`callers` and `references` have TypeScript prototype implementations. `check` and `list` are
scaffolded but not yet implemented.

## Requirements

- Node.js 24.16 or newer
- npm 11.11 or newer

## Development

```sh
nvm use
npm install
npm run dev -- --help
npm run check
```

## Command surface

```text
cc-check check <file-like>
cc-check callers <location-like>
cc-check references <location-like>
cc-check list <range-like>
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
