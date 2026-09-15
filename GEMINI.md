# GEMINI.md

# Readymade Shop — Admin & Cashier Application

## 1. Project Overview

Build a production-grade readymade clothing shop management application with two primary interfaces:

1. **Admin Panel**
2. **Cashier Panel**

The application must enforce strict role-based access control.

### Core Security Rule

> **Only an authenticated Admin can create/register, activate, deactivate, edit, or remove Cashier accounts.**

Cashiers must **never** be able to:

- Register another cashier
- Create an admin account
- Change their own role
- Access admin routes
- Modify shop settings
- Modify users
- View sensitive administrative information
- Bypass frontend restrictions through API requests

All authorization must be enforced **server-side**. Frontend restrictions are only for user experience.

---

# 2. User Roles

## Admin

The Admin is the highest application role.

Admin permissions:

- Login
- View dashboard
- Manage products
- Manage categories
- Manage sizes
- Manage colors
- Manage inventory
- Register cashier
- Edit cashier
- Activate/deactivate cashier
- Reset cashier access
- View cashier activity
- Manage sales
- View reports
- View expenses
- Manage shop settings
- View audit logs
- Manage permissions where applicable

## Cashier

Cashier permissions:

- Login
- View cashier dashboard
- Search products
- Scan products/barcodes
- Create sales
- Add/remove items from current cart
- Apply permitted discounts
- Accept payment
- Generate/print receipt
- View their own sales
- View assigned/current shift
- Logout

Cashier must NOT have access to:

- User management
- Cashier registration
- Admin dashboard
- Product deletion
- Shop configuration
- Audit-log administration
- Other cashier management
- Permission management
- Sensitive financial administration

---

# 3. Application Architecture

Use a secure architecture:

```text
Frontend
   |
   | HTTPS
   v
API / Backend
   |
   +---- Authentication
   |
   +---- Authorization / RBAC
   |
   +---- Business Logic
   |
   +---- Audit Logging
   |
   v
Database
```

Never trust:

- URL parameters
- Frontend role values
- Hidden buttons
- LocalStorage role values
- Client-side permissions
- Request body role fields

The backend must determine the authenticated user's identity and role from a trusted authentication mechanism.

---

# 4. Authentication

## Login

Both Admin and Cashier use the login page.

Fields:

- Username/email/employee ID
- Password

Optional:

- Remember device
- Show/hide password

Security requirements:

- Passwords must never be stored as plaintext.
- Use a modern password hashing algorithm such as Argon2id or bcrypt.
- Use secure session handling.
- Use HTTPS in production.
- Implement login rate limiting.
- Implement account lockout or progressive delays after repeated failures.
- Never expose whether a username exists through detailed error messages.

Example:

```text
Invalid username or password.
```

Do not return:

```text
Username exists but password is incorrect.
```

---

# 5. Admin Panel

## Admin Layout

```text
--------------------------------------------------
| Logo | Shop Name                | Admin | Logout |
--------------------------------------------------
| Sidebar                  | Main Content        |
|                         |                     |
| Dashboard               |                     |
| Products                |                     |
| Categories              |                     |
| Inventory               |                     |
| Cashiers                |                     |
| Sales                   |                     |
| Expenses                |                     |
| Reports                 |                     |
| Audit Logs              |                     |
| Settings                |                     |
--------------------------------------------------
```

---

# 6. Admin Dashboard

Display:

- Today's sales
- Today's number of bills
- Total products
- Low-stock products
- Active cashiers
- Today's expenses
- Net sales
- Recent transactions
- Recent cashier activity

Dashboard must not expose passwords, authentication tokens, or other secrets.

---

# 7. Cashier Management

Admin menu:

```text
Admin Panel
    |
    +-- Cashiers
          |
          +-- Cashier List
          +-- Register Cashier
          +-- Edit Cashier
          +-- Activate
          +-- Deactivate
          +-- Reset Access
          +-- Activity
```

## Register Cashier Page

Fields:

- Full name
- Employee ID
- Mobile number
- Email
- Username
- Temporary password / activation flow
- Status

Role must be assigned by the backend.

The frontend must NOT allow the Admin to arbitrarily create another Admin through the cashier-registration endpoint.

Preferred API:

```http
POST /api/admin/cashiers
```

Backend automatically assigns:

```text
role = CASHIER
```

Do not trust:

```json
{
  "role": "CASHIER"
}
```

