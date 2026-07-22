import { ChallanStatus, CustomerStatus, CustomerType } from '../../common/enums';
import { ProductSnapshot } from '../products/product.types';

/** Immutable copy of the customer at the moment the challan was raised. */
export interface CustomerSnapshot {
  customerId: string;
  customerName: string;
  mobileNumber: string;
  email: string;
  businessName: string;
  gstNumber: string | null;
  customerType: CustomerType;
  address: string;
  status: CustomerStatus;
  snapshotTakenAt: string;
}

export interface ChallanItem {
  id: string;
  challanId: string;
  productId: string;
  /** Snapshot columns - the challan never depends on the live product record. */
  productName: string;
  sku: string;
  category: string;
  unitPrice: number;
  warehouseLocation: string;
  quantity: number;
  lineTotal: number;
  productSnapshot: ProductSnapshot;
  createdAt: Date;
}

export interface Challan {
  challanNumber: string;          // Challan Number
  id: string;
  customerId: string;             // Customer
  customer: CustomerSnapshot;
  items: ChallanItem[];           // Products
  totalQuantity: number;          // Total Quantity
  totalItems: number;
  totalAmount: number;
  status: ChallanStatus;          // Status (Draft / Confirmed / Cancelled)
  notes: string | null;
  createdBy: string | null;       // Created By
  createdByName: string | null;
  createdAt: Date;                // Created Date
  updatedAt: Date;
  confirmedAt: Date | null;
  confirmedBy: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
}

export interface ChallanFilters {
  search?: string;
  status?: ChallanStatus;
  customerId?: string;
  createdBy?: string;
  dateFrom?: string;
  dateTo?: string;
}

export const mapChallanItem = (row: any): ChallanItem => ({
  id: row.id,
  challanId: row.challan_id,
  productId: row.product_id,
  productName: row.product_name,
  sku: row.sku,
  category: row.category,
  unitPrice: Number(row.unit_price),
  warehouseLocation: row.warehouse_location,
  quantity: Number(row.quantity),
  lineTotal: Number(row.line_total),
  productSnapshot: row.product_snapshot,
  createdAt: row.created_at,
});

export const mapChallan = (row: any, items: ChallanItem[] = []): Challan => ({
  id: row.id,
  challanNumber: row.challan_number,
  customerId: row.customer_id,
  customer: row.customer_snapshot,
  items,
  totalQuantity: Number(row.total_quantity),
  totalItems: Number(row.total_items ?? items.length),
  totalAmount: Number(row.total_amount),
  status: row.status,
  notes: row.notes ?? null,
  createdBy: row.created_by ?? null,
  createdByName: row.created_by_name ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  confirmedAt: row.confirmed_at ?? null,
  confirmedBy: row.confirmed_by ?? null,
  cancelledAt: row.cancelled_at ?? null,
  cancelledBy: row.cancelled_by ?? null,
  cancellationReason: row.cancellation_reason ?? null,
});
