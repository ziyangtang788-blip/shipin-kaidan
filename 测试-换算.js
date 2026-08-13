/* 单位换算 —— 折得对不对、该折的才折
   node 测试-换算.js

   为什么值得单独测：换算错的代价比认错商品大一个数量级。
   万民「炸腐竹1件」不折算是 ¥10.8，折对了是 ¥108 —— 差 10 倍，
   而且单据打出来是「1 件」，肉眼看不出哪里不对。 */
global.window = {};
require("./引擎-解析.js");
require("./数据-换算.js");
require("./数据-价格库.js");
const P = window.GM_PARSE, C = window.GM_CONV, D = window.GM_DATA;

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; L("  ✗ " + name + "\n      应该 " + w + "\n      实际 " + g); }
}
/* 造一行：一段数量，跟 parseOrder 出来的形状一致 */
const line = (text, unit, qty) => ({ text, unit, qty, segs: [{ qty, code: "", note: "" }] });

L("── 该折的要折对 ──");
{
  const a = line("炸腐竹", "件", 1);
  const c = P.convApply(C, "S3004", a);
  ok("万民 炸腐竹 1件 → 10斤", [a.qty, a.unit], [10, "斤"]);
  ok("折算信息留在行上", [c.from, c.to, c.mul], ["件", "斤", 10]);
  ok("段里的数量也跟着折", a.segs[0].qty, 10);
}
{
  const a = line("豆腐串", "斤", 1);
  P.convApply(C, "S2987", a);
  ok("万速鲜 豆腐串 1斤 → 20串", [a.qty, a.unit], [20, "串"]);
}
{
  const a = line("日本豆腐", "件", 2);
  P.convApply(C, "S2983", a);
  ok("厨鲜达 日本豆腐 2件 → 80条", [a.qty, a.unit], [80, "条"]);
}
{
  const a = line("日本豆腐", "箱", 1);
  P.convApply(C, "S2983", a);
  ok("写「箱」也认（和「件」同一个意思）", [a.qty, a.unit], [40, "条"]);
}
{
  const a = line("豆腐串", "串", 15);
  P.convApply(C, "S9086", a);
  ok("新又好 豆腐串 15串 → 0.75包", [a.qty, a.unit], [0.75, "包"]);
}
{
  const a = line("攸县香干", "斤", 30);
  P.convApply(C, "S2954", a);
  ok("鸿森 攸县香干 30斤 → 6包", [a.qty, a.unit], [6, "包"]);
}

L("");
L("── 不该折的一律不许动 ──");
{
  const a = line("炸腐竹", "斤", 5);
  ok("单位本来就对，不折", P.convApply(C, "S3004", a), null);
  ok("数量单位原样", [a.qty, a.unit], [5, "斤"]);
}
{
  const a = line("炸腐竹", "件", 1);
  ok("换个客户就没这条规则", P.convApply(C, "S2934", a), null);
  ok("数量单位原样", [a.qty, a.unit], [1, "件"]);
}
{
  const a = line("千张", "件", 1);
  ok("同一个客户但不是那个商品，不折", P.convApply(C, "S3004", a), null);
}
{
  const a = line("炸腐竹", "件", 1);
  P.convApply(C, "S3004", a);
  const again = P.convApply(C, "S3004", a);
  ok("同一行不会折第二次（重算时最容易出这个）", again, null);
  ok("还是 10 斤，没变成 100", [a.qty, a.unit], [10, "斤"]);
}
{
  const a = line("素鸡", "个", 3);
  ok("捷联素鸡工厂说要过称，故意没规则", P.convApply(C, "S4937", a), null);
}

L("");
L("── 折过去的单位，库里真的有 ──");
{
  /* 折算的目标单位如果价格库里根本没有，折了也匹配不上，等于白折。
     这一项防的是「表写对了但目标单位打错字」。 */
  const byId = {};
  D.custs.forEach((c, i) => { byId[c[0]] = i; });
  const bad = [];
  Object.keys(C).forEach(cid => {
    const ci = byId[cid];
    if (ci === undefined) { bad.push(cid + " 这个客户在价格库里不存在"); return; }
    const units = new Set();
    D.items.forEach(t => { if (t[0] === ci) units.add(P.unitNorm(t[3])); });
    C[cid].forEach(r => {
      if (!units.has(P.unitNorm(r.to)))
        bad.push(cid + " 「" + r.word + "」折成「" + r.to + "」，但这家没有按" + r.to + "计价的品");
      if (!(r.mul > 0)) bad.push(cid + " 「" + r.word + "」的倍数不是正数");
    });
  });
  ok("每条换算的目标单位都存在", bad, []);
}

/* ══════ ⛔ 已停用：这张表不许再接回算钱那条路 ══════
   老板 2026-08-04：「不要去换算这种有问题的，就找仓库有对应的产品……
   　　　　　　　　　你换算又换算错了呢。」
   换算系数错一个就差好几倍，而且单据上还是打「1 件」，肉眼看不出 —— 闷声算错。
   现在的走法：单位对不上 → 找同单位的货；找不到 → 让人自己「＋ 库里没有，新建」。
   ⚠ 斤转板不在此列，那条留着（走 GM_MATCH.换算比，另有 测试-斤转板.js 49 项守着）。 */
L("\n── ⛔ 停用状态（不许被接回去）──");
{
  const fs2 = require("fs"), path2 = require("path");
  const H = fs2.readFileSync(path2.join(__dirname, "配送开单台.html"), "utf8");
  /* 页面里不许再有「调用 convApply」这一句 —— 有就是被接回去了 */
  const 接回去了 = /^[^\/\n]*window\.GM_PARSE\.convApply\(/m.test(H);
  ok("★ 页面不再调用 convApply（换算已停用）", 接回去了, false);
  ok("★ 数据留着没删（工厂答复过的事实，将来建产品要用）",
    Object.keys(C).length > 0, true);
  ok("★ 文件头写明了已停用", /⛔⛔ 已停用（2026-08-04）/.test(
    fs2.readFileSync(path2.join(__dirname, "数据-换算.js"), "utf8")), true);
  /* 斤转板那条必须还活着 —— 别把它一起误删了 */
  const M2 = (function () { global.window = global.window || {}; require("./引擎-匹配.js");
    return global.window.GM_MATCH; })();
  ok("★ 斤转板那条还在（换算比没被误删）", typeof M2.换算比 === "function", true);
}

L("");
L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
process.exit(fail ? 1 : 0);
