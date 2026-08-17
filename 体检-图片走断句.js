/* 图片走断句 —— node 体检-图片走断句.js
   ================================================================
   老板 2026-08-17：「应该把它交给 AI，拆开之后再让断句继续断，
                     所以它还是一条路，只不过加了一个东西」

   以前：图片认不出表格 → 整张交给 AI，让它连【数字】一起填格子表。
         毛病是 AI 边抄边切会整段丢 —— 江云 8/10 丢了三段共 11 斤，
         客户自己的总数也没算这些，两边一起错，一道校验都拦不住。

   现在：OCR 认出字 → 断句先读一遍 → 对账
           捞全了   → 直接进原文框（一个 token 都不花）
           捞不全   → 请 AI【只拆行】，拆完还是断句读数字

   钉四件事：
     一、分流靠【对账】，不许写死「一行超过几样」那种阈值
     二、9 份「一整单挤成一行」的必须全被拦下来交给 AI，一份都不许漏判
     三、断句捞得全的那批，一份都不许被误判成要问 AI（白花钱）
     四、拆行提示词里不许出现任何让 AI 动数字的意思
   ================================================================ */
const fs = require("fs"), path = require("path");
global.window = global.window || {};
["数据-价格库.js", "对照-预置.js", "数据-常用规格.js", "数据-换算.js",
 "引擎-解析.js", "引擎-认表.js", "引擎-读结构.js"].forEach(f => require("./" + f));
const W = global.window, P = W.GM_PARSE, T = W.GM_TABLE, S = W.GM_STRUCT;

let pass = 0, fail = 0;
const L = s => process.stdout.write(Buffer.from(s + "\n", "utf8"));
function ok(name, 真, 说) {
  if (真) { pass++; L("  ✅ " + name); }
  else { fail++; L("  ❌ " + name + (说 ? ("\n      " + 说) : "")); }
}

L("── 一、判据在引擎里，页面不许自己另写一套 ──");
ok("GM_PARSE.捞干净了吗 在", typeof P.捞干净了吗 === "function");
{
  const h = fs.readFileSync(path.join(__dirname, "配送开单台.html"), "utf8");
  ok("页面调的是引擎那份", /GM_PARSE\.捞干净了吗\(/.test(h));
  ok("★ 页面里没有写死的「一行超过几样」阈值",
     !/最挤|一行超过|>=\s*4\s*样/.test(h),
     "写死阈值就是今天查了一整天的那个毛病");
  ok("捞不全时请 AI 拆行（不是让它填表）", /拆行提示词/.test(h));
  ok("拆完还是交给断句", /拆好的[\s\S]{0,300}收下文字\(/.test(h));
  ok("捞得全就直接进原文框，不调 AI", /账\.够[\s\S]{0,120}收下文字\(/.test(h));
}

L("");
L("── 二、拆行提示词：一个字都不许让 AI 动数字 ──");
{
  const p = String(S.拆行提示词 || "");
  ok("提示词在", p.length > 100);
  ok("写死了「只准加换行」", /只准加换行/.test(p));
  ok("写死了「不许改数字」", /不许改数字/.test(p));
  ok("写死了「不许换算」", /不许换算/.test(p));
  ok("写死了「不许补单位」", /不许补单位/.test(p));
  ok("写死了「不许合并/去重」", /不许合并/.test(p) && /不许去重/.test(p));
  ok("★ 没有让它「整理/归纳/填表」的话",
     !/整理|归纳|填表|填进|JSON/.test(p),
     "只要它开始填表，就跟老路一样会丢段");
}

L("");
L("── 三、拿 130 份真单验分流 ──");
{
  const 缓存 = path.join(process.env.USERPROFILE || "C:/Users/李正", "Desktop", "OCR缓存");
  let files = [];
  try { files = fs.readdirSync(缓存).filter(f => /\.txt$/i.test(f)); } catch (e) { }
  ok("找得到真单（OCR缓存）", files.length > 0, "没有真单这一节等于没验");

  /* 人工确认过「一整单挤成一行」的 —— 断句读不动，必须交给 AI 拆 */
  const 挤的 = ["de6e7e1c", "cccc8bc7", "c55e695a", "36d90f00", "78307f64",
                "05c3b601", "8381dd3b", "3f2ead24", "e0bd8322"];
  let 归管 = 0, 走断句 = 0, 请AI = 0, 空的 = 0;
  const 判错 = [];
  files.forEach(f => {
    const t = fs.readFileSync(path.join(缓存, f), "utf8");
    let g = null; try { g = T.markdown转表 ? T.markdown转表(t) : null; } catch (e) { }
    if (g) return;                                   /* 认得出表格 → 走方法二，不归这条管 */
    let 截 = ""; try { 截 = T.是Excel截图 ? (T.是Excel截图(t) || "") : ""; } catch (e) { }
    if (截) return;                                  /* Excel 截图写死拒收 */
    归管++;
    const 账 = P.捞干净了吗(t);
    const 是挤的 = 挤的.some(k => f.indexOf(k) >= 0);
    if (账.空) { 空的++; return; }
    if (账.够) {
      走断句++;
      if (是挤的) 判错.push(f.slice(0, 44) + "　原文" + 账.原文 + "/捞到" + 账.捞到);
    } else 请AI++;
  });
  L(`      归这条路管 ${归管} 份：走断句 ${走断句}、请 AI 拆 ${请AI}、OCR 没出字 ${空的}`);
  ok("★ 挤成一行的一份都没漏判（漏判 = 那一单的货会静默少掉一大半）",
     判错.length === 0, 判错.join("\n      "));
  ok("大部分不用花钱（走断句的比请 AI 的多）", 走断句 > 请AI,
     `走断句 ${走断句} / 请 AI ${请AI}`);
}

L("");
L("── 四、对账这把尺子本身对不对 ──");
{
  const 挤 = "活道猪红10斤大油3斤海带丝3斤海带结3斤肉卷2条烟干5斤水豆腐1板老豆腐1板";
  const a = P.捞干净了吗(挤);
  ok("一整单挤成一行 → 判「捞不全」", !a.够, JSON.stringify(a));

  const 正常 = "老豆腐 6斤\n千张 8斤\n嫩豆腐 3板";
  const b = P.捞干净了吗(正常);
  ok("一行一样 → 判「捞得全」", b.够, JSON.stringify(b));

  const 空 = "   \n\n  ";
  ok("空的 → 标成空，不许当成捞不全去花钱请 AI", P.捞干净了吗(空).空);

  /* 日期电话不许被当成订货量，不然天天误判去请 AI */
  const 带日期 = "2026-08-17 老豆腐 6斤\n电话 13528977756\n千张 8斤";
  const d = P.捞干净了吗(带日期);
  ok("日期和电话不算订货量（不然白花钱）", d.够, JSON.stringify(d));
}

L("");
L(fail ? ("══ " + pass + " 过，" + fail + " 没过") : ("══ 全过（" + pass + " 项）"));
process.exit(fail ? 1 : 0);
