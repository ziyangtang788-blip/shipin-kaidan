# ============================================================
# 把观麦爬下来的 CSV 转成开单台能直接读的 数据-价格库.js
#
# 用法（以后价格更新了，重跑爬取脚本拿到新 CSV，再跑这个就行）：
#   在这个文件夹里右键 → 用 PowerShell 运行
#   或在终端：powershell -ExecutionPolicy Bypass -File "工具-生成价格库.ps1"
#
# 默认读：下载文件夹里的「观麦_全部报价单_商品价格.csv」
# 输出到：本文件夹的「数据-价格库.js」
# ============================================================

$ErrorActionPreference = "Stop"

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $env:USERPROFILE "Downloads\观麦_全部报价单_商品价格.csv"
$dst  = Join-Path $here "数据-价格库.js"

if (-not (Test-Path $src)) {
  Write-Host "找不到 CSV：$src" -ForegroundColor Red
  Write-Host "请先在观麦跑一次爬取脚本，把 观麦_全部报价单_商品价格.csv 下载到「下载」文件夹。" -ForegroundColor Yellow
  exit 1
}

Write-Host "读取 $src ..." -ForegroundColor Cyan
$rows = Import-Csv $src -Encoding UTF8
Write-Host "共 $($rows.Count) 条" -ForegroundColor Cyan

# --- 客户表（去重，保持出现顺序） ---
$custIdx = @{}
$custs   = New-Object System.Collections.ArrayList
foreach ($r in $rows) {
  $key = $r.报价单ID
  if (-not $custIdx.ContainsKey($key)) {
    $custIdx[$key] = $custs.Count
    [void]$custs.Add(@($r.报价单ID, $r.客户名))
  }
}

# --- 商品名表（去重） ---
$prodIdx = @{}
$prods   = New-Object System.Collections.ArrayList
foreach ($r in $rows) {
  $key = $r.商品名
  if (-not $prodIdx.ContainsKey($key)) {
    $prodIdx[$key] = $prods.Count
    [void]$prods.Add($r.商品名)
  }
}

# --- 明细：[客户序号, 商品序号, 客户叫法, 销售单位, 价格(元), 销售规格, 规格编码, 商品编码, 上架] ---
$items = New-Object System.Collections.ArrayList
foreach ($r in $rows) {
  $price = 0.0
  [double]::TryParse($r.'销售价(元)', [ref]$price) | Out-Null
  [void]$items.Add(@(
    $custIdx[$r.报价单ID],
    $prodIdx[$r.商品名],
    $r.'客户叫法(规格名)',
    $r.销售单位,
    $price,
    $r.销售规格,
    $r.规格编码,
    $r.商品编码,
    $(if ($r.上架状态 -eq '上架') { 1 } else { 0 })
  ))
}

$obj = [ordered]@{
  updated = (Get-Date -Format "yyyy-MM-dd HH:mm")
  custs   = $custs
  prods   = $prods
  items   = $items
}

$json = $obj | ConvertTo-Json -Depth 6 -Compress
$js   = "window.GM_DATA = $json;"

[System.IO.File]::WriteAllText($dst, $js, (New-Object System.Text.UTF8Encoding($true)))

$kb = [math]::Round((Get-Item $dst).Length / 1KB)
Write-Host ""
Write-Host "✅ 已生成 $dst" -ForegroundColor Green
Write-Host "   客户 $($custs.Count) 个 / 商品 $($prods.Count) 种 / 明细 $($items.Count) 条 / 文件 $kb KB" -ForegroundColor Green
Write-Host "   现在双击「配送开单台.html」就能用最新价格了。" -ForegroundColor Green
