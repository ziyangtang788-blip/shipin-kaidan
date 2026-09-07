/* 把整个客户删掉 —— node 测试-删掉整个客户.js

   老板 2026-09-07：「要做一个可以把客户删掉的功能，就是整个客户删掉。」

   ⛔⛔ 这件事只有一种做法是安全的：【在覆盖层记一笔，不许动 DATA.custs】。
     每条价格记的是「这是第几家客户」（items 第 1 个字段是客户序号），
     真从 DATA.custs 里抠掉一家，后面所有序号往前挪一位，
     6000 多条价格瞬间全串到别家去 —— 而且屏幕上一点都看不出来。
     这条是这份测试最要紧的一条。

   钉五件事：
     ① 绝不许从 DATA.custs 里真抠掉
     ② 删了之后：客户列表不显示、开单那个下拉也选不到
     ③ 这家的价、教过的东西都还留着（删的是「露不露面」，不是数据）
     ④ 删错了能恢复
     ⑤ 换台电脑也一致（后端白名单里得有 cgone） */
const fs = require("fs"), path = require("path");
const 家 = __dirname;

let 过 = 0, 挂 = [];
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function 该(话, 真) { if (真) 过++; else 挂.push(话); }

const H = fs.readFileSync(path.join(家, "配送开单台.html"), "utf8");
const 净 = H.replace(/\/\*[\s\S]*?\*\//g, "");

L("═══ ① 绝不许真从 DATA.custs 里抠掉 ═══");
{
  该("★★ 删客户那段里没有 splice / filter 掉 DATA.custs",
    !/DATA\.custs\.splice|DATA\.custs=DATA\.custs\.filter/.test(净));
  该("★ 删 = 在覆盖层记一笔", /OV\.cgone\[cid\]=\{名:名/.test(净));
}

L("═══ ② 删了就哪儿都选不到 ═══");
{
  该("★ 客户卡片列表跳过删掉的", /var 删了=!!\(OV\.cgone\|\|\{\}\)\[c\[0\]\];/.test(净));
  该("★ 开单那个下拉也跳过", /if\(\(OV\.cgone\|\|\{\}\)\[c\[0\]\]\) return;/.test(净));
  该("★ 正开着这家就退回列表", /if\(ST\.ci>=0&&custId\(ST\.ci\)===cid\)\{ ST\.ci=-1;/.test(净));
  该("★ 自己新增的客户删了不许再接回来", /if\(\(OV\.cgone\|\|\{\}\)\[cid\]\) return;/.test(净));
  该("★ 连着从 cadd 里也去掉（不去掉下次开机又回来了）",
    /if\(OV\.cadd&&OV\.cadd\[cid\]\)\{ delete OV\.cadd\[cid\]/.test(净));
}

L("═══ ③ 删的是「露不露面」，数据都留着 ═══");
{
  该("⛔ 没有顺手删这家的价", !/delete OV\.px\[cid\]/.test(净.slice(净.indexOf("function 删掉这个客户"), 净.indexOf("function 恢复这个客户"))));
  该("⛔ 没有顺手删这家教过的对照",
    !/OV\.maps[\s\S]{0,80}delete/.test(净.slice(净.indexOf("function 删掉这个客户"), 净.indexOf("function 恢复这个客户"))));
  该("★ 删之前先问一句（这是删东西，不许一点就没）", /if\(!confirm\("把「"\+名\+"」整个删掉？/.test(净));
  该("★ 删了要留痕", /logChange\(cid,名,"删掉客户"/.test(净));
}

L("═══ ④ 删错了能找回来 ═══");
{
  该("★ 列表上有「删掉的」这个筛选", /id="cl-f3"/.test(H) && /删掉的<\/button>/.test(H));
  该("★ 那个筛选里每张卡片有「恢复」", /data-restore="/.test(净));
  该("★ 恢复这个动作真的接上了", /恢复这个客户\(r\.getAttribute\("data-restore"\)\)/.test(净));
  该("★ 恢复 = 把那一笔删掉", /delete OV\.cgone\[cid\]; ovForget\("cgone",cid\)/.test(净));
  该("★ 恢复完重建索引（不重建，这家的货配不上）",
    /恢复客户[\s\S]{0,200}applyCust\(\); applyAdd\(\); applyPX\(\); buildIndex\(\)/.test(净));
}

L("═══ ⑤ 换台电脑也一致 ═══");
{
  const S = fs.readFileSync(path.join(家, "后端-server.js"), "utf8");
  该("★★ 后端白名单里有 cgone（漏了：这台删了，那台还看得见）", /cgone: \{\}/.test(S));
  该("★★ 后端合并时带着它", /cgone: Object\.assign\(\{\}, base\.cgone, incoming\.cgone \|\| \{\}\)/.test(S));
  该("★ 页面收服务器传回来的删除名单", /Object\.keys\(d\.cgone\|\|\{\}\)/.test(净));
  该("★ 覆盖层里有 cgone 这一格", /cgone:\{\}/.test(净));
}

L("═══ ⑥ 页面两段 script 语法要干净 ═══");
{
  /* ⚠ 9/7 一天之内三次栽在「字符串里夹了真换行」上（提醒/confirm 那几句），
     每次都是加载页面才报错。这儿顺手把语法过一遍，早一步抓住。 */
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m, 坏 = 0, n = 0;
  while ((m = re.exec(H)) !== null) { n++; try { new Function(m[1]); } catch (e) { 坏++; } }
  该("★★ " + n + " 段 script 都能编译过", 坏 === 0);
}

if (挂.length) {
  L("没过 " + 挂.length + " 项：");
  挂.forEach(t => L("  ✗ " + t));
  process.exit(1);
}
L("\n全部通过：" + 过 + " 项");
