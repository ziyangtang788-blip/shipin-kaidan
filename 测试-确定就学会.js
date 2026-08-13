/* 「确定订单」= 学一遍 —— node 测试-确定就学会.js

   老板 2026-08-02 原话：
     「你现在这个确定订单，就是我确定之后，就是要学会了。
       以后同样的东西，就出同样的。这个确定就是学习的过程，我得把它学好。」

   所以这里测的是那个动作本身：
     第一次开这张单 → 有几行要弹窗问人
     点「确定订单」  → 全单的叫法都记住
     第二次开同一张 → 一行都不用问，而且认到的货跟上次一模一样

   页面里的 学会这一单 / learnPair 直接抠出来跑，不另抄一份。 */
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
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; L("  ✅ " + name); }
  else { fail++; L("  ❌ " + name + "\n      应该 " + JSON.stringify(want) + "\n      实际 " + JSON.stringify(got)); }
}

/* ---- 把页面里的那两个函数抠出来 ---- */
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
const custId = ci => D.custs[ci][0];
const ovSave = () => { };
const C = {
  DATA: D, IDX, OV, usedN,
  seedLookup: (cid, text, unit) => P.seedLookup(SEED[cid], text, unit),
  learnedSku: (ci, text, unit) => P.learnedLookup(OV.maps, D.custs[ci][0], text, unit,
    sku => IDX.byCust[ci].sku[sku] === undefined ? null : D.items[IDX.byCust[ci].sku[sku]][3]),
  defaultSide: window.GM_DEFAULT_SIDE
};
const learnedSku = (ci, t, u) => C.learnedSku(ci, t, u);
/* ST 是页面上「当前这张单」的状态，测试里自己摆一个 */
const ST = { ci: -1, lines: [] };

const api = new Function(
  "IDX", "OV", "DATA", "custId", "norm", "bare", "lkey", "unitNorm", "ovSave", "window", "ST", "learnedSku",
  grab("ovTouch") + "\n" + grab("learnedKeys") + "\n" + grab("learnPair") + "\n" +
  grab("同词几行") + "\n" + grab("这词教不得") + "\n" + grab("学会这一单") +
  "\nreturn {learnPair:learnPair, 学会这一单:学会这一单, 这词教不得:这词教不得};"
)(IDX, OV, D, custId, P.norm, P.bare, P.lkey, P.unitNorm, ovSave, window, ST, learnedSku);

const ciOf = id => { let k = -1; D.custs.forEach((c, i) => { if (c[0] === id) k = i; }); if (k < 0) throw new Error("没有 " + id); return k; };

/* ---- 一张真单：蔬源 8/2 的汇总表 ---- */
const 单 = [
  "商品名称\t商品规格\t客户简称\t单据类型\t预定数\t单位\t备注",
  "客家豆腐\t7斤/板\t大沥人民法庭\t（午餐）\t18\t斤\t",
  "客家豆腐\t14斤/板\t南海法院\t午餐（肉菜）\t2\t板\t",
  "华晨豆腐\t7斤/板\t里水燃气\t\t2\t板\t",
  "中胶板豆腐\t7斤/板\t善耆养老院\t（长者）\t8\t板\t",
  "山水豆腐\t\t西樵税局\t（午餐）\t2\t盒\t",
  "老豆腐\t15斤/板\t佛山妇幼\t（新城院区负一楼）\t48\t斤\t",
  "白豆干\t\t佛山妇幼\t（新城院区负一楼）\t6\t斤\t",
  "香干\t\t三水税局\t\t7\t斤\t",
  "千张皮\t\t禅城区武装部\t\t1\t斤\t",
  "炸腐竹\t\t丹灶燃气\t\t2\t斤\t"
].join("\n");

const CI = ciOf("S2930");
ST.ci = CI;

/* 页面上的 rematch：逐行匹配，结果挂回这一行 */
function 开单() {
  ST.lines = P.parseOrder(单);
  ST.lines.forEach(l => {
    const r = M.matchOne(C, CI, l.text, l.unit, l.price);
    l.i = r.i; l.how = r.how; l.cands = r.cands || [];
  });
  return ST.lines;
}
const 要问几行 = () => ST.lines.filter(l => !(l.i >= 0) || !M.commits(l.how)).length;
const 认到什么 = () => ST.lines.map(l => l.i >= 0 ? D.items[l.i][2] : "认不出");

