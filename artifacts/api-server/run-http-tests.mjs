import { spawn } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const libDir = path.join(artifactDir, "src", "lib");
const outputDir = path.join(artifactDir, ".test-dist");

const entries = (await readdir(libDir))
  .filter((name) => name.endsWith(".http-test.ts"))
  .sort();

if (entries.length === 0) {
  throw new Error("No HTTP tests found in src/lib/*.http-test.ts");
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

try {
  let failed = false;
  for (const entry of entries) {
    const outputFile = path.join(outputDir, entry.replace(/\.ts$/, ".mjs"));
    await build({
      absWorkingDir: artifactDir,
      entryPoints: [path.join("src", "lib", entry)],
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

    if (exitCode !== 0) failed = true;
  }
  if (failed) process.exitCode = 1;
} finally {
  await rm(outputDir, { recursive: true, force: true });
}
