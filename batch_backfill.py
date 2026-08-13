#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
batch_backfill.py —— 历史单批量回填（走 Anthropic Batch API）

    python batch_backfill.py                  干跑：只报「几份、多少 token、多少钱」，不发一个请求
    python batch_backfill.py --跑              真发。发完给一个 batch_id 就退出，不傻等
    python batch_backfill.py --收              回来收货：拉结果 → 写 xlsx
    python batch_backfill.py --跑 --限 10       先拿 10 份试水

为什么走 Batch：
  · 进出 token 各五折（比交互里一条条跑省一半）
  · 24 小时内异步返回，不占着终端
  · 提示词挂 1 小时缓存档 —— 回填量大、一批要跑几十分钟到几小时，
    5 分钟档中途就过期了，1 小时档写贵一倍（2×）但命中只要 0.1×，
    份数一多稳赚（≥3 次命中就回本）

不碰匹配逻辑：
  这个脚本一行业务代码都不复制。骨架/提示词/摊平/读结构/校验全都是
  临时起个 node 去 require 现成的 引擎-*.js —— 「匹配逻辑只准一份」那条不破。
  临时 js 落在 .批量临时/ 下，随时可以打开看。

不做的事：
  · 不灌点位册（要灌得先把 工具-批量跑真单.js 里的「猜客户」抽成公用文件，
    直接抄第二份就违反「只准一份」）
  · 不改任何已有文件
"""

import base64, json, os, subprocess, sys, time, shutil

# ── 配置（要改就改这几行）────────────────────────────────────────────
项目     = os.path.dirname(os.path.abspath(__file__))
单据根   = r"C:/Users/李正/Desktop/也一原始数据/配送客户8.1号下单数据原单"
模型     = "claude-opus-5"
缓存档   = "1h"          # 回填量大用 1h；小于 20 份改回 "5m" 更划算
每批上限 = 180 * 1024 * 1024   # 官方 256MB/批，留余量
每批条数 = 20000               # 官方 100000/批
临时     = os.path.join(项目, ".批量临时")
进度文件 = os.path.join(项目, "批量回填-进度.json")
输入JSONL = os.path.join(临时, "输入.jsonl")
回复JSONL = os.path.join(临时, "回复.jsonl")
归总JSON  = os.path.join(临时, "归总.json")
出XLSX   = os.path.join(项目, "批量回填结果.xlsx")

# Claude Opus 5 官价 $5/$25 每百万；Batch 五折 → $2.5/$12.5
# 1h 缓存：写 2×进价，命中 0.1×进价（都同样吃五折）
进价, 出价 = 5.0 / 2, 25.0 / 2
写倍, 中倍 = (2.0 if 缓存档 == "1h" else 1.25), 0.1
汇率 = 7.2

# ── 两段 node 小工具（只调引擎，不实现任何规则）──────────────────────
准备JS = r"""
/* 生成 batch 输入 —— 只做本地那半截：Excel 压骨架、图片转 base64。
   一行业务规则都没有，全是 require 现成引擎。 */
global.window = {};
require("./数据-价格库.js"); require("./对照-预置.js"); require("./数据-常用规格.js");
require("./数据-换算.js");   require("./引擎-解析.js");  require("./引擎-匹配.js");
require("./引擎-读文件.js"); require("./引擎-读结构.js"); require("./引擎-认表.js");
const W = global.window, F = W.GM_FILE, S = W.GM_STRUCT, T = W.GM_TABLE;
const fs = require("fs"), path = require("path");
const 根 = process.argv[2], 出 = process.argv[3], 上限 = parseInt(process.argv[4], 10) || 999999;
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
const 买 = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.length);

