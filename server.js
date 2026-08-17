const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

loadEnvFile();

const handler = require("./api/app");

const root = __dirname;
const port = Number(process.env.PORT || 4280);
const host = process.env.HOST || "0.0.0.0";
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const blockedPrefixes = [
  `${path.sep}api${path.sep}`,
  `${path.sep}data${path.sep}`,
  `${path.sep}lib${path.sep}`,
];

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getLanUrls() {
  const interfaces = os.networkInterfaces();
  const lanUrls = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }

      lanUrls.push(`http://${entry.address}:${port}`);
    }
  }

  return Array.from(new Set(lanUrls));
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://127.0.0.1:${port}`);

    if (requestUrl.pathname.startsWith("/api/")) {
      await handler(req, res);
      return;
    }

    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname === "/") {
      pathname = "/index.html";
    }

    const fullPath = path.normalize(path.join(root, pathname));
    if (!fullPath.startsWith(path.normalize(root))) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    const relativePath = path.relative(root, fullPath);
    const normalized = `${path.sep}${relativePath}`;
    const ext = path.extname(fullPath).toLowerCase();
    const blocked = blockedPrefixes.some((prefix) => normalized.includes(prefix));

    if (
      blocked ||
      relativePath.startsWith(".") ||
      path.basename(fullPath).startsWith(".") ||
      !mimeTypes[ext]
    ) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const data = await fsp.readFile(fullPath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, host, () => {
  const loopbackUrl = `http://127.0.0.1:${port}`;
  const lanUrls = getLanUrls();
  console.log(`Kiavik Prints MVP running on ${loopbackUrl}`);

  if (host === "0.0.0.0" || host === "::") {
    for (const lanUrl of lanUrls) {
      console.log(`LAN access: ${lanUrl}`);
    }
  }
});
