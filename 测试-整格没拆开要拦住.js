/* 整格没拆开，近道就不算数 —— node 测试-整格没拆开要拦住.js

   老板 2026-08-28 拖朱鲜生那张单，19 行货全压在一个点上出了单。
   钱一分不差，货全送错。查出来的链条：

     OCR 把表头「明细」抄成了「限额」
       → 表的指纹跟着变，读法本里 17 条一条都对不上
       → 掉进「按长相直接抓」那条近道
       → 近道不认识「限额」这个词，把那一列挑成了【备注】
       → 30 个点位编号一个都没当点位，而且【一句账都没记】
       → 一段 34 斤 = 表上总数 34 斤，账正正好好，所有闸门放行

   ⛔ 老板当场点的题：「账能证明的就不问」这条【不够】——
      把整格当成一坨，账永远是平的。光靠秤，这种错一辈子拦不住。
   ⛔ 他还点了另一句：「不是加闸拦它，是让它用同一套办法读。」
      所以拦下来不是终点 —— 是让给认表那条路，那条路上有碎片类会拆。

   钉四件事：
     ① 表上明摆着 N 个编号、只读出远少于 N 段 → 拦
     ② 正常表（编号数≈段数）一张都不许拦
     ③ 编号太少（<3）不判 —— 样本不够，判了就是瞎猜
     ④ 那根线真接在近道里 */
global.window = global.window || {};
const fs = require("fs"), path = require("path"), 家 = __dirname;
["数据-价格库.js", "对照-预置.js", "数据-常用规格.js", "数据-换算.js",
  "引擎-解析.js", "引擎-匹配.js", "引擎-抓取.js", "引擎-断句规矩.js",
  "数据-切法规矩.js", "引擎-认表.js", "引擎-碎片类.js", "引擎-学分法.js",
  "引擎-读结构.js"].forEach(f => require(path.join(家, f)));

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, 真的) { if (真的) pass++; else { fail++; L("  ✗ " + name); } }

/* 把页面里【真的】抓取试一把 抠出来跑，不另抄一份判据 */
const H = fs.readFileSync(path.join(家, "配送开单台.html"), "utf8");
const i0 = H.indexOf("function 抓取试一把(");
let d = 0, src = "";
for (let k = H.indexOf("{", i0); k < H.length; k++) {
  if (H[k] === "{") d++; else if (H[k] === "}") { d--; if (!d) { src = H.slice(i0, k + 1); break; } }
}
const 抓取试一把 = new Function("window", src + ";return 抓取试一把;")(global.window);
const 份 = rows => [{ grid: [{ n: 1, rows: rows }] }];

L("═══ ① 老板 8-28 那张：表头被抄成「限额」，整格没拆开 ═══");
{
  /* 一模一样的形状：表头第 4 列是「限额」（OCR 抄错），近道会把它当备注 */
  const rows = [
    ["序号", "商品名", "总数", "限额"],
    ["1", "大豆泡", "34斤", "佛山市顺德区机关服务中心-市监饭堂午餐A59-2 佛山市顺德区机关服务中心-西座午餐A59-4 14斤 大 20斤 大只的"],
    ["2", "小豆泡", "3斤", "广州市天河区人民政府沙河街道（执法队饭堂）A27 3斤 ."],
    ["3", "圆面筋", "65斤", "佛山市高明区沧江中学（学生菜美）A49-1 65斤"],
    ["4", "素鸡", "9斤", "佛山支队执勤一中队A15 佛山支队执勤四中队A14 佛山支队高明中队A18 3斤 5斤 1斤"]
  ];
  ok("★ 近道不算数，让给会拆的那条路", 抓取试一把(份(rows)) === null);
  /* 钉住「账是平的」这个前提 —— 不然这道闸就成了摆设 */
  const 抓 = window.GM_抓取.抓(rows, {});
  let 段 = 0; (抓.行 || []).forEach(L2 => 段 += ((L2.分布 || []).length));
  ok("　　（前提：近道确实只读出 " + 段 + " 段，表上有 7 个编号）", 段 < 7);
  ok("　　（前提：它一句账都没记 —— 只盯旧账的闸拦不住它）",
    (抓.没抓到的 || []).filter(q => q && !q.问点位 && !q.要手工填).length === 0);
}

L("");
L("═══ ② 正常表：这道闸不许出手 ═══");
/* ⚠ 只验【这道闸出不出手】，不验整条近道放不放行 ——
   近道上还有别的老闸（剩字、秤…），拿它们的结果来判会把这条测糊。
   判据跟页面里那句一模一样：最多号>=3 && 段数<最多号*0.67 */
