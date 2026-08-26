#!/usr/bin/env node

import { createProgram } from "./cli.js";

await createProgram().parseAsync(process.argv);
