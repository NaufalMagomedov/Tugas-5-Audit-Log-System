import { drizzle } from 'drizzle-orm/node-mssql';
import { getPool, closePool } from './pool.ts';

export { getPool, closePool };

let dbPromise: ReturnType<typeof buildDb> | null = null;

async function buildDb() {
  const pool = await getPool();
  return drizzle({ client: pool });
}

// Satu instance Drizzle dipakai ulang untuk seluruh aplikasi.
export function getDb() {
  if (!dbPromise) {
    dbPromise = buildDb().catch((error) => {
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/** Dipanggil saat server dimatikan agar koneksi SQL Server ditutup rapi. */
export async function closeDb(): Promise<void> {
  dbPromise = null;
  await closePool();
}
