/* 匹配逻辑回归测试 —— node 测试-匹配.js
   拿真实价格库(5680条)跑已知 case。复刻开单台第 5 步的候选与挑选逻辑，
   改了 配送开单台.html 里的第 5 步，这里也要同步改。 */
global.window = {};
require("./数据-价格库.js");
require("./引擎-解析.js");
var D = global.window.GM_DATA, P = global.window.GM_PARSE;
var bare = P.bare, norm = P.norm;

var CI = -1;
D.custs.forEach(function (c, i) { if (/轩宝.*狮山/.test(c[1])) CI = i; });
var LIST = [];
D.items.forEach(function (it, i) { if (it[0] === CI) LIST.push(i); });

function pickBySpec(grp, text, unit) {
  var t = norm(text), nums = t.match(/\d+(\.\d+)?/g) || [];
  var best = -1, bestScore = 0;
  grp.forEach(function (i) {
    var it = D.items[i], s = norm((it[2] || "") + "|" + (it[5] || "")), sc = 0;
    if (unit && it[3] === unit) sc += 2;
    nums.forEach(function (x) {
      if (new RegExp("(^|[^0-9])" + x + "([^0-9]|$)").test(s)) sc += 3;
    });
    if (sc > bestScore) { bestScore = sc; best = i; }
  });
  return bestScore >= 3 ? best : -1;
}

/* 复刻第 5 步 */
function step5(text, unit) {
  var ba = bare(text);
  if (!ba || ba.length < 2) return null;
  var cand = [];
  LIST.forEach(function (i) {
    var ab = bare(D.items[i][2]);
    if (ab && (ab === ba || ab.indexOf(ba) >= 0 || ba.indexOf(ab) >= 0)) cand.push(i);
  });
  if (!cand.length) return null;
  cand.sort(function (x, y) {
    return ((bare(D.items[x][2]) === ba) ? 0 : 1) - ((bare(D.items[y][2]) === ba) ? 0 : 1);
  });
  var pool = cand, unitMiss = false;
  if (unit) {
    var same = cand.filter(function (i) { return D.items[i][3] === unit; });
    if (same.length) pool = same; else unitMiss = true;
  }
  var pick = pickBySpec(pool, text, unit);
  var ex = pool.filter(function (i) { return bare(D.items[i][2]) === ba; });
  if (!unitMiss && ex.length === 1) return { i: ex[0], how: "loose" };
  if (!unitMiss && pool.length === 1) return { i: pool[0], how: "loose" };
  if (!unitMiss && pick >= 0) return { i: pick, how: "loose" };
  return { i: (pick >= 0 ? pick : pool[0]), how: "fuzzy" };
}

var pass = 0, fail = 0;
function t(text, unit, wantAlias, wantPrice, note) {
  var r = step5(text, unit);
  var got = r ? D.items[r.i] : null;
  var ok = got && got[2] === wantAlias && Math.abs(got[4] - wantPrice) < 0.005;
  if (ok) {
    pass++;
    console.log("  ✅ 「" + text + "」" + (unit ? " [" + unit + "]" : "") +
      " → " + got[2] + " " + got[3] + " ¥" + got[4] + "  (" + r.how + ")");
  } else {
    fail++;
    console.log("  ❌ 「" + text + "」" + (unit ? " [" + unit + "]" : ""));
    console.log("       期望 " + wantAlias + " ¥" + wantPrice);
    console.log("       实得 " + (got ? got[2] + " " + got[3] + " ¥" + got[4] + " (" + r.how + ")" : "没有候选"));
  }
  if (note) console.log("       " + note);
}

console.log("\n客户：" + D.custs[CI][1] + "（在售 " + LIST.length + " 项）\n");
console.log("【这次要修的：单位把关 + 「尝元」前缀】");

t("浓浆豆腐(约8.5斤/板)", "板", "尝元浓浆豆腐（8.5斤）", 9,
  "以前配到「浓浆豆腐（斤）」¥1.10，13 板按斤算，一单差 102.70");
t("无签豆腐串(斤)(0.069斤左右/串)", "斤", "尝元无签豆腐串", 8,
  "以前要人工教一次");
t("山水豆腐(益群)(400g盒)", "盒", "益群山水豆腐（400g/盒）", 2.5,
  "以前要人工教一次");

console.log("\n【不能被改坏：同名多规格靠规格挑】");
t("华晨豆腐(净重15斤/板)", "板", "华晨豆腐（15斤）", 14.5);

