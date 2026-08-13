/* 导成观麦能导入的 Excel —— node 测试-导观麦.js

   老板 2026-08-03 定的两条：
     ① 走 Excel 导入（观麦官方支持，出了错能看到文件）
     ② 【一行存疑都不许导】——「导进观麦的东西改起来麻烦，宁可导之前多点两下」

   这里守三件事：
     · 该拦的都拦住（存疑 / 认不出 / 数量0 / 没单价）
     · 列名跟着模板走，改一处就全变（列名表是唯一一处）
     · 写出来的 xlsx 是真能打开的包（zip 结构、数字是数字格不是文本） */
const fs = require("fs"), path = require("path");
global.window = {};
require("./数据-商户名.js");     /* 商户名对照表要先进来，导出那边要读它 */
require("./导出-观麦.js");
const E = window.GM_EXPORT;

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; L("  ✅ " + name); }
  else { fail++; L("  ❌ " + name + "\n      应该 " + JSON.stringify(want) + "\n      实际 " + JSON.stringify(got)); }
}

const 好行 = (o) => Object.assign({
  name: "油豆腐", ours: "油豆腐", unit: "斤", qty: 1, price: 4.8,
  sku: "D4108101", spuId: "C1854277", code: "17", note: "", ok: true, 存疑: false
}, o || {});
/* 这里的样板客户用 S2999「三颗菜」，它底下挂着 3 个门店（见第⑦段），
   不选门店本来就该被拦住 —— 但这一段测的是【行】的毛病，别让门店那条掺进来，
   所以固定选一个门店。要测门店的看第⑦段。 */
const 单 = (lines) => ({
  customer_id: "S2999", customer_name: "三颗菜", shop: "三颗菜三水仓",
  order_date: "2026-08-02", deliver_date: "2026-08-03", lines: lines
});

L("── ① 一行存疑都不许导 ──");
[["存疑的", { 存疑: true }, "还没确认（存疑）"],
 ["认不出的", { ok: false, sku: "" }, "认不出，没有商品编码"],
 ["数量是 0 的", { qty: 0 }, "数量是 0"],
 ["没单价的", { price: null }, "没有单价"],
 ["没商品编码的", { sku: "" }, "认不出，没有商品编码"]].forEach(function (c) {
  const r = E.建表(单([好行(c[1])]));
  if (!r.ok && r.拦[0] && r.拦[0].因 === c[2]) { pass++; L("  ✅ " + c[0] + "拦住了：" + c[2]); }
  else { fail++; L("  ❌ " + c[0] + " → " + (r.ok ? "放过去了！" : r.拦[0].因)); }
});
/* 一行坏的就整张不给导 —— 不许「好的先导、坏的留下」 */
{
  const r = E.建表(单([好行(), 好行({ 存疑: true, name: "香干" }), 好行()]));
  ok("三行里坏一行 → 整张都不给导", r.ok, false);
  ok("而且指得出是第几行", r.拦[0].第, 2);
}

