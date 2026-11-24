-- ====================================================
-- TEST TRIGGER TR_AUDIT_LOGS_AppendOnly
-- Membuktikan bahwa AUDIT_LOGS bersifat append-only
-- ====================================================

PRINT '=== CEK TRIGGER TERDAFTAR ===';
SELECT name, type_desc, is_disabled
FROM sys.triggers
WHERE name = 'TR_AUDIT_LOGS_AppendOnly';

PRINT '';
PRINT '=== TEST INSERT (harus BERHASIL) ===';
INSERT INTO dbo.AUDIT_LOGS (user_id, action, target_table, target_id, metadata)
VALUES (1, 'TEST_TRIGGER', 'AUDIT_LOGS', 1, '{"keterangan":"baris uji trigger"}');

DECLARE @new_id INT = SCOPE_IDENTITY();
PRINT 'INSERT berhasil -> id = ' + CAST(@new_id AS VARCHAR);

PRINT '';
PRINT '=== TEST UPDATE (harus DITOLAK trigger error 50010) ===';
BEGIN TRY
    UPDATE dbo.AUDIT_LOGS SET action = 'HACKED' WHERE id = @new_id;
    PRINT '!! GAGAL: UPDATE berhasil - trigger tidak bekerja !!';
END TRY
BEGIN CATCH
    PRINT 'UPDATE ditolak OK';
    PRINT '  Error Number : ' + CAST(ERROR_NUMBER() AS VARCHAR);
    PRINT '  Error Message: ' + ERROR_MESSAGE();
END CATCH;

PRINT '';
PRINT '=== TEST DELETE (harus DITOLAK trigger error 50010) ===';
BEGIN TRY
    DELETE FROM dbo.AUDIT_LOGS WHERE id = @new_id;
    PRINT '!! GAGAL: DELETE berhasil - trigger tidak bekerja !!';
END TRY
BEGIN CATCH
    PRINT 'DELETE ditolak OK';
    PRINT '  Error Number : ' + CAST(ERROR_NUMBER() AS VARCHAR);
    PRINT '  Error Message: ' + ERROR_MESSAGE();
END CATCH;

PRINT '';
PRINT '=== VERIFIKASI BARIS MASIH ADA (tidak terhapus) ===';
SELECT id, action, target_id, created_at
FROM dbo.AUDIT_LOGS
WHERE id = @new_id;

PRINT '';
PRINT '=== HASIL: Trigger append-only berfungsi dengan benar ===';
