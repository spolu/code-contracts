import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(projectDirectory, "dist/cc-check.js");
const fixtureDirectory = join(projectDirectory, "test/fixtures");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "cc-check-integration-"));
const rustAnalyzerAvailable =
  spawnSync("rust-analyzer", ["--version"], { stdio: "ignore" }).status === 0;
const goplsAvailable =
  spawnSync("gopls", ["version"], { stdio: "ignore" }).status === 0;

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

  const cases = [
    {
      name: "check accepts a compliant directory",
      arguments: ["check"],
      workingDirectory: fixtureDirectory,
      status: 0,
      stdout: "",
      stderr: "",
    },
    {
      name: "check rejects malformed source contracts",
      arguments: ["check", "malformed.ts"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: malformed.ts:2:4: error: Contract "missing-prose" has no prose body\n',
    },
    {
      name: "check rejects malformed CONTRACTS files",
      arguments: ["check", "CONTRACTS"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr: "cc-check: CONTRACTS:1:1: error: Invalid @cc directive\n",
    },
    {
      name: "check rejects malformed Python contracts",
      arguments: ["check", "malformed.py"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: malformed.py:3:5: error: Contract "missing-prose" has no prose body\n',
    },
    {
      name: "check validates Python module docstrings",
      arguments: ["check", "malformed-module.py"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: malformed-module.py:2:1: error: Contract "module-missing-prose" has no prose body\n',
    },
    {
      name: "check rejects malformed Go contracts",
      arguments: ["check", "malformed.go"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: malformed.go:3:4: error: Contract "missing-prose" has no prose body\n',
    },
    {
      name: "check rejects malformed Rust contracts",
      arguments: ["check", "malformed.rs"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: malformed.rs:1:5: error: Contract "missing-prose" has no prose body\n',
    },
    {
      name: "check validates Rust inner doc comments",
      arguments: ["check", "malformed-module.rs"],
      workingDirectory: temporaryDirectory,
      status: 1,
      stdout: "",
      stderr:
        'cc-check: malformed-module.rs:1:5: error: Contract "module-missing-prose" has no prose body\n',
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
    {
      name: "callers queries Python through Pyright",
      arguments: ["callers", "test/fixtures/python/library.py:1"],
      status: 0,
      stdout: "test/fixtures/python/usage.py:5:12\tcaller\n",
      stderr: "",
    },
    {
      name: "references queries Python through Pyright",
      arguments: ["references", "test/fixtures/python/library.py:1"],
      status: 0,
      stdout:
        "test/fixtures/python/usage.py:1:21\ntest/fixtures/python/usage.py:5:12\n",
      stderr: "",
    },
    ...(rustAnalyzerAvailable
      ? [
          {
            name: "callers queries Rust through rust-analyzer",
            arguments: ["callers", "test/fixtures/rust/src/library.rs:1"],
            status: 0,
            stdout: "test/fixtures/rust/src/lib.rs:6:5\tcaller\n",
            stderr: "",
          },
          {
            name: "references queries Rust through rust-analyzer",
            arguments: ["references", "test/fixtures/rust/src/library.rs:1"],
            status: 0,
            stdout:
              "test/fixtures/rust/src/lib.rs:3:18\ntest/fixtures/rust/src/lib.rs:6:5\n",
            stderr: "",
          },
        ]
      : []),
    ...(goplsAvailable
      ? [
          {
            name: "callers queries Go through gopls",
            arguments: ["callers", "test/fixtures/go/library.go:3"],
            status: 0,
            stdout: "test/fixtures/go/usage.go:4:9\tcaller\n",
            stderr: "",
          },
          {
            name: "references queries Go through gopls",
            arguments: ["references", "test/fixtures/go/library.go:3"],
            status: 0,
            stdout: "test/fixtures/go/usage.go:4:9\n",
            stderr: "",
          },
        ]
      : []),
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
