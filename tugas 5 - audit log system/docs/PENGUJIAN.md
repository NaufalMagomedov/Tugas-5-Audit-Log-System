# Panduan Pengujian — Review Kantin (Hands-on 3)

> **Tugas 5 (Audit Log System):** panduan khusus ada di
> [`PENGUJIAN-AUDIT.md`](./PENGUJIAN-AUDIT.md).

Dokumen ini memetakan **E. Pengujian Wajib**, **Bukti implementasi**, dan **Bukti integrasi** ke langkah manual yang bisa diulang, lengkap dengan hasil yang diharapkan, perintah API, query database, dan daftar screenshot.

- Backend: `http://localhost:3000` (API `http://localhost:3000/api/v1`, Swagger `http://localhost:3000/docs`)
- Frontend: `http://localhost:5173`
- Database: SQL Server `localhost,1433`, database `review_kantin`
- Kredensial DB ada di `backend/.env`

## 1. Akun uji

| Peran | Email | Password | Catatan |
|---|---|---|---|
| Admin | `admin@kantin.test` | `admin123` | Bisa kelola semua warung |
| Owner | `tini@kantin.test` | `rahasia123` | Punya warung id 1, 12, 15 |
| Owner lain | `inah@kantin.test` | `rahasia123` | Punya warung id 2 (untuk uji akses silang) |
| Customer | `bagas@student.test` | `rahasia123` | Tidak boleh mengelola warung |

> Owner lain bisa dipakai kalau password-nya berbeda; untuk uji akses silang cukup login sebagai `tini` lalu menembak warung id 2 milik `inah` lewat API.

## 2. Ringkasan kesiapan

| No | Skenario wajib | Status | Bukti utama |
|---|---|---|---|
| 1 | Daftar warung dari backend | Siap | `GET /stalls` di beranda |
| 2 | Detail warung | Siap | `GET /stalls/:id` + menu + review |
| 3 | Admin tambah/ubah/hapus warung | Siap | Panel Admin: **Tambah warung**, **Kelola**, **Hapus** |
| 4 | Owner membuat & mengubah warung miliknya | Siap | `/owner` + `POST/PUT /stalls` |
| 5 | Owner tidak bisa mengubah warung owner lain | Siap (backend) | `403 STALL_FORBIDDEN` |
| 6 | Aturan hapus warung | Siap (opsi A) | Owner boleh hapus miliknya; owner lain `403` |
| 7 | Registrasi & login | Siap | `/register`, `/login` |
| 8 | `GET /auth/me` | Siap | Dipanggil saat aplikasi dimuat + header |
| 9 | Belum login akses fitur terlindungi | Siap | Redirect `/login` |
| 10 | Respons 401 & 403 | Siap | Interceptor, halaman `/forbidden`, kode error |
| 11 | Loading, empty, error state | Siap | Komponen `LoadingPanel`, `EmptyState`, `ErrorPanel` |
| 12 | Perubahan tersimpan di database | Siap | Verifikasi SQL sebelum/sesudah |

**Catatan poin 6:** backend proyek ini **mengizinkan owner menghapus warung miliknya sendiri** (`canManageStall`) dan tetap menolak `403 STALL_FORBIDDEN` untuk warung owner lain. Jadi yang dibuktikan adalah: *owner hanya bisa menghapus warung miliknya; selain itu ditolak*. Jika dosen mensyaratkan hapus hanya untuk admin, ubah `authorize('owner', 'admin')` pada route `DELETE /stalls/:id` menjadi `authorize('admin')` dan sembunyikan tombol Hapus di `/owner`.

## 3. Persiapan

1. Jalankan backend:
   ```powershell
   cd backend
   npm start
   ```
   Cek `http://localhost:3000/health` → `200` dan `{ "status": "success" }`.

2. Jalankan frontend:
   ```powershell
   cd frontend
   npm run dev
   ```
   Buka `http://localhost:5173`.

3. Di browser, buka **DevTools → Network**, centang **Preserve log**. Setiap bukti integrasi diambil dari sini (URL, method, status, response JSON).

