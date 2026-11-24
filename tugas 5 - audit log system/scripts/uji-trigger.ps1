#requires -Version 5.1
<#
.SYNOPSIS
    Membuktikan trigger TR_AUDIT_LOGS_AppendOnly menolak UPDATE dan DELETE.

.DESCRIPTION
    Skrip ini:
    1. Membaca kredensial database dari backend/.env
    2. Memastikan trigger append-only ada
    3. Mencatat snapshot jumlah baris + satu baris audit
    4. Mencoba UPDATE pada AUDIT_LOGS  -> harus gagal dengan error 50010
    5. Mencoba DELETE pada AUDIT_LOGS  -> harus gagal dengan error 50010
    6. Memastikan snapshot tidak berubah (tidak ada baris yang terhapus/berubah)
    7. Menyimpan seluruh bukti ke docs/bukti/trigger-append-only-YYYYMMDD-HHMMSS.txt

    Butuh SQL Server yang berjalan dan file backend/.env yang valid.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\uji-trigger.ps1
#>
[CmdletBinding()]
param(
    [string]$EnvFile = ''
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not $EnvFile) {
    $EnvFile = Join-Path $ProjectRoot 'backend\.env'
}

$LogDir = Join-Path $ProjectRoot 'docs\bukti'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogFile = Join-Path $LogDir "trigger-append-only-$Stamp.txt"

$script:Pass = 0
$script:Fail = 0
$script:Lines = New-Object 'System.Collections.Generic.List[string]'

function Write-Line {
    param([string]$Text, [string]$Color = 'Gray')
    Write-Host $Text -ForegroundColor $Color
    $script:Lines.Add($Text)
}

function Get-EnvValue {
    param([string]$Path, [string]$Key)

    if (-not (Test-Path $Path)) {
        throw "File .env tidak ditemukan: $Path"
    }

    $line = Get-Content -Path $Path |
        Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } |
        Select-Object -Last 1

    if (-not $line) {
        throw "Key $Key tidak ada di $Path"
    }

    $value = ($line -split '=', 2)[1].Trim()
    if ($value.Length -ge 2 -and (
            ($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))
        )) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
}

function Invoke-Sql {
    param([string]$Query)

    $raw = & sqlcmd @script:SqlArgs -Q $Query 2>&1
    $exitCode = $LASTEXITCODE
    $output = ($raw | Out-String).Trim()

    [pscustomobject]@{
        ExitCode = $exitCode
        Output   = $output
    }
}

function Assert-True {
    param([string]$Name, [bool]$Condition)
    if ($Condition) {
        $script:Pass++
        Write-Line ("PASS  {0}" -f $Name) 'Green'
    }
    else {
        $script:Fail++
        Write-Line ("FAIL  {0}" -f $Name) 'Red'
    }
}

function Assert-TriggerRejected {
    param([string]$Name, [string]$Output, [int]$ExitCode)

    $containsCode = $Output -match '50010'
    $containsMessage = $Output -match 'append-only'

    if ($containsCode -or $containsMessage) {
        $script:Pass++
        Write-Line ("PASS  {0} ditolak trigger (exit {1})" -f $Name, $ExitCode) 'Green'
        foreach ($line in ($Output -split "`r?`n")) {
            if (-not [string]::IsNullOrWhiteSpace($line)) {
                Write-Line ("      {0}" -f $line.Trim()) 'DarkGray'
            }
        }
    }
    else {
        $script:Fail++
        Write-Line ("FAIL  {0} TIDAK ditolak trigger (exit {1})" -f $Name, $ExitCode) 'Red'
        Write-Line ("      output: {0}" -f $Output) 'DarkGray'
    }
}

# ---------------------------------------------------------------------------
# 0. Baca konfigurasi
# ---------------------------------------------------------------------------
if (-not (Get-Command sqlcmd -ErrorAction SilentlyContinue)) {
    Write-Host 'sqlcmd tidak ditemukan. Pasang SQL Server Command Line Utilities.' -ForegroundColor Red
    exit 1
}

$DbServer = Get-EnvValue $EnvFile 'DB_SERVER'
$DbPort = Get-EnvValue $EnvFile 'DB_PORT'
$DbUser = Get-EnvValue $EnvFile 'DB_USER'
$DbPassword = Get-EnvValue $EnvFile 'DB_PASSWORD'
$DbName = Get-EnvValue $EnvFile 'DB_NAME'
$DbTrust = Get-EnvValue $EnvFile 'DB_TRUST_SERVER_CERTIFICATE'

$script:SqlArgs = @(
    '-S', "$DbServer,$DbPort",
    '-U', $DbUser,
    '-P', $DbPassword,
    '-d', $DbName,
    '-W',
    '-s', '|',
    '-b'
)
if ($DbTrust -eq 'true') {
    $script:SqlArgs += '-C'
}

