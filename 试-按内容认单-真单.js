/* 拿真单批量验「按内容认单」：node 试-按内容认单-真单.js
   ────────────────────────────────────────────────
   料从两处来：
     · 桌面\OCR缓存   130 份真单的 OCR 结果（markdown 表格）—— 图片 OCR 完就是表，
                      正是老板 8/12 说的「都是一个道理」
     · 基线-49份-opus-结果.json  同一批单在【老路子】下读出来的品数和总量，拿来对账

   ⚠ 说清楚这个测试【验的是什么、不验什么】：
     验：把「指认」翻成坐标这一步准不准、稳不稳（数错行还中不中招）
     不验：AI 指认得对不对 —— 这儿没法调模型，指认是从表本身推出来的（模拟一个答对的 AI）
   所以下面凡是「模拟识别」四个字，都是这个意思，别当成 AI 的成绩。 */
const fs = require("fs"), path = require("path");
global.window = global.window || {};
require("./引擎-解析.js");
require("./引擎-认表.js");
require("./新-按内容认单.js");
const T = window.GM_TABLE, N = window.GM_按内容认单;

const 缓存 = "c:/Users/李正/Desktop/OCR缓存";

/* ── markdown 表格 → 格子 ───────────────────────── */
function 变格子(text) {
  const rows = [];
  text.split(/\r?\n/).forEach(l => {
    const t = l.trim();
    if (t.indexOf("|") < 0) { if (t) rows.push([t]); return; }
    if (/^\|?[\s:|-]+\|?$/.test(t)) return;                 /* markdown 的分隔线 */
    const cells = t.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
    rows.push(cells);
  });
  return rows;
}

/* ── 模拟一个「答对了的 AI 指认」：从表本身推 ───────── */
const 是品名 = /商品名|品名|货品|商品|名称|产品/;
const 是数量 = /采购量|订货量|数量|总数|待采购|计划/;
const 是单位 = /^单位$/;
const 是明细 = /明细|分布|订货明细|门店/;
const 是备注 = /^备注$|说明/;
const 是单价 = /单价|价格/;

function 模拟指认(rows) {
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = rows[i] || [];
    if (r.some(c => 是品名.test(c)) && r.some(c => 是数量.test(c) || 是明细.test(c))) { hi = i; break; }
  }
  if (hi < 0) return null;
  const 头 = rows[hi];
  const 找 = re => { const j = 头.findIndex(c => re.test(c)); return j < 0 ? null : j; };
  const j品 = 找(是品名); if (j品 === null) return null;
  const 数据 = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const v = (rows[i] || [])[j品];
    if (!v || !String(v).trim()) continue;
    if (/^(合计|总计|小计|共计)$/.test(String(v).trim())) continue;
    数据.push(i);
  }
  if (!数据.length) return null;
  const 一格 = (i, j) => (j === null || j === undefined) ? null : String((rows[i] || [])[j] || "").trim();
  const 造 = (j) => (j === null || j === undefined) ? { 有: false }
    : { 有: true, 表头写的是: 头[j], 第一格是: 一格(数据[0], j) };
  return {
    版式: "明细",
    有什么: {
      品名: 造(j品), 数量: 造(找(是数量)), 单位: 造(是单位.test(头.join("|")) ? 头.findIndex(c => 是单位.test(c)) : null),
      单价: 造(找(是单价)), 点位: 造(找(是明细)), 备注: 造(找(是备注)), 校验数: { 有: false },
    },
    第一样货叫: 一格(数据[0], j品),
    最后一样货叫: 一格(数据[数据.length - 1], j品),
    一共几样货: 数据.length,
    不确定的: [],
  };
}

/* ── 摊出来数一数 ─────────────────────────────── */
function 摊(rows, 读法) {
  const 合 = T.摊平([{ n: 1, rows: rows }], 读法);
  if (!合 || !合.行) return null;
  let 段 = 0, 量 = 0, 读不懂 = 0;
  合.行.forEach(L => (L.分布 || []).forEach(d => {
    段++;
    if (d.读不懂) 读不懂++;
    const q = parseFloat(d.数量); if (!isNaN(q)) 量 += q;
  }));
  return { 品: 合.行.length, 段, 量: Math.round(量 * 100) / 100, 读不懂, 合 };
}

/* ══════════════ 开跑 ══════════════ */
const 基线 = {};
try {
  require("./基线-49份-opus-结果.json").forEach(x => { 基线[x.文件] = x; });
} catch (e) { console.log("（读不到基线，跳过对账）"); }

const 文件 = fs.readdirSync(缓存).filter(f => /\.txt$/.test(f));
let 认出 = 0, 认不出 = 0, 停下问 = 0;
let 对上基线 = 0, 跟基线不一样 = [], 抗住了 = 0, 没抗住 = [];

文件.forEach(f => {
  const rows = 变格子(fs.readFileSync(path.join(缓存, f), "utf8"));
  const 指认 = 模拟指认(rows);
  if (!指认) { 认不出++; return; }

  const r = N.认(rows, 指认);
  if (r.要问的) { 停下问++; return; }
  认出++;
  const a = 摊(rows, r.读法);
  if (!a) { 认不出++; return; }

  /* ① 跟老路子的基线对：品数和总量一样吗 */
  const png = f.replace(/\.txt$/, "").replace(/^.*__/, "");
  const b = 基线[png];
  if (b) {
    if (b.品 === a.品) 对上基线++;
    else 跟基线不一样.push({ 单: f.slice(0, 26), 基线品: b.品, 新品: a.品, 基线量: b.量, 新量: a.量 });
  }

  /* ② 抗不抗得住「上面多压三行抬头」—— 老路子最容易栽的地方 */
  const 加料 = [["某某公司下单表"], ["采购经办: 张三", "", "打印时间: 2026-08-11"], ["任务数: " + a.品]].concat(rows);
  const r2 = N.认(加料, 指认);
  const a2 = r2.要问的 ? null : 摊(加料, r2.读法);
  if (a2 && a2.品 === a.品 && a2.段 === a.段) 抗住了++;
  else 没抗住.push({ 单: f.slice(0, 26), 原: a.品, 加料后: a2 ? a2.品 : "停下问人" });
});

console.log("═══ 130 份真单（OCR 出来的表）═══");
console.log("  认出来、定得下坐标 : " + 认出);
console.log("  模拟识别就没认出表 : " + 认不出 + "（多半不是明细表，或者 OCR 没出表格）");
console.log("  定不下来、停下问人 : " + 停下问);
console.log("\n═══ 跟老路子的基线对账 ═══");
console.log("  品数一模一样 : " + 对上基线);
console.log("  不一样       : " + 跟基线不一样.length);
跟基线不一样.slice(0, 12).forEach(x =>
  console.log("     " + x.单 + "　基线 " + x.基线品 + " 品/" + x.基线量 + "　新 " + x.新品 + " 品/" + x.新量));
console.log("\n═══ 抗不抗得住「上面多压三行抬头」═══");
console.log("  照样读对 : " + 抗住了 + " / " + 认出);
console.log("  没抗住   : " + 没抗住.length);
没抗住.slice(0, 12).forEach(x => console.log("     " + x.单 + "　原 " + x.原 + " 品 → 加料后 " + x.加料后));
