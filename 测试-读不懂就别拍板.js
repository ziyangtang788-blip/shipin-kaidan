/* 帐要销平：读不懂就退回正路，不许拿别的列顶包 —— node 测试-读不懂就别拍板.js

   老板 2026-08-18 撞到（朱鲜生那张采购单）：
     明细那一格是「点位1 点位2 点位3　2板 1板 1板　午餐 午餐」——
     点位名和数量不是一对一挨着的，是先全部点位、再全部数量。
     抓取切不出来，【自己记了帐】：「这一格里像有送货点和数量，一段都没切出来」。
     可页面只把这句当提示显示，照样收单 —— 数量退回去拿「总数」那一列顶包。
     结果 24 板该分 6 个点位，全压在一个点位上。钱不错，货发错。

   老板原话：
     「你如果不确定这个是不是就可以问，但是你不能去这样子乱抓。」
     「不是说打补丁，要把根子的问题去解决。」

   所以立的不是「朱鲜生那张表怎么读」，是一条帐：
     近道（按长相直接抓）记下的每一笔「读不懂」，都必须有下文 ——
       · 问点位   → 有下文（排名单那一套会问、会记）
       · 要手工填 → 有下文（空着让人填，老板 8/16 定的）
       · 规格/备注 → 不动那四样，放行（CLAUDE.md 头一条铁律画的线）
       · 别的     → 没有下文 = 近道没走通 → 作废，退回认表那条正路
     默认是拦不是放：将来再加一种「读不懂」，忘了给下文也会自动拦住。 */
global.window = global.window || {};
require("./引擎-解析.js");
require("./数据-价格库.js");
require("./引擎-读结构.js");
require("./引擎-认表.js");
require("./引擎-抓取.js");
const fs = require("fs"), path = require("path");
const T = window.GM_TABLE;

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) pass++; else { fail++; L("  ✗ " + name + "\n      应该 " + b + "\n      实际 " + a); }
}

/* 把页面里的 抓取试一把 抠出来跑 —— 不另抄一份判据 */
const H = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
const i = H.indexOf("function 抓取试一把(");
if (i < 0) throw new Error("页面里找不到 抓取试一把（改名了？）");
let d = 0, src = "";
for (let k = H.indexOf("{", i); k < H.length; k++) {
  if (H[k] === "{") d++; else if (H[k] === "}") { d--; if (!d) { src = H.slice(i, k + 1); break; } }
}
const 抓取试一把 = new Function("window", src + ";return 抓取试一把;")(global.window);
const 份 = rows => [{ grid: [{ n: 1, rows: rows }] }];

L("═══ 朱鲜生那张：明细格切不出来，必须退回正路 ═══");
(function () {
  /* 一格里「先全部点位、再全部数量」—— 就是老板那张表的排法 */
  const rows = [
    ["序号", "商品名", "总数", "明细"],
    ["1", "中板豆腐（7斤/板）", "4板", "广州市老人院上水院区（老人碎菜）5-9 广州市老人院（上水院区）（老人糊餐）5-5 广州市老人院（上水院区）（老人菜泥）5-6 2板 1板 1板 午餐 午餐"],
    ["2", "水豆腐（4.5斤/板）", "1板", "西樵派出所（西樵本部）2-5 1板"],
    ["3", "花泉山水豆腐400g", "1盒", "佛山支队执勤二中队11-8 1盒 400g"],
    ["4", "豆腐串", "18串", "佛山支队高明中队11-10 18串"]
  ];
  const 抓 = window.GM_抓取.抓(rows, {});
  /* 先把「引擎确实记了帐」钉住 —— 帐要是不记了，下面这道闸就成了摆设 */
  const 剩 = (抓.没抓到的 || []).filter(q => q && q.类型 === "剩字");
  ok("引擎自己记了帐（剩字）", 剩.length > 0, true);
  /* 再钉「页面听不听这个帐」*/
  ok("★ 近道作废，退回认表那条正路", 抓取试一把(份(rows)), null);
})();

