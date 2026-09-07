/* 观麦商品ID 在客户页就地改 —— node 测试-观麦码就地改.js

   老板 2026-09-07：「有一些导入不到观麦，我现在在这里修改不了，
     要在这里可以修改，我把观麦商品编码直接在这里修改就可以了，单个修改。」

   导观麦「商品ID」那一列填的就是这个码（导出-观麦.js 取的是第 7 个字段）。
   码不对，观麦报「商品不存在」，整单进不去。

   这件事有两个坑，钉的就是这两个：
     ① 这个码同时是【改价账本的键】—— 改了码不能把之前改过的价弄丢
        所以账本一律按【原始码】记，页面上所有按钮传的也是原始码。
     ② 这个码还是【学过的对照的落点】—— OV.maps 存的是「这个词 → 这个码」
        改了码不搬对照，这家教过的词就全指向一个不存在的码，等于白教。 */
const fs = require("fs"), path = require("path");
const 家 = __dirname;
global.window = global.window || {};
require(path.join(家, "数据-价格库.js"));
require(path.join(家, "引擎-解析.js"));
require(path.join(家, "引擎-匹配.js"));
require(path.join(家, "数据-商户名.js"));
require(path.join(家, "导出-观麦.js"));
const M = global.window.GM_MATCH, E = global.window.GM_EXPORT;

let 过 = 0, 挂 = [];
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function 该(话, 真) { if (真) 过++; else 挂.push(话); }

L("═══ ① 改完码，索引和导出都得认新码 ═══");
{
  const D = {
    custs: [["S001", "甲客户"]],
    prods: ["水豆腐"],
    items: [[0, 0, "水豆腐（5斤）", "板", 6, "5斤/板", "D001", "C001", 1]]
  };
  该("★ 改之前按老码查得到", M.buildIndex(D, {}).byCust[0].sku["D001"] !== undefined);
  D.items[0][6] = "D999999";                 /* 人把码改了（页面里是 applyPX 盖上去的） */
  const 后 = M.buildIndex(D, {});
  该("★ 改完按新码查得到", 后.byCust[0].sku["D999999"] !== undefined);
  该("★ 老码查不到了（不然导出会拿错码）", 后.byCust[0].sku["D001"] === undefined);
}

L("═══ ② 导观麦：填的就是这个码，自己编的假码一律留空 ═══");
{
  const 表 = E.建表({
    抬头: { 客户: "甲客户", 客户号: "S001" },
    lines: [{ ok: true, sku: "D999999", name: "水豆腐", ours: "水豆腐", qty: 2, unit: "板", price: 6, code: "K1", note: "" }]
  });
  const s = JSON.stringify(表);
  该("★ 改过的码真的进了导出表", s.indexOf("D999999") >= 0);
  const 假 = E.建表({
    抬头: { 客户: "甲客户", 客户号: "S001" },
    lines: [{ ok: true, sku: "XS001-1757000000000-123", name: "水豆腐", ours: "水豆腐", qty: 2, unit: "板", price: 6, code: "K1", note: "" }]
  });
  该("★ 自己编的假码不许填进去", JSON.stringify(假).indexOf("XS001-") < 0);
}

L("═══ ③ 页面：那一格在、接上了、两个坑都填了 ═══");
{
  const H = fs.readFileSync(path.join(家, "配送开单台.html"), "utf8");
  const 净 = H.replace(/\/\*[\s\S]*?\*\//g, "");
  该("★ 表头有「观麦商品ID」这一列", /<th[^>]*>观麦商品ID<\/th>/.test(H));
  该("★ 每一行有那一格输入框", /data-f="code" data-sku=/.test(H));
  该("★ 改了会走 改观麦码()", /if\(f==="code"\)\{ 改观麦码\(sku,el\.value,t\.prod\); return; \}/.test(净));

  /* 坑一：账本按原始码记 */
  /* ⚠ 快照后面还会接着长（9/7 又加了单位、销售规格），所以不对整句写死 */
  该("★ 原始码存进了快照 _o[3]", /it\._o=\[it\[2\],it\[4\],it\[8\],it\[6\]/.test(净));
  该("★ 单位、销售规格的原样也存了（不存就还原不回去）",
    /it\._o=\[it\[2\],it\[4\],it\[8\],it\[6\],it\[3\],it\[5\]\]/.test(净));
  该("★ 单位、销售规格也能就地改", /data-f="unit" data-sku=/.test(净) && /data-f="spec" data-sku=/.test(净));
  该("★ 单位不许改成空（空了就不知道按什么秤算钱）", /单位不能空/.test(H));
  该("★ 盖覆盖层时先把码还原（不还原「改回去」撤不掉）", /if\(it\._o\.length>3\) it\[6\]=it\._o\[3\];/.test(净));
  该("★ 覆盖层里记的是 码", /if\(x\.码\) it\[6\]=x\.码;/.test(净));
  该("★ 找行时新码老码都认", /it\[6\]===sku\|\|\(it\._o&&it\._o\[3\]===sku\)/.test(净));
  该("★ 页面按钮传的是原始码", /var 键=esc\(t\.原码\|\|t\.sku\);/.test(净));
  {
    /* ⚠ 只看【客户资料页那张表】那一段 —— 别处（下拉候选那种）拿 t.sku 当键是对的，
       那儿是当场认货用的，跟改价账本没关系。 */
    const i = 净.indexOf("function renderCustDetail");
    const j = 净.indexOf("function renderCustLog", i);
    const 段 = i >= 0 ? 净.slice(i, j < 0 ? i + 4000 : j) : "";
    该("⛔ 这张表里不许再拿 t.sku 当键（拿了改完码就找不着账）",
      段.length > 0 && !/data-sku="'\+esc\(t\.sku\)\+'"/.test(段));
  }

  /* 坑二：学过的对照要跟着搬 */
  该("★ 改码时把学过的对照一起搬过去", /OV\.maps\[k\]=新码\|\|origOf\(idx\)\.code/.test(净));
  该("★ 搬了要留痕", /"学过的对照跟着搬"/.test(净));

  /* 别的 */
  该("★ 填的码不像观麦码就不收（免得拿假码去撞）",
    /\^\[A-Z\]\{1,2\}\[0-9\]\{5,12\}\$/.test(净));
  该("★ 自己编的假码在表上标出来（让人知道该补）", /var 假码=\/\^X\/\.test/.test(净));
}

if (挂.length) {
  L("没过 " + 挂.length + " 项：");
  挂.forEach(t => L("  ✗ " + t));
  process.exit(1);
}
L("\n全部通过：" + 过 + " 项");
