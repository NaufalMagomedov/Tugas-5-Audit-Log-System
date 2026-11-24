import type { Request } from 'express';
import type sql from 'mssql';
import type { AuditLogDto, AuditLogPageDto } from '../dtos/auditLogDto.ts';
import { NotFoundError } from '../errors/NotFoundError.ts';
import {
  AuditLogRepository,
  type AuditEntry,
} from '../repositories/auditLogRepository.ts';
import type { AuditLogQuery } from '../schemas/auditLogSchema.ts';

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '::1';
}

export function getUserAgent(req: Request): string {
  const ua = req.headers['user-agent'];
  return typeof ua === 'string' ? ua : '';
}

export class AuditLogService {
  constructor(
    private readonly auditLogRepository: AuditLogRepository = new AuditLogRepository(),
  ) {}

  /** Dipanggil di dalam transaksi mutasi bisnis supaya audit ikut atomik. */
  async record(
    entry: AuditEntry,
    transaction?: sql.Transaction,
  ): Promise<void> {
    await this.auditLogRepository.insert(entry, transaction);
  }

  /**
   * Login tetap berhasil walau penulisan audit gagal. Kegagalan audit tidak
   * boleh mengunci pengguna dari aplikasi (best-effort).
   */
  async recordLogin(
    user: { id: number; role: string },
    req: Request,
  ): Promise<void> {
    try {
      await this.record({
        userId: user.id,
        action: 'LOGIN',
        targetTable: 'USERS',
        targetId: user.id,
        metadata: {
          role: user.role,
          ip_address: getClientIp(req),
          user_agent: getUserAgent(req),
          result: 'success',
        },
      });
    } catch (error) {
      console.error('Audit LOGIN gagal dicatat:', error);
    }
  }

  /**
   * Logout audit bersifat best-effort.
   */
  async recordLogout(
    user: { id: number; role: string },
    req: Request,
  ): Promise<void> {
    try {
      await this.record({
        userId: user.id,
        action: 'LOGOUT',
        targetTable: 'USERS',
        targetId: user.id,
        metadata: {
          role: user.role,
          ip_address: getClientIp(req),
          user_agent: getUserAgent(req),
          result: 'success',
        },
      });
    } catch (error) {
      console.error('Audit LOGOUT gagal dicatat:', error);
    }
  }

  async list(query: AuditLogQuery): Promise<AuditLogPageDto> {
    const { items, total } = await this.auditLogRepository.findPage(query);
    const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize);

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages,
      },
    };
  }

  async getById(id: number): Promise<AuditLogDto> {
    const item = await this.auditLogRepository.findById(id);

    if (!item) {
      throw new NotFoundError(
        'Catatan audit tidak ditemukan.',
        'AUDIT_NOT_FOUND',
      );
    }

    return item;
  }
}
