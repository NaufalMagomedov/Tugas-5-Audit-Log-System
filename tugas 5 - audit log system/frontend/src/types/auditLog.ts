export interface AuditLog {
  id: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  targetTable: string;
  targetId: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuditLogListResponse {
  items: AuditLog[];
  pagination: AuditLogPagination;
}

export interface AuditLogQueryFilters {
  page?: number;
  pageSize?: number;
  action?: string;
  targetTable?: string;
  targetId?: number;
  userId?: number;
  from?: string;
  to?: string;
}
