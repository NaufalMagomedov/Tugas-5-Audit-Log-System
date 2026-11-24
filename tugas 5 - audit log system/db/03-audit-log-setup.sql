-- ============================================================
-- Tugas 5 - Audit Log System
-- Setup Skema, Index, Trigger Append-Only, dan Hak Akses AUDIT_LOGS
-- ============================================================

USE review_kantin;
GO

SET XACT_ABORT ON;
GO

-- 1. Pastikan tabel AUDIT_LOGS tersedia
IF OBJECT_ID('dbo.AUDIT_LOGS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.AUDIT_LOGS (
        id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_AUDIT_LOGS PRIMARY KEY,
        user_id      INT NOT NULL,
        action       NVARCHAR(50) NOT NULL,
        target_table NVARCHAR(50) NOT NULL,
        target_id    INT NOT NULL,
        metadata     NVARCHAR(MAX) NULL,
        created_at   DATETIME2(0) NOT NULL CONSTRAINT DF_AUDIT_LOGS_created_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_AUDIT_LOGS_USERS FOREIGN KEY (user_id)
            REFERENCES dbo.USERS (id)
    );
END
GO

-- 2. Samakan default created_at ke UTC
IF EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = N'DF_AUDIT_LOGS_created_at'
      AND parent_object_id = OBJECT_ID(N'dbo.AUDIT_LOGS')
)
BEGIN
    ALTER TABLE dbo.AUDIT_LOGS DROP CONSTRAINT DF_AUDIT_LOGS_created_at;
END
GO

ALTER TABLE dbo.AUDIT_LOGS
    ADD CONSTRAINT DF_AUDIT_LOGS_created_at
    DEFAULT SYSUTCDATETIME() FOR created_at;
GO

-- 3. Index untuk performa pagination dan filtering
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_AUDIT_LOGS_created_at'
      AND object_id = OBJECT_ID(N'dbo.AUDIT_LOGS')
)
BEGIN
    CREATE INDEX IX_AUDIT_LOGS_created_at
        ON dbo.AUDIT_LOGS (created_at DESC, id DESC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_AUDIT_LOGS_user_created'
      AND object_id = OBJECT_ID(N'dbo.AUDIT_LOGS')
)
BEGIN
    CREATE INDEX IX_AUDIT_LOGS_user_created
        ON dbo.AUDIT_LOGS (user_id, created_at DESC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_AUDIT_LOGS_action_target_created'
      AND object_id = OBJECT_ID(N'dbo.AUDIT_LOGS')
)
BEGIN
    CREATE INDEX IX_AUDIT_LOGS_action_target_created
        ON dbo.AUDIT_LOGS (action, target_table, created_at DESC);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_AUDIT_LOGS_target'
      AND object_id = OBJECT_ID(N'dbo.AUDIT_LOGS')
)
BEGIN
    CREATE INDEX IX_AUDIT_LOGS_target
        ON dbo.AUDIT_LOGS (target_table, target_id, created_at DESC);
END
GO

-- 4. Trigger Append-Only: Menolak UPDATE dan DELETE pada AUDIT_LOGS
CREATE OR ALTER TRIGGER TR_AUDIT_LOGS_AppendOnly
ON dbo.AUDIT_LOGS
INSTEAD OF UPDATE, DELETE
AS
BEGIN
    THROW 50010, 'AUDIT_LOGS bersifat append-only.', 1;
END;
GO

-- 5. Hak akses database aplikasi dibatasi hanya INSERT dan SELECT pada AUDIT_LOGS
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'praktikum_user')
BEGIN
    DENY UPDATE, DELETE ON dbo.AUDIT_LOGS TO praktikum_user;
    GRANT SELECT, INSERT ON dbo.AUDIT_LOGS TO praktikum_user;
END
GO

PRINT 'Skema, index, trigger append-only, dan permission AUDIT_LOGS siap.';
GO
