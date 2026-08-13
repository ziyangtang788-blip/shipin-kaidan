/* 对词工具：把某客户下单表上的词跑一遍匹配链，报告哪些认不出/会认错
   用法：node 工具-对词.js S2979 "猪红|斤" "攸县香干|斤" "大板豆腐|板" ...
        （词|单位，单位可省）
   或：  node 工具-对词.js S2979 --file 词表.txt   （一行一个「词|单位」）

   跑的是 引擎-匹配.js，跟开单台页面同一份代码。 */
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
const usedN = (cid, sku) => (USED[cid] || {})[sku] || 0;

const SID = process.argv[2];
if (!SID) { console.log("用法: node 工具-对词.js S2979 \"猪红|斤\" ..."); process.exit(1); }
let words = process.argv.slice(3);
if (words[0] === "--file") words = fs.readFileSync(words[1], "utf8").split("\n").map(s => s.trim()).filter(Boolean);

let CI = -1; D.custs.forEach((c, i) => { if (c[0] === SID) CI = i; });
if (CI < 0) { console.log("价格库里没有 " + SID); process.exit(1); }

const IDX = M.buildIndex(D, usedN);
const OV = { maps: {}, gmap: {} };
const C = {
  DATA: D, IDX, OV, usedN,
  seedLookup: (cid, text, unit) => P.seedLookup(SEED[cid], text, unit),
  learnedSku: (ci, text, unit) => P.learnedLookup(OV.maps, D.custs[ci][0], text, unit,
    sku => IDX.byCust[ci].sku[sku] === undefined ? null : D.items[IDX.byCust[ci].sku[sku]][3]),
  defaultSide: global.window.GM_DEFAULT_SIDE
};
const LIST = IDX.byCust[CI].list;
const HOW = { learned: "学过的", seed: "预置", exact: "叫法精确", prod: "商品名精确", loose: "光名字", gmap: "叫法本", cross: "别家这么叫" };

console.log("\n" + SID + "  " + D.custs[CI][1] + "（在售 " + LIST.length + " 项）");
console.log("要对的词 " + words.length + " 个\n");
let ok = 0, doubt = 0, none = 0;
const gaps = [];
words.forEach(w => {
  const [text, unit] = String(w).split("|");
  const r = M.matchOne(C, CI, text, (unit || "").trim());
  if (!r || r.i < 0) { none++; gaps.push({ text, unit, why: "认不出" }); console.log("  ❌ 认不出   「" + text + "」" + (unit ? "[" + unit + "]" : "")); return; }
  const it = D.items[r.i];
  if (r.how === "fuzzy") {
    doubt++; gaps.push({ text, unit, why: "存疑", guess: it[2] });
    console.log("  ⚠ 存疑    「" + text + "」" + (unit ? "[" + unit + "]" : "") + " → " + it[2] + " " + it[3] + " ¥" + it[4] + "（" + (r.cands || []).length + " 个候选，默认选中这条）");
  } else {
    ok++;
    console.log("  ✅ " + (HOW[r.how] || r.how).padEnd(6, "　") + "「" + text + "」" + (unit ? "[" + unit + "]" : "") + " → " + it[2] + " " + it[3] + " ¥" + it[4]);
  }
});
console.log("\n──────────────");
console.log("认对 " + ok + " / 存疑 " + doubt + " / 认不出 " + none);
if (gaps.length) {
  console.log("\n要补预置的 " + gaps.length + " 个：");
  gaps.forEach(g => console.log("    \"" + g.text + "\": \"？\"," + (g.guess ? "   // 机器猜 " + g.guess : "")));
  console.log("\n该客户的全部在售商品（挑答案用）：");
  LIST.forEach(i => { const it = D.items[i]; console.log("    「" + it[2] + "」 [" + it[3] + "] ¥" + it[4]); });
}
