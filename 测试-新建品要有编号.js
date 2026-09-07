/* 新建的品导不进观麦（2026-08-24 老板：「我新加产品没有编号，也导入不进去，
   所以客户列表那里新加产品要有编号」）

   经过：就地新建的品，系统给它编了个【自己的假码】X{客户号}-{时间戳}-{随机数}，
   导出时原样填进「商品ID」那一列 → 观麦不认识 → 报「商品不存在」，整单进不去。

   ⛔ 拿假码去撞比不填还糟：不填的话观麦会退回去【按商品名】在这家报价单里配货，
     顶多弹一条「商品未完全识别」的黄杠，货还是能进。

   钉两件事：
     ① 导出：自己编的码一律留空，观麦发的真码照填
     ② 新建品：人能把观麦的商品ID 填进来，填了就拿它当这个品的码 */
const fs = require("fs"), path = require("path");
const 家 = __dirname;
global.window = global.window || {};
require(path.join(家, "数据-商户名.js"));
require(path.join(家, "导出-观麦.js"));
const E = global.window.GM_EXPORT;

let 过 = 0, 挂 = [];
function 该(话, 真) { if (真) 过++; else 挂.push(话); }

function 单(sku) {
  return {
    customer_id: "S11017", customer_name: "中南华辰档口", order_no: "T1", note: "",
    lines: [{ ok: true, sku: sku, name: "水豆腐", ours: "水豆腐", qty: 2, unit: "板", price: 6, code: "K1", note: "" }]
  };
}
function 商品ID(sku) {
  const t = E.建表(单(sku));
  if (!t.ok) return null;
  return t.rows[1][t.rows[0].indexOf("商品ID")];
}

/* ── ① 导出那一列 ── */
该("★ 我们自己编的假码 → 商品ID 留空（观麦按商品名配，货能进）",
  商品ID("XS16165-1756000000000-123") === "");
该("观麦的 D 码照填", 商品ID("D3196709") === "D3196709");
该("观麦的 C 码照填", 商品ID("C123456") === "C123456");
/* 一点码都没有的行是【被拦住】的，根本轮不到导出 —— 见下面 ②。
   所以这儿返回 null（没出表），不是空字符串。 */
该("一点码都没有的，压根出不了表", 商品ID("") === null);

/* ⚠ 别误伤：真码里也可能带 X（观麦的编码规则不归我们定）。
   只有【X + 一串非横杠 + 十位以上时间戳 + 横杠】这个形状才算我们自编的。 */
该("X 开头但不是我们那个形状的，当真码照填", 商品ID("X1234567") === "X1234567");
该("带横杠但没有时间戳的，当真码照填", 商品ID("XS-123-4") === "XS-123-4");

/* ── ② 没有编码的行照旧不许导 ── */
{
  const t = E.建表({
    customer_id: "S11017", customer_name: "中南华辰档口", order_no: "T1",
    lines: [{ ok: true, sku: "", name: "认不出的货", qty: 1, unit: "斤", price: 1 }]
  });
  该("★ 一点编码都没有的行照旧拦住（一行存疑都不许导）",
    !t.ok && (t.拦 || []).some(x => /没有商品编码/.test(x.因)));
}

/* ── ③ 页面：新建品的表单里有「观麦商品ID」，而且真会传下去 ── */
{
  const H = fs.readFileSync(path.join(家, "配送开单台.html"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  该("★ 新建品的表单里有「观麦商品ID」这一格", /class="np-sku"/.test(H));
  该("填的那个 ID 真的传给了 addProduct", /sku:\(box\.querySelector\("\.np-sku"\)/.test(H));
  该("addProduct 只认【看着像观麦码】的（免得拿假码去撞）",
    /\^\[A-Z\]\{1,2\}\[0-9\]\{5,12\}\$/.test(H));
  该("没填就照旧自己编一个（不能不给码，别处都拿它当键）",
    /if\(!sku\) sku="X"\+cid\+"-"\+Date\.now\(\)/.test(H));
  该("这家已经有这个码就不重复建", /b0\.sku\[填的\]!==undefined/.test(H));

  /* ★★ 2026-09-07 老板在「客户·改价」页新建品，发现那个框里没有编码格：
       「这里无法添加商品编码，就导入不进去观麦」。
     同一件事有【两个入口】—— 开单页就地新建、客户资料页「＋新增品类」——
     8/24 只补了前一个，后一个漏了整整两周。
     ⛔ 以后加入口必须两个一起加：这两条钉的就是「一个都不许少」。 */
  /* ⚠ 这两格是写在 HTML 标记里的，得看【没剥过注释的原文】——
     上面那个 H 剥注释用的是 /* … *​/ 那种粗办法，
     而页面里 accept="image/*" 的斜杠星号会被当成注释开头，
     把后面一大段真代码一起吃掉（2026-09-07 当场撞到）。 */
  const H0 = fs.readFileSync(path.join(家, "配送开单台.html"), "utf8");
  该("★★ 客户资料页那个「＋新增品类」也有这一格", /id="na-sku"/.test(H0));
  该("★★ 那一格也真的传给了 addProduct", /sku:\$\("na-sku"\)\.value/.test(H));
  该("加完把这一格也清空（不清＝下一个品会串上一个的码）",
    /"na-price","na-sku"\]/.test(H));
}

if (挂.length) {
  console.log("没过 " + 挂.length + " 项：");
  挂.forEach(t => console.log("  ✗ " + t));
  process.exit(1);
}
console.log("全部通过：" + 过 + " 项");
