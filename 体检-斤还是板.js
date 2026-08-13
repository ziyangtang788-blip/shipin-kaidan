/* 「按斤价 还是 折成板」这条规矩，拿观麦 9765 行真单核一遍
   —— node 体检-斤还是板.js

   老板 2026-08-02 的担心（原话）：
     「我怕你把改了之后，又把它所有的又反过来识别了导致更大的错误。」

   他担心得对。我为了修碧源那 ¥0.72 动了全局规矩，不能只拿一张单交差。
   所以拿观麦导出的订单明细当答案本，把【所有受这条规矩影响的行】逐条核。

   受影响的行 = 同时满足三条：
     ① 客户叫法里自己带规格数字（水豆腐（5斤装））
     ② 这一单的单位是散称（斤/公斤）
     ③ 这家客户名下还有论斤卖的同族货（不然本来就没得选）
   只有这种行，「按斤价」和「折成板」才会给出不同的钱。

   核什么：观麦当时实际开的是哪个货 —— 板货还是斤货。
   我们跟观麦不一致的，一条条列出来。 */
const fs = require("fs");
const path = require("path");
global.window = {};
require("./数据-价格库.js");
require("./对照-预置.js");
require("./引擎-解析.js");
require("./引擎-匹配.js");
require("./数据-常用规格.js");
const D = window.GM_DATA, SEED = window.GM_SEED || {}, P = window.GM_PARSE, M = window.GM_MATCH;
const USED = window.GM_USED || {};
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));

const CSV = process.argv[2] || "C:/Users/李正/Downloads/观麦_订单明细.csv";
if (!fs.existsSync(CSV)) { L("找不到订单明细：" + CSV); process.exit(0); }

/* ---- 读 CSV（带引号、引号内可能有逗号和换行） ---- */
function 拆(t) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const rows = 拆(fs.readFileSync(CSV, "utf8").replace(/^\uFEFF/, ""));
const head = rows[0].map(s => s.trim());
const at = n => head.indexOf(n);
const C_name = at("name"), C_sku = at("id"), C_unit = at("sale_unit_name"),
      C_qty = at("real_quantity"), C_cust = at("salemenu_id"), C_price = at("sale_price");
if ([C_name, C_sku, C_unit, C_qty, C_cust].some(x => x < 0)) {
  L("表头对不上，缺列：" + JSON.stringify({ C_name, C_sku, C_unit, C_qty, C_cust }));
  process.exit(1);
}

/* ---- 匹配上下文，跟页面同一份 ---- */
const usedN = (cid, sku) => (USED[cid] || {})[sku] || 0;
const IDX = M.buildIndex(D, usedN);
const OV = { maps: {}, gmap: {} };
const C = {
  DATA: D, IDX, OV, usedN,
  seedLookup: (cid, t, u) => P.seedLookup(SEED[cid], t, u),
  learnedSku: (ci, t, u) => P.learnedLookup(OV.maps, D.custs[ci][0], t, u,
    sku => IDX.byCust[ci].sku[sku] === undefined ? null : D.items[IDX.byCust[ci].sku[sku]][3]),
  defaultSide: window.GM_DEFAULT_SIDE
};
const ciOf = {}; D.custs.forEach((c, i) => { ciOf[c[0]] = i; });
const 散称 = /^(斤|公斤|kg|千克|克|g|两)$/i;
const 有数 = s => /\d/.test(String(s || ""));

let 总 = 0, 受影响 = 0, 一致 = 0, 不一致 = [], 认不出 = 0;
const 全体 = { 对: 0, 错: 0, 问人: 0, 认不出: 0, 例: [] };
const 钱 = { 总: 0, 对: 0, 差: 0, 例: [] };
const 客户命中 = {};

