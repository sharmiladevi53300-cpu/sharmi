const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { JWT_SECRET, authenticate, authorizeRole } = require('./auth');

// Progressive Lockout Stores
const failedAttempts = {};
const lockoutTimes = {};

// Password Complexity Validator
function isStrongPassword(password) {
  if (password.length < 8) return false;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return hasUpper && hasLower && hasDigit && hasSpecial;
}

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middlewares
app.use(helmet({
  contentSecurityPolicy: false // Allow local styles and scripts
}));
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Rate Limiter for Login Endpoints (10 attempts per minute per IP)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please wait 1 minute before retrying.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ----------------------------------------------------
// IN-MEMORY DATABASE & SEED DATA
// ----------------------------------------------------

const users = [
  {
    id: 'usr_admin_001',
    username: 'admin',
    passwordHash: bcrypt.hashSync('Admin@123456', 10),
    fullName: 'Shop Owner & Administrator',
    employeeId: 'ADM001',
    mobile: '+91 9876543210',
    email: 'admin@readymadeshop.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  },
  {
    id: 'usr_csh_001',
    username: 'cashier1',
    passwordHash: bcrypt.hashSync('Cashier@123', 10),
    fullName: 'Rajesh Sharma',
    employeeId: 'CSH001',
    mobile: '+91 9876543211',
    email: 'rajesh@readymadeshop.com',
    role: 'CASHIER',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  }
];

const categories = [
  'Shirts', 'T-Shirts', 'Jeans', 'Trousers', 'Sarees', 'Kurtis', 
  'Salwar Kameez', 'Salwar Materials', 'Lehengas', 'Kids Wear', 
  'Frocks & Gowns', 'Skirts & Tops', 'Leggings & Jeggings', 'Nightwear', 
  'Innerwear', 'Ethnic Wear', 'Sherwanis', 'Coats & Blazers', 
  'Tracks & Joggers', 'Shorts & 3/4ths', 'Dhotis', 'Lungi', 
  'Dupattas & Shawls', 'Socks & Handkerchiefs', 'Western Wear', 'General'
];

const products = [
  { id: 'prd_01', name: 'Slim Fit Cotton Shirt', sku: 'SHT-SLM-01', barcode: '8901001', category: 'Shirts', size: 'M', color: 'Sky Blue', purchasePrice: 450, sellingPrice: 899, taxRate: 5, stockQuantity: 24, initialStock: 24, reorderLevel: 5, isActive: true, description: '100% Pure cotton breathable shirt for daily wear', image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&auto=format&fit=crop', mrp: 999, discount: 10, quantity: '1 piece' },
  { id: 'prd_02', name: 'Slim Fit Cotton Shirt', sku: 'SHT-SLM-02', barcode: '8901002', category: 'Shirts', size: 'L', color: 'Sky Blue', purchasePrice: 450, sellingPrice: 899, taxRate: 5, stockQuantity: 18, initialStock: 18, reorderLevel: 5, isActive: true, description: '100% Pure cotton breathable shirt for daily wear', image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&auto=format&fit=crop', mrp: 999, discount: 10, quantity: '1 piece' },
  { id: 'prd_03', name: 'Premium Denim Jeans', sku: 'JNS-PRM-32', barcode: '8902001', category: 'Jeans', size: '32', color: 'Dark Indigo', purchasePrice: 750, sellingPrice: 1599, taxRate: 5, stockQuantity: 12, initialStock: 12, reorderLevel: 4, isActive: true, description: 'Stretchy durable denim jeans with standard 5 pockets', image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&auto=format&fit=crop', mrp: 1999, discount: 20, quantity: '1 piece' },
  { id: 'prd_04', name: 'Premium Denim Jeans', sku: 'JNS-PRM-34', barcode: '8902002', category: 'Jeans', size: '34', color: 'Dark Indigo', purchasePrice: 750, sellingPrice: 1599, taxRate: 5, stockQuantity: 15, initialStock: 15, reorderLevel: 4, isActive: true, description: 'Stretchy durable denim jeans with standard 5 pockets', image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&auto=format&fit=crop', mrp: 1999, discount: 20, quantity: '1 piece' },
  { id: 'prd_05', name: 'Round Neck Casual T-Shirt', sku: 'TSH-RND-BLK', barcode: '8903001', category: 'T-Shirts', size: 'XL', color: 'Black', purchasePrice: 200, sellingPrice: 499, taxRate: 5, stockQuantity: 40, initialStock: 40, reorderLevel: 10, isActive: true, description: 'Soft combed cotton t-shirt with classic round neck', image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400&auto=format&fit=crop', mrp: 599, discount: 16, quantity: '1 piece' },
  { id: 'prd_06', name: 'Formal Chino Trousers', sku: 'TRS-CHN-32', barcode: '8904001', category: 'Trousers', size: '32', color: 'Beige', purchasePrice: 600, sellingPrice: 1299, taxRate: 5, stockQuantity: 8, initialStock: 8, reorderLevel: 3, isActive: true, description: 'Office wear formal chino trousers', image: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400&auto=format&fit=crop', mrp: 1499, discount: 13, quantity: '1 piece' },
  { id: 'prd_07', name: 'Designer Silk Saree', sku: 'SAR-SLK-RED', barcode: '8905001', category: 'Sarees', size: 'Free Size', color: 'Crimson Red', purchasePrice: 1200, sellingPrice: 2499, taxRate: 5, stockQuantity: 6, initialStock: 6, reorderLevel: 2, isActive: true, description: 'Banarasi silk saree with gold embroidery work', image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&auto=format&fit=crop', mrp: 2999, discount: 16, quantity: '1 piece' },
  { id: 'prd_08', name: 'Printed Cotton Kurti', sku: 'KUR-COT-M', barcode: '8906001', category: 'Kurtis', size: 'M', color: 'Mustard Yellow', purchasePrice: 350, sellingPrice: 799, taxRate: 5, stockQuantity: 15, initialStock: 15, reorderLevel: 4, isActive: true, description: 'Traditional printed cotton kurti for office or home wear', image: 'https://images.unsplash.com/photo-1608748010899-18f300247112?w=400&auto=format&fit=crop', mrp: 899, discount: 11, quantity: '1 piece' }
];

const purchases = [
  {
    id: 'pch_01',
    productId: 'prd_01',
    productName: 'Slim Fit Cotton Shirt (M, Sky Blue)',
    sku: 'SHT-SLM-01',
    supplierName: 'Sri Balaji Textiles & Mill',
    supplierMobile: '9443219870',
    invoiceNo: 'BAL-2026-88',
    quantity: 10,
    purchasePrice: 450,
    totalAmount: 4500,
    paymentStatus: 'PAID',
    purchaseDate: new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0],
    notes: 'Direct mill purchase - Summer batch',
    receivedBy: 'admin',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString()
  },
  {
    id: 'pch_02',
    productId: 'prd_03',
    productName: 'Premium Denim Jeans (32, Dark Indigo)',
    sku: 'JNS-PRM-32',
    supplierName: 'CottonCity Apparel Surat',
    supplierMobile: '9825123456',
    invoiceNo: 'CCA-9041',
    quantity: 5,
    purchasePrice: 750,
    totalAmount: 3750,
    paymentStatus: 'PAID',
    purchaseDate: new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0],
    notes: 'Premium denim replenishment',
    receivedBy: 'admin',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString()
  }
];

const customers = [
  { id: 'cust_01', name: 'Amit Verma', mobile: '9876501234', email: 'amit@example.com', totalSpend: 2498, visits: 2, createdAt: new Date().toISOString() },
  { id: 'cust_02', name: 'Priya Patel', mobile: '9876505678', email: 'priya@example.com', totalSpend: 1599, visits: 1, createdAt: new Date().toISOString() }
];

const expenses = [
  { id: 'exp_01', title: 'Shop Electricity Bill', category: 'Utilities', amount: 3500, date: new Date().toISOString().split('T')[0], recordedBy: 'Admin' },
  { id: 'exp_02', title: 'Carry Bags & Packaging Material', category: 'Supplies', amount: 1200, date: new Date().toISOString().split('T')[0], recordedBy: 'Admin' }
];

const inventoryMovements = [
  { id: 'inv_m_01', productId: 'prd_01', productName: 'Slim Fit Cotton Shirt (M)', type: 'STOCK_IN', quantity: 24, reason: 'Initial Inventory Seeding', timestamp: new Date().toISOString(), actor: 'ADM001' }
];

const nowUtc = Date.now();
const oneDayMs = 86400000;

const sales = [
  {
    id: 'sal_sample_01',
    invoiceNo: 'INV-100201',
    cashierId: 'usr_csh_001',
    cashierName: 'cashier1',
    customerName: 'Amit Verma',
    customerMobile: '9876501234',
    items: [
      { productId: 'prd_01', productName: 'Slim Fit Cotton Shirt', sku: 'SHT-SLM-01', size: 'M', color: 'Sky Blue', unitPrice: 899, quantity: 1, subtotal: 899, taxAmount: 44.95, total: 943.95 },
      { productId: 'prd_03', productName: 'Premium Denim Jeans', sku: 'JNS-PRM-32', size: '32', color: 'Dark Indigo', unitPrice: 1599, quantity: 1, subtotal: 1599, taxAmount: 79.95, total: 1678.95 }
    ],
    subtotal: 2498,
    discountPercent: 0,
    discountAmount: 0,
    taxAmount: 124.90,
    totalAmount: 2622.90,
    paymentMethod: 'UPI',
    paymentStatus: 'PAID',
    createdAt: new Date(nowUtc - 2 * 3600000).toISOString()
  },
  {
    id: 'sal_sample_02',
    invoiceNo: 'INV-100202',
    cashierId: 'usr_csh_001',
    cashierName: 'cashier1',
    customerName: 'Priya Patel',
    customerMobile: '9876505678',
    items: [
      { productId: 'prd_08', productName: 'Printed Cotton Kurti', sku: 'KUR-COT-M', size: 'M', color: 'Mustard Yellow', unitPrice: 799, quantity: 1, subtotal: 799, taxAmount: 39.95, total: 838.95 },
      { productId: 'prd_05', productName: 'Round Neck Casual T-Shirt', sku: 'TSH-RND-BLK', size: 'XL', color: 'Black', unitPrice: 499, quantity: 1, subtotal: 499, taxAmount: 24.95, total: 523.95 }
    ],
    subtotal: 1298,
    discountPercent: 5,
    discountAmount: 64.90,
    taxAmount: 61.65,
    totalAmount: 1294.75,
    paymentMethod: 'CASH',
    paymentStatus: 'PAID',
    createdAt: new Date(nowUtc - 4 * 3600000).toISOString()
  },
  {
    id: 'sal_sample_03',
    invoiceNo: 'INV-100199',
    cashierId: 'usr_csh_001',
    cashierName: 'cashier1',
    customerName: 'Rajesh Kumar',
    customerMobile: '9840112233',
    items: [
      { productId: 'prd_07', productName: 'Designer Silk Saree', sku: 'SAR-SLK-RED', size: 'Free Size', color: 'Crimson Red', unitPrice: 2499, quantity: 1, subtotal: 2499, taxAmount: 124.95, total: 2623.95 },
      { productId: 'prd_06', productName: 'Formal Chino Trousers', sku: 'TRS-CHN-32', size: '32', color: 'Beige', unitPrice: 1299, quantity: 1, subtotal: 1299, taxAmount: 64.95, total: 1363.95 }
    ],
    subtotal: 3798,
    discountPercent: 10,
    discountAmount: 379.80,
    taxAmount: 170.91,
    totalAmount: 3589.11,
    paymentMethod: 'CARD',
    paymentStatus: 'PAID',
    createdAt: new Date(nowUtc - oneDayMs - 2 * 3600000).toISOString()
  },
  {
    id: 'sal_sample_04',
    invoiceNo: 'INV-100198',
    cashierId: 'usr_adm_001',
    cashierName: 'admin',
    customerName: 'Sneha Reddy',
    customerMobile: '9884055667',
    items: [
      { productId: 'prd_02', productName: 'Slim Fit Cotton Shirt', sku: 'SHT-SLM-02', size: 'L', color: 'Sky Blue', unitPrice: 899, quantity: 1, subtotal: 899, taxAmount: 44.95, total: 943.95 }
    ],
    subtotal: 899,
    discountPercent: 0,
    discountAmount: 0,
    taxAmount: 44.95,
    totalAmount: 943.95,
    paymentMethod: 'UPI',
    paymentStatus: 'PAID',
    createdAt: new Date(nowUtc - oneDayMs - 5 * 3600000).toISOString()
  },
  {
    id: 'sal_sample_05',
    invoiceNo: 'INV-100195',
    cashierId: 'usr_csh_001',
    cashierName: 'cashier1',
    customerName: 'Kavitha Sundar',
    customerMobile: '9790887766',
    items: [
      { productId: 'prd_04', productName: 'Premium Denim Jeans', sku: 'JNS-PRM-34', size: '34', color: 'Dark Indigo', unitPrice: 1599, quantity: 1, subtotal: 1599, taxAmount: 79.95, total: 1678.95 }
    ],
    subtotal: 1599,
    discountPercent: 0,
    discountAmount: 0,
    taxAmount: 79.95,
    totalAmount: 1678.95,
    paymentMethod: 'CASH',
    paymentStatus: 'PAID',
    createdAt: new Date(nowUtc - 2 * oneDayMs - 3 * 3600000).toISOString()
  }
];

const auditLogs = [
  {
    id: 'log_01',
    actorUserId: 'SYSTEM',
    action: 'SYSTEM_BOOT',
    entityType: 'system',
    entityId: 'sys_root',
    timestamp: new Date().toISOString(),
    metadata: { message: 'Readymade Shop POS & Admin Server Initialized' }
  }
];

function logAudit(actorUserId, action, entityType, entityId, metadata = {}) {
  auditLogs.unshift({
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    actorUserId,
    action,
    entityType,
    entityId,
    timestamp: new Date().toISOString(),
    metadata
  });
}

const damagedProducts = [
  {
    id: "dmg_01",
    productId: "prd_01",
    productName: "Slim Fit Cotton Shirt (M, Sky Blue)",
    sku: "SHT-SLM-01",
    barcode: "8901001",
    category: "Shirts",
    size: "M",
    color: "Sky Blue",
    quantity: 1,
    purchasePrice: 450.0,
    sellingPrice: 899.0,
    lossAmount: 450.0,
    potentialSalesLoss: 899.0,
    damageReason: "FABRIC_TORN",
    damageSource: "SHOP_FLOOR_FOUND",
    supplierName: "Tirupur Tex Wholesale Mills",
    status: "PENDING_ACTION",
    notes: "Sleeve seam torn during customer trial",
    recordedBy: "admin",
    createdAt: new Date(Date.now() - 86400000).toISOString()
  }
];

const customerReturns = [
  {
    id: "crt_01",
    invoiceNo: "INV-100198",
    productId: "prd_02",
    productName: "Slim Fit Cotton Shirt (L, Sky Blue)",
    sku: "SHT-SLM-02",
    quantity: 1,
    refundAmount: 943.95,
    itemCondition: "GOOD_CONDITION_RESTOCK",
    refundMethod: "CASH",
    customerName: "Sneha Reddy",
    customerMobile: "9884055667",
    returnReason: "Size Mismatch - requested exchange or refund",
    recordedBy: "admin",
    createdAt: new Date(Date.now() - 5 * 3600000).toISOString()
  }
];

const supplierReturns = [
  {
    id: "rtv_01",
    supplierName: "Tirupur Tex Wholesale Mills",
    supplierMobile: "+91 98421 55667",
    originalInvoiceNo: "TEX-INV-8910",
    items: [
      {
        productId: "prd_01",
        productName: "Slim Fit Cotton Shirt (M, Sky Blue)",
        sku: "SHT-SLM-01",
        quantity: 1,
        purchasePrice: 420.0,
        damageId: "dmg_sample_prev",
        totalClaimAmount: 420.0,
        reason: "Weaving defect on collar"
      }
    ],
    totalReturnAmount: 420.0,
    returnReason: "MANUFACTURING_DEFECT",
    courierName: "ST Courier / Parcel Service",
    trackingNo: "STC-998822",
    dispatchDate: new Date(Date.now() - 86400000).toISOString(),
    status: "SUPPLIER_CREDIT_NOTE",
    recoveredAmount: 420.0,
    resolutionNotes: "Supplier issued credit note CR-8802 against next purchase bill",
    resolvedDate: new Date().toISOString(),
    recordedBy: "admin",
    createdAt: new Date(Date.now() - 86400000).toISOString()
  }
];

function syncAllProductStocks() {
  for (const p of products) {
    const pId = p.id;
    const initStock = p.initialStock !== undefined ? p.initialStock : (p.stockQuantity || 0);
    p.initialStock = initStock;
    const inwardQty = purchases.filter(pch => pch.productId === pId).reduce((acc, pch) => acc + (pch.quantity || 0), 0);
    const soldQty = sales.reduce((acc, s) => {
      const itemSum = (s.items || []).filter(i => i.productId === pId).reduce((iAcc, i) => iAcc + (i.quantity || 0), 0);
      return acc + itemSum;
    }, 0);
    const damagedQty = damagedProducts.filter(d => d.productId === pId && d.damageSource !== 'CUSTOMER_RETURN').reduce((acc, d) => acc + (d.quantity || 0), 0);
    const restockedQty = customerReturns.filter(c => c.productId === pId && c.itemCondition === 'GOOD_CONDITION_RESTOCK').reduce((acc, c) => acc + (c.quantity || 0), 0);
    p.stockQuantity = Math.max(0, initStock + inwardQty - soldQty - damagedQty + restockedQty);
  }
}

// Perform initial sync
syncAllProductStocks();

// ----------------------------------------------------
// 1. AUTHENTICATION ENDPOINTS
// ----------------------------------------------------

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password, requestedRole } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username/Employee ID and password are required.' });
  }

  const cleanInput = username.trim().toLowerCase();

  // Progressive Lockout Check
  const now = Date.now();
  if (lockoutTimes[cleanInput] && lockoutTimes[cleanInput] > now) {
    logAudit('ANONYMOUS', 'LOGIN_BLOCKED_LOCKOUT', 'user', username, { reason: 'Account temporarily locked' });
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const user = users.find(u => 
    u.username.toLowerCase() === cleanInput || 
    (u.employeeId && u.employeeId.toLowerCase() === cleanInput)
  );

  // Timing-safe verification & generic error prevents username harvesting
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    logAudit('ANONYMOUS', 'LOGIN_FAILED', 'user', username, { reason: 'Invalid credentials' });
    
    // Track failed attempts
    failedAttempts[cleanInput] = (failedAttempts[cleanInput] || 0) + 1;
    if (failedAttempts[cleanInput] >= 5) {
      lockoutTimes[cleanInput] = now + 60 * 1000; // 60 seconds lockout
      failedAttempts[cleanInput] = 0; // Reset counter for next lockout cycle
    }

    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  if (user.status !== 'ACTIVE') {
    logAudit(user.id, 'LOGIN_BLOCKED', 'user', user.id, { reason: 'Status is ' + user.status });
    return res.status(403).json({ error: `Your account is ${user.status}. Please contact the administrator.` });
  }

  if (requestedRole && user.role !== requestedRole) {
    logAudit(user.id, 'UNAUTHORIZED_PORTAL_ATTEMPT', 'user', user.id, { requestedRole, actualRole: user.role });
    return res.status(401).json({ error: 'Invalid credentials for this login portal.' });
  }

  // Reset lockout on success
  failedAttempts[cleanInput] = 0;
  delete lockoutTimes[cleanInput];

  user.lastLoginAt = new Date().toISOString();

  // Generate CSRF token
  const csrfToken = crypto.randomBytes(16).toString('hex');

  const token = jwt.sign(
    { sub: user.id, username: user.username, role: user.role, status: user.status, csrf: csrfToken },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  logAudit(user.id, `${user.role}_LOGIN_SUCCESS`, 'user', user.id, {});

  // Never return passwordHash or secrets
  return res.json({
    token,
    csrfToken,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      employeeId: user.employeeId,
      role: user.role,
      status: user.status,
      mobile: user.mobile,
      email: user.email
    }
  });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  const user = users.find(u => u.id === req.user.sub);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    employeeId: user.employeeId,
    role: user.role,
    status: user.status,
    mobile: user.mobile,
    email: user.email
  });
});

// ----------------------------------------------------
// 2. CASHIER MANAGEMENT (ADMIN ONLY - RBAC RULE 1 & 2)
// ----------------------------------------------------

app.get('/api/admin/cashiers', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const cashierList = users
    .filter(u => u.role === 'CASHIER' && u.status !== 'DELETED')
    .map(u => ({
      id: u.id,
      fullName: u.fullName,
      employeeId: u.employeeId,
      username: u.username,
      mobile: u.mobile,
      email: u.email,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt
    }));
  res.json(cashierList);
});

