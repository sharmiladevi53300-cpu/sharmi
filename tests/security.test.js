/**
 * Automated Security & RBAC Test Suite
 * Validates compliance against GEMINI.md security rules
 */

const http = require('http');
const app = require('../server/server');

let server;
const PORT = 3456;
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, data: json });
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('===========================================================');
  console.log('  🔒 READYMADE SHOP - SECURITY & RBAC VERIFICATION SUITE');
  console.log('===========================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  server = app.listen(PORT);

  try {
    // ---------------------------------------------------------
    // TEST 1: Admin Login
    // ---------------------------------------------------------
    const adminLoginRes = await makeRequest('/api/auth/login', 'POST', {
      username: 'admin',
      password: 'Admin@123456',
      requestedRole: 'ADMIN'
    });
    assert(adminLoginRes.status === 200, 'Admin can log in with valid credentials');
    assert(adminLoginRes.data.token && adminLoginRes.data.user.role === 'ADMIN', 'Admin receives JWT token with ROLE_ADMIN');
    assert(!adminLoginRes.data.user.passwordHash, 'Rule 9: Password hash is NEVER returned in response');
    const adminToken = adminLoginRes.data.token;

    // ---------------------------------------------------------
    // TEST 2: Cashier Login
    // ---------------------------------------------------------
    const cashierLoginRes = await makeRequest('/api/auth/login', 'POST', {
      username: 'cashier1',
      password: 'Cashier@123',
      requestedRole: 'CASHIER'
    });
    assert(cashierLoginRes.status === 200, 'Cashier can log in with credentials created by Admin');
    assert(cashierLoginRes.data.token && cashierLoginRes.data.user.role === 'CASHIER', 'Cashier receives JWT token with ROLE_CASHIER');
    const cashierToken = cashierLoginRes.data.token;

    // ---------------------------------------------------------
    // TEST 3: Invalid Credentials Fail
    // ---------------------------------------------------------
    const badLoginRes = await makeRequest('/api/auth/login', 'POST', {
      username: 'admin',
      password: 'WrongPassword@999'
    });
    assert(badLoginRes.status === 401, 'Invalid password fails with 401 Unauthorized');
    assert(badLoginRes.data.error === 'Invalid username or password.', 'Generic error message prevents username harvesting');

    // ---------------------------------------------------------
    // TEST 4: Unauthenticated Requests Blocked
    // ---------------------------------------------------------
    const unauthRes = await makeRequest('/api/admin/cashiers', 'GET');
    assert(unauthRes.status === 401, 'Unauthenticated access to protected API returns 401');

    // ---------------------------------------------------------
    // TEST 5: Cashier Cannot Access Admin Endpoints (Rule 3)
    // ---------------------------------------------------------
    const cashierAdminReq = await makeRequest('/api/admin/cashiers', 'GET', null, cashierToken);
    assert(cashierAdminReq.status === 403, 'Rule 3: Cashier calling GET /api/admin/cashiers is blocked with 403 Forbidden');

    const cashierAuditReq = await makeRequest('/api/admin/audit-logs', 'GET', null, cashierToken);
    assert(cashierAuditReq.status === 403, 'Rule 3: Cashier calling GET /api/admin/audit-logs is blocked with 403 Forbidden');

    const cashierExpenseReq = await makeRequest('/api/admin/expenses', 'GET', null, cashierToken);
    assert(cashierExpenseReq.status === 403, 'Rule 3: Cashier calling GET /api/admin/expenses is blocked with 403 Forbidden');

    // ---------------------------------------------------------
    // TEST 6: Cashier Cannot Register Another Cashier (Rule 1 & Rule 2)
    // ---------------------------------------------------------
    const cashierCreateCshReq = await makeRequest('/api/admin/cashiers', 'POST', {
      fullName: 'Illegal Cashier',
      employeeId: 'EMP999',
      username: 'illegal_cashier',
      password: 'Password@123'
    }, cashierToken);
    assert(cashierCreateCshReq.status === 403, 'Rule 1: Cashier cannot register cashiers (returns 403 Forbidden)');

    // ---------------------------------------------------------
    // TEST 7: Admin Can Successfully Register Cashier
    // ---------------------------------------------------------
    const empId = 'CSH' + Date.now().toString().slice(-4);
    const newCashierRes = await makeRequest('/api/admin/cashiers', 'POST', {
      fullName: 'Suresh Raina',
      employeeId: empId,
      username: 'suresh_' + Date.now(),
      mobile: '+91 9123456789',
      email: 'suresh@readymadeshop.com',
      password: 'SureshPassword@123'
    }, adminToken);
    assert(newCashierRes.status === 201, 'Admin can successfully register new cashier');
    assert(newCashierRes.data.role === 'CASHIER', 'Server forces immutable CASHIER role');
    const createdCashierId = newCashierRes.data.id;

    // ---------------------------------------------------------
    // TEST 8: Server Recalculates Prices & Disregards Client-Tampered Prices (Rule 5)
    // ---------------------------------------------------------
    const productsRes = await makeRequest('/api/products', 'GET', null, cashierToken);
    const firstProd = productsRes.data[0];
    const initialStock = firstProd.stockQuantity;

    // Tampered payload attempting to pay ₹1.00 for ₹899 shirt
    const salePayload = {
      items: [{
        productId: firstProd.id,
        quantity: 1,
        unitPrice: 1.00, // Tampered client price!
        total: 1.00
      }],
      discountPercent: 0,
      paymentMethod: 'CASH'
    };

    const saleRes = await makeRequest('/api/cashier/sales', 'POST', salePayload, cashierToken);
    assert(saleRes.status === 201, 'Sale completes successfully');
    assert(saleRes.data.subtotal === firstProd.sellingPrice, `Rule 5: Server recalculated subtotal to ₹${firstProd.sellingPrice} instead of client's ₹1.00`);
    assert(saleRes.data.totalAmount > firstProd.sellingPrice, 'Rule 5: Tax was recalculated and added server-side');

    // ---------------------------------------------------------
    // TEST 9: Stock Was Decremented Atomically (Rule 7 & 11)
    // ---------------------------------------------------------
    const productsAfterSale = await makeRequest('/api/products', 'GET', null, cashierToken);
    const prodAfter = productsAfterSale.data.find(p => p.id === firstProd.id);
    assert(prodAfter.stockQuantity === initialStock - 1, `Rule 7: Stock atomically decremented from ${initialStock} to ${prodAfter.stockQuantity}`);

    // ---------------------------------------------------------
    // TEST 10: Insufficient Stock Prevents Sale
    // ---------------------------------------------------------
    const outOfStockPayload = {
      items: [{
        productId: firstProd.id,
        quantity: 99999 // Excess quantity
      }],
      paymentMethod: 'CASH'
    };
    const excessSaleRes = await makeRequest('/api/cashier/sales', 'POST', outOfStockPayload, cashierToken);
    assert(excessSaleRes.status === 400, 'Sale with insufficient inventory rejected with 400 Bad Request');

    // ---------------------------------------------------------
    // TEST 11: Audit Logs Track System Events (Rule 8)
    // ---------------------------------------------------------
    const auditRes = await makeRequest('/api/admin/audit-logs', 'GET', null, adminToken);
    assert(auditRes.status === 200, 'Admin can view security audit logs');
    assert(Array.isArray(auditRes.data) && auditRes.data.length > 0, 'Audit logs contain recorded events');

    // ---------------------------------------------------------
    // TEST 12: Cashier Update (Admin Only)
    // ---------------------------------------------------------
    if (createdCashierId) {
      const updateRes = await makeRequest(`/api/admin/cashiers/${createdCashierId}`, 'PUT', {
        fullName: 'Suresh Raina Updated',
        mobile: '+91 9999999999',
        email: 'suresh_updated@readymadeshop.com'
      }, adminToken);
      assert(updateRes.status === 200, 'Admin can successfully update cashier details');
      assert(updateRes.data.cashier && updateRes.data.cashier.fullName === 'Suresh Raina Updated', 'Cashier name was updated in the response');
    }

    // ---------------------------------------------------------
    // TEST 13: Cashier Soft-Deletion & Listing Filtering
    // ---------------------------------------------------------
    if (createdCashierId) {
      const delCshRes = await makeRequest(`/api/admin/cashiers/${createdCashierId}`, 'DELETE', null, adminToken);
      assert(delCshRes.status === 200, 'Cashier soft-deleted successfully');

      const cashiersList = await makeRequest('/api/admin/cashiers', 'GET', null, adminToken);
      assert(!cashiersList.data.some(c => c.id === createdCashierId), 'Soft-deleted cashier is filtered out from listing');
    }

    // ---------------------------------------------------------
    // TEST 14: Category Management (Create & Delete)
    // ---------------------------------------------------------
    const catRes = await makeRequest('/api/admin/categories', 'POST', { name: 'Woolen Wear' }, adminToken);
    assert(catRes.status === 201, 'Admin can successfully create a new category');
    assert(catRes.data.name === 'Woolen Wear', 'Created category name returned correctly');

    const delCatRes = await makeRequest('/api/admin/categories/Woolen Wear', 'DELETE', null, adminToken);
    assert(delCatRes.status === 200, 'Admin can successfully delete an unused category');

    await makeRequest('/api/admin/categories', 'POST', { name: 'Heavy Jackets' }, adminToken);
    const prodRes = await makeRequest('/api/admin/products', 'POST', {
      name: 'Puffer Jacket',
      sku: 'JKT-PUF-01',
      barcode: '9900011',
      category: 'Heavy Jackets',
      size: 'XL',
      color: 'Black',
      purchasePrice: 1500,
      sellingPrice: 2999,
      stockQuantity: 5
    }, adminToken);
    assert(prodRes.status === 201, 'Product created with the new category');

    const errCatRes = await makeRequest('/api/admin/categories/Heavy Jackets', 'DELETE', null, adminToken);
    assert(errCatRes.status === 400, 'Attempting to delete a used category is blocked with 400 Bad Request');

    console.log('===========================================================');
    console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('===========================================================');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
