/** Application roles used by the RBAC layer. */
export const UserRole = {
  ADMIN: 'ADMIN',
  SALES: 'SALES',
  WAREHOUSE: 'WAREHOUSE',
  ACCOUNTS: 'ACCOUNTS',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const USER_ROLES = Object.values(UserRole) as [UserRole, ...UserRole[]];

/** Customer Type: Retail / Wholesale / Distributor */
export const CustomerType = {
  RETAIL: 'RETAIL',
  WHOLESALE: 'WHOLESALE',
  DISTRIBUTOR: 'DISTRIBUTOR',
} as const;
export type CustomerType = (typeof CustomerType)[keyof typeof CustomerType];
export const CUSTOMER_TYPES = Object.values(CustomerType) as [CustomerType, ...CustomerType[]];

/** Customer Status: Lead / Active / Inactive */
export const CustomerStatus = {
  LEAD: 'LEAD',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;
export type CustomerStatus = (typeof CustomerStatus)[keyof typeof CustomerStatus];
export const CUSTOMER_STATUSES = Object.values(CustomerStatus) as [CustomerStatus, ...CustomerStatus[]];

/** Stock Movement Type: IN / OUT */
export const MovementType = {
  IN: 'IN',
  OUT: 'OUT',
} as const;
export type MovementType = (typeof MovementType)[keyof typeof MovementType];
export const MOVEMENT_TYPES = Object.values(MovementType) as [MovementType, ...MovementType[]];

/** Challan Status: Draft / Confirmed / Cancelled */
export const ChallanStatus = {
  DRAFT: 'DRAFT',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;
export type ChallanStatus = (typeof ChallanStatus)[keyof typeof ChallanStatus];
export const CHALLAN_STATUSES = Object.values(ChallanStatus) as [ChallanStatus, ...ChallanStatus[]];

/** Where a stock movement originated from. */
export const MovementReferenceType = {
  CHALLAN: 'CHALLAN',
  PRODUCT: 'PRODUCT',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
} as const;
export type MovementReferenceType =
  (typeof MovementReferenceType)[keyof typeof MovementReferenceType];
