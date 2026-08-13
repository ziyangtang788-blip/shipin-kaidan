/* 拿原图重跑一次 OCR，跟缓存里的老结果比 —— node 试-重跑OCR.js
   问的是一件事：我说「29 份要人看，一半栽在 OCR 把料弄烂了」，
   这个结论是拿【你以前跑的缓存】得出来的。要是后来换过设置，结论就站不住。
   所以挑几张重跑，看表头还残不残、长格子还截不截。
   ⚠ 花的是 Mistral OCR 的钱，不是 Claude 的。 */
const fs = require("fs"), path = require("path"), https = require("https");
global.window = global.window || {};
require("./引擎-OCR.js");
const O = window.GM_OCR;

const 缓存 = "c:/Users/李正/Desktop/OCR缓存";
const 图库 = ["c:/Users/李正/Desktop/新测文件", "c:/Users/李正/Desktop/有问题的单/一分利佛山"];
const 出 = path.join(__dirname, "验AI指认", "重跑OCR");

function 拿密钥() {
  const s = fs.readFileSync(path.join(__dirname, "密钥-本机.js"), "utf8");
  const m = s.match(/window\.GM_KEY_OCR\s*=\s*["']([^"']+)["']/);
  if (!m) throw new Error("密钥-本机.js 里没找到 GM_KEY_OCR");
  return m[1];
}

/* 挑哪几张：优先挑我点过名的那几张（对账报警的、表头残的） */
const 想要 = ["bf4f102d", "7db304ad", "52eca104", "a8678f43", "b7efbaaf"];
const 活 = [];
想要.forEach(键 => {
  const 缓 = fs.readdirSync(缓存).find(f => f.indexOf(键) >= 0);
  if (!缓) return;
  let 图 = null;
  for (const d of 图库) {
    const hit = fs.existsSync(d) && fs.readdirSync(d).find(f => f.indexOf(键) >= 0);
    if (hit) { 图 = path.join(d, hit); break; }
  }
  if (图) 活.push({ 键, 缓存文件: 缓, 图 });
});

function 发(密钥, 体) {
  return new Promise((好, 坏) => {
    const b = Buffer.from(JSON.stringify(体));
    const req = https.request({
      host: "api.mistral.ai", path: "/v1/ocr", method: "POST",
      headers: { "authorization": "Bearer " + 密钥, "content-type": "application/json", "content-length": b.length },
      timeout: 180000,
    }, r => {
      let s = ""; r.on("data", d => s += d);
      r.on("end", () => r.statusCode >= 400 ? 坏(new Error("HTTP " + r.statusCode + " " + s.slice(0, 300))) : 好(JSON.parse(s)));
    });
    req.on("error", 坏); req.on("timeout", () => { req.destroy(); 坏(new Error("超时")); });
    req.write(b); req.end();
  });
}

/* 只看三件事：表格几行、表头行完不完整、有没有被截断的长格子 */
function 量一量(text) {
  const 行 = text.split(/\r?\n/).filter(l => l.indexOf("|") >= 0 && !/^\|?[\s:|-]+\|?$/.test(l.trim()));
  const 格 = 行.map(l => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
  let 表头 = null;
  for (let i = 0; i < Math.min(格.length, 10); i++) {
    const r = 格[i];
    if (r.filter(Boolean).length >= 3 && !r.some(c => /^[0-9.]+$/.test(c))) { 表头 = r; break; }
  }
  const 空表头 = 表头 ? 表头.filter(c => !c).length : -1;
  const 最长 = 格.reduce((a, r) => Math.max(a, ...r.map(c => c.length)), 0);
  return { 表格行: 格.length, 表头: 表头 ? 表头.join("│") : "(没找到)", 表头空格数: 空表头, 最长一格: 最长, 全长: text.length };
}

(async () => {
  if (!活.length) return console.log("一张图都没配上");
  const 密钥 = 拿密钥();
  if (!fs.existsSync(出)) fs.mkdirSync(出, { recursive: true });
  console.log("重跑 " + 活.length + " 张\n");
  for (const x of 活) {
    const buf = fs.readFileSync(x.图);
    const mime = /\.jpe?g$/i.test(x.图) ? "image/jpeg" : "image/png";
    let 新;
    try {
      const j = await 发(密钥, O.请求体(buf.toString("base64"), mime));
      新 = O.拆响应(j);
    } catch (e) { console.log("✗ " + x.键 + " " + e.message); continue; }
    const 新文 = 新.文本 || "";
    fs.writeFileSync(path.join(出, x.键 + "-新.txt"), 新文, "utf8");
    const 老文 = fs.readFileSync(path.join(缓存, x.缓存文件), "utf8");
    const A = 量一量(老文), B = 量一量(新文);
    console.log("═══ " + x.缓存文件.slice(0, 34) + " ═══");
    console.log("           表格行   表头空格   最长一格   全长");
    console.log("  老缓存 " + String(A.表格行).padStart(6) + String(A.表头空格数).padStart(9) + String(A.最长一格).padStart(11) + String(A.全长).padStart(8));
    console.log("  新跑的 " + String(B.表格行).padStart(6) + String(B.表头空格数).padStart(9) + String(B.最长一格).padStart(11) + String(B.全长).padStart(8));
    console.log("  老表头：" + A.表头.slice(0, 90));
    console.log("  新表头：" + B.表头.slice(0, 90));
    console.log("  一样吗：" + (老文.trim() === 新文.trim() ? "一模一样" : "不一样") +
      "　新的平均分 " + (新.平均分 !== undefined ? 新.平均分.toFixed(3) : "?") +
      "　没把握的字 " + ((新.没把握的字 || []).length));
    console.log("");
  }
  console.log("新结果 → " + 出);
})();
