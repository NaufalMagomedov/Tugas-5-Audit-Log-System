import sql from 'mssql';
import { and, eq, ne, type SQL } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { menuItems } from '../db/schema.ts';
import { createRequest } from '../db/request.ts';

export interface CreateMenuParams {
  stallId: number;
  name: string;
  price: number;
  isAvailable: boolean;
  imageUrl?: string | null;
}

export type UpdateMenuParams = Partial<Omit<CreateMenuParams, 'stallId'>>;

export class MenuItemRepository {
  async findByStallId(stallId: number) {
    const db = await getDb();
    return db.select().from(menuItems).where(eq(menuItems.stallId, stallId)).orderBy(menuItems.id);
  }

  async findById(id: number) {
    const db = await getDb();
    const rows = await db.select().from(menuItems).where(eq(menuItems.id, id));
    return rows[0];
  }

  async findByStallAndName(stallId: number, name: string, exceptId?: number) {
    const db = await getDb();
    const conditions: SQL[] = [eq(menuItems.stallId, stallId), eq(menuItems.name, name)];
    if (exceptId !== undefined) conditions.push(ne(menuItems.id, exceptId));

    const rows = await db
      .select()
      .from(menuItems)
      .where(and(...conditions));
    return rows[0];
  }

  async create(params: CreateMenuParams, transaction?: sql.Transaction) {
    const req = await createRequest(transaction);
    const result = await req
      .input('stallId', sql.Int, params.stallId)
      .input('name', sql.NVarChar(100), params.name)
      .input('price', sql.Int, params.price)
      .input('isAvailable', sql.Bit, params.isAvailable ? 1 : 0)
      .input('imageUrl', sql.NVarChar(500), params.imageUrl || null)
      .query(`
        INSERT INTO dbo.MENU_ITEMS (stall_id, name, price, is_available, image_url)
        OUTPUT
          INSERTED.id,
          INSERTED.stall_id AS stallId,
          INSERTED.name,
          INSERTED.price,
          INSERTED.is_available AS isAvailable,
          INSERTED.image_url AS imageUrl
        VALUES (@stallId, @name, @price, @isAvailable, @imageUrl)
      `);
    return result.recordset[0];
  }

  async update(id: number, params: UpdateMenuParams, transaction?: sql.Transaction) {
    const req = await createRequest(transaction);
    req.input('id', sql.Int, id);

    const sets: string[] = [];
    if (params.name !== undefined) {
      req.input('name', sql.NVarChar(100), params.name);
      sets.push('name = @name');
    }
    if (params.price !== undefined) {
      req.input('price', sql.Int, params.price);
      sets.push('price = @price');
    }
    if (params.isAvailable !== undefined) {
      req.input('isAvailable', sql.Bit, params.isAvailable ? 1 : 0);
      sets.push('is_available = @isAvailable');
    }
    if (params.imageUrl !== undefined) {
      req.input('imageUrl', sql.NVarChar(500), params.imageUrl || null);
      sets.push('image_url = @imageUrl');
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    const result = await req.query(`
      UPDATE dbo.MENU_ITEMS
      SET ${sets.join(', ')}
      OUTPUT
        INSERTED.id,
        INSERTED.stall_id AS stallId,
        INSERTED.name,
        INSERTED.price,
        INSERTED.is_available AS isAvailable,
        INSERTED.image_url AS imageUrl
      WHERE id = @id
    `);
    return result.recordset[0];
  }

  async remove(id: number, transaction?: sql.Transaction) {
    const req = await createRequest(transaction);
    const result = await req
      .input('id', sql.Int, id)
      .query(`
        DELETE FROM dbo.MENU_ITEMS
        OUTPUT
          DELETED.id,
          DELETED.stall_id AS stallId,
          DELETED.name,
          DELETED.price,
          DELETED.is_available AS isAvailable,
          DELETED.image_url AS imageUrl
        WHERE id = @id
      `);
    return result.recordset[0];
  }
}
