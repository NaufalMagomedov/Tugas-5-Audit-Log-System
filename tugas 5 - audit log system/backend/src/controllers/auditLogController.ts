import type { Request, Response } from 'express';
import {
  parseAuditLogId,
  parseAuditLogQuery,
} from '../schemas/auditLogSchema.ts';
import { AuditLogService } from '../services/auditLogService.ts';

export class AuditLogController {
  constructor(
    private readonly auditLogService: AuditLogService = new AuditLogService(),
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = parseAuditLogQuery(req.query);
    const data = await this.auditLogService.list(query);
    res.status(200).json({ status: 'success', data });
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const id = parseAuditLogId(req.params.id);
    const data = await this.auditLogService.getById(id);
    res.status(200).json({ status: 'success', data });
  };
}
