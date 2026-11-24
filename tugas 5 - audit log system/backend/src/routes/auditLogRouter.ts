import { Router } from 'express';
import { AuditLogController } from '../controllers/auditLogController.ts';
import { authenticate } from '../middlewares/auth.ts';
import { authorize } from '../middlewares/authorize.ts';

const router = Router();
const controller = new AuditLogController();

router.use(authenticate, authorize('admin'));

router.get('/', controller.list);
router.get('/:id', controller.getById);

export const auditLogRouter = router;
