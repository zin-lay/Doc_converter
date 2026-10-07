/* Pre-flight check: npm run check */
"use strict";
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
let ok = true;
const pass = m => console.log("  \u2714 " + m);
const fail = m => { ok = false; console.log("  \u2718 " + m); };
const note = m => console.log("  \u2022 " + m);
console.log("\nNexora Document \u2192 Image Converter \u2014 setup check\n");

const [maj, min] = process.versions.node.split(".").map(Number);
(maj > 18 || (maj === 18 && min >= 17)) ? pass(`Node.js ${process.versions.node}`) : fail(`Node.js ${process.versions.node} is too old. Install Node.js 20 LTS or newer.`);
fs.existsSync(path.join(root, "node_modules", "jszip")) ? pass("npm packages installed") : fail("Missing packages. Run: npm install");

function has(cmd, args) {
  return new Promise(r => { try { const c = spawn(cmd, args); c.on("error", () => r(false)); c.on("close", () => r(true)); setTimeout(() => { try { c.kill("SIGKILL"); } catch {} r(false); }, 8000); } catch { r(false); } });
}
(async () => {
  const poppler = await has("pdftoppm", ["-v"]);
  poppler ? pass("Poppler (pdftoppm) \u2014 PDF conversion ready") : fail("Poppler not found. Install it:  sudo apt install poppler-utils");
  const lo = await has(process.env.SOFFICE_BIN || "soffice", ["--version"]);
  lo ? pass("LibreOffice \u2014 Word & PowerPoint conversion ready") : note("LibreOffice not found. PDF will work; for Word/PowerPoint install it:  sudo apt install libreoffice");
  console.log(ok ? "\nReady. Start the app with:  npm start\n" : "\nFix the items marked \u2718, then run this check again.\n");
  process.exit(ok ? 0 : 1);
})();
