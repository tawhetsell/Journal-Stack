// Runs export-fixtures.ts with Node's built-in TypeScript support. The hooks give Node the
// two things Next.js does for the app's code: the "@/..." import prefix, and importing JSON.
import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

// Dates without a time zone are read in the machine's own, so fix one for repeatable output.
process.env.TZ = "UTC";

const root = new URL("../", import.meta.url);
const isFile = (path) => existsSync(path) && statSync(path).isFile();

// The app's .ts files are ES modules; saying so saves Node from guessing, with a warning.
const asAppModule = (result) =>
  result.url.startsWith(root.href) && result.url.endsWith(".ts") && !result.url.includes("/node_modules/")
    ? { ...result, format: "module-typescript" }
    : result;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) {
      return asAppModule(nextResolve(specifier, context));
    }

    const path = fileURLToPath(new URL(specifier.slice(2), root));
    const found = [path, `${path}.ts`, `${path}.tsx`].find(isFile);

    if (!found) {
      throw new Error(`Cannot find ${specifier}`);
    }

    return asAppModule({ url: pathToFileURL(found).href, shortCircuit: true });
  },
  load(url, context, nextLoad) {
    if (url.startsWith(root.href) && url.endsWith(".json") && !url.includes("/node_modules/")) {
      const json = readFileSync(fileURLToPath(url), "utf8");
      return { format: "module", source: `export default ${json};`, shortCircuit: true };
    }

    return nextLoad(url, context);
  },
});

await import("./export-fixtures.ts");
