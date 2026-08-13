/* 单位不许串 —— node 测试-单位不许串.js
   ================================================================
   2026-08-11 早上，碧源/鲜鲜那张单暴露的：
     客户写「25板」，配到「水豆腐（斤）¥1.30」，25 板按 25 斤开票，一行少收 ¥105。

   为什么以前没抓到：
     ① 断句以前切不动这种格子，板段压根不存在 —— 没段就没错，bug 躺着看不见。
        8/10 晚上把断句修好，板段第一次真跑出来，压在下面的配货 bug 才浮上来。
     ② 页面那个 matchOne 包装函数只收 4 个参数，调用处传了 6 个 ——
        「多少数量」和「客户原话」被静默吃掉，斤转板那道规矩在页面上根本没跑。
        测试直连引擎、传全 6 个，所以一直全绿。这就是「匹配逻辑只准一份」被破坏。

   这份测试钉死四件事，别再退回去：
     一、页面调引擎不许漏参数（结构上就不许再写死形参）
     二、客户写板、库里没有板货 → 不许静默按斤算
     三、学歪过一次，也不许拿斤货顶掉板货
     四、板↔斤 这种跨秤的配对，压根不许记进本子
     五、⚠ 不许误伤：盒↔包 这种「整份换整份」是人教对的，得照常生效
   ================================================================ */
const fs = require("fs"), path = require("path");
global.window = {};
["数据-价格库.js", "对照-预置.js", "数据-常用规格.js", "数据-换算.js",
 "引擎-解析.js", "引擎-匹配.js"].forEach(f => require("./" + f));
const W = global.window, P = W.GM_PARSE, D = W.GM_DATA, M = W.GM_MATCH;
const SEED = W.GM_SEED || {}, USED = W.GM_USED || {};

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, 真) { 真 ? (pass++, L("  ✅ " + name)) : (fail++, L("  ❌ " + name)); }
function eq(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; L("  ✅ " + name); }
  else { fail++; L("  ❌ " + name + "\n      应该 " + JSON.stringify(want) + "\n      实际 " + JSON.stringify(got)); }
}

const usedN = (cid, sku) => (USED[cid] || {})[sku] || 0;
const IDX = M.buildIndex(D, usedN);
const ciOf = id => { const k = D.custs.findIndex(c => c[0] === id); if (k < 0) throw new Error("没有 " + id); return k; };
const 品 = (ci, 名) => { const i = D.items.findIndex(t => t[0] === ci && t[2] === 名); if (i < 0) throw new Error(名); return i; };
function 台(maps) {
  const OV = { maps: maps || {}, gmap: {} };
  return { DATA: D, IDX, OV, usedN,
    seedLookup: (c2, t, u) => P.seedLookup(SEED[c2], t, u),
    learnedSku: (c2, t, u) => P.learnedLookup(OV.maps, D.custs[c2][0], t, u,
      s => IDX.byCust[c2].sku[s] === undefined ? null : D.items[IDX.byCust[c2].sku[s]][3]),
    defaultSide: W.GM_DEFAULT_SIDE };
}
const 说 = r => r && r.i >= 0 ? D.items[r.i][2] + "[" + D.items[r.i][3] + "]¥" + D.items[r.i][4] + "(" + r.how + ")" : "没认到";

/* ================================================================
   一、页面调引擎不许漏参数
   ---------------------------------------------------------------
   8/4 加调用时传了 6 个，包装函数还是 4 个形参，躺了一个礼拜。
   所以这里不只查「够不够」，还要求包装函数【结构上就不许写死形参】——
   用 arguments/apply 原样转发，以后加第 7 个参数也漏不了。
   ================================================================ */
