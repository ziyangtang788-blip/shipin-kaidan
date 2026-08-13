/* 拿线上真实开过的单来体检 —— node 体检-查线上真单.js
   ============================================================
   老板 8/2 的要求：「真的用户使用一段时间，他会把数据更新上去，
   你再定时去检查它更新过后的数据，跟你原来数据有什么 bug」

   为什么必须有这个：客户点一次弹窗，系统就记住了，
   于是同一个 bug 在他那台机器上再也不出现 —— 但 bug 还在，
   换台电脑、换个客户照样中招。学习会把 bug 盖住，不会修好它。

   这里干四件事，全部不需要标准答案：
     ① 把线上每张单的客户原文重新解析一遍，看有没有掉数量、掉点位
     ② 把原文重新走一遍匹配，跟当时存下来的结果比 —— 不一样就是有东西变了
     ③ 单据上客户自己写了单价/规格的，拿来反推：跟我们算的对不对得上
     ④ 存疑/认不出的行统计出来，哪些词最常卡人，下一批就学哪些

   用法：
     node 体检-查线上真单.js              查最近 300 张
     node 体检-查线上真单.js 2026-08-01   查某天起
*/
const { execFileSync } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

const DIR = __dirname;
global.window = {};
require(path.join(DIR, "数据-价格库.js"));
require(path.join(DIR, "对照-预置.js"));
require(path.join(DIR, "引擎-解析.js"));
require(path.join(DIR, "引擎-匹配.js"));
require(path.join(DIR, "数据-常用规格.js"));
require(path.join(DIR, "数据-换算.js"));
const D = window.GM_DATA, SEED = window.GM_SEED || {}, CONV = window.GM_CONV || {};
const P = window.GM_PARSE, M = window.GM_MATCH, USED = window.GM_USED || {};
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));

const IP = "187.124.137.49";
const KEY = path.join(os.homedir(), ".ssh", "kaidan");
const AUTH = "laowu:LBr49jHUZXpSpG";
const FROM = process.argv[2] || "";

