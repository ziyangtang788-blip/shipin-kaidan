/* 人亲手在下拉里挑的商品，一律不许被推翻 —— node 测试-人挑的不许被推翻.js

   老板 2026-08-18 当场撞到：「就是选不了品」「整个订单没法完成」。

   毛病是 8/18 砍掉「自动折板」那一改改过头了 —— 连【人自己挑的】
   也被当成「系统在瞎猜」拦掉。拿毅服那家的真数据复现，两个方向都中：

     客户写「板」、挑的货按「斤」卖
       → 引擎-解析.js 那道「跨秤不许记」一个字都不写，
         rematch 当场把这一行打回原来那个。点一百次都一样。
     客户写「斤」、挑的货按「板」卖
       → 记是记住了，可 引擎-匹配.js 里「学过的也要过单位关」判成 fuzzy，
         这一行永远挂「存疑」；存疑行被「确定订单」「导观麦」拦住 → 单子出不来。

   那两道闸本身没错，它们管的是【系统自己猜】。
   人在下拉里点的那一下不是猜，是拍板 —— 所以页面上必须有一道兜底：
   learnPair + rematch 走完，回头看有没有落到他挑的那个，没落上就直接钉死。

   这里考两样：
     ① 那道兜底（页面里的 钉住人挑的）真的把人挑的留住了，两个方向都留住
     ② 三个「人拍板」的入口都接上了这道兜底，将来谁都别再漏一个 */
const fs = require("fs"), path = require("path");
global.window = {};
require("./数据-价格库.js");
require("./对照-预置.js");
require("./引擎-解析.js");
require("./引擎-匹配.js");
require("./数据-常用规格.js");
const D = window.GM_DATA, P = window.GM_PARSE, M = window.GM_MATCH;
const USED = window.GM_USED || {};
const usedN = (cid, sku) => (USED[cid] || {})[sku] || 0;
const IDX = M.buildIndex(D, usedN);

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, got, want) {
  if (got === want) pass++;
  else { fail++; L("  ✗ " + name + "\n      应该 " + want + "\n      实际 " + got); }
}
function yes(name, cond, extra) {
  if (cond) pass++;
  else { fail++; L("  ✗ " + name + (extra ? ("\n      " + extra) : "")); }
}

/* ---- 把页面里那个函数抠出来跑，不另抄一份 ---- */
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

/* 毅服 —— 老板截图上那家（大板豆腐 ¥12.5 板 / 大豆泡 ¥5.2 斤，全库只此一家） */
const SID = "S2985";
let CI = -1; D.custs.forEach((c, i) => { if (c[0] === SID) CI = i; });
if (CI < 0) throw new Error("价格库里没有 " + SID + " 了？这个测试要换一家客户");
const b = IDX.byCust[CI];
const 找 = 名 => { const i = b.list.find(x => D.items[x][2] === 名); if (i === undefined) throw new Error("价格库里没有「" + 名 + "」了"); return i; };

const 板货 = 找("尝元大板豆腐（14-15斤）");     // [板] ¥12.5
const 斤货 = 找("尝元大豆泡");                   // [斤] ¥5.2

const ST = { ci: CI, lines: [] };
let 换过几次 = 0;
const 换到计价单位 = () => { 换过几次++; };
const 钉住人挑的 = new Function("IDX", "ST", "window", "换到计价单位",
  grab("钉住人挑的") + "; return 钉住人挑的;")(IDX, ST, window, 换到计价单位);

/* 一行「被 rematch 打回原样」之后长什么样 */
function 行(text, unit, 落到, how) { return { text, unit, i: 落到, how, cands: [落到] }; }

L("═══ 人挑的必须留住（客户：" + D.custs[CI][1] + "）═══");

/* ① 客户写「板」，人挑了按斤卖的货 —— 原来是一个字都不记、当场打回 */
(function () {
  const x = 行("大板豆腐", "板", 板货, "seed");      // rematch 把它打回了「尝元大板豆腐」
  钉住人挑的([x], D.items[斤货][6]);
  ok("写板挑斤货：留住了人挑的那个", x.i, 斤货);
  ok("写板挑斤货：不再存疑", M.commits(x.how), true);
  ok("写板挑斤货：钉住了，rematch 不许再动", x.pinned, true);
})();

/* ② 客户写「斤」，人挑了按板卖的货 —— 原来配是配上了、却永远挂「存疑」 */
(function () {
  const x = 行("大豆泡", "斤", 板货, "fuzzy");        // 落对了，可是 fuzzy
  钉住人挑的([x], D.items[板货][6]);
  ok("写斤挑板货：留住了人挑的那个", x.i, 板货);
  ok("写斤挑板货：不再存疑（存疑行会卡住确定订单）", M.commits(x.how), true);
})();

/* ③ 同一个词好几行，「一起改」就得几行一起留住 */
(function () {
  const a = 行("大板豆腐", "板", 板货, "seed"), c = 行("大板豆腐", "板", 板货, "seed");
  钉住人挑的([a, c], D.items[斤货][6]);
  ok("同词两行都留住了", (a.i === 斤货 && c.i === 斤货), true);
})();

/* ④ 本来就配对了、也不存疑的行，一个字都不许动 ——
      不然每挑一次就把正常行全钉死，以后教什么都跟不上了 */
(function () {
  const x = 行("大板豆腐", "板", 板货, "learned");
  钉住人挑的([x], D.items[板货][6]);
  ok("已经对了的行：不钉", x.pinned, undefined);
  ok("已经对了的行：how 不动", x.how, "learned");
})();

/* ⑤ 钉完必须重算数量 —— 换了个按别的单位卖的货，数量得跟着重来。
      跨秤换不出来的，换到计价单位 自己会清数、标「没看清」让人填（老板 8/16 定的）。 */
(function () {
  换过几次 = 0;
  const x = 行("大板豆腐", "板", 板货, "seed");
  钉住人挑的([x], D.items[斤货][6]);
  ok("钉完跑了一遍换到计价单位", 换过几次, 1);
})();

/* ⑥ 挑了一个这家客户没有的货 —— 不许瞎钉，原样不动 */
(function () {
  const x = 行("大板豆腐", "板", 板货, "seed");
  钉住人挑的([x], "这个SKU不存在");
  ok("不在这家价格表里的：不动", x.i, 板货);
})();

L("");
L("═══ 三个「人拍板」的入口都得接上这道兜底 ═══");

/* 光有函数没用，得真的被叫到。漏一个入口，那个入口的毛病就原样复发。 */
function 段(起, 止) {
  const i = H.indexOf(起); if (i < 0) return null;
  const j = H.indexOf(止, i); if (j < 0) return null;
  return H.slice(i, j);
}
const 入口 = [
  ["下拉里挑一个商品（comboPick 全改那一支）",
    段("function comboPick(", "\n  function ")],
  ["「✓ 对，记住」那个按钮",
    段('querySelectorAll("button.okfix")', 'querySelectorAll("button.reopen")')],
  ["「＋ 库里没有，新建」建完就选中",
    段('querySelectorAll(".npbox")', 'querySelectorAll("button.forget")')],
];
入口.forEach(([名, s]) => {
  yes(名 + " → 叫了 钉住人挑的", !!s && s.indexOf("钉住人挑的") >= 0,
    s ? "这一段里没有 钉住人挑的（人挑的会被 rematch 打回去）" : "在页面里找不到这一段（改名了？）");
});

L("");
L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
process.exit(fail ? 1 : 0);
