---
name: one-copy-of-match-logic
description: 匹配逻辑只准有一份（引擎-匹配.js）；抄本让页面死掉而体检全绿，栽过一次
metadata: 
  node_type: memory
  type: project
  originSessionId: 8b3094cc-fb0c-4063-b02a-1411d98f9149
  modified: 2026-08-01T02:51:20.781Z
---

开单台的匹配逻辑（matchOne / buildIndex / 是否算「工具自己拍板」的名单）
**只准存在于 `引擎-匹配.js`**。页面、体检脚本、对词工具、测试全部调它。

**Why:** 2026-07-31 那版页面里 `core` 变量在赋值前就被 `core.slice()` 用了，
每一行匹配都抛异常 —— 识别功能整个是死的。可体检脚本自己抄了一份 matchOne、
顺序摆对了，于是一路绿灯，差点就推上线。
同一天还因为抄本漏同步，「按最近下单习惯」那一步在页面直接落单、
体检却当它会弹窗问人，**818 条静默认错一条没报出来**。

**How to apply:**
- 上传前跑 `node 全部检查.js`（在 `桌面\食品系统`）。它一并检查：
  六套测试、页面语法与 id、**页面有没有偷偷抄回一份 matchOne**、
  以及 `2-上传网页.bat` 的文件清单有没有漏（漏了线上白屏）。
- 新加 js 文件时，`2-上传网页.bat` 必须同步加，检查脚本会替你把关。
- 判断「哪些结果算工具自己拍板」用 `GM_MATCH.commits(how)`，别在别处另写一份名单。
  相关：[[zero-silent-errors-rule]]
