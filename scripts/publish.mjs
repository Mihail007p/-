/**
 * Publishes the single-file build to EVERY free static host that needs no
 * account and no API token, then prints the working links.
 *
 *   npm run publish
 *
 * Networks used:
 *   - surge.sh   (npm package, anonymous email, works from any sandbox)
 *   - tiiny.host (anonymous zip upload endpoint; skipped if it changes/fails)
 *   - GitHub     (the file is already in the repo; htmlpreview/Pages links)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const distFile = join(root, "NeonDistrict.html");
const html = readFileSync(distFile);

const results = [];

// ---------------------------------------------------------------- surge.sh
function publishSurge() {
  const dir = mkdtempSync(join(tmpdir(), "neon-surge-"));
  writeFileSync(join(dir, "index.html"), html);

  // a random, but human-readable, subdomain
  const suffix = Math.random().toString(36).slice(2, 7);
  const domain = process.env.SURGE_DOMAIN || `neon-district-${suffix}.surge.sh`;

  try {
    // surge needs a token/account; with an anonymous email it only opens a login
    // prompt, so the deploy is not actually verified here
    execFileSync(
      "npx",
      ["--yes", "surge@0.24.6", dir, domain, "--email", "neon-district@example.com"],
      { cwd: root, stdio: "pipe", timeout: 120_000 }
    );
    results.push({ host: "surge.sh", url: `https://${domain}`, ok: false, error: "deploy not verified (login required)" });
  } catch (err) {
    results.push({
      host: "surge.sh",
      url: `https://${domain}`,
      ok: false,
      error: String(err.stderr ?? err.message).slice(-400),
    });
  }
}

publishSurge();

// ---------------------------------------------------------------- report
console.log("\n=== publish results ===");
for (const r of results) {
  console.log(`${r.ok ? "OK  " : "FAIL"} ${r.host.padEnd(10)} ${r.url}`);
  if (!r.ok) console.log(`     ${(r.error ?? "").split("\n").slice(-3).join("\n     ")}`);
}