(async () => {
  const 活 = [];
  for (const d of fs.readdirSync(根)) {
    const p = path.join(根, d); if (!fs.statSync(p).isDirectory()) continue;
    /* 每家先挑一份，把「家数」铺开 —— 格式是按家分的 */
    const fl = fs.readdirSync(p).filter(x => /\.(xlsx|xls|png|jpg|jpeg|pdf)$/i.test(x));
    if (fl.length) 活.push({ 家: d, 文件: path.join(p, fl[0]) });
  }
  const 跑 = 活.slice(0, 上限);
  const w = fs.createWriteStream(出, { encoding: "utf8" });
  for (let i = 0; i < 跑.length; i++) {
    const it = 跑[i], e = path.extname(it.文件).toLowerCase(), b = fs.readFileSync(it.文件);
    let 路, content;
    try {
      if (/\.(xlsx|xls)$/i.test(it.文件)) {
        /* 便宜路：本地把表压成骨架，只让 AI 回一句读法。约 ¥0.27/份 vs 全量 ¥9.8 */
        路 = "认表"; content = [{ type: "text", text: T.骨架(await F.readXlsxGrid(买(b))) }];
      } else if (MIME[e]) {
        路 = "全量"; content = [{ type: "image", source: { type: "base64", media_type: MIME[e], data: b.toString("base64") } }];
      } else if (e === ".pdf") {
        路 = "全量"; content = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b.toString("base64") } }];
      } else {
        路 = "全量"; content = [{ type: "text", text: await F.readXlsx(买(b)).catch(() => fs.readFileSync(it.文件, "utf8")) }];
      }
    } catch (err) { 路 = "读不了"; content = [{ type: "text", text: String(err.message) }]; }
    w.write(JSON.stringify({ id: "d" + i, 家: it.家, 文件: it.文件, 路: 路, content: content }) + "\n");
  }
  w.end();
  fs.writeFileSync(出 + ".prompt.json",
    JSON.stringify({ 认表: T.认表提示词, 全量: S.提示词 }), "utf8");
  console.error("准备好 " + 跑.length + " 份（共 " + 活.length + " 家有单）");
})().catch(e => { console.error("准备失败：" + e.message); process.exit(1); });
"""

归总JS = r"""
/* 把 AI 回的文字过一遍现成的 剥JSON / 摊平 / 读结构 / 校验说人话。
   同样一行规则都不写。 */
global.window = {};
require("./数据-价格库.js"); require("./对照-预置.js"); require("./数据-常用规格.js");
require("./数据-换算.js");   require("./引擎-解析.js");  require("./引擎-匹配.js");
require("./引擎-读文件.js"); require("./引擎-读结构.js"); require("./引擎-认表.js");
const W = global.window, F = W.GM_FILE, S = W.GM_STRUCT, T = W.GM_TABLE;
const fs = require("fs");
const [输入, 回复, 出] = process.argv.slice(2);
const 买 = b => b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
const 读行 = p => fs.readFileSync(p, "utf8").split("\n").filter(s => s.trim()).map(s => JSON.parse(s));

