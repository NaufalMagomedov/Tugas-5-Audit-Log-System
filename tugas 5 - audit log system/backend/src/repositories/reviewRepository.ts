import sql from 'mssql';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.ts';
import { reviews, users } from '../db/schema.ts';
import { createRequest } from '../db/request.ts';

export interface CreateReviewParams {
  stallId: number;
  userId: number;
  rating: number;
  comment: string | null;
}

export class ReviewRepository {
  async findByStallAndUser(stallId: number, userId: number) {
    const db = await getDb();
    const rows = await db
      .select()
      .from(reviews)
      .where(and(eq(reviews.stallId, stallId), eq(reviews.userId, userId)));
    return rows[0];
  }

  async findById(id: number) {
    const db = await getDb();
    const rows = await db.select().from(reviews).where(eq(reviews.id, id));
    return rows[0];
  }

  async findByStall(stallId: number, limit = 50) {
    const db = await getDb();
    return db
      .select({
        id: reviews.id,
        stallId: reviews.stallId,
        userId: reviews.userId,
        userName: users.name,
        rating: reviews.rating,
        comment: reviews.comment,
        likeCount: reviews.likeCount,
        createdAt: reviews.createdAt,
      })
      .from(reviews)
      .innerJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.stallId, stallId))
      .orderBy(desc(reviews.createdAt), desc(reviews.id))
      .offset(0)
      .fetch(limit);
  }

  async create(params: CreateReviewParams, transaction?: sql.Transaction) {
    const req = await createRequest(transaction);
    const result = await req
      .input('stallId', sql.Int, params.stallId)
      .input('userId', sql.Int, params.userId)
      .input('rating', sql.Int, params.rating)
      .input('comment', sql.NVarChar(sql.MAX), params.comment)
      .query(`
        INSERT INTO dbo.REVIEWS (stall_id, user_id, rating, comment)
        OUTPUT
          INSERTED.id,
          INSERTED.stall_id AS stallId,
          INSERTED.user_id AS userId,
          INSERTED.rating,
          INSERTED.comment,
          INSERTED.created_at AS createdAt
        VALUES (@stallId, @userId, @rating, @comment)
      `);
    const row = result.recordset[0];
    return row ? { ...row, likeCount: 0 } : null;
  }

  async remove(id: number, transaction?: sql.Transaction) {
    const req = await createRequest(transaction);
    const result = await req
      .input('id', sql.Int, id)
      .query(`
        DELETE FROM dbo.REVIEWS
        OUTPUT
          DELETED.id,
          DELETED.stall_id AS stallId,
          DELETED.user_id AS userId,
          DELETED.rating,
          DELETED.comment,
          DELETED.created_at AS createdAt
        WHERE id = @id
      `);
    const row = result.recordset[0];
    return row ? { ...row, likeCount: 0 } : null;
  }

  async refreshStallSummary(stallId: number, transaction?: sql.Transaction) {
    const req = await createRequest(transaction);
    await req
      .input('stallId', sql.Int, stallId)
      .query(`
        UPDATE dbo.STALLS
        SET
          review_count = ISNULL(sub.total, 0),
          avg_rating = ISNULL(sub.average, 0)
        FROM dbo.STALLS
        CROSS APPLY (
          SELECT
            COUNT(*) AS total,
            CAST(AVG(CAST(rating AS DECIMAL(10, 4))) AS DECIMAL(3, 2)) AS average
          FROM dbo.REVIEWS
          WHERE stall_id = @stallId
        ) sub
        WHERE id = @stallId
      `);
  }
}
