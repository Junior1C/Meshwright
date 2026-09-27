# Meshwright — portable-environment helper (Geekatplay Studio).
#
# A .venv records absolute paths (pyvenv.cfg's home, the console-script
# shebangs), so moving the project folder can leave a stale environment
# behind: the old path still runs sometimes, pip breaks, reinstalls get
# confused. To make the folder mobile:
#
#   * install.ps1 stamps .venv\.meshwright-root.txt with the folder it was
#     built in, and .meshwright-python.txt with the interpreter it used;
#   * Test-MWEnv below compares the stamp with the current folder and probes
#     that the interpreter actually runs;
#   * start.ps1 self-heals (recreates .venv) instead of failing.
#
# Dot-source this file for the function, or run it as a check:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\Ensure-Env.ps1
# Exit code 0 = usable, 1 = run install.bat (with -Recreate after a move).

$here = Split-Path -Parent $MyInvocation.MyCommand.Definition
. (Join-Path $here "Find-Python.ps1")

function Test-MWEnv {
    <#
      Check the .venv belonging to $Root.
      Returns @{ Ok = $true; VenvPython = <path> } or
              @{ Ok = $false; VenvPython = <path>; Reason = <text> }.
    #>
    param([Parameter(Mandatory)][string]$Root)

    $venv = Join-Path $Root ".venv"
    $vpy = Join-Path $venv "Scripts\python.exe"

    if (-not (Test-Path -LiteralPath $vpy -PathType Leaf)) {
        return @{ Ok = $false; VenvPython = $vpy; Reason = "no .venv yet" }
    }

    # Moved folder? The stamp from install time disagrees with where we are.
    $markerFile = Join-Path $venv ".meshwright-root.txt"
    if (Test-Path -LiteralPath $markerFile) {
        $marked = ""
        try { $marked = (Get-Content -LiteralPath $markerFile -Raw -ErrorAction Stop).Trim() } catch { }
        if ($marked -and ($marked.TrimEnd('\') -ine $Root.TrimEnd('\'))) {
            return @{ Ok = $false; VenvPython = $vpy;
                      Reason = "folder moved (was: $marked)" }
        }
    }

    # The base interpreter may be gone (uninstalled, path changed).
    try {
        $cfg = Get-Content -LiteralPath (Join-Path $venv "pyvenv.cfg") -ErrorAction Stop
        $homeLine = $cfg | Where-Object { $_ -match '^\s*home\s*=' } | Select-Object -First 1
        if ($homeLine) {
            $homeDir = ($homeLine -split '=', 2)[1].Trim()
            if ($homeDir -and -not (Test-Path -LiteralPath $homeDir)) {
                return @{ Ok = $false; VenvPython = $vpy;
                          Reason = "base Python is gone ($homeDir)" }
            }
        }
    } catch { }

    # And the interpreter itself must actually run, not just exist.
    $r = Invoke-MWNative -Exe $vpy -Arguments @('--version') -TimeoutSeconds 60
    if ($r.ExitCode -ne 0) {
        return @{ Ok = $false; VenvPython = $vpy; Reason = "interpreter does not run" }
    }

    return @{ Ok = $true; VenvPython = $vpy; Reason = "" }
}

# Direct run = single check against the project folder above scripts\.
if ($MyInvocation.InvocationName -ne '.') {
    if ($Check) { exit 0 }  # reserved for future flags; a bare run checks
    $root = Split-Path -Parent $here
    $t = Test-MWEnv -Root $root
    if ($t.Ok) {
        Write-Host "Environment OK: $($t.VenvPython)"
        exit 0
    }
    Write-Host "Environment needs setup: $($t.Reason). Run install.bat (add -Recreate after a move)."
    exit 1
}
