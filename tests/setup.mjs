/**
 * Compiles the camera + input modules to plain JS for the jsdom tests,
 * then runs every *.mjs test file in this folder.
 *
 *   npm run test:camera
 */
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";

const root = new URL("..", import.meta.url).pathname;
const out = `${root}.test-build`;

rmSync(out, { recursive: true, force: true });
execFileSync(
  "npx",
  [
    "tsc",
    "src/camera.ts",
    "src/input.ts",
    "src/ui/settings.ts",
    "src/game/movement.ts",
    "src/player.ts",
    "node_modules/@types/three/index.d.ts",
    "--outDir",
    out,
    "--module",
    "es2022",
    "--moduleResolution",
    "bundler",
    "--target",
    "es2020",
    "--skipLibCheck",
    "--allowImportingTsExtensions",
    "false",
  ],
  { cwd: root, stdio: "inherit" }
);

// node needs explicit .js extensions on relative imports of the compiled files
execFileSync("node", [`${root}tests/rewrite-imports.mjs`, out], { cwd: root, stdio: "inherit" });

const files = readdirSync(new URL(".", import.meta.url))
  .filter((f) => f.endsWith(".mjs") && f !== "setup.mjs" && f !== "rewrite-imports.mjs")
  .sort();

let failed = 0;
for (const file of files) {
  console.log(`\n── ${file} ─────────────────────────────`);
  try {
    execFileSync("node", [`${root}tests/${file}`], { cwd: root, stdio: "inherit" });
  } catch {
    failed++;
  }
}

rmSync(out, { recursive: true, force: true });
if (failed) {
  console.error(`\n${failed} test file(s) failed`);
  process.exit(1);
}
console.log("\nall camera tests passed");