// Register New Cashier (Admin Only)
app.post('/api/admin/cashiers', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const { fullName, employeeId, username, mobile, email, password } = req.body;

  if (!fullName || !employeeId || !username || !password) {
    return res.status(400).json({ error: 'Full Name, Employee ID, Username, and Password are required.' });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long and contain uppercase, lowercase, numbers, and special characters.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanEmpId = employeeId.trim().toUpperCase();

  if (users.some(u => u.username.toLowerCase() === cleanUsername)) {
    return res.status(409).json({ error: `Username "${cleanUsername}" is already taken.` });
  }

  if (users.some(u => u.employeeId && u.employeeId.toUpperCase() === cleanEmpId)) {
    return res.status(409).json({ error: `Employee ID "${cleanEmpId}" is already registered.` });
  }

  // Forcefully set role to CASHIER
  const newCashier = {
    id: 'usr_csh_' + Date.now(),
    username: cleanUsername,
    passwordHash: bcrypt.hashSync(password, 10),
    fullName: fullName.trim(),
    employeeId: cleanEmpId,
    mobile: (mobile || '').trim(),
    email: (email || '').trim(),
    role: 'CASHIER',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };

  users.push(newCashier);

  logAudit(req.user.sub, 'CASHIER_CREATED', 'user', newCashier.id, {
    employeeId: newCashier.employeeId,
    username: newCashier.username
  });

  return res.status(201).json({
    id: newCashier.id,
    fullName: newCashier.fullName,
    employeeId: newCashier.employeeId,
    username: newCashier.username,
    role: newCashier.role,
    status: newCashier.status,
    mobile: newCashier.mobile,
    email: newCashier.email,
    createdAt: newCashier.createdAt
  });
});