Write-Line '== Bukti Trigger Append-Only AUDIT_LOGS =='
Write-Line ("Waktu    : " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Line ("Database : $DbName @ $DbServer,$DbPort")
Write-Line ("User     : $DbUser")
Write-Line ''

# ---------------------------------------------------------------------------
# 1. Koneksi + trigger
# ---------------------------------------------------------------------------
$connection = Invoke-Sql "SELECT DB_NAME() AS currentDatabase;"
if ($connection.ExitCode -ne 0) {
    Write-Line 'Gagal terhubung ke database.' 'Red'
    Write-Line $connection.Output 'DarkGray'
    $script:Lines | Set-Content -Path $LogFile -Encoding UTF8
    exit 1
}
Write-Line 'PASS  koneksi database' 'Green'
$script:Pass++

$trigger = Invoke-Sql @"
SELECT name, is_instead_of_trigger
FROM sys.triggers
WHERE parent_id = OBJECT_ID('dbo.AUDIT_LOGS');
"@
Write-Line ''
Write-Line 'Trigger pada dbo.AUDIT_LOGS:' 'Cyan'
Write-Line $trigger.Output
Assert-True 'trigger TR_AUDIT_LOGS_AppendOnly ada' ($trigger.Output -match 'TR_AUDIT_LOGS_AppendOnly')
Assert-True 'trigger bertipe INSTEAD OF' ($trigger.Output -match '\|\s*1\s*$' -or $trigger.Output -match 'TR_AUDIT_LOGS_AppendOnly\|\s*1')
Write-Line ''

# ---------------------------------------------------------------------------
# 2. Snapshot sebelum
# ---------------------------------------------------------------------------
$targetRow = Invoke-Sql @"
SELECT TOP 1 id, action, target_table, target_id
FROM dbo.AUDIT_LOGS
ORDER BY id;
"@
Write-Line 'Baris audit yang akan dicoba diubah/dihapus:' 'Cyan'
Write-Line $targetRow.Output

$idLine = @($targetRow.Output -split "`r?`n" | Where-Object { $_ -match '\S' }) | Select-Object -Last 1
$targetId = 1
if ($idLine) {
    $firstCell = ($idLine -split '\|')[0].Trim()
    if ($firstCell -match '^\d+$') { $targetId = [int]$firstCell }
}

$countBefore = Invoke-Sql "SELECT COUNT(*) AS total FROM dbo.AUDIT_LOGS;"
$beforeCountValue = (($countBefore.Output -split "`r?`n")[-1] -replace '[^\d]', '')
$rowBefore = Invoke-Sql "SELECT action, target_table, target_id, created_at FROM dbo.AUDIT_LOGS WHERE id = $targetId;"
Write-Line ("Target id: {0}" -f $targetId)
Write-Line ("Jumlah baris sebelum: {0}" -f $beforeCountValue)
Write-Line ''

# ---------------------------------------------------------------------------
# 3. UPDATE harus ditolak
# ---------------------------------------------------------------------------
Write-Line 'Percobaan 1: UPDATE dbo.AUDIT_LOGS SET action = ''HACKED''' 'Cyan'
$update = Invoke-Sql "UPDATE dbo.AUDIT_LOGS SET action = 'HACKED' WHERE id = $targetId;"
Assert-TriggerRejected 'UPDATE' $update.Output $update.ExitCode
Write-Line ''

# ---------------------------------------------------------------------------
# 4. DELETE harus ditolak
# ---------------------------------------------------------------------------
Write-Line 'Percobaan 2: DELETE FROM dbo.AUDIT_LOGS' 'Cyan'
$delete = Invoke-Sql "DELETE FROM dbo.AUDIT_LOGS WHERE id = $targetId;"
Assert-TriggerRejected 'DELETE' $delete.Output $delete.ExitCode
Write-Line ''

# ---------------------------------------------------------------------------
# 5. Snapshot setelah: data tidak berubah
# ---------------------------------------------------------------------------
$countAfter = Invoke-Sql "SELECT COUNT(*) AS total FROM dbo.AUDIT_LOGS;"
$afterCountValue = (($countAfter.Output -split "`r?`n")[-1] -replace '[^\d]', '')
$rowAfter = Invoke-Sql "SELECT action, target_table, target_id, created_at FROM dbo.AUDIT_LOGS WHERE id = $targetId;"

Write-Line 'Verifikasi data tidak berubah:' 'Cyan'
Write-Line ("Jumlah baris sesudah: {0}" -f $afterCountValue)
Write-Line ("Baris id {0} sesudah:" -f $targetId)
Write-Line $rowAfter.Output
Assert-True 'jumlah baris tidak berubah' ("$beforeCountValue" -eq "$afterCountValue")
Assert-True 'isi baris target tidak berubah' ($rowBefore.Output -eq $rowAfter.Output)
Assert-True 'tidak ada action HACKED di database' (-not $rowAfter.Output.Contains('HACKED'))
Write-Line ''

Write-Line ("Selesai: {0} PASS, {1} FAIL" -f $script:Pass, $script:Fail) $(if ($script:Fail -eq 0) { 'Green' } else { 'Red' })
Write-Line ("Log disimpan di: {0}" -f $LogFile)

$script:Lines | Set-Content -Path $LogFile -Encoding UTF8
if ($script:Fail -gt 0) { exit 1 }
