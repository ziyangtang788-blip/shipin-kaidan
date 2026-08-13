/* 会不会「自信地认错」—— 全量自检
   node 体检-会不会认错.js

   拿价格库里每一条叫法，模拟客户可能怎么写（原样 / 去规格 / 去牌子 / 又去牌子又去规格），
   带单位和不带单位各跑一遍，看匹配器会不会「打了勾但配错商品」。

   验收标准只有一条：自信地认错 = 0。
   存疑和认不出不算事故 —— 那些会弹出来让人点，点完就学会了。

   ⚠ 这个脚本跑的是 引擎-匹配.js，跟开单台页面同一份代码。
      以前这里自己抄了一份 matchOne，页面改了这里没改，
      结果页面里 core.slice() 每次都抛异常、整个匹配全废，
      这个体检却一路绿灯。抄本害人，别再抄。 */
const fs = require("fs");
global.window = {};
require("./数据-价格库.js");
require("./对照-预置.js");
require("./引擎-解析.js");
require("./引擎-匹配.js");
require("./数据-常用规格.js");

const D = global.window.GM_DATA, SEED = global.window.GM_SEED || {};
const P = global.window.GM_PARSE, M = global.window.GM_MATCH;
const USED = global.window.GM_USED || {};
const bare = P.bare;

const usedN = (cid, sku) => (USED[cid] || {})[sku] || 0;
const IDX = M.buildIndex(D, usedN);
/* 体检不带「学过的」—— 那是每台电脑各自的记录，这里只考出厂状态 */
const OV = { maps: {}, gmap: {} };
const C = {
  DATA: D, IDX, OV, usedN,
  seedLookup: (cid, text, unit) => P.seedLookup(SEED[cid], text, unit),
  learnedSku: (ci, text, unit) => P.learnedLookup(OV.maps, D.custs[ci][0], text, unit,
    sku => IDX.byCust[ci].sku[sku] === undefined ? null : D.items[IDX.byCust[ci].sku[sku]][3]),
  defaultSide: window.GM_DEFAULT_SIDE
};
const match = (ci, text, unit) => M.matchOne(C, ci, text, unit);

/* 哪些算「工具自己拍板了」，名单在 引擎-匹配.js 里，跟页面共用一份。
   页面拿它决定哪一行弹下拉，这里拿它决定哪一条算静默事故 ——
   两边必须是同一份，否则页面放行了、体检还当它会问人，事故就漏过去。 */
const commits = M.commits;

const stat = { 试: 0, 对: 0, 存疑: 0, 认不出: 0 };
const bad = [];

D.custs.forEach(function (c, ci) {
  const b = IDX.byCust[ci]; if (!b) return;
  b.list.forEach(function (i) {
    const it = D.items[i], alias = it[2], unit = it[3];
    /* 客户可能怎么简写这个叫法 */
    const forms = {};
    forms[alias] = 1;
    const nb = bare(alias); if (nb) forms[nb] = 1;
    /* 客户表上基本不写牌子。原来只试了「尝元/益群」两个，太窄 ——
       九龙、阳山、花泉、华晨、柴火这些一样天天被省掉，得一起试。 */
    const BRANDS = /^(尝元|益群|九龙|阳山|花泉|华晨|柴火|华汇|安井|花石|优选|特级|普通|新鲜|靓|鲜)/;
    const noBrand = String(alias).replace(BRANDS, "").trim(); if (noBrand) forms[noBrand] = 1;
    const nb2 = bare(noBrand); if (nb2) forms[nb2] = 1;
    Object.keys(forms).forEach(function (w) {
      if (!w) return;
      [unit, ""].forEach(function (u) {
        stat.试++;
        const r = match(ci, w, u);
        if (!r || r.i < 0) { stat.认不出++; return; }
        const got = D.items[r.i];
        if (got[1] === it[1] && got[3] === it[3]) { stat.对++; return; }   /* 同商品同单位才算对 */
        if (!commits(r.how)) { stat.存疑++; return; }
        bad.push({
          cust: D.custs[ci][1], cid: D.custs[ci][0], word: w, unit: u || "(无单位)",
          want: alias + " " + unit + " ¥" + it[4],
          got: got[2] + " " + got[3] + " ¥" + got[4], how: r.how,
          diff: Math.abs((+got[4] || 0) - (+it[4] || 0)),
          /* 这家客户最近真的下过「应为」那个品吗？没下过的话这条错只存在于理论上 */
          wantUsed: usedN(D.custs[ci][0], it[6]), gotUsed: usedN(D.custs[ci][0], got[6])
        });
      });
    });
  });
});

console.log("\n全量自检：" + stat.试 + " 次模拟（" + D.custs.length + " 个客户 × 每条叫法的 4 种写法 × 带/不带单位）");
console.log("  ✅ 认对        " + stat.对);
console.log("  ⚠ 存疑/认不出 " + (stat.存疑 + stat.认不出) + "　（会弹下拉让人选，可接受）");
console.log("  ❌ 自信地认错  " + bad.length + "　← 这些是静默事故，必须堵\n");

bad.sort((a, b2) => b2.diff - a.diff);
const real = bad.filter(x => x.wantUsed > 0);
console.log("  其中 真会赔钱的 " + real.length + " 条（客户最近确实下过那个品）");
console.log("       理论风险   " + (bad.length - real.length) + " 条（那个品客户根本没买过）\n");
if (bad.length) {
  console.log("按「差价」排的前 30 条（差价越大，一单错得越离谱）：");
  bad.slice(0, 30).forEach(function (x, k) {
    console.log("  " + String(k + 1).padStart(2) + ". [" + x.how + "] 差 ¥" + x.diff.toFixed(2) +
      "　「" + x.word + "」[" + x.unit + "]" + (x.wantUsed > 0 ? "　★真会赔钱" : "　(客户没买过这品)"));
    console.log("        应为 " + x.want + "　实得 " + x.got + "　近期下单 " + x.wantUsed + " vs " + x.gotUsed);
    console.log("        客户 " + x.cid + " " + x.cust);
  });
  const byHow = {};
  bad.forEach(x => { byHow[x.how] = (byHow[x.how] || 0) + 1; });
  console.log("\n  按环节分布：" + Object.keys(byHow).map(k => k + " " + byHow[k]).join("　"));
  console.log("  其中「单位没识别出来」造成的：" + bad.filter(x => x.unit === "(无单位)").length + " / " + bad.length);
  process.exit(1);
}
console.log("✅ 一条静默认错都没有。");