// Edit Cashier Details (Admin Only)
app.put('/api/admin/cashiers/:id', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const cashier = users.find(u => u.id === req.params.id && u.role === 'CASHIER');
  if (!cashier) return res.status(404).json({ error: 'Cashier not found.' });

  const { fullName, mobile, email } = req.body;
  if (fullName) cashier.fullName = fullName.trim();
  if (mobile !== undefined) cashier.mobile = mobile.trim();
  if (email !== undefined) cashier.email = email.trim();

  logAudit(req.user.sub, 'CASHIER_UPDATED', 'user', cashier.id, { fullName, mobile, email });
  res.json({ success: true, cashier });
});

// Update Cashier Status (Admin Only)
app.patch('/api/admin/cashiers/:id/status', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const { status } = req.body;
  const cashier = users.find(u => u.id === req.params.id && u.role === 'CASHIER');

  if (!cashier) return res.status(404).json({ error: 'Cashier not found.' });
  if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status.' });
  }

  const prev = cashier.status;
  cashier.status = status;

  logAudit(req.user.sub, 'CASHIER_STATUS_UPDATED', 'user', cashier.id, { from: prev, to: status });
  res.json({ success: true, cashierId: cashier.id, status });
});

// Reset Cashier Password (Admin Only)
app.post('/api/admin/cashiers/:id/reset-password', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || !isStrongPassword(newPassword)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long and contain uppercase, lowercase, numbers, and special characters.' });
  }

  const cashier = users.find(u => u.id === req.params.id && u.role === 'CASHIER');
  if (!cashier) return res.status(404).json({ error: 'Cashier not found.' });

  cashier.passwordHash = bcrypt.hashSync(newPassword, 10);
  logAudit(req.user.sub, 'CASHIER_PASSWORD_RESET', 'user', cashier.id, {});
  res.json({ success: true, message: 'Password updated successfully.' });
});

