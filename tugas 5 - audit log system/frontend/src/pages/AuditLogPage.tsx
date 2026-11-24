import {
  ChevronLeft,
  ChevronRight,
  Eye,
  History,
  RotateCcw,
  ScrollText,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingPanel,
  Modal,
  PageHeader,
  Spinner,
} from '../components/ui.tsx';
import { getAuditLogById, getAuditLogs } from '../lib/api.ts';
import {
  actionLabel,
  actionTone,
  auditActionOptions,
  auditTargetOptions,
  extractIp,
  extractUserAgent,
  formatMetadata,
  targetLabel,
} from '../lib/audit.ts';
import { describeError } from '../lib/errors.ts';
import { formatDateTime } from '../lib/format.ts';
import type { AuditLog, AuditLogPagination } from '../types/auditLog.ts';

const PAGE_SIZE = 20;

interface FilterDraft {
  action: string;
  targetTable: string;
  targetId: string;
  userId: string;
  from: string;
  to: string;
}

const emptyFilters: FilterDraft = {
  action: '',
  targetTable: '',
  targetId: '',
  userId: '',
  from: '',
  to: '',
};

const emptyPagination: AuditLogPagination = {
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

const inputClass =
  'w-full rounded-control border border-border bg-surface px-3 py-1.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20';

/** Kunci unik per kombinasi filter/halaman, dipakai untuk menurunkan state loading. */
function makeRequestKey(page: number, filters: FilterDraft, retryToken: number): string {
  return [
    page,
    retryToken,
    filters.action,
    filters.targetTable,
    filters.targetId,
    filters.userId,
    filters.from,
    filters.to,
  ].join('|');
}

export function AuditLogPage() {
  const [draftFilters, setDraftFilters] = useState<FilterDraft>(emptyFilters);
  const [filters, setFilters] = useState<FilterDraft>(emptyFilters);
  const [page, setPage] = useState(1);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState<AuditLogPagination>(emptyPagination);
  const [error, setError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);

  // Loading diturunkan dari request yang sedang diminta vs yang sudah selesai.
  // Tidak perlu setState sinkron di dalam effect.
  const requestKey = makeRequestKey(page, filters, retryToken);
  const isLoading = loadedRequestKey !== requestKey;

  // State untuk modal detail (mengambil data dari GET /api/audit-logs/:id)
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const currentKey = makeRequestKey(page, filters, retryToken);

    getAuditLogs({
      page,
      pageSize: PAGE_SIZE,
      action: filters.action || undefined,
      targetTable: filters.targetTable || undefined,
      targetId: filters.targetId ? Number(filters.targetId) : undefined,
      userId: filters.userId ? Number(filters.userId) : undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    })
      .then((data) => {
        if (!active) return;
        setLogs(data.items);
        setPagination(data.pagination);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        const { message } = describeError(err);
        setError(message);
        setLogs([]);
        setPagination(emptyPagination);
      })
      .finally(() => {
        if (!active) return;
        setLoadedRequestKey(currentKey);
      });

    return () => {
      active = false;
    };
  }, [page, filters, retryToken]);

  const applyFilters = () => {
    setFilters({ ...draftFilters });
    setPage(1);
  };

  const resetFilters = () => {
    setDraftFilters(emptyFilters);
    setFilters(emptyFilters);
    setPage(1);
  };

  const handleOpenDetail = async (id: number) => {
    setSelectedId(id);
    setSelectedLog(null);
    setIsLoadingDetail(true);
    setDetailError(null);

    try {
      // Memanggil endpoint GET /api/audit-logs/:id (admin-only)
      const data = await getAuditLogById(id);
      setSelectedLog(data);
    } catch (err) {
      const { message } = describeError(err);
      setDetailError(message);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedId(null);
    setSelectedLog(null);
    setDetailError(null);
  };

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Riwayat Audit"
        description="Jejak audit seluruh aktivitas login, logout, warung, menu, dan review. Audit bersifat append-only dan tidak dapat diubah atau dihapus."
        actions={
          <span className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border bg-surface px-3 text-xs font-semibold text-text-muted">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Khusus Admin
          </span>
        }
      />

      {/* Filter Card */}
      <Card className="mb-6 p-4">
        <form
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters();
          }}
        >
          <div>
            <label htmlFor="filter-action" className="block text-xs font-semibold text-text-muted">
              Aksi
            </label>
            <select
              id="filter-action"
              className={`${inputClass} mt-1`}
              value={draftFilters.action}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, action: e.target.value }))}
            >
              <option value="">Semua aksi</option>
              {auditActionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-target" className="block text-xs font-semibold text-text-muted">
              Target Tabel
            </label>
            <select
              id="filter-target"
              className={`${inputClass} mt-1`}
              value={draftFilters.targetTable}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, targetTable: e.target.value }))}
            >
              <option value="">Semua target</option>
              {auditTargetOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-target-id" className="block text-xs font-semibold text-text-muted">
              Target ID
            </label>
            <input
              id="filter-target-id"
              type="number"
              min="1"
              placeholder="Contoh: 1"
              className={`${inputClass} mt-1`}
              value={draftFilters.targetId}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, targetId: e.target.value }))}
            />
          </div>

          <div>
            <label htmlFor="filter-user-id" className="block text-xs font-semibold text-text-muted">
              User ID
            </label>
            <input
              id="filter-user-id"
              type="number"
              min="1"
              placeholder="Contoh: 2"
              className={`${inputClass} mt-1`}
              value={draftFilters.userId}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, userId: e.target.value }))}
            />
          </div>

          <div>
            <label htmlFor="filter-from" className="block text-xs font-semibold text-text-muted">
              Dari Tanggal
            </label>
            <input
              id="filter-from"
              type="date"
              className={`${inputClass} mt-1`}
              value={draftFilters.from}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, from: e.target.value }))}
            />
          </div>

          <div>
            <label htmlFor="filter-to" className="block text-xs font-semibold text-text-muted">
              Sampai Tanggal
            </label>
            <input
              id="filter-to"
              type="date"
              className={`${inputClass} mt-1`}
              value={draftFilters.to}
              onChange={(e) => setDraftFilters((prev) => ({ ...prev, to: e.target.value }))}
            />
          </div>

          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-6 justify-end pt-2 border-t border-border/50">
            <Button variant="secondary" onClick={resetFilters} className="text-xs">
              <RotateCcw className="size-3.5 mr-1" aria-hidden="true" />
              Reset
            </Button>
            <Button type="submit" variant="primary" className="text-xs">
              Terapkan Filter
            </Button>
          </div>
        </form>
      </Card>

      {/* Konten Riwayat Audit */}
      {isLoading ? (
        <LoadingPanel message="Memuat riwayat audit..." />
      ) : error ? (
        <Alert tone="error">
          <div className="font-bold">Gagal memuat catatan audit</div>
          <p className="mt-1">{error}</p>
          <Button variant="secondary" onClick={() => setRetryToken((t) => t + 1)} className="mt-3 text-xs">
            Coba lagi
          </Button>
        </Alert>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={History}
          title="Tidak ada catatan audit"
          message="Belum ada riwayat audit yang cocok dengan filter yang Anda gunakan."
          action={
            <Button variant="secondary" onClick={resetFilters}>
              Reset filter
            </Button>
          }
        />
      ) : (
        <>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-3">Waktu</th>
                  <th className="px-4 py-3">Pelaku</th>
                  <th className="px-4 py-3">Aksi</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-muted/50 transition">
                    <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-text">{log.userName ?? 'Sistem'}</div>
                      <div className="text-xs text-text-muted">
                        {log.userEmail ?? '-'} {log.userId ? `(ID: ${log.userId})` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Badge tone={actionTone(log.action)}>
                        {actionLabel(log.action)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-semibold text-text">
                        {targetLabel(log.targetTable)}
                      </span>
                      {log.targetId !== null && (
                        <span className="ml-1 text-xs text-text-muted font-mono">
                          #{log.targetId}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-text-muted whitespace-nowrap">
                      {extractIp(log.metadata)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Button
                        variant="secondary"
                        className="min-h-8 px-2.5 text-xs"
                        onClick={() => handleOpenDetail(log.id)}
                      >
                        <Eye className="size-3.5 mr-1" aria-hidden="true" />
                        Lihat
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Pagination */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-xs text-text-muted">
              Menampilkan {logs.length} dari {pagination.total} catatan
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="min-h-8 px-2.5 text-xs"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4 mr-1" aria-hidden="true" />
                Sebelumnya
              </Button>
              <span className="text-xs font-semibold text-text-muted px-2">
                Halaman {pagination.totalPages === 0 ? 0 : pagination.page} dari {pagination.totalPages}
              </span>
              <Button
                variant="secondary"
                className="min-h-8 px-2.5 text-xs"
                disabled={page >= pagination.totalPages || isLoading}
                onClick={() => setPage((p) => p + 1)}
              >
                Berikutnya
                <ChevronRight className="size-4 ml-1" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Modal Detail Audit (memanggil GET /:id dan menampilkan metadata, ip_address, user_agent) */}
      {selectedId !== null && (
        <Modal
          title={`Detail Catatan Audit #${selectedId}`}
          onClose={handleCloseDetail}
          footer={
            <Button variant="secondary" onClick={handleCloseDetail}>
              Tutup
            </Button>
          }
        >
          {isLoadingDetail ? (
            <div className="py-8 flex flex-col items-center justify-center">
              <Spinner className="size-8 text-primary" />
              <p className="mt-2 text-sm text-text-muted">Memuat detail dari server...</p>
            </div>
          ) : detailError ? (
            <Alert tone="error">
              <div className="font-bold">Gagal memuat detail</div>
              <p className="mt-1">{detailError}</p>
            </Alert>
          ) : selectedLog ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-border bg-surface-muted/50 p-3">
                <ScrollText className="size-4 text-primary" aria-hidden="true" />
                <Badge tone={actionTone(selectedLog.action)}>
                  {actionLabel(selectedLog.action)}
                </Badge>
                <span className="text-xs text-text-muted font-medium">
                  Target: {targetLabel(selectedLog.targetTable)}
                  {selectedLog.targetId !== null ? ` #${selectedLog.targetId}` : ''}
                </span>
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold text-text-muted">Waktu Pencatatan</dt>
                  <dd className="m-0 font-medium text-text mt-0.5">
                    {formatDateTime(selectedLog.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-muted">Pelaku (User ID)</dt>
                  <dd className="m-0 font-medium text-text mt-0.5">
                    {selectedLog.userName ?? 'Sistem'} {selectedLog.userId ? `(#${selectedLog.userId})` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-muted">Email Pelaku</dt>
                  <dd className="m-0 font-medium text-text mt-0.5">
                    {selectedLog.userEmail ?? '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-text-muted">IP Address</dt>
                  <dd className="m-0 font-mono text-xs font-bold text-primary-dark mt-0.5">
                    {extractIp(selectedLog.metadata)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold text-text-muted">User Agent</dt>
                  <dd className="m-0 font-mono text-xs text-text-muted break-all mt-0.5 bg-surface-muted p-2 rounded-control">
                    {extractUserAgent(selectedLog.metadata)}
                  </dd>
                </div>
              </dl>

              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-text-muted">
                  Metadata Lengkap
                </p>
                <pre className="m-0 max-h-64 overflow-auto rounded-control bg-surface-muted p-3 font-mono text-xs leading-relaxed text-text border border-border">
                  {formatMetadata(selectedLog.metadata)}
                </pre>
              </div>
            </div>
          ) : null}
        </Modal>
      )}
    </>
  );
}
