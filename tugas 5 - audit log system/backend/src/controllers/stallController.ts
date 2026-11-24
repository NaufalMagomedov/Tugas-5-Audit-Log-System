import type { Request, Response } from 'express';
import { StallService } from '../services/stallService.ts';
import { getUser } from '../middlewares/auth.ts';
import { getValidated } from '../middlewares/validate.ts';
import type {
  CreateStallInput,
  IdParam,
  StallQuery,
  UpdateStallInput,
} from '../schemas/stallSchema.ts';

export class StallController {
  private stallService: StallService;

  constructor(stallService: StallService = new StallService()) {
    this.stallService = stallService;
  }

  getStalls = async (_req: Request, res: Response): Promise<void> => {
    const query = getValidated<StallQuery>(res, 'query');
    const { data, total } = await this.stallService.getAllStalls({
      search: query.search,
      category: query.category,
      page: query.page,
      limit: query.limit,
    });
    res.status(200).json({
      status: 'success',
      meta: { page: query.page, limit: query.limit, total },
      data,
    });
  };

  getMyStalls = async (req: Request, res: Response): Promise<void> => {
    const { id } = getUser(req);
    const data = await this.stallService.getMyStalls(id);
    res.status(200).json({ status: 'success', data });
  };

  getCategories = async (_req: Request, res: Response): Promise<void> => {
    const data = await this.stallService.getCategories();
    res.status(200).json({ status: 'success', data });
  };

  getStallById = async (_req: Request, res: Response): Promise<void> => {
    const { id } = getValidated<IdParam>(res, 'params');
    const stall = await this.stallService.getStallById(id);
    res.status(200).json({ status: 'success', data: stall });
  };

  getStallMenus = async (_req: Request, res: Response): Promise<void> => {
    const { id } = getValidated<IdParam>(res, 'params');
    const menus = await this.stallService.getStallMenus(id);
    res.status(200).json({ status: 'success', data: menus });
  };

  createStall = async (req: Request, res: Response): Promise<void> => {
    const body = getValidated<CreateStallInput>(res, 'body');
    const user = getUser(req);

    const stall = await this.stallService.createStall(body, user);
    res.status(201).json({ status: 'success', data: stall });
  };

  updateStall = async (req: Request, res: Response): Promise<void> => {
    const { id } = getValidated<IdParam>(res, 'params');
    const body = getValidated<UpdateStallInput>(res, 'body');
    const user = getUser(req);

    const stall = await this.stallService.updateStall(id, body, user);
    res.status(200).json({ status: 'success', data: stall });
  };

  deleteStall = async (req: Request, res: Response): Promise<void> => {
    const { id } = getValidated<IdParam>(res, 'params');
    const user = getUser(req);

    const stall = await this.stallService.deleteStall(id, user);
    res.status(200).json({
      status: 'success',
      message: `Warung "${stall.name}" berhasil dihapus.`,
      data: stall,
    });
  };
}