L("── 一、页面调引擎不许漏参数 ──");
{
  const h = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
  const 定义 = h.match(/function\s+matchOne\s*\(([^)]*)\)\s*\{([\s\S]{0,600}?)\n\s*\}/);
  ok("页面里找得到 matchOne 包装函数", !!定义);
  if (定义) {
    const 形参 = 定义[1].trim() ? 定义[1].split(",").length : 0;
    const 体 = 定义[2];
    /* 调用处传了几个（只数顶层逗号，括号/花括号里的不算） */
    let 最多 = 0;
    for (const m of h.matchAll(/[^.\w]matchOne\s*\(/g)) {
      const 起 = m.index + m[0].length;
      if (/function\s+matchOne\s*\($/.test(h.slice(Math.max(0, m.index - 20), 起))) continue;
      let 深 = 1, n = 1, i = 起;
      for (; i < h.length && 深 > 0; i++) {
        const c = h[i];
        if ("([{".includes(c)) 深++;
        else if (")]}".includes(c)) { 深--; if (!深) break; }
        else if (c === "," && 深 === 1) n++;
      }
      if (i > 起) 最多 = Math.max(最多, n);
    }
    ok("包装函数原样转发（用 arguments/apply，不写死形参）",
       形参 === 0 && /arguments/.test(体) && /\.apply\s*\(/.test(体));
    ok("形参够用（现在调用处最多传 " + 最多 + " 个，形参 " + 形参 + " 个）",
       形参 === 0 || 形参 >= 最多);

    /* 光看有没有 apply 不够 —— 把页面里那段包装函数【抠出来真跑一遍】，
       看第 5、6 个参数（数量、客户原话）到底到不到得了引擎。
       页面主脚本是个 IIFE，闭包里的东西外面调不到，只能这么验。 */
    const 整段 = "function matchOne" + 定义[1] === undefined ? null :
      h.slice(h.indexOf("function matchOne"), h.indexOf("function matchOne") + 定义[0].length);
    let 收到 = null;
    const 假window = { GM_MATCH: { matchOne: function () { 收到 = [].slice.call(arguments); return { i: -1 }; } },
                       GM_DEFAULT_SIDE: null };
    const 造 = new Function("DATA,IDX,OV,usedN,seedLookup,learnedSku,window",
      整段 + "\nreturn matchOne;");
    造(null, null, null, null, null, null, 假window)(7, "水豆腐", "板", 1.3, 25, { 名原: "水豆腐" });
    ok("抠出来真跑：客户原话（第 6 个）到得了引擎",
       !!(收到 && 收到.length === 7 && 收到[6] && 收到[6].名原 === "水豆腐"),
       "引擎收到 " + (收到 ? 收到.length : 0) + " 个参数：" + JSON.stringify(收到 && 收到.slice(1)));
    ok("抠出来真跑：数量（第 5 个）到得了引擎 —— 斤转板全靠它",
       !!(收到 && 收到[5] === 25));
  }
}

/* ================================================================
   二、客户写板、库里没有板货 → 不许静默按斤算
   ================================================================ */
L("");
L("── 二、客户写板、库里没有对应板货 → 不许闷头按斤算 ──");
{
  const ci = ciOf("S2943");                       /* 鲜鲜：水豆腐只有斤货 ¥1.3 */
  const r = M.matchOne(台(), ci, "水豆腐(5斤装)", "板", null, 25, { 名原: "水豆腐" });
  const 配到斤货 = r && r.i >= 0 && D.items[r.i][3] === "斤";
  ok("鲜鲜 25板 → " + 说(r) + " 要么配板货、要么存疑，不许拍板认成斤货",
     !(配到斤货 && M.commits(r.how)));
}

/* ================================================================
   三、库里板斤都齐 → 板那一行必须配板货；学歪过也顶不掉
   ---------------------------------------------------------------
   引擎自己认是对的（全库 68 次全对）。坏就坏在「学过的」一路绿灯，
   把整道单位闸门跳过去了 —— 还挂着「已学会」的绿标，人根本看不出错。
   ================================================================ */
L("");
L("── 三、板斤都齐的客户：板那行必须配板货，学歪过也顶不掉 ──");
[["S4192", "祺之盛", "水豆腐（斤）"],
 ["S2947", "裕丰",   "水豆腐（斤）"],
 ["S12738", "广垦",  "水豆腐（斤）"]].forEach(([id, 家, 斤名]) => {
  const ci = ciOf(id), 斤sku = D.items[品(ci, 斤名)][6];
  const 净 = M.matchOne(台(), ci, "水豆腐", "板", null, 25, { 名原: "水豆腐" });
  eq(家 + "：没学过 25板 → 板货", 净.i >= 0 && D.items[净.i][3], "板");

  const m = {};                                   /* 手工种一条学歪的：板 → 斤货 */
  m[P.lkey(id, "板", P.norm("水豆腐"))] = 斤sku;
  m[P.lkey(id, "", P.norm("水豆腐"))] = 斤sku;
  const 歪 = M.matchOne(台(m), ci, "水豆腐", "板", null, 25, { 名原: "水豆腐" });
  eq(家 + "：学歪过 25板 → 还是板货（现在是 " + 说(歪) + "）", 歪.i >= 0 && D.items[歪.i][3], "板");
});

/* ================================================================
   四、板↔斤 这种跨秤的配对，压根不许记进本子
   ---------------------------------------------------------------
   记了就会自我加固：第一次老实弹存疑 → 人随手定成斤货 → 从此每单静默错。
   ================================================================ */
L("");
L("── 四、跨秤的配对不许记进本子 ──");
{
  const id = "S2947", ci = ciOf(id);
  const 斤i = 品(ci, "水豆腐（斤）"), 板i = 品(ci, "水豆腐（5斤）");
  /* unitOf 照页面那样传（配送开单台.html learnPair 里那一份） */
  const unitOf = s => { const k = D.items.findIndex(t => t[0] === ci && t[6] === s); return k < 0 ? null : D.items[k][3]; };
  const 写 = (unit, i) => {
    const maps = {}, gmap = {};
    P.learnWrite(maps, gmap, id, "水豆腐", D.items[i][6], unit, D.items[i][1],
      () => false, unitOf);
    return maps;
  };
  const 歪 = 写("板", 斤i);
  eq("「板 → 水豆腐（斤）」一条都不许记", Object.keys(歪).length, 0);
  const 正 = 写("板", 板i);
  ok("「板 → 水豆腐（5斤）[板]」照常记得下", Object.keys(正).length > 0);
  const 斤 = 写("斤", 斤i);
  ok("「斤 → 水豆腐（斤）[斤]」照常记得下", Object.keys(斤).length > 0);
}

/* ================================================================
   五、⚠ 不许误伤：盒↔包 是「整份换整份」，人教对的要照常生效
   ---------------------------------------------------------------
   learnWrite 的注释写着「表上写盒、库里记包，只有按单位那条管得住」——
   那是对的行为，不能被这次的修法一刀切掉。
   分界线：一头是散称（斤/公斤/克）另一头不是 → 一板≠一斤，不许串；
           两头都是整份（盒/包/条/件）→ 常常就是同一个东西，照旧。
   ================================================================ */
L("");
L("── 五、盒↔包 这种整份换整份，不许误伤 ──");
{
  const id = "S9389", ci = ciOf(id);              /* 品棠：鸡蛋干150g 按「包」卖 */
  const 包i = 品(ci, "鸡蛋干150g");
  const maps = {}, gmap = {};
  const unitOf = s => { const k = D.items.findIndex(t => t[0] === ci && t[6] === s); return k < 0 ? null : D.items[k][3]; };
  P.learnWrite(maps, gmap, id, "鸡蛋干", D.items[包i][6], "盒", D.items[包i][1], () => false, unitOf);
  ok("「盒 → 鸡蛋干150g[包]」记得下", Object.keys(maps).length > 0);
  const r = M.matchOne(台(maps), ci, "鸡蛋干", "盒", null, 5, { 名原: "鸡蛋干" });
  eq("教过之后，客户写「盒」照样认到那条包装货", r.i, 包i);
  ok("而且是拍板的，不该再弹存疑", M.commits(r.how));
}

L("");
L(fail ? ("══ " + pass + " 过，" + fail + " 没过") : ("══ 全过（" + pass + " 项）"));
process.exit(fail ? 1 : 0);
