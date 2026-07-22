-- ===========================================================================
-- ERP + CRM Operations Portal - initial schema
-- Target: PostgreSQL 13+
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMIN', 'SALES', 'WAREHOUSE', 'ACCOUNTS');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE customer_type AS ENUM ('RETAIL', 'WHOLESALE', 'DISTRIBUTOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE customer_status AS ENUM ('LEAD', 'ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE movement_type AS ENUM ('IN', 'OUT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE movement_reference_type AS ENUM ('CHALLAN', 'PRODUCT', 'MANUAL_ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE challan_status AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- USERS - Authentication and Role Based Access Control
-- Roles: Admin / Sales / Warehouse / Accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(120)  NOT NULL,
  email          VARCHAR(160)  NOT NULL,
  password_hash  TEXT          NOT NULL,
  role           user_role     NOT NULL,
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- CUSTOMERS - CRM module
-- Fields: Customer Name, Mobile Number, Email, Business Name, GST Number (optional),
--         Customer Type, Address, Status, Follow-up Date, Notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name   VARCHAR(150)    NOT NULL,
  mobile_number   VARCHAR(20)     NOT NULL,
  email           VARCHAR(160)    NOT NULL,
  business_name   VARCHAR(150)    NOT NULL,
  gst_number      VARCHAR(15),                       -- Optional
  customer_type   customer_type   NOT NULL,
  address         TEXT            NOT NULL,
  status          customer_status NOT NULL DEFAULT 'LEAD',
  follow_up_date  DATE,
  notes           TEXT,
  created_by      UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  CONSTRAINT customers_mobile_unique UNIQUE (mobile_number)
);

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers (status);
CREATE INDEX IF NOT EXISTS idx_customers_type ON customers (customer_type);
CREATE INDEX IF NOT EXISTS idx_customers_follow_up_date ON customers (follow_up_date);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_name_lower ON customers (LOWER(customer_name));
CREATE INDEX IF NOT EXISTS idx_customers_business_lower ON customers (LOWER(business_name));
CREATE INDEX IF NOT EXISTS idx_customers_email_lower ON customers (LOWER(email));

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- CUSTOMER FOLLOW-UPS - "Add Follow-up Notes"
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_follow_ups (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID        NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  note           TEXT        NOT NULL,
  follow_up_date DATE,
  created_by     UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_customer ON customer_follow_ups (customer_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- PRODUCTS - Product & Inventory module
-- Fields: Product Name, SKU / Product Code, Category, Unit Price, Current Stock,
--         Minimum Stock Alert Quantity, Warehouse / Storage Location
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name             VARCHAR(150)   NOT NULL,
  sku                      VARCHAR(60)    NOT NULL,
  category                 VARCHAR(80)    NOT NULL,
  unit_price               NUMERIC(12, 2) NOT NULL,
  current_stock            INTEGER        NOT NULL DEFAULT 0,
  min_stock_alert_quantity INTEGER        NOT NULL DEFAULT 0,
  warehouse_location       VARCHAR(120)   NOT NULL,
  description              TEXT,
  image_url                TEXT,
  image_key                TEXT,
  is_active                BOOLEAN        NOT NULL DEFAULT TRUE,
  created_by               UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT products_sku_unique UNIQUE (sku),
  -- Hard database guarantee: stock quantity must never become negative.
  CONSTRAINT products_current_stock_non_negative CHECK (current_stock >= 0),
  CONSTRAINT products_min_stock_non_negative CHECK (min_stock_alert_quantity >= 0),
  CONSTRAINT products_unit_price_non_negative CHECK (unit_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_warehouse ON products (warehouse_location);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products (is_active);
CREATE INDEX IF NOT EXISTS idx_products_name_lower ON products (LOWER(product_name));
CREATE INDEX IF NOT EXISTS idx_products_low_stock ON products (current_stock, min_stock_alert_quantity);

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- STOCK MOVEMENTS - Stock Movement Log
-- Tracks: Product, Quantity Changed, Movement Type (IN/OUT), Reason,
--         Created By, Timestamp
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_movements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID          NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  quantity_changed INTEGER       NOT NULL,
  movement_type    movement_type NOT NULL,
  reason           VARCHAR(255)  NOT NULL,
  balance_after    INTEGER       NOT NULL,
  reference_type   movement_reference_type,
  reference_id     UUID,
  reference_number VARCHAR(60),
  created_by       UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT stock_movements_quantity_positive CHECK (quantity_changed > 0),
  CONSTRAINT stock_movements_balance_non_negative CHECK (balance_after >= 0)
);

CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_type ON stock_movements (movement_type);
CREATE INDEX IF NOT EXISTS idx_movements_reference ON stock_movements (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_movements_created_at ON stock_movements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_created_by ON stock_movements (created_by);

-- ---------------------------------------------------------------------------
-- CHALLAN COUNTERS - backs the auto-generated Challan Number
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS challan_counters (
  prefix      VARCHAR(40) PRIMARY KEY,
  last_number INTEGER     NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- CHALLANS - Sales Challan module
-- Fields: Challan Number, Customer, Products, Total Quantity, Status,
--         Created By, Created Date
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS challans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number      VARCHAR(60)    NOT NULL,
  customer_id         UUID           NOT NULL REFERENCES customers (id) ON DELETE RESTRICT,
  -- Immutable copy of the customer at the time the challan was raised.
  customer_snapshot   JSONB          NOT NULL,
  total_quantity      INTEGER        NOT NULL DEFAULT 0,
  total_items         INTEGER        NOT NULL DEFAULT 0,
  total_amount        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status              challan_status NOT NULL DEFAULT 'DRAFT',
  notes               TEXT,
  created_by          UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  confirmed_at        TIMESTAMPTZ,
  confirmed_by        UUID REFERENCES users (id) ON DELETE SET NULL,
  cancelled_at        TIMESTAMPTZ,
  cancelled_by        UUID REFERENCES users (id) ON DELETE SET NULL,
  cancellation_reason VARCHAR(500),
  CONSTRAINT challans_number_unique UNIQUE (challan_number),
  CONSTRAINT challans_total_quantity_non_negative CHECK (total_quantity >= 0)
);

CREATE INDEX IF NOT EXISTS idx_challans_customer ON challans (customer_id);
CREATE INDEX IF NOT EXISTS idx_challans_status ON challans (status);
CREATE INDEX IF NOT EXISTS idx_challans_created_at ON challans (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_challans_created_by ON challans (created_by);
CREATE INDEX IF NOT EXISTS idx_challans_number ON challans (challan_number);
CREATE INDEX IF NOT EXISTS idx_challans_customer_snapshot ON challans USING GIN (customer_snapshot);

DROP TRIGGER IF EXISTS trg_challans_updated_at ON challans;
CREATE TRIGGER trg_challans_updated_at BEFORE UPDATE ON challans
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- CHALLAN ITEMS - the products on a challan.
-- Product data is SNAPSHOTTED here (not merely referenced by product id), so a
-- later price change or product rename never alters a historic challan.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS challan_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_id         UUID           NOT NULL REFERENCES challans (id) ON DELETE CASCADE,
  product_id         UUID           NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  -- Snapshot columns
  product_name       VARCHAR(150)   NOT NULL,
  sku                VARCHAR(60)    NOT NULL,
  category           VARCHAR(80)    NOT NULL,
  unit_price         NUMERIC(12, 2) NOT NULL,
  warehouse_location VARCHAR(120)   NOT NULL,
  quantity           INTEGER        NOT NULL,
  line_total         NUMERIC(14, 2) NOT NULL,
  -- Full JSON snapshot of the product record at challan time
  product_snapshot   JSONB          NOT NULL,
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT challan_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT challan_items_unique_product UNIQUE (challan_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_challan_items_challan ON challan_items (challan_id);
CREATE INDEX IF NOT EXISTS idx_challan_items_product ON challan_items (product_id);
CREATE INDEX IF NOT EXISTS idx_challan_items_sku ON challan_items (sku);