from the client.

---

# 8. Cashier Registration Security

When Admin creates a cashier:

1. Verify Admin authentication.
2. Verify Admin role on the server.
3. Validate all fields.
4. Check employee ID uniqueness.
5. Check username uniqueness.
6. Hash password securely.
7. Create user with immutable `CASHIER` role.
8. Record audit event.
9. Return safe user information.
10. Never return the password hash.

Example response:

```json
{
  "id": "cashier-id",
  "name": "Cashier Name",
  "employeeId": "EMP001",
  "role": "CASHIER",
  "status": "ACTIVE"
}
```

Never return:

```json
{
  "passwordHash": "..."
}
```

---

# 9. Cashier List

Columns:

- Name
- Employee ID
- Username
- Status
- Created date
- Last login
- Actions

Actions:

```text
View
Edit
Activate
Deactivate
Reset Access
Activity
```

Deleting users should generally be avoided.

Prefer:

```text
ACTIVE
INACTIVE
SUSPENDED
```

This preserves historical sales records.

---

# 10. Product Management

Admin can manage:

- Product name
- SKU
- Barcode
- Category
- Brand
- Size
- Color
- Purchase price
- Selling price
- Discount
- Tax
- Stock quantity
- Reorder level
- Product status
- Product image

Product deletion should preferably be a soft delete.

Example:

```text
is_active = false
```

Historical transactions must continue to reference the product.

---

# 11. Inventory

Admin can:

- Add stock
- Remove stock
- Adjust stock
- View stock history
- View low-stock items
- View out-of-stock items
- View stock movement

Every stock adjustment must create an inventory transaction.

Example:

```text
STOCK_IN
STOCK_OUT
SALE
RETURN
ADJUSTMENT
```

---

# 12. Cashier Panel

Cashier interface must be intentionally simple.

```text
--------------------------------------------------
| Shop Logo | POS | Cashier Name | Logout        |
--------------------------------------------------
| Search / Barcode                                |
--------------------------------------------------
| Product Search | Current Cart                   |
|                |                                |
| Product list   | Item 1                         |
|                | Item 2                         |
|                | Item 3                         |
|                |                                |
|                | Subtotal                       |
|                | Discount                       |
|                | Tax                            |
|                | Total                          |
--------------------------------------------------
| Payment | Complete Sale | Print Receipt         |
--------------------------------------------------
```

---

# 13. Cashier POS

Features:

- Product search
- Barcode scanner input
- Category filtering
- Size/color selection
- Add to cart
- Change quantity
- Remove item
- Discount where permitted
- Payment method
- Complete sale
- Receipt generation

Supported payment methods can include:

```text
CASH
CARD
UPI
OTHER
```

---

# 14. Sale Security

When completing a sale:

```text
POST /api/cashier/sales
```

Backend must:

1. Authenticate cashier.
2. Verify cashier role.
3. Validate products.
4. Validate stock.
5. Recalculate prices server-side.
6. Recalculate discounts server-side.
7. Recalculate taxes server-side.
8. Calculate final amount server-side.
9. Create transaction.
10. Deduct inventory atomically.
11. Create payment record.
12. Create audit record.
13. Return receipt information.

Never trust the frontend's:

```text
total
discount
tax
selling price
stock
```

---

# 15. Transaction Integrity

Sale creation and stock deduction must be performed inside a database transaction.

Example:

```text
BEGIN TRANSACTION

Create Sale
Create Sale Items
Validate Stock
Decrease Stock
Create Payment
Create Audit Log

COMMIT
```

If any step fails:

```text
ROLLBACK
```

This prevents situations such as:

```text
Sale created
but stock was not deducted
```

---

# 16. Authorization

Use RBAC.

Example:

```text
ROLE_ADMIN
ROLE_CASHIER
```

Backend middleware:

```text
authenticate()
authorize("ADMIN")
```

Example:

```text
POST /api/admin/cashiers
        |
        +-- authenticate
        |
        +-- authorize ADMIN
        |
        +-- validate
        |
        +-- create cashier
        |
        +-- audit
```

A cashier calling the endpoint must receive:

```http
403 Forbidden
```

The API must enforce this even if the cashier manually changes the frontend request.

---

# 17. Route Protection

Example frontend routes:

```text
/admin
/admin/products
/admin/inventory
/admin/cashiers
/admin/sales
/admin/reports
/admin/settings

/cashier
/cashier/pos
/cashier/sales
/cashier/profile
```

