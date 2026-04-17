#!/usr/bin/env node

import { run } from '../src/index.js';

run().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
