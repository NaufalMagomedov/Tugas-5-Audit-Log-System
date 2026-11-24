#requires -Version 5.1
<#
.SYNOPSIS
    Uji integrasi API Review Kantin dan tulis log bukti ke docs/bukti/.

.DESCRIPTION
    Memeriksa status code endpoint utama sesuai skenario pengujian:
    login 3 role, GET /auth/me, GET /stalls, GET /stalls/:id, CRUD warung
    oleh admin dan owner, serta penanganan 401/403.

    Skrip membuat warung uji sendiri lalu menghapusnya lagi, sehingga data
    demo tidak berubah. Butuh backend + database yang sedang berjalan.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\uji-api.ps1
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
    [string]$CustomerPassword = 'rahasia123',
    # Warung milik owner lain (default: id 2 milik inah@kantin.test).
    [int]$OtherOwnerStallId = 2
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot 'docs\bukti'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogFile = Join-Path $LogDir "api-log-$Stamp.txt"
$WorkDir = Join-Path ([IO.Path]::GetTempPath()) "uji-api-$Stamp"
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
    # UTF-8 tanpa BOM agar curl membaca JSON apa adanya.
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

# ---------------------------------------------------------------------------
# 0. Pastikan backend hidup
# ---------------------------------------------------------------------------
Write-Line '== Uji Integrasi API Review Kantin =='
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

$adminStallId = $null
$ownerStallId = $null
$adminJar = $null
$ownerJar = $null

