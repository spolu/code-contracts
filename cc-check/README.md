# cc-check

Command-line tooling for discovering and checking code contracts.

The project currently contains only the CLI and development scaffolding. The commands are present
but intentionally report that they are not implemented.

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
cc-check callers <file-line-like>
cc-check list <file-line-or-range-like>
```
