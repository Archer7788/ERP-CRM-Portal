import { CustomerStatus, CustomerType } from '../../common/enums';

/** Customer entity - mirrors the exact field list required by the CRM module. */
export interface Customer {
  id: string;
  customerName: string;      // Customer Name
  mobileNumber: string;      // Mobile Number
  email: string;             // Email
  businessName: string;      // Business Name
  gstNumber: string | null;  // GST Number (Optional)
  customerType: CustomerType;// Customer Type (Retail / Wholesale / Distributor)
  address: string;           // Address
  status: CustomerStatus;    // Status (Lead / Active / Inactive)
  followUpDate: string | null; // Follow-up Date (YYYY-MM-DD)
  notes: string | null;      // Notes
  createdBy: string | null;
  createdByName?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A single dated follow-up note attached to a customer. */
export interface CustomerFollowUp {
  id: string;
  customerId: string;
  note: string;
  followUpDate: string | null;
  createdBy: string | null;
  createdByName?: string | null;
  createdAt: Date;
}

export interface CustomerWithFollowUps extends Customer {
  followUps: CustomerFollowUp[];
}

export interface CustomerFilters {
  search?: string;
  status?: CustomerStatus;
  customerType?: CustomerType;
  followUpFrom?: string;
  followUpTo?: string;
  hasGst?: boolean;
  createdBy?: string;
}

export const mapCustomer = (row: any): Customer => ({
  id: row.id,
  customerName: row.customer_name,
  mobileNumber: row.mobile_number,
  email: row.email,
  businessName: row.business_name,
  gstNumber: row.gst_number,
  customerType: row.customer_type,
  address: row.address,
  status: row.status,
  followUpDate: row.follow_up_date ?? null,
  notes: row.notes,
  createdBy: row.created_by,
  createdByName: row.created_by_name ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const mapFollowUp = (row: any): CustomerFollowUp => ({
  id: row.id,
  customerId: row.customer_id,
  note: row.note,
  followUpDate: row.follow_up_date ?? null,
  createdBy: row.created_by,
  createdByName: row.created_by_name ?? null,
  createdAt: row.created_at,
});
