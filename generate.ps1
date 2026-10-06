# Manually (re)generate a sticker. Examples:
#   .\generate.ps1                          # today, skipped if it already exists
#   .\generate.ps1 -Date 2026-09-20         # backfill a past day
#   .\generate.ps1 -Date 2026-09-25 -Force  # redo a day (keeps its votes)
param([string]$Date = '', [switch]$Force)
$ErrorActionPreference = 'Stop'
$secret = ([System.IO.File]::ReadAllText((Resolve-Path .\.secret.local).Path)).Trim()
$q = @()
if ($Date)  { $q += "date=$Date" }
if ($Force) { $q += 'force=1' }
$uri = 'https://stickers.stluker.com/admin/generate' + $(if ($q.Count) { '?' + ($q -join '&') } else { '' })
Invoke-RestMethod -Method Post -Uri $uri -Headers @{ Authorization = "Bearer $secret" } -TimeoutSec 180 | ConvertTo-Json -Depth 5