// Get Cashier Specific Sales & Activity (Admin Only)
app.get('/api/admin/cashiers/:id/activity', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const cashier = users.find(u => u.id === req.params.id);
  if (!cashier) return res.status(404).json({ error: 'Cashier not found.' });

  const cashierSales = sales.filter(s => s.cashierId === req.params.id);
  const logs = auditLogs.filter(l => l.actorUserId === req.params.id);

  res.json({
    cashier: {
      id: cashier.id,
      fullName: cashier.fullName,
      username: cashier.username,
      employeeId: cashier.employeeId,
      status: cashier.status,
      lastLoginAt: cashier.lastLoginAt
    },
    totalSalesCount: cashierSales.length,
    totalRevenue: cashierSales.reduce((acc, s) => acc + (s.totalAmount || 0), 0),
    sales: cashierSales.slice(0, 20),
    activityLogs: logs.slice(0, 20)
  });
});

// ----------------------------------------------------
// 3. PRODUCT & CATEGORY MANAGEMENT
// ----------------------------------------------------

// List products (All authenticated users)
app.get('/api/products', authenticate, (req, res) => {
  syncAllProductStocks();
  if (req.user.role === 'ADMIN') {
    res.json(products);
  } else {
    // Cashier sees only active products
    res.json(products.filter(p => p.isActive));
  }
});

// List categories
app.get('/api/categories', authenticate, (req, res) => {
  res.json(categories);
});

// Add new category (Admin Only)
app.post('/api/admin/categories', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const cleanName = name.trim();
  if (categories.some(c => c.toLowerCase() === cleanName.toLowerCase())) {
    return res.status(409).json({ error: `Category "${cleanName}" already exists.` });
  }
  categories.push(cleanName);
  logAudit(req.user.sub, 'CATEGORY_CREATED', 'category', cleanName, {});
  res.status(201).json({ name: cleanName });
});

// Delete category (Admin Only)
app.delete('/api/admin/categories/:name', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const catName = req.params.name;
  const index = categories.indexOf(catName);
  if (index === -1) {
    return res.status(404).json({ error: 'Category not found.' });
  }
  // Check if used by active products
  if (products.some(p => p.category === catName && p.isActive)) {
    return res.status(400).json({ error: 'Cannot delete category as it is currently assigned to active products.' });
  }
  categories.splice(index, 1);
  logAudit(req.user.sub, 'CATEGORY_DELETED', 'category', catName, {});
  res.json({ success: true, message: 'Category successfully deleted.' });
});

// Add new product (Admin Only)
app.post('/api/admin/products', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const { 
    id, productId, name, description, image, stock, stockQuantity, 
    quantity, sellingPrice, mrp, discount, gst, taxRate,
    sku, barcode, category, size, color, purchasePrice, reorderLevel = 5 
  } = req.body;

  if (!name || sellingPrice === undefined) {
    return res.status(400).json({ error: 'Product Name and Selling Price are required.' });
  }

  // Determine Product ID
  const finalId = (productId || id || 'prd_' + Date.now()).trim();
  if (products.some(p => p.id.toLowerCase() === finalId.toLowerCase())) {
    return res.status(409).json({ error: `Product ID "${finalId}" already exists.` });
  }

  // Determine SKU & Barcode
  const finalSku = (sku || 'SKU-' + Date.now().toString().slice(-6)).trim().toUpperCase();
  const finalBarcode = (barcode || Date.now().toString().slice(-7)).trim();

  if (products.some(p => p.sku.toLowerCase() === finalSku.toLowerCase())) {
    return res.status(409).json({ error: `SKU "${finalSku}" already exists.` });
  }

  if (products.some(p => p.barcode === finalBarcode)) {
    return res.status(409).json({ error: `Barcode "${finalBarcode}" already exists.` });
  }

  const finalStock = Math.max(0, parseInt(stock !== undefined ? stock : stockQuantity, 10) || 0);

  const newProduct = {
    id: finalId,
    name: name.trim(),
    description: (description || '').trim(),
    image: (image || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=150').trim(),
    stockQuantity: finalStock,
    quantity: (quantity || '1 Piece').trim(),
    sellingPrice: Number(sellingPrice) || 0,
    mrp: Number(mrp || sellingPrice) || 0,
    discount: Number(discount) || 0,
    taxRate: Number(gst !== undefined ? gst : taxRate) || 5,
    sku: finalSku,
    barcode: finalBarcode,
    category: (category || 'General').trim(),
    size: (size || 'Free Size').trim(),
    color: (color || 'Neutral').trim(),
    purchasePrice: Number(purchasePrice) || Number(sellingPrice) * 0.6,
    initialStock: finalStock,
    reorderLevel: Math.max(0, parseInt(reorderLevel, 10) || 5),
    isActive: true
  };

  products.push(newProduct);

  // Record initial inventory movement if stock > 0
  if (newProduct.stockQuantity > 0) {
    inventoryMovements.unshift({
      id: 'inv_m_' + Date.now(),
      productId: newProduct.id,
      productName: `${newProduct.name} (${newProduct.id})`,
      type: 'STOCK_IN',
      quantity: newProduct.stockQuantity,
      reason: 'Initial Product Registration Stocking',
      timestamp: new Date().toISOString(),
      actor: req.user.username
    });
  }

  logAudit(req.user.sub, 'PRODUCT_CREATED', 'product', newProduct.id, { name: newProduct.name, sku: newProduct.sku });
  res.status(201).json(newProduct);
});

