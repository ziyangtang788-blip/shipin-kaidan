/* 在命令行里跑一整张单，看每一行会被认成什么
   用法：node 工具-试一单.js S2949 单据.txt
        node 工具-试一单.js S2949           （不给文件就读内置的样例）

   跑的是 引擎-解析.js + 引擎-匹配.js，跟开单台页面同一份代码，
   所以这里看到什么，页面上就是什么。 */
const fs = require("fs");
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

const SID = process.argv[2];
if (!SID) { console.log("用法: node 工具-试一单.js S2949 [单据.txt]"); process.exit(1); }
let CI = -1; D.custs.forEach((c, i) => { if (c[0] === SID) CI = i; });
if (CI < 0) { console.log("价格库里没有 " + SID); process.exit(1); }

const text = process.argv[3] ? fs.readFileSync(process.argv[3], "utf8") : `
水豆腐（5斤装） 3板
水豆腐（7斤装） 2板
猪红 12斤
油炸豆腐 5斤
烟香干 8斤
大豆泡 6斤
`;

/* 学过的对照：命令行这边从空白开始，模拟一台刚打开的电脑 */
const OV = { maps: {}, gmap: {} };
const C = {
  DATA: D, IDX, OV, usedN,
  seedLookup: (cid, t, u) => P.seedLookup(SEED[cid], t, u),
  learnedSku: (ci, t, u) => P.learnedLookup(OV.maps, D.custs[ci][0], t, u,
    s => IDX.byCust[ci].sku[s] === undefined ? null : D.items[IDX.byCust[ci].sku[s]][3])
};
const HOW = { learned: "已学会", seed: "预置", exact: "叫法精确", prod: "商品名精确", loose: "光名字", gmap: "叫法本", cross: "别家这么叫" };

const lines = P.parseOrder(text);
console.log("\n══ " + SID + " " + D.custs[CI][1] + " ══");
console.log("解析出 " + lines.length + " 行\n");
let total = 0, ask = 0;
lines.forEach((L, k) => {
  const r = M.matchOne(C, CI, L.text, L.unit || "");
  const n = String(k + 1).padStart(2);
  if (!r || r.i < 0) {
    ask++;
    console.log(n + ". 「" + L.text + "」 " + L.qty + (L.unit || "") + "\n      ❌ 认不出 —— 会弹出来让你选");
    return;
  }
  const it = D.items[r.i], money = (+it[4] || 0) * (L.qty || 0);
  if (M.commits(r.how)) {
    total += money;
    console.log(n + ". 「" + L.text + "」 " + L.qty + (L.unit || "") +
      "\n      ✅ " + (HOW[r.how] || r.how) + " → " + it[2] + " " + it[3] + " ¥" + it[4] +
      "　小计 " + money.toFixed(2));
  } else {
    ask++;
    console.log(n + ". 「" + L.text + "」 " + L.qty + (L.unit || "") +
      "\n      ⚠ 存疑 —— 会弹出来让你选，默认停在：" + it[2] + " " + it[3] + " ¥" + it[4] +
      "（共 " + (r.cands || []).length + " 个候选）");
  }
});
console.log("\n──────────────");
console.log("能直接开的合计 ¥" + total.toFixed(2) + "　要人点一下的 " + ask + " 行");
