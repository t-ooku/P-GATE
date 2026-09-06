$ErrorActionPreference = 'Stop'

$taskName = 'Project GATE Auto Download'
$task = Get-ScheduledTask -TaskName $taskName

if (-not $task.Triggers -or $task.Triggers.Count -ne 1) {
    throw "Expected exactly one trigger for '$taskName'."
}

$task.Triggers[0].Enabled = $true
$task.Settings.WakeToRun = $true
Set-ScheduledTask -InputObject $task | Out-Null

$verified = Get-ScheduledTask -TaskName $taskName
$info = Get-ScheduledTaskInfo -TaskName $taskName

[PSCustomObject]@{
    TaskName       = $verified.TaskName
    TaskEnabled    = $verified.Settings.Enabled
    TriggerEnabled = $verified.Triggers[0].Enabled
    StartBoundary  = $verified.Triggers[0].StartBoundary
    DaysInterval   = $verified.Triggers[0].DaysInterval
    WakeToRun      = $verified.Settings.WakeToRun
    NextRunTime    = $info.NextRunTime
} | Format-List
