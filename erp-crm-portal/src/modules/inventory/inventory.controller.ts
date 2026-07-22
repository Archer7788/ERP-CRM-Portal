import { Request, Response } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { sendPaginated, sendSuccess } from '../../common/api-response';
import { requireUser } from '../../middleware/auth.middleware';
import * as inventoryService from './inventory.service';
import { InventoryQuery, MovementsQuery, StockAdjustmentInput } from './inventory.validation';

/** GET /inventory */
export const getInventoryController = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await inventoryService.getInventory(req.validated.query as InventoryQuery);
  sendPaginated(res, items, meta, 'Inventory fetched successfully');
});

/** GET /inventory/movements */
export const getMovementsController = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await inventoryService.getStockMovements(req.validated.query as MovementsQuery);
  sendPaginated(res, items, meta, 'Stock movement log fetched successfully');
});

/** GET /inventory/low-stock-alerts */
export const lowStockAlertsController = asyncHandler(async (req: Request, res: Response) => {
  const { items, meta } = await inventoryService.getLowStockAlerts(req.validated.query as InventoryQuery);
  sendPaginated(res, items, meta, `${items.length} product(s) are at or below the minimum stock alert quantity`);
});

/** POST /inventory/adjust */
export const adjustStockController = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const result = await inventoryService.adjustStock(req.validated.body as StockAdjustmentInput, user);
  sendSuccess(res, { data: result, message: 'Stock adjusted and movement logged successfully' });
});

/** GET /inventory/products/:id/movements */
export const productMovementsController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.validated.params as { id: string };
  const { items, meta } = await inventoryService.getProductMovements(id, req.validated.query as MovementsQuery);
  sendPaginated(res, items, meta, 'Product stock movement log fetched successfully');
});