L("");
L("── ② 好的单，内容要对 ──");
{
  const r = E.建表(单([好行(), 好行({ name: "水豆腐/板", ours: "尝元小板豆腐", unit: "板", qty: 12, price: 4.5, sku: "D111", code: "1-31" })]));
  ok("能导", r.ok, true);
  ok("表头 = 列名表的标题", r.rows[0], E.列名.map(c => c.标题));
  ok("有几行货就几行（加一行表头）", r.rows.length, 3);
  /* ★ 列顺序钉死 —— 2026-08-05 在观麦后台一列一列试出来的，9 列全进去了。
     观麦按【第几列】认，多一列少一列都把后面挤歪，报「第N列应该为：xx」。
     要动这个顺序，先去后台改模板，两边一起改。 */
  ok("10 列、顺序跟观麦模板一字不差", r.rows[0],
     ["商户名","商品名","下单数","单位","单价","商品备注","订单备注","客户点位","商户SID","商品ID"]);
  ok("模板没映的列一律不出（多一列就挤歪）",
     ["商户编码","商品编码","销售单位","下单金额","自定义编码"]
       .filter(t => E.列名.some(c => c.标题 === t)), []);
  /* ★ 商品ID 填 D 码（规格ID），不是 C 码（商品本体）。
     填错了观麦按码取货，会静默拿到别人家的货 —— 页面上看不出来。 */
  ok("商品ID 填的是 sku（D 码）",
     [r.rows[1][E.列名.findIndex(c => c.标题 === "商品ID")],
      r.rows[2][E.列名.findIndex(c => c.标题 === "商品ID")]], ["D4108101", "D111"]);
  /* 商品名必须是【这家在观麦里的叫法】，不是客户手写的词 ——
     观麦拿这个名字去这家的报价单里配货，填错了就配不上 */
  const 名列 = E.列名.findIndex(c => c.标题 === "商品名");
  ok("商品名填的是我们的叫法(ours)，不是客户写的词", r.rows[2][名列], "尝元小板豆腐");
  /* 数量、单价必须是数字，不能是字符串 —— 观麦按文本读会报错 */
  const 数列 = E.列名.findIndex(c => c.标题 === "下单数");
  const 价列 = E.列名.findIndex(c => c.标题 === "单价");
  ok("数量是数字不是文本", typeof r.rows[2][数列], "number");
  ok("单价是数字不是文本", typeof r.rows[2][价列], "number");
  ok("数量取的是折算后的数（12板不是12斤）", r.rows[2][数列], 12);
  /* 收货日期不进表 —— 那个在观麦导入弹窗上选 */
  ok("表里没有日期列（日期在弹窗选）", r.rows[0].some(h => /日期|时间/.test(h)), false);
  const 找 = t => E.列名.findIndex(c => c.标题 === t);
  /* 点位和备注分三列，别拼一起 —— 观麦下拉里本来就是三个位 */
  ok("客户点位单独一列", r.rows[2][找("客户点位")], "1-31");
  /* ★ 商户SID 是【门店】的码，不是报价单号。
     填成报价单号 S2999 观麦一路报错 —— 这是踩过的坑，别再犯。 */
  ok("商户SID 不是报价单号", r.rows[1][找("商户SID")] === "S2999", false);
  ok("商户SID 是这个门店的码", /^S\d+$/.test(r.rows[1][找("商户SID")]), true);
  /* 列名必须跟观麦「系统名称」一字不差，否则映射时对不上号 */
  const 观麦下拉 = ["商户名","商户编码","商品名","商品编码","下单数","单位","单价",
                   "商品ID","自定义编码","商品备注","商户SID","订单分批号","订单类型",
                   "销售单位","订单备注","税率","下单金额","是否打印","客户点位"];
  const 不在 = E.列名.map(c => c.标题).filter(h => 观麦下拉.indexOf(h) < 0);
  ok("每个列名都能在观麦下拉里找到（对不上就映不了）", 不在, []);
}

L("");
L("── ②b 一个文件放好几家（批量导） ──");
{
  const A = 单([好行()]);
  const B = { customer_id: "S2947", customer_name: "裕丰", order_date: "2026-08-02", deliver_date: "2026-08-03",
              lines: [好行({ name: "千张", ours: "千张", sku: "D9", qty: 3, price: 4 })] };
  const r = E.建表([A, B]);
  ok("两家合成一个文件", r.ok, true);
  ok("表头一行 + 两行货", r.rows.length, 3);
  ok("认得出是两张单", r.单数, 2);
  const 户 = E.列名.findIndex(c => c.标题 === "商户名");
  /* 商户名分得开，而且填的都是【观麦那边的商户名】，不是我们的报价单名：
       A：选了门店 → 三颗菜三水仓
       B：S2947 只挂一个商户 → 自动补成观麦的全称（我们这边只写了「裕丰」） */
  ok("商户名分得开", [r.rows[1][户], r.rows[2][户]],
     ["三颗菜三水仓", "广东裕丰膳食管理服务有限公司"]);
  /* 批量里有一行坏的，整批都不给导 */
  const bad = E.建表([A, { customer_name: "裕丰", lines: [好行({ 存疑: true, name: "香干" })] }]);
  ok("批量里坏一行 → 整批不给导", bad.ok, false);
  ok("报得出是哪一家", bad.拦[0].客户, "裕丰");
}

L("");
L("── ③ 列名跟着模板走，改一处就全变 ──");
/* 观麦的模板迟早会变列名。改 导出-观麦.js 顶上那张表就该全跟着变，
   别处不许再写死一份 —— 写死两份，总有一天改了一处忘了另一处。 */
{
  const 原 = E.列名[0].标题;
  E.列名[0].标题 = "★换个名字试试";
  const r = E.建表(单([好行()]));
  ok("表头跟着列名表变", r.rows[0][0], "★换个名字试试");
  E.列名[0].标题 = 原;
  const r2 = E.建表(单([好行()]));
  ok("改回来也跟着变", r2.rows[0][0], 原);
}