4. Siapkan terminal database:
   ```powershell
   sqlcmd -S localhost,1433 -U praktikum_user -P 'Praktikum2026!' -d review_kantin -C -W -s "|" `
     -Q "SELECT id, name, category, location, owner_id FROM STALLS ORDER BY id DESC"
   ```

5. (Opsional) jalankan pengujian otomatis yang sudah ada:
   ```powershell
   cd backend  && npm run typecheck && npm test      # 57 tes
   cd frontend && npm run lint && npm test && npm run build  # 15 tes
   ```

## 4. Langkah pengujian manual (12 skenario)

### Skenario 1 — Daftar warung dari backend
1. Buka `http://localhost:5173`.
2. Di Network, cari `GET /stalls?page=1&limit=...`.
3. **Harapan:** status `200`, response `{ status: "success", meta: {...}, data: [...] }`, kartu warung tampil dengan gambar, kategori, lokasi, dan rating.
4. Coba pencarian/kategori; perhatikan request `GET /stalls?search=...` ikut berubah.

**Bukti:** screenshot beranda + panel Network yang menunjuk request `GET /stalls` 200.

### Skenario 2 — Detail warung
1. Klik salah satu kartu (mis. warung id 1) → URL `/stalls/1`.
2. Network akan menampilkan `GET /stalls/1`, `GET /stalls/1/menus`, `GET /stalls/1/reviews`.
3. **Harapan:** semuanya `200`; cover, deskripsi, daftar menu, dan review tampil.
4. Coba buka `/stalls/99999` → panel **“Warung tidak ditemukan”** (404 `STALL_NOT_FOUND`), bukan halaman kosong.

**Bukti:** screenshot halaman detail + Network `GET /stalls/1` 200 dan screenshot 404.

### Skenario 3 — Admin tambah, ubah, hapus warung
1. Login `admin@kantin.test` / `admin123` → diarahkan ke `/admin`.
2. **Tambah:** klik **Tambah warung**, isi nama (mis. `Warung Uji Admin`), kategori, lokasi, deskripsi; klik **Simpan**.
   - Network: `POST /stalls` → **201**.
   - Toast sukses, baris baru muncul di tabel, statistik **Warung** bertambah.
   - Catatan: backend menetapkan `owner_id` dari sesi, jadi warung itu tercatat milik akun admin.
3. **Ubah:** klik ikon pensil (**Kelola**) pada warung tersebut → **Ubah warung** → ubah lokasi → **Simpan**.
   - Network: `PUT /stalls/:id` → **200**.
   - Halaman publik `/stalls/:id` menampilkan nilai baru setelah refresh.
4. **Hapus:** kembali ke `/admin`, klik ikon tempat sampah pada warung uji → konfirmasi.
   - Network: `DELETE /stalls/:id` → **200** (body berisi data warung yang dihapus).
   - Baris hilang, statistik berkurang.
5. **Error state (opsional):** coba hapus warung yang masih punya menu/review → **409** `STALL_HAS_RELATIONS` dengan pesan yang jelas di dialog.

**Bukti:** screenshot form tambah, hasil `POST` 201, `PUT` 200, `DELETE` 200, dan baris sebelum/sesudah.

### Skenario 4 — Owner membuat & mengubah warung miliknya
1. Login `tini@kantin.test` / `rahasia123` → `/owner`.
2. Klik **Tambah warung**, isi data, simpan → `POST /stalls` **201**, kartu baru muncul.
3. Klik **Ubah** pada kartu → ubah nama/lokasi/foto → simpan → `PUT /stalls/:id` **200**.
4. **Harapan:** hanya warung milik `tini` (id 1, 12, 15, dan warung baru) yang tampil.

**Bukti:** screenshot dashboard owner + Network `POST` 201 dan `PUT` 200.

### Skenario 5 — Owner tidak bisa mengubah warung owner lain
Tidak ada tombol di UI untuk ini (memang tidak boleh), jadi buktikan lewat API/Swagger:

```powershell
$api = 'http://localhost:3000/api/v1'
$tmp = $env:TEMP
curl.exe -s -c "$tmp\tini.txt" -H "Content-Type: application/json" -H "Origin: http://localhost:5173" `
  -d '{\"email\":\"tini@kantin.test\",\"password\":\"rahasia123\"}' "$api/auth/login"

curl.exe -s -i -X PUT -b "$tmp\tini.txt" -H "Content-Type: application/json" -H "Origin: http://localhost:5173" `
  -d '{\"name\":\"Coba Ubah\"}' "$api/stalls/2"
```

**Harapan:** `403` dengan `code: "STALL_FORBIDDEN"` dan pesan *“Kamu hanya bisa mengubah warung milikmu sendiri.”*

**Bukti:** screenshot respons 403 di terminal atau tab Network.

