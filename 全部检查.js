/* 上传前跑这一个就够了：node 全部检查.js
   任何一项没过就退出码非 0，不该往线上推。

   验收线（老板原话）：
     「你可以让他去选择，让他去学习，但是不能识别错误。」
   所以下面最后一项「自信地认错 = 0」是硬门槛，其余是防止它悄悄退回去的护栏。 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const STEPS = [
  ["测试-解析引擎.js", "解析：一行字拆成 商品/数量/单位/点位"],
  ["测试-读结构.js", "★ 读结构：AI 填格子表 → 单据行（不让它猜）"],
  ["测试-认表.js", "★ 认表：Excel 只让 AI 认表头，数字本地读（省 99%）"],
  ["试-按内容认单.js", "★ 按内容认单：问「第一样货叫什么」而不是「表头第几行」"],
  ["测试-点位册.js", "★ 点位册：一家一本，名字读飘了自动改回来"],
  ["测试-匹配.js", "匹配：预置对照的目标都真实存在、能命中"],
  ["测试-学习.js", "学习：教一个不会丢另一个（单位分开记）"],
  ["测试-学会没有.js", "学习·端到端：314 条真实下单表词汇，教一遍就得全会"],
  ["测试-忘掉重学.js", "★ 教错了能改回来：忘掉→重教、盖过预置、忘掉不留渣"],
  ["测试-确定就学会.js", "★ 点「确定订单」= 学一遍：下次同样的单一行都不用问"],
  ["测试-学习存服务器.js", "★ 学到的东西存服务器：换台电脑也认得、忘掉的不会被拉回来"],
  ["测试-搜索框.js", "搜索框：打字筛得对、截断有提示、回车选第一条"],
  ["测试-订单记录.js", "订单记录：存得进、编号不撞（原来一天全是 -01）、调得出"],
  ["测试-换算.js", "换算：该折的折对、不该折的不动（折错差十倍）"],
  ["测试-斤转板.js", "★ 按斤下单、按板计价：18斤→3板，凑不整就问人"],
  ["测试-单位不许串.js", "★ 板不许当斤算：页面不许漏参数、学歪了也顶不掉板货"],
  ["测试-按单价定夺.js", "★ 反推：单据自己写了单价就照它挑，只有一条对得上才算"],
  ["测试-读文件.js", "读文件：Excel/Word 自己解，小数不能读错、空格子不能串列"],
  ["体检-解析漏没漏.js", "★ 掉没掉数量：真实写法逐条过，掉一段就是少发货"],
  ["测试-选完客户重读.js", "★ 选完客户补读不懂：教过的规矩真用得上、那几根线没断"],
  ["测试-核过了变绿.js", "★ 核过了就变绿：按过的行不许还红着、还占在最上面"],
  ["测试-页面能跑起来.js", "★ 页面开得开：假浏览器里真加载一遍，开机不报错"],
  ["测试-门店跟客户.js", "★ 门店跟着客户走：上一单的店不许串到下一家头上（8/9 事故）"],
  ["体检-对照覆盖.js", "覆盖：轩宝整张单逐词核对"],
  ["体检-斤还是板.js", "★ 按斤价还是折成板：拿观麦 9758 行真单核"],
  ["体检-学过的还对吗.js", "学过的对照：按现在的规矩还对不对（死键 / 跟规矩打架）"],
  ["测试-导观麦.js", "★ 导观麦：一行存疑都不许导、xlsx 真能开"],
  ["体检-会不会认错.js", "★ 自信地认错必须为 0"]
];

let bad = 0;
STEPS.forEach(([file, what]) => {
  process.stdout.write("• " + what + "\n    " + file + " … ");
  try {
    const out = execFileSync(process.execPath, [file], { encoding: "utf8", cwd: __dirname });
    const tail = out.trim().split("\n").filter(Boolean).slice(-1)[0] || "";
    console.log("通过　" + tail.trim());
  } catch (e) {
    bad++;
    console.log("没过 ❌");
    console.log((e.stdout || e.message || "").split("\n").slice(-25).map(s => "      " + s).join("\n"));
  }
});

/* 页面本身：语法、id、以及有没有偷偷抄回一份匹配逻辑 */
process.stdout.write("• 页面：语法 / id / 有没有再抄一份匹配逻辑\n    配送开单台.html … ");
{
  const h = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
  const errs = [];
  let m, n = 0;
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  while ((m = re.exec(h)) !== null) { n++; try { new Function(m[1]); } catch (e) { errs.push("第" + n + "段 script 语法错：" + e.message); } }
  const used = new Set([...h.matchAll(/\$\("([^"]+)"\)/g)].map(x => x[1]));
  const have = new Set([...h.matchAll(/id="([^"]+)"/g)].map(x => x[1]));
  [...used].filter(x => !have.has(x)).forEach(x => errs.push("JS 里用了 id 「" + x + "」，页面上没有"));
  /* 匹配逻辑必须只有 引擎-匹配.js 一份 —— 页面里再出现函数体就是又抄回去了 */
  if (/function\s+matchOne\s*\([^)]*\)\s*\{[\s\S]{200,}/.test(h) && !h.includes("GM_MATCH.matchOne"))
    errs.push("页面里又抄了一份 matchOne —— 必须调 GM_MATCH.matchOne");
  ["GM_MATCH.matchOne", "GM_MATCH.buildIndex", "GM_MATCH.commits", "GM_PARSE.learnWrite", "引擎-匹配.js"]
    .forEach(s => { if (!h.includes(s)) errs.push("页面没接上 " + s); });
  /* ★ 包装层不许吃掉参数（2026-08-11）
     8/4 调用处改成传 6 个，包装函数还是 4 个形参，后两个被静默吃掉，躺了一个礼拜 ——
     斤转板那道规矩在页面上压根没跑过，测试却一直全绿（测试直连引擎，不走这层）。
     这类伤只能在这儿抓：包装函数必须原样转发，写死形参就报错。 */
  {
    const d = h.match(/function\s+matchOne\s*\(([^)]*)\)\s*\{([\s\S]{0,600}?)\n\s*\}/);
    if (!d) errs.push("找不到 matchOne 包装函数");
    else if (d[1].trim() || !/arguments/.test(d[2]) || !/\.apply\s*\(/.test(d[2]))
      errs.push("matchOne 包装函数写死了形参（" + (d[1].trim() || "空") + "）—— 必须用 arguments/apply 原样转发，不然引擎加参数时会被悄悄吃掉");
    /* 教对照的时候必须把「这个货怎么卖」一起交出去，learnWrite 才核得了跨秤 */
    if (!/learnWrite\([\s\S]{0,400}?bareRisky[\s\S]{0,200}?\n\s*function\s*\(s\)/.test(h)
        && !/learnWrite\([\s\S]{0,600}?\[3\];\s*\}\)/.test(h))
      errs.push("页面调 learnWrite 没传 unitOf —— 跨秤的配对（板→斤货）就拦不住了");
  }
  if (errs.length) { bad++; console.log("没过 ❌"); errs.forEach(e => console.log("      " + e)); }
  else console.log("通过　" + n + " 段 script、" + used.size + " 个 id");
}

/* 上传清单：新加的 js 忘了写进部署脚本，线上就是白屏。
   2026-08-01 起上传走 deploy.ps1（原来的 .bat 在中文系统上闪退，已弃用）。 */
process.stdout.write("• 上传清单：要传的文件一个都不能漏\n    deploy.ps1 … ");
{
  const cands = [
    "C:/Users/Public/kaidan/deploy.ps1",
    path.join(process.env.USERPROFILE || "C:/Users/李正", "Desktop", "部署包", "deploy.ps1")
  ].filter(f => fs.existsSync(f));
  if (!cands.length) { bad++; console.log("没过 ❌\n      两个位置都找不到 deploy.ps1 —— 上传脚本丢了"); }
  else {
    /* ★ 清单不再手抄（2026-08-05）
       原来这里写死一串文件名，等于第二份真相 —— 新加一个 .js 忘了同步，
       本地好好的，线上那个文件 404，页面直接白屏或者功能悄悄失效。
       现在直接从页面的 <script src> 里推：页面要加载的，就必须上传。
       这样新加文件时想漏都漏不了。 */
    const 页 = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
    const 不传 = ["密钥-本机.js"];          /* 密钥只在本机和服务器上，绝不上传 */
    const need = ["配送开单台.html"];
    for (const m of 页.matchAll(/<script\s+src="([^"?]+)/g))
      if (!/^https?:/.test(m[1]) && 不传.indexOf(m[1]) < 0 && need.indexOf(m[1]) < 0) need.push(m[1]);
    const errs = [];
    /* 页面引的文件本地得真的在，不然传也没得传 */
    const 本地缺 = need.filter(x => !fs.existsSync(path.join(__dirname, x)));
    if (本地缺.length) errs.push("页面引了这些文件，本地却没有：" + 本地缺.join("、"));
    cands.forEach(f => {
      const t = fs.readFileSync(f, "utf8");
      /* 只认 $files = @( … ) 里面用引号括起来的那些。
         ⚠ 别拿整个文件做 includes：注释里随口提一句文件名就能骗过去，
            我 2026-08-05 就这么骗过自己一次 —— 文件根本没进清单，检查还是绿的。 */
      const 段 = t.match(/\$files\s*=\s*@\(([\s\S]*?)\)/);
      if (!段) { errs.push(path.basename(path.dirname(f)) + "/deploy.ps1 里找不到 $files 清单"); return; }
      const 列 = [...段[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
      const miss = need.filter(x => 列.indexOf(x) < 0);
      const 多 = 列.filter(x => need.indexOf(x) < 0);
      if (多.length) errs.push(path.basename(path.dirname(f)) + "/deploy.ps1 要传页面根本没引的文件：" + 多.join("、"));
      if (miss.length) errs.push(path.basename(path.dirname(f)) + "/deploy.ps1 漏了：" + miss.join("、"));
      /* 密钥文件绝不能上传 —— 传上去谁都能按 F12 抄走 */
      if (t.includes("密钥-本机.js")) errs.push(path.basename(path.dirname(f)) + "/deploy.ps1 里出现了 密钥-本机.js，不能传");
    });
    if (errs.length) { bad++; console.log("没过 ❌"); errs.forEach(e => console.log("      " + e)); }
    else console.log("通过　" + cands.length + " 份脚本、" + need.length + " 个文件都在");
  }
}

console.log("\n══════════════════════════");
if (bad) { console.log("有 " + bad + " 项没过 —— 先别上传。"); process.exit(1); }
console.log("全部通过，可以推上线了。");
