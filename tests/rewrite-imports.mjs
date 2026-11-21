// rewrite extension-less relative imports in the compiled test build
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
const root = process.argv[2];
function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith(".js")) {
      let s = readFileSync(p, "utf8");
      s = s.replace(/from "(\.{1,2}\/[^"]+)"/g, (m, spec) => (spec.endsWith('.js') ? m : 'from "' + spec + '.js"'));
      writeFileSync(p, s);
    }
  }
}
walk(root);