try {
    $adminJar = Login-As 'admin' $AdminEmail $AdminPassword
    $ownerJar = Login-As 'owner' $OwnerEmail $OwnerPassword
    $customerJar = Login-As 'customer' $CustomerEmail $CustomerPassword
    Write-Line ''

    # --- Auth & sesi -------------------------------------------------------
    $res = Invoke-Api -Path '/auth/me' -CookieFile $adminJar
    Assert-Status 'GET /auth/me (admin)' 200 $res
    $me = Convert-Body $res.Body
    Assert-Equal 'role pada /auth/me' 'admin' $me.data.role
    Assert-Equal 'email pada /auth/me' $AdminEmail $me.data.email

    $res = Invoke-Api -Path '/auth/me'
    Assert-Status 'GET /auth/me tanpa sesi' 401 $res
    Assert-Equal 'code 401' 'UNAUTHORIZED' (Convert-Body $res.Body).code

    $res = Invoke-Api -Path '/stalls/mine'
    Assert-Status 'GET /stalls/mine tanpa sesi' 401 $res
    Write-Line ''

    # --- Daftar & detail ---------------------------------------------------
    $res = Invoke-Api -Path '/stalls?limit=3'
    Assert-Status 'GET /stalls' 200 $res
    $list = Convert-Body $res.Body
    Assert-True 'GET /stalls mengembalikan data' ([bool]($list.data) -and (@($list.data).Count -gt 0))

    $res = Invoke-Api -Path '/stalls/1'
    Assert-Status 'GET /stalls/1' 200 $res
    $detail = Convert-Body $res.Body
    Assert-True 'detail warung punya nama' ([bool]$detail.data.name)

    $res = Invoke-Api -Path '/stalls/99999'
    Assert-Status 'GET /stalls/99999 (tidak ada)' 404 $res
    Assert-Equal 'code 404 warung' 'STALL_NOT_FOUND' (Convert-Body $res.Body).code
    Write-Line ''

    # --- Admin CRUD --------------------------------------------------------
    $adminStallName = "Warung Uji API $Stamp"
    $json = @{
        name        = $adminStallName
        category    = 'Uji'
        location    = 'Kantin Uji'
        description = 'Dibuat otomatis oleh scripts/uji-api.ps1'
    } | ConvertTo-Json -Compress

    $res = Invoke-Api -Method POST -Path '/stalls' -Json $json -CookieFile $adminJar
    Assert-Status 'POST /stalls (admin)' 201 $res
    $adminStallId = (Convert-Body $res.Body).data.id
    Assert-True 'warung admin mendapat id' ([bool]$adminStallId)

    $newLocation = "Kantin Uji Lantai 2 $Stamp"
    $json = @{ location = $newLocation } | ConvertTo-Json -Compress
    $res = Invoke-Api -Method PUT -Path "/stalls/$adminStallId" -Json $json -CookieFile $adminJar
    Assert-Status 'PUT /stalls/:id (admin)' 200 $res

    # Verifikasi lewat GET: bukan hanya respons PUT yang berubah.
    $res = Invoke-Api -Path "/stalls/$adminStallId"
    $updated = Convert-Body $res.Body
    Assert-Equal 'lokasi tersimpan di backend' $newLocation $updated.data.location

    $res = Invoke-Api -Method DELETE -Path "/stalls/$adminStallId" -CookieFile $adminJar
    Assert-Status 'DELETE /stalls/:id (admin)' 200 $res
    if ($res.Status -eq 200) { $adminStallId = $null }
    Write-Line ''

    # --- Otorisasi customer ------------------------------------------------
    $res = Invoke-Api -Path '/admin/reports' -CookieFile $customerJar
    Assert-Status 'GET /admin/reports (customer)' 403 $res
    Assert-Equal 'code 403 role' 'FORBIDDEN' (Convert-Body $res.Body).code

    $json = @{ name = "Warung Customer $Stamp" } | ConvertTo-Json -Compress
    $res = Invoke-Api -Method POST -Path '/stalls' -Json $json -CookieFile $customerJar
    Assert-Status 'POST /stalls (customer)' 403 $res
    Write-Line ''

    # --- Otorisasi owner lain ---------------------------------------------
    $json = @{ name = "Coba Ubah $Stamp" } | ConvertTo-Json -Compress
    $res = Invoke-Api -Method PUT -Path "/stalls/$OtherOwnerStallId" -Json $json -CookieFile $ownerJar
    Assert-Status 'PUT warung owner lain' 403 $res
    Assert-Equal 'code STALL_FORBIDDEN' 'STALL_FORBIDDEN' (Convert-Body $res.Body).code

    $res = Invoke-Api -Method DELETE -Path "/stalls/$OtherOwnerStallId" -CookieFile $ownerJar
    Assert-Status 'DELETE warung owner lain' 403 $res
    Write-Line ''

    # --- Owner CRUD warung miliknya (opsi A) ------------------------------
    $json = @{
        name     = "Warung Uji Owner $Stamp"
        category = 'Uji'
        location = 'Kantin Uji'
    } | ConvertTo-Json -Compress

    $res = Invoke-Api -Method POST -Path '/stalls' -Json $json -CookieFile $ownerJar
    Assert-Status 'POST /stalls (owner)' 201 $res
    $ownerStallId = (Convert-Body $res.Body).data.id
    Assert-True 'warung owner mendapat id' ([bool]$ownerStallId)

    $json = @{ location = 'Kantin Uji Owner' } | ConvertTo-Json -Compress
    $res = Invoke-Api -Method PUT -Path "/stalls/$ownerStallId" -Json $json -CookieFile $ownerJar
    Assert-Status 'PUT warung milik owner' 200 $res

    $res = Invoke-Api -Method DELETE -Path "/stalls/$ownerStallId" -CookieFile $ownerJar
    Assert-Status 'DELETE warung milik owner (opsi A)' 200 $res
    if ($res.Status -eq 200) { $ownerStallId = $null }
}
catch {
    $script:Fail++
    Write-Line ("ERROR: " + $_.Exception.Message) 'Red'
}
finally {
    # Bersihkan warung uji kalau ada langkah yang gagal di tengah jalan.
    if ($adminStallId -and $adminJar) {
        Invoke-Api -Method DELETE -Path "/stalls/$adminStallId" -CookieFile $adminJar | Out-Null
        Write-Line "INFO  membersihkan warung uji admin id $adminStallId" 'DarkGray'
    }
    if ($ownerStallId -and $ownerJar) {
        Invoke-Api -Method DELETE -Path "/stalls/$ownerStallId" -CookieFile $ownerJar | Out-Null
        Write-Line "INFO  membersihkan warung uji owner id $ownerStallId" 'DarkGray'
    }

    Remove-Item $WorkDir -Recurse -Force -ErrorAction SilentlyContinue

    Write-Line ''
    Write-Line ("Ringkasan: {0} PASS, {1} FAIL" -f $script:Pass, $script:Fail) $(if ($script:Fail -eq 0) { 'Green' } else { 'Red' })
    Write-Line ("Log      : " + $LogFile)
    $script:Lines | Set-Content -Path $LogFile -Encoding UTF8
}

if ($script:Fail -gt 0) { exit 1 }
exit 0