/* 「华晨胶板豆腐」跟价格库里的「华晨豆腐」没有包含关系（中间多了「胶板」两个字），
   放宽到包含关系也够不着 —— 就该老老实实认不出、让人教一次，不能瞎猜。 */
(function () {
  var r = step5("华晨胶板豆腐(净重5斤)", "板");
  if (!r) { pass++; console.log("  ✅ 「华晨胶板豆腐(净重5斤)」[板] → 没有候选（该认不出，等人教）"); }
  else { fail++; console.log("  ❌ 「华晨胶板豆腐(净重5斤)」[板] 不该猜出来，却给了 " + D.items[r.i][2]); }
})();

console.log("\n【单位对不上时不许硬认】");
(function () {
  var r = step5("浓浆豆腐", "斤");
  var got = r ? D.items[r.i] : null;
  var ok = got && got[3] === "斤";
  if (ok) { pass++; console.log("  ✅ 「浓浆豆腐」[斤] → " + got[2] + " " + got[3] + " ¥" + got[4]); }
  else { fail++; console.log("  ❌ 「浓浆豆腐」[斤] → " + (got ? got[2] + " " + got[3] : "无")); }
})();

console.log("\n【教学记录能不能扛住 OCR 换写法】");
/* 复刻 backfillBareKeys：只有同一个光名字下的老记录都指向同一个商品时才回填 */
function backfill(maps) {
  var g = {}, n = 0;
  Object.keys(maps).forEach(function (k) {
    var p = k.indexOf("||"); if (p < 0) return;
    var cid = k.slice(0, p), nt = k.slice(p + 2), ba = bare(nt);
    if (!ba || ba === nt) return;
    var bk = cid + "||" + ba;
    if (maps[bk] !== undefined) return;
    (g[bk] = g[bk] || {})[maps[k]] = 1;
  });
  Object.keys(g).forEach(function (bk) {
    var v = Object.keys(g[bk]);
    if (v.length === 1) { maps[bk] = v[0]; n++; }
  });
  return n;
}
(function () {
  /* 老记录：同一个词的两种 OCR 写法，都教成了同一个商品 */
  var maps = {};
  maps["S2934||" + norm("无签豆腐串(0.069斤左右/串)")] = "SKU-A";
  maps["S2934||" + norm("无签豆腐串(斤)(0.069斤左右/串)")] = "SKU-A";
  var n = backfill(maps);
  var got = maps["S2934||无签豆腐串"];
  if (got === "SKU-A" && n === 1) { pass++; console.log("  ✅ 两种写法一致 → 补出稳定键「无签豆腐串」→ SKU-A"); }
  else { fail++; console.log("  ❌ 期望补出 SKU-A，实得 " + got + "（补了 " + n + " 条）"); }

  /* 第三种写法进来，现在能命中了 */
  var k3 = "S2934||" + bare("无签豆腐串（斤）");
  if (maps[k3] === "SKU-A") { pass++; console.log("  ✅ 换第三种写法「无签豆腐串（斤）」也命中"); }
  else { fail++; console.log("  ❌ 第三种写法仍不命中"); }
})();
(function () {
  /* 冲突的不许瞎补：华晨豆腐 5斤 和 15斤 光名字一样但是两个商品 */
  var maps = {};
  maps["S2934||" + norm("华晨豆腐(净重15斤/板)")] = "SKU-15";
  maps["S2934||" + norm("华晨豆腐(净重5斤/板)")] = "SKU-5";
  backfill(maps);
  if (maps["S2934||华晨豆腐"] === undefined) { pass++; console.log("  ✅ 指向不同商品时不回填（留给单位/规格判）"); }
  else { fail++; console.log("  ❌ 冲突时不该回填，却补成了 " + maps["S2934||华晨豆腐"]); }
})();

console.log("\n【预置对照表：目标叫法必须真的存在，否则静默失效】");
require("./对照-预置.js");
var SEED = global.window.GM_SEED || {};
(function () {
  var aliasByCust = {};
  D.items.forEach(function (it) {
    var cid = D.custs[it[0]][0];
    (aliasByCust[cid] = aliasByCust[cid] || {})[norm(it[2])] = it;
  });
  var bad = 0, tot = 0;
  Object.keys(SEED).forEach(function (cid) {
    var lib = aliasByCust[cid];
    if (!lib) { console.log("  ⚠ " + cid + " 不在价格库里，跳过"); return; }
    Object.keys(SEED[cid]).forEach(function (k) {
      var v = SEED[cid][k];
      var targets = (typeof v === "string") ? [v] : Object.keys(v).map(function (u) { return v[u]; });
      targets.forEach(function (tg) {
        tot++;
        if (!lib[norm(tg)]) { bad++; console.log("  ❌ " + cid + " 「" + k + "」→「" + tg + "」 这个叫法不在该客户价格表里"); }
      });
    });
  });
  if (!bad) { pass++; console.log("  ✅ 全部 " + tot + " 条预置对照的目标都真实存在"); }
  else fail++;
})();

