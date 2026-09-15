# Product Specification: Readymade Shop Management System

**Version:** 1.0.0  
**Standard:** Compliance with [GEMINI.md](file:///d:/readymadeshop/GEMINI.md)

---

## 1. System Overview

The **Readymade Shop Management System** is a retail point-of-sale and administrative platform designed specifically for apparel and garment retail shops. The platform operates on two distinct access planes:

1. **Admin Management Portal**: Administrative back-office for catalog management (sizes, colors, categories, SKUs), inventory controls, financial reports, audit logging, and **Cashier lifecycle management**.
2. **Cashier Point-of-Sale (POS)**: High-speed retail billing terminal for barcode scanning, clothing variant selection, cart handling, receipt generation, and shift sales viewing.

---

## 2. Core Security & Access Control Model

### 2.1 Role-Based Access Control (RBAC)

| Role | Scope | Permissions |
| :--- | :--- | :--- |
| **`ADMIN`** | Full System Access | Dashboard, Products, Inventory, Categories, Sizes, Colors, **Register Cashier**, Edit Cashier, Activate/Deactivate Cashier, Reset Cashier Access, Sales Management, Reports, Expenses, Audit Logs, Settings |
| **`CASHIER`** | POS & Own Shift Operations | POS Interface, Barcode Scanning, Product Lookup, Cart Operations, Server-Calculated Discounts, Accept Payment (Cash/Card/UPI), Receipt Printing, View Own Sales History, Shift Summary |

### 2.2 Security Invariants & Non-Negotiable Rules

1. **Strict Admin Cashier Provisioning**: Only an authenticated user with verified server-side `ADMIN` role can register, activate, deactivate, or reset a Cashier account.
2. **Role Immutability**: The cashier registration endpoint (`POST /api/admin/cashiers`) forcefully assigns `role = 'CASHIER'`. Client payload role overrides are ignored and stripped.
3. **Privilege Escalation Prevention**: Any attempt by a Cashier to call Admin APIs returns HTTP `403 Forbidden` and creates an audit entry.
4. **Credential Safety**: Passwords are encrypted with standard one-way hashing (bcrypt/PBKDF2/Argon2). Password hashes and authentication secrets are never transmitted in API responses or written to logs.
5. **Brute-Force Protection & Account Lockout**: Login attempts are rate-limited. Generic error responses (`Invalid username or password`) prevent username harvesting.
6. **Server-Side Financial Integrity**: All product prices, stock levels, discount limits, taxes, and order totals are calculated exclusively by the backend API inside atomic database transactions.

---

## 3. Database Schema Specification

### 3.1 `users`
- `id` (VARCHAR(36), PK, UUID)
- `username` (VARCHAR(50), UNIQUE, NOT NULL)
- `password_hash` (VARCHAR(255), NOT NULL)
- `full_name` (VARCHAR(100), NOT NULL)
- `employee_id` (VARCHAR(30), UNIQUE, NOT NULL)
- `mobile` (VARCHAR(20))
- `email` (VARCHAR(100))
- `role` (VARCHAR(20), NOT NULL: `'ADMIN'` | `'CASHIER'`)
- `status` (VARCHAR(20), NOT NULL: `'ACTIVE'` | `'INACTIVE'` | `'SUSPENDED'`)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `last_login_at` (DATETIME)

### 3.2 `categories`
- `id` (VARCHAR(36), PK)
- `name` (VARCHAR(100), NOT NULL)
- `description` (TEXT)
- `is_active` (BOOLEAN, DEFAULT 1)

### 3.3 `products`
- `id` (VARCHAR(36), PK)
- `name` (VARCHAR(150), NOT NULL)
- `sku` (VARCHAR(50), UNIQUE, NOT NULL)
- `barcode` (VARCHAR(50), UNIQUE, NOT NULL)
- `category_id` (VARCHAR(36), FK `categories.id`)
- `size` (VARCHAR(20), e.g., `'S'`, `'M'`, `'L'`, `'XL'`, `'XXL'`, `'32'`, `'34'`)
- `color` (VARCHAR(30))
- `purchase_price` (DECIMAL(10,2), NOT NULL)
- `selling_price` (DECIMAL(10,2), NOT NULL)
- `tax_rate` (DECIMAL(5,2), DEFAULT 0.00)
- `stock_quantity` (INTEGER, NOT NULL DEFAULT 0)
- `reorder_level` (INTEGER, DEFAULT 5)
- `image_url` (VARCHAR(255))
- `is_active` (BOOLEAN, DEFAULT 1)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

### 3.4 `sales` & `sale_items`
- `sales`: `id`, `invoice_no` (UNIQUE), `cashier_id` (FK `users.id`), `subtotal`, `discount_amount`, `tax_amount`, `total_amount`, `payment_method` (`'CASH'` | `'CARD'` | `'UPI'`), `payment_status`, `created_at`
- `sale_items`: `id`, `sale_id` (FK `sales.id`), `product_id` (FK `products.id`), `product_name`, `unit_price`, `quantity`, `subtotal`, `tax_amount`, `total`

### 3.5 `audit_logs`
- `id` (VARCHAR(36), PK)
- `actor_user_id` (VARCHAR(36), FK `users.id`)
- `action` (VARCHAR(50), e.g. `'ADMIN_LOGIN'`, `'CASHIER_CREATED'`, `'CASHIER_STATUS_CHANGED'`, `'SALE_CREATED'`)
- `entity_type` (VARCHAR(50))
- `entity_id` (VARCHAR(50))
- `ip_address` (VARCHAR(45))
- `user_agent` (TEXT)
- `metadata` (JSON/TEXT)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

---

## 4. API Endpoints Specification

### 4.1 Authentication Endpoints
- `POST /api/auth/login`
  - Body: `{ "username": "...", "password": "..." }`
  - Response: `{ "token": "...", "user": { "id": "...", "username": "...", "fullName": "...", "role": "ADMIN"|"CASHIER", "status": "ACTIVE" } }`
- `GET /api/auth/me`
  - Header: `Authorization: Bearer <token>`
  - Response: Authenticated user profile

### 4.2 Admin-Only Cashier Management
- `GET /api/admin/cashiers` (Admin Only)
  - Returns array of cashier profiles (without password hashes).
- `POST /api/admin/cashiers` (Admin Only)
  - Body: `{ "fullName": "...", "employeeId": "...", "mobile": "...", "email": "...", "username": "...", "password": "..." }`
  - Returns newly created cashier profile with `role: "CASHIER"`.
- `PATCH /api/admin/cashiers/:id/status` (Admin Only)
  - Body: `{ "status": "ACTIVE" | "INACTIVE" | "SUSPENDED" }`
- `POST /api/admin/cashiers/:id/reset-password` (Admin Only)
  - Body: `{ "newPassword": "..." }`

### 4.3 POS & Cashier Operations
- `GET /api/cashier/products` (Cashier & Admin)
  - Search & barcode lookup for catalog items.
- `POST /api/cashier/sales` (Cashier & Admin)
  - Body: `{ "items": [{ "productId": "...", "quantity": 1 }], "discountPercent": 0, "paymentMethod": "CASH" }`
  - Server recalculates prices, validates inventory in atomic transaction, decreases stock, writes sale + audit log, returns invoice receipt.
- `GET /api/cashier/my-sales` (Cashier)
  - Returns current shift/logged-in cashier's completed sales.

### 4.4 Audit Logs
- `GET /api/admin/audit-logs` (Admin Only)
  - Returns paginated append-only audit trail.

---

## 5. Frontend Interfaces & Flows

1. **Landing & Route Portal (`/`)**: Clean portal to choose **Admin Login** or **Cashier Login**.
2. **Admin Login (`/admin-login.html`)**: Branded admin authentication screen with username/password, rate limit defense, and error handling.
3. **Cashier Login (`/cashier-login.html`)**: Retail counter cashier authentication screen.
4. **Admin Dashboard (`/admin/index.html`)**:
   - Cashier Management tab (Cashier registration form, Cashier list table, Activate/Deactivate/Suspend toggle, Reset Password modal).
   - Inventory & Product management tab.
   - Sales & Analytics tab.
   - Audit Log inspection table.
5. **Cashier POS Terminal (`/cashier/index.html`)**:
   - Barcode & SKU fast-search box.
   - Product catalog with size/color badges.
   - Live cart with automatic line pricing, tax calculation, and payment trigger (Cash, Card, UPI).
   - Printable thermal/standard receipt preview modal.
   - My Shift Sales tracker.
