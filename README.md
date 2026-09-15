# Readymade Shop Management System (Admin & Cashier Application)

A production-grade retail point-of-sale and administrative platform engineered specifically for garment and readymade clothing shops, enforcing strict Role-Based Access Control (RBAC) in full compliance with [`GEMINI.md`](./GEMINI.md) and [`prod_specification.md`](./prod_specification.md).

---

## 🚀 Key Features

### 1. Dedicated Admin Portal (`/admin-login.html` & `/admin/index.html`)
- **Credentials**: Username `admin` / Password `Admin@123456`
- **Cashier Account Provisioning (Admin-Only)**:
  - Register new cashiers with Full Name, Employee ID, Mobile, Email, Username, and Password.
  - Server forcefully sets role to `CASHIER` (prevents privilege escalation).
  - Status management (`ACTIVE`, `INACTIVE`, `SUSPENDED`).
  - Cashier password resets.
- **Inventory & Garments**: Real-time view of clothing items, SKUs, barcodes, sizes (`S`, `M`, `L`, `XL`, `32`, `34`), and colors.
- **Sales Analytics & Reports**: Live store turnover, total bills, and transaction breakdown.
- **Append-Only Audit Logs**: Real-time security event tracking.

### 2. Dedicated Cashier POS Counter (`/cashier-login.html` & `/cashier/index.html`)
- **Fast Product Lookup & Barcode Scanning**: Search by barcode number or SKU.
- **Live Cart Operations**: Dynamic item quantity controls and garment variant display.
- **Server-Recalculated Checkout**: Subtotal, 5% GST/tax, and capped discount calculations.
- **Payment Methods**: Cash, UPI/QR, and Card.
- **Printable Invoices**: Thermal receipt generation with exchange policies.
- **Shift Tracker**: View current shift sales and collections.

---

## 🔒 Security Architecture

1. **Only Authenticated Admins Can Create Cashiers**:
   - Cashiers cannot register other cashiers.
   - Cashiers cannot elevate their own role or access Admin APIs.
2. **Brute Force & Rate Limit Protection**:
   - Progressive lockout on repeated failed login attempts.
   - Generic error messages (`Invalid username or password`) prevent username harvesting.
3. **Data Integrity & Atomic Transactions**:
   - Stock deduction and invoice generation execute inside atomic transactions.
   - Client-side manipulated prices or totals are completely ignored and recalculated.

---

## 📂 Project Structure

```text
readymadeshop/
├── GEMINI.md                    # Core system security guidelines
├── prod_specification.md        # Technical product & API specifications
├── package.json                 # Node.js configuration & dependencies
├── server/
│   ├── server.js                # Express API backend with strict RBAC
│   └── auth.js                  # JWT token & authorization middleware
└── public/
    ├── index.html               # Main portal navigation hub
    ├── admin-login.html         # Secure Admin login
    ├── cashier-login.html       # Fast Cashier POS login
    ├── admin/
    │   └── index.html           # Admin Dashboard & Cashier Management
    ├── cashier/
    │   └── index.html           # Cashier POS counter & billing
    ├── css/
    │   └── style.css            # Responsive retail UI theme
    └── js/
        ├── security.js          # Client-side crypto & route guards
        └── app.js               # Central store & atomic transaction engine
```

---

## 🖥️ How to Run & View

### Option A: Run with Python 3 Server (Zero Dependencies)
```bash
py app.py
# or: python server/server.py
```
Open `http://localhost:3000` in your browser.

### Option B: Run Automated Security Test Suite
```bash
py tests/security_test.py
```

### Option C: Run with Node.js Server
```bash
npm install
npm start
# Run Node test: npm test
```

### Option D: Open Directly in Web Browser
Open `public/index.html` directly in any modern web browser (Edge, Chrome, Firefox). The system includes client-side cryptographic hashing (WebCrypto SHA-256), session tokens, and full fallback simulation.
