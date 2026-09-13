import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const generatedApi = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "api-zod",
  "src",
  "generated",
  "api.ts",
);

const source = await readFile(generatedApi, "utf8");
const forbidden = source.match(
  /\bzod\.(looseObject|strictObject|iso|int|uuid|url|email|guid)\b/g,
);

if (forbidden) {
  console.error(
    `Generated ${path.relative(process.cwd(), generatedApi)} uses Zod 4 APIs that are undefined on catalog Zod 3: ${[...new Set(forbidden)].join(", ")}`,
  );
  console.error(
    "Pin override.zod.version to 3 in orval.config.ts, then regenerate. patch-generated-zod3.mjs is a safety net for looseObject only.",
  );
  process.exit(1);
}

console.log(`Generated Zod schemas stay on Zod 3 APIs (${path.relative(process.cwd(), generatedApi)}).`);
