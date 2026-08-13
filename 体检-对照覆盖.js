/* 对照覆盖体检 —— node 体检-对照覆盖.js
   把某个客户下单表上出现过的词，逐个跑一遍匹配链，看哪些还认不出/会认错。
   复刻 配送开单台.html 的匹配链（不含 localStorage 里学过的那两步）：
     ① 预置对照   ② 叫法精确   ③ 商品名精确   ④ 光名字/包含 + 单位把关
   以后每拿到一张新下单表，把词加到 WORDS 里重跑，缺口一眼就看见。 */
global.window = {};
require("./数据-价格库.js");
require("./对照-预置.js");
require("./引擎-解析.js");
var D = global.window.GM_DATA, SEED = global.window.GM_SEED || {}, P = global.window.GM_PARSE;
var norm = P.norm, bare = P.bare;

/* ---- 要体检的客户 + 下单表上出现过的词（词, 单位, 出处） ---- */
var CUST = /轩宝.*狮山/;

/* [表上写的, 单位, 出处, 正确答案(观麦销售单上的商品名)]
   出处对应 桌面\数据\ 里 5 组「下单表 + 观麦销售单」配对：
     6/26(427.5/1510.85) 7/15(488.5/1614.70) 7/22(499.3/2072.01)
     7/26(471.5/1505.65) 7/28(502.1/1907.98) */
var WORDS = [
  ["白豆干", "斤", "7/22 7/26 7/28", "尝元白豆干"],
  ["大豆卜", "斤", "7/15 7/22", "尝元大豆泡"],
  ["小豆卜", "斤", "全部", "尝元小豆泡"],
  ["豆腐煨（大板豆腐）", "板", "6/26 7/22 7/28", "尝元大板豆腐（14-15斤）"],
  ["广东高技日本豆腐90g", "条", "7/15 7/22", "日本豆腐（条）"],
  ["华晨豆腐(净重15斤/板)", "板", "全部", "华晨豆腐（15斤）"],
  ["华晨胶板豆腐(净重5斤)", "板", "7/15 7/22 7/26 7/28", "华晨豆腐 (5斤 )"],
  ["胶板豆腐7斤(净重7斤/板)", "板", "6/26 7/28", "尝元中板豆腐（7斤）"],
  ["九龙炸豆腐", "斤", "7/22 7/28", "九龙炸豆腐（斤）"],
  ["老豆腐", "斤", "全部", "老豆腐（斤）"],
  ["面筋", "斤", "7/22 7/28", "尝元圆面筋"],
  ["浓浆豆腐(约8.5斤/板)", "板", "6/26 7/15 7/26", "尝元浓浆豆腐（8.5斤）"],
  ["魔芋丝结(200g/盒*20盒/件)", "盒", "7/28", "魔芋丝结（200g/盒）"],
  ["千张（豆皮）(薄)", "斤", "全部", "千张"],
  ["水豆腐", "斤", "6/26", "水豆腐（斤）"],
  ["山水豆腐（益群）(400g盒)", "盒", "7/15 7/22 7/26", "益群山水豆腐（400g/盒）"],
  ["无签豆腐串（斤）(0.069斤左右/串)", "斤", "全部", "尝元无签豆腐串"],
  ["香干", "斤", "全部", "香干"],
  ["烟干", "斤", "7/15", "尝元薄烟干"],
  ["阳山水豆腐大板(14斤/板)", "板", "7/22 7/28", "阳山水豆腐（14-15斤）"],
  ["攸县香干80-90g(正方形6.5cm*厚1.5cm)", "斤", "7/15 7/26 7/28", "攸县香干"],
  ["炸豆干", "斤", "全部", "炸豆干"],
  ["长条炸豆腐", "斤", "6/26", "长条炸豆腐"],
  ["猪红（沥水）(含水15%)", "斤", "全部", "猪血"],
  ["猪红(含水)(含水率50%)", "斤", "7/15 7/26 7/28", "猪血"]
];

/* 观麦销售单上出现过的商品名全集 —— 用来找「还没见过客户表上怎么写」的 */
var SEEN_IN_RESULT = [
  "尝元大豆泡", "日本豆腐（条）", "华晨豆腐（15斤）", "华晨豆腐 (5斤 )", "老豆腐（斤）",
  "尝元浓浆豆腐（8.5斤）", "千张", "益群山水豆腐（400g/盒）", "尝元无签豆腐串", "香干",
  "尝元小豆泡", "尝元薄烟干", "攸县香干", "猪血", "尝元白豆干", "尝元大板豆腐（14-15斤）",
  "尝元中板豆腐（7斤）", "九龙炸豆腐（斤）", "尝元圆面筋", "魔芋丝结（200g/盒）",
  "阳山水豆腐（14-15斤）", "炸豆干", "水豆腐（斤）", "长条炸豆腐"
];

