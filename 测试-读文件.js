/* Excel / Word 读得对不对 —— node 测试-读文件.js

   老板 8/2：「可不可以直接把 PDF 或者 word 文档或者 excel 表格拖进去」

   Excel 故意在浏览器里自己解，不丢给模型看图：
   表格截图会糊、合并单元格会错行，而数量看错一位就是钱的事。
   直接读单元格拿到的是原始值，2.5 不会变成 25。

   这里用真文件考：桌面上那张「问工厂-待确认清单.xlsx」是我自己生成的，
   内容已知，能逐项核对。 */
const fs = require("fs"), path = require("path"), os = require("os");
const zlib = require("zlib");
global.window = {};
require("./引擎-读文件.js");
const F = window.GM_FILE;

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, cond, extra) {
  if (cond) pass++;
  else { fail++; L("  ✗ " + name + (extra ? ("\n      " + extra) : "")); }
}
const ab = buf => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

/* ---- 自己造一个 xlsx 来考，不依赖桌面上有什么文件 ---- */
function crc32(buf) {
  let c, t = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ t[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}
function zip(files) {
  const locals = [], central = []; let off = 0;
  files.forEach(f => {
    const name = Buffer.from(f.name, "utf8"), raw = Buffer.from(f.data, "utf8");
    const comp = zlib.deflateRawSync(raw), use = comp.length < raw.length ? comp : raw;
    const method = use === comp ? 8 : 0, crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(use.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, use);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(use.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += 30 + name.length + use.length;
  });
  const cd = Buffer.concat(central), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([Buffer.concat(locals), cd, eocd]);
}

/* 一张像真下单表的小表：带中文、小数、空格子、共享字符串 */
const 共享 = ["商品", "数量", "单位", "备注", "嫩豆腐", "斤", "4块", "靓胶板豆腐7斤", "板", "千张"];
const S = i => '<c r="' + i + '" t="s"><v>' + i.v + "</v></c>";
const xlsx = zip([
  { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
  {
    name: "xl/sharedStrings.xml",
    data: '<?xml version="1.0"?><sst>' + 共享.map(s => "<si><t>" + s + "</t></si>").join("") + "</sst>"
  },
  {
    name: "xl/worksheets/sheet1.xml",
    data: '<?xml version="1.0"?><worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>' +
      /* 数量 0、真数量写在备注 —— 江云那种表 */
      '<row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>0</v></c><c r="C2" t="s"><v>5</v></c><c r="D2" t="s"><v>6</v></c></row>' +
      /* 小数不能变整数 */
      '<row r="3"><c r="A3" t="s"><v>7</v></c><c r="B3"><v>8.5</v></c><c r="C3" t="s"><v>8</v></c></row>' +
      /* 中间空一格（格子整个省略），列位不能错 */
      '<row r="4"><c r="A4" t="s"><v>9</v></c><c r="C4" t="s"><v>5</v></c><c r="D4"><v>2.5</v></c></row>' +
      /* ★★ Excel 真正写出来的空格子是【自闭合带样式】的：<c r="B5" s="3"/>
         上面那种「整个省略」是手写 XML 才有的形状，真表里几乎见不到 ——
         所以原来那条测试一直绿着，却抓不到真实的错。
         2026-08-04 好好多 8.5 那张真单就栽在这儿：
           <c r="B4" s="3"/><c r="C4" s="3"/><c r="D4" s="3"><v>1</v></c>
         正则第一个分支把自闭合也吞了，body 一路找到后面格子的 </c>，
         把 D 列的 1 捞进了 B 列 —— 桂华店「炸豆卜1」读成「饺子皮1」，
         整张表串位，金额没问题、商品全错，单子打出来看不出来。 */
      '<row r="5"><c r="A5" s="3" t="s"><v>9</v></c><c r="B5" s="3"/><c r="C5" s="3"/>' +
      '<c r="D5" s="3"><v>7</v></c></row>' +
      "</sheetData></worksheet>"
  }
]);

(async () => {
  L("── Excel ──");
  let t = "";
  try { t = await F.readXlsx(ab(xlsx)); }
  catch (e) { fail++; L("  ✗ 解 xlsx 直接抛错：" + e.message); }
  const all = t.split("\n");
  /* 每张工作表前面标一行「### 第 N 张工作表」——
     2026-08-03「4号豆制品.xlsx」踩到：一个工作簿里 6 张表，两张透视表 + 一张 540 行明细，
     装的是【同一张单】。不分表就成了同一张单读三遍，数量直接三倍。 */
  ok("每张工作表前面有标号", all[0] === "### 第 1 张工作表", JSON.stringify(all[0]));
  const rows = all.filter(s => !/^### /.test(s));
  ok("行数对（5 行，空行不算）", rows.length === 5, "实得 " + rows.length + " 行：" + JSON.stringify(rows));
  ok("表头读出来了", rows[0] === "商品\t数量\t单位\t备注", JSON.stringify(rows[0]));
  ok("数量 0 和备注「4块」都在", rows[1] === "嫩豆腐\t0\t斤\t4块", JSON.stringify(rows[1]));
  ok("小数 8.5 没被读成 85 或 8", rows[2] === "靓胶板豆腐7斤\t8.5\t板", JSON.stringify(rows[2]));
  ok("中间空格子不串列（B 空着，C 还是单位）",
    rows[3] === "千张\t\t斤\t2.5", JSON.stringify(rows[3]));
  /* ★★ 最要紧的一条：Excel 真正写出来的空格子是 <c r="B5" s="3"/> 这种自闭合的。
     修之前 D 列那个 7 会被吸到 B 列去 —— 数量落到别的商品头上，
     金额没问题、商品全错，单子打出来看不出来。好好多 8.5 那张真单就是这么串的。 */
  ok("★★ 自闭合空格子不许把后面的数吸过来（真表就是这种）",
    rows[4] === "千张\t\t\t7", JSON.stringify(rows[4]) + "　—— 应该是 千张<空><空>7");

  L("");
  L("── Excel 解出来的文字，解析引擎接得住 ──");
  global.window.GM_PARSE || require("./引擎-解析.js");
  const P = window.GM_PARSE;
  const ls = P.parseOrder(rows.join("\n"));
  const 嫩 = ls.filter(x => x.text.indexOf("嫩豆腐") >= 0)[0];
  ok("嫩豆腐那行数量从备注捞回 4", 嫩 && 嫩.qty === 4, 嫩 ? ("qty=" + 嫩.qty) : "没解析出来");
  const 胶 = ls.filter(x => x.text.indexOf("靓胶板") >= 0)[0];
  ok("靓胶板 8.5 板没丢", 胶 && 胶.qty === 8.5, 胶 ? ("qty=" + 胶.qty) : "没解析出来");

  L("");
  L("── Word ──");
  const docx = zip([
    { name: "[Content_Types].xml", data: '<?xml version="1.0"?><Types/>' },
    {
      name: "word/document.xml",
      data: '<?xml version="1.0"?><w:document><w:body>' +
        "<w:p><w:r><w:t>顺德大良店</w:t></w:r></w:p>" +
        "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>千张</w:t></w:r></w:p></w:tc>" +
        "<w:tc><w:p><w:r><w:t>5斤</w:t></w:r></w:p></w:tc></w:tr>" +
        "<w:tr><w:tc><w:p><w:r><w:t>猪红</w:t></w:r></w:p></w:tc>" +
        "<w:tc><w:p><w:r><w:t>13斤</w:t></w:r></w:p></w:tc></w:tr></w:tbl>" +
        "</w:body></w:document>"
    }
  ]);
  let w = "";
  try { w = await F.readDocx(ab(docx)); }
  catch (e) { fail++; L("  ✗ 解 docx 直接抛错：" + e.message); }
  const wl = w.split("\n");
  ok("段落和表格都读出来了", wl.length === 3, JSON.stringify(wl));
  ok("表格一行一条、单元格之间是 Tab",
    wl[1] === "千张\t5斤" && wl[2] === "猪红\t13斤", JSON.stringify(wl));

  L("");
  L("── 认文件类型 ──");
  const f = (n, t) => ({ name: n, type: t || "" });
  ok("xlsx", F.类型(f("下单表.xlsx")) === "excel");
  ok("docx", F.类型(f("下单表.docx")) === "word");
  ok("pdf", F.类型(f("单.pdf")) === "pdf");
  ok("csv", F.类型(f("单.csv")) === "文本");
  ok("图片", F.类型(f("a.png", "image/png")) === "图片");
  ok("老式 .xls 认出来（好给人提示另存）", F.类型(f("旧.xls")) === "老excel");
  ok("不认识的返回空", F.类型(f("单.zip")) === "");

  L("");
  L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
  process.exit(fail ? 1 : 0);
})();
