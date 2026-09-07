/* 删掉的品，一个字都不许再出现 —— node 测试-删掉的品不许再出现.js

   老板 2026-09-07：「停售的直接删掉。」

   原来那个按钮是【停售】，两个毛病：
     ① 点完东西还挂在列表里，只是灰一下
     ② 停售【根本不影响识别】—— 引擎-匹配.js 建索引时压根不看上下架那一格，
        所以停售的品照样搜得到、照样配得上。等于只换了个颜色。

   现在换成【删除】：从这家客户的清单里去掉，列表不显示、开单也配不到。

   钉五件事：
     ① 删掉的品不进索引（不进 = 搜不到、配不上）
     ② 没删的一个都不许受牵连
     ③ 页面上那个按钮是「删除」，不是「停售」
     ④ 删的是覆盖层：观麦那份原样不动，「全部还原」能找回来
     ⑤ 自己新建的品是真删（从 padd 里去掉），并且删了要留痕 */
const fs = require("fs"), path = require("path");
const 家 = __dirname;
global.window = global.window || {};
require(path.join(家, "数据-价格库.js"));
require(path.join(家, "引擎-解析.js"));   /* 匹配引擎要用它的 norm/bare */
require(path.join(家, "引擎-匹配.js"));
const M = global.window.GM_MATCH;

let 过 = 0, 挂 = [];
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function 该(话, 真) { if (真) 过++; else 挂.push(话); }

/* 拿一小份假数据，别动真库 */
function 造() {
  return {
    custs: [["S001", "甲客户"], ["S002", "乙客户"]],
    prods: ["水豆腐", "白豆干", "老豆腐"],
    items: [
      [0, 0, "水豆腐（5斤）", "板", 6, "5斤/板", "D001", "C001", 1],
      [0, 1, "白豆干", "斤", 7, "1斤/斤", "D002", "C002", 1],
      [0, 2, "老豆腐", "斤", 8, "1斤/斤", "D003", "C003", 0],   /* 观麦那边就下架的 */
      [1, 0, "水豆腐（5斤）", "板", 6.5, "5斤/板", "D004", "C004", 1]
    ]
  };
}

L("═══ ① 删掉的不进索引，没删的一个不少 ═══");
{
  const D = 造();
  const 全 = M.buildIndex(D, {});
  该("★ 没删之前，甲客户 3 项", (全.byCust[0].list || []).length === 3);

  D.items[1]._del = 1;                       /* 把「白豆干」删掉 */
  const 后 = M.buildIndex(D, {});
  该("★ 删完剩 2 项", (后.byCust[0].list || []).length === 2);
  该("★ 删掉的那个搜不到了（叫法索引里没有）", 后.byCust[0].alias["白豆干"] === undefined);
  该("★ 删掉的那个按编码也查不到", 后.byCust[0].sku["D002"] === undefined);
  该("★ 没删的水豆腐还在", 后.byCust[0].sku["D001"] !== undefined);
  该("★ 观麦那边下架的（没删的）照旧留着 —— 下架 ≠ 删掉", 后.byCust[0].sku["D003"] !== undefined);
  该("★ 别家客户一个字没动", (后.byCust[1].list || []).length === 1);
}

L("═══ ② 删掉的记号擦得掉（不然「还原」撤不回来）═══");
{
  const D = 造();
  D.items[1]._del = 1;
  该("删着的时候是 2 项", (M.buildIndex(D, {}).byCust[0].list || []).length === 2);
  D.items[1]._del = 0;
  该("★ 记号一擦就回来了", (M.buildIndex(D, {}).byCust[0].list || []).length === 3);
}

L("═══ ③ 页面：按钮是「删除」，而且真接上了 ═══");
{
  const H = fs.readFileSync(path.join(家, "配送开单台.html"), "utf8");
  该("★ 那一格的按钮写的是「删除」", /data-f="del"[^>]*>删除</.test(H));
  该("⛔ 不许再挂着老的「停售」按钮", !/data-f="on" data-sku/.test(H));
  该("★ 点了真的走删除那条路", /if\(f==="del"\) 删掉这个品\(sku,t\.prod\)/.test(H));
  该("★ 覆盖层里记的是 del", /e\.del=1;/.test(H));
  该("★ 盖覆盖层时把记号盖到 _del 上", /if\(x\.del\) it\._del=1;/.test(H));
  该("★ 每遍先把记号擦干净（不擦＝还原撤不掉）", /it\._del=0;/.test(H));
  该("★ 自己新建的品是真删（从 padd 里去掉）",
    /OV\.padd\[cid\]=\(OV\.padd\[cid\]\|\|\[\]\)\.filter/.test(H));
  该("★ 删了要留痕（谁删的、删了什么）", /logChange\(cid,label,"删除"/.test(H));
}

L("═══ ④ 匹配引擎里只有一处判它（不许抄第二份）═══");
{
  const E = fs.readFileSync(path.join(家, "引擎-匹配.js"), "utf8");
  该("★ 建索引时跳过删掉的", /if\(it\._del\) return;/.test(E));
  该("⛔ 只写了一处", (E.match(/it\._del/g) || []).length === 1);
}

if (挂.length) {
  L("没过 " + 挂.length + " 项：");
  挂.forEach(t => L("  ✗ " + t));
  process.exit(1);
}
L("\n全部通过：" + 过 + " 项");
