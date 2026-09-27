# Meshwright launcher — Geekatplay Studio.
# Uses the isolated .venv the installer created. The project folder is mobile:
# if it was moved (or the base Python is gone), the environment is recreated
# automatically instead of failing halfway.
$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Definition }

. (Join-Path $root "scripts\Find-Python.ps1")
. (Join-Path $root "scripts\Ensure-Env.ps1")

function Get-MWHealedPython {
    param([string]$Root, [hashtable]$Checked)

    $hintFile = Join-Path $Root ".meshwright-python.txt"
    $hint = ""
    if (Test-Path -LiteralPath $hintFile) {
        try { $hint = (Get-Content -LiteralPath $hintFile -Raw -ErrorAction Stop).Trim() } catch { }
    }

    $installArgs = @('-Recreate', '-SkipComfyUI')
    if ($hint -and (Test-MWPython -Path $hint)) {
        # Same machine, folder just moved: reuse the interpreter it was built with.
        $installArgs += @('-Python', $hint)
    }
    # Otherwise install.ps1 picks the best interpreter on this machine itself.

    Write-Host ""
    Write-Host "Environment needs setup: $($Checked.Reason)." -ForegroundColor Yellow
    Write-Host "Recreating .venv for this location (takes a few minutes, needs internet) ..." -ForegroundColor Yellow
    & (Join-Path $Root "install.ps1") @installArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Automatic setup failed - run install.bat and read install-log.txt." -ForegroundColor Red
        exit 1
    }
    $retried = Test-MWEnv -Root $Root
    if (-not $retried.Ok) {
        Write-Host "Setup finished but the environment still fails: $($retried.Reason)" -ForegroundColor Red
        exit 1
    }
    return $retried.VenvPython
}

$checked = Test-MWEnv -Root $root
if ($checked.Ok) {
    $py = $checked.VenvPython
} else {
    $py = Get-MWHealedPython -Root $root -Checked $checked
}

Write-Host "Launching Meshwright..." -ForegroundColor Green
Write-Host "This window is the activity log - keep it open while you work." -ForegroundColor DarkGray
& $py (Join-Path $root "app.py")
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Meshwright closed with error code $LASTEXITCODE." -ForegroundColor Red
    Write-Host "If a module is missing, run:  .\install.ps1 -Recreate" -ForegroundColor Yellow
}
exit $LASTEXITCODE
