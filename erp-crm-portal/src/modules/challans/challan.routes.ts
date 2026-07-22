import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { idParamSchema } from '../../common/validators';
import { UserRole } from '../../common/enums';
import {
  createChallanSchema,
  invoiceQuerySchema,
  listChallansQuerySchema,
  updateChallanStatusSchema,
} from './challan.validation';
import {
  createChallanController,
  exportInvoiceController,
  getChallanController,
  listChallansController,
  updateChallanStatusController,
} from './challan.controller';

const router = Router();

router.use(authenticate);

/** POST /challans - Admin, Sales */
router.post('/', authorize(UserRole.SALES), validate({ body: createChallanSchema }), createChallanController);

/** GET /challans - all authenticated roles */
router.get(
  '/',
  authorize(UserRole.SALES, UserRole.WAREHOUSE, UserRole.ACCOUNTS),
  validate({ query: listChallansQuerySchema }),
  listChallansController,
);

/** GET /challans/:id - all authenticated roles */
router.get(
  '/:id',
  authorize(UserRole.SALES, UserRole.WAREHOUSE, UserRole.ACCOUNTS),
  validate({ params: idParamSchema }),
  getChallanController,
);

/** PATCH /challans/:id/status - Admin, Sales, Warehouse */
router.patch(
  '/:id/status',
  authorize(UserRole.SALES, UserRole.WAREHOUSE),
  validate({ params: idParamSchema, body: updateChallanStatusSchema }),
  updateChallanStatusController,
);

/** GET /challans/:id/invoice - PDF export. Admin, Sales, Accounts */
router.get(
  '/:id/invoice',
  authorize(UserRole.SALES, UserRole.ACCOUNTS),
  validate({ params: idParamSchema, query: invoiceQuerySchema }),
  exportInvoiceController,
);

export default router;
