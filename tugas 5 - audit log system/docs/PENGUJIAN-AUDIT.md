# Panduan Pengujian Tugas 5 — Audit Log System

Dokumen ini memetakan **Bagian A/B/C** ke langkah pengujian yang bisa diulang,
lengkap dengan perintah, hasil yang diharapkan, dan query verifikasi database.

- Backend: `http://localhost:3000` (API `http://localhost:3000/api/v1`)
- Frontend: `http://localhost:5173`
- Database: SQL Server `localhost,1433`, database `review_kantin`
- Swagger: `http://localhost:3000/docs`

## 1. Persiapan

```powershell
# 1) Setup database (trigger + permission), jalankan sebagai user ber-DDL
sqlcmd -S localhost,1433 -U sa -P '<password-sa>' -d master -C -i db\03-audit-log-setup.sql

# 2) Backend
cd backend
npm start

# 3) Frontend (terminal lain)
cd frontend
npm run dev
```

Akun uji:

| Peran | Email | Password |
|---|---|---|
| Admin | `admin@kantin.test` | `admin123` |
| Owner | `tini@kantin.test` | `rahasia123` |
| Customer | `bagas@student.test` | `rahasia123` |

## 2. Bukti otomatis

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uji-audit.ps1
```

Skrip memeriksa 401/403, struktur respons, filter, validasi, LOGIN/LOGOUT,
mutasi STALLS + REVIEWS, dan 404. Log tersimpan di
`docs/bukti/audit-log-YYYYMMDD-HHMMSS.txt`. Skrip membersihkan warung/review
uji yang dibuatnya.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uji-trigger.ps1
```

Skrip langsung ke database: memastikan trigger ada, mencoba UPDATE dan DELETE,
lalu memastikan data tidak berubah. Log tersimpan di
`docs/bukti/trigger-append-only-YYYYMMDD-HHMMSS.txt`.

Pengujian unit/integrasi:

```powershell
cd backend
npm run typecheck
npm test          # 83 tes, termasuk trigger append-only & join USERS

cd ..\frontend
npm run lint
npm test          # 15 tes
npm run build
```

## 3. Skenario manual

### Skenario 1 — Audit LOGIN dan LOGOUT

1. Login admin lewat UI atau API.
2. Buka `/admin/audit-logs`.
3. Filter **Aksi = Login**.
4. **Harapan:** muncul baris `LOGIN`, target `USERS #1`, kolom Pelaku berisi
   nama + email dari tabel `USERS`, IP address terisi.
5. Klik **Lihat** → modal memanggil `GET /api/audit-logs/:id` dan menampilkan
   metadata, `ip_address`, serta `user_agent`.
6. Logout, lalu login lagi dan filter **Aksi = Logout**.
7. **Harapan:** baris `LOGOUT` dengan `target_id` = id user, metadata
   `{ role, ip_address, user_agent, result: "success" }`.

Verifikasi SQL:

```sql
SELECT TOP 5 id, user_id, action, target_table, target_id, metadata, created_at
FROM dbo.AUDIT_LOGS
WHERE action IN ('LOGIN','LOGOUT')
ORDER BY id DESC;
```

Pastikan metadata **tidak** memuat password, token, atau isi cookie.

### Skenario 2 — Detail audit + 404

```powershell
$api = 'http://localhost:3000/api/v1'
$tmp = $env:TEMP

# Login admin, simpan cookie
curl.exe -s -c "$tmp\admin.txt" -H "Content-Type: application/json" `
  -H "Origin: http://localhost:5173" `
  -d '{\"email\":\"admin@kantin.test\",\"password\":\"admin123\"}' "$api/auth/login"

# Ambil id terbaru
curl.exe -s -b "$tmp\admin.txt" "$api/audit-logs?page=1&pageSize=1"

# Detail (ganti 1 dengan id yang ada)
curl.exe -s -i -b "$tmp\admin.txt" "$api/audit-logs/1"

# Tidak ditemukan
curl.exe -s -i -b "$tmp\admin.txt" "$api/audit-logs/999999999"
```

**Harapan:**

- Detail → `200`, `{ status: "success", data: { ... } }`, ada `userName` dan
  `userEmail` hasil join.
- Tidak ditemukan → `404`, `code: "AUDIT_NOT_FOUND"`.
- Id bukan angka → `400 VALIDATION_ERROR`.

### Skenario 3 — Filter `targetId` dan `userId`

1. Di UI, isi **User ID** dan **Target ID** (mis. `1` dan `1`) → **Terapkan Filter**.
2. Network: `GET /api/audit-logs?page=1&pageSize=20&userId=1&targetId=1`.
3. **Harapan:** semua baris memiliki `userId = 1` **dan** `targetId = 1`.
4. Tambahkan filter lain (aksi/tanggal) → semuanya digabung dengan AND.