L("── 第一次开这张单 ──");
开单();
const 第一次 = 认到什么(), 第一次要问 = 要问几行();
L("  这一单 " + ST.lines.length + " 行，要人点 " + 第一次要问 + " 行");
ok("单子解析出来了（10 行）", ST.lines.length, 10);
ok("确实有要人点的行（不然这条测试没意义）", 第一次要问 > 0, true);

L("");
L("── 点「确定订单」 ──");
const 学了 = api.学会这一单();
L("  记住了 " + 学了 + " 个叫法");
ok("确实学到了东西", 学了 > 0, true);

L("");
L("── 第二次开同一张单 ──");
开单();
ok("一行都不用再问", 要问几行(), 0);
ok("认到的货跟上次一模一样（学习不能把答案改掉）", 认到什么(), 第一次);
ok("每一行都是「学过的」", ST.lines.every(l => l.how === "learned"), true);

L("");
L("── 再点一次确定：不该重复记 ──");
ok("已经会了就不再写一遍", api.学会这一单(), 0);

L("");
L("── 换个客户不串味 ──");
/* 学到的是「这家客户这么叫」，别家不该跟着变 */
ok("蔬源学过的键都挂在 S2930 名下",
  Object.keys(OV.maps).every(k => k.indexOf("S2930||") === 0), true);

L("");
L("── 手动加的行学不了，也不该报错 ──");
ST.lines = [{ manual: true, text: "", unit: "斤", i: 0 }];
ok("手动行跳过，不抛错", api.学会这一单(), 0);

L("");
L("── 同一个词、两个不同的货：这个词教不得 ──");
/* 老板 2026-08-02：「统一识别成大、或统一识别成小之后，我单独再去改，
   改不了，两个一起改，这个不可以。」
   道理：这一单里「阳山水豆腐」既是小板也是大板 —— 词本身决定不了是哪个货，
   教它就是教错，而且会把两行绑死。所以一律不教，各钉各的行。 */
{
  const CI2 = ciOf("S4388");                 /* 花鹿碧翠：阳山水豆腐（小）¥10 /（大）¥18 */
  const b2 = IDX.byCust[CI2];
  const skuOf = a => { for (const i of b2.list) if (D.items[i][2] === a) return D.items[i][6]; return null; };
  const 小 = skuOf("阳山水豆腐（小）"), 大 = skuOf("阳山水豆腐（大）");
  const i小 = b2.sku[小], i大 = b2.sku[大];
  ST.ci = CI2;
  /* 客户漏写了（小）（大），两行的词一模一样 */
  ST.lines = [
    { text: "阳山水豆腐", unit: "板", qty: 3, i: i小, how: "fuzzy", segs: [{ qty: 3, unit: "板" }] },
    { text: "阳山水豆腐", unit: "板", qty: 1, i: i大, how: "fuzzy", segs: [{ qty: 1, unit: "板" }] }
  ];
  ok("这个词教不得", api.这词教不得("阳山水豆腐", "板", 大), true);
  ok("点确定也一个都不学", api.学会这一单(), 0);
  ok("确实没往对照里写", Object.keys(OV.maps).some(k => k.indexOf("S4388||") === 0), false);
  /* 两行都是同一个货时，那就是正常的「同词同结果」，照学不误 */
  ST.lines[1].i = i小;
  ok("两行是同一个货 → 这个词教得", api.这词教不得("阳山水豆腐", "板", 小), false);
  ok("照学不误", api.学会这一单() > 0, true);
  /* 客户写清楚了（小）（大）→ 两行的词不一样，各学各的，一点不受影响 */
  ST.lines = [
    { text: "阳山水豆腐（小）", unit: "板", qty: 3, i: i小, how: "fuzzy", segs: [{ qty: 3, unit: "板" }] },
    { text: "阳山水豆腐（大）", unit: "板", qty: 1, i: i大, how: "fuzzy", segs: [{ qty: 1, unit: "板" }] }
  ];
  ok("写清楚了就教得（小）", api.这词教不得("阳山水豆腐（小）", "板", 小), false);
  ok("写清楚了就教得（大）", api.这词教不得("阳山水豆腐（大）", "板", 大), false);
  ok("两条各学各的", api.学会这一单(), 2);
}

L("");
L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
process.exit(fail ? 1 : 0);
