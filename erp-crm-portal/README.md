# ERP + CRM Operations Portal — Backend

Production-ready REST API for a combined ERP and CRM operations portal, covering
**Authentication & RBAC**, **Customer CRM**, **Product & Inventory**, and **Sales Challans**
with automatic stock deduction, negative-stock prevention, product snapshotting,
S3 image upload and PDF invoice export.

**Stack:** Node.js · TypeScript · Express.js · PostgreSQL · JWT · Zod · AWS S3 · PDFKit

---

## Table of contents

1. [Feature checklist](#1-feature-checklist)
2. [Project structure](#2-project-structure)
3. [Quick start](#3-quick-start)
4. [Environment variables](#4-environment-variables)
5. [Database schema](#5-database-schema)
6. [Roles & permission matrix](#6-roles--permission-matrix)
7. [API reference](#7-api-reference)
8. [Response format](#8-response-format)
9. [Business rules — sales challan](#9-business-rules--sales-challan)
10. [Seed data & login credentials](#10-seed-data--login-credentials)
11. [AWS deployment](#11-aws-deployment)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Feature checklist

### Authentication & Role-Based Access Control
- JWT-based authentication (`POST /auth/login`), signed with `JWT_SECRET`, configurable expiry.
- Passwords hashed with bcrypt; login failures return one generic message so the endpoint cannot be used to enumerate accounts.
- Rate limiting on the login endpoint.
- Four roles: **Admin**, **Sales**, **Warehouse**, **Accounts**. Admin implicitly passes every check.
- Every token is re-validated against the database on each request, so deactivating a user revokes access immediately.

### Customer CRM
Fields stored exactly as specified: Customer Name, Mobile Number, Email, Business Name,
GST Number (optional), Customer Type (Retail / Wholesale / Distributor), Address,
Status (Lead / Active / Inactive), Follow-up Date, Notes.

Features: Add Customer, Edit Customer, Search Customers, View Customer Details, Add Follow-up Notes
(stored as a dated history in `customer_follow_ups`, and able to advance the customer's own
Follow-up Date and Status in the same call).

### Product & Inventory
Fields stored exactly as specified: Product Name, SKU / Product Code, Category, Unit Price,
Current Stock, Minimum Stock Alert Quantity, Warehouse / Storage Location.

Features: Add Product, Edit Product, View Inventory, Low Stock Alerts.

**Stock Movement Log** tracks Product, Quantity Changed, Movement Type (IN / OUT), Reason,
Created By and Timestamp — plus `balance_after` and a reference back to the challan or
adjustment that caused it. A row is written on **every** inventory change:

| Event | Movement |
|---|---|
| Product created with opening stock | `IN` |
| Product edited with a new `currentStock` | `IN` or `OUT` (the delta) |
| Manual adjustment via `POST /inventory/adjust` | `IN` or `OUT` |
| Challan confirmed | `OUT` per line item |
| Confirmed challan cancelled | `IN` per line item |

### Sales Challan
Select Customer · Add Multiple Products · Specify Quantity per Product ·
Auto-Generated Challan Number (`CHN-2026-000001`) · Save as Draft or Confirmed.

Challan information: Challan Number, Customer, Products, Total Quantity,
Status (Draft / Confirmed / Cancelled), Created By, Created Date.

Business logic implemented exactly as specified — see [section 9](#9-business-rules--sales-challan).

### API standards
RESTful design · input validation on every endpoint (Zod) · correct HTTP status codes ·
meaningful error messages · pagination · search & filtering · one consistent response envelope.

### Bonus
- **PDF invoice export** — `GET /challans/:id/invoice`
- **Product image upload to AWS S3** — `POST /products/:id/image`

---

## 2. Project structure

```
erp-crm-portal/
├── src/
│   ├── config/
│   │   ├── env.ts                     # Zod-validated environment loader
│   │   └── database.ts                # pg Pool, query(), withTransaction()
│   ├── common/
│   │   ├── enums.ts                   # UserRole, CustomerType/Status, MovementType, ChallanStatus
│   │   ├── api-error.ts               # ApiError with status code + machine-readable code
│   │   ├── api-response.ts            # sendSuccess / sendCreated / sendPaginated
│   │   ├── pagination.ts              # shared query schema, sort whitelisting, meta builder
│   │   ├── validators.ts              # UUID, mobile, email, GSTIN, date, money primitives
│   │   ├── async-handler.ts
│   │   ├── types.ts
│   │   └── logger.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts         # authenticate (JWT) + authorize (RBAC)
│   │   ├── validate.middleware.ts     # Zod validation for body / query / params
│   │   ├── upload.middleware.ts       # multer memory storage for S3 uploads
│   │   └── error.middleware.ts        # central error handler + 404 handler
│   ├── modules/
│   │   ├── auth/                      # validation, service, controller, routes
│   │   ├── customers/                 # types, validation, repository, service, controller, routes
│   │   ├── products/                  # types, validation, repository, service, controller, routes
│   │   ├── inventory/                 # types, validation, repository, service, controller, routes
│   │   └── challans/                  # types, validation, repository, service, controller, routes
│   ├── services/
│   │   ├── s3.service.ts              # AWS S3 upload / signed URLs / delete
│   │   └── pdf.service.ts             # PDFKit invoice renderer
│   ├── database/
│   │   ├── migrations/001_init.sql    # full schema
│   │   ├── migrate.ts                 # transactional migration runner
│   │   └── seed.ts                    # idempotent seed data
│   ├── routes/index.ts                # module router + endpoint catalogue
│   ├── types/express.d.ts             # req.user / req.validated augmentation
│   ├── app.ts                         # Express app assembly
│   └── server.ts                      # bootstrap + graceful shutdown
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── tsconfig.json
├── package.json
└── README.md
```

Each module follows the same layering: **routes → controller → service → repository**.
Routes handle auth/RBAC/validation, controllers shape HTTP concerns, services own the business
rules and transactions, repositories own the SQL.

---

## 3. Quick start

### Prerequisites
- Node.js 18+
- PostgreSQL 13+
- (Optional) An AWS S3 bucket for product images

### Option A — local Postgres

```bash
git clone <your-repo-url> erp-crm-portal
cd erp-crm-portal
npm install

cp .env.example .env
# Edit .env: set DATABASE_URL and a JWT_SECRET of at least 16 characters.

# Create the database (adjust user as needed)
createdb erp_crm_portal

npm run migrate     # applies src/database/migrations/*.sql
npm run seed        # users, customers, products, 2 challans
npm run dev         # http://localhost:4000
```

Verify:

```bash
curl http://localhost:4000/health
```

### Option B — Docker Compose (API + Postgres)

```bash
cp .env.example .env          # set JWT_SECRET
docker compose up -d --build
docker compose exec api node dist/database/migrate.js
docker compose exec api node dist/database/seed.js
```

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` and copy `.sql` migrations |
| `npm start` | Run the compiled server |
| `npm run migrate` / `migrate:prod` | Apply migrations (TS / compiled) |
| `npm run seed` / `seed:prod` | Load seed data (TS / compiled) |
| `npm run db:setup` | migrate + seed |
| `npm run typecheck` | `tsc --noEmit` |

---

## 4. Environment variables

Copy `.env.example` to `.env`. The app validates every variable on boot with Zod and
**exits with a readable error** if anything is missing or malformed.

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `4000` | |
| `API_PREFIX` | `/api/v1` | Routes are served at both `/` and this prefix |
| `CORS_ORIGIN` | `*` | Comma-separated list, or `*` |
| `DATABASE_URL` | — | **Required.** `postgresql://user:pass@host:5432/db` |
| `DB_SSL` | `false` | Set `true` for AWS RDS |
| `DB_POOL_MAX` | `10` | |
| `JWT_SECRET` | — | **Required**, minimum 16 characters |
| `JWT_EXPIRES_IN` | `1d` | |
| `BCRYPT_SALT_ROUNDS` | `10` | |
| `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | `15` | |
| `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` | `10` | Per IP, per window |
| `DEFAULT_PAGE_SIZE` | `20` | |
| `MAX_PAGE_SIZE` | `100` | Upper bound enforced by validation |
| `CHALLAN_NUMBER_PREFIX` | `CHN` | Produces `CHN-2026-000001` |
| `CHALLAN_NUMBER_PADDING` | `6` | Zero padding width |
| `COMPANY_NAME` / `COMPANY_ADDRESS` / `COMPANY_EMAIL` / `COMPANY_PHONE` / `COMPANY_GSTIN` | — | Printed on the PDF invoice |
| `AWS_REGION` | `ap-south-1` | |
| `AWS_S3_BUCKET` | — | Required for image upload |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | — | **Leave empty on EC2/ECS** to use the IAM role |
| `AWS_S3_PUBLIC_BASE_URL` | — | Optional CloudFront domain |
| `AWS_S3_PRIVATE_OBJECTS` | `false` | `true` → returns time-limited signed URLs |
| `AWS_S3_SIGNED_URL_EXPIRY_SECONDS` | `3600` | |
| `MAX_UPLOAD_SIZE_MB` | `5` | |
| `SEED_DEFAULT_PASSWORD` | `Password@123` | Password for all seeded users |

> `.env` is git-ignored. Never commit real credentials — use AWS Secrets Manager or SSM Parameter Store in production.

---

## 5. Database schema

`src/database/migrations/001_init.sql` creates:

| Table | Purpose |
|---|---|
| `users` | Portal users with `user_role` enum, bcrypt hash, `is_active`, `last_login_at` |
| `customers` | Full CRM record; unique mobile number |
| `customer_follow_ups` | Dated follow-up notes per customer |
| `products` | Catalogue + live stock; unique SKU |
| `stock_movements` | Append-only inventory ledger |
| `challan_counters` | Backs gap-free challan number generation |
| `challans` | Header + `customer_snapshot` JSONB |
| `challan_items` | Line items + snapshot columns + `product_snapshot` JSONB |
| `schema_migrations` | Applied migration tracking |

Enums: `user_role`, `customer_type`, `customer_status`, `movement_type`,
`movement_reference_type`, `challan_status`.

Key constraints:

```sql
CONSTRAINT products_current_stock_non_negative CHECK (current_stock >= 0)
CONSTRAINT products_sku_unique               UNIQUE (sku)
CONSTRAINT customers_mobile_unique           UNIQUE (mobile_number)
CONSTRAINT challans_number_unique            UNIQUE (challan_number)
CONSTRAINT challan_items_unique_product      UNIQUE (challan_id, product_id)
CONSTRAINT stock_movements_quantity_positive CHECK (quantity_changed > 0)
```

`updated_at` is maintained by a `set_updated_at()` trigger on `users`, `customers`,
`products` and `challans`. Indexes cover every filterable and sortable column, plus
`LOWER()` expression indexes for case-insensitive name search and a GIN index on
`challans.customer_snapshot`.

The migration runner applies each `.sql` file inside its own transaction and records it in
`schema_migrations`, so re-running is safe and a failed migration never leaves a half-applied schema.

---

## 6. Roles & permission matrix

`Admin` bypasses every role check. Others:

| Endpoint | Admin | Sales | Warehouse | Accounts |
|---|:---:|:---:|:---:|:---:|
| `POST /auth/login` | public | public | public | public |
| `POST /auth/register`, `GET /auth/users` | ✅ | — | — | — |
| `GET /auth/me`, `POST /auth/change-password` | ✅ | ✅ | ✅ | ✅ |
| `GET /customers`, `GET /customers/:id` | ✅ | ✅ | — | ✅ |
| `POST /customers`, `PUT /customers/:id` | ✅ | ✅ | — | — |
| `POST /customers/:id/follow-ups` | ✅ | ✅ | — | — |
| `GET /products`, `GET /products/:id` | ✅ | ✅ | ✅ | ✅ |
| `POST /products`, `PUT /products/:id`, `POST /products/:id/image` | ✅ | — | ✅ | — |
| `GET /inventory`, `GET /inventory/low-stock-alerts` | ✅ | ✅ | ✅ | ✅ |
| `GET /inventory/movements` | ✅ | — | ✅ | ✅ |
| `POST /inventory/adjust` | ✅ | — | ✅ | — |
| `POST /challans` | ✅ | ✅ | — | — |
| `GET /challans`, `GET /challans/:id` | ✅ | ✅ | ✅ | ✅ |
| `PATCH /challans/:id/status` | ✅ | ✅ | ✅ | — |
| `GET /challans/:id/invoice` | ✅ | ✅ | — | ✅ |

A denied request returns `403` with the required roles and the caller's actual role.

---

## 7. API reference

All routes are available at the bare path (`POST /auth/login`) **and** under the versioned
prefix (`POST /api/v1/auth/login`). Protected endpoints require `Authorization: Bearer <token>`.

### Authentication

```
POST   /auth/login              Public. Returns accessToken + user.
POST   /auth/register           Admin. Create a portal user.
GET    /auth/me                 Current profile.
POST   /auth/change-password    Change own password.
GET    /auth/users              Admin. List users.
```

```bash
curl -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"sales@erpcrm.local","password":"Password@123"}'
```

### Customers

```
GET    /customers               List. Search, filter, sort, paginate.
POST   /customers               Create.
GET    /customers/:id           Detail (includes follow-up history).
PUT    /customers/:id           Update (partial).
POST   /customers/:id/follow-ups  Add a follow-up note.
GET    /customers/:id/follow-ups  List follow-up notes.
```

Query parameters for `GET /customers`:
`page`, `limit`, `sortBy` (`customerName` | `businessName` | `email` | `status` | `customerType` | `followUpDate` | `createdAt` | `updatedAt`), `sortOrder` (`asc`/`desc`),
`search` (matches name, business, email, mobile, GST, address), `status`, `customerType`,
`followUpFrom`, `followUpTo`, `hasGst`, `createdBy`.

```bash
curl -X POST http://localhost:4000/customers \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "customerName":"Test Buyer",
    "mobileNumber":"+91 90000 12345",
    "email":"test@buyer.example",
    "businessName":"Test Buyer Pvt Ltd",
    "gstNumber":"36AABCU9603R1ZX",
    "customerType":"WHOLESALE",
    "address":"12 Test Street, Hyderabad 500001",
    "status":"ACTIVE",
    "followUpDate":"2026-08-20",
    "notes":"Interested in bulk LED panels"
  }'
```

### Products

```
GET    /products                List. Search, filter, sort, paginate.
POST   /products                Create.
GET    /products/:id            Detail.
PUT    /products/:id            Update (partial).
POST   /products/:id/image      Upload image to S3 (multipart, field "image").
GET    /products/meta/facets    Distinct categories and warehouse locations.
```

Query parameters for `GET /products`: `page`, `limit`, `sortBy`, `sortOrder`, `search`,
`category`, `warehouseLocation`, `isActive`, `lowStockOnly`, `outOfStockOnly`, `minPrice`, `maxPrice`.

```bash
curl -X POST http://localhost:4000/products/$PRODUCT_ID/image \
  -H "Authorization: Bearer $TOKEN" \
  -F "image=@./led-panel.jpg"
```

### Inventory

```
GET    /inventory                          Stock position per product + KPI summary.
GET    /inventory/movements                Stock Movement Log.
GET    /inventory/low-stock-alerts         Products at or below their alert quantity.
POST   /inventory/adjust                   Manual IN / OUT correction.
GET    /inventory/products/:id/movements   Ledger for one product.
```

`GET /inventory/movements` filters: `productId`, `movementType` (`IN`/`OUT`), `referenceType`
(`CHALLAN` / `PRODUCT` / `MANUAL_ADJUSTMENT`), `referenceId`, `createdBy`, `dateFrom`, `dateTo`, `search`.

`GET /inventory` returns a `meta.summary`:

```json
"summary": {
  "totalProducts": 8, "activeProducts": 8,
  "lowStockCount": 3, "outOfStockCount": 1,
  "totalUnitsInStock": 1840, "inventoryValue": 512340.50
}
```

### Sales Challans

```
POST   /challans                Create as DRAFT or CONFIRMED.
GET    /challans                List (line items included).
GET    /challans/:id            Detail + related stock movements.
PATCH  /challans/:id/status     Change status.
GET    /challans/:id/invoice    Export PDF (?download=true to force attachment).
```

```bash
# Create and confirm in one call — inventory is reduced atomically
curl -X POST http://localhost:4000/challans \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "customerId":"<customer-uuid>",
    "items":[
      {"productId":"<product-uuid>","quantity":25},
      {"productId":"<product-uuid>","quantity":100}
    ],
    "status":"CONFIRMED",
    "notes":"Monthly replenishment order"
  }'

# Confirm a draft later
curl -X PATCH http://localhost:4000/challans/$ID/status \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"CONFIRMED"}'

# Cancel a confirmed challan — stock is returned to inventory
curl -X PATCH http://localhost:4000/challans/$ID/status \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"status":"CANCELLED","reason":"Customer cancelled the order"}'

# Download the invoice
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/challans/$ID/invoice?download=true" -o invoice.pdf
```

---

## 8. Response format

Every endpoint returns the same envelope.

**Success:**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Customers fetched successfully",
  "data": [ /* object or array */ ],
  "meta": {
    "pagination": {
      "page": 1, "limit": 20, "totalItems": 42, "totalPages": 3,
      "hasPreviousPage": false, "hasNextPage": true
    },
    "sort": { "sortBy": "createdAt", "sortOrder": "DESC" },
    "filters": { "search": "Gupta", "status": "ACTIVE" },
    "summary": { "byStatus": { "ACTIVE": 4, "LEAD": 1, "INACTIVE": 1 } }
  },
  "timestamp": "2026-07-22T11:34:06.495Z",
  "path": "/customers?search=Gupta"
}
```

**Error:**

```json
{
  "success": false,
  "statusCode": 409,
  "message": "Insufficient stock to confirm challan CHN-2026-000003. 1 product(s) do not have enough quantity available. Stock can never become negative.",
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "details": {
      "challanNumber": "CHN-2026-000003",
      "insufficientItems": [{
        "productId": "db8e1171-…", "sku": "LED-PNL-18W",
        "productName": "LED Panel Light 18W",
        "requestedQuantity": 999999, "availableStock": 215, "shortfall": 999784
      }]
    }
  },
  "timestamp": "2026-07-22T11:34:06.495Z",
  "path": "/challans"
}
```

Validation failures return `422` with a per-field breakdown:

```json
"details": [
  { "field": "gstNumber",  "message": "GST Number must be a valid 15 character GSTIN (e.g. 36AABCU9603R1ZX)", "code": "invalid_string" },
  { "field": "items.0.quantity", "message": "Must be greater than zero", "code": "too_small" }
]
```

Stack traces are included only when `NODE_ENV !== 'production'`.

### Status codes

| Code | Meaning |
|---|---|
| `200` | OK |
| `201` | Created |
| `400` | Malformed JSON, foreign key violation, invalid value format |
| `401` | Missing / invalid / expired token, bad credentials |
| `403` | Authenticated but the role is not permitted; deactivated account |
| `404` | Resource or route not found |
| `409` | Duplicate SKU / mobile, **insufficient stock**, invalid status transition |
| `422` | Validation failure, unsupported file type, oversized file |
| `429` | Login rate limit exceeded |
| `500` | Unexpected server error |
| `503` | S3 not configured / upload failed |

Common error codes: `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `INSUFFICIENT_ROLE`,
`VALIDATION_ERROR`, `CUSTOMER_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `CHALLAN_NOT_FOUND`,
`DUPLICATE_SKU`, `DUPLICATE_MOBILE_NUMBER`, `DUPLICATE_PRODUCT_LINE`, `INSUFFICIENT_STOCK`,
`INVALID_STATUS_TRANSITION`, `STATUS_UNCHANGED`, `INACTIVE_PRODUCT`, `S3_NOT_CONFIGURED`.

---

## 9. Business rules — sales challan

### Confirmed challans automatically reduce inventory
Confirming — whether at creation (`"status":"CONFIRMED"`) or later via
`PATCH /challans/:id/status` — deducts every line quantity from `products.current_stock`
and writes one `OUT` row to the Stock Movement Log per line. All of it happens inside a
single transaction alongside the challan insert, so a failure anywhere rolls the whole
operation back rather than leaving a half-applied document.

### Stock quantity must never become negative
Three independent layers enforce this:

1. **Pre-check.** All referenced product rows are locked with `SELECT … FOR UPDATE`
   (ordered by `id` to avoid deadlocks between concurrent confirmations), then every line is
   checked at once so the caller gets a single error listing *all* insufficient products
   rather than discovering them one at a time.
2. **Guarded UPDATE.** The authoritative check:
   ```sql
   UPDATE products
   SET current_stock = current_stock - $1
   WHERE id = $2 AND current_stock >= $1
   RETURNING current_stock;
   ```
   Zero rows affected → the transaction aborts with `409 INSUFFICIENT_STOCK`.
3. **CHECK constraint.** `products_current_stock_non_negative` makes negative stock
   unrepresentable in the database, whatever code path is taken.

### Proper API error when stock is insufficient
`409 Conflict`, code `INSUFFICIENT_STOCK`, with `details.insufficientItems` listing
`productId`, `sku`, `productName`, `requestedQuantity`, `availableStock` and `shortfall`
for each failing line. **Stock is left untouched.**

### Product snapshot data stored within the challan
`challan_items` stores denormalized snapshot columns — `product_name`, `sku`, `category`,
`unit_price`, `warehouse_location`, `quantity`, `line_total` — *plus* a complete
`product_snapshot` JSONB blob (including `stockAtChallanTime`, `imageUrl`, `description`
and `snapshotTakenAt`). The challan header likewise stores a `customer_snapshot` JSONB.
Renaming a product, changing its price, or editing the customer later never alters a
historic challan or its PDF invoice.

### Status transitions

```
DRAFT ──confirm──▶ CONFIRMED ──cancel──▶ CANCELLED
  │                                          ▲
  └──────────────── cancel ──────────────────┘
```

| From → To | Stock effect |
|---|---|
| `DRAFT` → `CONFIRMED` | Deduct; log `OUT` per line |
| `DRAFT` → `CANCELLED` | None (nothing was deducted) |
| `CONFIRMED` → `CANCELLED` | Restore; log `IN` per line |
| Anything → `DRAFT` | Rejected (`INVALID_STATUS_TRANSITION`) |
| `CANCELLED` → anything | Rejected |
| Same → same | Rejected (`STATUS_UNCHANGED`) |

### Challan number generation
An atomic upsert on `challan_counters` yields gap-free, collision-free numbers even when
several sales users create challans simultaneously:

```sql
INSERT INTO challan_counters (prefix, last_number) VALUES ($1, 1)
ON CONFLICT (prefix) DO UPDATE SET last_number = challan_counters.last_number + 1
RETURNING last_number;
```

Format: `{CHALLAN_NUMBER_PREFIX}-{YYYY}-{zero-padded sequence}` → `CHN-2026-000001`.

### Other guards
- The same product twice in one challan → `422 DUPLICATE_PRODUCT_LINE`.
- Inactive products → `422 INACTIVE_PRODUCT`.
- Missing customer or product → `404` with the offending IDs.

### Verified behaviour

These were exercised against a live PostgreSQL instance:

| Scenario | Result |
|---|---|
| Confirm 999,999 units when stock is 215 | `409 INSUFFICIENT_STOCK`, stock **unchanged at 215** |
| Save as draft (qty 30) | `CHN-2026-000003`, stock unchanged, snapshots stored |
| Draft → Confirmed | stock 215 → **185**, `OUT` movement logged |
| Confirmed → Cancelled | stock → **215**, `IN` movement logged |
| Cancelled → Confirmed | `409 INVALID_STATUS_TRANSITION` |
| Invoice export | `200`, `application/pdf`, valid 1-page PDF |

---

## 10. Seed data & login credentials

`npm run seed` is idempotent and loads:

- **4 users**, one per role
- **5 customers** across Lead / Active / Inactive and Retail / Wholesale / Distributor,
  with and without GST numbers, plus a follow-up note
- **8 products** across 5 categories and 3 warehouses — deliberately including
  two low-stock items and one out-of-stock item so Low Stock Alerts return data
- **2 challans** — one `CONFIRMED` (with matching stock deduction and `OUT` movements)
  and one `DRAFT`

| Role | Email | Password |
|---|---|---|
| Admin | `admin@erpcrm.local` | `Password@123` |
| Sales | `sales@erpcrm.local` | `Password@123` |
| Warehouse | `warehouse@erpcrm.local` | `Password@123` |
| Accounts | `accounts@erpcrm.local` | `Password@123` |

Override the password with `SEED_DEFAULT_PASSWORD`. **Change these before any deployment.**

---

## 11. AWS deployment

### 11.1 Database — Amazon RDS for PostgreSQL

1. Create a PostgreSQL 15/16 instance (Multi-AZ for production).
2. Place it in a **private** subnet; allow inbound `5432` only from the application security group.
3. Set `DATABASE_URL` to the RDS endpoint and `DB_SSL=true`.
4. Run migrations once from a bastion, a CI job, or an ECS one-off task:
   ```bash
   npm run build && npm run migrate:prod
   ```

### 11.2 S3 bucket for product images

```bash
aws s3api create-bucket \
  --bucket erp-crm-portal-product-images \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
```

Minimum IAM policy for the application role:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::erp-crm-portal-product-images/*"
  }]
}
```

Two serving modes:
- **Public bucket / CloudFront** — leave `AWS_S3_PRIVATE_OBJECTS=false`; objects are uploaded
  with `public-read` and the API returns a permanent URL. Set `AWS_S3_PUBLIC_BASE_URL` to your
  CloudFront domain if you front the bucket with a CDN.
- **Private bucket (recommended)** — set `AWS_S3_PRIVATE_OBJECTS=true`; no ACL is applied and
  the API returns a signed URL valid for `AWS_S3_SIGNED_URL_EXPIRY_SECONDS`.

Leave `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` **empty** on AWS — the SDK picks up the
EC2 instance profile, ECS task role, or EKS IRSA role automatically. Static keys are only for
local development.

### 11.3 Option A — EC2 + PM2 + Nginx

```bash
# On an Amazon Linux 2023 / Ubuntu instance
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2

git clone <your-repo-url> /var/www/erp-crm-portal
cd /var/www/erp-crm-portal
npm ci
cp .env.example .env       # fill in RDS, JWT_SECRET, S3
npm run build
npm run migrate:prod
npm run seed:prod          # first deploy only

pm2 start dist/server.js --name erp-crm-api -i max
pm2 startup && pm2 save
```

Nginx reverse proxy:

```nginx
server {
  listen 80;
  server_name api.example.com;

  location / {
    proxy_pass         http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
  }
}
```

Then add TLS with `sudo certbot --nginx -d api.example.com`.

The app calls `app.set('trust proxy', 1)`, so client IPs — and therefore login rate
limiting — remain correct behind Nginx or an ALB.

### 11.4 Option B — ECS Fargate + ALB

1. Build and push the image:
   ```bash
   aws ecr create-repository --repository-name erp-crm-portal
   aws ecr get-login-password --region ap-south-1 \
     | docker login --username AWS --password-stdin <acct>.dkr.ecr.ap-south-1.amazonaws.com
   docker build -t erp-crm-portal .
   docker tag erp-crm-portal:latest <acct>.dkr.ecr.ap-south-1.amazonaws.com/erp-crm-portal:latest
   docker push <acct>.dkr.ecr.ap-south-1.amazonaws.com/erp-crm-portal:latest
   ```
2. Create a task definition exposing port `4000`. Inject `DATABASE_URL` and `JWT_SECRET` via
   **Secrets Manager**, the rest as plain environment variables. Attach a task role carrying
   the S3 policy above.
3. Point the ALB target group health check at **`/health`**.
4. Run migrations as a one-off task with the command override
   `node dist/database/migrate.js`.

### 11.5 Option C — Elastic Beanstalk

`eb init` → Node.js 20 platform → `eb create erp-crm-portal-prod`. Set environment
properties in the console (or `eb setenv`). Beanstalk runs `npm start` against the built
`dist/`, so run `npm run build` in a prebuild hook or commit a CI-produced artifact.

### 11.6 Production checklist

- [ ] `NODE_ENV=production` (hides stack traces from API responses)
- [ ] Strong, rotated `JWT_SECRET` from Secrets Manager
- [ ] `DB_SSL=true` for RDS
- [ ] `CORS_ORIGIN` set to actual frontend origins, not `*`
- [ ] Seeded demo passwords changed or the seed users removed
- [ ] RDS in a private subnet; automated backups enabled
- [ ] CloudWatch log group + alarms on 5xx rate and RDS connections
- [ ] ALB health check on `/health`
- [ ] Reduce `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` if brute-force pressure is a concern

---

## 12. Troubleshooting

**`Invalid environment configuration` on startup**
Zod lists each offending variable. Most often `JWT_SECRET` is shorter than 16 characters or
`DATABASE_URL` is absent.

**`ECONNREFUSED` connecting to Postgres**
Confirm the service is running and `DATABASE_URL` host/port/credentials are correct. On RDS,
check the security group allows `5432` from the app and that `DB_SSL=true`.

**`Migrations directory not found`**
Run `npm run build` before `npm run migrate:prod` — the build's `copy:assets` step copies
`.sql` files into `dist/`.

**`429` while testing**
The login limiter allows `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` per IP per window. Raise it in `.env`
for local testing, or reuse one token across requests.

**`503 S3_NOT_CONFIGURED` on image upload**
Set `AWS_S3_BUCKET` and `AWS_REGION`. On AWS, verify the instance/task role carries the
`s3:PutObject` permission for the bucket.

**Stock looks wrong after manual database edits**
`current_stock` and `stock_movements` are kept in sync only through the API. Reconcile with:
```sql
SELECT p.sku, p.current_stock,
       COALESCE(SUM(CASE WHEN m.movement_type = 'IN' THEN m.quantity_changed
                         ELSE -m.quantity_changed END), 0) AS ledger_balance
FROM products p
LEFT JOIN stock_movements m ON m.product_id = p.id
GROUP BY p.id, p.sku, p.current_stock
HAVING p.current_stock <> COALESCE(SUM(CASE WHEN m.movement_type = 'IN' THEN m.quantity_changed
                                            ELSE -m.quantity_changed END), 0);
```

---

## License

MIT
