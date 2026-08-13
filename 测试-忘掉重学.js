/* 教错了能不能改回来 —— node 测试-忘掉重学.js

   老板 8/2 要正式开始用，问的就是这一条：
     「他学错了，我可以把它忘掉、重学，以后就不会错了吧？」

   所以这里不测函数，测的是【人在页面上的那套动作】：
     看到认错 → 点「✕ 忘掉重学」→ 在下拉里挑对的 → 以后一直对
   还有一条更常走的近路：
     看到认错 → 直接在下拉里挑对的（不点忘掉）→ 也得立刻生效

   页面里的 learnPair / forgetPair / learnedKeys 直接抠出来跑，不另抄一份。 */
const fs = require("fs"), path = require("path");
global.window = {};
require("./数据-价格库.js");
require("./对照-预置.js");
require("./引擎-解析.js");
require("./引擎-匹配.js");
require("./数据-常用规格.js");
const D = window.GM_DATA, SEED = window.GM_SEED || {}, P = window.GM_PARSE, M = window.GM_MATCH;
const USED = window.GM_USED || {};

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, got, want) {
  if (got === want) pass++;
  else { fail++; L("  ✗ " + name + "\n      应该 " + want + "\n      实际 " + got); }
}

/* ---- 把页面里那三个函数抠出来 ---- */
const H = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
function grab(name) {
  const i = H.indexOf("function " + name + "(");
  if (i < 0) throw new Error("页面里找不到 " + name + "（改名了？）");
  let d = 0;
  for (let k = H.indexOf("{", i); k < H.length; k++) {
    if (H[k] === "{") d++;
    else if (H[k] === "}") { d--; if (!d) return H.slice(i, k + 1); }
  }
  throw new Error(name + " 括号不闭合");
}

const usedN = (cid, sku) => (USED[cid] || {})[sku] || 0;
const IDX = M.buildIndex(D, usedN);
const OV = { maps: {}, gmap: {}, gone: {}, dirty: {} };
const norm = P.norm, bare = P.bare, lkey = P.lkey;
const custId = ci => D.custs[ci][0];
const ovSave = () => { };

const api = new Function(
  "IDX", "OV", "DATA", "custId", "norm", "bare", "lkey", "ovSave", "window",
  grab("ovTouch") + "\n" + grab("ovForget") + "\n" +
  grab("learnPair") + "\n" + grab("learnedKeys") + "\n" + grab("forgetPair") +
  "\nreturn {learnPair:learnPair, learnedKeys:learnedKeys, forgetPair:forgetPair};"
)(IDX, OV, D, custId, norm, bare, lkey, ovSave, window);

/* ---- 匹配上下文：跟页面同一份 ---- */
const C = {
  DATA: D, IDX, OV, usedN,
  seedLookup: (cid, text, unit) => P.seedLookup(SEED[cid], text, unit),
  learnedSku: (ci, text, unit) => P.learnedLookup(OV.maps, D.custs[ci][0], text, unit,
    sku => IDX.byCust[ci].sku[sku] === undefined ? null : D.items[IDX.byCust[ci].sku[sku]][3]),
  defaultSide: window.GM_DEFAULT_SIDE
};
/* 认到哪个商品（返回该客户的叫法），认不出返回 "认不出" */
function see(ci, text, unit) {
  const r = M.matchOne(C, ci, text, unit || "");
  return (r && r.i >= 0) ? D.items[r.i][2] : "认不出";
}
/* 这一步系统敢不敢自己拍板（false = 会弹出来问人） */
function sure(ci, text, unit) {
  const r = M.matchOne(C, ci, text, unit || "");
  return !!(r && M.commits(r.how));
}
const skuOf = (ci, alias) => {
  const b = IDX.byCust[ci];
  for (const i of b.list) if (D.items[i][2] === alias) return D.items[i][6];
  throw new Error("这家客户没有「" + alias + "」");
};
const ciOf = id => { let k = -1; D.custs.forEach((c, i) => { if (c[0] === id) k = i; }); if (k < 0) throw new Error("没有 " + id); return k; };

/* ════════ 拿一家真客户来演 ════════ */
const CI = ciOf("S2963");                       /* 鸿益：板货多、价差大，最容易教错 */
const 小板 = "尝元小板豆腐（5斤）", 大板 = "尝元大板豆腐（14-15斤）";

L("── ① 教错了，忘掉，重教 ──");
api.learnPair(CI, "神秘豆腐", skuOf(CI, 大板), "板");
ok("先教错：认成大板", see(CI, "神秘豆腐", "板"), 大板);
ok("教完就敢自己拍板", sure(CI, "神秘豆腐", "板"), true);

ok("「忘掉重学」按钮该出现（说明系统知道这词学过）",
  api.learnedKeys(CI, "神秘豆腐", "板").length > 0, true);

api.forgetPair(CI, "神秘豆腐", "板");
ok("忘掉之后回到没学过（不是留着错的）", see(CI, "神秘豆腐", "板"), "认不出");
ok("忘掉之后按钮该消失", api.learnedKeys(CI, "神秘豆腐", "板").length, 0);

api.learnPair(CI, "神秘豆腐", skuOf(CI, 小板), "板");
ok("重教成小板", see(CI, "神秘豆腐", "板"), 小板);
ok("重教完还是敢拍板", sure(CI, "神秘豆腐", "板"), true);
api.forgetPair(CI, "神秘豆腐", "板");

