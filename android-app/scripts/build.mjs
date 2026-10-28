// Assembles www/: the startup page, plus the Node project (bundled server, built web app, seed data).
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const wavely = path.resolve(root, "..");
const www = path.join(root, "www");
const nodeDir = path.join(www, "nodejs");

execSync("npm run build -w web", { cwd: wavely, stdio: "inherit" });

rmSync(www, { recursive: true, force: true });
mkdirSync(nodeDir, { recursive: true });
cpSync(path.join(root, "loader/index.html"), path.join(www, "index.html"));
cpSync(path.join(wavely, "web/dist"), path.join(nodeDir, "web"), { recursive: true });
cpSync(path.join(wavely, "server/data"), path.join(nodeDir, "data"), { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  nodePaths: [path.join(wavely, "node_modules"), path.join(root, "node_modules")],
  logLevel: "info",
};
await build({
  ...common,
  entryPoints: [path.join(root, "node/main.cjs")],
  outfile: path.join(nodeDir, "index.js"),
  external: ["bridge", "./server.js"],
});
await build({
  ...common,
  entryPoints: [path.join(root, "node/server.cjs")],
  outfile: path.join(nodeDir, "server.js"),
  define: { "import.meta.dirname": "__dirname" },
});
expandUnicodeProperties(path.join(nodeDir, "server.js"));
writeFileSync(path.join(nodeDir, "package.json"), JSON.stringify({ name: "wavely-node", main: "index.js" }));

/** nodejs-mobile has no ICU, so regex property escapes like \p{L} are syntax errors there.
 *  Swap each one (they all sit inside [...] classes) for the code point ranges it matches,
 *  computed with this machine's full-ICU Node. */
function expandUnicodeProperties(file) {
  const ranges = new Map();
  const expand = (name) => {
    if (!ranges.has(name)) {
      const re = new RegExp(`\\p{${name}}`, "u");
      const hex = (cp) => `\\u{${cp.toString(16)}}`;
      let out = "";
      for (let cp = 0, start = -1; cp <= 0x110000; cp++) {
        const hit = cp < 0x110000 && !(cp >= 0xd800 && cp <= 0xdfff) && re.test(String.fromCodePoint(cp));
        if (hit && start < 0) start = cp;
        if (!hit && start >= 0) {
          out += start === cp - 1 ? hex(start) : `${hex(start)}-${hex(cp - 1)}`;
          start = -1;
        }
      }
      ranges.set(name, out);
    }
    return ranges.get(name);
  };
  // A single backslash marks a regex literal; escaped "\\p{" inside strings is left alone.
  const pattern = /(?<!\\)\\p\{(\w+)\}/g;
  const lines = readFileSync(file, "utf8").split("\n");
  for (const [i, line] of lines.entries()) {
    if (!pattern.test(line)) continue;
    if (!/\/[^/]*\[[^\]]*\\p\{/.test(line)) throw new Error(`\\p{} outside a character class at ${file}:${i + 1}`);
    lines[i] = line.replace(pattern, (_m, name) => expand(name));
  }
  writeFileSync(file, lines.join("\n"));
}
