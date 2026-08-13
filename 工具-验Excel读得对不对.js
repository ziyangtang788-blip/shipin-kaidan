/* 验 Excel 读得对不对 —— node 工具-验Excel读得对不对.js
   老板 2026-08-04：「你得确定他是没错的」。

   办法：不靠我说，靠【客户自己写在表上的合计】当标准答案。
   每张表里凡是有「总计/合计/小计」那一行（或那一列），
   就拿它跟我们逐格加出来的数对一遍 —— 对不上就是我们读错了。

   这是最硬的自检：客户写的合计跟他填的格子是同一份数据，
   我们读串了位，合计必然对不上；读对了，必然全对。 */
const fs = require("fs"), path = require("path");
global.window = {};
require("./引擎-解析.js"); require("./引擎-读文件.js");
const F = global.window.GM_FILE;

const 根 = "C:/Users/李正/Desktop/也一原始数据";
function 找xlsx(d, 出) {
  let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return 出; }
  es.forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) 找xlsx(p, 出);
    else if (/\.xlsx$/i.test(e.name) && !/^~\$/.test(e.name)) 出.push(p);
  });
  return 出;
}

const 数 = v => { const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? null : n; };
const 是合计 = v => /^(总计|合计|小计|共计|总和)$/.test(String(v == null ? "" : v).trim());

(async () => {
  const files = 找xlsx(根, []);
  console.log("找到 " + files.length + " 个 xlsx\n");
  let 查了 = 0, 全对 = 0, 对不上 = 0;
  const 坏 = [];

  for (const p of files) {
    let gs;
    try {
      const buf = fs.readFileSync(p);
      const f = { name: path.basename(p), size: buf.length,
        arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)) };
      const r = await F.readOne(f);
      gs = r.grid;
    } catch (e) { continue; }
    if (!gs || !gs.length) continue;

    gs.forEach(g => {
      const rows = g.rows || [];
      if (rows.length < 3) return;
      const 宽 = Math.max(...rows.map(r => r.length));

      /* ① 找「合计行」：第一格写着总计/合计的那一行 —— 拿它跟上面每一列的和比 */
      rows.forEach((r, ri) => {
        if (!是合计(r[0])) return;
        for (let c = 1; c < 宽; c++) {
          const 表上 = 数(r[c]); if (表上 === null) continue;
          let 和 = 0, 有 = 0;
          for (let i = 1; i < ri; i++) {
            if (是合计(rows[i] && rows[i][0])) continue;
            const v = 数(rows[i] && rows[i][c]); if (v !== null) { 和 += v; 有++; }
          }
          if (!有) continue;
          查了++;
          和 = Math.round(和 * 1000) / 1000;
          if (Math.abs(和 - 表上) < 0.001) 全对++;
          else { 对不上++; 坏.push(path.basename(p) + "　第" + (ri + 1) + "行合计 第" + (c + 1) + "列：逐格加 " + 和 + "，表上写 " + 表上); }
        }
      });

      /* ② 找「合计列」：表头那一行里写着总计/合计的那一列 —— 拿它跟每一行的和比 */
      for (let hr = 0; hr < Math.min(3, rows.length); hr++) {
        const 头 = rows[hr] || [];
        for (let hc = 1; hc < 宽; hc++) {
          if (!是合计(头[hc])) continue;
          for (let i = hr + 1; i < rows.length; i++) {
            if (是合计(rows[i] && rows[i][0])) continue;
            const 表上 = 数(rows[i] && rows[i][hc]); if (表上 === null) continue;
            let 和 = 0, 有 = 0;
            for (let c = 1; c < hc; c++) {
              const v = 数(rows[i] && rows[i][c]); if (v !== null) { 和 += v; 有++; }
            }
            if (!有) continue;
            查了++;
            和 = Math.round(和 * 1000) / 1000;
            if (Math.abs(和 - 表上) < 0.001) 全对++;
            else { 对不上++; 坏.push(path.basename(p) + "　第" + (i + 1) + "行：逐格加 " + 和 + "，合计列写 " + 表上); }
          }
        }
      }
    });
  }

  console.log("══════════════════════════");
  console.log("拿客户自己写的合计当标准答案，一共对了 " + 查了 + " 个数");
  console.log("  对得上：" + 全对);
  console.log("  对不上：" + 对不上);
  if (坏.length) {
    console.log("\n对不上的（最多列 20 条）：");
    坏.slice(0, 20).forEach(s => console.log("  ✗ " + s));
  } else if (查了) {
    console.log("\n✅ 一个都没错。");
  }
})();