function seedLookup(cid, text, unit) {
  var r = P.seedLookup(SEED[cid], text, unit);
  return r ? r.sku : null;
}
console.log("\n【轩宝：新灌进去的对照能不能命中】");
[["大豆卜", "斤", "尝元大豆泡"],
 ["小豆卜", "斤", "尝元小豆泡"],
 ["豆腐煨（大板豆腐）", "板", "尝元大板豆腐（14-15斤）"],
 ["华晨胶板豆腐(净重5斤)", "板", "华晨豆腐 (5斤 )"],
 ["面筋", "斤", "尝元圆面筋"],
 ["千张(豆皮)(薄)", "斤", "千张"],
 ["阳山水豆腐大板", "板", "阳山水豆腐（14-15斤）"],
 ["猪红(沥水)(含水15%)", "斤", "猪血"],
 ["猪红(含水)(含水率50%)", "斤", "猪血"],
 ["浓浆豆腐(约8.5斤/板)", "板", "尝元浓浆豆腐（8.5斤）"],
 ["浓浆豆腐", "斤", "浓浆豆腐（斤）"],
 ["广东高技日本豆腐90g", "条", "日本豆腐（条）"]
].forEach(function (c) {
  var got = seedLookup("S2934", c[0], c[1]);
  if (got === c[2]) { pass++; console.log("  ✅ 「" + c[0] + "」[" + c[1] + "] → " + got); }
  else { fail++; console.log("  ❌ 「" + c[0] + "」[" + c[1] + "] → " + got + "　应为 " + c[2]); }
});

/* ══════ 中间少了个字：客户写「九龙豆腐」，库里叫「九龙水豆腐（斤）」★ ══════
   2026-08-03 碧源真单：整行「认不出」，人在搜索框里手挑成「水豆腐 ¥1.30」，
   真价是「九龙水豆腐（斤）¥2.00」—— 一行差 ¥0.70。
   「认不出」= 没线索，最容易挑错。改成【存疑 + 把候选摆出来】，默认停在最像的那个。
   卡三道免得摆出一堆：光名字≥3字、开头两字一样、绝不拍板。 */
console.log("\n【中间少个字也要摆出来，别报「认不出」】");
(function () {
  require("./对照-预置.js"); require("./数据-常用规格.js"); require("./引擎-匹配.js");
  var M = global.window.GM_MATCH;
  var usedN = function () { return 0; };
  var IDX = M.buildIndex(D, usedN);
  var ci = -1; D.custs.forEach(function (c, i) { if (c[0] === "S2949") ci = i; });
  var C = { DATA: D, IDX: IDX, OV: { maps: {}, spots: [], gmap: {} }, usedN: usedN,
            seedLookup: function (cid, t, u) { return P.seedLookup((global.window.GM_SEED || {})[cid] || {}, t, u); },
            learnedSku: function () { return null; },
            defaultSide: global.window.GM_DEFAULT_SIDE };

  var r = M.matchOne(C, ci, "九龙豆腐", "块");
  var 名 = r.i >= 0 ? D.items[r.i][2] : "(认不出)";
  if (r.i >= 0 && 名.indexOf("九龙水豆腐") === 0 && r.how === "fuzzy" && (r.cands || []).length >= 2) {
    pass++; console.log("  ✅ 九龙豆腐 → 存疑，默认停在「" + 名 + "」，" + r.cands.length + " 个候选");
  } else { fail++; console.log("  ❌ → " + 名 + "　how=" + r.how + "　候选 " + ((r.cands || []).length)); }

  var r2 = M.matchOne(C, ci, "豆腐", "斤");
  if (!(r2 && r2.中间少字)) { pass++; console.log("  ✅ 两个字的「豆腐」不走这条（太容易乱撞）"); }
  else { fail++; console.log("  ❌ 两个字也走了 → " + D.items[r2.i][2]); }

  var r3 = M.matchOne(C, ci, "西瓜", "斤");
  if (r3.i < 0) { pass++; console.log("  ✅ 八竿子打不着的还是「认不出」"); }
  else { fail++; console.log("  ❌ 「西瓜」配上了 " + D.items[r3.i][2]); }
})();

