// check-requires.js
//
// Finds every  require("./x")  /  require("../x")  under src/ that points to a
// file which doesn't exist — so you can see ALL missing files at once instead
// of fixing them one crash at a time.
//
// Put this file in your `server` folder (next to package.json) and run:
//     node check-requires.js
// (it looks inside ./src; pass another folder as an argument if yours differs)

const fs = require("fs");
const path = require("path");

const root = path.resolve(process.argv[2] || path.join(__dirname, "src"));
const missing = [];

function resolves(fromDir, request) {
  const base = path.resolve(fromDir, request);
  const candidates = [base, base + ".js", base + ".json", path.join(base, "index.js")];
  return candidates.some((c) => fs.existsSync(c) && fs.statSync(c).isFile());
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".js")) scan(full);
  }
}

function scan(file) {
  const src = fs.readFileSync(file, "utf8");
  const re = /require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    // skip commented-out lines
    const lineStart = src.lastIndexOf("\n", m.index) + 1;
    if (/^\s*\/\//.test(src.slice(lineStart, m.index))) continue;
    if (!resolves(path.dirname(file), m[1])) {
      const line = src.slice(0, m.index).split("\n").length;
      missing.push({ file: path.relative(root, file), line, request: m[1] });
    }
  }
}

if (!fs.existsSync(root)) {
  console.error(`Folder not found: ${root}`);
  process.exit(2);
}

walk(root);

if (!missing.length) {
  console.log("✅ Every relative require() resolves to a real file.");
} else {
  console.log(`❌ ${missing.length} missing file(s):\n`);
  for (const x of missing) {
    console.log(`  ${x.file}:${x.line}  needs  ${x.request}`);
  }
  console.log("\nCreate/copy those files at the paths above, then run this again.");
  process.exit(1);
}