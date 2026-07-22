import { closeDatabase, pool, withTransaction } from '../config/database';
import { env } from '../config/env';
import { hashPassword } from '../modules/auth/auth.service';
import { logger } from '../common/logger';

/**
 * Seeds one user per role, a set of customers, a product catalogue,
 * and two challans (one DRAFT, one CONFIRMED with the matching stock
 * deduction and OUT movements) so the API can be exercised immediately.
 *
 * The script is idempotent: re-running it will not duplicate rows.
 */

const USERS = [
  { name: 'Aarti Admin', email: 'admin@erpcrm.local', role: 'ADMIN' },
  { name: 'Sanjay Sales', email: 'sales@erpcrm.local', role: 'SALES' },
  { name: 'Wasim Warehouse', email: 'warehouse@erpcrm.local', role: 'WAREHOUSE' },
  { name: 'Anita Accounts', email: 'accounts@erpcrm.local', role: 'ACCOUNTS' },
];

const CUSTOMERS = [
  {
    customerName: 'Ramesh Gupta',
    mobileNumber: '+91 98450 11223',
    email: 'ramesh@gupta-traders.example',
    businessName: 'Gupta Traders',
    gstNumber: '36AABCU9603R1ZX',
    customerType: 'WHOLESALE',
    address: '14 MG Road, Secunderabad, Telangana 500003',
    status: 'ACTIVE',
    followUpDate: '2026-08-05',
    notes: 'Regular monthly bulk buyer. Prefers dispatch before the 10th.',
  },
  {
    customerName: 'Priya Nair',
    mobileNumber: '+91 99000 44556',
    email: 'priya@nairelectricals.example',
    businessName: 'Nair Electricals',
    gstNumber: '29AACCN1234M1Z5',
    customerType: 'DISTRIBUTOR',
    address: '221 Residency Road, Bengaluru, Karnataka 560025',
    status: 'ACTIVE',
    followUpDate: '2026-08-12',
    notes: 'Distributor for the southern region. Credit terms: 30 days.',
  },
  {
    customerName: 'Imran Sheikh',
    mobileNumber: '+91 97010 78945',
    email: 'imran.sheikh@example.com',
    businessName: 'Sheikh Home Store',
    gstNumber: null,
    customerType: 'RETAIL',
    address: '5 Charminar Lane, Hyderabad, Telangana 500002',
    status: 'LEAD',
    followUpDate: '2026-07-30',
    notes: 'Walk-in enquiry. Asked for a quote on LED panels.',
  },
  {
    customerName: 'Meera Krishnan',
    mobileNumber: '+91 90300 66778',
    email: 'meera@krishnanenterprises.example',
    businessName: 'Krishnan Enterprises',
    gstNumber: '33AAFCK5678P1ZQ',
    customerType: 'WHOLESALE',
    address: '78 Anna Salai, Chennai, Tamil Nadu 600002',
    status: 'ACTIVE',
    followUpDate: null,
    notes: 'Seasonal buyer, peaks around Diwali.',
  },
  {
    customerName: 'Dev Patel',
    mobileNumber: '+91 88220 33445',
    email: 'dev.patel@patelsupply.example',
    businessName: 'Patel Supply Co',
    gstNumber: null,
    customerType: 'RETAIL',
    address: '32 CG Road, Ahmedabad, Gujarat 380009',
    status: 'INACTIVE',
    followUpDate: '2026-09-01',
    notes: 'Dormant since March. Re-engagement call scheduled.',
  },
];

