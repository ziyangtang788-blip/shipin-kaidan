/* 「教一次就学会」—— 拿真实下单表的词做端到端演练
   node 测试-学会没有.js

   用的词不是编的：是 对照-预置.js 里那 300 多个键，
   全部来自工厂发来的下单表图片（子任务读图抄下来的原话），
   再加上客户常见的几种简写（不写牌子、不写规格）。

   演练的就是老板实际的操作：
     第一遍  —— 弹出来的，人点一下选对的（= 教它）
     第二遍  —— 同样的词再来一次，必须全部自己认得，一次都不用再点

   这跑的是 引擎-匹配.js + 引擎-解析.js，跟开单台页面同一份代码。 */
global.window = {};
require("./数据-价格库.js");
require("./对照-预置.js");
require("./引擎-解析.js");
require("./引擎-匹配.js");
require("./数据-常用规格.js");

const D = window.GM_DATA, SEED = window.GM_SEED || {}, P = window.GM_PARSE, M = window.GM_MATCH;
const USED = window.GM_USED || {};
const usedN = (cid, sku) => (USED[cid] || {})[sku] || 0;
const IDX = M.buildIndex(D, usedN);

function mkCtx(OV) {
  return {
    DATA: D, IDX, OV, usedN,
    seedLookup: (cid, text, unit) => P.seedLookup(SEED[cid], text, unit),
    learnedSku: (ci, text, unit) => P.learnedLookup(OV.maps, D.custs[ci][0], text, unit,
      sku => IDX.byCust[ci].sku[sku] === undefined ? null : D.items[IDX.byCust[ci].sku[sku]][3]),
    defaultSide: window.GM_DEFAULT_SIDE
  };
}
const ciOf = sid => { let x = -1; D.custs.forEach((c, i) => { if (c[0] === sid) x = i; }); return x; };
const asks = r => (!r || r.i < 0 || r.how === "fuzzy");
/* 模拟人在某一行点了「就是这个」—— 跟开单台里 learnPair 走同一条写入路径 */
function teach(OV, t) {
  const it = D.items[t.want], b = IDX.byCust[t.ci];
  P.learnWrite(OV.maps, OV.gmap, t.sid, t.word, it[6], t.unit, it[1],
    (ba, u) => M.bareRisky(D, b, ba, u));
}

/* ---- 把预置表摊成「客户 / 表上写的词 / 单位 / 正确答案」---- */
const CASES = [];
Object.keys(SEED).forEach(sid => {
  const ci = ciOf(sid); if (ci < 0) return;
  const b = IDX.byCust[ci];
  Object.keys(SEED[sid]).forEach(k => {
    const v = SEED[sid][k];
    /* 预置的值是「叫法」不是 SKU 码，得按叫法查回索引 */
    const put = (branch, alias) => {
      const ix = b.alias[P.norm(alias)]; if (ix === undefined) return;
      /* 分支键有两种：
           "板"/"斤"/"盒" 是单位；
           "7"/"14"/"33"  是规格数字 —— 它是从下单表原文里取的，不是单位。
         规格那种，测试用的词得把数字带上（表上真就写「客家豆腐14斤/板」），
         否则 7斤板和14斤板会被压成同一个词，自相矛盾。 */
      const spec = /^\d/.test(branch);
      CASES.push({
        sid, ci,
        word: spec ? (k + branch) : k,
        unit: spec ? D.items[ix][3] : (branch === "*" ? "" : branch),
        want: ix
      });
    };
    if (typeof v === "string") { const ix = b.alias[P.norm(v)]; if (ix !== undefined) put(D.items[ix][3], v); }
    else Object.keys(v).forEach(u => put(u, v[u]));
  });
});

let pass = 0, fail = 0;
const bad = [];

/* ================================================================
   演练一：一遍一遍地教，第二遍必须全会
   ================================================================ */
console.log("\n【演练一：第一遍人点一下教它，第二遍必须全部自己认得】");
console.log("素材：" + CASES.length + " 条真实下单表词汇，来自 " + Object.keys(SEED).length + " 家客户\n");

const OV = { maps: {}, gmap: {} };
const C = mkCtx(OV);

