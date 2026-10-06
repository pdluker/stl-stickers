# stickers.stluker.com - one-time setup + deploy (Windows PowerShell 5.1 safe, ASCII only)
# Run from THIS folder (the one containing wrangler.jsonc):   .\setup.ps1
# Re-running is safe: every step checks before creating.

$ErrorActionPreference = 'Stop'
$DbName = 'stickers-db'
$Bucket = 'stl-stickers'
$Site   = 'https://stickers.stluker.com'

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }

# --- 0. Guard against the wrong-folder deploy incident (stl-status Jul 14, stl-intel Jul 23)
if (-not (Test-Path .\wrangler.jsonc) -or -not (Test-Path .\src\worker.js)) {
  throw "Run this from the stl-stickers project root (wrangler.jsonc + src\worker.js not found here)."
}
if (-not (Test-Path .\public\.assetsignore)) { throw "public\.assetsignore is missing (check the leading dot)." }

if (-not (Test-Path .\node_modules\wrangler)) { Step "npm install"; npm install | Out-Host }

# --- 1. D1 database (create if missing, then read its id)
Step "D1 database '$DbName'"
$dbs = npx wrangler d1 list --json | Out-String | ConvertFrom-Json
$db = $dbs | Where-Object { $_.name -eq $DbName }
if (-not $db) {
  npx wrangler d1 create $DbName | Out-Host
  $dbs = npx wrangler d1 list --json | Out-String | ConvertFrom-Json
  $db = $dbs | Where-Object { $_.name -eq $DbName }
}
if (-not $db) { throw "Could not find or create D1 database $DbName" }
$dbId = $db.uuid
Write-Host "database_id = $dbId"

# Patch wrangler.jsonc (UTF-8 without BOM - avoids the PowerShell 5.1 encoding trap)
$cfgPath = (Resolve-Path .\wrangler.jsonc).Path
$cfg = [System.IO.File]::ReadAllText($cfgPath, [System.Text.Encoding]::UTF8)
if ($cfg -match 'SET_BY_SETUP_PS1') {
  $cfg = $cfg.Replace('SET_BY_SETUP_PS1', $dbId)
  [System.IO.File]::WriteAllText($cfgPath, $cfg, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "wrangler.jsonc updated with the real database_id"
}
if ([System.IO.File]::ReadAllText($cfgPath) -match 'SET_BY_SETUP_PS1') { throw "Placeholder still present in wrangler.jsonc - refusing to deploy." }

# --- 2. Schema
Step "Applying schema.sql (idempotent)"
npx wrangler d1 execute $DbName --remote --file=.\schema.sql --yes | Out-Host

# --- 3. R2 bucket
Step "R2 bucket '$Bucket'"
$buckets = npx wrangler r2 bucket list | Out-String
if ($buckets -notmatch "name:\s+$Bucket\b") { npx wrangler r2 bucket create $Bucket | Out-Host } else { Write-Host "exists" }

# --- 4. Deploy (also attaches the stickers.stluker.com custom domain + cron)
Step "Deploying Worker 'stickers'"
npx wrangler deploy | Out-Host

# --- 5. Secrets
Step "Secrets"
$secretList = npx wrangler secret list --format json 2>$null | Out-String
if ($secretList -notmatch 'ANTHROPIC_API_KEY') {
  Write-Host "Paste your Anthropic API key at the prompt (it is not echoed or saved to disk):"
  npx wrangler secret put ANTHROPIC_API_KEY
} else { Write-Host "ANTHROPIC_API_KEY already set" }

$secretFile = '.\.secret.local'
if ($secretList -notmatch 'STICKERS_SECRET') {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLower()
  $secret | npx wrangler secret put STICKERS_SECRET | Out-Host
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) '.secret.local'), $secret, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "STICKERS_SECRET generated and saved to .secret.local (gitignored, never deployed). Do not paste it into chats."
} elseif (Test-Path $secretFile) {
  $secret = ([System.IO.File]::ReadAllText((Resolve-Path $secretFile).Path)).Trim()
} else {
  Write-Host "STICKERS_SECRET exists but .secret.local is missing - skipping first generation. Rotate it with this script after deleting the secret if needed." -ForegroundColor Yellow
  return
}

# --- 6. First sticker (so the site is not empty until tomorrow morning)
Step "Generating today's sticker (image models can take up to a minute)"
Start-Sleep -Seconds 5
try {
  $r = Invoke-RestMethod -Method Post -Uri "$Site/admin/generate" -Headers @{ Authorization = "Bearer $secret" } -TimeoutSec 180
  $r | ConvertTo-Json -Depth 5 | Out-Host
} catch {
  Write-Host "First generation call failed: $($_.Exception.Message)" -ForegroundColor Yellow
  Write-Host "The custom domain can take a few minutes to go live. Retry with: .\generate.ps1"
}
Step "Done. Open $Site"