/* ══════ ★ 7 道闸门的顺序 —— 钉死它 ══════
   规矩总表 §二 写着这 7 道要按固定顺序过，可这顺序【只写在注释里】。
   谁把第 3 道和第 6 道调个位置，上面 25 项照样全绿 ——
   因为每一道单独看都是对的，错的是顺序，而且这种错极难查。
   2026-08-04 早上那个「提示词改了、读取没跟着改」的事故，就是同一类：
   两边不同步，测试还全绿。所以这里按【源码里的先后】把顺序钉住。

   顺序为什么是这样：
     · 「斤怎么算」必须在 4、5 后面 —— 前面先定「是哪个货」，
       货都没定就去算斤板，算了也白算
     · 「词冲突」必须在「单位对不上」前面 —— 先发现「大配成小」这种明摆着的错
     · 「认一遍」必须最后 —— 它要看前面全跑完敢不敢拍板 */
(function () {
  const fs = require("fs"), path = require("path");
  const S = fs.readFileSync(path.join(__dirname, "引擎-匹配.js"), "utf8");
  const 位 = (re, 名) => { const m = S.search(re); if (m < 0) throw new Error("找不到闸门：" + 名); return m; };

  console.log("\n── ★ 7 道闸门的顺序 ──");
  function 序(名, a, b, 甲, 乙) {
    if (a < b) { pass++; console.log("  ✅ " + 名); }
    else { fail++; console.log("  ❌ " + 名 + "　—— " + 甲 + " 跑到了 " + 乙 + " 后面"); }
  }

  /* 各道闸门()：1 matchCore → 2 默认那头 → 3 词冲突 */
  const 闸 = 位(/function 各道闸门\(/, "各道闸门");
  const 段1 = S.slice(闸, S.indexOf("function matchCore", 闸));
  序("闸1 matchCore 在 闸2 默认那头 前面",
    段1.indexOf("matchCore("), 段1.indexOf("默认那头("), "matchCore", "默认那头");
  序("闸2 默认那头 在 闸3 词冲突 前面",
    段1.indexOf("默认那头("), 段1.indexOf("词冲突("), "默认那头", "词冲突");

  /* 认一遍() 的身子里：各道闸门(1~3) → 4 单位对不上 → 5 同单位的排前面 → 6 斤怎么算
     ⚠ 「斤怎么算」是在 认一遍 里面的【最后一道】，不是在 matchOne 里 ——
       2026-08-04 我一开始就记错了，是这条测试把它揪出来的。 */
  const 认 = 位(/function 认一遍\(/, "认一遍");
  const 段2 = S.slice(认, 位(/function 各道闸门\(/, "各道闸门"));
  序("闸3 之后才轮到 闸4 单位对不上",
    段2.indexOf("各道闸门("), 段2.indexOf("单位对不上("), "各道闸门", "单位对不上");
  序("闸4 单位对不上 在 闸5 同单位的排前面 前面",
    段2.indexOf("单位对不上("), 段2.indexOf("同单位的排前面("), "单位对不上", "同单位的排前面");
  序("★ 闸6 斤怎么算 是最后一道（前面先定是哪个货，货没定算斤板是白算）",
    段2.indexOf("同单位的排前面("), 段2.indexOf("斤怎么算("), "同单位的排前面", "斤怎么算");

  /* matchOne()：先认一遍；不敢拍板才拿客户原话【再认一遍】—— 那是闸门7 */
  const 一 = 位(/function matchOne\(/, "matchOne");
  const 段3 = S.slice(一, 认);
  const 次 = (段3.match(/认一遍\(/g) || []).length;
  if (次 >= 2) { pass++; console.log("  ✅ 闸7 认不出时拿原话再认一遍（matchOne 里调了 " + 次 + " 次）"); }
  else { fail++; console.log("  ❌ 闸7 没了：matchOne 里只调了 " + 次 + " 次 认一遍"); }

  /* 斤转板那条必须还活着 —— 老板 2026-08-04 选的 A：单位换算停用，但斤转板留着 */
  require("./引擎-匹配.js");
  const MM = global.window.GM_MATCH;
  if (MM && typeof MM.换算比 === "function" && typeof MM.一份几个 === "function") {
    pass++; console.log("  ✅ ★ 斤转板还在（换算比/一份几个 没被误删）");
  } else { fail++; console.log("  ❌ 斤转板的换算比/一份几个 不见了"); }
})();

console.log("\n══════════════════════════");
console.log(fail === 0 ? ("全部通过：" + pass + " 项") : ("通过 " + pass + " / 失败 " + fail));
process.exit(fail === 0 ? 0 : 1);
