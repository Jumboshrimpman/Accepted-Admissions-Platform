/**
 * Assign Michelle's two SAT Practice Test 6 math modules.
 * Startup runs the same function. Safe to run twice.
 *
 *   node --experimental-strip-types src/scripts/seed-michelle-t6-math.ts --dry-run
 *   node --experimental-strip-types src/scripts/seed-michelle-t6-math.ts
 */
import { ensureMichelleT6MathModules } from "../lib/t6-math-modules.ts";

const dryRun = process.argv.includes("--dry-run");
const result = await ensureMichelleT6MathModules({ dryRun });
console.log(JSON.stringify(result, null, 2));
process.exit(0);
