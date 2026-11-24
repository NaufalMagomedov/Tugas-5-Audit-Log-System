import 'dotenv/config';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import sql from 'mssql';
import { app } from '../src/app.ts';
import { getPool, closePool } from '../src/db/pool.ts';
import { signToken } from '../src/services/tokenService.ts';

let server: Server;
let base = '';
let pool: sql.ConnectionPool;

const cookieFor = (user: { id: number; name: string; email: string; role: 'admin' | 'owner' | 'customer' }) =>
  `kantin_session_ho3=${signToken(user)}`;

async function call(path: string, init: RequestInit & { cookie?: string } = {}) {
  const { cookie, headers, ...rest } = init;
  const response = await fetch(`${base}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'TestRunner/1.0',
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
  });
  const text = await response.text();
  return { response, body: text ? (JSON.parse(text) as Record<string, any>) : null };
}

before(async () => {
  pool = await getPool();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closePool();
});

describe('1. Trigger Append-Only pada AUDIT_LOGS', () => {
  it('menolak UPDATE dengan error 50010', async () => {
    try {
      await pool.request().query("UPDATE dbo.AUDIT_LOGS SET action = 'HACKED' WHERE 1 = 0");
      assert.fail('Seharusnya UPDATE ditolak oleh trigger.');
    } catch (error: any) {
      assert.ok(
        error.message.includes('50010') || error.message.includes('append-only'),
        `Pesan error tidak sesuai: ${error.message}`,
      );
    }
  });

  it('menolak DELETE dengan error 50010', async () => {
    try {
      await pool.request().query('DELETE FROM dbo.AUDIT_LOGS WHERE 1 = 0');
      assert.fail('Seharusnya DELETE ditolak oleh trigger.');
    } catch (error: any) {
      assert.ok(
        error.message.includes('50010') || error.message.includes('append-only'),
        `Pesan error tidak sesuai: ${error.message}`,
      );
    }
  });
});

describe('2. Audit LOGIN dan LOGOUT', () => {
  it('LOGIN dan LOGOUT mencatat role, ip_address, user_agent, dan result ke AUDIT_LOGS', async () => {
    // 1) Login akun demo admin
    const loginRes = await call('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@kantin.test', password: 'admin123' }),
    });

    assert.equal(loginRes.response.status, 200);
    const adminUser = loginRes.body?.data;
    assert.ok(adminUser?.id);

    const setCookie = loginRes.response.headers.get('set-cookie') ?? '';
    const cookie = setCookie.split(';')[0];

    // Cek record LOGIN di DB
    const checkLogin = await pool.request().input('userId', sql.Int, adminUser.id).query(`
      SELECT TOP 1 * FROM dbo.AUDIT_LOGS
      WHERE user_id = @userId AND action = 'LOGIN'
      ORDER BY id DESC
    `);
    assert.ok(checkLogin.recordset.length > 0);
    const loginRow = checkLogin.recordset[0];
    const loginMeta = JSON.parse(loginRow.metadata);
    assert.equal(loginMeta.role, 'admin');
    assert.ok(loginMeta.ip_address);
    assert.ok(loginMeta.user_agent);
    assert.equal(loginMeta.result, 'success');
    assert.equal(loginRow.target_id, adminUser.id);
    assert.equal(loginRow.target_table, 'USERS');

    // 2) Logout
    const logoutRes = await call('/api/auth/logout', {
      method: 'POST',
      cookie,
    });
    assert.equal(logoutRes.response.status, 200);

    // Cek record LOGOUT di DB
    const checkLogout = await pool.request().input('userId', sql.Int, adminUser.id).query(`
      SELECT TOP 1 * FROM dbo.AUDIT_LOGS
      WHERE user_id = @userId AND action = 'LOGOUT'
      ORDER BY id DESC
    `);
    assert.ok(checkLogout.recordset.length > 0);
    const logoutRow = checkLogout.recordset[0];
    const logoutMeta = JSON.parse(logoutRow.metadata);
    assert.equal(logoutMeta.role, 'admin');
    assert.ok(logoutMeta.ip_address);
    assert.ok(logoutMeta.user_agent);
    assert.equal(logoutMeta.result, 'success');
    assert.equal(logoutRow.target_id, adminUser.id);
    assert.equal(logoutRow.target_table, 'USERS');
  });
});

describe('3. GET /api/audit-logs dan GET /api/audit-logs/:id', () => {
  const adminCookie = cookieFor({
    id: 1,
    name: 'Admin Kantin',
    email: 'admin@kantin.test',
    role: 'admin',
  });

  it('GET /api/audit-logs mengembalikan struktur { status, data: { items, pagination } } dengan userName & userEmail', async () => {
    const { response, body } = await call('/api/audit-logs?page=1&pageSize=5', { cookie: adminCookie });
    assert.equal(response.status, 200);
    assert.equal(body?.status, 'success');
    assert.ok(Array.isArray(body?.data?.items));
    assert.ok(body?.data?.pagination);
    assert.equal(body?.data?.pagination?.page, 1);
    assert.equal(body?.data?.pagination?.pageSize, 5);

    if (body?.data?.items.length > 0) {
      const item = body.data.items[0];
      assert.ok('id' in item);
      assert.ok('userId' in item);
      assert.ok('userName' in item);
      assert.ok('userEmail' in item);
      assert.ok('action' in item);
      assert.ok('targetTable' in item);
      assert.ok('targetId' in item);
      assert.ok('metadata' in item);
      assert.ok('createdAt' in item);
    }
  });

  it('GET /api/audit-logs/:id mengembalikan detail satu catatan audit', async () => {
    // Ambil id catatan yang ada
    const listRes = await call('/api/audit-logs?pageSize=1', { cookie: adminCookie });
    const firstItem = listRes.body?.data?.items?.[0];
    assert.ok(firstItem?.id, 'Harus ada minimal satu baris audit.');

    const { response, body } = await call(`/api/audit-logs/${firstItem.id}`, { cookie: adminCookie });
    assert.equal(response.status, 200);
    assert.equal(body?.status, 'success');
    assert.equal(body?.data?.id, firstItem.id);
    assert.equal(body?.data?.action, firstItem.action);
    assert.equal(body?.data?.userName, firstItem.userName);
    assert.equal(body?.data?.userEmail, firstItem.userEmail);
  });

  it('GET /api/audit-logs/:id mengembalikan 404 jika id tidak ditemukan', async () => {
    const { response, body } = await call('/api/audit-logs/999999999', { cookie: adminCookie });
    assert.equal(response.status, 404);
    assert.equal(body?.status, 'fail');
    assert.equal(body?.code, 'AUDIT_NOT_FOUND');
  });

  it('filter userId dan targetId berfungsi membatasi hasil', async () => {
    const { response, body } = await call('/api/audit-logs?userId=1&targetId=1', { cookie: adminCookie });
    assert.equal(response.status, 200);
    for (const item of body?.data?.items ?? []) {
      assert.equal(item.userId, 1);
      assert.equal(item.targetId, 1);
    }
  });
});

describe('4. Bonus Mutasi Atomik STALLS dan REVIEWS', () => {
  const ownerUser = {
    id: 2,
    name: 'Tini Sukardi',
    email: 'tini@kantin.test',
    role: 'owner' as const,
  };
  const ownerCookie = cookieFor(ownerUser);

  const customerUser = {
    id: 3,
    name: 'Bagas Perkasa',
    email: 'bagas@student.test',
    role: 'customer' as const,
  };
  const customerCookie = cookieFor(customerUser);

  let testStallId: number;

  it('CREATE_STALL, UPDATE_STALL, DELETE_STALL, CREATE_REVIEW, dan DELETE_REVIEW dicatat atomik', async () => {
    // 1) Create Stall
    const createRes = await call('/api/v1/stalls', {
      method: 'POST',
      cookie: ownerCookie,
      body: JSON.stringify({
        name: `Warung Uji Audit ${Date.now()}`,
        category: 'Nasi',
        location: 'Kantin Utara',
      }),
    });
    assert.equal(createRes.response.status, 201);
    testStallId = createRes.body?.data?.id;
    assert.ok(testStallId);

    // Cek audit CREATE_STALL
    const auditCreate = await pool.request().input('targetId', sql.Int, testStallId).query(`
      SELECT TOP 1 * FROM dbo.AUDIT_LOGS
      WHERE target_table = 'STALLS' AND target_id = @targetId AND action = 'CREATE_STALL'
      ORDER BY id DESC
    `);
    assert.ok(auditCreate.recordset.length > 0);

    // 2) Update Stall
    const updateRes = await call(`/api/v1/stalls/${testStallId}`, {
      method: 'PUT',
      cookie: ownerCookie,
      body: JSON.stringify({
        name: `Warung Diubah ${Date.now()}`,
      }),
    });
    assert.equal(updateRes.response.status, 200);

    // Cek audit UPDATE_STALL
    const auditUpdate = await pool.request().input('targetId', sql.Int, testStallId).query(`
      SELECT TOP 1 * FROM dbo.AUDIT_LOGS
      WHERE target_table = 'STALLS' AND target_id = @targetId AND action = 'UPDATE_STALL'
      ORDER BY id DESC
    `);
    assert.ok(auditUpdate.recordset.length > 0);
    const updateMeta = JSON.parse(auditUpdate.recordset[0].metadata);
    assert.ok(updateMeta.before);
    assert.ok(updateMeta.after);
    assert.ok(updateMeta.changed);

    // 3) Bonus REVIEWS: customer menulis review pada warung uji.
    const reviewRes = await call(`/api/v1/stalls/${testStallId}/reviews`, {
      method: 'POST',
      cookie: customerCookie,
      body: JSON.stringify({ rating: 5, comment: `Review uji audit ${Date.now()}` }),
    });
    assert.equal(reviewRes.response.status, 201);
    const reviewId = reviewRes.body?.data?.id;
    assert.ok(reviewId);

    const auditReviewCreate = await pool.request().input('targetId', sql.Int, reviewId).query(`
      SELECT TOP 1 * FROM dbo.AUDIT_LOGS
      WHERE target_table = 'REVIEWS' AND target_id = @targetId AND action = 'CREATE_REVIEW'
      ORDER BY id DESC
    `);
    assert.ok(auditReviewCreate.recordset.length > 0);
    assert.equal(Number(auditReviewCreate.recordset[0].user_id), customerUser.id);
    const reviewCreateMeta = JSON.parse(auditReviewCreate.recordset[0].metadata);
    assert.ok(reviewCreateMeta.after);

    // 4) Hapus review -> DELETE_REVIEW ikut tercatat dalam transaksi yang sama.
    const deleteReviewRes = await call(`/api/v1/reviews/${reviewId}`, {
      method: 'DELETE',
      cookie: customerCookie,
    });
    assert.equal(deleteReviewRes.response.status, 204);

    const auditReviewDelete = await pool.request().input('targetId', sql.Int, reviewId).query(`
      SELECT TOP 1 * FROM dbo.AUDIT_LOGS
      WHERE target_table = 'REVIEWS' AND target_id = @targetId AND action = 'DELETE_REVIEW'
      ORDER BY id DESC
    `);
    assert.ok(auditReviewDelete.recordset.length > 0);
    const reviewDeleteMeta = JSON.parse(auditReviewDelete.recordset[0].metadata);
    assert.ok(reviewDeleteMeta.before);

    // 5) Delete Stall
    const deleteRes = await call(`/api/v1/stalls/${testStallId}`, {
      method: 'DELETE',
      cookie: ownerCookie,
    });
    assert.equal(deleteRes.response.status, 200);

    // Cek audit DELETE_STALL
    const auditDelete = await pool.request().input('targetId', sql.Int, testStallId).query(`
      SELECT TOP 1 * FROM dbo.AUDIT_LOGS
      WHERE target_table = 'STALLS' AND target_id = @targetId AND action = 'DELETE_STALL'
      ORDER BY id DESC
    `);
    assert.ok(auditDelete.recordset.length > 0);
    const deleteMeta = JSON.parse(auditDelete.recordset[0].metadata);
    assert.ok(deleteMeta.before);
  });
});
