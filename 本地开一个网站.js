/* 在自己电脑上开一个网站 —— node 本地开一个网站.js
   ────────────────────────────────────────────────
   开完在浏览器里打开 http://localhost:8080 就是开单台，
   跟线上一模一样，只是跑在你自己电脑上：不用联网、不用服务器、不影响线上。

   干什么用：改完的东西先在这儿真点一遍，走通了再推 GitHub。
   自动测试查得了语法和函数，查不了「拖一张单进去到底出不出单」。

   ⚠ 只监听本机（127.0.0.1），别人连不进来，密钥不会外泄。
   ⚠ 关掉这个窗口网站就停了。 */
const http = require("http"), fs = require("fs"), path = require("path");

const 根 = __dirname;
/* 8080 被别的程序占着（多半是后端 server），换一个没人用的 */
const 端口 = 8123;
/* 后端在另一个端口上自己跑（后端-server.js 默认 8788）。
   ⚠ 2026-08-15 挖出来的根子：页面所有活都问同源的 /api/*，
     本地只开这个静态站的话 /api/health 就是 404 → 页面判定「连不上服务器」
     → 学过的东西退回存浏览器，而 localhost:8123 是个全新网址，里面一条都没有
     → 教过的几百条客户叫法全不认得，认出来的东西离谱。
   所以 /api/ 开头的一律转给后端，别让它 404。 */
const 后端端口 = parseInt(process.env.KAIDAN_PORT || "8788", 10);

const 类型 = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pdf": "application/pdf",
};

/* /api/* → 原样转给后端，回来什么样就还什么样（含状态码和 content-type） */
function 转给后端(req, res) {
  const 上 = http.request({
    host: "127.0.0.1", port: 后端端口, path: req.url, method: req.method,
    headers: Object.assign({}, req.headers, { host: "127.0.0.1:" + 后端端口 }),
  }, r => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  上.on("error", e => {
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, error: "后端没开（" + e.code + "）—— 先跑 后端-server.js" }));
  });
  req.pipe(上);
}

http.createServer((req, res) => {
  if (req.url.indexOf("/api/") === 0) return 转给后端(req, res);

  let 名 = decodeURIComponent(req.url.split("?")[0]);
  if (名 === "/") 名 = "/配送开单台.html";

  /* 只许拿这个文件夹里的东西 —— 防止 ../.. 跑到别处去 */
  const 全 = path.normalize(path.join(根, 名));
  if (!全.startsWith(根)) { res.writeHead(403); return res.end("不许"); }

  fs.readFile(全, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("找不到：" + 名);
    }
    res.writeHead(200, {
      "content-type": 类型[path.extname(全).toLowerCase()] || "application/octet-stream",
      /* 改完刷新就能看到新的，别让浏览器缓存住老的 */
      "cache-control": "no-store",
    });
    res.end(buf);
  });
}).listen(端口, "127.0.0.1", () => {
  console.log("");
  console.log("  ✅ 本地网站开好了");
  console.log("");
  console.log("     在浏览器里打开：  http://localhost:" + 端口);
  console.log("");
  console.log("  · 跟线上长得一模一样，但跑的是你本地这一份代码");
  console.log("  · 改完 js 直接刷新页面就生效，不用重开");
  console.log("  · 关掉这个黑窗口，网站就停");
  console.log("");
});