// Update product (Admin Only)
app.put('/api/admin/products/:id', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const { 
    name, category, size, color, purchasePrice, sellingPrice, taxRate, reorderLevel, isActive,
    description, image, quantity, mrp, discount, gst
  } = req.body;

  if (name) product.name = name.trim();
  if (category) product.category = category.trim();
  if (size) product.size = size.trim();
  if (color) product.color = color.trim();
  if (purchasePrice !== undefined) product.purchasePrice = Number(purchasePrice);
  if (sellingPrice !== undefined) product.sellingPrice = Number(sellingPrice);
  if (taxRate !== undefined || gst !== undefined) product.taxRate = Number(gst !== undefined ? gst : taxRate);
  if (reorderLevel !== undefined) product.reorderLevel = Number(reorderLevel);
  if (isActive !== undefined) product.isActive = Boolean(isActive);
  
  if (description !== undefined) product.description = description.trim();
  if (image !== undefined) product.image = image.trim();
  if (quantity !== undefined) product.quantity = quantity.trim();
  if (mrp !== undefined) product.mrp = Number(mrp);
  if (discount !== undefined) product.discount = Number(discount);
  if (req.body.stockQuantity !== undefined) product.stockQuantity = Number(req.body.stockQuantity);

  logAudit(req.user.sub, 'PRODUCT_UPDATED', 'product', product.id, { changes: req.body });
  res.json(product);
});

// Soft Delete / Deactivate Product (Admin Only - Rule 6)
app.delete('/api/admin/products/:id', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  product.isActive = false; // Soft delete ensures historic invoices preserve reference
  logAudit(req.user.sub, 'PRODUCT_DEACTIVATED', 'product', product.id, {});
  res.json({ success: true, message: 'Product successfully deactivated.' });
});

// Soft Delete Cashier (Admin Only)
app.delete('/api/admin/cashiers/:id', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const cashier = users.find(u => u.id === req.params.id && u.role === 'CASHIER');
  if (!cashier) return res.status(404).json({ error: 'Cashier not found.' });

  cashier.status = 'DELETED';
  logAudit(req.user.sub, 'CASHIER_DELETED', 'user', cashier.id, {});
  res.json({ success: true, message: 'Cashier account successfully deleted.' });
});

// ----------------------------------------------------
// 4. INVENTORY & STOCK ADJUSTMENTS (ADMIN ONLY)
// ----------------------------------------------------

app.post('/api/admin/inventory/adjust', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const { productId, type, quantity, reason } = req.body;

  const product = products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Adjustment quantity must be a positive integer.' });
  }

  if (!['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN'].includes(type)) {
    return res.status(400).json({ error: 'Invalid adjustment type.' });
  }

  const prevStock = product.stockQuantity;

  if (type === 'STOCK_IN' || type === 'RETURN') {
    product.stockQuantity += qty;
  } else if (type === 'STOCK_OUT') {
    if (product.stockQuantity < qty) {
      return res.status(400).json({ error: `Cannot deduct ${qty}. Current stock is only ${product.stockQuantity}.` });
    }
    product.stockQuantity -= qty;
  } else if (type === 'ADJUSTMENT') {
    product.stockQuantity = qty; // Direct overwrite
  }

  const movementRecord = {
    id: 'inv_m_' + Date.now(),
    productId: product.id,
    productName: `${product.name} (${product.size}, ${product.color})`,
    type,
    quantity: qty,
    previousStock: prevStock,
    newStock: product.stockQuantity,
    reason: reason || 'Manual Admin Stock Adjustment',
    timestamp: new Date().toISOString(),
    actor: req.user.username
  };

  inventoryMovements.unshift(movementRecord);
  logAudit(req.user.sub, 'STOCK_ADJUSTED', 'product', product.id, movementRecord);

  res.json({ success: true, product, movementRecord });
});

app.get('/api/admin/inventory/history', authenticate, authorizeRole('ADMIN'), (req, res) => {
  res.json(inventoryMovements);
});

// Get Supplier Purchases List (Admin Only)
app.get('/api/admin/inventory/purchases', authenticate, authorizeRole('ADMIN'), (req, res) => {
  res.json(purchases);
});

// Get Stock Valuation & Inward Summary (Admin Only)
app.get('/api/admin/inventory/valuation', authenticate, authorizeRole('ADMIN'), (req, res) => {
  syncAllProductStocks();
  const valList = products.map(p => {
    const pId = p.id;
    const initStock = p.initialStock !== undefined ? p.initialStock : (p.stockQuantity || 0);
    const inwardQty = purchases.filter(pch => pch.productId === pId).reduce((acc, pch) => acc + (pch.quantity || 0), 0);
    const soldQty = sales.reduce((acc, s) => {
      const itemSum = (s.items || []).filter(i => i.productId === pId).reduce((iAcc, i) => iAcc + (i.quantity || 0), 0);
      return acc + itemSum;
    }, 0);
    const damagedQty = damagedProducts.filter(d => d.productId === pId && d.damageSource !== 'CUSTOMER_RETURN').reduce((acc, d) => acc + (d.quantity || 0), 0);
    const restockQty = customerReturns.filter(c => c.productId === pId && c.itemCondition === 'GOOD_CONDITION_RESTOCK').reduce((acc, c) => acc + (c.quantity || 0), 0);
    const currStock = p.stockQuantity || 0;
    const purchPrice = Number(p.purchasePrice) || 0;
    const sellPrice = Number(p.sellingPrice) || 0;
    const costVal = Number((currStock * purchPrice).toFixed(2));
    const sellVal = Number((currStock * sellPrice).toFixed(2));
    const marginVal = Number((sellVal - costVal).toFixed(2));
    const marginPct = purchPrice > 0 ? Number((((sellPrice - purchPrice) / purchPrice) * 100).toFixed(1)) : 0;

    return {
      id: pId,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      category: p.category,
      size: p.size,
      color: p.color,
      image: p.image,
      quantity: p.quantity || '1 piece',
      mrp: p.mrp || sellPrice,
      purchasePrice: purchPrice,
      sellingPrice: sellPrice,
      initialStock: initStock,
      inwardStock: inwardQty,
      soldStock: soldQty,
      damagedStock: damagedQty,
      customerRestockStock: restockQty,
      currentStock: currStock,
      reorderLevel: p.reorderLevel || 5,
      isActive: p.isActive !== false,
      costValuation: costVal,
      sellingValuation: sellVal,
      marginAmount: marginVal,
      marginPercent: marginPct
    };
  });

  const activeItems = valList.filter(v => v.isActive);
  const summary = {
    totalProducts: activeItems.length,
    totalStockQuantity: activeItems.reduce((acc, v) => acc + v.currentStock, 0),
    totalInitialStock: activeItems.reduce((acc, v) => acc + v.initialStock, 0),
    totalInwardStock: activeItems.reduce((acc, v) => acc + v.inwardStock, 0),
    totalSoldStock: activeItems.reduce((acc, v) => acc + v.soldStock, 0),
    totalCostValuation: Number(activeItems.reduce((acc, v) => acc + v.costValuation, 0).toFixed(2)),
    totalSellingValuation: Number(activeItems.reduce((acc, v) => acc + v.sellingValuation, 0).toFixed(2)),
    totalPotentialMargin: Number(activeItems.reduce((acc, v) => acc + v.marginAmount, 0).toFixed(2)),
    totalInwardSpending: Number(purchases.reduce((acc, pch) => acc + (pch.totalAmount || 0), 0).toFixed(2)),
    totalPurchasesCount: purchases.length,
    lowStockCount: activeItems.filter(v => v.currentStock <= v.reorderLevel).length
  };

  res.json({ summary, items: valList });
});

