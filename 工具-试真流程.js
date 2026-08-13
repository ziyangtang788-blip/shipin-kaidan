/* 照【页面真实流程】跑一张单：Mistral OCR 认字 → Claude 排格子表 → 单据行 + 校验
   用法：node 工具-试真流程.js "某张单.png"

   跟 工具-试读结构.js 的区别（2026-08-10 老板问出来的）：
     工具-试读结构.js  = 图片【直接】丢给 Claude，不走 OCR   ← 页面根本不走这条
     本工具            = Mistral OCR 先认字，再把【文字】交给 Claude ← 页面真实走的
   两条路结果差很多，验流程必须用这一份。

   提示词、拼法、模型、max_tokens 全部照抄 配送开单台.html 里那段，
   抄第二份就会出现「工具全绿、页面出事」，所以能引用的一律引用引擎里的。 */
const fs = require("fs"), path = require("path"), https = require("https");
global.window = {};
require("./引擎-解析.js");
require("./引擎-读文件.js");
require("./引擎-读结构.js");
require("./引擎-OCR.js");
const S = global.window.GM_STRUCT, O = global.window.GM_OCR;

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

/* 密钥只在本机这一份，绝不上传 */
function 密钥(re, 叫什么) {
  const t = fs.readFileSync("密钥-本机.js", "utf8");
  const m = t.match(re);
  if (!m) throw new Error("密钥-本机.js 里找不到" + 叫什么);
  return m[0].replace(/^["']|["']$/g, "");
}
const KEY_AI = () => 密钥(/["']sk-ant-[^"']+["']/, "Anthropic 密钥");
const KEY_OCR = () => {
  const t = fs.readFileSync("密钥-本机.js", "utf8");
  const m = t.match(/GM_KEY_OCR\s*=\s*["']([^"']+)["']/);
  if (!m) throw new Error("密钥-本机.js 里找不到 GM_KEY_OCR");
  return m[1];
};

function 打(host, p, headers, body) {
  return new Promise((ok, no) => {
    const s = JSON.stringify(body);
    const req = https.request({ hostname: host, path: p, method: "POST",
      headers: Object.assign({ "content-type": "application/json",
        "content-length": Buffer.byteLength(s) }, headers) }, r => {
      /* ⚠ 必须先 setEncoding 或者收 Buffer 再 concat。
         写成 buf += d（d 是 Buffer）会按块解码，一个中文字被切在两块中间就烂成 ——
         2026-08-10 踩到：AI 交上来的 "数" 键变成乱码，那一段被当空格子丢掉，
         靓客家豆腐平白少了 1 板。 */
      const bs = []; r.on("data", d => bs.push(d));
      r.on("end", () => {
        const buf = Buffer.concat(bs).toString("utf8");
        try { ok(JSON.parse(buf)); } catch (e) { no(new Error("HTTP " + r.statusCode + " " + buf.slice(0, 300))); }
      });
    });
    req.on("error", no); req.write(s); req.end();
  });
}

(async () => {
  const f = process.argv[2];
  if (!f) { console.log('用法: node 工具-试真流程.js "某张单.png"'); process.exit(1); }
  const ext = path.extname(f).toLowerCase();
  if (!MIME[ext]) { console.log("只支持图片：" + Object.keys(MIME).join(" ")); process.exit(1); }
  const b64 = fs.readFileSync(f).toString("base64");

  /* ── 第 ① 步：Mistral OCR 认字 ── */
  console.log("① Mistral OCR 认字…");
  const oj = await 打("api.mistral.ai", "/v1/ocr",
    { authorization: "Bearer " + KEY_OCR() }, O.请求体(b64, MIME[ext]));
  if (oj && oj.error) throw new Error("OCR 失败：" + (oj.error.message || JSON.stringify(oj.error)));
  const R = O.拆响应(oj);
  const 文 = R.text || R.文本 || "";
  console.log("   认出 " + 文.length + " 字" + (R.低分 ? "，有 " + R.低分 + " 处没把握（已标 ?）" : ""));

  fs.writeFileSync("调试-OCR原文.txt", 文, "utf8");
  console.log("   OCR 原文已存 → 调试-OCR原文.txt");

  /* 关心的那几行，把 OCR 原文摘出来看 —— 这是判断「谁的锅」的硬证据 */
  console.log("\n── OCR 原文里这几行长什么样 ──");
  文.split(/\r?\n/).forEach(线 => {
    if (/嫩豆腐|卤豆干|大豆卜|腐皮结/.test(线)) console.log("   " + 线.trim().slice(0, 300));
  });

  /* ── 第 ② 步：Claude 拿文字排格子表（提示词/拼法/模型全照页面） ── */
  console.log("\n② Claude 排格子表…");
  const content = [
    { type: "text", text: S.提示词, cache_control: { type: "ephemeral" } },
    { type: "text", text: "下面是一张下单表照片，OCR 逐字认出来的内容（" + path.basename(f) +
        "）。表格是 markdown 格式。带 ? 的是 OCR 自己说没把握的字：\n\n" + 文 }
  ];
  const aj = await 打("api.anthropic.com", "/v1/messages",
    { "x-api-key": KEY_AI(), "anthropic-version": "2023-06-01" },
    { model: "claude-opus-5", max_tokens: 64000, messages: [{ role: "user", content }] });
  if (aj && aj.error) throw new Error("AI 失败：" + (aj.error.message || JSON.stringify(aj.error)));
  fs.writeFileSync("调试-AI整个响应.json", JSON.stringify(aj, null, 2), "utf8");
  /* content[0] 不一定是文本块 —— 扫全部，把 text 块拼起来 */
  const out = (aj.content || []).filter(b => b && b.type === "text")
                .map(b => b.text || "").join("\n");
  console.log("   停在：" + (aj.stop_reason || "?") + "，文本 " + out.length + " 字");
  const J = S.剥JSON(out);
  if (!J) { console.log("剥不出格子表，原样存 → 调试-AI原样.txt"); fs.writeFileSync("调试-AI原样.txt", out, "utf8"); process.exit(1); }
  fs.writeFileSync("调试-格子表.json", JSON.stringify(J, null, 2), "utf8");
  console.log("   格子表已存 → 调试-格子表.json");

  /* ── 第 ③ 步：本地读结构 ── */
  const r = S.读结构(J);
  console.log("\n── 货 " + (r.lines || []).length + " 行 ──");
  (r.lines || []).forEach((L, i) => {
    const 捞 = (L.segs || []).filter(g => g.名里捞的);
    console.log("  " + String(i + 1).padStart(2) + ". " + L.text +
      "  ── " + L.qty + (L.unit || "") +
      (L.总数 ? "  表上总数 " + L.总数.qty : "") +
      (捞.length ? "   ★名里捞的 " + 捞.length + " 段(" + 捞.map(g => g.qty).join("/") + ")" : ""));
  });
  console.log("\n── 校验 ──");
  const 说 = S.校验说人话 ? S.校验说人话(r.校验 || []) : null;
  if (说 && 说.length) 说.forEach(x => console.log("  " + (typeof x === "string" ? x : JSON.stringify(x))));
  else (r.校验 || []).forEach(b => console.log("  [" + b.类 + "] " + JSON.stringify(b)));

  const u = aj.usage || {};
  console.log("\n（AI 进 " + (u.input_tokens || 0) + " / 出 " + (u.output_tokens || 0) + " token）");
})().catch(e => { console.error("✗ " + e.message); process.exit(1); });
