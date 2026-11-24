export const auditActionOptions = [
  { value: 'LOGIN', label: 'Login' },
  { value: 'LOGOUT', label: 'Logout' },
  { value: 'CREATE_STALL', label: 'Tambah Warung' },
  { value: 'UPDATE_STALL', label: 'Ubah Warung' },
  { value: 'DELETE_STALL', label: 'Hapus Warung' },
  { value: 'CREATE_MENU', label: 'Tambah Menu' },
  { value: 'UPDATE_MENU', label: 'Ubah Menu' },
  { value: 'DELETE_MENU', label: 'Hapus Menu' },
  { value: 'CREATE_REVIEW', label: 'Tambah Review' },
  { value: 'DELETE_REVIEW', label: 'Hapus Review' },
];

export const auditTargetOptions = [
  { value: 'USERS', label: 'USERS (Pengguna)' },
  { value: 'STALLS', label: 'STALLS (Warung)' },
  { value: 'MENU_ITEMS', label: 'MENU_ITEMS (Menu)' },
  { value: 'REVIEWS', label: 'REVIEWS (Review)' },
];

export function actionLabel(action: string): string {
  const match = auditActionOptions.find((opt) => opt.value === action);
  return match ? match.label : action;
}

export function targetLabel(targetTable: string): string {
  const match = auditTargetOptions.find((opt) => opt.value === targetTable);
  return match ? match.label : targetTable;
}

export function actionTone(action: string): 'neutral' | 'success' | 'warning' | 'danger' | 'primary' {
  if (action === 'LOGIN' || action === 'LOGOUT') return 'primary';
  if (action.startsWith('CREATE_')) return 'success';
  if (action.startsWith('UPDATE_')) return 'warning';
  if (action.startsWith('DELETE_')) return 'danger';
  return 'neutral';
}

export function formatMetadata(metadata: unknown): string {
  if (metadata === null || metadata === undefined) {
    return '(kosong)';
  }

  if (typeof metadata === 'string') {
    try {
      return JSON.stringify(JSON.parse(metadata), null, 2);
    } catch {
      return metadata;
    }
  }

  return JSON.stringify(metadata, null, 2);
}

export function extractIp(metadata: unknown): string {
  if (metadata && typeof metadata === 'object' && 'ip_address' in metadata) {
    const ip = (metadata as { ip_address?: unknown }).ip_address;
    if (typeof ip === 'string' && ip.trim()) return ip.trim();
  }
  return '-';
}

export function extractUserAgent(metadata: unknown): string {
  if (metadata && typeof metadata === 'object' && 'user_agent' in metadata) {
    const ua = (metadata as { user_agent?: unknown }).user_agent;
    if (typeof ua === 'string' && ua.trim()) return ua.trim();
  }
  return '-';
}
