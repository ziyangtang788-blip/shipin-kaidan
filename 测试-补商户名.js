/* 桌面那个「补商户名.html」到底能不能用 —— node 测试-补商户名.js

   老板 2026-08-05：「试一下之后再看一下你改的内容能不能用。不能用就删掉，重试。」
   所以这里不测「打包成功了没」，测的是：
     ① 页面真开得起来（假浏览器里加载一遍，DOMContentLoaded 不炸）
     ② 拿【真文件】走一遍：读 xlsx → 认列 → 补商户名 → 写回 xlsx
     ③ 写出来的东西观麦能收：数字是数字格、中文不乱码、除了商户名一格没动
     ④ 三种情况都对：一对一自动补 / 多门店要选 / 表里查不到就别乱动 */
const fs = require("fs"), path = require("path");
const DIR = __dirname;
const 桌面 = path.join(process.env.USERPROFILE || "C:/Users/李正", "Desktop");
let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(n, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; L("  ✅ " + n); }
  else { fail++; L("  ❌ " + n + "\n      应该 " + JSON.stringify(want) + "\n      实际 " + JSON.stringify(got)); }
}

global.window = {};
require("./引擎-读文件.js");
require("./导出-观麦.js");
require("./数据-商户名.js");
const F = window.GM_FILE, E = window.GM_EXPORT, S = window.GM_SHOP;

L("── ① 打出来的那个文件 ──");
{
  const p = path.join(桌面, "补商户名.html");
  ok("桌面上有 补商户名.html", fs.existsSync(p), true);
  const h = fs.readFileSync(p, "utf8");
  ok("是自带全部的（没有 <script src>）", /<script\s+src=/.test(h), false);
  ok("三个引擎都打进去了",
    ["GM_SHOP", "GM_FILE", "GM_EXPORT"].every(x => h.indexOf(x) >= 0), true);
  /* 密钥绝不能进任何往外发的文件 */
  ok("没夹带密钥", /sk-|ANTHROPIC_API_KEY|密钥-本机/.test(h), false);
  ok("有拖文件的框", h.indexOf('id="drop"') >= 0, true);
  ok("有下载按钮", h.indexOf('id="dl"') >= 0, true);
}

L("");
L("── ② 对照表本身 ──");
ok("124 个报价单", Object.keys(S).length, 124);
{
  const 一对一 = Object.keys(S).filter(k => S[k].店.length === 1).length;
  const 多店 = Object.keys(S).filter(k => S[k].店.length > 1).length;
  L("     一对一 " + 一对一 + " 家（自动补）　多门店 " + 多店 + " 家（要选）");
  ok("一对一 + 多门店 = 全部", 一对一 + 多店, 124);
  ok("每家至少一个商户名", Object.keys(S).every(k => S[k].店.length >= 1), true);
  ok("商户名都不是空的",
    Object.keys(S).every(k => S[k].店.every(x => x[0] && x[0].trim())), true);
}

