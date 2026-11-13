import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(projectDirectory, "dist/cc-check.js");
const fixtureDirectory = join(projectDirectory, "test/fixtures");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "cc-check-integration-"));

try {
  copyFileSync(
    join(fixtureDirectory, "malformed-source.txt"),
    join(temporaryDirectory, "malformed.ts"),
  );
  copyFileSync(
    join(fixtureDirectory, "malformed-contracts.txt"),
    join(temporaryDirectory, "CONTRACTS"),
  );
  copyFileSync(
    join(fixtureDirectory, "malformed-python-source.txt"),
    join(temporaryDirectory, "malformed.py"),
  );
  copyFileSync(
    join(fixtureDirectory, "malformed-python-module.txt"),
    join(temporaryDirectory, "malformed-module.py"),
  );
  copyFileSync(
    join(fixtureDirectory, "malformed-go-source.txt"),
    join(temporaryDirectory, "malformed.go"),
  );
  copyFileSync(
    join(fixtureDirectory, "malformed-rust-source.txt"),
    join(temporaryDirectory, "malformed.rs"),
  );
  copyFileSync(
    join(fixtureDirectory, "malformed-rust-module.txt"),
    join(temporaryDirectory, "malformed-module.rs"),
  );
  copyFileSync(
    join(fixtureDirectory, "duplicate-source-ids.txt"),
    join(temporaryDirectory, "duplicate-source-ids.ts"),
  );
  copyFileSync(
    join(fixtureDirectory, "reused-source-id.txt"),
    join(temporaryDirectory, "reused-source-id.ts"),
  );
  copyFileSync(
    join(fixtureDirectory, "duplicate-go-source-ids.txt"),
    join(temporaryDirectory, "duplicate-source-ids.go"),
  );
  copyFileSync(
    join(fixtureDirectory, "duplicate-rust-source-ids.txt"),
    join(temporaryDirectory, "duplicate-source-ids.rs"),
  );
  const duplicateDirectory = join(temporaryDirectory, "duplicate-directory");
  mkdirSync(duplicateDirectory);
  copyFileSync(
    join(fixtureDirectory, "duplicate-directory-ids.txt"),
    join(duplicateDirectory, "CONTRACTS"),
  );

  const ancestorDirectory = join(temporaryDirectory, "ancestor");
  const ancestorChildDirectory = join(ancestorDirectory, "child");
  mkdirSync(ancestorChildDirectory, { recursive: true });
  copyFileSync(
    join(fixtureDirectory, "ancestor-directory-contract.txt"),
    join(ancestorDirectory, "CONTRACTS"),
  );
  copyFileSync(
    join(fixtureDirectory, "descendant-directory-contract.txt"),
    join(ancestorChildDirectory, "CONTRACTS"),
  );

  const siblingDirectory = join(temporaryDirectory, "siblings");
  const firstSiblingDirectory = join(siblingDirectory, "first");
  const secondSiblingDirectory = join(siblingDirectory, "second");
  mkdirSync(firstSiblingDirectory, { recursive: true });
  mkdirSync(secondSiblingDirectory, { recursive: true });
  copyFileSync(
    join(fixtureDirectory, "sibling-directory-contract.txt"),
    join(firstSiblingDirectory, "CONTRACTS"),
  );
  copyFileSync(
    join(fixtureDirectory, "sibling-directory-contract.txt"),
    join(secondSiblingDirectory, "CONTRACTS"),
  );

  const ignoreDirectory = join(temporaryDirectory, "ignores");
  mkdirSync(join(ignoreDirectory, ".git"), { recursive: true });
  for (const [fixture, target] of [
    ["ignore-directory-contracts.txt", "CONTRACTS"],
    ["ignores-source.txt", "ignores.ts"],
    ["ignores-python.txt", "ignores.py"],
    ["ignores-go.txt", "ignores.go"],
    ["ignores-rust.txt", "ignores.rs"],
    ["invalid-ignores.txt", "invalid-ignores.ts"],
  ]) {
    copyFileSync(
      join(fixtureDirectory, fixture),
      join(ignoreDirectory, target),
    );
  }
  const ignoreContractsDirectory = join(temporaryDirectory, "ignore-contracts");
  mkdirSync(ignoreContractsDirectory);
  copyFileSync(
    join(fixtureDirectory, "ignore-in-contracts.txt"),
    join(ignoreContractsDirectory, "CONTRACTS"),
  );

  const cases = [
    {
      name: "format accepts a compliant directory",
      arguments: ["format"],
      workingDirectory: fixtureDirectory,
      status: 0,
      stdout:
        "CONTRACTS\ncontracts.ts\ngo/contracts.go\nno-contracts.ts\npython/contracts.py\nrust/src/contracts.rs\n",
      stderr: "",
    },
    {
      name: "format rejects malformed source contracts",
      arguments: ["format", "malformed.ts"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: malformed.ts:2:4: error: Contract "missing-prose" has no prose body\n',
    },
    {
      name: "format rejects malformed CONTRACTS files",
      arguments: ["format", "CONTRACTS"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr: "cc-check: CONTRACTS:1:1: error: Invalid @cc directive\n",
    },
    {
      name: "format rejects malformed Python contracts",
      arguments: ["format", "malformed.py"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: malformed.py:3:5: error: Contract "missing-prose" has no prose body\n',
    },
    {
      name: "format rejects malformed Python module docstrings",
      arguments: ["format", "malformed-module.py"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: malformed-module.py:2:1: error: Contract "module-missing-prose" has no prose body\n',
    },
    {
      name: "format rejects malformed Go contracts",
      arguments: ["format", "malformed.go"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: malformed.go:3:4: error: Contract "missing-prose" has no prose body\n',
    },
    {
      name: "format rejects malformed Rust contracts",
      arguments: ["format", "malformed.rs"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: malformed.rs:1:5: error: Contract "missing-prose" has no prose body\n',
    },
    {
      name: "format rejects malformed Rust inner doc comments",
      arguments: ["format", "malformed-module.rs"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: malformed-module.rs:1:5: error: Contract "module-missing-prose" has no prose body\n',
    },
    {
      name: "format rejects duplicate IDs on one declaration",
      arguments: ["format", "duplicate-source-ids.ts"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: duplicate-source-ids.ts:5:1: error: Contract ID "duplicate-source-id" is not unique within its declaration\n',
    },
    {
      name: "format allows an ID on distinct declarations",
      arguments: ["format", "reused-source-id.ts"],
      workingDirectory: temporaryDirectory,
      status: 0,
      stdout: "",
      stderr: "",
    },
    {
      name: "format rejects duplicate Go IDs on one declaration",
      arguments: ["format", "duplicate-source-ids.go"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: duplicate-source-ids.go:7:1: error: Contract ID "duplicate-go-source-id" is not unique within its declaration\n',
    },
    {
      name: "format rejects duplicate Rust IDs on one declaration",
      arguments: ["format", "duplicate-source-ids.rs"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: duplicate-source-ids.rs:5:1: error: Contract ID "duplicate-rust-source-id" is not unique within its declaration\n',
    },
    {
      name: "format rejects duplicate IDs in one CONTRACTS file",
      arguments: ["format", "CONTRACTS"],
      workingDirectory: duplicateDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: CONTRACTS:4:1: error: Contract ID "duplicate-directory-id" is not unique within its CONTRACTS ancestry\n',
    },
    {
      name: "format limits a targeted CONTRACTS file to its own perimeter",
      arguments: ["format", "child/CONTRACTS"],
      workingDirectory: ancestorDirectory,
      status: 0,
      stdout: "",
      stderr: "",
    },
    {
      name: "format rejects duplicate IDs in a CONTRACTS ancestry",
      arguments: ["format"],
      workingDirectory: ancestorDirectory,
      status: 1,
      stdout: "CONTRACTS\nchild/CONTRACTS\n",
      stderr:
        'cc-check: child/CONTRACTS:1:1: error: Contract ID "shared-directory-id" is not unique within its CONTRACTS ancestry\n',
    },
    {
      name: "format allows an ID in sibling CONTRACTS branches",
      arguments: ["format"],
      workingDirectory: siblingDirectory,
      status: 0,
      stdout: "first/CONTRACTS\nsecond/CONTRACTS\n",
      stderr: "",
    },
    {
      name: "format accepts ignores of inherited contracts",
      arguments: ["format", "ignores.ts"],
      workingDirectory: ignoreDirectory,
      status: 0,
      stdout: "",
      stderr: "",
    },
    {
      name: "format accepts Python ignores of class contracts",
      arguments: ["format", "ignores.py"],
      workingDirectory: ignoreDirectory,
      status: 0,
      stdout: "",
      stderr: "",
    },
    {
      name: "format accepts Go ignores of receiver type contracts",
      arguments: ["format", "ignores.go"],
      workingDirectory: ignoreDirectory,
      status: 0,
      stdout: "",
      stderr: "",
    },
    {
      name: "format accepts Rust ignores of directory contracts",
      arguments: ["format", "ignores.rs"],
      workingDirectory: ignoreDirectory,
      status: 0,
      stdout: "",
      stderr: "",
    },
    {
      name: "format rejects unresolved and duplicate ignores",
      arguments: ["format", "invalid-ignores.ts"],
      workingDirectory: ignoreDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: invalid-ignores.ts:1:1: error: Ignore of "missing-rule" does not resolve to an inherited contract\n' +
        'invalid-ignores.ts:11:1: error: Ignore of "own-rule" does not resolve to an inherited contract\n' +
        'invalid-ignores.ts:17:1: error: Ignore of "ignore-directory-rule" does not resolve to an inherited contract\n' +
        'invalid-ignores.ts:27:1: error: Ignore of "ignore-directory-rule" is not unique within its declaration\n',
    },
    {
      name: "format rejects ignores in CONTRACTS files",
      arguments: ["format", "CONTRACTS"],
      workingDirectory: ignoreContractsDirectory,
      status: 1,
      stdout: "",
      stderr:
        "cc-check: CONTRACTS:4:1: error: @cc-ignore is not allowed in CONTRACTS files\n",
    },
    {
      name: "list marks contracts ignored at a source location",
      arguments: ["list", "ignores.ts:14"],
      workingDirectory: ignoreDirectory,
      status: 0,
      stdout: readFileSync(
        join(fixtureDirectory, "ignores-list-location-output.txt"),
        "utf8",
      ),
      stderr: "",
    },
    {
      name: "list prints every contract in a source file",
      arguments: ["list", "--no-global", "test/fixtures/contracts.ts"],
      status: 0,
      stdout: readFileSync(
        join(fixtureDirectory, "list-file-output.txt"),
        "utf8",
      ),
      stderr: "",
    },
    {
      name: "list scopes contracts to a source location",
      arguments: ["list", "--no-global", "test/fixtures/contracts.ts:10"],
      status: 0,
      stdout: readFileSync(
        join(fixtureDirectory, "list-location-output.txt"),
        "utf8",
      ),
      stderr: "",
    },
    {
      name: "list prints nothing when a file has no contracts",
      arguments: ["list", "--no-global", "test/fixtures/no-contracts.ts"],
      status: 0,
      stdout: "",
      stderr: "",
    },
    {
      name: "list prints every contract in a Python file",
      arguments: ["list", "--no-global", "test/fixtures/python/contracts.py"],
      status: 0,
      stdout: readFileSync(
        join(fixtureDirectory, "python/list-file-output.txt"),
        "utf8",
      ),
      stderr: "",
    },
    {
      name: "list scopes Python contracts to a source location",
      arguments: [
        "list",
        "--no-global",
        "test/fixtures/python/contracts.py:11",
      ],
      status: 0,
      stdout: readFileSync(
        join(fixtureDirectory, "python/list-location-output.txt"),
        "utf8",
      ),
      stderr: "",
    },
    {
      name: "list prints every contract in a Go file",
      arguments: ["list", "--no-global", "test/fixtures/go/contracts.go"],
      status: 0,
      stdout: readFileSync(
        join(fixtureDirectory, "go/list-file-output.txt"),
        "utf8",
      ),
      stderr: "",
    },
    {
      name: "list scopes Go contracts to a source location",
      arguments: ["list", "--no-global", "test/fixtures/go/contracts.go:19"],
      status: 0,
      stdout: readFileSync(
        join(fixtureDirectory, "go/list-location-output.txt"),
        "utf8",
      ),
      stderr: "",
    },
    {
      name: "list prints every contract in a Rust file",
      arguments: ["list", "--no-global", "test/fixtures/rust/src/contracts.rs"],
      status: 0,
      stdout: readFileSync(
        join(fixtureDirectory, "rust/list-file-output.txt"),
        "utf8",
      ),
      stderr: "",
    },
    {
      name: "list scopes Rust contracts to a source location",
      arguments: [
        "list",
        "--no-global",
        "test/fixtures/rust/src/contracts.rs:21",
      ],
      status: 0,
      stdout: readFileSync(
        join(fixtureDirectory, "rust/list-location-output.txt"),
        "utf8",
      ),
      stderr: "",
    },
  ];

  for (const testCase of cases) {
    const result = spawnSync(
      process.execPath,
      [cliPath, ...testCase.arguments],
      {
        cwd: testCase.workingDirectory ?? projectDirectory,
        encoding: "utf8",
      },
    );

    assert.equal(result.error, undefined, testCase.name);
    assert.equal(result.signal, null, testCase.name);
    assert.equal(result.status, testCase.status, testCase.name);
    assert.equal(result.stdout, testCase.stdout, testCase.name);
    assert.equal(result.stderr, testCase.stderr, testCase.name);
    console.log(`✓ ${testCase.name}`);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
