/* 学过的对照，按现在的规矩还对吗 —— node 体检-学过的还对吗.js [覆盖层.json]

   老板 2026-08-03 问：「你现在需不需要把以前的东西再学习一遍？
   因为我把规则告诉你了，跑一遍以前的数据是不是能学到更多？」

   真正的风险不是「学得少」，是【以前是按旧规矩学的】。
   学过的对照优先级最高，会盖过新规矩 —— 旧的错会一直生效，而且顶着绿标。

   所以这个体检干三件事：
     ① 学过的那条，跟「现在的规矩会给出的答案」对不对得上
     ② 对不上的，是不是真会出错（单位不同 / 价钱差得多）
     ③ 同一家里，两个不同的词学到了同一个货 —— 多半是教岔了

   不改任何东西，只报告。要清的自己去「学过的对照」里忘掉重学。 */
const fs = require("fs"), path = require("path");
global.window = {};
require("./数据-价格库.js");
require("./对照-预置.js");
require("./引擎-解析.js");
require("./引擎-匹配.js");
require("./数据-常用规格.js");
const D = window.GM_DATA, SEED = window.GM_SEED || {}, P = window.GM_PARSE, M = window.GM_MATCH;
const USED = window.GM_USED || {};
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));

const 文件 = process.argv[2] || path.join(__dirname, "覆盖层-线上.json");
if (!fs.existsSync(文件)) {
  L("没找到覆盖层文件：" + 文件);
  L("先拉一份：curl -s -k \"https://laowu:密码@choeyy88.com/api/overlay\" -o 覆盖层-线上.json");
  process.exit(0);
}
const OVFILE = JSON.parse(fs.readFileSync(文件, "utf8"));
const 全 = (OVFILE.data || OVFILE);
const MAPS = 全.maps || {};

const usedN = (cid, sku) => (USED[cid] || {})[sku] || 0;
const IDX = M.buildIndex(D, usedN);
const ciOf = {}; D.custs.forEach((c, i) => { ciOf[c[0]] = i; });

/* 两个上下文：一个带学习，一个不带 —— 好比出「学过的」和「凭规矩」两个答案 */
function 上下文(maps) {
  const OV = { maps: maps, gmap: 全.gmap || {} };
  return {
    DATA: D, IDX, OV, usedN,
    seedLookup: (cid, t, u) => P.seedLookup(SEED[cid], t, u),
    learnedSku: (ci, t, u) => P.learnedLookup(OV.maps, D.custs[ci][0], t, u,
      sku => IDX.byCust[ci].sku[sku] === undefined ? null : D.items[IDX.byCust[ci].sku[sku]][3]),
    defaultSide: window.GM_DEFAULT_SIDE
  };
}
const 带学 = 上下文(MAPS);
const 凭规矩 = 上下文({});

/* 键的形状：客户||单位||词 */
const 条 = [];
Object.keys(MAPS).forEach(k => {
  const p = k.split("||");
  if (p.length < 3) return;
  const cid = p[0], unit = p[1], 词 = p.slice(2).join("||");
  if (!词) return;
  const ci = ciOf[cid];
  if (ci === undefined) return;
  const b = IDX.byCust[ci];
  const sku = MAPS[k];
  if (!b || b.sku[sku] === undefined) { 条.push({ cid, unit, 词, 坏: "指向的货这家已经没有了", sku }); return; }
  条.push({ cid, ci, unit, 词, sku, i: b.sku[sku] });
});

L("══════════════════════════════════════");
L("学过的对照体检　第 " + (OVFILE.version === undefined ? "?" : OVFILE.version) + " 版");
L("══════════════════════════════════════");
L("学过的键　" + Object.keys(MAPS).length + " 条　涉及 " +
  new Set(条.map(x => x.cid)).size + " 家客户");
L("");

/* ── ① 指向的货没了 ── */
const 没了 = 条.filter(x => x.坏);
if (没了.length) {
  L("⛔ " + 没了.length + " 条指向的货，这家客户名下已经找不到了：");
  没了.slice(0, 10).forEach(x => L("   " + x.cid + " 「" + x.词 + "」→ " + x.sku));
  L("");
}

