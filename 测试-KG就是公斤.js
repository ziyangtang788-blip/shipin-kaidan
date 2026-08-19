/* 测试-KG就是公斤.js —— node 测试-KG就是公斤.js
   ============================================================
   2026-08-19 老板：「学习功能有问题，选择确定之后，下次还要选」
                   「我确定了订单，下次同样的客户、同样的订单还是需要再点，
                     等于说学习功能完全没有用」。

   查下来【不是学习坏了】—— 服务器上永辉 S2972 学过 87 条，一条没丢，
   拿他那单 28 行挨个查，全部查得到。

   坏的是这个：**系统不认识「KG」这两个字母。**
     单位表 UNITS = 斤板盒包块串条件箱袋桶个只份把碗底张（+ 公斤/千克 在 U1 里）
     unitNorm("KG") = "KG"，unitNorm("公斤") = "公斤" —— 两个不相等

   永辉表上一水儿写 KG，货在库里按「公斤」卖，于是每一单都是：
     配到货了 → 单位对不上（KG ≠ 公斤）→ 判 fuzzy → 标「存疑」→ 问人
     人点「对，记住」→ 真记住了（键 S2972||KG||千张）
     下次又来   → 又是 KG ≠ 公斤 → 又存疑 → 又问人
   —— 记住了也用不上，从人的角度看就是「学习完全没用」。
   （截图上 22 项存疑，配到的货全是对的，就是这个。）

   ⚠ 这【不是换算】：1 KG = 1 公斤，数量一个字不动，只是同一个单位的两种写法，
     跟「底 → 板」一个道理。⛔ 不许拿它当口子往里加「1件=10斤」那类猜出来的系数
     （老板 8/4 停掉换算表时的原话：「你换算又换算错了呢」）。
   ============================================================ */
const path = require("path");
global.window = {};
["./数据-价格库.js", "./对照-预置.js", "./数据-常用规格.js", "./数据-换算.js",
 "./引擎-解析.js", "./引擎-匹配.js"].forEach(f => require(path.resolve(__dirname, f)));
const W = global.window, P = W.GM_PARSE, M = W.GM_MATCH, D = W.GM_DATA;

let 过 = 0, 挂 = 0;
function ok(名, 条件, 说) {
  if (条件) { 过++; console.log("  ✅ " + 名 + (说 ? "　" + 说 : "")); }
  else { 挂++; console.log("  ❌ " + 名 + (说 ? "　" + 说 : "")); }
}

/* ══════ 一、KG 就是公斤 ══════ */
console.log("\n【一、KG 认成公斤】");
["KG", "kg", "Kg", "kG", "千克", "公斤"].forEach(u => {
  ok("unitNorm(" + JSON.stringify(u) + ") = 公斤", P.unitNorm(u) === "公斤", "得到 " + JSON.stringify(P.unitNorm(u)));
});
ok("「斤」还是斤，没被带歪", P.unitNorm("斤") === "斤");
ok("「板」还是板", P.unitNorm("板") === "板");
ok("「底」照旧归成板（老规矩不许动）", P.unitNorm("底") === "板");

/* ══════ 二、KG 得算个单位，不然数量都读不出来 ══════
   「千张 8.5KG」这种，KG 不算单位的话整行会被当成「没写数量」丢掉。 */
console.log("\n【二、KG 算单位】");
["KG", "kg", "公斤", "千克"].forEach(u => ok("是单位(" + JSON.stringify(u) + ")", P.是单位(u)));
ok("「大」照旧不算单位（8/19 那条不许被带歪）", !P.是单位("大"));

/* ══════ 三、真单：「千张 8.5KG」要读得出数量 ══════ */
console.log("\n【三、永辉真单那几行读得出来】");
(function () {
  /* 原文摘自服务器上 XS20260819-16 的 raw */
  const 单 = "千张\t8.5KG\n肠粉\t45KG\n河粉(鲜)\t38KG\n炸腐竹\t0.75KG\n鲜面条(细面)(KG)\t3KG";
  const ls = P.parseOrder(单);
  ok("5 行都读出来了", ls.length === 5, "读出 " + ls.length + " 行");
  const 千 = ls.find(L => /千张/.test(L.text || ""));
  ok("千张 数量 8.5", 千 && Math.abs(千.qty - 8.5) < 0.001, "qty=" + (千 || {}).qty);
  ok("千张 单位归成公斤", 千 && P.unitNorm(千.unit || "") === "公斤", "unit=" + JSON.stringify((千 || {}).unit));
  const 肠 = ls.find(L => /肠粉/.test(L.text || ""));
  ok("肠粉 数量 45", 肠 && Math.abs(肠.qty - 45) < 0.001, "qty=" + (肠 || {}).qty);
})();

/* ══════ 四、★ 学过的能用上，不再每单存疑 ══════
   这是整件事的要害：客户写 KG、货按公斤卖，学过之后必须秒配，不许再判存疑。 */
console.log("\n【四、学过的 KG 行不再存疑 ★】");
(function () {
  const ci = D.custs.findIndex(c => c[0] === "S2972");
  if (ci < 0) { console.log("  （价格库里没有 S2972，跳过）"); return; }
  const IDX = M.buildIndex(D, () => 0), b = IDX.byCust[ci];
  const unitOf = s => (b.sku[s] === undefined ? null : D.items[b.sku[s]][3]);
  /* 挑一个这家按「公斤」卖的货来演 */
  const 货 = D.items.filter(x => x[0] === ci && x[3] === "公斤")[0];
  if (!货) { console.log("  （这家没有按公斤卖的货，跳过）"); return; }
  const sku = 货[6], 名 = 货[2];

  const maps = {};
  P.learnWrite(maps, {}, "S2972", 名, sku, "KG", 货[1], null, unitOf);
  ok("客户写 KG、货按公斤卖 → 学得进去（不算跨秤）", Object.keys(maps).length > 0,
     "写了 " + Object.keys(maps).length + " 条");
  ok("下次拿 KG 来查 → 查得到", P.learnedLookup(maps, "S2972", 名, "KG", unitOf) === sku);
  ok("下次拿「公斤」来查 → 也查得到", P.learnedLookup(maps, "S2972", 名, "公斤", unitOf) === sku);

  /* 走完整匹配：这才是页面那条路。学过之后不许再判 fuzzy（fuzzy 就是页面上的「存疑」） */
  const C = { DATA: D, IDX: IDX, OV: { maps: maps, spots: [], gmap: {} }, usedN: () => 0,
              seedLookup: () => null,
              learnedSku: (i, t, u) => P.learnedLookup(maps, "S2972", t, u, unitOf),
              defaultSide: W.GM_DEFAULT_SIDE };
  const r = M.matchOne(C, ci, 名, "KG");
  ok("整条路走下来配到同一个货", r && r.i >= 0 && D.items[r.i][6] === sku,
     r && r.i >= 0 ? "配到 " + D.items[r.i][2] : "没配上");
  ok("★ 不再判存疑（how 不是 fuzzy/cross）", r && r.how !== "fuzzy" && r.how !== "cross",
     "how=" + (r || {}).how);
})();

console.log("\n════════════════════════");
console.log("过 " + 过 + "　挂 " + 挂);
process.exit(挂 ? 1 : 0);
