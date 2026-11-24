-- ============================================================
-- Tugas 5 — Verifikasi manual trigger append-only
-- ============================================================
-- Buka file ini di SSMS/Azure Data Studio, sambungkan ke database
-- review_kantin, lalu jalankan per batch (F5).
--
-- Yang diharapkan:
--   - Batch UPDATE gagal: Msg 50010 ... AUDIT_LOGS bersifat append-only.
--   - Batch DELETE gagal: Msg 50010 ... AUDIT_LOGS bersifat append-only.
--   - Snapshot di akhir sama dengan snapshot di awal.
--
-- Untuk bukti otomatis + file log, jalankan:
--   powershell -ExecutionPolicy Bypass -File scripts\uji-trigger.ps1
-- ============================================================

USE review_kantin;
GO

-- 1. Pastikan trigger ada dan aktif.
SELECT name, is_instead_of_trigger, is_disabled
FROM sys.triggers
WHERE parent_id = OBJECT_ID('dbo.AUDIT_LOGS');
GO

-- 2. Snapshot sebelum percobaan.
SELECT TOP 1 id, action, target_table, target_id, created_at
FROM dbo.AUDIT_LOGS
ORDER BY id;
GO

-- 3. UPDATE harus DITOLAK trigger (error 50010).
UPDATE dbo.AUDIT_LOGS
SET action = N'HACKED'
WHERE id = (SELECT TOP 1 id FROM dbo.AUDIT_LOGS ORDER BY id);
GO

-- 4. DELETE harus DITOLAK trigger (error 50010).
DELETE FROM dbo.AUDIT_LOGS
WHERE id = (SELECT TOP 1 id FROM dbo.AUDIT_LOGS ORDER BY id);
GO

-- 5. Snapshot sesudah: data harus tetap sama, tidak ada action HACKED.
SELECT TOP 1 id, action, target_table, target_id, created_at
FROM dbo.AUDIT_LOGS
ORDER BY id;
GO