L("");
L("── ④ 写出来的 xlsx 得是真能开的包 ──");
{
  const r = E.建表(单([好行(), 好行({ qty: 12, price: 4.5, sku: "D111" })]));
  const buf = E.xlsx("订单导入", r.rows, r.数字列);
  ok("是 zip 包（PK 开头）", [buf[0], buf[1]], [0x50, 0x4B]);
  ok("有点大小", buf.length > 1500, true);
  const s = Buffer.from(buf).toString("latin1");
  ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
   "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml"].forEach(function (n) {
    if (s.indexOf(n) >= 0) pass++; else { fail++; L("  ❌ 包里少了 " + n); }
  });
  L("  ✅ 五个必备零件都在");
  /* 中文不能乱码：文件名用 UTF-8 标志位，内容本身也是 UTF-8 */
  const u = Buffer.from(buf).toString("utf8");
  ok("中文没乱码", u.indexOf("三颗菜") >= 0, true);
  /* 数字必须写成 <v>，写成 inlineStr 观麦读进去就是文本 */
  ok("数量写成数字格", /<v>12<\/v>/.test(u), true);
  ok("单价写成数字格", /<v>4\.5<\/v>/.test(u), true);
  ok("文字写成 inlineStr", /t="inlineStr"/.test(u), true);
}

L("");
L("── ⑤ 列号别数错（超过 26 列会用到）──");
ok("第 1 列是 A", E.列号(0), "A");
ok("第 26 列是 Z", E.列号(25), "Z");
ok("第 27 列是 AA", E.列号(26), "AA");
ok("第 52 列是 AZ", E.列号(51), "AZ");
ok("第 53 列是 BA", E.列号(52), "BA");

L("");
L("── ⑥ 页面真接上了没 ──");
{
  const H = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
  ok("有「导观麦」按钮", /id="btn-gm"/.test(H), true);
  ok("按钮挂上了", /btn-gm[\s\S]{0,120}导观麦/.test(H), true);
  ok("引了 导出-观麦.js", /导出-观麦\.js/.test(H), true);
  ok("先存记录再导（单号要对得上）", /ordThen\(导观麦\)/.test(H), true);
  ok("客户没确认不给导", /导观麦\(\)[\s\S]{0,400}custOK/.test(H), true);
  /* 列名只能有一处 —— 页面里不许再写死一份 */
  ok("页面里没有再抄一份列名", !/客户编号[\s\S]{0,200}商品编码[\s\S]{0,200}下单数量/.test(H), true);
}
{
  const d = "C:/Users/Public/kaidan/deploy.ps1";
  if (fs.existsSync(d)) ok("上传清单里有 导出-观麦.js（漏了线上白屏）",
    fs.readFileSync(d, "utf8").indexOf("导出-观麦.js") >= 0, true);
}

