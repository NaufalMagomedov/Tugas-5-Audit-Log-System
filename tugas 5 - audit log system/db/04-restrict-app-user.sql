-- ============================================================
-- Tugas 5 — OPSIONAL: user aplikasi least-privilege
-- ============================================================
-- Jalankan sebagai sysadmin/securityadmin (mis. sa), BUKAN sebagai
-- praktikum_user, karena membuat LOGIN butuh izin level server.
--
-- Setelah skrip ini:
--   1. Ubah backend/.env:
--        DB_USER=kantin_app
--        DB_PASSWORD=KantinApp2026!
--   2. Restart backend.
--
-- Hasil:
--   - kantin_app bisa SELECT/INSERT/UPDATE/DELETE pada tabel bisnis
--     (db_datareader + db_datawriter).
--   - Pada AUDIT_LOGS, DENY UPDATE/DELETE menang atas grant role,
--     sehingga hanya SELECT dan INSERT yang efektif.
--   - Trigger append-only tetap menjadi lapisan kedua.
-- ============================================================

USE master;
GO

IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'kantin_app')
BEGIN
    CREATE LOGIN kantin_app
        WITH PASSWORD = N'KantinApp2026!',
             CHECK_POLICY = ON,
             CHECK_EXPIRATION = OFF;
END
GO

USE review_kantin;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'kantin_app')
BEGIN
    CREATE USER kantin_app FOR LOGIN kantin_app;
END
GO

ALTER ROLE db_datareader ADD MEMBER kantin_app;
ALTER ROLE db_datawriter ADD MEMBER kantin_app;
GO

-- Pastikan hanya INSERT dan SELECT yang efektif pada AUDIT_LOGS.
DENY UPDATE, DELETE ON dbo.AUDIT_LOGS TO kantin_app;
GRANT SELECT, INSERT ON dbo.AUDIT_LOGS TO kantin_app;
GO

PRINT 'User kantin_app siap. Ubah DB_USER/DB_PASSWORD di backend/.env.';
GO
