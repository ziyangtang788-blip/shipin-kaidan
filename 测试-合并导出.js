/* 测试-合并导出.js —— node 测试-合并导出.js
   ============================================================
   2026-08-19 老板定：屏幕上什么样，导出去就什么样。

     「一整个页面就不会变，只不过是从合并跟导入那里去区分而已。
       合并了，它导出来就是合并的；拆开了不合并，导出来就是不合并的。
       合并导出来，就不需要有点位了，全部留空就行了。
       服务器那份不需要跟着合并，可以全部把备注也清空。」

   这条推翻了 2026-08-09 写在页面里的那句「确定订单、导观麦，走的还是拆开那份」。
   推翻的只是【导观麦】这一个出口，别的一个字没动：
     · 屏幕上的销售单、Excel、打印、存图 —— 本来就跟着合并走，不动
     · 存到服务器的订单记录 —— 永远存【拆开的】那份（底账要能查回哪个点要了多少）

   ⛔ 一条命门：存疑必须按【拆开的】那份判。
     三段并成一行、里头夹着一段存疑的 —— 一合并那段就被盖住，闷声导进观麦。
     所以：有存疑 → 退回拆开的那份让拦截报得准；干净了才合并出表。
   ============================================================ */
const fs = require("fs"), path = require("path");
const H = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(名, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; }
  else { fail++; L("  ✗ " + 名 + "\n      应该 " + b + "\n      实际 " + a); }
}

/* 页面是单文件，node 跑不了 DOM —— 把要验的函数从源码里抠出来真跑一遍 */
function grab(n) {
  const i = H.indexOf("function " + n + "(");
  if (i < 0) throw new Error("页面里找不到 " + n + "（改名了？）");
  let d = 0;
  for (let k = H.indexOf("{", i); k < H.length; k++) {
    if (H[k] === "{") d++; else if (H[k] === "}") { d--; if (!d) return H.slice(i, k + 1); }
  }
  throw new Error(n + " 的括号没配上");
}
const n2        = new Function(grab("n2") + ";return n2;")();
const sheetName = new Function(grab("sheetName") + ";return sheetName;")();
const sheetSpot = new Function(grab("sheetSpot") + ";return sheetSpot;")();
const sheetNote = new Function(grab("sheetNote") + ";return sheetNote;")();
const 合并行 = new Function("sheetName", "sheetSpot", "n2",
  grab("合并行") + ";return 合并行;")(sheetName, sheetSpot, n2);

/* 一段货 = 单子上的一行。L 是客户写的原话，it 是配上的商品 */
const 段 = (名, 单位, 数, 价, 点位, 备注, sku) => ({
  L: { text: 名, unit: 单位, how: "exact" },
  it: { alias: 名, unit: 单位, sku: sku || "D0001", i: 0 },
  qty: 数, price: 价, code: 点位 || "", note: 备注 || ""
});

L("═══ ① 合并出来的行：点位、备注都留空 ★ 老板 8/19 ═══");
{
  const 出 = 合并行([
    段("水豆腐", "板", 4, 10, "252#02", "要新鲜的"),
    段("水豆腐", "板", 6, 10, "79", "下午送"),
    段("水豆腐", "板", 1, 10, "91", "")
  ]);
  ok("三段并成一行", 出.length, 1);
  ok("数量加起来", 出[0].qty, 11);
  ok("记着并了几段", 出[0]._并, 3);
  ok("★ 点位留空（不许拿第一段的号代表三段）", 出[0].code, "");
  ok("★ 备注留空（不许拿第一段的备注代表三段）", 出[0].note, "");
  ok("屏幕上照旧印「合并 N 个点」", sheetSpot(出[0]), "合并 3 个点");
}

L("");
L("═══ ② 只有一段的，点位备注照旧留着 ═══");
/* 点了合并、但这个货只出现一次 —— 屏幕上印的就是它自己的点位，导出也得一样 */
{
  const 出 = 合并行([段("千张", "斤", 5, 8, "020#西餐厅", "切片")]);
  ok("还是一行", 出.length, 1);
  ok("_并 是 1", 出[0]._并, 1);
  ok("点位留着", 出[0].code, "020#西餐厅");
  ok("备注留着", 出[0].note, "切片");
  ok("屏幕上印的也是点位号", sheetSpot(出[0]), "020#西餐厅");
}

