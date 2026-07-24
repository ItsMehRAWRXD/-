#Requires -Version 5.1
<#
.SYNOPSIS
    Runs the RawrZ Agentic Endpoint Validator in batches until all clean
.DESCRIPTION
    Validates all IPC endpoints from main → preload → renderer
    Processes in batches of 20 until all statuses are empty (clean)
.PARAMETER MaxIterations
    Maximum number of validation iterations (default: 10)
.PARAMETER BatchSize
    Number of endpoints per batch (default: 20)
.PARAMETER Watch
    Continuously watch for changes
.PARAMETER NoHeal
    Disable auto-healing
.PARAMETER Quiet
    Minimal output
.EXAMPLE
    .\run-agentic-validator.ps1
    .\run-agentic-validator.ps1 -MaxIterations 5 -BatchSize 10
#>

[CmdletBinding()]
param(
    [int]$MaxIterations = 10,
    [int]$BatchSize = 20,
    [switch]$Watch,
    [switch]$NoHeal,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"

# Colors
$colors = @{
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
    Info = "Cyan"
    Normal = "White"
}

function Write-Status {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $colors[$Color]
}

function Show-Header {
    Clear-Host
    Write-Status "=".PadRight(70, "=") "Info"
    Write-Status "  🔌 RawrZ Agentic Endpoint Validator" "Info"
    Write-Status "  Validates IPC: main → preload → renderer" "Info"
    Write-Status "=".PadRight(70, "=") "Info"
    Write-Status ""
}

function Show-Progress {
    param(
        [int]$Current,
        [int]$Total,
        [int]$Percent
    )
    
    $barLength = 50
    $filled = [math]::Round(($Percent / 100) * $barLength)
    $bar = "█" * $filled + "░" * ($barLength - $filled)
    
    Write-Status "  Progress: [$bar] $Percent%" "Info"
    Write-Status "  Processed: $Current / $Total endpoints" "Normal"
}

function Show-BatchStatus {
    param(
        [int]$Batch,
        [int]$TotalBatches,
        [array]$Results
    )
    
    $clean = ($Results | Where-Object { $_.status -eq "" -or $_.status -eq "CLEAN" }).Count
    $degraded = ($Results | Where-Object { $_.status -eq "DEGRADED" }).Count
    $broken = ($Results | Where-Object { $_.status -eq "BROKEN" -or $_.status -eq "ERROR" }).Count
    
    Write-Status "  Batch $Batch / $TotalBatches Results:" "Info"
    Write-Status "    ✅ Clean: $clean" "Success"
    Write-Status "    ⚠️  Degraded: $degraded" "Warning"
    Write-Status "    ❌ Broken: $broken" "Error"
}

# Main execution
try {
    Show-Header
    
    # Check Node.js
    $nodeVersion = node --version 2>$null
    if (-not $nodeVersion) {
        throw "Node.js is not installed or not in PATH"
    }
    Write-Status "  Node.js version: $nodeVersion" "Info"
    
    # Change to script directory
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    Set-Location $scriptDir
    
    # Build arguments
    $args = @()
    if ($MaxIterations -ne 10) { $args += "--max-iterations=$MaxIterations" }
    if ($BatchSize -ne 20) { $args += "--batch-size=$BatchSize" }
    if ($Watch) { $args += "--watch" }
    if ($NoHeal) { $args += "--no-heal" }
    if ($Quiet) { $args += "--quiet" }
    
    Write-Status "  Starting validation..." "Info"
    Write-Status "  Batch size: $BatchSize" "Normal"
    Write-Status "  Max iterations: $MaxIterations" "Normal"
    Write-Status "  Auto-heal: $(if (-not $NoHeal) { 'Enabled' } else { 'Disabled' })" "Normal"
    Write-Status ""
    
    # Run validator
    $startTime = Get-Date
    
    if ($Quiet) {
        node agentic-validator.js @args
    } else {
        node agentic-validator.js @args | ForEach-Object {
            $line = $_
            
            # Colorize output
            if ($line -match "✅|CLEAN|clean") {
                Write-Status $line "Success"
            } elseif ($line -match "⚠️|DEGRADED|degraded") {
                Write-Status $line "Warning"
            } elseif ($line -match "❌|BROKEN|broken|ERROR") {
                Write-Status $line "Error"
            } elseif ($line -match "🔧|heal|fix") {
                Write-Status $line "Warning"
            } elseif ($line -match "📦|Iteration|Batch") {
                Write-Status $line "Info"
            } elseif ($line -match "📊|Report|FINAL") {
                Write-Status $line "Info"
            } else {
                Write-Host $line
            }
        }
    }
    
    $exitCode = $LASTEXITCODE
    $duration = (Get-Date) - $startTime
    
    Write-Status ""
    Write-Status "  Validation completed in $($duration.ToString('mm\:ss'))" "Info"
    
    if ($exitCode -eq 0) {
        Write-Status "  ✅ All endpoints clean!" "Success"
    } else {
        Write-Status "  ⚠️  Some endpoints require attention" "Warning"
    }
    
    # Show report location
    $reportPath = Join-Path $scriptDir "logs\final-validation-report.json"
    if (Test-Path $reportPath) {
        Write-Status "  📄 Report saved to: $reportPath" "Info"
    }
    
    exit $exitCode
    
} catch {
    Write-Status "  ❌ Error: $_" "Error"
    exit 1
}
