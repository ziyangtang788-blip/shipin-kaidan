/* 把「补商户名」打成桌面上一个自带全部东西的 html —— node 工具-补商户名.打包.js

   为什么打包成一个文件：老板要的是桌面上双击就开、不联网也能用的东西。
   拆成好几个文件他还得整个文件夹一起搬，一搬就少一个。

   打完自己验一遍：文件在不在、有没有把不该带的带进去、几个关键函数在不在。 */
const fs = require("fs"), path = require("path");
const 家 = __dirname;
const 出 = path.join(process.env.USERPROFILE || "C:/Users/李正", "Desktop", "补商户名.html");

const 读 = f => fs.readFileSync(path.join(家, f), "utf8");

const 样式 = `
:root{--bg:#14110d;--card:#1e1a14;--line:#3a3125;--txt:#f0e6d6;--dim:#9a8f7d;
      --am:#e8a33d;--ok:#6fbf73;--bad:#e05b4a;--warn:#e8a33d}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--txt);
     font:15px/1.6 "Microsoft YaHei",system-ui,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:28px 20px 60px}
h1{font-size:24px;margin:0 0 4px}
.ver{font-size:12px;color:var(--dim);font-weight:400}
.lead{margin:0 0 22px;color:var(--txt)}
.muted{color:var(--dim)}
b.ok{color:var(--ok)} .bad{color:var(--bad)}
.drop{border:2px dashed var(--line);border-radius:12px;padding:52px 20px;text-align:center;
      background:var(--card);transition:.15s}
.drop.on{border-color:var(--am);background:#2a2318}
.drop .big{font-size:19px;margin-bottom:10px}
.btn{background:var(--am);color:#1a1409;border:0;border-radius:7px;padding:9px 16px;
     font:600 14px "Microsoft YaHei",sans-serif;cursor:pointer}
.btn:disabled{background:#4a4136;color:#877d6d;cursor:not-allowed}
.btn.ghost{background:transparent;color:var(--am);border:1px solid var(--line)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;
      padding:16px;margin-bottom:14px}
.stats{display:flex;gap:26px;flex-wrap:wrap}
.st .v{font-size:27px;font-weight:700;line-height:1.1}
.st .k{font-size:12px;color:var(--dim)}
.st.good .v{color:var(--ok)} .st.warn .v{color:var(--warn)} .st.bad .v{color:var(--bad)}
.fn{margin-top:10px;font-size:12px;color:var(--dim)}
.grid{width:100%;border-collapse:collapse;font-size:14px}
.grid th{text-align:left;font-weight:600;color:var(--dim);font-size:12px;
         border-bottom:1px solid var(--line);padding:6px 8px}
.grid td{padding:8px;border-bottom:1px solid #2a241b;vertical-align:middle}
.grid tr:last-child td{border-bottom:0}
.mono{font-family:Consolas,monospace;color:var(--dim)}
.arrow{color:var(--dim);text-align:center;width:26px}
.num{text-align:right;color:var(--dim)}
select.pick{background:#241e16;color:var(--txt);border:1px solid var(--line);
            border-radius:6px;padding:6px 8px;font:14px "Microsoft YaHei",sans-serif;max-width:340px}
select.pick.need{border-color:var(--warn)}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.note{margin-top:26px;background:var(--card);border:1px solid var(--line);
      border-radius:10px;padding:12px 16px}
.note summary{cursor:pointer;color:var(--am)}
.mini{border-collapse:collapse;font-size:14px;margin:8px 0}
.mini th,.mini td{border:1px solid var(--line);padding:5px 12px;text-align:left}
.mini th{color:var(--dim);font-size:12px}
`;

const 带上 = ["数据-商户名.js", "引擎-读文件.js", "导出-观麦.js", "工具-补商户名.app.js"];

/* ── 打之前先挡一道：不该带的东西一个都不许进去 ── */
const 禁 = ["密钥-本机.js", "sk-", "ANTHROPIC_API_KEY", "Bearer "];
const 料 = 带上.map(f => {
  const s = 读(f);
  const 踩 = 禁.filter(x => s.indexOf(x) >= 0);
  if (踩.length) { console.error("❌ " + f + " 里有不能外带的东西：" + 踩.join("、")); process.exit(1); }
  return "/* ═══ " + f + " ═══ */\n" + s;
}).join("\n");

const html =
  '<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
  "<title>补商户名 —— 导观麦之前过一道</title>\n<style>" + 样式 + "</style>\n</head>\n<body>\n" +
  读("工具-补商户名.body.html") +
  "\n<script>\nvar window=window||{};\n" + 料 + "\n<\/script>\n</body>\n</html>\n";

fs.writeFileSync(出, html, "utf8");

/* ── 打完自己验一遍 ── */
const 得有 = ["GM_SHOP", "GM_FILE", "GM_EXPORT", "readXlsxGrid", 'id="drop"', "补好商户名"];
const 缺 = 得有.filter(x => html.indexOf(x) < 0);
if (缺.length) { console.error("❌ 打出来的文件里缺：" + 缺.join("、")); process.exit(1); }
if (/<script\s+src=/.test(html)) { console.error("❌ 还引着外部文件，不是自带全部的"); process.exit(1); }

console.log("✅ " + 出);
console.log("   " + Math.round(html.length / 1024) + " KB，自带全部，双击就开，不用联网");
