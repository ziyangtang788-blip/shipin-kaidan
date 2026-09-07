/* 直接加客户 + 把报价单拖进来导货导价 —— node 测试-加客户和导报价单.js

   老板 2026-09-07：
     「现在这个问题是不可以直接加客户，你把这个功能加上去，可以直接添加客户，
       然后可以直接拉文档进来，自动匹配对应的价格、品名、名称。
       但必须要文档再拉过来，对应匹配，然后再验证一遍。」

   他当场拍的三条（问过他才做的）：
     ① 客户编号【他自己填观麦的号】—— 观麦的号我们编不出来
     ② 品名【先对到我们已有的商品】，对不上的摆出来让他看
     ③ 【摆出来让他点，点了才入库】—— 不点一个字都不落地

   钉四件事：
     一 认列靠【表头的名字】，而且那些名字在真文件里真的存在
     二 规格照老规矩规范（观麦「1.0斤/斤」→ 库里「1斤/斤」）
     三 新增的客户存得住、接得回来、换台电脑不丢
     四 页面上那条链真的接上了，而且【不点确认就不入库】 */
const fs = require("fs"), path = require("path");
const 家 = __dirname;
process.chdir(家);
global.window = {};
require(path.join(家, "引擎-读文件.js"));
const F = window.GM_FILE;

let 过 = 0, 挂 = [];
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function 该(话, 真) { if (真) 过++; else 挂.push(话); }

