import { inspectDesktop, desktopFailures } from './desktop-readiness.mjs';

const inventory = inspectDesktop();
const missing = desktopFailures(inventory);
console.log(JSON.stringify({ ...inventory, ready: missing.length === 0, missing }, null, 2));
if (missing.length) process.exitCode = 1;
