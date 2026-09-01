import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(artifactDir, ".test-dist");
const outputFile = path.join(outputDir, "dashboard-role-flows.http-test.mjs");

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

try {
  await build({
    absWorkingDir: artifactDir,
    entryPoints: ["src/lib/dashboard-role-flows.http-test.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile: outputFile,
    logLevel: "warning",
    banner: {
      js: `import { createRequire as __createRequire } from "node:module";
globalThis.require = __createRequire(import.meta.url);`,
    },
  });

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--test", outputFile], {
      cwd: artifactDir,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`HTTP test process exited with signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });

  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await rm(outputDir, { recursive: true, force: true });
}