L("");
L("── ⑦ ★ 商户名：观麦要的是商户名，不是报价单名 ──");
/* 2026-08-05 踩的坑：拿「三颗菜」去导，观麦报「商户异常」。
   因为「三颗菜」是【报价单名】，观麦要的是【商户名】「三颗菜三水仓」。
   证据不是猜的：观麦自己导出的订单头里，商户名是 customer.extender.resname，
   挂在 customer 底下；salemenu 只是 customer.salemenu_id 一个外键。
   一张报价单可以被好几个商户共用 —— 那几个商户就是门店。
   9765 行真单里 5742 行两者不一样，光拿报价单名导，一大半进不去。 */
{
  const 单 = (cid, 名, shop) => ({
    customer_id: cid, customer_name: 名, shop: shop || "",
    order_date: "2026-08-05", deliver_date: "2026-08-06",
    lines: [{ ok: true, sku: "D123456", name: "白豆腐", unit: "板", qty: 2, price: 10, code: "", note: "" }]
  });
  const 商户名 = r => { const i = r.rows[0].indexOf("商户名"); return r.rows[1][i]; };
  const SID = r => { const i = r.rows[0].indexOf("商户SID"); return r.rows[1][i]; };

  const G = window.GM_SHOP || {};
  ok("对照表加载了", Object.keys(G).length > 100, true);
  ok("S2999 是多商户的（三颗菜挂 3 个）", (G.S2999 && G.S2999.店.length) >= 2, true);
  ok("S2984 江云只有一个商户", (G.S2984 && G.S2984.店.length), 1);

  /* 一对一：自动填观麦的商户名，人什么都不用做 */
  const a = E.建表(单("S2987", "随便写个报价单名"));
  ok("一对一：不用选门店也能导", a.ok, true);
  ok("一对一：商户名填的是观麦那边的名字",
    商户名(a), "佛山市万速鲜供应链管理有限公司");

  /* 江云：报价单名和商户名本来就一样，是之前唯一能导进去的那种 */
  ok("江云照旧能导", 商户名(E.建表(单("S2984", "江云生鲜配送"))), "江云生鲜配送");

  /* 多商户没选门店：必须拦住。
     ⛔ 这条最要紧 —— 不拦就是拿报价单名硬导，观麦一定报商户异常，
        白跑一趟还得回来重导。「存疑不算错，认错才是错」。 */
  const b = E.建表(单("S2999", "三颗菜"));
  ok("多商户没选门店：拦住不给导", b.ok, false);
  ok("门店的事单独报，不混进「拦」（混进去行号会顶掉一位）", b.拦.length, 0);
  ok("把几个门店摆出来给人选", (b.要选门店[0].店 || []).indexOf("三颗菜三水仓") >= 0, true);
  ok("说清是哪家客户要选", b.要选门店[0].客户, "三颗菜");

  /* 选了门店：填门店名，这就是观麦的商户名 */
  const c = E.建表(单("S2999", "三颗菜", "三颗菜三水仓"));
  ok("选了门店：能导", c.ok, true);
  ok("选了门店：商户名＝门店名", 商户名(c), "三颗菜三水仓");
  ok("换一个门店就换一个商户名",
    商户名(E.建表(单("S3005", "真实惠", "真实惠生活超市联和店"))), "真实惠生活超市联和店");

  /* 表里没有这家（观麦近期没有它的订单）：退回报价单名，别把单子卡死 */
  const e = E.建表(单("S9999", "查无此单"));
  ok("表里没有的：不拦，退回报价单名", e.ok, true);
  ok("表里没有的：填报价单名（人自己去核）", 商户名(e), "查无此单");
  ok("表里没有的：SID 留空，绝不瞎填", SID(e), "");

  /* ★ 商户SID —— 2026-08-05 实测：观麦认 SID，不认名字。
     故意把商户名写错成「江云」、SID 填对，6 行照样落到「江云生鲜配送/S3797453」。
     所以这一列填错就是开错给别人家，比名字错严重得多。 */
  ok("江云的 SID", SID(E.建表(单("S2984", "江云生鲜配送"))), "S3797453");
  ok("SID 跟着门店走，不是跟着报价单走",
    SID(E.建表(单("S2999", "三颗菜", "三颗菜三水仓"))) !== SID(E.建表(单("S3005", "真实惠", "真实惠生活超市联和店"))), true);
  /* 名字和 SID 必须出自同一次判断，不然会出现「名字是A仓、SID是B仓」——
     那种单子观麦按 SID 收，货就送错店了，页面上还看不出来。 */
  {
    const g = window.GM_SHOP.S2999.店;
    g.forEach(function (店) {
      const r = E.建表(单("S2999", "三颗菜", 店[0]));
      ok("「" + 店[0] + "」名字和 SID 是同一家", [商户名(r), SID(r)], [店[0], 店[1]]);
    });
  }

  /* 页面那头 */
  const H = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
  ok("页面引了 数据-商户名.js", /数据-商户名\.js/.test(H), true);
  ok("门店下拉拿观麦真名打底", /function shopsOf[\s\S]{0,300}GM_SHOP/.test(H), true);
  ok("观麦的商户名不给删", /是观麦的店/.test(H), true);
  /* shopsOf 现在返回的是拼出来的新数组，shopDel 再拿它 splice 就删不掉了 */
  ok("shopDel 改的是 OV.shops 本身，不是 shopsOf 的返回值",
    /function shopDel[\s\S]{0,200}OV\.shops/.test(H), true);
  const d2 = "C:/Users/Public/kaidan/deploy.ps1";
  if (fs.existsSync(d2)) ok("上传清单里有 数据-商户名.js（漏了线上又是商户异常）",
    fs.readFileSync(d2, "utf8").indexOf("数据-商户名.js") >= 0, true);
}

L("");
L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
process.exit(fail ? 1 : 0);
