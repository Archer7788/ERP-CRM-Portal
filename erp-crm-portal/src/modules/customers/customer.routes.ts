import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { idParamSchema } from '../../common/validators';
import { UserRole } from '../../common/enums';
import {
  createCustomerSchema,
  createFollowUpSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from './customer.validation';
import {
  addFollowUpController,
  createCustomerController,
  getCustomerController,
  listCustomersController,
  listFollowUpsController,
  updateCustomerController,
} from './customer.controller';

const router = Router();

// Every customer route requires a valid JWT.
router.use(authenticate);

/** GET /customers - Admin, Sales, Accounts */
router.get(
  '/',
  authorize(UserRole.SALES, UserRole.ACCOUNTS),
  validate({ query: listCustomersQuerySchema }),
  listCustomersController,
);

/** POST /customers - Admin, Sales */
router.post('/', authorize(UserRole.SALES), validate({ body: createCustomerSchema }), createCustomerController);

/** GET /customers/:id - Admin, Sales, Accounts */
router.get(
  '/:id',
  authorize(UserRole.SALES, UserRole.ACCOUNTS),
  validate({ params: idParamSchema }),
  getCustomerController,
);

/** PUT /customers/:id - Admin, Sales */
router.put(
  '/:id',
  authorize(UserRole.SALES),
  validate({ params: idParamSchema, body: updateCustomerSchema }),
  updateCustomerController,
);

/** POST /customers/:id/follow-ups - Admin, Sales */
router.post(
  '/:id/follow-ups',
  authorize(UserRole.SALES),
  validate({ params: idParamSchema, body: createFollowUpSchema }),
  addFollowUpController,
);

/** GET /customers/:id/follow-ups - Admin, Sales, Accounts */
router.get(
  '/:id/follow-ups',
  authorize(UserRole.SALES, UserRole.ACCOUNTS),
  validate({ params: idParamSchema }),
  listFollowUpsController,
);

export default router;