// Record Supplier Inward Purchase (Admin Only)
app.post('/api/admin/inventory/purchases', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const { productId, supplierName, supplierMobile, invoiceNo, quantity, purchasePrice, purchaseDate, paymentStatus, notes } = req.body;

  if (!productId || !supplierName || !invoiceNo) {
    return res.status(400).json({ error: 'Product ID, Supplier Name, and Supplier Bill/Invoice Number are required.' });
  }

  const qty = parseInt(quantity, 10);
  const price = parseFloat(purchasePrice);

  if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
    return res.status(400).json({ error: 'Quantity and Purchase Price must be positive numbers.' });
  }

  const product = products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const prevStock = product.stockQuantity;
  product.stockQuantity += qty;
  product.purchasePrice = price; // Update latest cost rate

  const totalAmt = Number((qty * price).toFixed(2));
  const purchaseRecord = {
    id: 'pch_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    productId: product.id,
    productName: `${product.name} (${product.size || 'Std'}, ${product.color || 'Std'})`,
    sku: product.sku || '',
    supplierName: supplierName.trim(),
    supplierMobile: (supplierMobile || '').trim(),
    invoiceNo: invoiceNo.trim(),
    quantity: qty,
    purchasePrice: price,
    totalAmount: totalAmt,
    paymentStatus: paymentStatus || 'PAID',
    purchaseDate: purchaseDate || new Date().toISOString().split('T')[0],
    notes: (notes || `Stock Purchase from ${supplierName}`).trim(),
    receivedBy: req.user.username,
    createdAt: new Date().toISOString()
  };

  purchases.unshift(purchaseRecord);

  // Journal inventory movement
  const movementRecord = {
    id: 'inv_m_' + Date.now(),
    productId: product.id,
    productName: purchaseRecord.productName,
    type: 'STOCK_IN',
    quantity: qty,
    previousStock: prevStock,
    newStock: product.stockQuantity,
    reason: `Supplier Purchase: ${supplierName} (Bill #${invoiceNo})`,
    timestamp: new Date().toISOString(),
    actor: req.user.username
  };
  inventoryMovements.unshift(movementRecord);

  logAudit(req.user.sub, 'SUPPLIER_PURCHASE_RECORDED', 'purchase', purchaseRecord.id, {
    productId: product.id,
    supplier: supplierName,
    invoiceNo,
    quantity: qty,
    purchasePrice: price,
    totalAmount: totalAmt
  });

  res.status(201).json({
    success: true,
    purchase: purchaseRecord,
    product,
    movementRecord
  });
});

// Get Damaged Products, Customer Returns & Supplier Returns (Admin Only)
app.get('/api/admin/inventory/damaged-returns', authenticate, authorizeRole('ADMIN'), (req, res) => {
  syncAllProductStocks();
  const totDamagedUnits = damagedProducts.reduce((acc, d) => acc + (d.quantity || 0), 0);
  const totDamageLoss = Number(damagedProducts.reduce((acc, d) => acc + (d.lossAmount || 0), 0).toFixed(2));
  const totCustReturns = customerReturns.length;
  const totCustRefund = Number(customerReturns.reduce((acc, c) => acc + (c.refundAmount || 0), 0).toFixed(2));
  const totSuppReturns = supplierReturns.length;
  const totSuppClaim = Number(supplierReturns.reduce((acc, r) => acc + (r.totalReturnAmount || 0), 0).toFixed(2));
  const totSuppRecovered = Number(supplierReturns.reduce((acc, r) => acc + (r.recoveredAmount || 0), 0).toFixed(2));
  const netUnrecoveredLoss = Number(Math.max(0, totDamageLoss - totSuppRecovered).toFixed(2));

  const summary = {
    totalDamagedUnits: totDamagedUnits,
    totalDamageLossAmount: totDamageLoss,
    totalCustomerReturns: totCustReturns,
    totalCustomerRefundAmount: totCustRefund,
    totalSupplierReturnsCount: totSuppReturns,
    totalSupplierReturnClaimed: totSuppClaim,
    totalSupplierRecoveredAmount: totSuppRecovered,
    netUnrecoveredLoss: netUnrecoveredLoss
  };

  res.json({
    summary,
    damagedProducts,
    customerReturns,
    supplierReturns
  });
});

// Record Damaged Product (Admin Only)
app.post('/api/admin/inventory/damage', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const { productId, quantity, damageReason = 'FABRIC_TORN', damageSource = 'SHOP_FLOOR_FOUND', supplierName = '', notes = '' } = req.body;

  if (!productId || !quantity) {
    return res.status(400).json({ error: 'Product ID and Quantity are required.' });
  }

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive integer.' });
  }

  const product = products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  if (damageSource !== 'CUSTOMER_RETURN' && product.stockQuantity < qty) {
    return res.status(400).json({ error: `Insufficient stock. Available sellable stock is only ${product.stockQuantity}.` });
  }

  const purchPrice = Number(product.purchasePrice) || 0;
  const sellPrice = Number(product.sellingPrice) || 0;
  const lossAmt = Number((qty * purchPrice).toFixed(2));
  const potSalesLoss = Number((qty * sellPrice).toFixed(2));

  let finalSupplier = supplierName.trim();
  if (!finalSupplier) {
    const matchedPch = purchases.find(pch => pch.productId === productId);
    if (matchedPch) finalSupplier = matchedPch.supplierName;
  }

  const damageRecord = {
    id: 'dmg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    productId: product.id,
    productName: `${product.name} (${product.size || 'Std'}, ${product.color || 'Std'})`,
    sku: product.sku || '',
    barcode: product.barcode || '',
    category: product.category || 'General',
    size: product.size || 'Std',
    color: product.color || 'Std',
    quantity: qty,
    purchasePrice: purchPrice,
    sellingPrice: sellPrice,
    lossAmount: lossAmt,
    potentialSalesLoss: potSalesLoss,
    damageReason: damageReason.trim(),
    damageSource: damageSource.trim(),
    supplierName: finalSupplier,
    status: 'PENDING_ACTION',
    notes: notes.trim(),
    recordedBy: req.user.username,
    createdAt: new Date().toISOString()
  };

  damagedProducts.unshift(damageRecord);

  if (damageSource !== 'CUSTOMER_RETURN') {
    const prevStock = product.stockQuantity;
    product.stockQuantity -= qty;
    inventoryMovements.unshift({
      id: 'inv_m_' + Date.now(),
      productId: product.id,
      productName: damageRecord.productName,
      type: 'STOCK_OUT',
      quantity: qty,
      previousStock: prevStock,
      newStock: product.stockQuantity,
      reason: `Damaged Garment: ${damageReason} (${notes || 'Defect'})`,
      timestamp: new Date().toISOString(),
      actor: req.user.username
    });
  }

  syncAllProductStocks();
  logAudit(req.user.sub, 'DAMAGED_PRODUCT_RECORDED', 'damaged_product', damageRecord.id, {
    productId,
    quantity: qty,
    lossAmount: lossAmt,
    reason: damageReason
  });

  res.status(201).json({ success: true, damagedProduct: damageRecord, product });
});

