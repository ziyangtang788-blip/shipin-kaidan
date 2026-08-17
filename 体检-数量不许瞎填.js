/* 数量不许瞎填 —— node 体检-数量不许瞎填.js
   ================================================================
   老板 2026-08-17：「重要的是最开始为什么自动填进去」
                     「下次能不能有把数量空出来这个动作」

   为什么会自动填进去 —— 因为「不知道」以前没有一个动作，
   各处算不出来时手上还攥着客户写的那个数，最省事就是留着：
     · 毅服 8/16：客户写「大板豆腐 15 斤」，库里只有 14-15斤/板 的板货，
                  换算比 算不出来 → 15 原样当板数 → ¥187.50（该是 ¥12.5 上下）
     · 李氏 8/16：(288-5斤，嫩)1板 说不清哪个是数量 → 清成 0 → 整行少一板
   两种都不吭声。这份体检就是防它再来一次。

   钉死三件事：
     一、算不出来 → 数量必须空掉、标「没看清」（页面靠它画橙色行、拦住出单）
     二、只拦【跨秤】那种（散称↔整份）。箱↔件、袋↔包、块↔斤 是同物异名，拦了是白拦
     三、拿真单全量扫一遍：一行都不许「跨秤 + 换不出来 + 还留着数」

   ⚠ 页面那段 换到计价单位 是【抠出来真跑】的，不是照着抄一份来验 ——
     抄一份就会出现「体检全绿、页面还在错」。
   ================================================================ */
const fs = require("fs"), path = require("path");
global.window = global.window || {};
["数据-价格库.js", "对照-预置.js", "数据-常用规格.js", "数据-换算.js",
 "引擎-解析.js", "引擎-匹配.js", "引擎-读结构.js", "引擎-抓取.js"]
  .forEach(f => require("./" + f));
const W = global.window, P = W.GM_PARSE, D = W.GM_DATA, M = W.GM_MATCH,
      S = W.GM_STRUCT, G = W.GM_抓取;
const USED = W.GM_USED || {}, SEED = W.GM_SEED || {};
const IDX = M.buildIndex(D, (cid, sku) => (USED[cid] || {})[sku] || 0);

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, 真, 说) {
  if (真) { pass++; L("  ✅ " + name); }
  else { fail++; L("  ❌ " + name + (说 ? ("\n      " + 说) : "")); }
}

/* ── 把页面那段 换到计价单位 抠出来，真跑 ────────────────
   页面主脚本是个 IIFE，闭包里的函数外面调不到，只能这么验。
   它用到的外部东西只有两个：DATA 和 window（GM_MATCH / GM_PARSE）。 */
const h = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
const 起 = h.indexOf("function 换到计价单位");
let 换到计价单位 = null, 抠出来了 = false;
if (起 >= 0) {
  /* 从函数头一直数到配对的那个右花括号 */
  let i = h.indexOf("{", 起), 深 = 0, 尾 = -1;
  for (let k = i; k < h.length; k++) {
    if (h[k] === "{") 深++;
    else if (h[k] === "}") { 深--; if (!深) { 尾 = k + 1; break; } }
  }
  if (尾 > 0) {
    try {
      换到计价单位 = new Function("DATA,window", h.slice(起, 尾) + "\nreturn 换到计价单位;")(D, W);
      抠出来了 = typeof 换到计价单位 === "function";
    } catch (e) { L("      抠出来跑不动：" + e.message); }
  }
}

L("── 一、页面那段抠得出来、跑得动 ──");
ok("页面里找得到 换到计价单位", 起 >= 0);
ok("抠出来能真跑（不是照着抄一份来验）", 抠出来了);
if (!抠出来了) { L(""); L("══ " + pass + " 过，" + (fail + 1) + " 没过（抠不出来，下面没法验）"); process.exit(1); }

/* 造一行：客户写的名字/单位/数量 + 已经配到的那个货 */
function 造行(text, unit, qty, i) {
  return { text: text, unit: unit, qty: qty, i: i, segs: [{ qty: qty, code: "", note: "" }] };
}
/* 在库里找一条：某客户名下、单位是 u、名字带 kw 的货 */
function 找货(kw, u) {
  const k = D.items.findIndex(t => (t[3] || "") === u && String(t[2] || "").indexOf(kw) >= 0);
  return k;
}

