import sql from 'mssql';
import { and, asc, count, eq, isNotNull, like, type SQL } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { stalls } from '../db/schema.ts';
import { createRequest } from '../db/request.ts';

export interface FindAllParams {
  search?: string;
  category?: string;
  page: number;
  limit: number;
}

export interface CreateStallInput {
  ownerId: number;
  name: string;
  category?: string | null;
  location?: string | null;
  description?: string | null;
  imageUrl?: string | null;
}

export class StallRepository {
  async findAll(params: FindAllParams) {
    const db = await getDb();

    const conditions: SQL[] = [];
    if (params.search) conditions.push(like(stalls.name, `%${params.search}%`));
    if (params.category) conditions.push(eq(stalls.category, params.category));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const offset = (params.page - 1) * params.limit;

    const rows = await db
      .select()
      .from(stalls)
      .where(where)
      .orderBy(stalls.id)
      .offset(offset)
      .fetch(params.limit);

    const totals = await db.select({ total: count() }).from(stalls).where(where);

    return { rows, total: Number(totals[0]?.total ?? 0) };
  }

  async findById(id: number) {
    const db = await getDb();
    const rows = await db.select().from(stalls).where(eq(stalls.id, id));
    return rows[0];
  }

  async findByOwnerId(ownerId: number) {
    const db = await getDb();
    return db.select().from(stalls).where(eq(stalls.ownerId, ownerId)).orderBy(stalls.id);
  }

  async findCategories(): Promise<string[]> {
    const db = await getDb();
    const rows = await db
      .selectDistinct({ category: stalls.category })
      .from(stalls)
      .where(isNotNull(stalls.category))
      .orderBy(asc(stalls.category));

    return rows.flatMap((row) => (row.category ? [row.category] : []));
  }

  async create(input: CreateStallInput, transaction?: sql.Transaction) {
    const req = await createRequest(transaction);
    const result = await req
      .input('ownerId', sql.Int, input.ownerId)
      .input('name', sql.NVarChar(100), input.name)
      .input('category', sql.NVarChar(50), input.category ?? null)
      .input('location', sql.NVarChar(255), input.location ?? null)
      .input('description', sql.NVarChar(sql.MAX), input.description ?? null)
      .input('imageUrl', sql.NVarChar(500), input.imageUrl || null)
      .query(`
        INSERT INTO dbo.STALLS (owner_id, name, category, location, description, image_url, avg_rating, review_count)
        OUTPUT
          INSERTED.id,
          INSERTED.owner_id AS ownerId,
          INSERTED.name,
          INSERTED.category,
          INSERTED.location,
          INSERTED.description,
          INSERTED.image_url AS imageUrl,
          INSERTED.avg_rating AS avgRating,
          INSERTED.review_count AS reviewCount,
          INSERTED.created_at AS createdAt
        VALUES (@ownerId, @name, @category, @location, @description, @imageUrl, 0.00, 0)
      `);
    return result.recordset[0];
  }

  async update(id: number, input: Partial<CreateStallInput>, transaction?: sql.Transaction) {
    const req = await createRequest(transaction);
    const setClauses: string[] = [];

    req.input('id', sql.Int, id);

    if (input.ownerId !== undefined) {
      req.input('ownerId', sql.Int, input.ownerId);
      setClauses.push('owner_id = @ownerId');
    }
    if (input.name !== undefined) {
      req.input('name', sql.NVarChar(100), input.name);
      setClauses.push('name = @name');
    }
    if (input.category !== undefined) {
      req.input('category', sql.NVarChar(50), input.category);
      setClauses.push('category = @category');
    }
    if (input.location !== undefined) {
      req.input('location', sql.NVarChar(255), input.location);
      setClauses.push('location = @location');
    }
    if (input.description !== undefined) {
      req.input('description', sql.NVarChar(sql.MAX), input.description);
      setClauses.push('description = @description');
    }
    if (input.imageUrl !== undefined) {
      req.input('imageUrl', sql.NVarChar(500), input.imageUrl || null);
      setClauses.push('image_url = @imageUrl');
    }

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    const result = await req.query(`
      UPDATE dbo.STALLS
      SET ${setClauses.join(', ')}
      OUTPUT
        INSERTED.id,
        INSERTED.owner_id AS ownerId,
        INSERTED.name,
        INSERTED.category,
        INSERTED.location,
        INSERTED.description,
        INSERTED.image_url AS imageUrl,
        INSERTED.avg_rating AS avgRating,
        INSERTED.review_count AS reviewCount,
        INSERTED.created_at AS createdAt
      WHERE id = @id
    `);

    return result.recordset[0];
  }

  async remove(id: number, transaction?: sql.Transaction) {
    const req = await createRequest(transaction);
    const result = await req.input('id', sql.Int, id).query(`
      DELETE FROM dbo.STALLS
      OUTPUT
        DELETED.id,
        DELETED.owner_id AS ownerId,
        DELETED.name,
        DELETED.category,
        DELETED.location,
        DELETED.description,
        DELETED.image_url AS imageUrl,
        DELETED.avg_rating AS avgRating,
        DELETED.review_count AS reviewCount,
        DELETED.created_at AS createdAt
      WHERE id = @id
    `);
    return result.recordset[0];
  }
}