L("");
L("═══ 有下文的，照旧放行（不许一刀切）═══");
(function () {
  /* 一张干干净净、一格都不剩的表 —— 近道必须照走，不许因为这道闸变慢变贵 */
  const rows = [
    ["商品名", "数量", "单位"],
    ["尝元大板豆腐（14-15斤）", "3", "板"],
    ["尝元大豆泡", "5", "斤"],
    ["攸县香干", "12", "斤"]
  ];
  const r = 抓取试一把(份(rows));
  ok("干净的表：近道照走", !!(r && (r.行 || []).length), true);
})();

L("");
L("═══ 拿 OCR 缓存里的真单两头都量 ═══");
(function () {
  const dir = path.join(process.env.USERPROFILE || "C:/Users/李正", "Desktop", "OCR缓存");
  if (!fs.existsSync(dir)) { L("  （本机没有 OCR缓存 文件夹，这一段跳过，不算错）"); return; }
  let 放 = 0, 拦 = 0, 该拦 = 0;
  fs.readdirSync(dir).forEach(f => {
    let 表 = null;
    try { 表 = T.markdown转表(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { }
    if (!表 || !表.length || !表[0] || !表[0].rows) return;
    let 抓 = null;
    try { 抓 = window.GM_抓取.抓(表[0].rows, {}); } catch (e) { return; }
    if (!抓 || !(抓.行 || []).length) return;
    const r = 抓取试一把(份(表[0].rows));
    if (r) { 放++; return; }
    拦++;
    /* 拦下来的，得真的跟数量/点位有关 —— 不然就是白拦、白花钱。
       正当理由有两种，缺一不可地都得认：
         ① 引擎那本账（没抓到的）里记着数量/点位读不懂
         ② 表上明摆着 N 个点位编号，却只读出远少于 N 段 —— 整格没拆开
       ★ 2026-08-28 补上第 ② 种：那天老板那张单就是这么漏过去的 ——
         OCR 把表头「明细」抄成「限额」，近道不认识这个词，把那一列当成【备注】，
         30 个点位编号一个都没当点位，而且【一句账都没记】，
         于是 ①那本账是空的，一路绿灯，19 行货全压在一个点上出了单。
         那种情况下「没抓到的」永远是空的，只盯 ① 等于盯了个寂寞。
       ⚠ ② 不是放水：编号数远多于段数是【硬证据】，说明确实没读全。 */
    const h = (抓.没抓到的 || []).filter(q => q && !q.问点位 && !q.要手工填 && ["规格", "备注", "别的"].indexOf(q.类型) < 0);
    let 正当 = h.some(q => /\d/.test(String(q.原文 || "")) || q.类型 === "数量" || q.类型 === "光数字");
    if (!正当) {
      const rows2 = 表[0].rows;
      const 号re = /[A-Za-z]{1,3}[0-9]{1,4}(?:-[0-9]{1,3})?|[0-9]{1,3}-[0-9]{1,2}/g;
      let 宽 = 0; rows2.forEach(rr => { if (rr && rr.length > 宽) 宽 = rr.length; });
      let 最多 = 0;
      for (let c = 1; c <= 宽; c++) {
        let n = 0;
        for (let i = 1; i < rows2.length; i++) {
          const t = String((rows2[i] || [])[c - 1] || "").trim(); if (!t) continue;
          号re.lastIndex = 0; n += (t.match(号re) || []).length;
        }
        if (n > 最多) 最多 = n;
      }
      let 段 = 0; (抓.行 || []).forEach(Lx => 段 += ((Lx.分布 || []).length));
      if (最多 >= 3 && 段 < 最多 * 0.67) 正当 = true;
    }
    if (正当) 该拦++;
  });
  L("  近道放行 " + 放 + " 张，拦下退回 AI " + 拦 + " 张（其中 " + 该拦 + " 张确实跟数量/点位有关）");
  ok("放行的表没被这道闸误伤（还有表走得通近道）", 放 > 0, true);
  ok("拦下来的九成以上是真该拦的", 拦 === 0 || 该拦 / 拦 >= 0.9, true);
})();

L("");
L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
process.exit(fail ? 1 : 0);
