/* 老式 .xls 读得对不对 —— node 测试-读老xls.js

   老板 2026-08-18 撞到：微信发来的「豆腐(1).xls」拖进去一点反应都没有。
   查了半天不是拖拽、不是 readOnly、不是缓存 —— 是 引擎-读文件.js 只会解 zip
   （.xlsx/.docx 本质是 zip），老 .xls 是 OLE2 复合文档 + BIFF 记录，
   原来一句 throw 打发掉：「用 Excel 另存成 .xlsx」。客户不会为他另存。

   这里考三样：
     ① 自造一个 BIFF8 文件（不依赖任何外部文件，永远跑得了）——
        共享字符串、被 CONTINUE 切断的字符串、LABELSST、NUMBER、RK、MULRK 全钉住
     ② 顶着 .xls 名字的 HTML 表格（进销存导出的「Excel」多半是这种）要认得出
     ③ 按【文件头】认，不认后缀 —— 后缀天天骗人

   ⚠ 一个数都不许读错。这个引擎读出来的数直接就是单子上的数量和金额。 */
global.window = {};
require("./引擎-读文件.js");
const F = window.GM_FILE;

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) pass++;
  else { fail++; L("  ✗ " + name + "\n      应该 " + b + "\n      实际 " + a); }
}

/* ══════════ 自造一个 BIFF8 的 .xls ══════════
   手搓 OLE2 外壳 + BIFF 记录。这样测试不靠任何真实单据文件，
   谁在哪台机器上都跑得了，也不会把客户的单子塞进代码库。 */
function 造xls(格子们, 字符串们, 切断SST) {
  /* ---- BIFF 记录 ---- */
  const bufs = [];
  const rec = (t, body) => {
    const h = Buffer.alloc(4); h.writeUInt16LE(t, 0); h.writeUInt16LE(body.length, 2);
    bufs.push(h, body);
  };
  const bof = () => { const b = Buffer.alloc(16); b.writeUInt16LE(0x0600, 0); b.writeUInt16LE(5, 2); return b; };
  rec(0x0809, bof());                                   // 全局 BOF

  /* SST：每条 = 字数(2) + 标志(1) + 字（这里一律用 16 位，中文必须） */
  const one = s => {
    const b = Buffer.alloc(3 + s.length * 2);
    b.writeUInt16LE(s.length, 0); b[2] = 0x01;
    for (let i = 0; i < s.length; i++) b.writeUInt16LE(s.charCodeAt(i), 3 + i * 2);
    return b;
  };
  const head = Buffer.alloc(8);
  head.writeUInt32LE(字符串们.length, 0); head.writeUInt32LE(字符串们.length, 4);
  const 全 = Buffer.concat([head].concat(字符串们.map(one)));
  if (!切断SST) rec(0x00FC, 全);
  else {
    /* 故意从一个字符串【中间】切开，逼出 CONTINUE 那条路 ——
       续块开头会重来一个标志字节，不认这一条就整表串位。 */
    const cut = 切断SST;
    rec(0x00FC, 全.subarray(0, cut));
    const 尾 = 全.subarray(cut);
    rec(0x003C, Buffer.concat([Buffer.from([0x01]), 尾]));   // 续块：标志字节 + 剩下的字
  }
  rec(0x0809, bof());                                   // 这张表的 BOF
  格子们.forEach(g => {
    const [r, c, kind, v] = g;
    if (kind === "s") { const b = Buffer.alloc(10); b.writeUInt16LE(r, 0); b.writeUInt16LE(c, 2); b.writeUInt32LE(v, 6); rec(0x00FD, b); }
    if (kind === "n") { const b = Buffer.alloc(14); b.writeUInt16LE(r, 0); b.writeUInt16LE(c, 2); b.writeDoubleLE(v, 6); rec(0x0203, b); }
    if (kind === "rk") { const b = Buffer.alloc(10); b.writeUInt16LE(r, 0); b.writeUInt16LE(c, 2); b.writeInt32LE(v, 6); rec(0x027E, b); }
    if (kind === "mulrk") {                              // v = [rk, rk, …]
      const b = Buffer.alloc(4 + v.length * 6 + 2);
      b.writeUInt16LE(r, 0); b.writeUInt16LE(c, 2);
      v.forEach((x, i) => b.writeInt32LE(x, 4 + i * 6 + 2));
      b.writeUInt16LE(c + v.length - 1, 4 + v.length * 6);
      rec(0x00BD, b);
    }
  });
  rec(0x000A, Buffer.alloc(0));                         // 表 EOF
  rec(0x000A, Buffer.alloc(0));                         // 全局 EOF
  let wbData = Buffer.concat(bufs);
  /* 撑到 4K 以上，走正常扇区链（小流要另走一套迷你扇区表，那条另测） */
  if (wbData.length < 5000) wbData = Buffer.concat([wbData, Buffer.alloc(5000 - wbData.length)]);

  /* ---- OLE2 外壳：扇区0=FAT，扇区1=目录，扇区2起=Workbook ---- */
  const SS = 512, nData = Math.ceil(wbData.length / SS);
  const total = 2 + nData;
  const out = Buffer.alloc((1 + total) * SS, 0);
  Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]).copy(out, 0);
  out.writeUInt16LE(9, 30); out.writeUInt16LE(6, 32);
  out.writeUInt32LE(1, 44);                 // FAT 扇区数
  out.writeUInt32LE(1, 48);                 // 目录起始扇区
  out.writeUInt32LE(4096, 56);              // 迷你流门槛
  out.writeUInt32LE(0xFFFFFFFE, 60); out.writeUInt32LE(0, 64);
  out.writeUInt32LE(0xFFFFFFFE, 68); out.writeUInt32LE(0, 72);
  out.writeUInt32LE(0, 76);                 // DIFAT[0] = FAT 在 0 号扇区
  for (let i = 1; i < 109; i++) out.writeUInt32LE(0xFFFFFFFF, 76 + i * 4);
  const FAT = SS;                            // 扇区 0 的数据从文件 512 开始
  for (let i = 0; i < SS / 4; i++) out.writeUInt32LE(0xFFFFFFFF, FAT + i * 4);
  out.writeUInt32LE(0xFFFFFFFD, FAT + 0);    // 0 号是 FAT 自己
  out.writeUInt32LE(0xFFFFFFFE, FAT + 4);    // 1 号是目录，到此为止
  for (let i = 0; i < nData; i++)
    out.writeUInt32LE(i === nData - 1 ? 0xFFFFFFFE : (2 + i + 1), FAT + (2 + i) * 4);
  const DIR = 2 * SS;
  const 目录项 = (i, name, type, start, size) => {
    const o = DIR + i * 128;
    for (let k = 0; k < name.length; k++) out.writeUInt16LE(name.charCodeAt(k), o + k * 2);
    out.writeUInt16LE(name.length * 2 + 2, o + 64);
    out[o + 66] = type;
    out.writeUInt32LE(start, o + 116); out.writeUInt32LE(size, o + 120);
  };
  目录项(0, "Root Entry", 5, 0xFFFFFFFE, 0);
  目录项(1, "Workbook", 2, 2, wbData.length);
  wbData.copy(out, 3 * SS);
  return out;
}