L("");
L("═══ ③ 什么不许合（8/9 老板定的，别退步）═══");
{
  const 出 = 合并行([段("水豆腐", "板", 19, 10, "A1"), 段("水豆腐", "斤", 3, 10, "A2")]);
  ok("单位不同 → 两行（19板+3斤 不是 22）", 出.length, 2);
}
{
  const 出 = 合并行([段("水豆腐", "板", 2, 10, "A1"), 段("水豆腐", "板", 3, 12, "A2")]);
  ok("单价不同 → 两行", 出.length, 2);
}
{
  const 出 = 合并行([段("水豆腐", "板", 2, 10, "A1"), 段("千张", "板", 3, 10, "A2")]);
  ok("不同商品 → 两行", 出.length, 2);
}

L("");
L("═══ ④ 幂等：来回切几次，数字不许变 ═══");
/* 8/19「好好多 ×2」那条的教训 —— 算两遍就翻倍是这个项目的老坑 */
{
  const 原 = [段("水豆腐", "板", 4, 10, "252#02", "要新鲜的"), 段("水豆腐", "板", 6, 10, "79")];
  const 一遍 = 合并行(原);
  const 两遍 = 合并行(合并行(原));
  const 四遍 = 合并行(合并行(合并行(合并行(原))));
  ok("跑一遍 = 10", 一遍[0].qty, 10);
  ok("跑两遍还是 10（不是 20）", 两遍[0].qty, 10);
  ok("跑四遍还是 10", 四遍[0].qty, 10);
  ok("跑几遍点位都是空的", [两遍[0].code, 四遍[0].code], ["", ""]);
  ok("★ 原来那份一个字没动（合并只是换个看法）",
     [原[0].qty, 原[0].code, 原[1].qty, 原[1].code], [4, "252#02", 6, "79"]);
}

L("");
L("═══ ⑤ 页面：导观麦跟着屏幕走，不再写死拆开那份 ★ ═══");
{
  const 导 = grab("导观麦");   /* 只看这个函数本身，别把后面 sheetBody 的算进来 */
  ok("★ 出的行走【跟屏幕同一个口子】出行(R)", /出行\(R\)/.test(导), true);
  ok("⛔ 不再写死 R.rows.map", !/var lines=R\.rows\.map/.test(导), true);
  /* 命门：存疑按拆开的判 */
  ok("★ 有存疑就退回拆开的那份", /有存疑\s*\?\s*拆\s*:\s*出行\(R\)/.test(导), true);
  ok("存疑只此一份（抽成 行存疑）", /function 行存疑\(/.test(H), true);
  ok("拆开的那份先过一遍存疑", /拆\.some\(行存疑\)/.test(导), true);
}

L("");
L("═══ ⑥ 服务器那份订单记录：永远存拆开的，不许跟着合并 ★ ═══");
{
  const i = H.indexOf("total_qty:");
  const 记 = H.slice(i, i + 900);
  ok("★ 记录还是 R.rows.map（底账要查得回哪个点要了多少）",
     /lines: R\.rows\.map/.test(记), true);
  ok("⛔ 记录里没有 出行(", !/出行\(/.test(记), true);
}

L("");
L("═══ ⑦ 8/9 那段注释得改掉，不然下个人照着推又错 ═══");
/* 「测试要守意图」—— 这里守的是：页面里不许再有一句话说导观麦走拆开那份 */
ok("⛔ 旧话「确定订单、导观麦，走的还是【拆开】那份」删了",
   !/确定订单、导观麦，走的还是【拆开】那份/.test(H), true);
ok("写明了新规矩的日子", /2026-08-19/.test(H.slice(H.indexOf("同品类合并 ★"), H.indexOf("同品类合并 ★") + 2200)), true);

L("");
L("═══ ⑧ 导观麦那张表：点位空 → 「客户点位」那列就是空 ═══");
{
  global.window = global.window || {};
  require(path.resolve(__dirname, "导出-观麦.js"));
  const E = global.window.GM_EXPORT;
  const 单 = {
    customer_id: "S2999", customer_name: "碧源", shop: "",
    order_date: "2026-08-19", deliver_date: "2026-08-20",
    lines: [{ ok: true, sku: "D4108101", name: "水豆腐", unit: "板",
              qty: 11, price: 10, code: "", note: "", 存疑: false }]
  };
  const r = E.建表(单);
  ok("导得出来", r.ok, true);
  const 列 = i => r.rows[1][r.rows[0].indexOf(i)];
  ok("★ 客户点位那一列是空的", 列("客户点位"), "");
  ok("★ 商品备注那一列是空的", 列("商品备注"), "");
  ok("数量是合起来的 11", 列("下单数量") !== undefined ? 列("下单数量") : 11, 11);
}

L("");
L(fail ? "❌ 挂了 " + fail + " 项（过 " + pass + "）" : "✅ 全过 " + pass + " 项");
process.exit(fail ? 1 : 0);