/* ── ② 学过的 vs 凭规矩，答案不一样的 ── */
const 不一样 = [];
条.filter(x => !x.坏).forEach(x => {
  /* 拿好几个数量各问一遍。只用一个数量会误报 ——
     「按斤还是按板」那条规矩要拿数量去除板型，10斤 正好被 5斤板 整除，
     结果就成了板货，跟学过的斤货对不上，其实两边都没错。
     几个数量都不一样，才是真的对不上。 */
  const 量 = /^(斤|公斤)$/.test(x.unit) ? [7, 10, 13] : [1, 2, 3];
  let a = null, c = null, 全不同 = true;
  for (const q of 量) {
    const a1 = M.matchOne(带学, x.ci, x.词, x.unit, null, q);
    const c1 = M.matchOne(凭规矩, x.ci, x.词, x.unit, null, q);
    if (a1.i < 0 || c1.i < 0) { 全不同 = false; break; }
    if (D.items[a1.i][6] === D.items[c1.i][6]) { 全不同 = false; break; }
    if (!a) { a = a1; c = c1; }
  }
  if (!全不同 || !a) return;
  const A = D.items[a.i], C2 = D.items[c.i];
  不一样.push({
    cid: x.cid, 客户: D.custs[x.ci][1], 词: x.词, unit: x.unit,
    学: A[2] + "[" + A[3] + "]¥" + A[4],
    规: C2[2] + "[" + C2[3] + "]¥" + C2[4],
    单位不同: A[3] !== C2[3],
    差价: Math.abs((+A[4] || 0) - (+C2[4] || 0)),
    规矩敢拍板: M.commits(c.how)
  });
});

L("── 学过的 vs 现在的规矩 ──");
L("对得上　" + (条.filter(x => !x.坏).length - 不一样.length) + " 条");
L("对不上　" + 不一样.length + " 条");
if (不一样.length) {
  /* 只有「规矩本来就敢拍板、而且结果不同」才值得管 ——
     规矩本来就要问人的，学过的正好替人回答了，那是学习该干的活 */
  const 要紧 = 不一样.filter(x => x.规矩敢拍板 && (x.单位不同 || x.差价 >= 0.5));
  L("其中值得看一眼的　" + 要紧.length + " 条（规矩本来就认得，但学的跟规矩不一样）");
  L("");
  if (要紧.length) {
    要紧.slice(0, 20).forEach(x => {
      L("   " + x.客户 + "　「" + x.词 + "」" + (x.unit ? "[" + x.unit + "]" : ""));
      L("      学过的 " + x.学);
      L("      凭规矩 " + x.规 + (x.单位不同 ? "　⚠单位都不一样" : "　差价 ¥" + x.差价.toFixed(2)));
    });
    if (要紧.length > 20) L("   …还有 " + (要紧.length - 20) + " 条");
  } else {
    L("   （剩下的都是「规矩本来就要问人、学过的替人答了」—— 那正是学习该干的活）");
  }
}
L("");

/* ── ③ 同一家里，两个词学到同一个货 ── */
const 撞 = {};
条.filter(x => !x.坏).forEach(x => {
  const k = x.cid + "|" + x.sku;
  (撞[k] = 撞[k] || new Set()).add(x.词);
});
const 疑 = Object.keys(撞).filter(k => 撞[k].size >= 2)
  .map(k => ({ cid: k.split("|")[0], sku: k.split("|")[1], 词: [...撞[k]] }))
  /* 光是「带单位/不带单位」两条键不算，那是正常写法 */
  .filter(x => new Set(x.词.map(w => P.norm(w))).size >= 2);
L("── 同一家里，两个不同的词学到了同一个货 ──");
L(疑.length + " 处（不一定错，但值得瞄一眼）");
疑.slice(0, 12).forEach(x => {
  const ci = ciOf[x.cid], b = IDX.byCust[ci];
  const it = D.items[b.sku[x.sku]];
  L("   " + D.custs[ci][1] + "　" + x.词.join(" / ") + "　都指向　" + it[2] + "[" + it[3] + "]¥" + it[4]);
});
L("");
process.exit(0);
