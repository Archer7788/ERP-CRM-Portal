import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { idParamSchema } from '../../common/validators';
import { UserRole } from '../../common/enums';
import { inventoryQuerySchema, movementsQuerySchema, stockAdjustmentSchema } from './inventory.validation';
import {
  adjustStockController,
  getInventoryController,
  getMovementsController,
  lowStockAlertsController,
  productMovementsController,
} from './inventory.controller';

const router = Router();

router.use(authenticate);

/** GET /inventory - all authenticated roles */
router.get(
  '/',
  authorize(UserRole.SALES, UserRole.WAREHOUSE, UserRole.ACCOUNTS),
  validate({ query: inventoryQuerySchema }),
  getInventoryController,
);

/** GET /inventory/movements - Admin, Warehouse, Accounts */
router.get(
  '/movements',
  authorize(UserRole.WAREHOUSE, UserRole.ACCOUNTS),
  validate({ query: movementsQuerySchema }),
  getMovementsController,
);

/** GET /inventory/low-stock-alerts - all authenticated roles */
router.get(
  '/low-stock-alerts',
  authorize(UserRole.SALES, UserRole.WAREHOUSE, UserRole.ACCOUNTS),
  validate({ query: inventoryQuerySchema }),
  lowStockAlertsController,
);

/** POST /inventory/adjust - Admin, Warehouse */
router.post('/adjust', authorize(UserRole.WAREHOUSE), validate({ body: stockAdjustmentSchema }), adjustStockController);

/** GET /inventory/products/:id/movements - Admin, Warehouse, Accounts */
router.get(
  '/products/:id/movements',
  authorize(UserRole.WAREHOUSE, UserRole.ACCOUNTS),
  validate({ params: idParamSchema, query: movementsQuerySchema }),
  productMovementsController,
);

export default router;
