#Requires -Version 5.1
<#
.SYNOPSIS
    Red Room hackathon run plan: start the backend (uvicorn) on this laptop and
    expose it with a public cloudflared quick tunnel, then print the public URL.

.DESCRIPTION
    Run from anywhere (paths are resolved relative to this script):

        powershell -ExecutionPolicy Bypass -File backend\scripts\start_tunnel.ps1

    What it does:
      1. Starts `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000`
         from backend\ and waits for GET /health.
      2. Starts `cloudflared tunnel --url http://localhost:8000` and waits for
         the https://<id>.trycloudflare.com URL in its log.
      3. Prints the public URL and the two env vars you must update with it:
             NEXT_PUBLIC_BACKEND_URL   (frontend, rebuild/redeploy after)
             CLERK_AUTHORIZED_PARTIES  (backend .env, comma-separated azp values:
                                        keep the Vercel origin, add the tunnel URL)

    Prereqs: uv (winget install astral-sh.uv), cloudflared
    (winget install Cloudflare.cloudflared), a filled repo-root .env.

    Stop with Ctrl+C — both child processes are killed on exit.

    Never prints or logs secrets; the tunnel URL is not a secret.
#>

$ErrorActionPreference = "Stop"

$BackendDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RepoRoot   = Split-Path -Parent $BackendDir
$Port       = 8000
$LogFile    = Join-Path ([System.IO.Path]::GetTempPath()) "redroom-cloudflared.log"

$uvicornProc = $null
$cfProc      = $null

function Stop-Children {
    foreach ($p in @($cfProc, $uvicornProc)) {
        if ($p -and -not $p.HasExited) {
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

# Ctrl+C / script exit -> kill both children
trap { Stop-Children; break }
Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action { Stop-Children } | Out-Null

Write-Host "== Red Room: backend + cloudflared tunnel ==" -ForegroundColor Cyan
Write-Host "backend dir : $BackendDir"
Write-Host "repo root   : $RepoRoot (.env is read from here)"

# --- 1. uvicorn -------------------------------------------------------------
Write-Host "`n[1/3] Starting uvicorn on http://localhost:$Port ..."
$uvicornProc = Start-Process -FilePath "uv" `
    -ArgumentList @("run", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$Port") `
    -WorkingDirectory $BackendDir `
    -PassThru -WindowStyle Hidden

$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$Port/health" -UseBasicParsing -TimeoutSec 2
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
}
if (-not $healthy) {
    Write-Host "uvicorn did not answer /health in time — see its window. Continuing anyway." -ForegroundColor Yellow
} else {
    Write-Host "      backend healthy (pid $($uvicornProc.Id))"
}

# --- 2. cloudflared quick tunnel --------------------------------------------
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "`ncloudflared not found. Install once with:  winget install Cloudflare.cloudflared" -ForegroundColor Red
    Stop-Children
    exit 1
}

Write-Host "`n[2/3] Starting cloudflared quick tunnel (log: $LogFile) ..."
Remove-Item $LogFile -ErrorAction SilentlyContinue
# cloudflared prints the public URL into its log; tee keeps the console clean-ish
$cfProc = Start-Process -FilePath "cloudflared" `
    -ArgumentList @("tunnel", "--url", "http://localhost:$Port") `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput $LogFile -RedirectStandardError $LogFile

$publicUrl = $null
for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $LogFile) {
        $m = Select-String -Path $LogFile -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' |
             Select-Object -First 1
        if ($m) { $publicUrl = $m.Matches.Value; break }
    }
}

# --- 3. report ---------------------------------------------------------------
Write-Host "`n[3/3] Public URL" -ForegroundColor Cyan
if ($publicUrl) {
    Write-Host ""
    Write-Host "    $publicUrl" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps (docs/DEPLOY.md):"
    Write-Host "  1. Frontend env:  NEXT_PUBLIC_BACKEND_URL=$publicUrl   (then vercel env pull / redeploy)"
    Write-Host "  2. Backend .env:  CLERK_AUTHORIZED_PARTIES=<vercel-origin>,$publicUrl"
    Write-Host "  3. Restart uvicorn so the new CLERK_AUTHORIZED_PARTIES is picked up."
    Write-Host "  4. Add the Vercel origin to CORS allow_origins in backend/app/main.py."
} else {
    Write-Host "    tunnel URL not detected yet — check:  Get-Content $LogFile" -ForegroundColor Yellow
}

Write-Host "`nPress Ctrl+C to stop uvicorn + cloudflared."
while ($true) { Start-Sleep -Seconds 5 }
