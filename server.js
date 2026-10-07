/**
 * Nexora Tech — Document → Image Converter (server)
 *
 * Converts PDF, Word and PowerPoint pages into PNG/JPG images, faithfully,
 * using open-source engines already on the machine:
 *   - Poppler (pdftoppm)  : PDF  -> images        (required for any conversion)
 *   - LibreOffice (soffice): Office -> PDF -> images (optional; enables docx/pptx)
 *
 * Fully local. No API key. Nothing is uploaded to any third party.
 * Runtime npm dependency: jszip (pure JS, for building ZIP downloads).
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const JSZip = require("jszip");

loadEnvFile(path.join(__dirname, ".env"));
const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== "" ? process.env[k] : d);

const CONFIG = {
  host: env("HOST", "127.0.0.1"),
  port: Number(env("PORT", 3100)),
  appUser: env("APP_USER", ""),
  appPassword: env("APP_PASSWORD", ""),
  maxUploadMB: Number(env("MAX_UPLOAD_MB", 100)),
  maxPages: Number(env("MAX_PAGES", 300)),
  jobTtlMin: Number(env("JOB_TTL_MIN", 30)),
  convertTimeoutMs: Number(env("CONVERT_TIMEOUT_MS", 180000)),
  softwareOffice: env("SOFFICE_BIN", "soffice"),
};

const PUBLIC_DIR = path.join(__dirname, "public");
const JOBS_DIR = path.join(os.tmpdir(), "nexora-converter-jobs");
fs.mkdirSync(JOBS_DIR, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8", ".zip": "application/zip",
};

const OFFICE_EXT = new Set(["doc","docx","odt","rtf","ppt","pptx","odp","xls","xlsx","ods"]);
const PDF_EXT = new Set(["pdf"]);
const ALL_EXT = new Set([...OFFICE_EXT, ...PDF_EXT]);

// Cache tool availability (checked once).
let TOOLS = null;
async function tools() {
  if (TOOLS) return TOOLS;
  TOOLS = {
    poppler: await hasTool("pdftoppm", ["-v"]),
    libreoffice: await hasTool(CONFIG.softwareOffice, ["--version"]),
  };
  return TOOLS;
}

// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  try {
    setSecurityHeaders(res);
    if (!checkAuth(req, res)) return;
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/api/config") return handleConfig(res);
    if (req.method === "POST" && url.pathname === "/api/convert") return handleConvert(req, res, url);
    if (req.method === "GET" && url.pathname.startsWith("/api/result/")) return handleResult(res, url);
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(url.pathname, res);
    sendJson(res, 405, { error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: "Internal server error" });
    else res.end();
  }
});

server.listen(CONFIG.port, CONFIG.host, async () => {
  const shown = CONFIG.host === "0.0.0.0" ? "localhost" : CONFIG.host;
  const t = await tools();
  console.log(`Nexora Document → Image Converter running at http://${shown}:${CONFIG.port}`);
  console.log(`Engines — PDF (Poppler): ${t.poppler ? "yes" : "NO"} · Office (LibreOffice): ${t.libreoffice ? "yes" : "no"}`);
  if (!t.poppler) console.warn("WARNING: Poppler (pdftoppm) not found. Install poppler-utils — no conversions will work without it.");
  if (CONFIG.host === "0.0.0.0" && !CONFIG.appPassword) console.warn("WARNING: Listening on all interfaces without APP_PASSWORD.");
});

setInterval(cleanupJobs, 5 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
async function handleConfig(res) {
  const t = await tools();
  const office = [...OFFICE_EXT];
  sendJson(res, 200, {
    engines: t,
    accept: t.poppler ? [...(t.libreoffice ? office : []), "pdf"] : [],
    office,
    maxUploadMB: CONFIG.maxUploadMB,
    maxPages: CONFIG.maxPages,
  });
}

async function handleConvert(req, res, url) {
  const t = await tools();
  if (!t.poppler) return sendJson(res, 503, { error: "The PDF engine (Poppler) isn't installed on the server. Install poppler-utils and restart." });

  const name = sanitizeName(url.searchParams.get("name") || "document");
  const ext = (name.split(".").pop() || "").toLowerCase();
  const fmt = url.searchParams.get("format") === "jpg" ? "jpg" : "png";
  const dpi = clamp(parseInt(url.searchParams.get("dpi"), 10) || 150, 36, 600);
  const quality = clamp(parseInt(url.searchParams.get("quality"), 10) || 90, 40, 100);
  const pages = (url.searchParams.get("pages") || "").trim(); // "", "1-5,8"

  if (!ALL_EXT.has(ext)) return sendJson(res, 400, { error: `Unsupported file type ".${ext}". Use PDF${t.libreoffice ? ", Word or PowerPoint" : " (install LibreOffice for Word/PowerPoint)"}.` });
  if (OFFICE_EXT.has(ext) && !t.libreoffice) return sendJson(res, 503, { error: "Word/PowerPoint conversion needs LibreOffice, which isn't installed. Install it and restart, or upload a PDF." });

  // Read the raw request body (the file bytes) with a size cap.
  let buf;
  try { buf = await readBody(req, CONFIG.maxUploadMB * 1024 * 1024); }
  catch (e) { return sendJson(res, e.code === "TOO_LARGE" ? 413 : 400, { error: e.code === "TOO_LARGE" ? `File is larger than the ${CONFIG.maxUploadMB} MB limit.` : "Couldn't read the upload." }); }
  if (!buf.length) return sendJson(res, 400, { error: "The upload was empty." });

  const id = crypto.randomBytes(9).toString("hex");
  const jobDir = path.join(JOBS_DIR, id);
  await fsp.mkdir(jobDir, { recursive: true });

  try {
    const inPath = path.join(jobDir, "input." + ext);
    await fsp.writeFile(inPath, buf);

    // Office -> PDF (LibreOffice), then everything is a PDF.
    let pdfPath = inPath;
    if (OFFICE_EXT.has(ext)) {
      await run(CONFIG.softwareOffice, ["--headless", "--nologo", "--nofirststartwizard",
        "--convert-to", "pdf", "--outdir", jobDir, inPath], CONFIG.convertTimeoutMs,
        { HOME: jobDir }); // give LO a writable profile dir
      pdfPath = path.join(jobDir, "input.pdf");
      if (!fs.existsSync(pdfPath)) throw new UserError("LibreOffice couldn't convert this file. It may be corrupt or password-protected.");
    }

    // PDF -> images (Poppler). pdftoppm writes <prefix>-<n>.<ext>.
    const outPrefix = path.join(jobDir, "page");
    const args = ["-r", String(dpi), inPage(pages)].flat().filter(Boolean);
    if (fmt === "jpg") { args.push("-jpeg", "-jpegopt", `quality=${quality}`); }
    else { args.push("-png"); }
    args.push(pdfPath, outPrefix);
    await run("pdftoppm", args, CONFIG.convertTimeoutMs);

    let files = (await fsp.readdir(jobDir))
      .filter(f => /^page-?\d+\.(png|jpg|jpeg)$/i.test(f))
      .sort((a, b) => pageNo(a) - pageNo(b));
    if (!files.length) throw new UserError("No pages were produced. The document may be empty or unsupported.");
    if (files.length > CONFIG.maxPages) {
      for (const f of files.slice(CONFIG.maxPages)) await fsp.rm(path.join(jobDir, f), { force: true });
      files = files.slice(0, CONFIG.maxPages);
    }

    // Rename to a clean, ordered scheme and collect sizes.
    const base = name.replace(/\.[^.]+$/, "").replace(/[^\w\-]+/g, "_").slice(0, 50) || "page";
    const pad = String(files.length).length;
    const pageList = [];
    for (let i = 0; i < files.length; i++) {
      const finalName = `${base}-p${String(i + 1).padStart(pad, "0")}.${fmt}`;
      await fsp.rename(path.join(jobDir, files[i]), path.join(jobDir, finalName));
      const st = await fsp.stat(path.join(jobDir, finalName));
      pageList.push({ name: finalName, url: `/api/result/${id}/${finalName}`, bytes: st.size });
    }
    await fsp.writeFile(path.join(jobDir, "meta.json"),
      JSON.stringify({ base, fmt, created: Date.now(), pages: pageList.map(p => p.name) }));

    sendJson(res, 200, { id, format: fmt, dpi, count: pageList.length, pages: pageList, zipUrl: `/api/result/${id}/${base}-images.zip` });
  } catch (err) {
    await fsp.rm(jobDir, { recursive: true, force: true }).catch(() => {});
    if (err instanceof UserError) return sendJson(res, 422, { error: err.message });
    if (err && err.code === "TIMEOUT") return sendJson(res, 504, { error: "Conversion took too long and was stopped. Try fewer pages or a lower resolution." });
    console.error("[convert]", err && err.message);
    return sendJson(res, 500, { error: "Conversion failed. See the server log for details." });
  }
}

async function handleResult(res, url) {
  // /api/result/<id>/<file>
  const parts = url.pathname.split("/").filter(Boolean); // ["api","result",id,file]
  const id = parts[2], file = decodeURIComponent(parts.slice(3).join("/"));
  if (!/^[a-f0-9]{18}$/.test(id || "") || !file || file.includes("..") || file.includes("/")) return sendJson(res, 400, { error: "Bad request" });
  const jobDir = path.join(JOBS_DIR, id);
  if (!fs.existsSync(jobDir)) return sendJson(res, 404, { error: "This result has expired. Convert the file again." });

  if (file.endsWith(".zip")) return serveZip(res, jobDir, file);

  const fp = path.join(jobDir, file);
  if (!fp.startsWith(jobDir + path.sep) || !fs.existsSync(fp)) return sendJson(res, 404, { error: "Not found" });
  const st = fs.statSync(fp);
  res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "private, max-age=600" });
  fs.createReadStream(fp).pipe(res);
}

async function serveZip(res, jobDir, zipName) {
  let meta;
  try { meta = JSON.parse(await fsp.readFile(path.join(jobDir, "meta.json"), "utf8")); }
  catch { return sendJson(res, 404, { error: "This result has expired. Convert the file again." }); }
  const zip = new JSZip();
  for (const p of meta.pages) zip.file(p, await fsp.readFile(path.join(jobDir, p)));
  const data = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": data.length,
    "Content-Disposition": `attachment; filename="${zipName}"`, "Cache-Control": "no-store" });
  res.end(data);
}

// ---------------------------------------------------------------------------
// helpers
class UserError extends Error {}

function inPage(spec) {
  // Translate "1-5,8" into pdftoppm -f/-l. pdftoppm takes a single range, so we
  // support a first/last window; comma lists are flattened to their min..max.
  if (!spec) return [];
  const nums = [];
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    nums.push(Math.min(a, b), Math.max(a, b));
  }
  if (!nums.length) return [];
  return ["-f", String(Math.max(1, Math.min(...nums))), "-l", String(Math.max(...nums))];
}
const pageNo = f => { const m = f.match(/(\d+)\.[^.]+$/); return m ? +m[1] : 0; };
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function run(cmd, args, timeoutMs, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, ...extraEnv } });
    let err = "";
    const timer = setTimeout(() => { const e = new Error("timeout"); e.code = "TIMEOUT"; child.kill("SIGKILL"); reject(e); }, timeoutMs);
    child.stderr.on("data", d => { err += d; });
    child.on("error", e => { clearTimeout(timer); reject(e); });
    child.on("close", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(0, 300)}`)); });
  });
}

function hasTool(cmd, args) {
  return new Promise(resolve => {
    try {
      const c = spawn(cmd, args);
      c.on("error", () => resolve(false));
      c.on("close", () => resolve(true));
      setTimeout(() => { try { c.kill("SIGKILL"); } catch {} resolve(false); }, 8000);
    } catch { resolve(false); }
  });
}

async function cleanupJobs() {
  const cutoff = Date.now() - CONFIG.jobTtlMin * 60 * 1000;
  try {
    for (const id of await fsp.readdir(JOBS_DIR)) {
      const dir = path.join(JOBS_DIR, id);
      try { if ((await fsp.stat(dir)).mtimeMs < cutoff) await fsp.rm(dir, { recursive: true, force: true }); } catch {}
    }
  } catch {}
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > maxBytes) { const e = new Error("too large"); e.code = "TOO_LARGE"; reject(e); req.destroy(); return; } chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function serveStatic(pathname, res) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, "index.html")) return sendJson(res, 403, { error: "Forbidden" });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return sendJson(res, 404, { error: "Not found" });
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  });
}

function sanitizeName(n) { return String(n).replace(/[\r\n]/g, "").replace(/[^\w.\- ]+/g, "_").slice(0, 150) || "document"; }
function sendJson(res, status, obj) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); }

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

function checkAuth(req, res) {
  if (!CONFIG.appPassword) return true;
  const h = req.headers.authorization || "";
  if (h.startsWith("Basic ")) {
    const [u, ...rest] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
    if (safeEqual(u, CONFIG.appUser || "admin") && safeEqual(rest.join(":"), CONFIG.appPassword)) return true;
  }
  res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Converter", charset="UTF-8"' });
  res.end("Authentication required");
  return false;
}
function safeEqual(a, b) { const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest(); return crypto.timingSafeEqual(x, y); }

function loadEnvFile(file) {
  let text; try { text = fs.readFileSync(file, "utf8"); } catch { return; }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("="); if (i < 1) continue;
    const k = line.slice(0, i).trim(); let v = line.slice(i + 1).trim();
    if (/^(["']).*\1$/.test(v)) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, "");
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