L("");
L("── ② 不点「忘掉」，直接在下拉里换一个（更常走的路）──");
api.learnPair(CI, "怪名字豆腐", skuOf(CI, 大板), "板");
ok("先教成大板", see(CI, "怪名字豆腐", "板"), 大板);
api.learnPair(CI, "怪名字豆腐", skuOf(CI, 小板), "板");
ok("直接改教成小板，立刻生效", see(CI, "怪名字豆腐", "板"), 小板);
api.learnPair(CI, "怪名字豆腐", skuOf(CI, 大板), "板");
ok("再改回大板也行（可以来回改）", see(CI, "怪名字豆腐", "板"), 大板);
api.forgetPair(CI, "怪名字豆腐", "板");

L("");
L("── ③ 教的要盖过预置对照 ──");
/* 预置里 鸿益「炸豆腐」→「炸豆腐（斤）」。假设它其实错了，人改成别的，必须听人的。 */
const seedWord = "炸豆腐";
const seedGot = see(CI, seedWord, "斤");
ok("预置本来认成 炸豆腐（斤）", seedGot, "炸豆腐（斤）");
api.learnPair(CI, seedWord, skuOf(CI, "尝元小豆泡"), "斤");
ok("人教了之后，听人的（盖过预置）", see(CI, seedWord, "斤"), "尝元小豆泡");
api.forgetPair(CI, seedWord, "斤");
ok("忘掉之后，预置回来（不是变成认不出）", see(CI, seedWord, "斤"), seedGot);

L("");
L("── ④ 两个单位分开记，互不牵连 ──");
/* 「教了很多次为什么还学不会」就是这里出的：教板的把斤的冲掉了 */
api.learnPair(CI, "两用豆腐", skuOf(CI, 小板), "板");
api.learnPair(CI, "两用豆腐", skuOf(CI, "水豆腐（斤）"), "斤");
ok("板 → 小板", see(CI, "两用豆腐", "板"), 小板);
ok("斤 → 水豆腐（斤）（没被板的冲掉）", see(CI, "两用豆腐", "斤"), "水豆腐（斤）");
api.forgetPair(CI, "两用豆腐", "板");
ok("忘掉板的，斤的还在", see(CI, "两用豆腐", "斤"), "水豆腐（斤）");
ok("板的已经没了", see(CI, "两用豆腐", "板"), "认不出");
api.forgetPair(CI, "两用豆腐", "斤");

L("");
L("── ⑤ 教一个规格，不能带歪另一个规格 ──");
/* 「水豆腐（5斤）」和「水豆腐（7斤）」剥掉规格后光名字一样，
   教了一个就把另一个也顶掉的话，等于教一次错一片 */
const CI2 = ciOf("S2930");                     /* 蔬源：客家豆腐 5/7/14-15 三种 */
api.learnPair(CI2, "客家豆腐7斤/板", skuOf(CI2, "客家豆腐（7斤）"), "板");
ok("教 7斤 的", see(CI2, "客家豆腐7斤/板", "板"), "客家豆腐（7斤）");
ok("14斤 的没被带歪（还是原来那条路）",
  see(CI2, "客家豆腐14斤/板", "板"), "客家豆腐（14-15斤）");
api.forgetPair(CI2, "客家豆腐7斤/板", "板");

L("");
L("── ⑥ 忘掉一次要清干净，不能有残留 ──");
/* 三种键（带单位/不带单位/老格式）+ 全局叫法本，漏删一个就会“忘不掉” */
api.learnPair(CI, "残留测试", skuOf(CI, 大板), "板");
api.forgetPair(CI, "残留测试", "板");
const cid = D.custs[CI][0], n = norm("残留测试");
ok("带单位的键删了", OV.maps[lkey(cid, "板", n)], undefined);
ok("不带单位的键删了", OV.maps[lkey(cid, "", n)], undefined);
ok("老格式的键删了", OV.maps[cid + "||" + n], undefined);
ok("全局叫法本也删了", OV.gmap[n], undefined);
ok("整个 maps 里一条残留都没有",
  Object.keys(OV.maps).filter(k => k.indexOf("残留测试") >= 0).length, 0);

L("");
L("── ⑦ 教一家，不影响别家 ──");
const CI3 = ciOf("S2934");
api.learnPair(CI, "只教鸿益", skuOf(CI, 大板), "板");
ok("鸿益认得", see(CI, "只教鸿益", "板"), 大板);
ok("轩宝那边不受影响", sure(CI3, "只教鸿益", "板"), false);
api.forgetPair(CI, "只教鸿益", "板");

L("");
L("── ⑧ 反复教反复忘，不会越用越脏 ──");
for (let i = 0; i < 20; i++) {
  api.learnPair(CI, "反复折腾", skuOf(CI, i % 2 ? 小板 : 大板), "板");
  if (i % 3 === 0) api.forgetPair(CI, "反复折腾", "板");
}
api.forgetPair(CI, "反复折腾", "板");
ok("折腾 20 轮之后清干净",
  Object.keys(OV.maps).filter(k => k.indexOf("反复折腾") >= 0).length, 0);
ok("gmap 也没留渣", OV.gmap[norm("反复折腾")], undefined);

L("");
L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
process.exit(fail ? 1 : 0);