function 这道闸会拦吗(rows) {
  const 抓 = window.GM_抓取.抓(rows, {});
  if (!抓 || !(抓.行 || []).length) return null;
  const 号re = /[A-Za-z]{1,3}[0-9]{1,4}(?:-[0-9]{1,3})?|[0-9]{1,3}-[0-9]{1,2}/g;
  let 宽 = 0; rows.forEach(rr => { if (rr && rr.length > 宽) 宽 = rr.length; });
  let 最多 = 0;
  for (let c = 1; c <= 宽; c++) {
    let n = 0;
    for (let i = 1; i < rows.length; i++) {
      const t = String((rows[i] || [])[c - 1] || "").trim(); if (!t) continue;
      号re.lastIndex = 0; n += (t.match(号re) || []).length;
    }
    if (n > 最多) 最多 = n;
  }
  let 段 = 0; (抓.行 || []).forEach(L2 => 段 += ((L2.分布 || []).length));
  return { 最多, 段, 拦: (最多 >= 3 && 段 < 最多 * 0.67) };
}
{
  const rows = [
    ["序号", "商品名", "总数", "明细"],
    ["1", "水豆腐", "3板", "(A001)1板+(A002)2板"],
    ["2", "老豆腐", "5斤", "(B007)5斤"],
    ["3", "香干", "4斤", "(C1)1斤+(C2-2)3斤"]
  ];
  const m = 这道闸会拦吗(rows);
  ok("★ 5 个编号读出 5 段 → 这道闸不出手", m && !m.拦);
  ok("　　（前提：确实读出了 5 段）", m && m.段 === 5 && m.最多 === 5);
}
/* 拿真表兜一遍：这道闸不许把本来读得好好的表拦下来 */
{
  const dir = path.join(process.env.USERPROFILE || "C:/Users/李正", "Desktop", "OCR缓存");
  if (!fs.existsSync(dir)) L("  （本机没有 OCR缓存，这一段跳过，不算错）");
  else {
    const T = window.GM_TABLE;
    let 量了 = 0, 拦了 = [];
    fs.readdirSync(dir).forEach(f => {
      if (/^hit-/.test(f.split("__")[0])) return;
      let g = null; try { g = T.markdown转表(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { }
      if (!g || !g[0] || !g[0].rows) return;
      let m = null; try { m = 这道闸会拦吗(g[0].rows); } catch (e) { }
      if (!m) return;
      量了++;
      if (m.拦) 拦了.push(f.split("__")[0].slice(0, 18) + "(" + m.最多 + "号/" + m.段 + "段)");
    });
    L("  真表 " + 量了 + " 张，这道闸拦下 " + 拦了.length + " 张：" + (拦了.join("、") || "无"));
    /* 拦下来的必须是【真没读全】的那几张。多了就是误伤，这道闸就得再收窄。 */
    ok("★ 真表里拦下的不超过 3 张（多了就是误伤）", 拦了.length <= 3);
  }
}

L("");
L("═══ ③ 编号太少不判（样本不够，判了就是瞎猜）═══");
{
  const rows = [
    ["序号", "商品名", "总数", "限额"],
    ["1", "水豆腐", "3板", "西樵总店A1 3板"],
    ["2", "老豆腐", "5斤", "西樵总店A1 5斤"]
  ];
  /* 只有 2 个编号 —— 不管读成什么样，这道闸都不许出手 */
  const 抓 = window.GM_抓取.抓(rows, {});
  let 段 = 0; (抓.行 || []).forEach(L2 => 段 += ((L2.分布 || []).length));
  ok("★ 编号少于 3 个，这道闸不出手", 段 < 2 ? true : !!抓取试一把(份(rows)));
}

L("");
L("═══ ④ 那根线接在近道里 ═══");
{
  const 剥 = s => s.replace(/\/\*[\s\S]*?\*\//g, "");
  const h = 剥(H);
  const i = h.indexOf("function 抓取试一把");
  const j = h.indexOf("function 认表再摊平", i);
  const 段 = h.slice(i, j < 0 ? i + 6000 : j);
  ok("★ 检查真的写在 抓取试一把 里", /最多号>=3&&段数9<最多号\*0\.67/.test(段));
  ok("★ 扫的是【每一列】，不是只盯分布列（那张单那一列被当成了备注）",
    /for\(var c9=1;c9<=宽9;c9\+\+\)/.test(段));
  ok("★ 判不过就进硬伤堆（硬伤 = 近道作废）", /硬伤\.push\("表上有 "/.test(段));
  ok("★ 硬伤会让近道 return null", /if\(硬伤\.length\) return null;/.test(段));
}

L("");
L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
process.exit(fail ? 1 : 0);
