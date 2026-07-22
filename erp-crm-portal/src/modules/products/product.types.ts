/** Product entity - mirrors the exact field list required by the Inventory module. */
export interface Product {
  id: string;
  productName: string;        // Product Name
  sku: string;                // SKU / Product Code
  category: string;           // Category
  unitPrice: number;          // Unit Price
  currentStock: number;       // Current Stock
  minStockAlertQuantity: number; // Minimum Stock Alert Quantity
  warehouseLocation: string;  // Warehouse / Storage Location
  description: string | null;
  imageUrl: string | null;
  imageKey: string | null;
  isActive: boolean;
  isLowStock: boolean;
  stockValue: number;
  createdBy: string | null;
  createdByName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductFilters {
  search?: string;
  category?: string;
  warehouseLocation?: string;
  isActive?: boolean;
  lowStockOnly?: boolean;
  outOfStockOnly?: boolean;
  minPrice?: number;
  maxPrice?: number;
}

export const mapProduct = (row: any): Product => {
  const currentStock = Number(row.current_stock);
  const unitPrice = Number(row.unit_price);
  const minStockAlertQuantity = Number(row.min_stock_alert_quantity);
  return {
    id: row.id,
    productName: row.product_name,
    sku: row.sku,
    category: row.category,
    unitPrice,
    currentStock,
    minStockAlertQuantity,
    warehouseLocation: row.warehouse_location,
    description: row.description ?? null,
    imageUrl: row.image_url ?? null,
    imageKey: row.image_key ?? null,
    isActive: row.is_active,
    isLowStock: currentStock <= minStockAlertQuantity,
    stockValue: Number((currentStock * unitPrice).toFixed(2)),
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/** Immutable copy of a product stored inside a challan line item. */
export interface ProductSnapshot {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  unitPrice: number;
  warehouseLocation: string;
  imageUrl: string | null;
  description: string | null;
  stockAtChallanTime: number;
  snapshotTakenAt: string;
}