L("═══ 自造的 .xls（不靠任何外部文件）═══");

const 词 = ["号数", "品名", "重量", "单位", "白豆干", "大豆泡", "斤", "板", "老字号自选餐"];
const 格 = [
  [0, 0, "s", 0], [0, 1, "s", 1], [0, 2, "s", 2], [0, 3, "s", 3],
  [1, 0, "s", 8], [1, 1, "s", 4], [1, 2, "n", 18], [1, 3, "s", 6],
  [2, 1, "s", 5], [2, 2, "rk", (3 << 2) | 0x02], [2, 3, "s", 6],
  [3, 1, "s", 5], [3, 2, "mulrk", [(1050 << 2) | 0x03, (8 << 2) | 0x02]],
];
(function () {
  const g = F.读老excel(造xls(格, 词));
  ok("读出 1 张表", g.length, 1);
  const rows = g[0].rows;
  ok("表头那一行", rows[0], ["号数", "品名", "重量", "单位"]);
  ok("中文字符串 + 整数", rows[1], ["老字号自选餐", "白豆干", 18, "斤"]);
  ok("RK 整数（3）", rows[2][2], 3);
  ok("MULRK：带小数的 10.50 和整数 8", [rows[3][2], rows[3][3]], [10.5, 8]);
})();

/* 共享字符串被 CONTINUE 从中间切断 —— 最容易整表串位的地方。
   切点算给你看：头 8 字节 + 四个 7 字节的两字词 = 36，
   再 +3（字数2 + 标志1）= 39 是「白豆干」头一个字的起点，+2 = 41。
   ⚠ 必须切在【整个字】的边界上 —— 真实 Excel 也只在这儿切，
     切在半个字中间造出来的是废文件，考的就不是这个引擎了。 */
(function () {
  const g = F.读老excel(造xls(格, 词, 41));
  ok("字符串被切断也读得对（表头）", g[0].rows[0], ["号数", "品名", "重量", "单位"]);
  ok("字符串被切断也读得对（数据）", g[0].rows[1], ["老字号自选餐", "白豆干", 18, "斤"]);
})();

L("");
L("═══ 按文件头认，不认后缀 ═══");
ok("OLE2 认得出", F.认文件头(造xls(格, 词)), "ole2");
ok("zip（xlsx）认得出", F.认文件头(new Uint8Array([0x50, 0x4B, 3, 4])), "zip");
ok("带 BOM 的 HTML 认得出",
  F.认文件头(new Uint8Array([0xEF, 0xBB, 0xBF, 0x3C, 0x68])), "html");
ok("前面有空白的 HTML 也认得出",
  F.认文件头(new Uint8Array([0x0D, 0x0A, 0x20, 0x3C, 0x74])), "html");
ok("认不出的就说认不出", F.认文件头(new Uint8Array([1, 2, 3, 4])), "");

L("");
L("═══ 顶着 .xls 名字的 HTML 表格 ═══");
(function () {
  const h = '<html><body><table>' +
    '<tr><td>品名</td><td>数量</td><td>单位</td></tr>' +
    '<tr><td>白豆干</td><td>18</td><td>斤</td></tr>' +
    '<tr><td colspan="2">合&nbsp;计</td><td>18</td></tr>' +
    '</table></body></html>';
  const g = F.读HTML表(h);
  ok("认出 1 张表", g.length, 1);
  ok("表头", g[0].rows[0], ["品名", "数量", "单位"]);
  ok("数据行", g[0].rows[1], ["白豆干", "18", "斤"]);
  ok("合并格后面补空，列不许左移", g[0].rows[2], ["合 计", "", "18"]);
  ok("太短的不当表", F.读HTML表("<table><tr><td>只有一行</td></tr></table>").length, 0);
})();

L("");
L(fail ? ("有 " + fail + " 项没过（通过 " + pass + " 项）") : ("全部通过：" + pass + " 项"));
process.exit(fail ? 1 : 0);
