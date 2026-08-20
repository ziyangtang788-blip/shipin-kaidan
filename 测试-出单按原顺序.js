/* 测试-出单按原顺序.js —— node 测试-出单按原顺序.js
   ============================================================
   老板 2026-08-20：「我想全部按照我给系统的单的顺序出。」

   查下来四处顺序原来是这样的：
     屏幕     ❌ 把「要你拿主意的」整批提到最前面，剩下的收进
                 「▾ 下面 N 行没问题」的折叠段 —— 客户那张单的行序被切成两段
     打印     ❌ 打印印的就是屏幕，所以跟着乱
     导观麦    ✅ 走 compute() 的 rows，本来就是原顺序
     订单记录  ✅ 同上
   所以要改的只有屏幕那一处，改完四处才一致。

   顺带老板加的一条：
     「有问题的行做个特别的标注，就是我手动改的那些，但是不要标红。」
     样式他选的是「左边一道竖条」，颜色用青（避开琥珀=要填、红=对不上）。
     ⚠ 这是【留痕】不是【待办】——处理完也不消失。

   ⚠ 原来的橙/红一个字没动（老板：「原来的不动」）。
   ============================================================ */
const path = require("path"), fs = require("fs");
const h = fs.readFileSync(path.resolve(__dirname, "配送开单台.html"), "utf8");

let 过 = 0, 挂 = 0;
function ok(名, 条件, 说) {
  if (条件) { 过++; console.log("  ✅ " + 名 + (说 ? "　" + 说 : "")); }
  else { 挂++; console.log("  ❌ " + 名 + (说 ? "　" + 说 : "")); }
}

/* ══════ 一、★ 屏幕不许再重排 ══════ */
console.log("\n【一、屏幕按原顺序，一行都不挪 ★】");
ok("★ 没有「要/闲」分堆了", !/var 要=待排\.filter/.test(h));
ok("★ 没有折叠条了（它是靠分组实现的）", !/下面 '\+闲\.length\+' 行没问题/.test(h));
ok("待排 这个变量清干净了", !/待排/.test(h));
ok("行是照 R.rows 顺序直接贴的", /R\.rows\.forEach\(function\(r,n\)\{[\s\S]{0,12000}?tb\.appendChild\(tr\);\s*\}\);/.test(h));
/* 孤儿 CSS 也要清 —— 留着以后有人照着改，改的是一份死的 */
ok("okrow / rowsplit 的样式没留下孤儿", !/\.okrow|\.rowsplit/.test(h));

/* ══════ 二、导出和记录本来就是原顺序，不许被这次改动带歪 ══════ */
console.log("\n【二、导观麦 / 订单记录 照旧走原顺序】");
ok("导观麦走 出行(R)，不是自己排一份", /var 出=有存疑\?拆:出行\(R\)/.test(h));
ok("出行() 只在合并/不合并之间选，不排序", /function 出行\(R\)\{\s*return 合并模式 \? 合并行\(R\.rows\|\|\[\]\) : \(R\.rows\|\|\[\]\);\s*\}/.test(h));
ok("compute() 里 rows 是按 ST.lines 顺序推的", /function compute\(\)[\s\S]{0,200}ST\.lines\.forEach/.test(h));

/* ══════ 三、★ 动过的行留痕：左边一道青竖条 ══════ */
console.log("\n【三、你动过的行，左边一道青竖条 ★】");
ok("三种痕迹都算动过（手改 / pinned / manual）",
   /r\.L\.手改\|\|r\.L\.pinned\|\|r\.L\.manual/.test(h));
ok("贴的是 q-hand", /classList\.add\("q-hand"\)/.test(h));
/* ⚠ 必须用 add：一行可能既动过、又还对不上总数，两个记号要叠加 */
ok("★ 用 add 不是赋值（要能跟橙/红叠加）", /classList\.add\("q-hand"\)/.test(h) && !/className="q-hand"/.test(h));
ok("样式是左边竖条", /tr\.q-hand\{box-shadow:inset 6px 0 0/.test(h));
ok("★ 不是红的（老板：不要标红）", !/tr\.q-hand\{[^}]*E05C5C/.test(h));
ok("跟橙条能并排显示", /tr\.q-hand\.q-blur\{box-shadow:inset 3px 0 0 var\(--acc\), inset 6px/.test(h));
ok("跟红条也能并排显示", /tr\.q-hand\.q-diff\{box-shadow:inset 3px 0 0 #E05C5C, inset 6px/.test(h));
/* ⛔ 别再叫 edited —— 那个名字「客户·改价」页早就在用（tr.edited 2px 琥珀条，
   标"改过价的品"）。重名会把那一页的样式整个盖掉。
   2026-08-20 我就是这么写的，测试当场抓到，才改成 q-hand。 */
ok("⛔ 改价页那个 edited 还好好的（没被重名盖掉）",
   /tr\.edited\{box-shadow:inset 2px 0 0 var\(--acc\)\}/.test(h));
ok("⛔ 开单台这条没占用 edited 这个名字", !/classList\.add\("edited"\)/.test(h));

/* ══════ 四、原来那两档一个字都不许动 ══════
   老板 2026-08-20 原话：「原来的不动」。 */
console.log("\n【四、原来的橙 / 红没被动过】");
ok("q-blur 还在（识别没看清 / 客户写的 0）", /tr\.q-blur\{box-shadow:inset 3px 0 0 var\(--acc\)\}/.test(h));
ok("q-diff 还在（跟表上总数对不上）", /tr\.q-diff\{box-shadow:inset 3px 0 0 #E05C5C\}/.test(h));
ok("贴 q-blur 的判断还在", /if\(本行没看清\) tr\.className="q-blur"/.test(h));
ok("客户写 0 的照旧算一档", /本行是零\) tr\.className="q-blur"/.test(h));
ok("贴 q-diff 的判断还在", /本行对不上\) tr\.className="q-diff"/.test(h));

console.log("\n════════════════════════");
console.log("过 " + 过 + "　挂 " + 挂);
process.exit(挂 ? 1 : 0);