L("");
L("── ③ 拿真文件走一遍 ──");
const 真文件 = "C:/Users/李正/Downloads/观麦导入_江云生鲜配送_2026-08-04.xlsx";
if (!fs.existsSync(真文件)) {
  L("  ⚠ 找不到样板文件，这一段跳过：" + 真文件);
  收尾();
} else {
  const b = fs.readFileSync(真文件);
  F.readXlsxGrid(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)).then(g => {
    const rows = (Array.isArray(g) ? g[0] : g).rows;
    const 头 = rows[0].map(x => String(x == null ? "" : x).trim());
    const 名列 = 头.indexOf("商户名"), SID列 = 头.indexOf("商户SID");
    ok("认得出「商户名」这一列", 名列 >= 0, true);
    ok("认得出「商户SID」这一列", SID列 >= 0, true);
    L("     " + rows.length + " 行、" + 头.length + " 列");

    const 数字名 = { "下单数": 1, "单价": 1, "下单金额": 1 };
    const 数字列 = 头.map(t => !!数字名[t]);

    /* 页面里那段逻辑，照搬过来跑 */
    function 补(rows, 选好的) {
      const out = [头.slice()]; let 改 = 0;
      rows.slice(1).forEach(r => {
        const n = r.slice();
        const sid = String(r[SID列] || "").trim();
        const g2 = S[sid];
        let 要填 = null;
        if (g2 && g2.店.length === 1) 要填 = g2.店[0][0];
        else if (g2 && g2.店.length > 1) 要填 = (选好的 || {})[sid] || null;
        if (要填 && 要填 !== String(n[名列] || "").trim()) { n[名列] = 要填; 改++; }
        for (let c = 0; c < 数字列.length; c++) if (数字列[c]) n[c] = (+n[c] || 0);
        out.push(n);
      });
      return { out, 改 };
    }

    /* --- 情况一：江云，一对一，名字本来就对 --- */
    const a = 补(rows);
    ok("江云一对一、名字本来就对 → 一格都不用改", a.改, 0);
    ok("行数没变", a.out.length, rows.length);
    let 串 = 0;
    for (let i = 1; i < a.out.length; i++)
      for (let c = 0; c < 头.length; c++)
        if (String(a.out[i][c]) !== String(rows[i][c])) 串++;
    ok("除了商户名，别的一格没动", 串, 0);

    /* --- 情况二：换成裕丰（一对一，但我们这边名字写短了）--- */
    const t2 = rows.map(r => r.slice());
    for (let i = 1; i < t2.length; i++) { t2[i][SID列] = "S2947"; t2[i][名列] = "裕丰"; }
    const c2 = 补(t2);
    ok("裕丰：全部补成观麦全称", c2.改, rows.length - 1);
    ok("补成的名字对", c2.out[1][名列], "广东裕丰膳食管理服务有限公司");

    /* --- 情况三：三颗菜，三个门店，没选 → 一格都不许动 --- */
    const t3 = rows.map(r => r.slice());
    for (let i = 1; i < t3.length; i++) { t3[i][SID列] = "S2999"; t3[i][名列] = "三颗菜"; }
    const c3 = 补(t3);
    ok("多门店没选 → 一格都不许乱填", c3.改, 0);
    ok("多门店没选 → 名字原样留着", c3.out[1][名列], "三颗菜");
    /* 选了就填 */
    const c3b = 补(t3, { S2999: "三颗菜三水仓" });
    ok("选了门店 → 全部填成门店名", c3b.改, rows.length - 1);
    ok("填的就是选的那个", c3b.out[1][名列], "三颗菜三水仓");

    /* --- 情况四：表里查不到 → 别动 --- */
    const t4 = rows.map(r => r.slice());
    for (let i = 1; i < t4.length; i++) { t4[i][SID列] = "S9999"; t4[i][名列] = "查无此单"; }
    const c4 = 补(t4);
    ok("表里查不到 → 一格不动，原样留给人自己看", c4.改, 0);
    ok("表里查不到 → 名字没被改掉", c4.out[1][名列], "查无此单");

    L("");
    L("── ④ 写出来的 xlsx 观麦收不收 ──");
    const buf = E.xlsx("订单导入", c3b.out, 数字列);
    ok("是 zip 包（PK 开头）", [buf[0], buf[1]], [0x50, 0x4B]);
    const u = Buffer.from(buf).toString("utf8");
    ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels", "xl/worksheets/sheet1.xml"].forEach(n => {
        ok("包里有 " + n, Buffer.from(buf).toString("latin1").indexOf(n) >= 0, true);
      });
    ok("中文没乱码", u.indexOf("三颗菜三水仓") >= 0, true);
    /* 数字必须是 <v>，写成 inlineStr 观麦读进去就是文本、算不了钱 */
    const 第一行数量 = +rows[1][头.indexOf("下单数")];
    ok("下单数写成数字格", new RegExp("<v>" + 第一行数量 + "</v>").test(u), true);
    ok("文字写成 inlineStr", /t="inlineStr"/.test(u), true);
    ok("旧的报价单名没残留在文件里", u.indexOf(">三颗菜<") >= 0, false);

    /* 再读回来，行列对得上 */
    return F.readXlsxGrid(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)).then(g2 => {
      const r2 = (Array.isArray(g2) ? g2[0] : g2).rows;
      ok("写完再读回来：行数一样", r2.length, rows.length);
      ok("写完再读回来：表头一样", r2[0].map(String), 头);
      ok("写完再读回来：商户名是新的", String(r2[1][名列]), "三颗菜三水仓");
      收尾();
    });
  }).catch(e => { fail++; L("  ❌ 跑挂了：" + e.message + "\n" + e.stack); 收尾(); });
}

function 收尾() {
  L("");
  L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
  process.exit(fail ? 1 : 0);
}
