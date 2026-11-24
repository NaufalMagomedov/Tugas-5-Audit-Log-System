import { ReviewRepository } from '../repositories/reviewRepository.ts';
import { StallRepository } from '../repositories/stallRepository.ts';
import { AuditLogService } from './auditLogService.ts';
import { withTransaction } from '../db/transaction.ts';
import type { ReviewListItemDto, ReviewResponseDto } from '../dtos/reviewDto.ts';
import { AppError } from '../errors/AppError.ts';
import { ConflictError } from '../errors/ConflictError.ts';
import { ForbiddenError } from '../errors/ForbiddenError.ts';
import { NotFoundError } from '../errors/NotFoundError.ts';
import type { CreateReviewInput } from '../schemas/reviewSchema.ts';
import { isForeignKeyViolation } from '../utils/sqlError.ts';
import { canDeleteReview } from './ownership.ts';
import type { AuthUser } from './tokenService.ts';

type ReviewRow = NonNullable<Awaited<ReturnType<ReviewRepository['create']>>>;

const stallNotFound = () => new NotFoundError('Warung tidak ditemukan.', 'STALL_NOT_FOUND');
const reviewNotFound = () => new NotFoundError('Review tidak ditemukan.', 'REVIEW_NOT_FOUND');

export class ReviewService {
  private reviewRepository: ReviewRepository;
  private stallRepository: StallRepository;
  private auditLogService: AuditLogService;

  constructor(
    reviewRepository: ReviewRepository = new ReviewRepository(),
    stallRepository: StallRepository = new StallRepository(),
    auditLogService: AuditLogService = new AuditLogService(),
  ) {
    this.reviewRepository = reviewRepository;
    this.stallRepository = stallRepository;
    this.auditLogService = auditLogService;
  }

  private toDto(row: ReviewRow): ReviewResponseDto {
    return {
      id: row.id,
      stallId: row.stallId,
      userId: row.userId,
      rating: row.rating,
      comment: row.comment,
      likeCount: row.likeCount,
      createdAt: row.createdAt ? (row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)) : null,
    };
  }

  async getStallReviews(stallId: number): Promise<ReviewListItemDto[]> {
    const stall = await this.stallRepository.findById(stallId);
    if (!stall) throw stallNotFound();

    const rows = await this.reviewRepository.findByStall(stallId);
    return rows.map((row) => ({
      id: row.id,
      stallId: row.stallId,
      userId: row.userId,
      userName: row.userName,
      rating: row.rating,
      comment: row.comment,
      likeCount: row.likeCount,
      createdAt: row.createdAt ? (row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)) : null,
    }));
  }

  async createReview(stallId: number, userId: number, input: CreateReviewInput): Promise<ReviewResponseDto> {
    const stall = await this.stallRepository.findById(stallId);
    if (!stall) throw stallNotFound();

    const existing = await this.reviewRepository.findByStallAndUser(stallId, userId);
    if (existing) {
      throw new ConflictError('Kamu sudah pernah memberi review untuk warung ini.', 'REVIEW_ALREADY_EXISTS');
    }

    return withTransaction(async (transaction) => {
      const row = await this.reviewRepository.create(
        {
          stallId,
          userId,
          rating: input.rating,
          comment: input.comment ?? null,
        },
        transaction,
      );
      if (!row) throw new AppError(500, 'REVIEW_NOT_SAVED', 'Review gagal disimpan.');

      await this.reviewRepository.refreshStallSummary(stallId, transaction);

      const dto = this.toDto(row);

      await this.auditLogService.record(
        {
          userId,
          action: 'CREATE_REVIEW',
          targetTable: 'REVIEWS',
          targetId: dto.id,
          metadata: { after: dto },
        },
        transaction,
      );

      return dto;
    });
  }

  async deleteReview(id: number, user: AuthUser): Promise<ReviewResponseDto> {
    const current = await this.reviewRepository.findById(id);
    if (!current) throw reviewNotFound();

    if (!canDeleteReview(current.userId, user)) {
      throw new ForbiddenError('Kamu hanya bisa menghapus review milikmu sendiri.', 'REVIEW_FORBIDDEN');
    }

    return withTransaction(async (transaction) => {
      try {
        const row = await this.reviewRepository.remove(id, transaction);
        if (!row) throw reviewNotFound();

        await this.reviewRepository.refreshStallSummary(current.stallId, transaction);

        const dto = this.toDto(row);

        await this.auditLogService.record(
          {
            userId: user.id,
            action: 'DELETE_REVIEW',
            targetTable: 'REVIEWS',
            targetId: id,
            metadata: { before: current },
          },
          transaction,
        );

        return dto;
      } catch (error) {
        if (isForeignKeyViolation(error)) {
          throw new ConflictError(
            'Review tidak dapat dihapus karena ada relasi data lain.',
            'REVIEW_HAS_RELATIONS',
          );
        }
        throw error;
      }
    });
  }
}