let ask1 = 0, wrong1 = 0, ok1 = 0;
const w1 = [];
CASES.forEach(t => {
  const r = M.matchOne(C, t.ci, t.word, t.unit);
  if (asks(r)) { ask1++; }
  else if (r.i !== t.want) { wrong1++; w1.push({ t, r }); }
  else ok1++;
  /* 人在这一行点了正确答案（认对的那些不动，模拟人不会去改已经对的） */
  if (asks(r) || r.i !== t.want) teach(OV, t);
});
console.log("  第一遍：自己认对 " + ok1 + "　弹出来问 " + ask1 + "　认错 " + wrong1);
/* 第一遍的「认错」全都是边教边跑造成的：前面刚教的那条，
   把后面同名的行带过去了。这里逐条列出来看清楚，别当成噪音放过。 */
w1.forEach(x => {
  const g = D.items[x.r.i];
  console.log("        认错[" + x.r.how + "] " + x.t.sid + " 「" + x.t.word + "」[" + (x.t.unit || "无单位") +
    "]　应为 " + D.items[x.t.want][2] + " ¥" + D.items[x.t.want][4] +
    "　实得 " + g[2] + " ¥" + g[4]);
});

let ask2 = 0, wrong2 = 0, ok2 = 0;
const still = [];
CASES.forEach(t => {
  const r = M.matchOne(C, t.ci, t.word, t.unit);
  if (asks(r)) { ask2++; still.push({ t, r, why: "还在问" }); }
  else if (r.i !== t.want) { wrong2++; still.push({ t, r, why: "认错" }); }
  else ok2++;
});
console.log("  第二遍：自己认对 " + ok2 + "　弹出来问 " + ask2 + "　认错 " + wrong2);

/* ⛔ 2026-08-18 老板拍板：【单位不一样一律弹出来让人挑，教过也不例外】。
   原话：「不要不要不要，就是按照他下单的单位来。他单位里面有就有，
   仓库里面有这个品就有；没这个品、没这个单位，就直接跳出来让他自己选择。」
   所以「客户写盒、货按包卖」这种，教一百遍也还是要问一句 —— 那是故意的，
   老板 8/18 在 A / B 里选的就是 A（就这样，每次问）。
   ⚠ 认错必须还是 0；而且还在问的必须【全是单位对不上】那种。
     哪天冒出一条「单位一样却还在问」，那才是真没学会，照旧红灯。 */
const 单位对不上的 = still.filter(x => {
  const g = (x.r && x.r.i >= 0) ? D.items[x.r.i] : null;
  return g && String(x.t.unit || "") !== String(g[3] || "");
});
if (wrong2 === 0 && still.length === 单位对不上的.length) {
  pass++;
  console.log("  ✅ 教一遍就学会了；还在问的 " + still.length +
              " 条全是【单位对不上】那种（8/18 老板定的，故意问）");
}
else {
  fail++;
  console.log("  ❌ 教过了还没学会 " + still.length + " 条：");
  still.slice(0, 15).forEach(x => {
    const g = (x.r && x.r.i >= 0) ? D.items[x.r.i] : null;
    console.log("     " + x.why + "　" + x.t.sid + " 「" + x.t.word + "」[" + (x.t.unit || "无单位") + "]" +
      "　应为 " + D.items[x.t.want][2] + "　实得 " + (g ? g[2] + " (" + x.r.how + ")" : "认不出"));
  });
}

/* ================================================================
   演练二：教了新的，会不会把旧的冲掉
   —— 这是「教了很多次还学不会」的真正病根
   ================================================================ */
console.log("\n【演练二：同一个词、不同单位，教一个会不会把另一个冲掉】");
{
  /* 真实数据里找：同一个客户、同一个词，在两个不同单位下指向不同商品 */
  const byWord = {};
  CASES.forEach(t => {
    const k = t.sid + "|" + P.norm(t.word);
    (byWord[k] = byWord[k] || []).push(t);
  });
  const clashes = [];
  Object.keys(byWord).forEach(k => {
    const g = byWord[k];
    const units = {}; g.forEach(t => { units[t.unit] = t.want; });
    const us = Object.keys(units).filter(u => u !== "");
    if (us.length > 1 && new Set(us.map(u => units[u])).size > 1) clashes.push(g);
  });
  console.log("  真实数据里这种词有 " + clashes.length + " 组");

  let broke = 0;
  clashes.forEach(g => {
    const OV2 = { maps: {}, gmap: {} }, C2 = mkCtx(OV2);
    const us = g.filter(t => t.unit !== "");
    /* 一个一个教过去，每教一个就回头把之前教过的全部复查一遍 */
    for (let a = 0; a < us.length; a++) {
      teach(OV2, us[a]);
      for (let b2 = 0; b2 <= a; b2++) {
        const r = M.matchOne(C2, us[b2].ci, us[b2].word, us[b2].unit);
        if (!r || r.i !== us[b2].want) {
          broke++;
          if (broke <= 8) console.log("     ❌ " + us[b2].sid + " 「" + us[b2].word + "」[" + us[b2].unit +
            "] 教完「" + us[a].unit + "」那条之后就丢了　应为 " + D.items[us[b2].want][2] +
            "　实得 " + ((r && r.i >= 0) ? D.items[r.i][2] : "认不出"));
        }
      }
    }
  });
  if (!broke) { pass++; console.log("  ✅ 教一个不会冲掉另一个，每个单位各记各的"); }
  else { fail++; console.log("  ❌ 有 " + broke + " 次「教了新的、旧的丢了」"); }
}