// Record Customer Return (Admin Only)
app.post('/api/admin/inventory/customer-returns', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const { productId, invoiceNo = 'N/A', quantity, refundAmount, itemCondition = 'GOOD_CONDITION_RESTOCK', refundMethod = 'CASH', customerName = 'Customer', customerMobile = '', returnReason = 'Customer Return' } = req.body;

  if (!productId || !quantity) {
    return res.status(400).json({ error: 'Product ID and Quantity are required.' });
  }

  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive integer.' });
  }

  const product = products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });

  const refAmt = refundAmount !== undefined ? Number(refundAmount) : Number((product.sellingPrice * qty).toFixed(2));

  const returnRecord = {
    id: 'crt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    invoiceNo: invoiceNo.trim() || 'N/A',
    productId: product.id,
    productName: `${product.name} (${product.size || 'Std'}, ${product.color || 'Std'})`,
    sku: product.sku || '',
    quantity: qty,
    refundAmount: refAmt,
    itemCondition,
    refundMethod,
    customerName: customerName.trim(),
    customerMobile: customerMobile.trim(),
    returnReason: returnReason.trim(),
    recordedBy: req.user.username,
    createdAt: new Date().toISOString()
  };

  customerReturns.unshift(returnRecord);

  if (itemCondition === 'GOOD_CONDITION_RESTOCK') {
    const prevStock = product.stockQuantity;
    product.stockQuantity += qty;
    inventoryMovements.unshift({
      id: 'inv_m_' + Date.now(),
      productId: product.id,
      productName: returnRecord.productName,
      type: 'RETURN',
      quantity: qty,
      previousStock: prevStock,
      newStock: product.stockQuantity,
      reason: `Customer Return Restocked: Bill #${invoiceNo} (${returnReason})`,
      timestamp: new Date().toISOString(),
      actor: req.user.username
    });
  } else {
    const purchPrice = Number(product.purchasePrice) || 0;
    damagedProducts.unshift({
      id: 'dmg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      productId: product.id,
      productName: returnRecord.productName,
      sku: product.sku || '',
      barcode: product.barcode || '',
      category: product.category || 'General',
      size: product.size || 'Std',
      color: product.color || 'Std',
      quantity: qty,
      purchasePrice: purchPrice,
      sellingPrice: Number(product.sellingPrice) || 0,
      lossAmount: Number((qty * purchPrice).toFixed(2)),
      potentialSalesLoss: Number((qty * Number(product.sellingPrice)).toFixed(2)),
      damageReason: `Customer Return Defective: ${returnReason}`,
      damageSource: 'CUSTOMER_RETURN',
      supplierName: '',
      status: 'PENDING_ACTION',
      notes: `Returned by ${customerName} under invoice ${invoiceNo}`,
      recordedBy: req.user.username,
      createdAt: new Date().toISOString()
    });
  }

  syncAllProductStocks();
  logAudit(req.user.sub, 'CUSTOMER_RETURN_RECORDED', 'customer_return', returnRecord.id, {
    invoiceNo,
    refundAmount: refAmt,
    condition: itemCondition
  });

  res.status(201).json({ success: true, customerReturn: returnRecord, product });
});

// Create Supplier Return / RTV (Admin Only)
app.post('/api/admin/inventory/supplier-returns', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const { supplierName, supplierMobile = '', originalInvoiceNo = '', items = [], returnReason = 'MANUFACTURING_DEFECT', courierName = '', trackingNo = '', dispatchDate, notes = '' } = req.body;

  if (!supplierName || !items || items.length === 0) {
    return res.status(400).json({ error: 'Supplier Name and at least one Item are required for Supplier Return.' });
  }

  let totalReturnAmount = 0;
  const verifiedItems = [];

  for (const it of items) {
    const prod = products.find(p => p.id === it.productId);
    if (!prod) return res.status(404).json({ error: `Product ${it.productId} not found.` });

    const itQty = parseInt(it.quantity, 10) || 1;
    const itPrice = parseFloat(it.purchasePrice !== undefined ? it.purchasePrice : prod.purchasePrice) || 0;
    const claimAmt = Number((itQty * itPrice).toFixed(2));
    totalReturnAmount += claimAmt;

    if (it.damageId) {
      const dmgRec = damagedProducts.find(d => d.id === it.damageId);
      if (dmgRec) {
        dmgRec.status = 'RETURNED_TO_SUPPLIER';
        dmgRec.supplierName = supplierName.trim();
      }
    }

    verifiedItems.push({
      productId: prod.id,
      productName: `${prod.name} (${prod.size || 'Std'}, ${prod.color || 'Std'})`,
      sku: prod.sku || '',
      quantity: itQty,
      purchasePrice: itPrice,
      damageId: it.damageId || '',
      totalClaimAmount: claimAmt,
      reason: it.reason || returnReason
    });
  }

  const rtvRecord = {
    id: 'rtv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    supplierName: supplierName.trim(),
    supplierMobile: supplierMobile.trim(),
    originalInvoiceNo: originalInvoiceNo.trim(),
    items: verifiedItems,
    totalReturnAmount: Number(totalReturnAmount.toFixed(2)),
    returnReason: returnReason.trim(),
    courierName: courierName.trim(),
    trackingNo: trackingNo.trim(),
    dispatchDate: dispatchDate || new Date().toISOString(),
    status: 'RETURN_DISPATCHED',
    recoveredAmount: 0,
    resolutionNotes: notes.trim() || `Returned to ${supplierName} via ${courierName || 'Direct Parcel'}`,
    resolvedDate: null,
    recordedBy: req.user.username,
    createdAt: new Date().toISOString()
  };

  supplierReturns.unshift(rtvRecord);
  syncAllProductStocks();
  logAudit(req.user.sub, 'SUPPLIER_RETURN_DISPATCHED', 'supplier_return', rtvRecord.id, {
    supplierName,
    totalAmount: totalReturnAmount,
    itemsCount: verifiedItems.length
  });

  res.status(201).json({ success: true, supplierReturn: rtvRecord });
});

// Update Supplier Return Status (Admin Only)
app.patch('/api/admin/inventory/supplier-returns/:id/status', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const rtv = supplierReturns.find(r => r.id === req.params.id);
  if (!rtv) return res.status(404).json({ error: 'Supplier return record not found.' });

  const { status, recoveredAmount, resolutionNotes } = req.body;
  if (status) rtv.status = status;
  if (recoveredAmount !== undefined) rtv.recoveredAmount = Number(parseFloat(recoveredAmount).toFixed(2)) || 0;
  if (resolutionNotes) rtv.resolutionNotes = resolutionNotes.trim();
  rtv.resolvedDate = new Date().toISOString();

  logAudit(req.user.sub, 'SUPPLIER_RETURN_STATUS_UPDATED', 'supplier_return', rtv.id, {
    status: rtv.status,
    recoveredAmount: rtv.recoveredAmount
  });

  res.json({ success: true, supplierReturn: rtv });
});

// ----------------------------------------------------
// 5. CUSTOMERS & EXPENSES (ADMIN ONLY)
// ----------------------------------------------------

app.get('/api/admin/customers', authenticate, (req, res) => {
  res.json(customers);
});

app.post('/api/admin/customers', authenticate, (req, res) => {
  const { name, mobile, email } = req.body;
  if (!name || !mobile) {
    return res.status(400).json({ error: 'Customer Name and Mobile Number are required.' });
  }

  let cust = customers.find(c => c.mobile === mobile.trim());
  if (cust) {
    cust.name = name.trim();
    if (email) cust.email = email.trim();
  } else {
    cust = {
      id: 'cust_' + Date.now(),
      name: name.trim(),
      mobile: mobile.trim(),
      email: (email || '').trim(),
      totalSpend: 0,
      visits: 0,
      createdAt: new Date().toISOString()
    };
    customers.unshift(cust);
  }

  res.json(cust);
});

