import './setup-env.ts';
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { Request, Response } from 'express';
import { AuthController } from '../src/controllers/authController.ts';
import { AuditLogService } from '../src/services/auditLogService.ts';
import type { AuditLogRepository } from '../src/repositories/auditLogRepository.ts';
import { signToken } from '../src/services/tokenService.ts';

/**
 * Skenario gagal (Bagian D no. 3): jika audit LOGOUT gagal ditulis,
 * logout tetap berhasil. Repository dibuat selalu error, tanpa database.
 */
const failingRepository = {
  insert: async () => {
    throw new Error('Simulasi: INSERT AUDIT_LOGS gagal');
  },
} as unknown as AuditLogRepository;

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    clearedCookie: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    clearCookie() {
      this.clearedCookie = true;
      return this;
    },
  };
  return res;
}

const user = { id: 1, name: 'Admin Kantin', email: 'admin@kantin.test', role: 'admin' as const };

describe('audit LOGOUT gagal tidak menggagalkan logout', () => {
  it('logout tetap 200 dan cookie dihapus walau INSERT audit error', async () => {
    const errorLog = mock.method(console, 'error', () => {});
    const controller = new AuthController(undefined, new AuditLogService(failingRepository));

    const req = {
      cookies: { kantin_session_test: signToken(user) },
      headers: { 'user-agent': 'TestRunner/1.0' },
      socket: { remoteAddress: '::1' },
    } as unknown as Request;
    const res = fakeRes();

    await controller.logout(req, res as unknown as Response);

    assert.equal(res.statusCode, 200);
    assert.equal((res.body as { status: string }).status, 'success');
    assert.equal(res.clearedCookie, true);
    assert.equal(errorLog.mock.callCount(), 1, 'kegagalan audit harus dicatat di log server');
    errorLog.mock.restore();
  });

  it('logout tanpa cookie tetap 200 dan tidak menulis audit', async () => {
    let inserted = 0;
    const repo = { insert: async () => { inserted += 1; } } as unknown as AuditLogRepository;
    const controller = new AuthController(undefined, new AuditLogService(repo));

    const req = { cookies: {}, headers: {}, socket: {} } as unknown as Request;
    const res = fakeRes();
    await controller.logout(req, res as unknown as Response);

    assert.equal(res.statusCode, 200);
    assert.equal(inserted, 0);
  });
});