const PRODUCTS = [
  { productName: 'LED Panel Light 18W', sku: 'LED-PNL-18W', category: 'Lighting', unitPrice: 640.0, currentStock: 240, minStockAlertQuantity: 50, warehouseLocation: 'Hyderabad - Rack A1', description: 'Round recessed LED panel, 6500K cool white.' },
  { productName: 'LED Batten 20W', sku: 'LED-BTN-20W', category: 'Lighting', unitPrice: 415.5, currentStock: 180, minStockAlertQuantity: 40, warehouseLocation: 'Hyderabad - Rack A2', description: 'Slim linear batten, 4 feet.' },
  { productName: 'Copper Wire 1.5sqmm 90m', sku: 'WIR-CU-15-90', category: 'Wiring', unitPrice: 1890.0, currentStock: 95, minStockAlertQuantity: 30, warehouseLocation: 'Hyderabad - Rack B1', description: 'FR PVC insulated copper wire coil.' },
  { productName: 'Modular Switch 6A', sku: 'SW-MOD-6A', category: 'Switchgear', unitPrice: 95.0, currentStock: 1200, minStockAlertQuantity: 300, warehouseLocation: 'Bengaluru - Rack C3', description: 'One-way modular switch, white.' },
  { productName: 'MCB Single Pole 16A', sku: 'MCB-SP-16A', category: 'Switchgear', unitPrice: 265.0, currentStock: 42, minStockAlertQuantity: 60, warehouseLocation: 'Bengaluru - Rack C4', description: 'C-curve miniature circuit breaker.' },
  { productName: 'Ceiling Fan 1200mm', sku: 'FAN-CEI-1200', category: 'Fans', unitPrice: 2350.0, currentStock: 65, minStockAlertQuantity: 20, warehouseLocation: 'Chennai - Rack D1', description: 'High-speed ceiling fan, brown.' },
  { productName: 'Exhaust Fan 250mm', sku: 'FAN-EXH-250', category: 'Fans', unitPrice: 1420.0, currentStock: 18, minStockAlertQuantity: 25, warehouseLocation: 'Chennai - Rack D2', description: 'Metal body exhaust fan.' },
  { productName: 'PVC Conduit Pipe 25mm', sku: 'PIP-PVC-25', category: 'Conduits', unitPrice: 78.0, currentStock: 0, minStockAlertQuantity: 100, warehouseLocation: 'Hyderabad - Rack B4', description: 'Heavy duty PVC conduit, 3 metre length.' },
];