### Skenario 4 — Validasi query

| Request | Harapan |
|---|---|
| `?page=0` | `400`, error field `page` |
| `?page=-1` | `400` |
| `?pageSize=0` | `400` |
| `?pageSize=101` | `400`, error field `pageSize` |
| `?action=<51 karakter>` | `400`, error field `action` |
| `?targetId=0` / `?userId=-2` | `400`, harus bilangan bulat positif |
| `?from=2026-02-30` | `400`, tanggal tidak ada |
| `?from=2026-11-20&to=2026-11-10` | `400`, field `from` |
| `?unknown=1` | `400`, parameter asing |
| `?targetId=abc` | `400` |

Semua error memakai bentuk:

```json
{
  "status": "fail",
  "code": "VALIDATION_ERROR",
  "message": "...",
  "errors": [{ "field": "page", "message": "..." }],
  "requestId": "..."
}
```

### Skenario 5 — Pagination dari hasil filter

1. Filter `action=LOGIN`.
2. Set `pageSize=1`, lalu pindah halaman.
3. **Harapan:** `pagination.total` hanya menghitung baris LOGIN,
   `totalPages = ceil(total / 1)`, dan item di halaman 2 berbeda.
4. Urutan selalu `created_at DESC, id DESC`.

### Skenario 6 — Otorisasi admin-only

```powershell
# Tanpa sesi -> 401 UNAUTHORIZED
curl.exe -s -i "$api/audit-logs"

# Customer -> 403 FORBIDDEN
curl.exe -s -c "$tmp\bagas.txt" -H "Content-Type: application/json" `
  -H "Origin: http://localhost:5173" `
  -d '{\"email\":\"bagas@student.test\",\"password\":\"rahasia123\"}' "$api/auth/login"
curl.exe -s -i -b "$tmp\bagas.txt" "$api/audit-logs"
curl.exe -s -i -b "$tmp\bagas.txt" "$api/audit-logs/1"
```

Di frontend, customer yang membuka `/admin/audit-logs` diarahkan ke
`/forbidden`.

### Skenario 7 — Append-only di database

**Bukti otomatis (disarankan):**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uji-trigger.ps1
```

Skrip membaca kredensial dari `backend/.env`, mengecek trigger, mencoba
UPDATE dan DELETE, lalu memastikan data tidak berubah. Hasilnya 8 PASS dan
log tersimpan di `docs/bukti/trigger-append-only-YYYYMMDD-HHMMSS.txt`.

Contoh output:

```text
PASS  trigger TR_AUDIT_LOGS_AppendOnly ada
PASS  trigger bertipe INSTEAD OF
PASS  UPDATE ditolak trigger (exit 1)
      Msg 50010, Level 16, State 1, Server ..., Procedure TR_AUDIT_LOGS_AppendOnly, Line 8
      AUDIT_LOGS bersifat append-only.
PASS  DELETE ditolak trigger (exit 1)
      Msg 50010, Level 16, State 1, Server ..., Procedure TR_AUDIT_LOGS_AppendOnly, Line 8
      AUDIT_LOGS bersifat append-only.
PASS  jumlah baris tidak berubah
PASS  isi baris target tidak berubah
PASS  tidak ada action HACKED di database
```

**Bukti manual untuk screenshot:**

1. Buka `db/05-verify-append-only.sql` di SSMS.
2. Jalankan seluruh batch.
3. Screenshot tab **Messages** yang memuat dua kali `Msg 50010 ... AUDIT_LOGS
   bersifat append-only.`
4. Screenshot snapshot sebelum/sesudah yang tetap sama.

Atau jalankan langsung:

```powershell
sqlcmd -S localhost,1433 -U praktikum_user -P 'Praktikum2026!' -d review_kantin -C -W `
  -Q "UPDATE dbo.AUDIT_LOGS SET action = 'HACKED' WHERE id = 1;"

sqlcmd -S localhost,1433 -U praktikum_user -P 'Praktikum2026!' -d review_kantin -C -W `
  -Q "DELETE FROM dbo.AUDIT_LOGS WHERE id = 1;"
```

Cek objek database:

```sql
SELECT name, is_instead_of_trigger
FROM sys.triggers
WHERE parent_id = OBJECT_ID('dbo.AUDIT_LOGS');

SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'AUDIT_LOGS'
ORDER BY ORDINAL_POSITION;
```

**Harapan:** trigger `TR_AUDIT_LOGS_AppendOnly` ada, dan kedua pernyataan
UPDATE/DELETE ditolak. Tidak ada endpoint aplikasi untuk mengubah/menghapus
audit.

> Jika `praktikum_user` adalah `db_owner`, `DENY` level objek tidak dievaluasi.
> Jalankan `db\04-restrict-app-user.sql` untuk membuat user aplikasi
> least-privilege (`kantin_app`) yang hanya efektif SELECT + INSERT pada
> `AUDIT_LOGS`.

### Skenario 8 — Bonus audit STALLS (+5)

1. Login owner, buat warung uji, ubah, lalu hapus.
2. Filter **Target Tabel = STALLS** dan **Target ID = id warung uji**.
3. **Harapan:** tiga baris `CREATE_STALL`, `UPDATE_STALL`, `DELETE_STALL`.
4. `UPDATE_STALL` punya metadata `before`, `after`, `changed`.
5. Bukti atomik: matikan insert audit (mis. cabut INSERT sementara) → mutasi
   ikut gagal/rollback, bukan tersimpan tanpa audit.

### Skenario 9 — Bonus audit REVIEWS (+5)

1. Login customer, buka detail warung, tulis review.
2. Hapus review tersebut.
3. Filter **Target Tabel = REVIEWS**.
4. **Harapan:** `CREATE_REVIEW` dan `DELETE_REVIEW`, `user_id` = customer.

## 4. Query verifikasi utama

```sql
-- 10 audit terbaru
SELECT TOP 10 id, user_id, action, target_table, target_id, created_at
FROM dbo.AUDIT_LOGS
ORDER BY created_at DESC, id DESC;

-- Audit autentikasi
SELECT TOP 10 id, user_id, action, target_id, metadata
FROM dbo.AUDIT_LOGS
WHERE action IN ('LOGIN','LOGOUT')
ORDER BY id DESC;

-- Audit mutasi warung
SELECT TOP 10 id, user_id, action, target_id, metadata
FROM dbo.AUDIT_LOGS
WHERE target_table = 'STALLS'
ORDER BY id DESC;

-- Audit mutasi review
SELECT TOP 10 id, user_id, action, target_id, metadata
FROM dbo.AUDIT_LOGS
WHERE target_table = 'REVIEWS'
ORDER BY id DESC;

-- Pastikan userId punya pasangan di USERS (join untuk nama/email)
SELECT a.id, a.user_id, u.name, u.email, a.action, a.target_table, a.created_at
FROM dbo.AUDIT_LOGS a
LEFT JOIN dbo.USERS u ON u.id = a.user_id
ORDER BY a.id DESC;
```

## 5. Daftar bukti minimal

Simpan di `docs/bukti/`:

1. `audit-log-YYYYMMDD-HHMMSS.txt` — hasil `scripts/uji-audit.ps1` (semua PASS).
2. Screenshot `/admin/audit-logs` dengan filter `userId`/`targetId`.
3. Screenshot modal detail: metadata, `ip_address`, `user_agent`.
4. Screenshot baris `LOGIN` dan `LOGOUT`.
5. Screenshot Network `GET /api/audit-logs/:id` → 200.
6. Screenshot 404 untuk id yang tidak ada.
7. Screenshot 400 untuk `page=0`, `pageSize=101`, parameter asing, `from > to`.
8. Screenshot 401 (tanpa sesi) dan 403 (customer/owner).
9. `trigger-append-only-YYYYMMDD-HHMMSS.txt` — hasil `scripts/uji-trigger.ps1`
   (8 PASS) + screenshot SSMS yang menampilkan `Msg 50010 ... AUDIT_LOGS
   bersifat append-only.`
10. Screenshot audit `CREATE_STALL`/`UPDATE_STALL`/`DELETE_STALL` (bonus).
11. Screenshot audit `CREATE_REVIEW`/`DELETE_REVIEW` (bonus).

## 6. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| `GET /audit-logs` 404 | Backend lama / route belum dimuat | Restart `npm start` |
| 401 padahal login | Cookie beda origin | Buka `http://localhost:5173`, bukan `127.0.0.1` |
| 403 `ORIGIN_FORBIDDEN` saat curl | Header Origin tidak cocok | Kirim `-H "Origin: http://localhost:5173"` |
| `userName` null | `user_id` tidak ada di `USERS` | Cek FK / data user; query join |
| Update/delete audit gagal | Memang append-only | Gunakan INSERT saja; itulah bukti yang diharapkan |
| `created_at` tidak UTC | Default constraint lama | Jalankan ulang `db\03-audit-log-setup.sql` |
| `db_owner` membuat DENY tidak berlaku | db_owner bypass permission | Pakai `db\04-restrict-app-user.sql` |
