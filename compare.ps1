# Side-by-side image model test. Generates ONE joke, renders it with each model,
# saves nothing on the site. Output: .\compare\<date>\index.html (opens automatically).
#   .\compare.ps1                                   # today, lucid vs flux2
#   .\compare.ps1 -Date 2026-09-23                  # a die-cut day
#   .\compare.ps1 -Date 2026-09-22 -Models lucid,flux2,schnell
param([string]$Date = '', [string[]]$Models = @('lucid', 'flux2'))
$ErrorActionPreference = 'Stop'
$secret = ([System.IO.File]::ReadAllText((Resolve-Path .\.secret.local).Path)).Trim()
$q = 'models=' + ($Models -join ',')
if ($Date) { $q += "&date=$Date" }
Write-Host "Rendering with $($Models -join ', ') ... (up to ~2 minutes)"
$r = Invoke-RestMethod -Method Post -Uri "https://stickers.stluker.com/admin/compare?$q" -Headers @{ Authorization = "Bearer $secret" } -TimeoutSec 300
if (-not $r.ok) { throw "compare failed: $($r.error)" }

$dir = Join-Path (Get-Location) "compare\$($r.date)"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$enc = New-Object System.Text.UTF8Encoding($false)
$cards = ''
foreach ($x in $r.results) {
  $short = ($x.model -split '/')[-1]
  [System.IO.File]::WriteAllText((Join-Path $dir "$short.svg"), $x.svg, $enc)
  $status = if ($x.ok) { "$([math]::Round($x.ms / 1000, 1))s" } else { "FAILED: $($x.error)" }
  $cards += "<figure><img src='$short.svg'><figcaption><b>$short</b> - $status</figcaption></figure>"
  Write-Host ("{0,-22} {1}" -f $short, $status)
}
$title = [System.Net.WebUtility]::HtmlEncode($r.headline)
$scene = [System.Net.WebUtility]::HtmlEncode($r.scene)
$html = "<!doctype html><meta charset='utf-8'><title>$($r.date) $($r.style)</title>" +
  "<body style='font-family:Segoe UI,sans-serif;background:#1d2026;color:#eee;margin:24px'>" +
  "<h2>$($r.date) - $($r.style) / $($r.topic)</h2><p>$title</p><p style='color:#999'>Scene: $scene</p>" +
  "<p style='color:#999'>Current default chain for this style: $($r.defaultChain -join ' &gt; ')</p>" +
  "<div style='display:flex;gap:24px;flex-wrap:wrap'>$cards</div>" +
  "<style>figure{margin:0;width:min(560px,100%)}img{width:100%}figcaption{margin-top:8px}</style></body>"
[System.IO.File]::WriteAllText((Join-Path $dir 'index.html'), $html, $enc)
Start-Process (Join-Path $dir 'index.html')