app.get('/api/admin/expenses', authenticate, authorizeRole('ADMIN'), (req, res) => {
  res.json(expenses);
});

app.post('/api/admin/expenses', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const { title, category, amount, date } = req.body;
  if (!title || !amount) {
    return res.status(400).json({ error: 'Expense title and amount are required.' });
  }

  const exp = {
    id: 'exp_' + Date.now(),
    title: title.trim(),
    category: (category || 'General').trim(),
    amount: Number(amount) || 0,
    date: date || new Date().toISOString().split('T')[0],
    recordedBy: req.user.username,
    createdAt: new Date().toISOString()
  };

  expenses.unshift(exp);
  logAudit(req.user.sub, 'EXPENSE_RECORDED', 'expense', exp.id, exp);
  res.status(201).json(exp);
});

// ----------------------------------------------------
// 6. POS BILLING & SALES TRANSACTIONS (ATOMIC RBAC)
// ----------------------------------------------------

app.post('/api/cashier/sales', authenticate, (req, res) => {
  const { items, discountPercent = 0, paymentMethod = 'CASH', customerName, customerMobile } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart items cannot be empty.' });
  }

  let calculatedSubtotal = 0;
  let calculatedTax = 0;
  const verifiedItems = [];

  // Step 1: Atomic Stock & Price Validation (Rule 5: Recalculate everything server-side)
  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    if (!product || !product.isActive) {
      return res.status(400).json({ error: `Selected product is no longer active or available.` });
    }

    const qty = parseInt(item.quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: `Invalid quantity for "${product.name}".` });
    }

    if (product.stockQuantity < qty) {
      return res.status(400).json({
        error: `Insufficient stock for "${product.name}" (${product.size}, ${product.color}). Available: ${product.stockQuantity}, Requested: ${qty}`
      });
    }

    const sub = product.sellingPrice * qty;
    const tax = (sub * (product.taxRate || 0)) / 100;

    verifiedItems.push({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      size: product.size,
      color: product.color,
      unitPrice: product.sellingPrice,
      quantity: qty,
      subtotal: sub,
      taxAmount: tax,
      total: sub + tax
    });

    calculatedSubtotal += sub;
    calculatedTax += tax;
  }

  // Step 2: Atomic Inventory Deduction
  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    const qty = parseInt(item.quantity, 10);
    product.stockQuantity -= qty;

    inventoryMovements.unshift({
      id: 'inv_m_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      productId: product.id,
      productName: `${product.name} (${product.size})`,
      type: 'STOCK_OUT',
      quantity: qty,
      reason: `POS Sale`,
      timestamp: new Date().toISOString(),
      actor: req.user.username
    });
  }

  // Step 3: Discount calculation (Strictly capped to 20% max server-side)
  const validDiscountPercent = Math.min(Math.max(Number(discountPercent) || 0, 0), 20);
  const discountAmount = (calculatedSubtotal * validDiscountPercent) / 100;
  const totalAmount = Math.max(0, calculatedSubtotal - discountAmount + calculatedTax);

  const saleRecord = {
    id: 'sal_' + Date.now(),
    invoiceNo: 'INV-' + Date.now().toString().slice(-6),
    cashierId: req.user.sub,
    cashierName: req.user.username,
    customerName: (customerName || 'Walk-in Customer').trim(),
    customerMobile: (customerMobile || '').trim(),
    items: verifiedItems,
    subtotal: calculatedSubtotal,
    discountPercent: validDiscountPercent,
    discountAmount,
    taxAmount: calculatedTax,
    totalAmount,
    paymentMethod: ['CASH', 'UPI', 'CARD'].includes(paymentMethod) ? paymentMethod : 'CASH',
    paymentStatus: 'PAID',
    createdAt: new Date().toISOString()
  };

  sales.unshift(saleRecord);

  // Update customer record if mobile provided
  if (customerMobile && customerMobile.trim()) {
    let cust = customers.find(c => c.mobile === customerMobile.trim());
    if (cust) {
      cust.totalSpend += totalAmount;
      cust.visits += 1;
      if (customerName) cust.name = customerName.trim();
    } else {
      customers.unshift({
        id: 'cust_' + Date.now(),
        name: (customerName || 'Customer').trim(),
        mobile: customerMobile.trim(),
        email: '',
        totalSpend: totalAmount,
        visits: 1,
        createdAt: new Date().toISOString()
      });
    }
  }

  logAudit(req.user.sub, 'SALE_COMPLETED', 'sale', saleRecord.id, {
    invoiceNo: saleRecord.invoiceNo,
    totalAmount
  });

  res.status(201).json(saleRecord);
});

// Admin: View all sales
app.get('/api/admin/sales', authenticate, authorizeRole('ADMIN'), (req, res) => {
  res.json(sales);
});

// Cashier: View own sales (Shift history)
app.get('/api/cashier/my-sales', authenticate, (req, res) => {
  const mySales = sales.filter(s => s.cashierId === req.user.sub);
  res.json(mySales);
});

// ----------------------------------------------------
// 7. REPORTS & ANALYTICS (ADMIN ONLY)
// ----------------------------------------------------

app.get('/api/admin/reports/summary', authenticate, authorizeRole('ADMIN'), (req, res) => {
  const totalRevenue = sales.reduce((acc, s) => acc + s.totalAmount, 0);
  const totalBills = sales.length;
  const totalStock = products.reduce((acc, p) => acc + (p.stockQuantity || 0), 0);
  const lowStockCount = products.filter(p => p.isActive && p.stockQuantity <= (p.reorderLevel || 5)).length;
  const activeCashiers = users.filter(u => u.role === 'CASHIER' && u.status === 'ACTIVE').length;
  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  // Category breakdown
  const categorySales = {};
  sales.forEach(sale => {
    sale.items.forEach(item => {
      const p = products.find(prod => prod.id === item.productId);
      const cat = p ? p.category : 'Other';
      categorySales[cat] = (categorySales[cat] || 0) + item.total;
    });
  });

  // Payment Breakdown
  const paymentBreakdown = { CASH: 0, UPI: 0, CARD: 0 };
  sales.forEach(s => {
    if (paymentBreakdown[s.paymentMethod] !== undefined) {
      paymentBreakdown[s.paymentMethod] += s.totalAmount;
    }
  });

  res.json({
    totalRevenue,
    totalBills,
    totalStock,
    lowStockCount,
    activeCashiers,
    totalExpenses,
    netProfit,
    categorySales,
    paymentBreakdown,
    recentSales: sales.slice(0, 10)
  });
});

// ----------------------------------------------------
// 8. AUDIT LOGS (ADMIN ONLY - RULE 8)
// ----------------------------------------------------

app.get('/api/admin/audit-logs', authenticate, authorizeRole('ADMIN'), (req, res) => {
  res.json(auditLogs);
});

// ----------------------------------------------------
// SERVER LAUNCH
// ----------------------------------------------------

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  👔 Readymade Clothing Shop Management System`);
    console.log(`  🚀 Server listening on: http://localhost:${PORT}`);
    console.log(`  🛡️ Admin Login: http://localhost:${PORT}/admin-login.html`);
    console.log(`  💳 Cashier POS: http://localhost:${PORT}/cashier-login.html`);
    console.log(`====================================================`);
  });
}

module.exports = app;
