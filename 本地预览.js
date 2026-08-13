/* 本地预览 —— 在你自己电脑上开一个跟 choeyy88.com 一模一样的开单台
   ============================================================
   打开 http://localhost:8080 就是开单台本身，跟域名上那个一样：
     · 网页       ← 这个文件伺服
     · 后端 API   ← 顺手把 后端-server.js 也拉起来（听 8788），/api/* 转过去
     · 数据       ← 存在本文件夹的「本地数据」里，跟服务器上那份【完全隔开】

   ⚠ 一个字都不改任何现有文件。
   ⚠ 在这儿怎么试都影响不到线上 choeyy88.com。
   ⚠ 关掉黑窗口，网址和后端一起停。

   跑法：双击「本地预览-双击这个.bat」
*/
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = __dirname;
const PORT = 8080;          /* 网页 */
const API_PORT = 8788;      /* 后端，跟线上同一个端口号 */
const DATA = path.join(ROOT, "本地数据");
const 首页文件 = "配送开单台.html";

/* ---------- 1. 本地数据目录（跟服务器那份完全无关） ---------- */
fs.mkdirSync(DATA, { recursive: true });

/* ---------- 2. 从 密钥-本机.js 里取密钥，喂给后端 ----------
   只在内存里传，不写进任何文件、不打印出来。 */
function 取密钥(名) {
  try {
    const s = fs.readFileSync(path.join(ROOT, "密钥-本机.js"), "utf8");
    const m = s.match(new RegExp("window\\." + 名 + "\\s*=\\s*[\"']([^\"']+)[\"']"));
    return m ? m[1] : "";
  } catch (e) { return ""; }
}

/* ---------- 3. 把后端拉起来 ---------- */
let 后端 = null;
function 起后端() {
  const f = path.join(ROOT, "后端-server.js");
  if (!fs.existsSync(f)) { console.log("  ⚠ 找不到 后端-server.js，只开网页"); return; }
  const key = 取密钥("GM_KEY");          /* Anthropic：认结构 */
  const keyOCR = 取密钥("GM_KEY_OCR");   /* Mistral：认字 */
  console.log("  [后端] 密钥：Anthropic " + (key ? "有" : "没有") +
              " · OCR " + (keyOCR ? "有" : "没有"));
  后端 = spawn(process.execPath, [f], {
    cwd: ROOT,
    env: Object.assign({}, process.env, {
      KAIDAN_DATA: DATA,
      ANTHROPIC_API_KEY: key || process.env.ANTHROPIC_API_KEY || "",
      MISTRAL_API_KEY: keyOCR || process.env.MISTRAL_API_KEY || ""
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  后端.stdout.on("data", d => process.stdout.write("  [后端] " + d));
  后端.stderr.on("data", d => process.stdout.write("  [后端] " + d));
  后端.on("exit", c => console.log("  [后端] 停了（" + c + "）"));
}

/* ---------- 4. /api/* 转给后端 ---------- */
function 转给后端(req, res) {
  const p = http.request({
    host: "127.0.0.1", port: API_PORT, path: req.url,
    method: req.method, headers: req.headers, timeout: 190000
  }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  p.on("timeout", () => p.destroy(new Error("后端超时")));
  p.on("error", e => {
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "后端没起来：" + e.message }));
  });
  req.pipe(p);
}

/* ---------- 5. 文件列表页（想开别的 html 用） ---------- */
function 列表页() {
  const files = fs.readdirSync(ROOT).filter(f => f.toLowerCase().endsWith(".html")).sort();
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>本地 · 所有页面</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#14120E;color:#EDE8DC;font:17px/1.7 "Microsoft YaHei",sans-serif;
     padding:40px 24px;max-width:760px;margin:0 auto}
h1{font-size:26px;color:#F0B23C;margin-bottom:24px}
a{display:block;background:#1A1712;border:1px solid #2A251D;border-left:5px solid #F0B23C;
  border-radius:0 10px 10px 0;padding:15px 20px;margin-bottom:10px;
  color:#EDE8DC;text-decoration:none;font-size:18px}
a:hover{background:#221F19;border-left-color:#6ECF8A}
</style></head><body><h1>本地 · 所有页面</h1>
${files.map(f => `<a href="/${encodeURIComponent(f)}">${f}</a>`).join("")}
</body></html>`;
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

/* ---------- 6. 网页服务器 ---------- */
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split("?")[0]); } catch (e) { p = req.url.split("?")[0]; }

  if (p.startsWith("/api/")) return 转给后端(req, res);
  if (p === "/列表" || p === "/list") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return res.end(列表页());
  }
  if (p === "/" || p === "/index.html") p = "/" + 首页文件;

  const 目标 = path.join(ROOT, p);
  if (!目标.startsWith(ROOT)) { res.writeHead(403); return res.end("不给看"); }

  fs.readFile(目标, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      return res.end('<meta charset="utf-8"><body style="background:#14120E;color:#EDE8DC;'
        + 'font-family:Microsoft YaHei;padding:40px">没这个文件。'
        + '<a href="/列表" style="color:#F0B23C">看所有页面</a></body>');
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(目标).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"      /* 改完刷新就见新的，不用清缓存 */
    });
    res.end(buf);
  });
});

server.on("error", e => {
  if (e.code === "EADDRINUSE") {
    console.log("\n  端口 " + PORT + " 被占了 —— 多半已经开着一个。");
    console.log("  直接去浏览器开 http://localhost:" + PORT + "\n");
  } else console.log("\n  起不来：" + e.message + "\n");
});

起后端();
server.listen(PORT, "127.0.0.1", () => {
  setTimeout(() => {
    console.log("");
    console.log("  ══════════════════════════════════════════════");
    console.log("     开单台（跟域名上那个一样）");
    console.log("        http://localhost:" + PORT);
    console.log("");
    console.log("     所有页面列表（试OCR 在里面）");
    console.log("        http://localhost:" + PORT + "/列表");
    console.log("");
    console.log("     数据存在：本地数据\\  —— 跟线上完全隔开");
    console.log("     关掉这个窗口，网页和后端一起停。");
    console.log("  ══════════════════════════════════════════════");
    console.log("");
  }, 400);
});

/* 关窗口时把后端一起带走 */
["SIGINT", "SIGTERM", "SIGHUP"].forEach(s =>
  process.on(s, () => { if (后端) 后端.kill(); process.exit(0); }));
process.on("exit", () => { if (后端) 后端.kill(); });