const seed = async (): Promise<void> => {
  const passwordHash = await hashPassword(env.SEED_DEFAULT_PASSWORD);

  await withTransaction(async (client) => {
    // ---- Users -----------------------------------------------------------
    const userIds: Record<string, string> = {};
    for (const user of USERS) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash, role, is_active)
         VALUES ($1, $2, $3, $4, TRUE)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [user.name, user.email, passwordHash, user.role],
      );
      userIds[user.role] = result.rows[0].id;
    }
    logger.info(`Seeded ${USERS.length} users`);

    // ---- Customers -------------------------------------------------------
    const customerIds: string[] = [];
    for (const customer of CUSTOMERS) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO customers
           (customer_name, mobile_number, email, business_name, gst_number,
            customer_type, address, status, follow_up_date, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (mobile_number) DO UPDATE SET customer_name = EXCLUDED.customer_name
         RETURNING id`,
        [
          customer.customerName,
          customer.mobileNumber,
          customer.email,
          customer.businessName,
          customer.gstNumber,
          customer.customerType,
          customer.address,
          customer.status,
          customer.followUpDate,
          customer.notes,
          userIds.SALES,
        ],
      );
      customerIds.push(result.rows[0].id);
    }
    logger.info(`Seeded ${CUSTOMERS.length} customers`);

    // ---- Follow-up notes -------------------------------------------------
    await client.query(
      `INSERT INTO customer_follow_ups (customer_id, note, follow_up_date, created_by)
       SELECT $1, $2, $3, $4
       WHERE NOT EXISTS (SELECT 1 FROM customer_follow_ups WHERE customer_id = $1)`,
      [customerIds[0], 'Called to confirm the monthly order. Sending a revised quote.', '2026-08-05', userIds.SALES],
    );

    // ---- Products + opening stock movements ------------------------------
    const productIds: Record<string, string> = {};
    for (const product of PRODUCTS) {
      const result = await client.query<{ id: string; current_stock: number }>(
        `INSERT INTO products
           (product_name, sku, category, unit_price, current_stock,
            min_stock_alert_quantity, warehouse_location, description, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
         ON CONFLICT (sku) DO UPDATE SET product_name = EXCLUDED.product_name
         RETURNING id, current_stock`,
        [
          product.productName,
          product.sku,
          product.category,
          product.unitPrice,
          product.currentStock,
          product.minStockAlertQuantity,
          product.warehouseLocation,
          product.description,
          userIds.WAREHOUSE,
        ],
      );
      const productId = result.rows[0].id;
      productIds[product.sku] = productId;

      const existingMovement = await client.query(
        'SELECT 1 FROM stock_movements WHERE product_id = $1 AND reference_type = $2 LIMIT 1',
        [productId, 'PRODUCT'],
      );
      if (existingMovement.rowCount === 0 && product.currentStock > 0) {
        await client.query(
          `INSERT INTO stock_movements
             (product_id, quantity_changed, movement_type, reason, balance_after,
              reference_type, reference_id, reference_number, created_by)
           VALUES ($1, $2, 'IN', $3, $4, 'PRODUCT', $1, $5, $6)`,
          [
            productId,
            product.currentStock,
            'Opening stock recorded at product creation',
            product.currentStock,
            product.sku,
            userIds.WAREHOUSE,
          ],
        );
      }
    }
    logger.info(`Seeded ${PRODUCTS.length} products with opening stock movements`);

    // ---- Challans --------------------------------------------------------
    const existingChallans = await client.query('SELECT COUNT(*)::int AS count FROM challans');
    if (existingChallans.rows[0].count > 0) {
      logger.info('Challans already present, skipping challan seed');
      return;
    }

    const year = new Date().getFullYear();
    const prefix = `${env.CHALLAN_NUMBER_PREFIX}-${year}`;

    const nextChallanNumber = async (): Promise<string> => {
      const counter = await client.query<{ last_number: string }>(
        `INSERT INTO challan_counters (prefix, last_number) VALUES ($1, 1)
         ON CONFLICT (prefix) DO UPDATE SET last_number = challan_counters.last_number + 1, updated_at = NOW()
         RETURNING last_number`,
        [prefix],
      );
      return `${prefix}-${String(Number(counter.rows[0].last_number)).padStart(env.CHALLAN_NUMBER_PADDING, '0')}`;
    };

    const snapshotCustomer = async (customerId: string) => {
      const result = await client.query('SELECT * FROM customers WHERE id = $1', [customerId]);
      const row = result.rows[0];
      return {
        customerId: row.id,
        customerName: row.customer_name,
        mobileNumber: row.mobile_number,
        email: row.email,
        businessName: row.business_name,
        gstNumber: row.gst_number,
        customerType: row.customer_type,
        address: row.address,
        status: row.status,
        snapshotTakenAt: new Date().toISOString(),
      };
    };

    const snapshotProduct = async (productId: string) => {
      const result = await client.query('SELECT * FROM products WHERE id = $1', [productId]);
      const row = result.rows[0];
      return {
        row,
        snapshot: {
          productId: row.id,
          productName: row.product_name,
          sku: row.sku,
          category: row.category,
          unitPrice: Number(row.unit_price),
          warehouseLocation: row.warehouse_location,
          imageUrl: row.image_url,
          description: row.description,
          stockAtChallanTime: Number(row.current_stock),
          snapshotTakenAt: new Date().toISOString(),
        },
      };
    };

    const createSeedChallan = async (
      customerId: string,
      lines: Array<{ sku: string; quantity: number }>,
      status: 'DRAFT' | 'CONFIRMED',
      notes: string,
    ) => {
      const challanNumber = await nextChallanNumber();
      const customerSnapshot = await snapshotCustomer(customerId);

      const prepared = [];
      for (const line of lines) {
        const { row, snapshot } = await snapshotProduct(productIds[line.sku]);
        prepared.push({
          productId: row.id,
          productName: row.product_name,
          sku: row.sku,
          category: row.category,
          unitPrice: Number(row.unit_price),
          warehouseLocation: row.warehouse_location,
          quantity: line.quantity,
          lineTotal: Number((Number(row.unit_price) * line.quantity).toFixed(2)),
          snapshot,
        });
      }

      const totalQuantity = prepared.reduce((sum, item) => sum + item.quantity, 0);
      const totalAmount = Number(prepared.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));

      const challanResult = await client.query<{ id: string }>(
        `INSERT INTO challans
           (challan_number, customer_id, customer_snapshot, total_quantity, total_items,
            total_amount, status, notes, created_by, confirmed_by, confirmed_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, CASE WHEN $7 = 'CONFIRMED'::challan_status THEN NOW() ELSE NULL END)
         RETURNING id`,
        [
          challanNumber,
          customerId,
          JSON.stringify(customerSnapshot),
          totalQuantity,
          prepared.length,
          totalAmount,
          status,
          notes,
          userIds.SALES,
          status === 'CONFIRMED' ? userIds.SALES : null,
        ],
      );
      const challanId = challanResult.rows[0].id;

      for (const item of prepared) {
        await client.query(
          `INSERT INTO challan_items
             (challan_id, product_id, product_name, sku, category, unit_price,
              warehouse_location, quantity, line_total, product_snapshot)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
          [
            challanId,
            item.productId,
            item.productName,
            item.sku,
            item.category,
            item.unitPrice,
            item.warehouseLocation,
            item.quantity,
            item.lineTotal,
            JSON.stringify(item.snapshot),
          ],
        );

        if (status === 'CONFIRMED') {
          const updated = await client.query<{ current_stock: number }>(
            `UPDATE products SET current_stock = current_stock - $1, updated_at = NOW()
             WHERE id = $2 AND current_stock >= $1
             RETURNING current_stock`,
            [item.quantity, item.productId],
          );
          if (updated.rowCount === 0) {
            throw new Error(`Seed failed: insufficient stock for ${item.sku}`);
          }
          await client.query(
            `INSERT INTO stock_movements
               (product_id, quantity_changed, movement_type, reason, balance_after,
                reference_type, reference_id, reference_number, created_by)
             VALUES ($1, $2, 'OUT', $3, $4, 'CHALLAN', $5, $6, $7)`,
            [
              item.productId,
              item.quantity,
              `Sales challan ${challanNumber} confirmed`,
              Number(updated.rows[0].current_stock),
              challanId,
              challanNumber,
              userIds.SALES,
            ],
          );
        }
      }

      logger.info(`Seeded ${status} challan ${challanNumber}`);
    };

    await createSeedChallan(
      customerIds[0],
      [
        { sku: 'LED-PNL-18W', quantity: 25 },
        { sku: 'SW-MOD-6A', quantity: 100 },
      ],
      'CONFIRMED',
      'Monthly replenishment order. Dispatched via road transport.',
    );

    await createSeedChallan(
      customerIds[1],
      [
        { sku: 'FAN-CEI-1200', quantity: 10 },
        { sku: 'WIR-CU-15-90', quantity: 5 },
      ],
      'DRAFT',
      'Awaiting purchase order confirmation from the distributor.',
    );
  });

  logger.info('');
  logger.info('==========================================================');
  logger.info(' Seed complete. Login credentials (password for all users):');
  logger.info(` Password: ${env.SEED_DEFAULT_PASSWORD}`);
  USERS.forEach((user) => logger.info(`   ${user.role.padEnd(10)} -> ${user.email}`));
  logger.info('==========================================================');
};

seed()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error) => {
    logger.error('Seeding failed', error);
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