L("");
L("── 二、跨秤又换不过来 → 数量必须空掉 ──");
{
  /* 毅服那条：规格是范围「14-15斤」，一板几斤定不下来 */
  const 板货 = D.items.findIndex(t => (t[3] || "") === "板" &&
    /[（(][^（()）]*\d+\s*[-－—~～]\s*\d+\s*斤[^（()）]*[）)]/.test(t[2] || ""));
  ok("库里找得到「规格是范围」的板货", 板货 >= 0);
  if (板货 >= 0) {
    L("      拿来验的是：" + D.items[板货][2] + " [板]");
    ok("这种货，斤 → 板 确实换不出来（不许猜一板几斤）", M.换算比(D, 板货, "斤") === null);
    const L1 = 造行("大板豆腐", "斤", 15, 板货);
    换到计价单位(L1);
    ok("数量被清空了（不是留着 15 去乘板价）", L1.segs[0].qty === 0);
    ok("标了「没看清」（页面靠它画橙色行、拦住出单）", L1.segs[0].没看清 === true);
    ok("备注只有一句人话", L1.segs[0].note === "这一行不确定，自己填");
    ok("为什么换不过来收在 详情 里", /换不过来/.test(L1.segs[0].详情 || ""));
  }
  /* 板 → 斤货（御口福、惠雅那种，7板当7斤差 7 倍） */
  const 斤货 = 找货("水豆腐", "斤");
  ok("库里找得到按斤卖的水豆腐", 斤货 >= 0);
  if (斤货 >= 0) {
    const L2 = 造行("中板水豆腐", "板", 7, 斤货);
    换到计价单位(L2);
    ok("客户写板、货按斤卖 → 也得空掉（7板当7斤要差 7 倍）", L2.segs[0].qty === 0 && L2.segs[0].没看清 === true);
  }
}

L("");
L("── 三、同物异名不许误伤 ──");
/* 引擎-解析.js 第 29 行画的线：散称↔整份必然有倍数；整份↔整份常常一比一。
   一刀切会把这些全拦掉 —— 37 份真单实测，一刀切拦 12 行，该拦的只有 5 行。 */
{
  const 论斤的 = P.论斤的;
  ok("论斤的 认得「块」（老板 8/10 定死 1块=1斤）", 论斤的.test("块"));
  ok("论斤的 不认整份（板/件/包/箱/袋/串/条）",
     !["板", "件", "包", "箱", "袋", "串", "条"].some(u => 论斤的.test(u)));

  const 斤货 = 找货("老豆腐", "斤");
  if (斤货 >= 0) {
    const L3 = 造行("老豆腐", "块", 7, 斤货);
    换到计价单位(L3);
    ok("块 → 斤货：不许拦（1块=1斤，拦了是白拦）", L3.segs[0].qty === 7 && !L3.segs[0].没看清);
  }
  const 包货 = 找货("鸡蛋干", "包");
  if (包货 >= 0) {
    const L4 = 造行("鸡蛋干", "袋", 3, 包货);
    换到计价单位(L4);
    ok("袋 → 包货：不许拦（同一个东西两种叫法）", L4.segs[0].qty === 3 && !L4.segs[0].没看清);
  }
  const 件货 = 找货("日本豆腐", "件");
  if (件货 >= 0) {
    const L5 = 造行("日本豆腐", "箱", 3, 件货);
    换到计价单位(L5);
    ok("箱 → 件货：不许拦", L5.segs[0].qty === 3 && !L5.segs[0].没看清);
  }
  /* 同单位、没写单位 —— 更不许动 */
  const 任一 = D.items.findIndex(t => (t[3] || "") === "斤");
  if (任一 >= 0) {
    const L6 = 造行("老豆腐", "斤", 5, 任一);
    换到计价单位(L6);
    ok("单位本来就一样：原样不动", L6.segs[0].qty === 5 && !L6.segs[0].没看清);
    const L7 = 造行("老豆腐", "", 5, 任一);
    换到计价单位(L7);
    ok("客户没写单位：原样不动（判不了，别瞎拦）", L7.segs[0].qty === 5 && !L7.segs[0].没看清);
  }
}

L("");
L("── 四、换得出来的，照常折算（别把好人也拦了）──");
{
  /* 找一条「N斤/板」写得明明白白的板货 */
  let 好板 = -1;
  for (let k = 0; k < D.items.length; k++) {
    if ((D.items[k][3] || "") !== "板") continue;
    const c = M.换算比(D, k, "斤");
    if (c && c.mul > 0) { 好板 = k; break; }
  }
  ok("库里找得到「一板几斤」写清楚的板货", 好板 >= 0);
  if (好板 >= 0) {
    const c = M.换算比(D, 好板, "斤");
    const 斤数 = Math.round(1 / c.mul);          /* 正好一板的斤数 */
    const L8 = 造行(D.items[好板][2], "斤", 斤数, 好板);
    换到计价单位(L8);
    L("      " + D.items[好板][2] + "：" + c.memo);
    ok("换得出来的照常折（" + 斤数 + "斤 → " + L8.segs[0].qty + "板），不许拦",
       !L8.segs[0].没看清 && Math.abs(L8.segs[0].qty - 1) < 0.001);
  }
}

