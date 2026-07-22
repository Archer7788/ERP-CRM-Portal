import { MovementReferenceType, MovementType } from '../../common/enums';

/** Stock Movement Log entry - tracks Product, Quantity Changed, Movement Type, Reason, Created By, Timestamp. */
export interface StockMovement {
  id: string;
  productId: string;              // Product
  productName: string;
  sku: string;
  quantityChanged: number;        // Quantity Changed
  movementType: MovementType;     // Movement Type (IN / OUT)
  reason: string;                 // Reason
  balanceAfter: number;
  referenceType: MovementReferenceType | null;
  referenceId: string | null;
  referenceNumber: string | null;
  createdBy: string | null;       // Created By
  createdByName: string | null;
  createdAt: Date;                // Timestamp
}

export interface StockMovementFilters {
  search?: string;
  productId?: string;
  movementType?: MovementType;
  referenceType?: MovementReferenceType;
  referenceId?: string;
  createdBy?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface RecordMovementInput {
  productId: string;
  quantityChanged: number;
  movementType: MovementType;
  reason: string;
  balanceAfter: number;
  referenceType?: MovementReferenceType | null;
  referenceId?: string | null;
  referenceNumber?: string | null;
  createdBy: string;
}

export const mapStockMovement = (row: any): StockMovement => ({
  id: row.id,
  productId: row.product_id,
  productName: row.product_name,
  sku: row.sku,
  quantityChanged: Number(row.quantity_changed),
  movementType: row.movement_type,
  reason: row.reason,
  balanceAfter: Number(row.balance_after),
  referenceType: row.reference_type ?? null,
  referenceId: row.reference_id ?? null,
  referenceNumber: row.reference_number ?? null,
  createdBy: row.created_by ?? null,
  createdByName: row.created_by_name ?? null,
  createdAt: row.created_at,
});
