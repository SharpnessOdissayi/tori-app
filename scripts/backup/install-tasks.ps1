# Registers the three Windows Scheduled Tasks that drive the backup tiers.
# Run this ONCE from an elevated PowerShell prompt (Run as Administrator).
#
#   .\install-tasks.ps1
#
# Tasks created:
#   KavatiBackupDaily     — 02:00, 10:00, 18:00 every day          (keeps 3)
#   KavatiBackupBiweekly  — 01:30 on the 1st + 15th of the month   (keeps 4)
#   KavatiBackupMonthly   — 00:45 on the 1st of the month          (keeps 12)
#
# Each task runs under the current user and only when the user is logged in.
# Adjust $nodeExe and $repoRoot below if your paths differ.

$ErrorActionPreference = "Stop"

$nodeExe  = (Get-Command node).Source
$repoRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$script   = Join-Path $repoRoot "scripts\backup\backup-db.mjs"

if (-not (Test-Path $script)) { throw "backup-db.mjs not found at $script" }

function Register-Kavati-Task {
    param(
        [string]$Name,
        [string]$Tier,
        [Microsoft.Management.Infrastructure.CimInstance[]]$Triggers
    )
    $action = New-ScheduledTaskAction `
        -Execute $nodeExe `
        -Argument "`"$script`" $Tier" `
        -WorkingDirectory $repoRoot
    $settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1)
    $principal = New-ScheduledTaskPrincipal `
        -UserId "$env:USERDOMAIN\$env:USERNAME" `
        -LogonType Interactive
    if (Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $Name -Confirm:$false
    }
    Register-ScheduledTask `
        -TaskName $Name `
        -Action $action `
        -Trigger $Triggers `
        -Settings $settings `
        -Principal $principal `
        -Description "Kavati DB backup — $Tier tier" | Out-Null
    Write-Host "  ✓ $Name"
}

Write-Host "Installing Kavati backup tasks..."

# Daily — 3 times/day
$dailyTriggers = @(
    New-ScheduledTaskTrigger -Daily -At "02:00"
    New-ScheduledTaskTrigger -Daily -At "10:00"
    New-ScheduledTaskTrigger -Daily -At "18:00"
)
Register-Kavati-Task -Name "KavatiBackupDaily" -Tier "daily" -Triggers $dailyTriggers

# Biweekly — Scheduler has no native "1st + 15th" trigger, so fire daily
# at 01:30 and gate the actual invocation in-script on day 1 or 15.
$biweeklyTriggers = @(New-ScheduledTaskTrigger -Daily -At "01:30")
$biweeklyAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -Command `"if ((Get-Date).Day -in 1,15) { & '$nodeExe' '$script' biweekly }`"" `
    -WorkingDirectory $repoRoot
$biweeklySettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$biweeklyPrincipal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
if (Get-ScheduledTask -TaskName "KavatiBackupBiweekly" -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName "KavatiBackupBiweekly" -Confirm:$false
}
Register-ScheduledTask -TaskName "KavatiBackupBiweekly" `
    -Action $biweeklyAction -Trigger $biweeklyTriggers `
    -Settings $biweeklySettings -Principal $biweeklyPrincipal `
    -Description "Kavati DB backup — biweekly (1st + 15th)" | Out-Null
Write-Host "  ✓ KavatiBackupBiweekly"

# Monthly — 1st of the month, 00:45
$monthlyTrigger = New-ScheduledTaskTrigger -Daily -At "00:45"
$monthlyAction = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -Command `"if ((Get-Date).Day -eq 1) { & '$nodeExe' '$script' monthly }`"" `
    -WorkingDirectory $repoRoot
$monthlySettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$monthlyPrincipal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive
if (Get-ScheduledTask -TaskName "KavatiBackupMonthly" -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName "KavatiBackupMonthly" -Confirm:$false
}
Register-ScheduledTask -TaskName "KavatiBackupMonthly" `
    -Action $monthlyAction -Trigger $monthlyTrigger `
    -Settings $monthlySettings -Principal $monthlyPrincipal `
    -Description "Kavati DB backup — monthly (1st of month)" | Out-Null
Write-Host "  ✓ KavatiBackupMonthly"

Write-Host "`nDone. View in Task Scheduler → Task Scheduler Library."
Write-Host "Test now:  node `"$script`" daily"
