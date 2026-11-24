#requires -Version 5.1
<#
.SYNOPSIS
    Uji integrasi Audit Log System dan tulis log bukti ke docs/bukti/.

.DESCRIPTION
    Memeriksa seluruh ketentuan Tugas 5:
    - otorisasi admin-only (401 / 403)
    - struktur respons daftar dan detail
    - filter action, targetTable, targetId, userId, from, to
    - validasi page, pageSize, parameter asing, dan from > to
    - audit LOGIN / LOGOUT beserta ip_address, user_agent, result
    - audit mutasi STALLS dan REVIEWS (bonus) secara atomik
    - 404 untuk detail yang tidak ditemukan

    Skrip membuat warung + review uji sendiri lalu menghapusnya lagi.
    Butuh backend + database yang sedang berjalan.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\uji-audit.ps1
#>
[CmdletBinding()]
param(
    [string]$ApiBase = 'http://localhost:3000/api/v1',
    [string]$Origin = 'http://localhost:5173',
    [string]$AdminEmail = 'admin@kantin.test',
    [string]$AdminPassword = 'admin123',
    [string]$OwnerEmail = 'tini@kantin.test',
    [string]$OwnerPassword = 'rahasia123',
    [string]$CustomerEmail = 'bagas@student.test',
    [string]$CustomerPassword = 'rahasia123'
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot 'docs\bukti'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogFile = Join-Path $LogDir "audit-log-$Stamp.txt"
$WorkDir = Join-Path ([IO.Path]::GetTempPath()) "uji-audit-$Stamp"
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

$script:Pass = 0
$script:Fail = 0
$script:Lines = New-Object 'System.Collections.Generic.List[string]'

function Write-Line {
    param([string]$Text, [string]$Color = 'Gray')
    Write-Host $Text -ForegroundColor $Color
    $script:Lines.Add($Text)
}

function Shorten {
    param([string]$Text, [int]$Max = 400)
    if (-not $Text) { return '' }
    $flat = ($Text -replace '\s+', ' ').Trim()
    if ($flat.Length -le $Max) { return $flat }
    return $flat.Substring(0, $Max) + '...'
}

function Save-BodyFile {
    param([string]$Json)
    $file = Join-Path $WorkDir ("body-" + [guid]::NewGuid().ToString('N') + '.json')
    [IO.File]::WriteAllText($file, $Json, (New-Object System.Text.UTF8Encoding($false)))
    return $file
}

function Invoke-Api {
    param(
        [string]$Method = 'GET',
        [string]$Path,
        [string]$Json,
        [string]$CookieFile,
        [switch]$SaveCookies
    )

    $outFile = Join-Path $WorkDir ("out-" + [guid]::NewGuid().ToString('N') + '.json')
    $curlArgs = @('-s', '-S', '-o', $outFile, '-w', '%{http_code}', '--max-time', '20', '-X', $Method)

    if ($CookieFile) {
        $curlArgs += @('-b', $CookieFile)
        if ($SaveCookies) { $curlArgs += @('-c', $CookieFile) }
    }

    if ($Json) {
        $jsonFile = Save-BodyFile $Json
        $curlArgs += @('-H', 'Content-Type: application/json', '-H', "Origin: $Origin", '--data-binary', "@$jsonFile")
    }

    $status = & curl.exe @curlArgs "$ApiBase$Path"
    $body = ''
    if (Test-Path $outFile) { $body = Get-Content -Raw $outFile }
    Remove-Item $outFile -Force -ErrorAction SilentlyContinue

    [pscustomobject]@{
        Status = [int]($status | Select-Object -Last 1)
        Body   = $body
    }
}

function Convert-Body {
    param([string]$Body)
    if ([string]::IsNullOrWhiteSpace($Body)) { return $null }
    try { return ($Body | ConvertFrom-Json) } catch { return $null }
}

function Assert-Status {
    param([string]$Name, [int]$Expected, $Response)
    if ($Response.Status -eq $Expected) {
        $script:Pass++
        Write-Line ("PASS  {0} -> {1}" -f $Name, $Response.Status) 'Green'
    }
    else {
        $script:Fail++
        Write-Line ("FAIL  {0} -> {1} (harus {2})" -f $Name, $Response.Status, $Expected) 'Red'
        Write-Line ("      body: " + (Shorten $Response.Body)) 'DarkGray'
    }
}

function Assert-Equal {
    param([string]$Name, $Expected, $Actual)
    if ("$Expected" -eq "$Actual") {
        $script:Pass++
        Write-Line ("PASS  {0} -> {1}" -f $Name, $Actual) 'Green'
    }
    else {
        $script:Fail++
        Write-Line ("FAIL  {0} -> '{1}' (harus '{2}')" -f $Name, $Actual, $Expected) 'Red'
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

function Login-As {
    param([string]$Name, [string]$Email, [string]$Password)

    $jar = Join-Path $WorkDir "$Name-cookies.txt"
    $json = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $res = Invoke-Api -Method POST -Path '/auth/login' -Json $json -CookieFile $jar -SaveCookies
    Assert-Status "login $Name ($Email)" 200 $res
    return $jar
}

function Get-LogItems {
    param([string]$Query, [string]$CookieFile)
    $res = Invoke-Api -Path "/audit-logs$Query" -CookieFile $CookieFile
    return [pscustomobject]@{ Response = $res; Body = (Convert-Body $res.Body) }
}

# ---------------------------------------------------------------------------
# 0. Pastikan backend hidup
# ---------------------------------------------------------------------------
Write-Line '== Uji Integrasi Audit Log System (Tugas 5) =='
Write-Line ("Waktu  : " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Write-Line ("Target : $ApiBase")
Write-Line ''

$healthBase = ($ApiBase -replace '/api/v1/?$', '')
$health = & curl.exe -s -o NUL -w '%{http_code}' --max-time 5 "$healthBase/health"

if ("$health" -ne '200') {
    Write-Line "Backend tidak merespons (health: $health). Jalankan 'npm start' di folder backend." 'Red'
    $script:Lines | Set-Content -Path $LogFile -Encoding UTF8
    exit 1
}

Write-Line 'PASS  health check backend -> 200' 'Green'
$script:Pass++
Write-Line ''

$adminJar = $null
$ownerJar = $null
$customerJar = $null
$stallId = $null
$reviewId = $null

try {
    # --- Autentikasi -------------------------------------------------------
    $adminJar = Login-As 'admin' $AdminEmail $AdminPassword
    $ownerJar = Login-As 'owner' $OwnerEmail $OwnerPassword
    $customerJar = Login-As 'customer' $CustomerEmail $CustomerPassword

    $me = Convert-Body (Invoke-Api -Path '/auth/me' -CookieFile $adminJar).Body
    $adminId = $me.data.id
    $meOwner = Convert-Body (Invoke-Api -Path '/auth/me' -CookieFile $ownerJar).Body
    $ownerId = $meOwner.data.id
    $meCustomer = Convert-Body (Invoke-Api -Path '/auth/me' -CookieFile $customerJar).Body
    $customerId = $meCustomer.data.id
    Write-Line ''

    # --- Otorisasi ---------------------------------------------------------
    $res = Invoke-Api -Path '/audit-logs'
    Assert-Status 'GET /api/audit-logs tanpa sesi' 401 $res

    $res = Invoke-Api -Path '/audit-logs' -CookieFile $customerJar
    Assert-Status 'GET /api/audit-logs sebagai customer' 403 $res
    Assert-Equal 'code 403 audit' 'FORBIDDEN' (Convert-Body $res.Body).code

    $res = Invoke-Api -Path '/audit-logs/1' -CookieFile $customerJar
    Assert-Status 'GET /api/audit-logs/:id sebagai customer' 403 $res
    Write-Line ''

    # --- Daftar + struktur respons ----------------------------------------
    $list = Get-LogItems '?page=1&pageSize=5' $adminJar
    Assert-Status 'GET /api/audit-logs (admin)' 200 $list.Response
    Assert-Equal 'status respons' 'success' $list.Body.status
    Assert-Equal 'pagination.page' 1 $list.Body.data.pagination.page
    Assert-Equal 'pagination.pageSize' 5 $list.Body.data.pagination.pageSize
    Assert-True 'items berupa array' ($null -ne $list.Body.data.items)
    Assert-True 'pagination.total tersedia' ($null -ne $list.Body.data.pagination.total)
    Assert-True 'pagination.totalPages tersedia' ($null -ne $list.Body.data.pagination.totalPages)

    $first = @($list.Body.data.items)[0]
    Assert-True 'item punya userName' ($null -ne $first.PSObject.Properties['userName'])
    Assert-True 'item punya userEmail' ($null -ne $first.PSObject.Properties['userEmail'])
    Assert-True 'item punya metadata' ($null -ne $first.PSObject.Properties['metadata'])
    Write-Line ''

    # --- Filter userId + targetId (AND) -----------------------------------
    $filtered = Get-LogItems ("?userId={0}&targetId={1}&pageSize=100" -f $adminId, $adminId) $adminJar
    Assert-Status 'GET /api/audit-logs?userId&targetId' 200 $filtered.Response
    $allMatch = $true
    foreach ($item in @($filtered.Body.data.items)) {
        if ($item.userId -ne $adminId -or $item.targetId -ne $adminId) { $allMatch = $false }
    }
    Assert-True 'semua baris cocok userId DAN targetId' $allMatch
    Write-Line ''

    # --- Detail + 404 ------------------------------------------------------
    $detail = Invoke-Api -Path "/audit-logs/$($first.id)" -CookieFile $adminJar
    Assert-Status 'GET /api/audit-logs/:id' 200 $detail
    $detailBody = Convert-Body $detail.Body
    Assert-Equal 'detail id sama dengan daftar' $first.id $detailBody.data.id
    Assert-Equal 'detail action sama dengan daftar' $first.action $detailBody.data.action

    $notFound = Invoke-Api -Path '/audit-logs/999999999' -CookieFile $adminJar
    Assert-Status 'GET /api/audit-logs/:id tidak ada' 404 $notFound
    Assert-Equal 'code 404 audit' 'AUDIT_NOT_FOUND' (Convert-Body $notFound.Body).code
    Write-Line ''

    # --- Validasi query ----------------------------------------------------
    $res = Invoke-Api -Path '/audit-logs?page=0' -CookieFile $adminJar
    Assert-Status 'page=0 ditolak' 400 $res
    Assert-Equal 'code page=0' 'VALIDATION_ERROR' (Convert-Body $res.Body).code

    $res = Invoke-Api -Path '/audit-logs?pageSize=101' -CookieFile $adminJar
    Assert-Status 'pageSize=101 ditolak' 400 $res

    $res = Invoke-Api -Path '/audit-logs?unknownParam=1' -CookieFile $adminJar
    Assert-Status 'parameter asing ditolak' 400 $res

    $res = Invoke-Api -Path '/audit-logs?from=2026-11-20&to=2026-11-10' -CookieFile $adminJar
    Assert-Status 'from > to ditolak' 400 $res

    $res = Invoke-Api -Path '/audit-logs?from=2026-02-30' -CookieFile $adminJar
    Assert-Status 'tanggal tidak ada di kalender ditolak' 400 $res
    Write-Line ''

    # --- Audit LOGIN -------------------------------------------------------
    $loginAudit = Get-LogItems ("?action=LOGIN&userId={0}&pageSize=5" -f $adminId) $adminJar
    Assert-Status 'filter LOGIN admin' 200 $loginAudit.Response
    $loginItem = @($loginAudit.Body.data.items)[0]
    Assert-True 'ada catatan LOGIN admin' ($null -ne $loginItem)
    if ($loginItem) {
        Assert-Equal 'target_table LOGIN' 'USERS' $loginItem.targetTable
        Assert-Equal 'target_id LOGIN = id user' $adminId $loginItem.targetId
        Assert-Equal 'metadata.result LOGIN' 'success' $loginItem.metadata.result
        Assert-True 'metadata.ip_address LOGIN terisi' ([bool]$loginItem.metadata.ip_address)
        Assert-True 'metadata.user_agent LOGIN terisi' ([bool]$loginItem.metadata.user_agent)
    }
    Write-Line ''

    # --- Bonus: mutasi STALLS + REVIEWS -----------------------------------
    $stallName = "Warung Uji Audit $Stamp"
    $json = @{
        name        = $stallName
        category    = 'Uji'
        location    = 'Kantin Uji'
        description = 'Dibuat otomatis oleh scripts/uji-audit.ps1'
    } | ConvertTo-Json -Compress
    $res = Invoke-Api -Method POST -Path '/stalls' -Json $json -CookieFile $ownerJar
    Assert-Status 'POST /stalls (owner)' 201 $res
    $stallId = (Convert-Body $res.Body).data.id
    Assert-True 'warung uji mendapat id' ([bool]$stallId)

    $json = @{ location = "Kantin Uji Lantai 2 $Stamp" } | ConvertTo-Json -Compress
    $res = Invoke-Api -Method PUT -Path "/stalls/$stallId" -Json $json -CookieFile $ownerJar
    Assert-Status 'PUT /stalls/:id (owner)' 200 $res

    $json = @{ rating = 5; comment = "Review uji audit $Stamp" } | ConvertTo-Json -Compress
    $res = Invoke-Api -Method POST -Path "/stalls/$stallId/reviews" -Json $json -CookieFile $customerJar
    Assert-Status 'POST review (customer)' 201 $res
    $reviewId = (Convert-Body $res.Body).data.id
    Assert-True 'review uji mendapat id' ([bool]$reviewId)

    $res = Invoke-Api -Method DELETE -Path "/reviews/$reviewId" -CookieFile $customerJar
    Assert-Status 'DELETE review (customer)' 204 $res

    $res = Invoke-Api -Method DELETE -Path "/stalls/$stallId" -CookieFile $ownerJar
    Assert-Status 'DELETE /stalls/:id (owner)' 200 $res
    $stallId = $null

    $stallAudit = Get-LogItems ("?targetTable=STALLS&targetId={0}&pageSize=100" -f (Convert-Body $res.Body).data.id) $adminJar
    $stallActions = @($stallAudit.Body.data.items | ForEach-Object { $_.action })
    Assert-True 'audit CREATE_STALL ada' ($stallActions -contains 'CREATE_STALL')
    Assert-True 'audit UPDATE_STALL ada' ($stallActions -contains 'UPDATE_STALL')
    Assert-True 'audit DELETE_STALL ada' ($stallActions -contains 'DELETE_STALL')

    $reviewAudit = Get-LogItems ("?targetTable=REVIEWS&targetId={0}&pageSize=100" -f $reviewId) $adminJar
    $reviewActions = @($reviewAudit.Body.data.items | ForEach-Object { $_.action })
    Assert-True 'audit CREATE_REVIEW ada (bonus)' ($reviewActions -contains 'CREATE_REVIEW')
    Assert-True 'audit DELETE_REVIEW ada (bonus)' ($reviewActions -contains 'DELETE_REVIEW')
    Write-Line ''

    # --- Audit LOGOUT ------------------------------------------------------
    $res = Invoke-Api -Method POST -Path '/auth/logout' -CookieFile $adminJar
    Assert-Status 'POST /auth/logout (admin)' 200 $res

    # Login ulang untuk membaca audit setelah cookie lama dihapus.
    $adminJar2 = Login-As 'admin-verify' $AdminEmail $AdminPassword
    $logoutAudit = Get-LogItems ("?action=LOGOUT&userId={0}&pageSize=5" -f $adminId) $adminJar2
    Assert-Status 'filter LOGOUT admin' 200 $logoutAudit.Response
    $logoutItem = @($logoutAudit.Body.data.items)[0]
    Assert-True 'ada catatan LOGOUT admin' ($null -ne $logoutItem)
    if ($logoutItem) {
        Assert-Equal 'target_table LOGOUT' 'USERS' $logoutItem.targetTable
        Assert-Equal 'target_id LOGOUT = id user' $adminId $logoutItem.targetId
        Assert-Equal 'metadata.result LOGOUT' 'success' $logoutItem.metadata.result
        Assert-True 'metadata.ip_address LOGOUT terisi' ([bool]$logoutItem.metadata.ip_address)
        Assert-True 'metadata.user_agent LOGOUT terisi' ([bool]$logoutItem.metadata.user_agent)
    }
}
finally {
    # Bersihkan data uji kalau ada langkah yang gagal di tengah jalan.
    if ($reviewId) {
        Invoke-Api -Method DELETE -Path "/reviews/$reviewId" -CookieFile $customerJar | Out-Null
    }
    if ($stallId) {
        Invoke-Api -Method DELETE -Path "/stalls/$stallId" -CookieFile $ownerJar | Out-Null
    }
}

Write-Line ''
Write-Line ("Selesai: {0} PASS, {1} FAIL" -f $script:Pass, $script:Fail) $(if ($script:Fail -eq 0) { 'Green' } else { 'Red' })
Write-Line ("Log disimpan di: {0}" -f $LogFile)

$script:Lines | Set-Content -Path $LogFile -Encoding UTF8
if ($script:Fail -gt 0) { exit 1 }