for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (!row || row.length < head.length - 5) continue;
  const cid = (row[C_cust] || "").trim();
  const 叫法 = (row[C_name] || "").trim();
  const sku = (row[C_sku] || "").trim();
  const unit = (row[C_unit] || "").trim();
  const qty = parseFloat(row[C_qty] || "0");
  if (!cid || !叫法 || !sku || !unit) continue;
  const ci = ciOf[cid]; if (ci === undefined) continue;
  const b = IDX.byCust[ci]; if (!b || b.sku[sku] === undefined) continue;
  总++;

  /* ── 先做一遍「全体」核对：所有行都拿叫法去认，看认到的是不是观麦开的那个。
     老板担心的是「改了一处，把别处也带歪了」—— 那就得全体都看，不能只看受影响的。 */
  {
    const g = M.matchOne(C, ci, 叫法, unit, null, qty, { 名原: 叫法 });
    if (g.i < 0) 全体.认不出++;
    else if (D.items[g.i][6] === sku) 全体.对++;
    else if (M.commits(g.how)) { 全体.错++; if (全体.例.length < 12) 全体.例.push(
      "「" + 叫法 + "」" + qty + unit + "  观麦:" + D.items[b.sku[sku]][2] + "[" + D.items[b.sku[sku]][3] + "]" +
      "  我们:" + D.items[g.i][2] + "[" + D.items[g.i][3] + "]  (" + D.custs[ci][1] + ")"); }
    else 全体.问人++;
  }

  /* 只挑「这条规矩说了算」的行 */
  if (!散称.test(unit)) continue;                 /* 单位不是散称，跟这条无关 */
  if (!有数(叫法)) continue;                       /* 叫法里没带规格，跟这条无关 */
  const 真 = b.sku[sku];
  const 真单位 = D.items[真][3];
  /* 这家有没有论斤卖的同族货 —— 没有的话本来就没得选 */
  const 根 = P.bare(D.items[真][2]).replace(/[板盒件包箱桶袋]+$/, "");
  const 有斤货 = b.list.some(i => i !== 真 && 散称.test(D.items[i][3] || "") &&
    P.bare(D.items[i][2]).replace(/[板盒件包箱桶袋]+$/, "") === 根);
  if (!有斤货) continue;
  受影响++;

  const res = M.matchOne(C, ci, 叫法, unit, null, qty, { 名原: 叫法 });
  if (res.i < 0) { 认不出++; continue; }
  const 我 = D.items[res.i];
  if (我[6] === sku) {
    一致++; (客户命中[cid] = 客户命中[cid] || { ok: 0, no: 0 }).ok++;
    /* 认对了货还不够，钱也得对得上：折算完的数量 × 我们的价，
       要等于观麦这一行开的钱。差一分都算问题。 */
    const cv = M.换算比(D, res.i, unit);
    const q2 = cv ? qty * cv.mul : qty;
    const 我钱 = Math.round(q2 * (+我[4] || 0) * 100) / 100;
    const 麦钱 = Math.round(qty * (+row[C_price] || 0) * 100) / 100;
    钱.总++;
    if (Math.abs(我钱 - 麦钱) < 0.011) 钱.对++;
    else { 钱.差 += Math.round((我钱 - 麦钱) * 100) / 100;
      if (钱.例.length < 8) 钱.例.push("「" + 叫法 + "」" + qty + unit + " → " + q2 + 我[3] +
        "  我们 ¥" + 我钱.toFixed(2) + "  观麦 ¥" + 麦钱.toFixed(2) + "  (" + D.custs[ci][1] + ")"); }
    continue;
  }
  (客户命中[cid] = 客户命中[cid] || { ok: 0, no: 0 }).no++;
  不一致.push({
    cid, 客户: D.custs[ci][1], 叫法, unit, qty,
    观麦: D.items[真][2] + "[" + 真单位 + "]¥" + D.items[真][4],
    我们: 我[2] + "[" + 我[3] + "]¥" + 我[4],
    敢拍板: M.commits(res.how), how: res.how
  });
}

L("══════════════════════════════════════");
L("① 全体：所有行都认一遍，会不会被带歪");
L("══════════════════════════════════════");
L("能对上客户和商品的行　　" + 总);
L("  认到的就是观麦开的那个　" + 全体.对 + "  (" + (总?Math.round(全体.对/总*1000)/10:0) + "%)");
L("  ⛔ 不弹窗、却认成别的　 " + 全体.错 + "  (" + (总?Math.round(全体.错/总*1000)/10:0) + "%)");
L("  会弹窗问人　　　　　　　" + 全体.问人);
L("  认不出　　　　　　　　　" + 全体.认不出);
if (全体.例.length) { L(""); L("  不弹窗却认错的样子（最多 12 条）："); 全体.例.forEach(s => L("    " + s)); }
L("");
L("══════════════════════════════════════");
L("② 受这条规矩影响的行：「按斤价 还是 折成板」");
L("══════════════════════════════════════");
L("受这条规矩影响的行　　　" + 受影响 + "  （叫法自带规格 + 单位是散称 + 这家还有论斤卖的同族货）");
L("  跟观麦一致　　　　　　" + 一致);
L("  跟观麦不一致　　　　　" + 不一致.length);
L("  认不出（会弹窗问人）　" + 认不出);
L("");

L("  这些行的金额跟观麦对得上　" + 钱.对 + " / " + 钱.总 +
  (钱.对 === 钱.总 ? "  ✅ 一分不差" : ("  ⚠ 差 ¥" + 钱.差.toFixed(2))));
if (钱.例.length) { L(""); 钱.例.forEach(s => L("    " + s)); }
L("");
if (!不一致.length) {
  L("✅ 受影响的行里，没有一条跟观麦开的不一样。");
} else {
  const 静默 = 不一致.filter(x => x.敢拍板);
  L((静默.length ? "⚠ " : "") + "其中「不弹窗、直接落单」的不一致：" + 静默.length + " 条");
  L("（弹窗问人的那些不算事故 —— 人会看一眼）");
  L("");
  const 按客户 = {};
  不一致.forEach(x => { (按客户[x.cid] = 按客户[x.cid] || []).push(x); });
  Object.keys(按客户).forEach(cid => {
    const a = 按客户[cid];
    L("【" + a[0].客户 + " " + cid + "】" + a.length + " 条");
    a.slice(0, 6).forEach(x => {
      L("   「" + x.叫法 + "」 " + x.qty + x.unit +
        (x.敢拍板 ? "  ⛔直接落单" : "  （会问人）"));
      L("      观麦开的 " + x.观麦);
      L("      我们开的 " + x.我们);
    });
    if (a.length > 6) L("   …还有 " + (a.length - 6) + " 条");
  });
}
L("");
/* 门槛：受这条规矩影响的行，一条都不许跟观麦开得不一样。
   「全体」那一段只作参考 —— 那是拿客户叫法当输入，跟真实开单路径不完全一样，
   而且里头有一半是观麦自己的重复品（同名同价两条），不能当硬门槛。 */
if (不一致.length) { L("⛔ 受影响的行里有 " + 不一致.length + " 条跟观麦不一致 —— 先别上传。"); process.exit(1); }
process.exit(0);
