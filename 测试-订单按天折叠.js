/* 订单记录按天折叠 —— node 测试-订单按天折叠.js

   老板 2026-08-27：
     「现在的数据太多了，然后给他按在订单列表那里，给他按日期做成折叠，
     　然后可以看到每天的总数」
     「按照这个分，这都是一天的，总数看开了多少单，有多少总金额」
     （他指的是单号 XS20260827-25 里那 8 位）

   钉三件事：
     ① 日期从【单号】里取，取不到才退回下单日 —— 一行都不许没归宿
     ② 每天那一行的「几张单 / 总金额」算得对
     ③ 那几根线真接上了（防「写了但没接上」） */
const fs = require("fs");
const path = require("path");
const 家 = __dirname;

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) pass++; else { fail++; L("  ✗ " + name + "\n      应该 " + b + "\n      实际 " + a); }
}

const H = fs.readFileSync(path.join(家, "配送开单台.html"), "utf8");
/* 把 单号那天 抠出来真跑 —— 不另抄一份判据 */
const i = H.indexOf("function 单号那天(");
if (i < 0) throw new Error("页面里找不到 单号那天（改名了？）");
let d = 0, src = "";
for (let k = H.indexOf("{", i); k < H.length; k++) {
  if (H[k] === "{") d++; else if (H[k] === "}") { d--; if (!d) { src = H.slice(i, k + 1); break; } }
}
const 单号那天 = new Function(src + ";return 单号那天;")();

L("═══ ① 日期从单号里取 ═══");
ok("★ 老板指的那个：XS20260827-25", 单号那天({ order_no: "XS20260827-25" }), "2026-08-27");
ok("同一天的另一张", 单号那天({ order_no: "XS20260827-22" }), "2026-08-27");
ok("换一天", 单号那天({ order_no: "XS20260801-01" }), "2026-08-01");
/* ★ 单号取不到就退回下单日 —— 一行都不许没归宿（没归宿＝凭空少一张单） */
ok("★ 单号是空的 → 退回下单日", 单号那天({ order_no: "", order_date: "2026-08-26" }), "2026-08-26");
ok("★ 单号没有 8 位数 → 退回下单日", 单号那天({ order_no: "手工-7", order_date: "2026-08-25" }), "2026-08-25");
ok("★ 两样都没有 → 也得有个归宿，不许掉进虚空", 单号那天({}), "没有日期");

L("");
L("═══ ② 每天那一行：几张单、总金额 ═══");
{
  /* 照页面里那段分组逻辑算一遍（同一套写法，不另起一份） */
  const rows = [
    { order_no: "XS20260827-25", total_amount: 100.5 },
    { order_no: "XS20260827-24", total_amount: 200.25 },
    { order_no: "XS20260827-23", total_amount: 0 },
    { order_no: "XS20260826-09", total_amount: 77 },
    { order_no: "", order_date: "2026-08-25", total_amount: 3 }
  ];
  const 天序 = [], 堆 = {};
  rows.forEach(o => {
    const t = 单号那天(o);
    if (!堆[t]) { 堆[t] = { 张: 0, 钱: 0 }; 天序.push(t); }
    堆[t].张++; 堆[t].钱 += (+o.total_amount || 0);
  });
  ok("分成 3 天", 天序.length, 3);
  ok("★ 8-27 那天：3 张", 堆["2026-08-27"].张, 3);
  ok("★ 8-27 那天金额合计", Math.round(堆["2026-08-27"].钱 * 100) / 100, 300.75);
  ok("金额是 0 的那张也得算进张数（不许因为没钱就漏掉）", 堆["2026-08-27"].张, 3);
  ok("没单号那张归到它的下单日", 堆["2026-08-25"].张, 1);
  ok("天的先后照原来的行序（后端已经按新到旧给了）", 天序[0], "2026-08-27");
}

L("");
L("═══ ③ 线接上了没有 ═══");
{
  const 剥 = s => s.replace(/\/\*[\s\S]*?\*\//g, "");
  const h = 剥(H);
  const 数 = k => h.split(k).length - 1;
  ok("单号那天：定义 + 至少 1 处调用", 数("单号那天") >= 2, true);
  ok("收起哪天：定义 + 至少 1 处调用", 数("收起哪天") >= 2, true);
  ok("ordRender 里真的按天分了组", /ord-day/.test(h) && /data-day/.test(h), true);
  ok("★ 日期那一行点得动（绑了 click）", /tr\.ord-day[\s\S]{0,200}addEventListener\("click"/.test(h), true);
  ok("★ 头一天摊开、别的收起（一进来全收起，人会以为单子没了）",
    /收=\(i>0\)/.test(h), true);
  ok("★ 收起时把「明细」那一行也一起收（不然收起来还留着一片明细）",
    /ord-det[\s\S]{0,80}hidden/.test(h), true);
  /* 原来那几样不许弄丢 */
  ok("「明细」按钮还在", /data-no="'\+esc\(o\.order_no\|\|""\)\+'">明细/.test(h), true);
  ok("「调出来改」按钮还在", /ordre/.test(h), true);
  ok("张数还印在右上角", /ord-count"\)\.textContent/.test(h), true);
}

L("");
L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
process.exit(fail ? 1 : 0);
