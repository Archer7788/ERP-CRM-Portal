import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import customerRoutes from '../modules/customers/customer.routes';
import productRoutes from '../modules/products/product.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';
import challanRoutes from '../modules/challans/challan.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);
router.use('/products', productRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/challans', challanRoutes);

/** Lightweight endpoint catalogue, handy for smoke testing a deployment. */
router.get('/', (req, res) => {
  res.json({
    success: true,
    statusCode: 200,
    message: 'ERP + CRM Operations Portal API',
    data: {
      auth: ['POST /auth/login', 'POST /auth/register', 'GET /auth/me', 'POST /auth/change-password', 'GET /auth/users'],
      customers: [
        'GET /customers',
        'POST /customers',
        'PUT /customers/:id',
        'GET /customers/:id',
        'POST /customers/:id/follow-ups',
        'GET /customers/:id/follow-ups',
      ],
      products: [
        'GET /products',
        'POST /products',
        'PUT /products/:id',
        'GET /products/:id',
        'POST /products/:id/image',
        'GET /products/meta/facets',
      ],
      inventory: [
        'GET /inventory',
        'GET /inventory/movements',
        'GET /inventory/low-stock-alerts',
        'POST /inventory/adjust',
        'GET /inventory/products/:id/movements',
      ],
      challans: [
        'POST /challans',
        'GET /challans',
        'GET /challans/:id',
        'PATCH /challans/:id/status',
        'GET /challans/:id/invoice',
      ],
    },
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  });
});

export default router;