const H = fs.readFileSync(path.join(家, "配送开单台.html"), "utf8");
const 净 = H.replace(/\/\*[\s\S]*?\*\//g, "");

L("═══ 一、认列靠表头的名字，不靠第几列 ═══");
{
  该("★ 找列的时候按名字找（列序变了也不会读错）", /function 第\(名们\)/.test(净));
  ["SPU名", "商品名(可修改)", "商品ID(SKUID)", "单价(可修改)", "销售规格"].forEach(n => {
    该("★ 认得表头「" + n + "」", 净.indexOf('"' + n + '"') >= 0);
  });
  该("⛔ 不许按第几列写死", !/r\[3\]|r\[9\]|r\[15\]/.test(净.slice(净.indexOf("function 读报价单"), 净.indexOf("function 摆报价单"))));
}

L("═══ 二、规格规范：观麦的 1.0斤/斤 → 库里的 1斤/斤 ═══");
{
  const i = 净.indexOf("function 报价单规范");
  const j = 净.indexOf("function 读报价单", i);
  const src = i >= 0 ? 净.slice(i, j) : "";
  该("★ 页面里有这一条", src.length > 0);
  if (src) {
    const 规范 = new Function(src + "; return 报价单规范;")();
    该("1.0斤/斤 → 1斤/斤", 规范("1.0斤/斤") === "1斤/斤");
    该("5.0斤/袋 → 5斤/袋", 规范("5.0斤/袋") === "5斤/袋");
    该("2.5斤/包 不许被削", 规范("2.5斤/包") === "2.5斤/包");
    该("空的还是空的", 规范("") === "");
  }
}

L("═══ 三、新增的客户：存得住、接得回来、换台电脑不丢 ═══");
{
  该("★ 覆盖层里有 cadd 这一格", /cadd:\{\}/.test(净) || /cadd: \{\}/.test(净));
  该("★ 有把新客户接回 DATA.custs 的那一步", /function applyCust\(\)/.test(净));
  该("★ 接完把「号→第几家」的缓存作废（不作废新客户查不到）",
    /DATA\.custs\.push\(\[cid[\s\S]{0,120}CID2CI=null/.test(净));
  该("★ 号重了不接（不然两个同号客户，改价改到哪家都说不准）",
    /if\(DATA\.custs\.some\(function\(c\)\{ return c\[0\]===cid; \}\)\) return;/.test(净));
  该("★ applyCust 排在 applyAdd 前面（客户没接进来，货就挂不上）",
    (净.match(/applyCust\(\); applyAdd\(\)/g) || []).length >= 3);
  该("★ 服务器传回来的新客户也收下", /Object\.keys\(d\.cadd\|\|\{\}\)/.test(净));
  const S = fs.readFileSync(path.join(家, "后端-server.js"), "utf8");
  该("★★ 后端白名单里有 cadd（漏了换台电脑就被抹掉）", /cadd: \{\}/.test(S));
  该("★★ 后端合并时也带着它", /cadd: Object\.assign\(\{\}, base\.cadd, incoming\.cadd \|\| \{\}\)/.test(S));
  该("★ 号要长得像观麦的报价单ID 才收", /\^S\[0-9\]\{3,8\}\$/.test(净));
}

L("═══ 四、必须先摆出来，点了才入库 ═══");
{
  该("★ 读完是【摆出来】，不是直接存", /IMP=\{cid:cid,行:出/.test(净) && /摆报价单\(\);/.test(净));
  该("★ 只有点「确认入库」才写", /\$\("cd-imp-ok"\)\.addEventListener\("click",入库报价单\)/.test(净));
  该("★ 取消了就一个字都不留", /IMP=null; \$\("cd-impbox"\)\.hidden=true;/.test(净));
  该("★ 摆的时候标出「库里没对上同名商品」", /库里没有同名的/.test(H));
  该("★ 摆的时候标出「没有观麦码」", /没有观麦码/.test(H));
  该("★ 已经有的货跳过，不重复建", /if\(x\.已有\)\{ 跳\+\+; return; \}/.test(净));
  该("★ 入库走现成的 addProduct，不另写一套", /addProduct\(cid,\{prod:\(x\.对到\|\|x\.spu\|\|x\.叫法\)/.test(净));
  该("★ 拖到这张卡片上也行", /卡\.addEventListener\("drop"/.test(净));
  该("★★ 拖放要挡住冒泡（不挡，报价单会被全局那个「拖文件开单」抢走）",
    /e\.stopPropagation\(\);\s*读报价单\(f\);/.test(净));
}

L("═══ 五、拿真文件核一遍：我找的那几个表头，文件里真的有 ═══");
(function () {
  const 真 = "C:/Users/李正/Desktop/录入文件/T2011436_S19241_2026-09-07_22-27.xlsx";
  if (!fs.existsSync(真)) { L("  （没有那份真报价单，这一节跳过）"); return; }
  const buf = fs.readFileSync(真);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return F.readXlsxGrid(ab).then(gs => {
    const 头 = (gs[0].rows[0] || []).map(x => String(x == null ? "" : x).trim());
    ["SPU名", "商品名(可修改)", "商品ID(SKUID)", "单价(可修改)", "销售规格"].forEach(n => {
      该("★ 真报价单里有「" + n + "」这一列", 头.indexOf(n) >= 0);
    });
    该("★ 真报价单读得出货（不止表头一行）", gs[0].rows.length > 1);
  });
})();

L("═══ 六、★★ 拿真报价单【真跑一遍】，逐条核价 ═══");
/* ⚠ 这一节是 9/7 补的。那天价格全读成 0.00 上了线，
   就因为上面那些只查代码长相、没拿真文件真跑。
   所以把解析那段抽成了 报价单读成条()（纯算、不碰页面），这儿直接喂真文件给它。 */
(function () {
  const i = 净.indexOf("function 报价单规范");
  const j = 净.indexOf("function 读报价单");
  if (i < 0 || j < 0) { 挂.push("页面里找不到 报价单读成条"); return; }
  const 读成条 = new Function(净.slice(i, j) + "; return 报价单读成条;")();

  /* 先拿一张自己造的小表，把每一样都对一遍 */
  const 表 = [
    ["SPUID", "SPU名", "商品ID(SKUID)", "商品名(可修改)", "单价(可修改)", "销售规格", "销售状态(可修改，1上架，0下架)"],
    ["C1", "尝元小豆泡", "D17086760", "小豆泡", "6", "1.0斤/斤", "1"],
    ["C2", "尝元豆腐串（串）", "D17086750", "豆腐串（串）", "0.5", "1.0串/串", "1"],
    ["C3", "库里没有的货", "D9999999", "随便叫", "12.5", "5.0斤/袋", "1"]
  ];
  const 条 = 读成条(表, { D17086750: 1 }, ["尝元小豆泡", "尝元豆腐串"]);
  该("★★ 价真的读出来了（不是 0）", 条[0].价 === 6);
  该("★★ 小数价也对", 条[1].价 === 0.5);
  该("★★ 第三条 12.5", 条[2].价 === 12.5);
  该("★ 单位从销售规格里取", [条[0].单位, 条[1].单位, 条[2].单位].join(",") === "斤,串,袋");
  该("★ 规格规范过了", 条[0].规格 === "1斤/斤" && 条[2].规格 === "5斤/袋");
  该("★ 已经有的那条标成「已有」", 条[1].已有 === true && 条[0].已有 === false);
  该("★ 对得上的对上了", 条[0].对到 === "尝元小豆泡");
  该("★ 去掉括号也能对上", 条[1].对到 === "尝元豆腐串");
  该("★ 库里没有的就空着，不硬凑", 条[2].对到 === "");

  /* 再拿老板那份真报价单跑 */
  const 真 = "C:/Users/李正/Desktop/录入文件/T2011436_S19241_2026-09-07_22-27.xlsx";
  if (!fs.existsSync(真)) { L("  （没有那份真报价单，真跑这一段跳过）"); return; }
  const buf = fs.readFileSync(真);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return F.readXlsxGrid(ab).then(gs => {
    const 条2 = 读成条(gs[0].rows, {}, []);
    该("★★ 真报价单读出 8 条", 条2.length === 8);
    该("★★ 真报价单里没有一条价是 0（那就是 9/7 那个 bug）",
      条2.every(x => x.价 > 0));
    该("★★ 每一条都有观麦码", 条2.every(x => /^D[0-9]+$/.test(x.码)));
    该("★ 每一条都有单位", 条2.every(x => !!x.单位));
    该("★ 规格里不许再留 .0", 条2.every(x => x.规格.indexOf(".0") < 0));
  });
})();

setTimeout(function () {
  if (挂.length) {
    L("没过 " + 挂.length + " 项：");
    挂.forEach(t => L("  ✗ " + t));
    process.exit(1);
  }
  L("\n全部通过：" + 过 + " 项");
}, 800);