/* ================================================================
   演练三：教过之后，别的行会不会被带偏
   ================================================================ */
console.log("\n【演练三：教完之后，本来就认对的行有没有被带偏】");
{
  const OV3 = { maps: {}, gmap: {} }, C3 = mkCtx(OV3);
  /* 先记下「什么都没教」时哪些是认对的 */
  const before = CASES.map(t => {
    const r = M.matchOne(C3, t.ci, t.word, t.unit);
    return (!asks(r) && r.i === t.want) ? t.want : null;
  });
  /* 把所有该教的都教一遍 */
  CASES.forEach(t => teach(OV3, t));
  let lost = 0;
  CASES.forEach((t, k) => {
    if (before[k] === null) return;
    const r = M.matchOne(C3, t.ci, t.word, t.unit);
    if (!r || r.i !== before[k]) {
      lost++;
      if (lost <= 8) console.log("     ❌ " + t.sid + " 「" + t.word + "」[" + (t.unit || "无单位") +
        "] 教了一圈之后反而变了：" + D.items[before[k]][2] + " → " +
        ((r && r.i >= 0) ? D.items[r.i][2] : "认不出"));
    }
  });
  if (!lost) { pass++; console.log("  ✅ 全部教完一圈，原来对的一条没变"); }
  else { fail++; console.log("  ❌ 有 " + lost + " 条被带偏了"); }
}

/* ================================================================
   演练四：教错了能不能改回来
   ================================================================ */
console.log("\n【演练四：教错了，改一次就得改过来】");
{
  const OV4 = { maps: {}, gmap: {} }, C4 = mkCtx(OV4);
  let bad4 = 0, n4 = 0;
  CASES.slice(0, 300).forEach(t => {
    const b = IDX.byCust[t.ci];
    /* 随便找一个「不是正确答案」的同单位商品，先教错 */
    const wrong = b.list.find(i => i !== t.want && D.items[i][3] === D.items[t.want][3]);
    if (wrong === undefined) return;
    n4++;
    let it = D.items[wrong];
    P.learnWrite(OV4.maps, OV4.gmap, t.sid, t.word, it[6], t.unit, it[1]);
    const r1 = M.matchOne(C4, t.ci, t.word, t.unit);
    /* 再教一次正确的 */
    it = D.items[t.want];
    P.learnWrite(OV4.maps, OV4.gmap, t.sid, t.word, it[6], t.unit, it[1]);
    const r2 = M.matchOne(C4, t.ci, t.word, t.unit);
    if (!r1 || r1.i !== wrong || !r2 || r2.i !== t.want) {
      bad4++;
      if (bad4 <= 6) console.log("     ❌ " + t.sid + " 「" + t.word + "」 改不回来：" +
        "先教错→" + ((r1 && r1.i >= 0) ? D.items[r1.i][2] : "?") +
        "　再教对→" + ((r2 && r2.i >= 0) ? D.items[r2.i][2] : "?") + "　应为 " + D.items[t.want][2]);
    }
  });
  if (!bad4) { pass++; console.log("  ✅ 试了 " + n4 + " 条，教错的都能一次改回来"); }
  else { fail++; console.log("  ❌ 有 " + bad4 + " 条改不回来"); }
}

console.log("\n══════════════════════════");
if (fail) { console.log("有 " + fail + " 项没过（通过 " + pass + " 项）"); process.exit(1); }
console.log("全部通过：" + pass + " 项");