### Skenario 6 — Aturan hapus warung (opsi A)
1. **Owner menghapus warung miliknya:** login `tini`, buat warung uji baru (tanpa menu/review), lalu klik **Hapus** di `/owner` → `DELETE /stalls/:id` **200**.
2. **Owner menghapus warung orang lain:** lewat API seperti skenario 5:
   ```powershell
   curl.exe -s -i -X DELETE -b "$tmp\tini.txt" -H "Origin: http://localhost:5173" "$api/stalls/2"
   ```
   **Harapan:** `403` `STALL_FORBIDDEN`.
3. Warung yang masih punya relasi → `409` `STALL_HAS_RELATIONS`.

**Bukti:** screenshot 200 (milik sendiri), 403 (milik orang lain), 409 (masih berelasi).

### Skenario 7 — Registrasi dan login
1. Buka `/register`, isi nama/email baru/password (min. 8 karakter, ada huruf dan angka), konfirmasi.
2. Network: `POST /auth/register` → **201**; diarahkan ke `/login` dengan pesan sukses.
3. Login dengan akun baru → `POST /auth/login` → **200**.
4. Cek **DevTools → Application → Cookies**: ada cookie `kantin_session_ho3` dengan `HttpOnly`.
5. Coba login password salah → pesan error, tidak ada cookie baru.

**Bukti:** screenshot halaman register, login sukses, dan cookie httpOnly.

### Skenario 8 — `GET /auth/me`
1. Setelah login, refresh halaman.
2. Network: `GET /auth/me` → **200**, body berisi `{ id, name, email, role }`.
3. Header menampilkan nama + peran; menu navigasi berubah sesuai role (`Dashboard Warung` untuk owner, `Panel Admin` untuk admin).
4. Buka `/profile` → `GET /auth/profile` **200** (data terbaru dari database).

**Bukti:** screenshot Network `GET /auth/me` 200 + header/profile.

### Skenario 9 — Belum login mengakses fitur terlindungi
1. Logout.
2. Buka `/owner` → dialihkan ke `/login`; setelah login sebagai owner, kembali ke `/owner` (state `from`).
3. Buka `/admin` → juga dialihkan ke `/login`.
4. Buka detail warung, bagian tulis review → muncul ajakan **“Masuk untuk menulis review.”**

**Bukti:** screenshot redirect + URL `from` + ajakan login.

### Skenario 10 — Penanganan 401 dan 403
| Kondisi | Request | Harapan |
|---|---|---|
| Tanpa sesi | `GET /auth/me` | **401** `UNAUTHORIZED` |
| Tanpa sesi | `GET /stalls/mine` | **401** `UNAUTHORIZED` |
| Customer | `GET /admin/reports` | **403** `FORBIDDEN` |
| Customer | `POST /stalls` | **403** `FORBIDDEN` |
| Owner lain | `PUT /stalls/2` | **403** `STALL_FORBIDDEN` |
| Login sebagai customer lalu buka `/admin` | route guard | halaman **`/forbidden`** |
| Sesi kedaluwarsa saat memakai aplikasi | endpoint terlindungi | interceptor menghapus user → kembali ke kondisi belum login |

```powershell
# 401 tanpa cookie
curl.exe -i "$api/stalls/mine"

# 403 sebagai customer
curl.exe -s -c "$tmp\bagas.txt" -H "Content-Type: application/json" -H "Origin: http://localhost:5173" `
  -d '{\"email\":\"bagas@student.test\",\"password\":\"rahasia123\"}' "$api/auth/login"
curl.exe -s -i -b "$tmp\bagas.txt" "$api/admin/reports"
curl.exe -s -i -b "$tmp\bagas.txt" -H "Content-Type: application/json" -H "Origin: http://localhost:5173" `
  -d '{\"name\":\"Warung Customer\"}' "$api/stalls"
```

**Bukti:** screenshot status 401/403 + body error yang memuat `code` dan `requestId`.

### Skenario 11 — Loading, empty, error state
| State | Cara memunculkan | Yang tampil |
|---|---|---|
| Loading | DevTools → Network → throttling **Slow 3G**, reload `/` | Panel “Memuat daftar warung...” |
| Empty (pencarian) | Cari kata `zzzz` | **“Warung tidak ditemukan”** + saran coba kata kunci lain |
| Empty (review) | Buka warung yang belum punya review | **“Belum ada review”** |
| Empty (menu) | Warung tanpa menu di halaman detail | **“Belum ada menu”** |
| Empty (owner) | Owner yang belum punya warung (setelah menghapus warung uji terakhir) | **“Belum ada warung”** |
| Error jaringan | Matikan backend (Ctrl+C), reload `/` | **“Server tidak dapat dihubungi”** + tombol **Coba lagi** |
| Error 5xx | (Opsional) `POST /api/v1/dev/force-error` lewat curl | Panel error + **Kode laporan** (`requestId`) |