L("");
L("── 五、拿真单全量扫：一行都不许「跨秤 + 换不过来 + 还留着数」 ──");
{
  const 缓存 = path.join(process.env.USERPROFILE || "C:/Users/李正", "Desktop", "OCR缓存");
  const 论斤的 = P.论斤的;
  function 变格子(text) {
    const rows = [];
    text.split(/\r?\n/).forEach(l => {
      const t = l.trim();
      if (t.indexOf("|") < 0) { if (t) rows.push([t]); return; }
      if (/^\|?[\s:|-]+\|?$/.test(t)) return;
      rows.push(t.replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
    });
    return rows;
  }
  function 台() {
    return { DATA: D, IDX, OV: { maps: {}, gmap: {} },
      usedN: (cid, sku) => (USED[cid] || {})[sku] || 0,
      seedLookup: (c2, t, u) => P.seedLookup(SEED[c2], t, u),
      learnedSku: () => null, defaultSide: W.GM_DEFAULT_SIDE };
  }
  function 猜客户(f) {
    const 头 = f.split("__")[0];
    let best = -1, bl = 0;
    D.custs.forEach((c, i) => {
      const n = String(c[1] || "");
      if (n.length > 2 && 头.indexOf(n.slice(0, 6)) >= 0 && n.length > bl) { best = i; bl = n.length; }
    });
    return best;
  }

  let 单数 = 0, 行数 = 0;
  const 漏网 = [];
  let files = [];
  try { files = fs.readdirSync(缓存).filter(f => /\.txt$/i.test(f)); } catch (e) { files = []; }

  files.forEach(f => {
    const ci = 猜客户(f);
    if (ci < 0) return;
    let rows; try { rows = 变格子(fs.readFileSync(path.join(缓存, f), "utf8")); } catch (e) { return; }
    let r; try { r = G.抓(rows); } catch (e) { return; }
    if (!r || !(r.行 || []).length) return;
    let j; try { j = S.读结构({ 抬头: {}, 行: r.行, 没读懂的: [] }); } catch (e) { return; }
    单数++;
    (j.lines || []).forEach(ln => {
      行数++;
      const u0 = P.unitNorm(ln.unit || "");
      if (!u0) return;
      let m; try { m = M.matchOne(台(), ci, ln.text, ln.unit, ln.price, ln.qty, { 名原: ln.名原 }); }
      catch (e) { return; }
      if (!m || m.i < 0) return;
      const u1 = P.unitNorm(D.items[m.i][3] || "");
      if (!u1 || u0 === u1) return;
      if (论斤的.test(u0) === 论斤的.test(u1)) return;      /* 同物异名，不归这条管 */
      if (M.换算比(D, m.i, ln.unit)) return;                 /* 换得出来，正常折 */
      /* 走到这儿 = 跨秤又换不过来 → 页面必须把它清空 */
      const 行 = { text: ln.text, unit: ln.unit, qty: ln.qty, i: m.i,
                   segs: (ln.segs || []).map(g => ({ qty: g.qty, 没看清: g.没看清, code: g.code || "", note: g.note || "" })) };
      if (!行.segs.length) return;
      try { 换到计价单位(行); } catch (e) { }
      const 还留着数 = 行.segs.some(g => !g.没看清 && g.qty > 0);
      if (还留着数)
        漏网.push(f.slice(0, 30) + "　" + ln.text + "　客户写" + u0 + " / 库里" + u1 +
                  "（" + D.items[m.i][2] + "）");
    });
  });

  L("      扫了 " + 单数 + " 份真单、" + 行数 + " 行");
  ok("一行都没漏网（跨秤又换不过来的，全被清空了）", 漏网.length === 0,
     漏网.slice(0, 8).join("\n      ") + (漏网.length > 8 ? ("\n      …还有 " + (漏网.length - 8) + " 行") : ""));
  ok("真的扫到东西了（不是空跑一场）", 行数 > 0,
     "OCR缓存 里没找到真单 —— 这条等于没验");
}

L("");
L(fail ? ("══ " + pass + " 过，" + fail + " 没过") : ("══ 全过（" + pass + " 项）"));
process.exit(fail ? 1 : 0);
