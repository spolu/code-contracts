import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(projectDirectory, "dist/cc-check.js");

const cases = [
  {
    name: "check accepts a compliant directory",
    arguments: ["check"],
    workingDirectory: join(projectDirectory, "test/fixtures"),
    status: 0,
    stdout: "",
    stderr: "",
  },
  {
    name: "list prints every contract in a source file",
    arguments: ["list", "--no-global", "test/fixtures/contracts.ts"],
    status: 0,
    stdout: `=> test/fixtures/contracts.ts <=

◆ invoice-fixture:1
  scope:declaration class \`Invoice\` · author:spolu · label:product

  > Represents an invoice used by the CLI integration tests.

◆ invoice-payment-fixture:6
  scope:declaration method \`pay\` · author:spolu · label:product

  > Provides a method used to exercise nested contract listing.
`,
    stderr: "",
  },
];

for (const testCase of cases) {
  const result = spawnSync(process.execPath, [cliPath, ...testCase.arguments], {
    cwd: testCase.workingDirectory ?? projectDirectory,
    encoding: "utf8",
  });

  assert.equal(result.error, undefined, testCase.name);
  assert.equal(result.signal, null, testCase.name);
  assert.equal(result.status, testCase.status, testCase.name);
  assert.equal(result.stdout, testCase.stdout, testCase.name);
  assert.equal(result.stderr, testCase.stderr, testCase.name);
  console.log(`✓ ${testCase.name}`);
}