/* ── 从服务器把单子捞下来（走 ssh，服务器自己 curl 自己，绕开外网） ── */
function 捞() {
  const q = "https://choeyy88.com/api/orders?limit=300" + (FROM ? ("&from=" + FROM) : "");
  const cmd = "curl -sk -u " + AUTH + " --resolve choeyy88.com:443:127.0.0.1 '" + q + "'";
  const out = execFileSync("ssh", ["-i", KEY, "-o", "StrictHostKeyChecking=no",
    "-o", "BatchMode=yes", "root@" + IP, cmd], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out).rows || [];
}
function 捞一张(no) {
  const cmd = "curl -sk -u " + AUTH + " --resolve choeyy88.com:443:127.0.0.1 " +
    "'https://choeyy88.com/api/orders/" + encodeURIComponent(no) + "'";
  const out = execFileSync("ssh", ["-i", KEY, "-o", "StrictHostKeyChecking=no",
    "-o", "BatchMode=yes", "root@" + IP, cmd], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const j = JSON.parse(out);
  return j.ok ? j.order : null;
}

let rows;
try { rows = 捞(); }
catch (e) {
  L("连不上服务器：" + (e.message || e));
  L("（VPN 开着的时候连不上，关掉再跑）");
  process.exit(2);
}
L("线上一共 " + rows.length + " 张单" + (FROM ? ("（" + FROM + " 起）") : ""));
if (!rows.length) { L("还没有单，等客户用一阵子再来查。"); process.exit(0); }

/* ── 匹配上下文：跟页面同一份 ── */
const usedN = (cid, sku) => (USED[cid] || {})[sku] || 0;
const IDX = M.buildIndex(D, usedN);
const OV = { maps: {}, gmap: {} };     /* 空的：考的是「出厂能不能认」，不是「他教过没有」 */
const C = {
  DATA: D, IDX, OV, usedN,
  seedLookup: (cid, t, u) => P.seedLookup(SEED[cid], t, u),
  learnedSku: (ci, t, u) => P.learnedLookup(OV.maps, D.custs[ci][0], t, u,
    s => IDX.byCust[ci].sku[s] === undefined ? null : D.items[IDX.byCust[ci].sku[s]][3])
};
const ciOf = id => { let k = -1; D.custs.forEach((c, i) => { if (c[0] === id) k = i; }); return k; };

const 掉数量 = [], 对不上 = [], 反推不符 = [], 卡人的 = {};
let 查过 = 0, 没原文 = 0;

const U = "(?:公斤|kg|KG|Kg|中板|大板|小板|大盒|小盒|[斤板块条串包盒件袋桶个箱把张只gG])";
function 该有几段(raw) {
  let s = P.toHalf(raw);
  const tab = s.lastIndexOf("\t");
  if (tab >= 0) s = s.slice(tab + 1);
  const re = new RegExp("[(（\\[【]([^)）\\]】]{1,40})[)）\\]】]\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(" + U + "?)", "g");
  let n = 0, m;
  while ((m = re.exec(s)) !== null) {
    if (!/[0-9A-Za-z]/.test(m[1])) continue;
    if (new RegExp("^[0-9.]+\\s*(?:[A-Za-z]{1,4}|" + U + ")?\\s*装$").test(m[1].trim())) continue;
    n++;
  }
  return n;
}

rows.forEach(r => {
  const o = 捞一张(r.order_no);
  if (!o) return;
  if (!o.raw || !o.raw.trim()) { 没原文++; return; }
  查过++;
  const ci = ciOf(o.customer_id);
  if (ci < 0) { 对不上.push({ no: o.order_no, why: "客户 " + o.customer_id + " 在价格库里没有了" }); return; }

  /* ① 重新解析，看掉没掉数量 */
  const lines = P.parseOrder(o.raw);
  o.raw.split(/\r?\n/).forEach(one => {
    if (!one.trim()) return;
    const seg = P.parseOrder(one).reduce((a, l) => a + l.segs.length, 0);
    const 应有 = 该有几段(one);
    if (应有 > seg) 掉数量.push({ no: o.order_no, cust: o.customer_name, raw: one, 应有, 实得: seg });
  });

  /* ② 重新走一遍匹配，跟当时存的比 */
  const 现在 = [];
  lines.forEach(Lx => {
    P.convApply(CONV, o.customer_id, Lx);
    const m = M.matchOne(C, ci, Lx.text, Lx.unit);
    const it = m.i >= 0 ? D.items[m.i] : null;
    /* 按点位分组，跟页面 compute() 一个口径 */
    const g = {}, ord = [];
    Lx.segs.forEach(s => { const k = s.code || ""; if (!g[k]) { g[k] = { q: 0, code: s.code }; ord.push(k); } g[k].q += s.qty; });
    ord.forEach(k => 现在.push({ name: it ? it[2] : null, qty: Math.round(g[k].q * 1000) / 1000, price: it ? (+it[4] || 0) : null, ok: !!it, how: m.how }));
    if (!it) (卡人的[o.customer_id + "｜" + Lx.text] = 卡人的[o.customer_id + "｜" + Lx.text] || { n: 0, kind: "认不出" }).n++;
    else if (!M.commits(m.how)) (卡人的[o.customer_id + "｜" + Lx.text] = 卡人的[o.customer_id + "｜" + Lx.text] || { n: 0, kind: "存疑" }).n++;
  });

  const 当时 = (o.lines || []).filter(x => !x.manual);
  if (当时.length !== 现在.length) {
    对不上.push({ no: o.order_no, cust: o.customer_name, why: "当时 " + 当时.length + " 行，现在重算是 " + 现在.length + " 行" });
  } else {
    当时.forEach((x, i) => {
      const y = 现在[i];
      if (!y) return;
      if (Math.abs((+x.qty || 0) - (+y.qty || 0)) > 0.001)
        对不上.push({ no: o.order_no, cust: o.customer_name, why: "第" + (i + 1) + "行「" + x.name + "」数量：当时 " + x.qty + "，现在 " + y.qty });
      if (y.ok && x.price !== null && y.price !== null && Math.abs(x.price - y.price) > 0.001 && x.name === y.name)
        对不上.push({ no: o.order_no, cust: o.customer_name, why: "第" + (i + 1) + "行「" + x.name + "」单价：当时 ¥" + x.price + "，现在 ¥" + y.price });
    });
  }

  /* ③ 客户自己在原文里写了单价的，拿来反推 */
  o.raw.split(/\r?\n/).forEach(one => {
    const pm = P.toHalf(one).match(/[¥￥]\s*([0-9]+(?:\.[0-9]+)?)|单价\s*[:：]?\s*([0-9]+(?:\.[0-9]+)?)/);
    if (!pm) return;
    const 写的价 = parseFloat(pm[1] || pm[2]);
    const ls = P.parseOrder(one);
    if (!ls.length) return;
    const m = M.matchOne(C, ci, ls[0].text, ls[0].unit);
    if (m.i < 0) return;
    const 算的价 = +D.items[m.i][4] || 0;
    if (Math.abs(算的价 - 写的价) > 0.005)
      反推不符.push({ no: o.order_no, cust: o.customer_name, raw: one.trim(),
        对到: D.items[m.i][2], 单据写: 写的价, 库里是: 算的价, 差: Math.round((算的价 - 写的价) * 100) / 100 });
  });
});

L("有原文的 " + 查过 + " 张，没存原文的 " + 没原文 + " 张");
L("");
let 坏 = 0;

if (掉数量.length) {
  坏++;
  L("══ ★ 掉数量　" + 掉数量.length + " 条 —— 会少发货，最优先 ══");
  掉数量.forEach(x => L("   " + x.no + "  " + x.cust + "\n     原文：" + x.raw.replace(/\t/g, " ⇥ ") +
    "\n     该有 " + x.应有 + " 段，只出来 " + x.实得 + " 段"));
  L("");
}
if (对不上.length) {
  坏++;
  L("══ 现在重算跟当时存的对不上　" + 对不上.length + " 条 ══");
  L("   （不一定是错。改过预置、改过价格、客户当时手工改过，都会不一样。逐条看。）");
  对不上.forEach(x => L("   " + x.no + "  " + (x.cust || "") + "　" + x.why));
  L("");
}
if (反推不符.length) {
  坏++;
  L("══ ★ 单据自己写了价，跟我们算的对不上　" + 反推不符.length + " 条 ══");
  L("   （客户写的价是硬证据 —— 对不上就是我们对错商品了，或者价格库过期了）");
  反推不符.forEach(x => L("   " + x.no + "  " + x.cust + "\n     " + x.raw +
    "\n     对到「" + x.对到 + "」库里 ¥" + x.库里是 + "，单据上写 ¥" + x.单据写 + "　差 ¥" + x.差));
  L("");
}

const 卡 = Object.entries(卡人的).sort((a, b) => b[1].n - a[1].n).slice(0, 25);
if (卡.length) {
  L("══ 最常卡人的词（下一批就学这些）══");
  卡.forEach(([k, v]) => {
    const [cid, w] = k.split("｜");
    const c = D.custs.find(x => x[0] === cid);
    L("   " + String(v.n).padStart(3) + " 次  " + v.kind + "  「" + w + "」　" + cid + " " + (c ? c[1] : ""));
  });
  L("");
}

if (!坏) L("✅ 线上真单里没查出掉数量、没查出跟单据自己写的价对不上的。");
process.exit(坏 ? 1 : 0);
