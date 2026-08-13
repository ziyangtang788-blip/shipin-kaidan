/* 试 OCR —— 把图丢进去，看它认成什么样
   ============================================================
   老板 2026-08-09：「我先试一下它图成什么样子」

   用法（两种都行）：
     · 把图片拖到桌面「试OCR-拖图进来.bat」上
     · node 工具-试OCR.js 图1.png 图2.jpg

   跑完自动打开一张网页：左边原图、右边 OCR 认出来的表，
   底下列出它自己说没把握的字。

   ⚠ 只读不改：不碰开单台、不碰价格库、不碰任何现有文件。
   ⚠ 浏览器里直连 Mistral 会被跨域挡掉（预检请求它不响应），
     所以走 node —— 将来并进开单台时改走后端代理，密钥不落前端。
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFile } = require("child_process");

const 项目 = __dirname;
global.window = global;
require(path.join(项目, "引擎-OCR.js"));
const O = global.GM_OCR;

const KEY = (fs.readFileSync(path.join(项目, "密钥-本机.js"), "utf8")
  .match(/GM_KEY_OCR\s*=\s*"([^"]+)"/) || [])[1];
if (!KEY) { console.log("密钥-本机.js 里没找到 GM_KEY_OCR"); process.exit(1); }

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
               ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf" };

function 调(体) {
  const body = JSON.stringify(体);
  return new Promise((ok, no) => {
    const req = https.request({
      hostname: "api.mistral.ai", path: "/v1/ocr", method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + KEY,
                 "Content-Length": Buffer.byteLength(body) }
    }, res => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => res.statusCode === 200
        ? (() => { try { ok(JSON.parse(d)); } catch (e) { no(e); } })()
        : no(new Error("HTTP " + res.statusCode + "　" + d.slice(0, 300))));
    });
    req.on("error", no);
    req.write(body);
    req.end();
  });
}

/* markdown 表格 → HTML 表格，好看一眼看出列有没有串 */
function 表转HTML(md) {
  const 出 = [];
  const 行 = md.split(/\r?\n/);
  let 表 = null;
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const L of 行) {
    if (/^\s*\|/.test(L)) {
      if (/^\s*\|[\s:|-]*-[\s:|-]*\|?\s*$/.test(L)) continue;   /* 分隔行跳过 */
      const c = L.replace(/^\s*\||\|\s*$/g, "").split("|").map(s => esc(s.trim()));
      if (!表) { 表 = [c]; } else 表.push(c);
    } else {
      if (表) { 出.push(渲染表(表)); 表 = null; }
      if (L.trim()) 出.push("<p>" + esc(L.replace(/^#+\s*/, "")) + "</p>");
    }
  }
  if (表) 出.push(渲染表(表));
  return 出.join("\n");
}
function 渲染表(rows) {
  return '<table><tr>' + rows[0].map(h => "<th>" + h + "</th>").join("") + "</tr>" +
    rows.slice(1).map(r => "<tr>" + r.map(v => "<td>" + v + "</td>").join("") + "</tr>").join("") +
    "</table>";
}

(async function () {
  const 图们 = process.argv.slice(2).filter(p => fs.existsSync(p));
  if (!图们.length) {
    console.log("没给图。把图片拖到「试OCR-拖图进来.bat」上，或者：");
    console.log("  node 工具-试OCR.js 某张图.png");
    process.exit(0);
  }

  const 卡片 = [];
  for (const p of 图们) {
    const ext = path.extname(p).toLowerCase();
    const mime = MIME[ext];
    if (!mime) { console.log("跳过（不认识的格式）：" + path.basename(p)); continue; }
    const buf = fs.readFileSync(p);
    process.stdout.write(path.basename(p) + "（" + Math.round(buf.length / 1024) + "KB）… ");
    try {
      const t0 = Date.now();
      const 体 = O.请求体(buf.toString("base64"), mime);
      if (mime === "application/pdf") 体.document = { type: "document_url", document_url: "data:application/pdf;base64," + buf.toString("base64") };
      const r = O.拆响应(await 调(体));
      const 秒 = ((Date.now() - t0) / 1000).toFixed(1);
      console.log("✅ " + 秒 + " 秒　" + r.文本.length + " 字　没把握 " + r.没把握的.length + " 处");
      卡片.push({
        名: path.basename(p), 秒, 图: "data:" + mime + ";base64," + buf.toString("base64"),
        r, kb: Math.round(buf.length / 1024)
      });
    } catch (e) {
      console.log("❌ " + e.message);
      卡片.push({ 名: path.basename(p), 错: e.message });
    }
  }

  const html = `<!doctype html><meta charset="utf-8"><title>试 OCR</title>
<style>
:root{color-scheme:dark}
body{background:#15161a;color:#E8E4DC;font:14px/1.6 "Microsoft YaHei",system-ui;margin:0;padding:24px}
h1{font-size:19px;margin:0 0 4px;color:#E0A94F}
.sub{color:#8A8578;font-size:13px;margin-bottom:20px}
.card{background:#1D1F24;border:1px solid #2C2F36;border-radius:10px;margin-bottom:20px;overflow:hidden}
.hd{padding:10px 16px;background:#22252B;border-bottom:1px solid #2C2F36;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.hd b{color:#E0A94F}
.hd span{color:#8A8578;font-size:12px}
.body{display:flex;gap:0;align-items:flex-start}
.L{flex:0 0 40%;padding:14px;border-right:1px solid #2C2F36;position:sticky;top:0}
.L img{max-width:100%;border-radius:6px;background:#fff}
.R{flex:1;padding:14px;overflow-x:auto}
table{border-collapse:collapse;font-size:12.5px;margin:6px 0;width:100%}
th{background:#2C2F36;color:#E0A94F;text-align:left;font-weight:600}
th,td{border:1px solid #343841;padding:5px 8px;vertical-align:top}
p{margin:4px 0;color:#C9C4B8}
.low{margin:10px 14px 14px;padding:10px 12px;border-radius:8px;background:#2A211A;border:1px solid #4A3B28}
.low b{color:#E0A94F}
.chip{display:inline-block;background:#3A2C1E;border:1px solid #5A4630;border-radius:5px;padding:1px 7px;margin:3px 4px 0 0;font-size:12px}
.ok{color:#7FBF7F}
.err{color:#E0533D;padding:14px}
</style>
<h1>试 OCR — 它把图认成什么样</h1>
<div class="sub">左边是你给的原图，右边是 OCR 认出来的东西。只是试，什么都没改。</div>
${卡片.map(c => c.错 ? `<div class="card"><div class="hd"><b>${c.名}</b></div><div class="err">✗ ${c.错}</div></div>` : `
<div class="card">
  <div class="hd">
    <b>${c.名}</b>
    <span>${c.kb} KB</span><span>${c.秒} 秒</span>
    <span>认出 ${c.r.文本.length} 字 / ${c.r.词数} 个词</span>
    <span>平均把握 ${c.r.平均分 == null ? "—" : (c.r.平均分 * 100).toFixed(1) + "%"}</span>
    <span>${c.r.没把握的.length ? "" : '<span class="ok">✓ 没有拿不准的字</span>'}</span>
  </div>
  <div class="body">
    <div class="L"><img src="${c.图}"></div>
    <div class="R">${表转HTML(c.r.文本)}</div>
  </div>
  ${c.r.没把握的.length ? `<div class="low"><b>它自己说这几处没把握</b>（并进系统后，数量位的会自动变成 <b>?</b>，要人填）：<br>
    ${c.r.没把握的.map(w => `<span class="chip">${w.字 || "(空)"} · ${(w.分 * 100).toFixed(0)}%</span>`).join("")}</div>` : ""}
</div>`).join("")}
<div class="sub">共 ${卡片.length} 张。这个页面只是给你看的，删掉不影响任何东西。</div>`;

  const 出 = path.join(process.env.USERPROFILE || 项目, "Desktop", "试OCR-结果.html");
  fs.writeFileSync(出, html, "utf8");
  console.log("\n结果 → " + 出);
  execFile("cmd", ["/c", "start", "", 出], () => {});
})();
