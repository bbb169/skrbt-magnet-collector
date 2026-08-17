$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$serviceDirectory = Join-Path $projectRoot 'local-service'
$pythonPath = Join-Path $serviceDirectory '.venv\Scripts\python.exe'
$appPath = Join-Path $serviceDirectory 'app.py'
$healthUrl = 'http://127.0.0.1:8765/health'

if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
    throw "Pronunciation service Python was not found at $pythonPath."
}

$listeners = @(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 3
    }
    catch {
        throw 'Port 8765 is occupied by a service that could not be identified.'
    }

    if ($health.provider -ne 'mcp-server-pronunciation') {
        throw 'Port 8765 is occupied by a different service.'
    }

    $listeners.OwningProcess | Sort-Object -Unique | ForEach-Object {
        Stop-Process -Id $_ -ErrorAction Stop
    }
}

$serviceProcess = Start-Process `
    -FilePath $pythonPath `
    -ArgumentList $appPath `
    -WorkingDirectory $serviceDirectory `
    -WindowStyle Hidden `
    -PassThru

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($serviceProcess.HasExited) {
        throw "Pronunciation service exited with code $($serviceProcess.ExitCode)."
    }

    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        if ($health.status -eq 'ok' -and $health.provider -eq 'mcp-server-pronunciation') {
            Write-Output "Pronunciation service restarted (PID $($serviceProcess.Id))."
            exit 0
        }
    }
    catch {
        Start-Sleep -Milliseconds 200
    }
}

Stop-Process -Id $serviceProcess.Id -ErrorAction SilentlyContinue
throw 'Pronunciation service did not become healthy after restart.'
