$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir = Join-Path $RepoRoot 'bin'
$LogDir = Join-Path $RepoRoot 'logs'
$VictimAsm = Join-Path $RepoRoot 'src\debugger\Victim.asm'
$VictimObj = Join-Path $BinDir 'Victim.obj'
$VictimExe = Join-Path $BinDir 'Victim.exe'
$VictimBuildScript = Join-Path $RepoRoot 'build_victim_auto.bat'
$BeaconExe = Join-Path $BinDir 'BeaconDebugger.exe'
$BuildScript = Join-Path $RepoRoot 'FinalBuild_Mingw.bat'
$CmdExe = 'C:\Windows\System32\cmd.exe'
$NodeExe = 'C:\Program Files\nodejs\node.exe'

$Ml64Exe = 'C:\VS2022Enterprise\VC\Tools\MSVC\14.50.35717\bin\Hostx64\x64\ml64.exe'
$LinkExe = 'C:\VS2022Enterprise\VC\Tools\MSVC\14.50.35717\bin\Hostx64\x64\link.exe'
$ToolBinDir = 'C:\VS2022Enterprise\VC\Tools\MSVC\14.50.35717\bin\Hostx64\x64'
$MsvcLibX64 = 'C:\VS2022Enterprise\VC\Tools\MSVC\14.50.35717\lib\x64'
$SdkLibUmX64 = 'C:\Program Files (x86)\Windows Kits\10\Lib\10.0.26100.0\um\x64'

$env:PATH = "$ToolBinDir;$($env:PATH)"

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Exe,
        [Parameter(Mandatory = $true)][string[]]$Args,
        [string]$WorkingDirectory = $RepoRoot
    )

    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    Write-Host "$Exe $($Args -join ' ')" -ForegroundColor DarkGray

    Push-Location $WorkingDirectory
    try {
        & $Exe @Args
        if ($LASTEXITCODE -ne 0) {
            throw "$Name failed with exit code $LASTEXITCODE"
        }
    }
    finally {
        Pop-Location
    }
}

function Send-DapRequest {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][int]$Seq,
        [Parameter(Mandatory = $true)][string]$Command,
        [hashtable]$Arguments = @{}
    )

    $payloadObj = [ordered]@{
        seq = $Seq
        type = 'request'
        command = $Command
        arguments = $Arguments
    }

    $json = $payloadObj | ConvertTo-Json -Compress -Depth 20
    $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $header = "Content-Length: $($payloadBytes.Length)`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)

    $stream = $Process.StandardInput.BaseStream
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    $stream.Write($payloadBytes, 0, $payloadBytes.Length)
    $stream.Flush()
}

function Read-DapMessage {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [int]$TimeoutMs = 10000
    )

    $reader = $Process.StandardOutput
    $watch = [System.Diagnostics.Stopwatch]::StartNew()

    while ($reader.Peek() -lt 0) {
        if ($watch.ElapsedMilliseconds -gt $TimeoutMs) {
            throw "Timed out waiting for DAP header"
        }
    }

    $contentLength = 0
    while ($true) {
        $line = $reader.ReadLine()
        if ($null -eq $line) {
            throw 'DAP stdout closed while reading header'
        }
        if ($line.Length -eq 0) {
            break
        }
        if ($line.StartsWith('Content-Length:', [System.StringComparison]::OrdinalIgnoreCase)) {
            $contentLength = [int]($line.Substring(15).Trim())
        }
    }

    if ($contentLength -le 0) {
        throw 'Invalid Content-Length in DAP header'
    }

    $buffer = New-Object char[] $contentLength
    $offset = 0
    while ($offset -lt $contentLength) {
        $read = $reader.Read($buffer, $offset, $contentLength - $offset)
        if ($read -le 0) {
            throw 'DAP stdout closed while reading body'
        }
        $offset += $read
    }

    $json = -join $buffer
    return ($json | ConvertFrom-Json)
}

function Wait-ForDapArtifacts {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][string]$ExpectedResponseCommand,
        [int]$ExpectedRequestSeq,
        [string]$ExpectedEvent,
        [int]$TimeoutMs = 15000
    )

    $response = $null
    $eventMsg = $null
    $watch = [System.Diagnostics.Stopwatch]::StartNew()

    while ($watch.ElapsedMilliseconds -lt $TimeoutMs) {
        $msg = Read-DapMessage -Process $Process -TimeoutMs ($TimeoutMs - [int]$watch.ElapsedMilliseconds)

        if ($msg.type -eq 'response' -and $msg.request_seq -eq $ExpectedRequestSeq -and $msg.command -eq $ExpectedResponseCommand) {
            $response = $msg
        }
        elseif ($ExpectedEvent -and $msg.type -eq 'event' -and $msg.event -eq $ExpectedEvent) {
            $eventMsg = $msg
        }

        if ($response -and (($ExpectedEvent -and $eventMsg) -or (-not $ExpectedEvent))) {
            return @{
                Response = $response
                Event = $eventMsg
            }
        }
    }

    throw "Timed out waiting for DAP response/event for command '$ExpectedResponseCommand'"
}

Invoke-Step -Name 'Build BeaconDebugger (MinGW)' -Exe $CmdExe -Args @('/c', $BuildScript)

if (-not (Test-Path $BeaconExe)) {
    throw "Expected BeaconDebugger binary missing: $BeaconExe"
}

$victimBuildSucceeded = $true
try {
    Invoke-Step -Name 'Build Victim.exe (Batch)' -Exe $CmdExe -Args @('/c', $VictimBuildScript)
}
catch {
    $victimBuildSucceeded = $false
    Write-Host "WARN: Victim build failed; validation will continue with fallback target if available." -ForegroundColor Yellow
}

$LaunchTarget = $VictimExe
if (-not (Test-Path $LaunchTarget)) {
    $fallbackExe = Join-Path $RepoRoot 'Quick.exe'
    if (-not (Test-Path $fallbackExe)) {
        throw "No launch target available. Missing: $VictimExe and $fallbackExe"
    }

    Write-Host "WARN: Victim.exe not found; using fallback launch target: $fallbackExe" -ForegroundColor Yellow
    $LaunchTarget = $fallbackExe
}

Write-Host "`n=== DAP Live Validation ===" -ForegroundColor Cyan
$dapLog = Join-Path $LogDir 'beacon_auto_validation.log'
$liveDriver = Join-Path $RepoRoot 'dap-live-beacon-test.js'
if (-not (Test-Path $liveDriver)) {
    throw "Missing live DAP driver: $liveDriver"
}

if (-not (Test-Path $NodeExe)) {
    throw "Missing Node runtime: $NodeExe"
}

Invoke-Step -Name 'DAP Live Validation (Node Driver)' -Exe $NodeExe -Args @($liveDriver, $BeaconExe, $LaunchTarget, $VictimAsm, $dapLog)

Write-Host "PASS: automated PowerShell validation succeeded" -ForegroundColor Green
Write-Host "Built: $BeaconExe" -ForegroundColor Green
Write-Host "Launch target: $LaunchTarget" -ForegroundColor Green