var CI = -1;
D.custs.forEach(function (c, i) { if (CUST.test(c[1])) CI = i; });
var cid = D.custs[CI][0];
var LIST = [], byAlias = {}, byProd = {};
D.items.forEach(function (it, i) {
  if (it[0] !== CI) return;
  LIST.push(i);
  byAlias[norm(it[2])] = i;
  var pn = norm(D.prods[it[1]]); if (byProd[pn] === undefined) byProd[pn] = i;
});

function seedLookup(text, unit) { return P.seedLookup(SEED[cid], text, unit); }
function pickBySpec(grp, text, unit) {
  var t = norm(text), nums = t.match(/\d+(\.\d+)?/g) || [], best = -1, bs = 0;
  grp.forEach(function (i) {
    var it = D.items[i], s = norm((it[2] || "") + "|" + (it[5] || "")), sc = 0;
    if (unit && it[3] === unit) sc += 2;
    nums.forEach(function (x) { if (new RegExp("(^|[^0-9])" + x + "([^0-9]|$)").test(s)) sc += 3; });
    if (sc > bs) { bs = sc; best = i; }
  });
  return bs >= 3 ? best : -1;
}
function match(text, unit) {
  var sv = seedLookup(text, unit);
  if (sv && byAlias[norm(sv.sku)] !== undefined) return { i: byAlias[norm(sv.sku)], how: "预置" };
  var n = norm(text);
  if (byAlias[n] !== undefined) return { i: byAlias[n], how: "叫法精确" };
  if (byProd[n] !== undefined) return { i: byProd[n], how: "商品名精确" };
  var ba = bare(text);
  if (ba && ba.length >= 2) {
    var cand = [];
    LIST.forEach(function (i) {
      var ab = bare(D.items[i][2]);
      if (ab && (ab === ba || ab.indexOf(ba) >= 0 || ba.indexOf(ab) >= 0)) cand.push(i);
    });
    if (cand.length) {
      cand.sort(function (x, y) { return ((bare(D.items[x][2]) === ba) ? 0 : 1) - ((bare(D.items[y][2]) === ba) ? 0 : 1); });
      var pool = cand, miss = false;
      if (unit) {
        var same = cand.filter(function (i) { return D.items[i][3] === unit; });
        if (same.length) pool = same; else miss = true;
      }
      var pk = pickBySpec(pool, text, unit);
      var ex = pool.filter(function (i) { return bare(D.items[i][2]) === ba; });
      if (!miss && ex.length === 1) return { i: ex[0], how: "光名字" };
      if (!miss && pool.length === 1) return { i: pool[0], how: "光名字" };
      if (!miss && pk >= 0) return { i: pk, how: "按规格挑" };
      return { i: (pk >= 0 ? pk : pool[0]), how: "存疑", n: cand.length };
    }
  }
  return null;
}

console.log("\n客户：" + D.custs[CI][1] + "（" + cid + "，在售 " + LIST.length + " 项）");
console.log("下单表词汇 " + WORDS.length + " 个\n");

var ok = 0, doubt = 0, none = 0, wrong = 0, hitSku = {};
WORDS.forEach(function (w) {
  var r = match(w[0], w[1]), want = w[3];
  if (!r) {
    none++;
    console.log("  ❌ 认不出   「" + w[0] + "」[" + w[1] + "]　应为 " + want + "　(" + w[2] + ")");
    return;
  }
  var it = D.items[r.i];
  hitSku[it[2]] = 1;
  var right = (norm(it[2]) === norm(want));
  if (!right) {
    wrong++;
    console.log("  ❌ 认错了   「" + w[0] + "」[" + w[1] + "] → " + it[2] + " ¥" + it[4] +
                "　应为 " + want + "　(" + w[2] + ")");
  } else if (r.how === "存疑") {
    doubt++;
    console.log("  ⚠ 存疑    「" + w[0] + "」[" + w[1] + "] → " + it[2] + " ¥" + it[4] +
                "　(答案对，但 " + r.n + " 个候选拿不准，会弹下拉让人确认)");
  } else {
    ok++;
    console.log("  ✅ " + r.how.padEnd(5, "　") + "「" + w[0] + "」[" + w[1] + "] → " + it[2] + " " + it[3] + " ¥" + it[4]);
  }
});

console.log("\n────────────────────────");
console.log("认对 " + ok + " / 存疑 " + doubt + " / 认错 " + wrong + " / 认不出 " + none +
            "　（共 " + WORDS.length + " 个词）");

console.log("\n【观麦单上出现过、但还不知道客户表上怎么写的商品】");
var miss = SEEN_IN_RESULT.filter(function (a) { return !hitSku[a]; });
if (!miss.length) console.log("  （无，全覆盖）");
else miss.forEach(function (a) { console.log("  · " + a + "　← 缺一张写了这个品的下单表"); });

process.exit(0);
