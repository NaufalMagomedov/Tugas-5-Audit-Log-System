import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { env } from '../config/env.ts';
import { loginSchema, registerSchema } from '../schemas/authSchema.ts';
import { createMenuSchema, updateMenuSchema } from '../schemas/menuSchema.ts';
import { createReviewSchema } from '../schemas/reviewSchema.ts';
import { createStallSchema, idParamSchema, stallQuerySchema, updateStallSchema } from '../schemas/stallSchema.ts';
import { z } from '../schemas/z.ts';

const registry = new OpenAPIRegistry();
const json = <T extends z.ZodTypeAny>(schema: T) => ({ 'application/json': { schema } });

// ============================================================================
// 1. SCHEMA RESPONS
// ============================================================================

const errorSchema = registry.register(
  'ErrorResponse',
  z.object({
    status: z.enum(['fail', 'error']).openapi({ example: 'fail' }),
    code: z.string().openapi({ example: 'VALIDATION_ERROR' }),
    message: z.string().openapi({ example: 'Data yang dikirim tidak valid.' }),
    errors: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional()
      .openapi({ example: [{ field: 'name', message: 'name minimal 3 karakter' }] }),
    requestId: z.string().optional().openapi({ example: '8b7f0f5e-4e86-4f4e-9a77-6b1f5a9f0c11' }),
  }),
);

const authUser = registry.register(
  'AuthUser',
  z.object({
    id: z.number().openapi({ example: 1 }),
    name: z.string().openapi({ example: 'Admin Kantin' }),
    email: z.string().openapi({ example: 'admin@kantin.test' }),
    role: z.enum(['admin', 'owner', 'customer']).openapi({ example: 'admin' }),
  }),
);

