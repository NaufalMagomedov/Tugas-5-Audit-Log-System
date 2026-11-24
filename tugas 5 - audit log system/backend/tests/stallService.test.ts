import './setup-env.ts';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type sql from 'mssql';
import type { AuditLogService } from '../src/services/auditLogService.ts';
import type { StallRepository } from '../src/repositories/stallRepository.ts';
import { StallService } from '../src/services/stallService.ts';
import { withTransaction } from '../src/db/transaction.ts';
import type { AuthUser } from '../src/services/tokenService.ts';

/**
 * Pengujian otorisasi hapus warung di level service memakai repository PALSU:
 * tidak butuh SQL Server, tetapi tetap melewati jalur kode asli
 * (findById -> canManageStall -> remove).
 *
 * `withTransaction` dan `AuditLogService` di-inject sebagai stub agar tidak
 * ada koneksi database. Ini menghindari `mock.module` yang membutuhkan
 * top-level await (tidak didukung pada output CJS).
 */
const auditLogStub = {
  record: async () => {},
} as unknown as AuditLogService;

const transactionStub = (async <T>(
  work: (transaction: sql.Transaction) => Promise<T>,
): Promise<T> => work({} as sql.Transaction)) as typeof withTransaction;

const rowFor = (ownerId: number) => ({
  id: 1,
  ownerId,
  name: 'Warung Uji',
  category: 'Nasi',
  location: 'Kantin Uji',
  description: null,
  imageUrl: null,
  avgRating: '4.50',
  reviewCount: 2,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
});

function makeService(currentOwnerId: number | null) {
  const calls = { remove: 0 };
  const repository = {
    findById: async () => (currentOwnerId === null ? undefined : rowFor(currentOwnerId)),
    remove: async () => {
      calls.remove += 1;
      return rowFor(currentOwnerId ?? 0);
    },
  } as unknown as StallRepository;

  return {
    service: new StallService(repository, undefined, auditLogStub, transactionStub),
    calls,
  };
}

const user = (id: number, role: AuthUser['role']): AuthUser => ({
  id,
  name: `User ${id}`,
  email: `${id}@kantin.test`,
  role,
});

describe('StallService.deleteStall', () => {
  it('owner boleh menghapus warung miliknya sendiri', async () => {
    const { service, calls } = makeService(7);
    const deleted = await service.deleteStall(1, user(7, 'owner'));
    assert.equal(deleted.id, 1);
    assert.equal(calls.remove, 1);
  });

  it('owner lain ditolak 403 STALL_FORBIDDEN dan warung tidak dihapus', async () => {
    const { service, calls } = makeService(2);
    await assert.rejects(
      () => service.deleteStall(1, user(7, 'owner')),
      (error: { statusCode?: number; code?: string }) =>
        error.statusCode === 403 && error.code === 'STALL_FORBIDDEN',
    );
    assert.equal(calls.remove, 0);
  });

  it('admin boleh menghapus warung siapa pun', async () => {
    const { service, calls } = makeService(2);
    const deleted = await service.deleteStall(1, user(99, 'admin'));
    assert.equal(deleted.id, 1);
    assert.equal(calls.remove, 1);
  });

  it('warung tidak ada -> 404 STALL_NOT_FOUND sebelum cek izin', async () => {
    const { service, calls } = makeService(null);
    await assert.rejects(
      () => service.deleteStall(1, user(7, 'owner')),
      (error: { statusCode?: number; code?: string }) =>
        error.statusCode === 404 && error.code === 'STALL_NOT_FOUND',
    );
    assert.equal(calls.remove, 0);
  });
});
