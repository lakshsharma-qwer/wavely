// Entry point for the Node.js runtime embedded in the Android app.
// Prepares a writable data folder and fills the gaps of nodejs-mobile (Node 18 built
// without ICU), then starts the Wavely server on 127.0.0.1 so only this device can reach it.
const { copyFileSync, existsSync, mkdirSync } = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { getDataPath } = require("bridge");

const PORT = 4000;
const HOST = "127.0.0.1";

// The bundled project folder is replaced on every app update, so graphs live in app data.
const dataDir = path.join(getDataPath(), "wavely-data");
mkdirSync(dataDir, { recursive: true });
for (const file of ["catalog.json", "coplay.json"]) {
  const target = path.join(dataDir, file);
  const seed = path.join(__dirname, "data", file);
  if (!existsSync(target) && existsSync(seed)) copyFileSync(seed, target);
}

process.env.DATA_DIR = dataDir;
process.env.WEB_DIST = path.join(__dirname, "web");
process.env.HOST = HOST;
process.env.PORT = String(PORT);

// Node 18 has no global WebSocket.
globalThis.WebSocket ??= require("ws").WebSocket;

// Without ICU, normalize() returns its input unchanged, which breaks accent folding.
if ("é".normalize("NFD").length === 1) {
  const unorm = require("unorm");
  const forms = { NFC: unorm.nfc, NFD: unorm.nfd, NFKC: unorm.nfkc, NFKD: unorm.nfkd };
  String.prototype.normalize = function normalize(form = "NFC") {
    const fn = forms[String(form)];
    if (!fn) throw new RangeError(`The normalization form should be one of NFC, NFD, NFKC, NFKD.`);
    return fn(String(this));
  };
}

// An uncaught error would take the whole app down with Node; log it and keep running.
process.on("uncaughtException", (err) => console.error("[wavely] uncaught", err));
process.on("unhandledRejection", (err) => console.error("[wavely] unhandled rejection", err));

try {
  require("./server.js");
} catch (err) {
  // Show the failure in the app instead of leaving it on the startup screen.
  console.error("[wavely] server failed to start", err);
  const body = `<!doctype html><meta name="viewport" content="width=device-width">
<body style="background:#17110E;color:#F3E9DF;font-family:system-ui;padding:24px">
<h2>Wavely couldn't start</h2><pre style="white-space:pre-wrap;font-size:12px;opacity:.8">${String(err?.stack ?? err).replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}</pre>`;
  http
    .createServer((_req, res) => res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(body))
    .listen(PORT, HOST);
}
