import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { productImageUpload } from '../../middleware/upload.middleware';
import { idParamSchema } from '../../common/validators';
import { UserRole } from '../../common/enums';
import { createProductSchema, listProductsQuerySchema, updateProductSchema } from './product.validation';
import {
  createProductController,
  getProductController,
  listProductsController,
  productFacetsController,
  updateProductController,
  uploadProductImageController,
} from './product.controller';

const router = Router();

router.use(authenticate);

/** GET /products - all authenticated roles */
router.get(
  '/',
  authorize(UserRole.SALES, UserRole.WAREHOUSE, UserRole.ACCOUNTS),
  validate({ query: listProductsQuerySchema }),
  listProductsController,
);

/** GET /products/meta/facets - distinct categories and warehouse locations */
router.get(
  '/meta/facets',
  authorize(UserRole.SALES, UserRole.WAREHOUSE, UserRole.ACCOUNTS),
  productFacetsController,
);

/** POST /products - Admin, Warehouse */
router.post('/', authorize(UserRole.WAREHOUSE), validate({ body: createProductSchema }), createProductController);

/** GET /products/:id - all authenticated roles */
router.get(
  '/:id',
  authorize(UserRole.SALES, UserRole.WAREHOUSE, UserRole.ACCOUNTS),
  validate({ params: idParamSchema }),
  getProductController,
);

/** PUT /products/:id - Admin, Warehouse */
router.put(
  '/:id',
  authorize(UserRole.WAREHOUSE),
  validate({ params: idParamSchema, body: updateProductSchema }),
  updateProductController,
);

/** POST /products/:id/image - Admin, Warehouse. multipart/form-data, field name: "image" */
router.post(
  '/:id/image',
  authorize(UserRole.WAREHOUSE),
  validate({ params: idParamSchema }),
  productImageUpload,
  uploadProductImageController,
);

export default router;
