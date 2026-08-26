#!/usr/bin/env node

import { createProgram } from "./cli.js";

try {
  await createProgram().parseAsync(process.argv);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`cc-check: ${message}`);
  process.exitCode = 1;
}