const stall = registry.register(
  'Stall',
  z.object({
    id: z.number().openapi({ example: 1 }),
    ownerId: z.number().openapi({ example: 2 }),
    name: z.string().openapi({ example: 'Warung Bu Tini' }),
    category: z.string().nullable().openapi({ example: 'Kwetiau' }),
    location: z.string().nullable().openapi({ example: 'Kantin FKIP' }),
    description: z.string().nullable().openapi({ example: 'Kedai kwetiau goreng & kuah' }),
    imageUrl: z.string().nullable().openapi({ example: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=1200&q=70' }),
    avgRating: z.number().openapi({ example: 4.5 }),
    reviewCount: z.number().openapi({ example: 2 }),
    isPopular: z.boolean().openapi({ example: false }),
  }),
);

const menu = registry.register(
  'Menu',
  z.object({
    id: z.number().openapi({ example: 1 }),
    stallId: z.number().openapi({ example: 2 }),
    name: z.string().openapi({ example: 'Kwetiau Goreng Spesial' }),
    price: z.number().openapi({ example: 15000 }),
    isAvailable: z.boolean().openapi({ example: true }),
    imageUrl: z.string().nullable().openapi({ example: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=70' }),
  }),
);

const review = registry.register(
  'Review',
  z.object({
    id: z.number().openapi({ example: 1 }),
    stallId: z.number().openapi({ example: 1 }),
    userId: z.number().openapi({ example: 3 }),
    rating: z.number().openapi({ example: 5 }),
    comment: z.string().nullable().openapi({ example: 'Kwetiaunya enak banget!' }),
    likeCount: z.number().openapi({ example: 0 }),
    createdAt: z.string().nullable().openapi({ example: '2026-11-01T08:00:00.000Z' }),
  }),
);

const reviewListItem = registry.register('ReviewListItem', review.extend({ userName: z.string().openapi({ example: 'Bagas' }) }));

const report = registry.register(
  'ReportSummary',
  z.object({
    totalUsers: z.number().openapi({ example: 12 }),
    totalStalls: z.number().openapi({ example: 10 }),
    totalReviews: z.number().openapi({ example: 25 }),
    averageRating: z.number().openapi({ example: 4.3 }),
    stallsByCategory: z.array(z.object({ category: z.string().nullable(), total: z.number() })),
  }),
);

const auditLog = registry.register(
  'AuditLog',
  z.object({
    id: z.number().openapi({ example: 21 }),
    userId: z.number().nullable().openapi({ example: 1 }),
    userName: z.string().nullable().openapi({ example: 'Admin Kantin' }),
    userEmail: z.string().nullable().openapi({ example: 'admin@kantin.test' }),
    action: z.string().openapi({ example: 'LOGOUT' }),
    targetTable: z.string().openapi({ example: 'USERS' }),
    targetId: z.number().nullable().openapi({ example: 1 }),
    metadata: z.record(z.string(), z.any()).nullable().openapi({
      example: {
        role: 'admin',
        ip_address: '::1',
        user_agent: 'Mozilla/5.0',
        result: 'success',
      },
    }),
    createdAt: z.string().openapi({ example: '2026-11-11T10:15:00.000Z' }),
  }),
);

const auditPagination = registry.register(
  'AuditPagination',
  z.object({
    page: z.number().openapi({ example: 1 }),
    pageSize: z.number().openapi({ example: 20 }),
    total: z.number().openapi({ example: 1 }),
    totalPages: z.number().openapi({ example: 1 }),
  }),
);

const auditLogQuery = registry.register(
  'AuditLogQuery',
  z.object({
    page: z.coerce.number().int().min(1).optional().openapi({ example: 1, description: 'Minimal 1' }),
    pageSize: z.coerce.number().int().min(1).max(100).optional().openapi({ example: 20, description: '1-100' }),
    action: z.string().max(50).optional().openapi({ example: 'LOGOUT' }),
    targetTable: z.string().max(50).optional().openapi({ example: 'USERS' }),
    targetId: z.coerce.number().int().positive().optional().openapi({ example: 1 }),
    userId: z.coerce.number().int().positive().optional().openapi({ example: 1 }),
    from: z.string().optional().openapi({ example: '2026-11-01', description: 'YYYY-MM-DD, inklusif' }),
    to: z.string().optional().openapi({ example: '2026-11-30', description: 'YYYY-MM-DD, inklusif' }),
  }),
);

const ok = <T extends z.ZodTypeAny>(name: string, data: T) =>
  registry.register(name, z.object({ status: z.literal('success'), message: z.string().optional(), data }));

const registerInput = registry.register('RegisterInput', registerSchema);
const loginInput = registry.register('LoginInput', loginSchema);
const stallInput = registry.register('StallInput', createStallSchema);
const stallUpdate = registry.register('StallUpdate', updateStallSchema);
const menuInput = registry.register('MenuInput', createMenuSchema);
const menuUpdate = registry.register('MenuUpdate', updateMenuSchema);
const reviewInput = registry.register('ReviewInput', createReviewSchema);

// ============================================================================
// 2. KEAMANAN — sesi lewat cookie httpOnly
// ============================================================================

registry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: env.authCookieName,
  description:
    'Cookie sesi httpOnly yang dipasang server saat POST /auth/login. Di Swagger UI cukup ' +
    'jalankan login sekali — browser otomatis mengirim cookie pada request berikutnya.',
});
const secured = [{ cookieAuth: [] }];

const errorResponse = (description: string) => ({ description, content: json(errorSchema) });
const unauthorized = { 401: errorResponse('UNAUTHORIZED — belum login atau sesi kedaluwarsa') };
const forbidden = { 403: errorResponse('FORBIDDEN / STALL_FORBIDDEN / MENU_FORBIDDEN / REVIEW_FORBIDDEN') };
const badRequest = { 400: errorResponse('VALIDATION_ERROR / INVALID_JSON') };

// ============================================================================
// 3. ENDPOINT
// ============================================================================

registry.registerPath({
  method: 'get',
  path: '/health',
  summary: 'Cek server dan koneksi database',
  tags: ['System'],
  responses: {
    200: { description: 'Server & database terhubung', content: json(z.object({ status: z.literal('success'), message: z.string(), timestamp: z.string() })) },
    500: errorResponse('DATABASE_ERROR'),
  },
});

// --- Auth ---
registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/register',
  summary: 'Daftar akun customer',
  description: 'Role selalu `customer` (ditentukan server). Register TIDAK membuat sesi.',
  tags: ['Auth'],
  request: { body: { content: json(registerInput) } },
  responses: {
    201: { description: 'Akun dibuat', content: json(ok('RegisterResponse', authUser)) },
    ...badRequest,
    409: errorResponse('EMAIL_TAKEN'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/login',
  summary: 'Login — server memasang cookie sesi httpOnly',
  tags: ['Auth'],
  request: { body: { content: json(loginInput) } },
  responses: {
    200: { description: 'Berhasil masuk. Header Set-Cookie berisi JWT (httpOnly).', content: json(ok('LoginResponse', authUser)) },
    ...badRequest,
    401: errorResponse('UNAUTHORIZED — email atau password salah'),
  },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/auth/logout',
  summary: 'Logout — menghapus cookie sesi',
  tags: ['Auth'],
  responses: { 200: { description: 'Cookie dihapus', content: json(ok('LogoutResponse', z.object({ loggedOut: z.boolean() }))) } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/me',
  summary: 'User pemilik sesi (data terbaru dari database)',
  tags: ['Auth'],
  security: secured,
  responses: { 200: { description: 'User saat ini', content: json(ok('MeResponse', authUser)) }, ...unauthorized },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/auth/profile',
  summary: 'Profil dari database',
  tags: ['Auth'],
  security: secured,
  responses: { 200: { description: 'Profil', content: json(ok('ProfileResponse', authUser)) }, ...unauthorized, 404: errorResponse('USER_NOT_FOUND') },
});

// --- Stalls ---
registry.registerPath({
  method: 'get',
  path: '/api/v1/stalls',
  summary: 'Daftar warung (publik) dengan search, filter kategori, dan pagination',
  tags: ['Stalls'],
  request: { query: stallQuerySchema },
  responses: {
    200: {
      description: 'Daftar warung',
      content: json(
        z.object({
          status: z.literal('success'),
          meta: z.object({ page: z.number(), limit: z.number(), total: z.number() }),
          data: z.array(stall),
        }),
      ),
    },
    ...badRequest,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/stalls/categories',
  summary: 'Daftar kategori warung yang ada',
  tags: ['Stalls'],
  responses: { 200: { description: 'Kategori unik', content: json(ok('CategoryListResponse', z.array(z.string()))) } },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/stalls/mine',
  summary: 'Warung milik owner yang login',
  tags: ['Stalls'],
  security: secured,
  responses: { 200: { description: 'Warung milik sendiri', content: json(ok('MyStallsResponse', z.array(stall))) }, ...unauthorized, ...forbidden },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/stalls/{id}',
  summary: 'Detail warung (publik)',
  tags: ['Stalls'],
  request: { params: idParamSchema },
  responses: { 200: { description: 'Detail warung', content: json(ok('StallResponse', stall)) }, ...badRequest, 404: errorResponse('STALL_NOT_FOUND') },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/stalls',
  summary: 'Buat warung (owner/admin) — pemilik = user yang login',
  tags: ['Stalls'],
  security: secured,
  request: { body: { content: json(stallInput) } },
  responses: { 201: { description: 'Warung dibuat', content: json(ok('StallCreatedResponse', stall)) }, ...badRequest, ...unauthorized, ...forbidden },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/stalls/{id}',
  summary: 'Ubah warung (owner pemilik / admin)',
  tags: ['Stalls'],
  security: secured,
  request: { params: idParamSchema, body: { content: json(stallUpdate) } },
  responses: { 200: { description: 'Warung diubah', content: json(ok('StallUpdatedResponse', stall)) }, ...badRequest, ...unauthorized, ...forbidden, 404: errorResponse('STALL_NOT_FOUND') },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/stalls/{id}',
  summary: 'Hapus warung (admin, atau owner pemilik warung)',
  tags: ['Stalls'],
  security: secured,
  request: { params: idParamSchema },
  responses: {
    200: { description: 'Warung dihapus', content: json(ok('StallDeletedResponse', stall)) },
    ...badRequest,
    ...unauthorized,
    ...forbidden,
    404: errorResponse('STALL_NOT_FOUND'),
    409: errorResponse('STALL_HAS_RELATIONS — masih punya menu/review'),
  },
});

// --- Menus ---
registry.registerPath({
  method: 'get',
  path: '/api/v1/stalls/{id}/menus',
  summary: 'Menu sebuah warung (publik)',
  tags: ['Menus'],
  request: { params: idParamSchema },
  responses: { 200: { description: 'Daftar menu', content: json(ok('MenuListResponse', z.array(menu))) }, ...badRequest, 404: errorResponse('STALL_NOT_FOUND') },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/stalls/{id}/menus',
  summary: 'Tambah menu ke warung (owner pemilik / admin)',
  tags: ['Menus'],
  security: secured,
  request: { params: idParamSchema, body: { content: json(menuInput) } },
  responses: {
    201: { description: 'Menu dibuat', content: json(ok('MenuCreatedResponse', menu)) },
    ...badRequest,
    ...unauthorized,
    ...forbidden,
    404: errorResponse('STALL_NOT_FOUND'),
    409: errorResponse('MENU_NAME_TAKEN'),
  },
});

registry.registerPath({
  method: 'put',
  path: '/api/v1/menus/{id}',
  summary: 'Ubah menu (owner pemilik warung / admin)',
  tags: ['Menus'],
  security: secured,
  request: { params: idParamSchema, body: { content: json(menuUpdate) } },
  responses: {
    200: { description: 'Menu diubah', content: json(ok('MenuUpdatedResponse', menu)) },
    ...badRequest,
    ...unauthorized,
    ...forbidden,
    404: errorResponse('MENU_NOT_FOUND'),
    409: errorResponse('MENU_NAME_TAKEN'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/menus/{id}',
  summary: 'Hapus menu (owner pemilik warung / admin)',
  tags: ['Menus'],
  security: secured,
  request: { params: idParamSchema },
  responses: { 204: { description: 'Menu dihapus (tanpa body)' }, ...badRequest, ...unauthorized, ...forbidden, 404: errorResponse('MENU_NOT_FOUND') },
});

// --- Reviews ---
registry.registerPath({
  method: 'get',
  path: '/api/v1/stalls/{id}/reviews',
  summary: 'Review sebuah warung (publik, terbaru dulu)',
  tags: ['Reviews'],
  request: { params: idParamSchema },
  responses: { 200: { description: 'Daftar review', content: json(ok('ReviewListResponse', z.array(reviewListItem))) }, ...badRequest, 404: errorResponse('STALL_NOT_FOUND') },
});

registry.registerPath({
  method: 'post',
  path: '/api/v1/stalls/{id}/reviews',
  summary: 'Tambah review (semua role login) — userId dari sesi',
  tags: ['Reviews'],
  security: secured,
  request: { params: idParamSchema, body: { content: json(reviewInput) } },
  responses: {
    201: { description: 'Review dibuat', content: json(ok('ReviewCreatedResponse', review)) },
    ...badRequest,
    ...unauthorized,
    404: errorResponse('STALL_NOT_FOUND'),
    409: errorResponse('REVIEW_ALREADY_EXISTS'),
  },
});

registry.registerPath({
  method: 'delete',
  path: '/api/v1/reviews/{id}',
  summary: 'Hapus review (penulis / admin)',
  tags: ['Reviews'],
  security: secured,
  request: { params: idParamSchema },
  responses: {
    204: { description: 'Review dihapus (tanpa body)' },
    ...badRequest,
    ...unauthorized,
    ...forbidden,
    404: errorResponse('REVIEW_NOT_FOUND'),
    409: errorResponse('REVIEW_HAS_RELATIONS'),
  },
});

// --- Uploads ---
registry.registerPath({
  method: 'post',
  path: '/api/v1/uploads',
  summary: 'Unggah gambar warung/menu (owner/admin) — body biner image/*',
  description:
    'Kirim file sebagai body mentah dengan Content-Type image/jpeg, image/png, ' +
    'image/webp, atau image/gif. Maksimal 5 MB. Respons berisi URL absolut yang ' +
    'siap diisi ke field imageUrl pada warung/menu.',
  tags: ['Uploads'],
  security: secured,
  request: {
    body: {
      content: {
        'image/jpeg': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
        'image/png': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
        'image/webp': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
        'image/gif': { schema: z.string().openapi({ type: 'string', format: 'binary' }) },
      },
    },
  },
  responses: {
    201: {
      description: 'Gambar tersimpan',
      content: json(ok('UploadResponse', z.object({ url: z.string() }))),
    },
    ...badRequest,
    ...unauthorized,
    ...forbidden,
    413: errorResponse('PAYLOAD_TOO_LARGE'),
  },
});

// --- Audit Logs (admin only) ---
registry.registerPath({
  method: 'get',
  path: '/api/v1/audit-logs',
  summary: 'Daftar audit log (admin) — filter digabung dengan AND',
  description:
    'Hasil diurutkan created_at DESC lalu id DESC. Pagination dihitung dari baris ' +
    'yang lolos filter. userName dan userEmail diambil dari tabel USERS saat dibaca.',
  tags: ['Audit Logs'],
  security: secured,
  request: { query: auditLogQuery },
  responses: {
    200: {
      description: 'Daftar audit log',
      content: json(
        ok(
          'AuditLogListResponse',
          z.object({ items: z.array(auditLog), pagination: auditPagination }),
        ),
      ),
    },
    ...badRequest,
    ...unauthorized,
    ...forbidden,
  },
});

registry.registerPath({
  method: 'get',
  path: '/api/v1/audit-logs/{id}',
  summary: 'Detail satu audit log (admin)',
  tags: ['Audit Logs'],
  security: secured,
  request: { params: idParamSchema },
  responses: {
    200: { description: 'Detail audit log', content: json(ok('AuditLogDetailResponse', auditLog)) },
    ...badRequest,
    ...unauthorized,
    ...forbidden,
    404: errorResponse('AUDIT_NOT_FOUND'),
  },
});

// --- Admin ---
registry.registerPath({
  method: 'get',
  path: '/api/v1/admin/reports',
  summary: 'Ringkasan laporan (admin)',
  tags: ['Admin'],
  security: secured,
  responses: {
    200: {
      description: 'Ringkasan data',
      content: json(z.object({ status: z.literal('success'), meta: z.object({ requestedBy: z.string() }), data: report })),
    },
    ...unauthorized,
    ...forbidden,
  },
});

// ============================================================================
// 4. DOKUMEN
// ============================================================================

const generator = new OpenApiGeneratorV3(registry.definitions);

export const openApiDocument = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    title: 'Review Kantin API',
    version: '3.0.0',
    description:
      'Dibangkitkan otomatis dari schema zod. Semua error memakai kontrak ' +
      '`{ status, code, message, errors?, requestId }`. Login dulu lewat POST /auth/login ' +
      'agar browser menyimpan cookie sesi.',
  },
  servers: [{ url: `http://localhost:${env.port}` }],
});
