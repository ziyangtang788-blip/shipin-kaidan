/* 一条命令拿到某客户的全部背景：价格表 + 观麦实际订单 + 图片位置
   用法： node 工具-客户档案.js S2979
   给子任务用的，省得每个都去啃 10MB 的 CSV。 */
const fs = require("fs"), path = require("path");
global.window = {};
require("./数据-价格库.js");
require("./对照-预置.js");
const D = global.window.GM_DATA, SEED = global.window.GM_SEED || {};

const SID = process.argv[2];
if (!SID) { console.log("用法: node 工具-客户档案.js S2979"); process.exit(1); }
let CI = -1; D.custs.forEach((c, i) => { if (c[0] === SID) CI = i; });
if (CI < 0) { console.log("价格库里没有 " + SID); process.exit(1); }

console.log("══════ " + SID + "  " + D.custs[CI][1] + " ══════\n");

console.log("【一】该客户价格表（开单只能对到这些，别的都是错的）");
const items = [];
D.items.forEach(it => { if (it[0] === CI) items.push(it); });
items.forEach(it => console.log("   「" + it[2] + "」 [" + it[3] + "] ¥" + it[4] +
  (it[5] ? "  规格:" + it[5] : "") + (it[4] > 0 ? "" : "   ←无价")));
console.log("   共 " + items.length + " 项\n");

/* 观麦实际订单：7/22~7/28 真的下过什么，是最硬的答案 */
const CSV = path.join(process.env.USERPROFILE || "C:/Users/李正", "Downloads", "观麦_订单明细.csv");
function parseCSV(t) {
  const R = []; let r = [], c = "", q = false, i = 0;
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  while (i < t.length) {
    const x = t[i];
    if (q) { if (x === '"') { if (t[i + 1] === '"') { c += '"'; i += 2; continue; } q = false; i++; continue; } c += x; i++; continue; }
    if (x === '"') { q = true; i++; continue; }
    if (x === ",") { r.push(c); c = ""; i++; continue; }
    if (x === "\r") { i++; continue; }
    if (x === "\n") { r.push(c); R.push(r); r = []; c = ""; i++; continue; }
    c += x; i++;
  }
  if (c !== "" || r.length) { r.push(c); R.push(r); }
  return R;
}
console.log("【二】观麦 7/22~7/28 实际下过的（按量排，这是硬答案）");
if (fs.existsSync(CSV)) {
  const rows = parseCSV(fs.readFileSync(CSV, "utf8")), h = rows[0];
  const iS = h.indexOf("salemenu_id"), iN = h.indexOf("name"), iU = h.indexOf("sale_unit_name"),
        iP = h.indexOf("sale_price"), iQ = h.indexOf("quantity");
  const agg = {};
  for (let r = 1; r < rows.length; r++) {
    const v = rows[r]; if (!v || v[iS] !== SID) continue;
    const k = v[iN];
    (agg[k] = agg[k] || { u: v[iU], p: v[iP], q: 0 });
    agg[k].q += (+v[iQ] || 0);
  }
  const ks = Object.keys(agg).sort((a, b) => agg[b].q - agg[a].q);
  if (!ks.length) console.log("   （这 8 天没下过单）");
  ks.forEach(k => console.log("   " + String(agg[k].q).padStart(8) + " " + String(agg[k].u).padEnd(3) +
    " ¥" + String(agg[k].p).padEnd(7) + "「" + k + "」"));
  console.log("   共 " + ks.length + " 个品\n");
} else { console.log("   找不到 " + CSV + "\n"); }

console.log("【三】已有的预置对照");
const s = SEED[SID];
if (!s) console.log("   （还没有）\n");
else { Object.keys(s).forEach(k => console.log("   \"" + k + "\": " + JSON.stringify(s[k]))); console.log(); }

console.log("【四】下单表图片在哪");
const ROOT = "C:/Users/李正/Desktop/也一原始数据/客户/客户";
let found = null;
try {
  for (const d of fs.readdirSync(ROOT)) {
    const k = x => String(x).replace(/[（）()\-－_\s]/g, "");
    if (k(d) === k(D.custs[CI][1]) || k(D.custs[CI][1]).includes(k(d)) || k(d).includes(k(D.custs[CI][1]))) { found = path.join(ROOT, d); break; }
  }
} catch (e) { }
if (!found) console.log("   找不到对应文件夹");
else {
  const imgs = [];
  const walk = p => { for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const fp = path.join(p, e.name);
    if (e.isDirectory()) walk(fp);
    else if (/\.(png|jpe?g)$/i.test(e.name)) imgs.push({ p: fp, s: fs.statSync(fp).size });
  } };
  walk(found);
  /* 按大小排，大的通常内容多；同内容的只留一张 */
  const seen = new Set(), uniq = [];
  imgs.sort((a, b) => b.s - a.s).forEach(x => { if (!seen.has(x.s)) { seen.add(x.s); uniq.push(x); } });
  console.log("   " + found);
  console.log("   共 " + imgs.length + " 张，去重后 " + uniq.length + " 张。建议读最大的 2 张：");
  uniq.slice(0, 3).forEach(x => console.log("     " + x.p));
}
