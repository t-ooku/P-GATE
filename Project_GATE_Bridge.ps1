[CmdletBinding()]
param(
    [ValidateSet('Install', 'Run', 'Loop', 'Status', 'Uninstall')]
    [string]$Mode = 'Run'
)

$ErrorActionPreference = 'Stop'
$AppName = 'Project GATE Bridge'
$AppDirectory = Join-Path $env:LOCALAPPDATA 'ProjectGATEBridge'
$InstalledScript = Join-Path $AppDirectory 'Project_GATE_Bridge.ps1'
$ConfigPath = Join-Path $AppDirectory 'config.json'
$StatePath = Join-Path $AppDirectory 'state.json'
$LogPath = Join-Path $AppDirectory 'bridge.log'
$PidPath = Join-Path $AppDirectory 'bridge.pid'
$StartupDirectory = [Environment]::GetFolderPath('Startup')
$ShortcutPath = Join-Path $StartupDirectory 'Project GATE Bridge.lnk'

function Ensure-AppDirectory {
    if (-not (Test-Path -LiteralPath $AppDirectory)) {
        New-Item -ItemType Directory -Path $AppDirectory -Force | Out-Null
    }
}

function Write-BridgeLog {
    param(
        [string]$Level,
        [string]$Message
    )
    Ensure-AppDirectory
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'), $Level, $Message
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Show-Message {
    param(
        [string]$Text,
        [string]$Title = $AppName,
        [string]$Icon = 'Information'
    )
    Add-Type -AssemblyName System.Windows.Forms
    $iconValue = [System.Windows.Forms.MessageBoxIcon]$Icon
    [System.Windows.Forms.MessageBox]::Show(
        $Text,
        $Title,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        $iconValue
    ) | Out-Null
}

function Select-Folder {
    param(
        [string]$Description,
        [string]$InitialDirectory = ''
    )
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = $Description
    $dialog.ShowNewFolderButton = $true
    if ($InitialDirectory -and (Test-Path -LiteralPath $InitialDirectory)) {
        $dialog.SelectedPath = $InitialDirectory
    }
    $result = $dialog.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
        return $null
    }
    return $dialog.SelectedPath
}

function Save-JsonAtomically {
    param(
        [string]$Path,
        [object]$Value
    )
    $temporaryPath = $Path + '.tmp'
    $Value | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
}

function Read-Config {
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        throw '設定がありません。Install_Project_GATE_Bridge.cmdを実行してください。'
    }
    $config = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if (-not $config.sourceFolder -or -not $config.destinationFolder) {
        throw '設定ファイルに同期元または同期先がありません。再インストールしてください。'
    }
    return $config
}

function Read-State {
    $state = @{}
    if (-not (Test-Path -LiteralPath $StatePath)) {
        return $state
    }
    try {
        $saved = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($null -ne $saved) {
            foreach ($property in $saved.PSObject.Properties) {
                $state[$property.Name] = [string]$property.Value
            }
        }
    }
    catch {
        Write-BridgeLog 'WARN' ('state.jsonを読み取れないため空の状態から継続します: ' + $_.Exception.Message)
    }
    return $state
}

function New-InitialState {
    param([string]$SourceFolder)
    $state = @{}
    $existingZipFiles = Get-ChildItem -LiteralPath $SourceFolder -File -Filter '*.zip' -ErrorAction Stop
    foreach ($file in $existingZipFiles) {
        try {
            $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
            $state[$hash] = (Get-Date).ToString('o') + '|baseline|' + $file.Name
        }
        catch {
            Write-BridgeLog 'WARN' ('既存ZIPの初期記録に失敗: ' + $file.Name + ' / ' + $_.Exception.Message)
        }
    }
    return $state
}

function Test-FileReady {
    param([System.IO.FileInfo]$File)
    if ($File.LastWriteTime -gt (Get-Date).AddSeconds(-30)) {
        return $false
    }
    try {
        $stream = [System.IO.File]::Open(
            $File.FullName,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::None
        )
        $stream.Close()
        return $true
    }
    catch {
        return $false
    }
}