Route guards are required for UX.

But route guards are NOT the primary security mechanism.

The backend must independently authorize every protected API endpoint.

---

# 18. Security Requirements

## Mandatory

- HTTPS in production
- Secure password hashing
- Secure session/token management
- Server-side authorization
- RBAC
- Input validation
- Output encoding
- SQL injection protection
- XSS protection
- CSRF protection where applicable
- Rate limiting
- Secure cookies where applicable
- Audit logs
- Security headers
- Error handling without sensitive information
- Database transactions for financial operations

## Sensitive Data

Never log:

- Passwords
- Password hashes
- Authentication tokens
- Session cookies
- Secret keys
- Payment credentials

---

# 19. Audit Logging

Audit important actions:

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
PRODUCT_DEACTIVATED
STOCK_ADJUSTED
SALE_CREATED
SALE_CANCELLED
REFUND_CREATED
SETTINGS_CHANGED
```

Audit record:

```text
id
actor_user_id
action
entity_type
entity_id
timestamp
ip_address
user_agent
metadata
```

Audit logs should be append-only from the normal application UI.

---

# 20. Error Handling

Do not expose:

- Database errors
- Stack traces
- Internal service names
- SQL queries
- Authentication implementation details

User-facing example:

```text
Something went wrong. Please try again.
```

Developer logs may contain additional diagnostic information, but secrets must still be excluded.

---

# 21. UI/UX Requirements

Admin UI:

- Professional retail dashboard
- Responsive layout
- Desktop-first
- Clear navigation
- Confirmation dialogs for destructive operations
- Search/filter/pagination
- Loading states
- Empty states
- Error states
- Success notifications

Cashier UI:

- Fast
- Minimal clicks
- Large touch-friendly controls
- Keyboard-friendly
- Barcode scanner friendly
- Clear cart totals
- Clear payment flow

---

# 22. Non-Negotiable Security Rules

### Rule 1

A cashier cannot register another cashier.

### Rule 2

A cashier cannot become an Admin by modifying a request.

### Rule 3

A cashier cannot access Admin APIs.

### Rule 4

Frontend role information must never be trusted.

### Rule 5

All prices and totals must be recalculated server-side.

### Rule 6

Historical sales must not disappear when a product/cashier is deactivated.

### Rule 7

Financial operations must be atomic.

### Rule 8

Every sensitive administrative action must be auditable.

### Rule 9

Passwords must never be returned through API responses.

### Rule 10

Authorization must be checked on every protected backend endpoint.

---

# 23. Development Rules for Gemini

When generating code:

1. Follow this specification as the source of truth.
2. Do not weaken security for convenience.
3. Do not implement authorization only in the frontend.
4. Do not create public cashier-registration endpoints.
5. Do not expose passwords.
6. Do not trust client-provided roles.
7. Use validation on every API boundary.
8. Use transactions for sales and inventory changes.
9. Use soft deletion where historical records depend on entities.
10. Write tests for authorization failures.
11. Write tests for cashier privilege escalation attempts.
12. Keep Admin and Cashier UI clearly separated.
13. Prefer maintainable production code over quick prototypes.
14. Do not silently change database/business rules.
15. If a requirement conflicts with security, choose the secure implementation and document the reason.

---

# 24. Minimum Security Tests

Test:

```text
Admin can login
Cashier can login
Invalid credentials fail

Admin can create cashier
Cashier cannot create cashier
Cashier cannot access /admin
Cashier cannot call admin APIs
Cashier cannot change role
Cashier cannot create Admin
Inactive cashier cannot login
Unauthorized API request returns 401
Authenticated cashier accessing Admin API returns 403

Client-modified price is rejected/recalculated
Client-modified total is ignored/recalculated
Insufficient stock prevents sale
Failed sale rolls back stock changes
```

---

# 25. Definition of Done

The application is production-ready only when:

- Authentication works.
- RBAC works server-side.
- Admin can register cashiers.
- Cashier cannot register cashiers.
- Admin and Cashier dashboards are separated.
- Sales are transaction-safe.
- Inventory is transaction-safe.
- Audit logs work.
- Validation works.
- Rate limiting is configured.
- Sensitive information is protected.
- Authorization tests pass.
- Security tests pass.
- Error handling does not leak internals.
- Production HTTPS/security configuration is enabled.