(async () => {
  const 元 = {}; 读行(输入).forEach(r => 元[r.id] = r);
  const 结果 = [];
  for (const a of 读行(回复)) {
    const m = 元[a.id] || {};
    const 底 = { 家: m.家 || "", 文件: (m.文件 || "").split(/[\\\\/]/).pop(), 路: m.路 || "",
                 进: a.进 || 0, 出: a.出 || 0, 缓写: a.缓写 || 0, 缓中: a.缓中 || 0 };
    if (a.错) { 结果.push(Object.assign(底, { 错: a.错 })); continue; }
    try {
      let J;
      if (m.路 === "认表") {
        const 读法 = S.剥JSON(a.文);
        if (!读法) throw new Error("剥不出读法");
        const b = fs.readFileSync(m.文件);
        J = T.摊平(await F.readXlsxGrid(买(b)), 读法);
        if (!J || !J.行 || !J.行.length) throw new Error("按读法摊不出行——这份要退回全量重跑");
      } else {
        J = S.剥JSON(a.文);
        if (!J) throw new Error("剥不出格子表");
      }
      const r = S.读结构(J);
      const 段 = r.lines.reduce((x, L) => x + ((L.segs || []).length), 0);
      结果.push(Object.assign(底, {
        品: r.lines.length, 段: 段,
        量: Math.round(r.lines.reduce((x, L) => x + (L.qty || 0), 0) * 100) / 100,
        校验: S.校验说人话(r.校验) || [],
        没读懂: r.没读懂的 || [],
        /* 字段名是 2026-08-04 拿 S.读结构() 实跑出来的，不是猜的：
           行 = text/名原/segs/price/表上金额/unit/qty，段 = qty/unit/code/note/没看清。
           单据上印客户原话（名原），text 是拼了规格的、只用来核对。 */
        行: r.lines.map(L => ({
          品名: L.名原 || "", 名带规格: L.text || "", 单位: L.unit || "",
          数量: L.qty, 单价: L.price, 表上金额: L.表上金额,
          点位: (L.segs || []).map(g => (g.code || "") + "×" + g.qty + (g.unit || "")).join(" / "),
          没看清: (L.segs || []).some(g => g.没看清) ? "是" : ""
        }))
      }));
    } catch (e) { 结果.push(Object.assign(底, { 错: e.message })); }
  }
  fs.writeFileSync(出, JSON.stringify(结果), "utf8");
  console.error("归总 " + 结果.length + " 份");
})().catch(e => { console.error("归总失败：" + e.message); process.exit(1); });
"""


def 密钥():
    """跟 JS 一个来源：只从 密钥-本机.js 读，绝不进任何上传的文件、绝不打印。"""
    import re
    p = os.path.join(项目, "密钥-本机.js")
    m = re.search(r"['\"](sk-ant-[^'\"]+)['\"]", open(p, encoding="utf-8").read())
    if not m:
        sys.exit("密钥-本机.js 里找不到密钥")
    return m.group(1)


def 跑node(名, 源, 参数):
    os.makedirs(临时, exist_ok=True)
    f = os.path.join(临时, 名)
    open(f, "w", encoding="utf-8").write(源)
    r = subprocess.run(["node", f] + [str(x) for x in 参数], cwd=项目)
    if r.returncode:
        sys.exit("node 那步没跑成，看上面的报错")


def 读JSONL(p):
    with open(p, encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


# ── 组装 batch 请求 ──────────────────────────────────────────────────
def 建请求(条, 提示词):
    """提示词排最前 + 挂缓存。
    缓存是「从头到缓存块」整段缓存，骨架/图片每份都不一样，
    排在前面就一次都命不中 —— 这个顺序不能动。"""
    路 = 条["路"]
    return {
        "custom_id": 条["id"],
        "params": {
            "model": 模型,
            # Opus 5 默认就在思考，思考和正文共吃 max_tokens。
            # 认表那条老 JS 里写的 2000 在 Opus 5 上有截断风险，这里放到 8000。
            "max_tokens": 8000 if 路 == "认表" else 64000,
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "text",
                    "text": 提示词["认表" if 路 == "认表" else "全量"],
                    "cache_control": {"type": "ephemeral", "ttl": 缓存档},
                }] + 条["content"],
            }],
        },
    }


def 分批(请求们):
    批, 本, 本大 = [], [], 0
    for r in 请求们:
        n = len(json.dumps(r, ensure_ascii=False).encode("utf-8"))
        if 本 and (本大 + n > 每批上限 or len(本) >= 每批条数):
            批.append(本); 本, 本大 = [], 0
        本.append(r); 本大 += n
    if 本:
        批.append(本)
    return 批


# ── 三个动作 ────────────────────────────────────────────────────────
def 准备(限):
    if os.path.isdir(临时):
        shutil.rmtree(临时)
    跑node("准备.js", 准备JS, [单据根, 输入JSONL, 限])
    条 = 读JSONL(输入JSONL)
    提示词 = json.load(open(输入JSONL + ".prompt.json", encoding="utf-8"))
    return 条, 提示词


def 估价(请求们):
    """粗估：中文约 1.5 字/token，图片按 4784 token（Opus 5 高清上限）算。"""
    认表 = sum(1 for r in 请求们 if r["params"]["max_tokens"] == 8000)
    全量 = len(请求们) - 认表
    进 = 0
    for r in 请求们:
        for b in r["params"]["messages"][0]["content"]:
            if b["type"] == "text":
                进 += len(b["text"]) / 1.5
            elif b["type"] == "image":
                进 += 4784
            else:
                进 += 3000
    出 = 认表 * 400 + 全量 * 6000       # 认表只回一句读法；全量回整张格子表
    美 = (进 * 进价 + 出 * 出价) / 1e6
    return 认表, 全量, int(进), int(出), 美


def 提交(请求们, key):
    import anthropic
    c = anthropic.Anthropic(api_key=key)
    ids = []
    for i, 组 in enumerate(分批(请求们), 1):
        b = c.messages.batches.create(requests=组)
        ids.append(b.id)
        print("  第 %d 批：%d 份 → %s" % (i, len(组), b.id))
    json.dump({"batch_ids": ids, "提交于": time.strftime("%Y-%m-%d %H:%M:%S")},
              open(进度文件, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return ids


def 收货(key):
    import anthropic
    if not os.path.exists(进度文件):
        sys.exit("没有 批量回填-进度.json —— 先 python batch_backfill.py --跑")
    ids = json.load(open(进度文件, encoding="utf-8"))["batch_ids"]
    c = anthropic.Anthropic(api_key=key)

    未完 = []
    for bid in ids:
        s = c.messages.batches.retrieve(bid).processing_status
        print("  %s → %s" % (bid, s))
        if s != "ended":
            未完.append(bid)
    if 未完:
        sys.exit("还有 %d 批没跑完（Batch 最长 24 小时）。过会儿再 --收。" % len(未完))

    行, 成, 败 = [], 0, 0
    for bid in ids:
        for r in c.messages.batches.results(bid):     # ⚠ 顺序是乱的，只能按 custom_id 认
            t = r.result.type
            if t == "succeeded":
                m = r.result.message
                文 = "\n".join(b.text for b in m.content if b.type == "text")
                u = m.usage
                行.append({"id": r.custom_id, "文": 文,
                           "进": u.input_tokens, "出": u.output_tokens,
                           "缓写": getattr(u, "cache_creation_input_tokens", 0) or 0,
                           "缓中": getattr(u, "cache_read_input_tokens", 0) or 0})
                成 += 1
            else:
                错 = getattr(getattr(r.result, "error", None), "type", t)
                行.append({"id": r.custom_id, "错": "%s（%s）" % (t, 错)})
                败 += 1
    with open(回复JSONL, "w", encoding="utf-8") as f:
        for x in 行:
            f.write(json.dumps(x, ensure_ascii=False) + "\n")
    print("  拉回 %d 份：成 %d / 败 %d" % (len(行), 成, 败))

    跑node("归总.js", 归总JS, [输入JSONL, 回复JSONL, 归总JSON])
    return json.load(open(归总JSON, encoding="utf-8"))


def 写xlsx(结果):
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill
    except ImportError:
        sys.exit("缺 openpyxl：pip install openpyxl")

    wb = Workbook()
    红 = PatternFill("solid", fgColor="FFC7CE")
    橙 = PatternFill("solid", fgColor="FFE0B2")
    粗 = Font(bold=True)

    ws = wb.active; ws.title = "总览"
    头 = ["家", "文件", "路", "品数", "段数", "数量合计", "校验问题", "没读懂", "错"]
    ws.append(头)
    for c in ws[1]:
        c.font = 粗
    for r in 结果:
        坏 = r.get("校验") or []
        ws.append([r.get("家"), r.get("文件"), r.get("路"), r.get("品"), r.get("段"),
                   r.get("量"), "；".join(坏), len(r.get("没读懂") or []), r.get("错", "")])
        if r.get("错"):
            for c in ws[ws.max_row]:
                c.fill = 红
        elif 坏:
            for c in ws[ws.max_row]:
                c.fill = 橙

    ws2 = wb.create_sheet("明细")
    ws2.append(["家", "文件", "品名(客户原话)", "名带规格", "单位", "数量", "单价", "表上金额", "点位", "没看清"])
    for c in ws2[1]:
        c.font = 粗
    for r in 结果:
        for L in r.get("行", []):
            ws2.append([r.get("家"), r.get("文件"), L.get("品名"), L.get("名带规格"), L.get("单位"),
                        L.get("数量"), L.get("单价"), L.get("表上金额"), L.get("点位"), L.get("没看清")])
            if L.get("没看清"):
                for c in ws2[ws2.max_row]:
                    c.fill = 橙

    for s in (ws, ws2):
        s.freeze_panes = "A2"
        for col in s.columns:
            s.column_dimensions[col[0].column_letter].width = \
                min(38, max(8, max(len(str(c.value or "")) for c in col) + 2))
    wb.save(出XLSX)

    进 = sum(r.get("进", 0) for r in 结果); 出t = sum(r.get("出", 0) for r in 结果)
    写 = sum(r.get("缓写", 0) for r in 结果); 中 = sum(r.get("缓中", 0) for r in 结果)
    美 = (进 * 进价 + 出t * 出价 + 写 * 进价 * 写倍 + 中 * 进价 * 中倍) / 1e6
    坏 = sum(1 for r in 结果 if r.get("错") or r.get("校验"))
    print("\n" + "=" * 46)
    print("已写入 %d 行 × %d 列 → %s" % (len(结果), len(头), 出XLSX))
    print("异常 %d 份（红=没跑成，橙=校验对不上，明细页橙=数字没看清）" % 坏)
    print("token 进 %s / 出 %s　缓存写 %s / 命中 %s" %
          (f"{进:,}", f"{出t:,}", f"{写:,}", f"{中:,}"))
    print("实花约 $%.2f（约 ¥%.1f）%s" % (
        美, 美 * 汇率,
        "　缓存省了约 $%.2f" % (中 * 进价 * (1 - 中倍) / 1e6) if 中 else ""))


# ── 入口 ────────────────────────────────────────────────────────────
def main():
    a = sys.argv[1:]
    限 = 999999
    if "--限" in a:
        限 = int(a[a.index("--限") + 1])

    if "--收" in a:
        写xlsx(收货(密钥())); return

    条, 提示词 = 准备(限)
    if not 条:
        sys.exit("一份单都没找到，检查 单据根 那行路径")
    请求们 = [建请求(x, 提示词) for x in 条 if x["路"] != "读不了"]
    读不了 = [x for x in 条 if x["路"] == "读不了"]
    认表, 全量, 进, 出, 美 = 估价(请求们)
    批 = 分批(请求们)

    print("\n" + "=" * 46)
    print("要跑 %d 份：认表(便宜路) %d / 全量(图片PDF) %d%s" %
          (len(请求们), 认表, 全量, "　本地读不了 %d 份" % len(读不了) if 读不了 else ""))
    print("分 %d 个 batch 提交" % len(批))
    print("模型 %s　缓存档 %s（提示词排最前，%d 份共用同一段前缀）" % (模型, 缓存档, len(请求们)))
    print("粗估 token 进 ~%s / 出 ~%s" % (f"{进:,}", f"{出:,}"))
    print("粗估 **$%.2f（约 ¥%.0f）** —— 已按 Batch 五折算，没算缓存省的那部分" % (美, 美 * 汇率))
    print("=" * 46)

    if "--跑" not in a:
        print("\n这是干跑，一个请求都没发。确认没问题就：")
        print("    python batch_backfill.py --跑")
        return

    print("\n提交中…")
    提交(请求们, 密钥())
    print("\n已提交。Batch 最长 24 小时，多数 1 小时内完。回来收货：")
    print("    python batch_backfill.py --收")


if __name__ == "__main__":
    main()