**Bukti:** tiga screenshot: loading, empty, error.

### Skenario 12 — Perubahan benar-benar tersimpan di database
1. Catat kondisi awal:
   ```powershell
   sqlcmd -S localhost,1433 -U praktikum_user -P 'Praktikum2026!' -d review_kantin -C -W -s "|" `
     -Q "SELECT id, name, location, owner_id FROM STALLS ORDER BY id DESC"
   ```
2. Tambah/ubah warung lewat UI.
3. Jalankan query yang sama (atau `WHERE id = <ID>`).
4. **Harapan:** baris baru/kolom yang berubah benar-benar ada di database — bukan sekadar perubahan state React.
5. Hapus warung lewat UI → jalankan query lagi → baris hilang.

**Bukti:** screenshot query SQL sebelum & sesudah + response Network `201/200/200`.

## 5. Skrip bukti API otomatis

Skrip ini menjalankan seluruh pemeriksaan status code di atas, mencetak `PASS`/`FAIL`, dan menulis log ke `docs/bukti/`.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\uji-api.ps1
```

Yang diperiksa:

- `POST /auth/login` untuk admin, owner, customer
- `GET /auth/me` (200) dan tanpa sesi (401)
- `GET /stalls` (200), `GET /stalls/:id` (200)
- Admin `POST` (201) → `PUT` (200) → `GET` verifikasi → `DELETE` (200)
- Customer `GET /admin/reports` (403) dan `POST /stalls` (403)
- Owner ubah/hapus warung owner lain (403 `STALL_FORBIDDEN`)
- Owner tambah → ubah → hapus warung miliknya sendiri (201/200/200)
- Pembersihan otomatis: warung uji yang dibuat skrip selalu dihapus di akhir

Log tersimpan di `docs/bukti/api-log-YYYYMMDD-HHMMSS.txt`.

## 6. Daftar screenshot minimal

Simpan di `docs/bukti/` (atau tempel ke laporan):

1. `01-daftar-warung.png` — beranda + Network `GET /stalls` 200
2. `02-detail-warung.png` — `/stalls/1` + Network `GET /stalls/1` 200
3. `03-detail-404.png` — `/stalls/99999`
4. `04-admin-panel.png` — tabel warung + tombol Tambah/Kelola/Hapus
5. `05-admin-tambah.png` — form tambah + `POST /stalls` 201
6. `06-admin-ubah.png` — form ubah + `PUT /stalls/:id` 200
7. `07-admin-hapus.png` — konfirmasi + `DELETE /stalls/:id` 200
8. `08-owner-dashboard.png` — `/owner` + warung milik sendiri
9. `09-owner-tambah-ubah.png` — form + `POST`/`PUT`
10. `10-owner-403.png` — respons `403 STALL_FORBIDDEN` (ubah/hapus warung owner lain)
11. `11-register-login.png` — `/register`, `/login`, cookie httpOnly
12. `12-auth-me.png` — Network `GET /auth/me` 200 + header
13. `13-redirect-login.png` — akses `/owner` tanpa login
14. `14-forbidden.png` — customer membuka `/admin`
15. `15-loading.png`, `16-empty.png`, `17-error.png`
16. `18-sql-sebelum.png`, `19-sql-sesudah.png`

## 7. Jika ada masalah

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| Semua request gagal / “Server tidak dapat dihubungi” | Backend mati | `cd backend && npm start` |
| `401` padahal sudah login | Cookie diblokir / frontend beda origin | Pastikan buka lewat `http://localhost:5173`, bukan `127.0.0.1` |
| `403 ORIGIN_FORBIDDEN` saat curl | Header `Origin` tidak cocok | Kirim `-H "Origin: http://localhost:5173"` atau hapus header Origin |
| `409 STALL_HAS_RELATIONS` saat hapus | Warung masih punya menu/review | Hapus menu/review dulu, atau pakai warung uji baru |
| Gambar tidak tampil | Tidak ada internet (foto Unsplash) | Gambar unggahan lokal tetap tampil; cek `backend/uploads/` |
| `GET /stalls/mine` 403 | Login sebagai customer/admin | Endpoint ini hanya untuk owner |
