# Prompt: Generate GEMINI.md for Readymade Shop Admin + Cashier System

Create a production-grade `GEMINI.md` for a **Readymade Clothing Shop Management System** containing two separate panels:

1. **Admin Panel**
2. **Cashier Panel**

The application must be designed for real-world production use, with strong authentication, authorization, data integrity, auditability, and protection against privilege escalation.

## Core Business Rule

The most important security requirement is:

> **ONLY an authenticated Admin can register a Cashier.**

A Cashier must NEVER be able to:

- Register another Cashier
- Create an Admin
- Change their own role
- Change another user's role
- Access Admin APIs
- Access Admin pages
- Manage Cashiers
- Manage Admin users
- Modify shop settings
- Modify permissions
- Bypass authorization by directly calling APIs
- Manipulate prices, discounts, totals, or inventory through modified frontend requests

Do NOT rely only on frontend route guards or hidden buttons.

All authorization MUST be enforced on the backend/API/server.

---

## Your Task

Generate a complete `GEMINI.md` that acts as the **AI coding/development instruction file** for this project.

The document must instruct Gemini to build the system securely and production-ready.

Include the following sections.

### 1. Project Overview

Describe:

- Readymade clothing shop
- Admin Panel
- Cashier Panel
- POS
- Product management
- Inventory
- Sales
- Payments
- Reports
- Cashier management
- Audit logs

### 2. Technology-Agnostic Architecture

Define a clean architecture:

```text
Frontend
   ↓
API / Backend
   ↓
Authentication
   ↓
Authorization / RBAC
   ↓
Business Logic
   ↓
Database
```

Explain that frontend security is NOT a trusted security boundary.

### 3. Roles

Define exactly:

```text
ADMIN
CASHIER
```

Explain permissions for each role.

Admin:

- Login
- Dashboard
- Products
- Categories
- Sizes
- Colors
- Inventory
- Cashiers
- Sales
- Reports
- Expenses
- Settings
- Audit logs

Cashier:

- Login
- POS
- Product search
- Barcode scanning
- Cart
- Sales
- Receipt
- Own sales/history
- Logout

### 4. Authentication

Specify:

- Secure login
- Password hashing
- Secure session management
- HTTPS
- Rate limiting
- Login protection
- Logout/session invalidation
- Secure cookies where appropriate
- No plaintext passwords
- No password hashes in API responses

### 5. Authorization / RBAC

Require server-side authorization on every protected API.

Use concepts such as:

```text
authenticate()
authorize(ADMIN)
authorize(CASHIER)
```

Explain the difference between:

```text
401 Unauthorized
403 Forbidden
```

### 6. Cashier Registration Security

Define the exact flow:

```text
Admin Login
    ↓
Admin Authentication
    ↓
Admin Authorization
    ↓
Register Cashier
    ↓
Backend creates user
    ↓
Backend assigns CASHIER role
    ↓
Audit log
```

The client must NOT be trusted to assign the role.

Do NOT allow:

```json
{
  "role": "ADMIN"
}
```

to control user privilege.

The backend must force the new account to:

```text
role = CASHIER
```

for the cashier-registration endpoint.

Recommended endpoint:

```http
POST /api/admin/cashiers
```

Only Admin can call it.

A Cashier attempting to call it must receive:

```http
403 Forbidden
```

### 7. Privilege Escalation Protection

Explicitly instruct Gemini to test attacks such as:

```text
Cashier changes role to ADMIN
Cashier calls Admin API
Cashier changes user ID
Cashier modifies request body
Cashier changes URL
Cashier manipulates localStorage role
Cashier bypasses frontend route
Cashier directly sends HTTP request
Cashier creates another user
```

All must fail server-side.

### 8. Admin Panel

Specify pages:

```text
/admin
/admin/products
/admin/categories
/admin/inventory
/admin/cashiers
/admin/sales
/admin/reports
/admin/expenses
/admin/audit-logs
/admin/settings
```

Include:

- Dashboard
- Sales statistics
- Product management
- Inventory management
- Cashier management
- Reports
- Audit logs
- Settings

### 9. Cashier Panel

Specify pages:

```text
/cashier
/cashier/pos
/cashier/sales
/cashier/profile
```

The cashier interface should be:

- Fast
- Simple
- Responsive
- Barcode-friendly
- Touch-friendly
- Keyboard-friendly

### 10. POS

Include:

- Product search
- Barcode scanning
- Size selection
- Color selection
- Cart
- Quantity
- Discounts
- Tax
- Payment
- Receipt
- Sale completion

The backend MUST calculate:

```text
subtotal
discount
tax
total
```

Do not trust values sent from the frontend.

### 11. Inventory Security

Require server-side stock validation.

Sales and inventory changes must use database transactions.

Example:

```text
BEGIN TRANSACTION

Validate stock
Create sale
Create sale items
Decrease inventory
Create payment
Create audit log

COMMIT
```

On failure:

```text
ROLLBACK
```

### 12. Audit Logging

Require audit logs for:

```text
ADMIN_LOGIN
CASHIER_LOGIN
CASHIER_CREATED
CASHIER_UPDATED
CASHIER_ACTIVATED
CASHIER_DEACTIVATED
PASSWORD_RESET
PRODUCT_CREATED
PRODUCT_UPDATED
STOCK_ADJUSTED
SALE_CREATED
SALE_CANCELLED
REFUND_CREATED
SETTINGS_CHANGED
```

Never log:

- Passwords
- Tokens
- Session cookies
- Password hashes
- API secrets
- Payment secrets

### 13. Data Integrity

Require:

- Unique username
- Unique employee ID
- Unique SKU
- Unique barcode
- Foreign keys
- Transactional sales
- Soft deletion where historical records depend on the entity

### 14. API Security

Require:

- Input validation
- Output validation
- Rate limiting
- SQL injection protection
- XSS protection
- CSRF protection where applicable
- Secure headers
- HTTPS
- Error sanitization
- Authentication
- Authorization

Never expose:

- Stack traces
- SQL queries
- Database errors
- Passwords
- Secrets
- Tokens

### 15. Development Rules

Tell Gemini:

- Never weaken security for convenience.
- Never trust frontend roles.
- Never implement authorization only in frontend.
- Never expose passwords.
- Never allow cashier self-registration.
- Never allow cashier role modification.
- Never allow cashier privilege escalation.
- Always validate API input.
- Always perform server-side price calculations.
- Always use transactions for financial operations.
- Always add tests for authorization.
- Preserve existing functionality when modifying code.
- Do not make unrelated changes.
- Prefer clean, maintainable production code.

### 16. Security Testing

Require tests for:

```text
Admin login
Cashier login
Invalid login
Inactive cashier login
Admin creates cashier
Cashier cannot create cashier
Cashier cannot create admin
Cashier cannot access admin API
Cashier cannot change role
Cashier cannot modify another user's permissions
Client price manipulation
Client total manipulation
Client discount manipulation
Stock manipulation
Insufficient stock
Transaction rollback
Session expiration
Rate limiting
```

### 17. Definition of Done

The `GEMINI.md` must define production readiness criteria.

The final document must be detailed, structured, practical, and written specifically for Gemini as an AI coding agent.

Do not produce generic software-development advice.

Focus on a real-world **Readymade Shop Admin + Cashier system**, especially the security boundary between Admin and Cashier.

Return ONLY the complete contents of `GEMINI.md`.