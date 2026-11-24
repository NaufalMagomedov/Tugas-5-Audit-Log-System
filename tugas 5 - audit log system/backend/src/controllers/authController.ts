import type { Request, Response } from 'express';
import { AuthService } from '../services/authService.ts';
import { AuditLogService } from '../services/auditLogService.ts';
import { extractToken, getUser } from '../middlewares/auth.ts';
import { getValidated } from '../middlewares/validate.ts';
import { clearAuthCookie, setAuthCookie } from '../utils/cookie.ts';
import { verifyToken, type AuthUser } from '../services/tokenService.ts';
import type { LoginInput, RegisterInput } from '../schemas/authSchema.ts';

export class AuthController {
  private authService: AuthService;
  private auditLogService: AuditLogService;

  constructor(
    authService: AuthService = new AuthService(),
    auditLogService: AuditLogService = new AuditLogService(),
  ) {
    this.authService = authService;
    this.auditLogService = auditLogService;
  }

  register = async (_req: Request, res: Response): Promise<void> => {
    const body = getValidated<RegisterInput>(res, 'body');
    const user = await this.authService.register(body);

    res.status(201).json({
      status: 'success',
      message: 'Akun berhasil dibuat. Silakan masuk.',
      data: user,
    });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const body = getValidated<LoginInput>(res, 'body');
    const { token, user } = await this.authService.login(body);

    setAuthCookie(res, token);

    // Audit log LOGIN dicatat secara best-effort
    await this.auditLogService.recordLogin(user, req);

    res.status(200).json({ status: 'success', message: 'Berhasil masuk ke Maem Bolo.', data: user });
  };

  me = async (req: Request, res: Response): Promise<void> => {
    const { id } = getUser(req);
    const data = await this.authService.me(id);
    res.status(200).json({ status: 'success', data });
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    const token = extractToken(req);
    let user: AuthUser | null = req.user ?? null;

    if (!user && token) {
      try {
        user = verifyToken(token);
      } catch {
        // Abaikan jika token kedaluwarsa atau invalid
      }
    }

    if (user) {
      await this.auditLogService.recordLogout(user, req);
    }

    clearAuthCookie(res);
    res.status(200).json({ status: 'success', message: 'Berhasil keluar.', data: { loggedOut: true } });
  };
}
