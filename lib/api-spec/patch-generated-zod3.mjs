import { readFileSync, writeFileSync } from "node:fs";
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

/**
 * Orval 8 emits Zod 4-only helpers such as `zod.looseObject`.
 * This workspace stays on Zod 3, where those helpers are undefined and
 * crash API startup at module load. Rewrite to Zod-3-safe equivalents.
 */
export function rewriteZod4Helpers(source) {
  const needle = "zod.looseObject(";
  let output = "";
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf(needle, cursor);
    if (start === -1) {
      output += source.slice(cursor);
      break;
    }

    output += `${source.slice(cursor, start)}zod.object`;
    const openParen = start + needle.length - 1;
    let depth = 0;
    let end = openParen;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (char === "(") depth += 1;
      else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          end += 1;
          break;
        }
      }
    }
    if (depth !== 0) {
      throw new Error("Unbalanced zod.looseObject(...) in generated Zod client");
    }
    output += `${source.slice(openParen, end)}.passthrough()`;
    cursor = end;
  }

  if (/\blooseObject\b/.test(output)) {
    throw new Error("Generated Zod client still contains looseObject after Zod 3 rewrite");
  }
  return output;
}

export function patchGeneratedZodClient(filePath = generatedApi) {
  const source = readFileSync(filePath, "utf8");
  const rewritten = rewriteZod4Helpers(source);
  if (rewritten !== source) {
    writeFileSync(filePath, rewritten);
    console.log(`Patched Zod 4 helpers in ${path.relative(process.cwd(), filePath)}`);
  }
  return rewritten;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  patchGeneratedZodClient();
}