function Get-AvailableDestinationPath {
    param(
        [string]$DestinationFolder,
        [System.IO.FileInfo]$SourceFile,
        [string]$SourceHash
    )
    $candidate = Join-Path $DestinationFolder $SourceFile.Name
    if (-not (Test-Path -LiteralPath $candidate)) {
        return $candidate
    }
    try {
        $destinationHash = (Get-FileHash -LiteralPath $candidate -Algorithm SHA256).Hash
        if ($destinationHash -eq $SourceHash) {
            return $null
        }
    }
    catch {
        # Google Driveが同期中の場合は別名へ退避する。
    }
    $suffix = Get-Date -Format 'yyyyMMddHHmmss'
    return Join-Path $DestinationFolder ($SourceFile.BaseName + '__' + $suffix + $SourceFile.Extension)
}

function Invoke-BridgeSync {
    $config = Read-Config
    if (-not (Test-Path -LiteralPath $config.sourceFolder)) {
        Write-BridgeLog 'WARN' ('同期元が利用できません: ' + $config.sourceFolder)
        return
    }
    if (-not (Test-Path -LiteralPath $config.destinationFolder)) {
        Write-BridgeLog 'WARN' ('同期先が利用できません: ' + $config.destinationFolder)
        return
    }

    $sourceResolved = (Resolve-Path -LiteralPath $config.sourceFolder).Path.TrimEnd('\')
    $destinationResolved = (Resolve-Path -LiteralPath $config.destinationFolder).Path.TrimEnd('\')
    if ($sourceResolved -eq $destinationResolved) {
        throw '同期元と同期先に同じフォルダが指定されています。'
    }

    $state = Read-State
    $changed = $false
    $zipFiles = Get-ChildItem -LiteralPath $sourceResolved -File -Filter '*.zip' -ErrorAction Stop |
        Sort-Object LastWriteTime, Name

    foreach ($file in $zipFiles) {
        if (-not (Test-FileReady -File $file)) {
            Write-BridgeLog 'INFO' ('書込完了待ち: ' + $file.Name)
            continue
        }

        try {
            $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
            if ($state.ContainsKey($hash)) {
                continue
            }

            $destinationPath = Get-AvailableDestinationPath `
                -DestinationFolder $destinationResolved `
                -SourceFile $file `
                -SourceHash $hash

            if ($null -eq $destinationPath) {
                $state[$hash] = (Get-Date).ToString('o') + '|' + $file.Name
                $changed = $true
                continue
            }

            $temporaryPath = Join-Path $destinationResolved ('.projectgate-uploading-' + [Guid]::NewGuid().ToString('N') + '.tmp')
            Copy-Item -LiteralPath $file.FullName -Destination $temporaryPath -Force
            $copied = Get-Item -LiteralPath $temporaryPath
            if ($copied.Length -ne $file.Length) {
                Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
                throw 'コピー後のファイルサイズが一致しません。'
            }
            Move-Item -LiteralPath $temporaryPath -Destination $destinationPath -Force
            $state[$hash] = (Get-Date).ToString('o') + '|' + $file.Name
            $changed = $true
            Write-BridgeLog 'INFO' ('転送成功: ' + $file.Name + ' -> ' + $destinationPath)
        }
        catch {
            Write-BridgeLog 'ERROR' ('転送失敗: ' + $file.Name + ' / ' + $_.Exception.Message)
        }
    }

    if ($changed) {
        Save-JsonAtomically -Path $StatePath -Value $state
    }
}

function New-StartupShortcut {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = (Get-Command powershell.exe).Source
    $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $InstalledScript + '" -Mode Loop'
    $shortcut.WorkingDirectory = $AppDirectory
    $shortcut.WindowStyle = 7
    $shortcut.Description = 'OneDriveのZIPをProject GATEのGoogle Drive入力へ転送します。'
    $shortcut.Save()
}

function Install-Bridge {
    Ensure-AppDirectory
    $oneDriveInitial = $env:OneDrive
    $sourceFolder = Select-Folder `
        -Description '1/2: Amazon出品システムのZIPが保存されるOneDriveフォルダを選択してください。' `
        -InitialDirectory $oneDriveInitial
    if (-not $sourceFolder) {
        Show-Message 'インストールをキャンセルしました。' $AppName 'Warning'
        return
    }

    $destinationFolder = Select-Folder `
        -Description '2/2: Google Driveの「Project GATE\01_Input_Zip」フォルダを選択してください。'
    if (-not $destinationFolder) {
        Show-Message 'インストールをキャンセルしました。' $AppName 'Warning'
        return
    }

    $sourceResolved = (Resolve-Path -LiteralPath $sourceFolder).Path.TrimEnd('\')
    $destinationResolved = (Resolve-Path -LiteralPath $destinationFolder).Path.TrimEnd('\')
    if ($sourceResolved -eq $destinationResolved) {
        Show-Message '同期元と同期先には別のフォルダを選択してください。' $AppName 'Error'
        return
    }

    Copy-Item -LiteralPath $PSCommandPath -Destination $InstalledScript -Force
    Save-JsonAtomically -Path $ConfigPath -Value ([ordered]@{
        sourceFolder = $sourceResolved
        destinationFolder = $destinationResolved
        intervalMinutes = 5
        installedAt = (Get-Date).ToString('o')
    })
    if (-not (Test-Path -LiteralPath $StatePath)) {
        $initialState = New-InitialState -SourceFolder $sourceResolved
        Save-JsonAtomically -Path $StatePath -Value $initialState
    }
    New-StartupShortcut
    Write-BridgeLog 'INFO' ('インストール完了: ' + $sourceResolved + ' -> ' + $destinationResolved)

    $powershellPath = (Get-Command powershell.exe).Source
    Start-Process `
        -FilePath $powershellPath `
        -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', ('"' + $InstalledScript + '"'), '-Mode', 'Loop') `
        -WindowStyle Hidden

    Show-Message (
        "インストールが完了しました。`r`n`r`n" +
        "同期元: $sourceResolved`r`n" +
        "同期先: $destinationResolved`r`n`r`n" +
        '新しいZIPを5分ごとに確認します。'
    )
}

function Start-BridgeLoop {
    Ensure-AppDirectory
    if (Test-Path -LiteralPath $PidPath) {
        $existingPid = Get-Content -LiteralPath $PidPath -Raw -ErrorAction SilentlyContinue
        if ($existingPid -and (Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue)) {
            return
        }
    }
    Set-Content -LiteralPath $PidPath -Value $PID -Encoding ASCII
    try {
        Write-BridgeLog 'INFO' 'バックグラウンド監視を開始しました。'
        while ($true) {
            try {
                Invoke-BridgeSync
            }
            catch {
                Write-BridgeLog 'ERROR' ('同期サイクル失敗: ' + $_.Exception.Message)
            }
            Start-Sleep -Seconds 300
        }
    }
    finally {
        Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
    }
}

function Show-BridgeStatus {
    $message = "インストールされていません。"
    if (Test-Path -LiteralPath $ConfigPath) {
        $config = Read-Config
        $running = $false
        if (Test-Path -LiteralPath $PidPath) {
            $currentPid = Get-Content -LiteralPath $PidPath -Raw -ErrorAction SilentlyContinue
            $running = [bool]($currentPid -and (Get-Process -Id ([int]$currentPid) -ErrorAction SilentlyContinue))
        }
        $message = (
            "状態: " + $(if ($running) { '実行中' } else { '停止中' }) + "`r`n`r`n" +
            "同期元: $($config.sourceFolder)`r`n" +
            "同期先: $($config.destinationFolder)`r`n`r`n" +
            "ログ: $LogPath"
        )
    }
    Show-Message $message
}

function Uninstall-Bridge {
    if (Test-Path -LiteralPath $PidPath) {
        $currentPid = Get-Content -LiteralPath $PidPath -Raw -ErrorAction SilentlyContinue
        if ($currentPid) {
            Stop-Process -Id ([int]$currentPid) -Force -ErrorAction SilentlyContinue
        }
        Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $ShortcutPath -Force -ErrorAction SilentlyContinue
    Write-BridgeLog 'INFO' '自動起動を解除しました。'
    Show-Message (
        "Project GATE Bridgeを停止し、自動起動を解除しました。`r`n" +
        "設定とログは次に残しています:`r`n$AppDirectory"
    )
}

try {
    switch ($Mode) {
        'Install' { Install-Bridge }
        'Run' { Invoke-BridgeSync }
        'Loop' { Start-BridgeLoop }
        'Status' { Show-BridgeStatus }
        'Uninstall' { Uninstall-Bridge }
    }
}
catch {
    Write-BridgeLog 'ERROR' $_.Exception.Message
    if ($Mode -ne 'Loop') {
        Show-Message $_.Exception.Message $AppName 'Error'
    }
    exit 1
}
