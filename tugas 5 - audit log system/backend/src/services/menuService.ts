import { MenuItemRepository } from '../repositories/menuItemRepository.ts';
import { StallRepository } from '../repositories/stallRepository.ts';
import { AuditLogService } from './auditLogService.ts';
import { withTransaction } from '../db/transaction.ts';
import type { MenuItemDto } from '../dtos/stallDto.ts';
import { ConflictError } from '../errors/ConflictError.ts';
import { ForbiddenError } from '../errors/ForbiddenError.ts';
import { NotFoundError } from '../errors/NotFoundError.ts';
import type { CreateMenuInput, UpdateMenuInput } from '../schemas/menuSchema.ts';
import { canManageStall } from './ownership.ts';
import type { AuthUser } from './tokenService.ts';

const stallNotFound = () => new NotFoundError('Warung tidak ditemukan.', 'STALL_NOT_FOUND');
const menuNotFound = () => new NotFoundError('Menu tidak ditemukan.', 'MENU_NOT_FOUND');
const nameTaken = () =>
  new ConflictError('Nama menu sudah dipakai di warung ini.', 'MENU_NAME_TAKEN', [
    { field: 'name', message: 'Warung ini sudah punya menu dengan nama yang sama.' },
  ]);

export class MenuService {
  private menuRepository: MenuItemRepository;
  private stallRepository: StallRepository;
  private auditLogService: AuditLogService;

  constructor(
    menuRepository: MenuItemRepository = new MenuItemRepository(),
    stallRepository: StallRepository = new StallRepository(),
    auditLogService: AuditLogService = new AuditLogService(),
  ) {
    this.menuRepository = menuRepository;
    this.stallRepository = stallRepository;
    this.auditLogService = auditLogService;
  }

  async createMenu(stallId: number, input: CreateMenuInput, user: AuthUser): Promise<MenuItemDto> {
    const stall = await this.stallRepository.findById(stallId);
    if (!stall) throw stallNotFound();

    if (!canManageStall(stall.ownerId, user)) {
      throw new ForbiddenError('Kamu hanya bisa menambah menu pada warung milikmu sendiri.', 'STALL_FORBIDDEN');
    }

    if (await this.menuRepository.findByStallAndName(stallId, input.name)) throw nameTaken();

    return withTransaction(async (transaction) => {
      const row = await this.menuRepository.create({ stallId, ...input }, transaction);
      if (!row) throw new NotFoundError('Menu gagal dibuat.', 'MENU_NOT_CREATED');

      await this.auditLogService.record(
        {
          userId: user.id,
          action: 'CREATE_MENU',
          targetTable: 'MENU_ITEMS',
          targetId: row.id,
          metadata: { after: row },
        },
        transaction,
      );

      return row;
    });
  }

  async updateMenu(id: number, input: UpdateMenuInput, user: AuthUser): Promise<MenuItemDto> {
    const current = await this.menuRepository.findById(id);
    if (!current) throw menuNotFound();

    const stall = await this.stallRepository.findById(current.stallId);
    if (!stall) throw stallNotFound();

    if (!canManageStall(stall.ownerId, user)) {
      throw new ForbiddenError('Kamu hanya bisa mengubah menu pada warung milikmu sendiri.', 'MENU_FORBIDDEN');
    }

    if (input.name !== undefined && (await this.menuRepository.findByStallAndName(current.stallId, input.name, id))) {
      throw nameTaken();
    }

    return withTransaction(async (transaction) => {
      const row = await this.menuRepository.update(id, input, transaction);
      if (!row) throw menuNotFound();

      const changed = Object.keys(input);

      await this.auditLogService.record(
        {
          userId: user.id,
          action: 'UPDATE_MENU',
          targetTable: 'MENU_ITEMS',
          targetId: id,
          metadata: {
            before: current,
            after: row,
            changed,
          },
        },
        transaction,
      );

      return row;
    });
  }

  async deleteMenu(id: number, user: AuthUser): Promise<MenuItemDto> {
    const current = await this.menuRepository.findById(id);
    if (!current) throw menuNotFound();

    const stall = await this.stallRepository.findById(current.stallId);
    if (!stall) throw stallNotFound();

    if (!canManageStall(stall.ownerId, user)) {
      throw new ForbiddenError('Kamu hanya bisa menghapus menu pada warung milikmu sendiri.', 'MENU_FORBIDDEN');
    }

    return withTransaction(async (transaction) => {
      const row = await this.menuRepository.remove(id, transaction);
      if (!row) throw menuNotFound();

      await this.auditLogService.record(
        {
          userId: user.id,
          action: 'DELETE_MENU',
          targetTable: 'MENU_ITEMS',
          targetId: id,
          metadata: { before: current },
        },
        transaction,
      );

      return row;
    });
  }
}
