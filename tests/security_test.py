"""
Automated Security & RBAC Test Suite (Python 3)
Validates compliance against GEMINI.md security rules and specifications.
"""

import os
import sys
import time
import json
import urllib.request
import urllib.error
import threading

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from server.server import ThreadedHTTPServer, ReadymadeShopHandler

TEST_PORT = 4567
BASE_URL = f"http://127.0.0.1:{TEST_PORT}"

token_csrf_map = {}

def make_request(path: str, method: str = 'GET', body: dict = None, token: str = None) -> tuple[int, dict | str]:
    url = f"{BASE_URL}{path}"
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f"Bearer {token}"
        if token in token_csrf_map:
            headers['X-CSRF-Token'] = token_csrf_map[token]

    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            try:
                res_json = json.loads(res_body)
                if isinstance(res_json, dict) and 'token' in res_json and 'csrfToken' in res_json:
                    token_csrf_map[res_json['token']] = res_json['csrfToken']
                return response.status, res_json
            except Exception:
                return response.status, res_body
    except urllib.error.HTTPError as e:
        res_body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(res_body)
        except Exception:
            return e.code, res_body

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

def run_tests():
    print("=================================================================")
    print("  [SECURITY] READYMADE SHOP - COMPREHENSIVE RBAC SUITE")
    print("=================================================================")

    server = ThreadedHTTPServer(('127.0.0.1', TEST_PORT), ReadymadeShopHandler)
    server_thread = threading.Thread(target=server.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.5)

    passed = 0
    failed = 0

    def check(condition: bool, message: str):
        nonlocal passed, failed
        if condition:
            print(f"  [PASS] {message}")
            passed += 1
        else:
            print(f"  [FAIL] {message}")
            failed += 1

    try:
        # TEST 1: Admin Login
        status, data = make_request('/api/auth/login', 'POST', {
            'username': 'admin',
            'password': 'Admin@123456',
            'requestedRole': 'ADMIN'
        })
        check(status == 200, "Admin can log in with valid credentials")
        check(isinstance(data, dict) and data.get('token') and data.get('user', {}).get('role') == 'ADMIN',
              "Admin receives secure HMAC token with ROLE_ADMIN")
        check('passwordHash' not in data.get('user', {}), "Rule 9: Password hash is NEVER returned in response")
        admin_token = data.get('token')

        # TEST 2: Cashier Login
        status, data = make_request('/api/auth/login', 'POST', {
            'username': 'cashier1',
            'password': 'Cashier@123',
            'requestedRole': 'CASHIER'
        })
        check(status == 200, "Cashier can log in with credentials created by Admin")
        check(isinstance(data, dict) and data.get('token') and data.get('user', {}).get('role') == 'CASHIER',
              "Cashier receives secure HMAC token with ROLE_CASHIER")
        cashier_token = data.get('token')

        # TEST 3: Invalid Credentials Fail with Generic Message
        status, data = make_request('/api/auth/login', 'POST', {
            'username': 'admin',
            'password': 'WrongPassword@999'
        })
        check(status == 401, "Invalid password fails with 401 Unauthorized")
        check(isinstance(data, dict) and data.get('error') == 'Invalid username or password.',
              "Generic error prevents username harvesting")

        # TEST 4: Unauthenticated Requests Blocked
        status, _ = make_request('/api/admin/cashiers', 'GET')
        check(status == 401, "Unauthenticated access to protected API returns 401")

        # TEST 5: Cashier Blocked from Admin APIs (Rule 3)
        status, _ = make_request('/api/admin/cashiers', 'GET', token=cashier_token)
        check(status == 403, "Rule 3: Cashier calling GET /api/admin/cashiers is blocked with 403 Forbidden")

        status, _ = make_request('/api/admin/audit-logs', 'GET', token=cashier_token)
        check(status == 403, "Rule 3: Cashier calling GET /api/admin/audit-logs is blocked with 403 Forbidden")

        status, _ = make_request('/api/admin/expenses', 'GET', token=cashier_token)
        check(status == 403, "Rule 3: Cashier calling GET /api/admin/expenses is blocked with 403 Forbidden")

        status, _ = make_request('/api/admin/reports/summary', 'GET', token=cashier_token)
        check(status == 403, "Rule 3: Cashier calling GET /api/admin/reports/summary is blocked with 403 Forbidden")

        # TEST 6: Cashier Cannot Register Another Cashier (Rule 1 & Rule 2)
        status, _ = make_request('/api/admin/cashiers', 'POST', {
            'fullName': 'Illegal Cashier',
            'employeeId': 'EMP999',
            'username': 'illegal_cashier',
            'password': 'Password@123'
        }, token=cashier_token)
        check(status == 403, "Rule 1: Cashier cannot register cashiers (returns 403 Forbidden)")

        # TEST 7: Admin Can Successfully Register Cashier
        new_emp_id = f"CSH{int(time.time()) % 10000}"
        status, data = make_request('/api/admin/cashiers', 'POST', {
            'fullName': 'Suresh Raina',
            'employeeId': new_emp_id,
            'username': f"suresh_{int(time.time())}",
            'mobile': '+91 9123456789',
            'email': 'suresh@readymadeshop.com',
            'password': 'SureshPassword@123'
        }, token=admin_token)
        check(status == 201, "Admin can successfully register new cashier")
        check(isinstance(data, dict) and data.get('role') == 'CASHIER', "Server forces immutable CASHIER role")
        created_cashier_id = data.get('id') if isinstance(data, dict) else None

        # TEST 8: Server Recalculates Prices & Disregards Client-Tampered Prices (Rule 5)
        status, prods = make_request('/api/products', 'GET', token=cashier_token)
        first_prod = prods[0]
        initial_stock = first_prod['stockQuantity']

        # Tampered payload attempting to pay ₹1.00 for ₹899 garment
        tampered_payload = {
            'items': [{
                'productId': first_prod['id'],
                'quantity': 1,
                'unitPrice': 1.00,  # Client tampering attempt
                'total': 1.00
            }],
            'discountPercent': 0,
            'paymentMethod': 'CASH',
            'customerName': 'Test Customer',
            'customerMobile': '9998887776'
        }
        status, sale_res = make_request('/api/cashier/sales', 'POST', tampered_payload, token=cashier_token)
        check(status == 201, "POS sale completes successfully")
        check(sale_res.get('subtotal') == first_prod['sellingPrice'],
              f"Rule 5: Server recalculated subtotal to ₹{first_prod['sellingPrice']} instead of client's ₹1.00")
        check(sale_res.get('totalAmount') > first_prod['sellingPrice'],
              "Rule 5: Tax (5%) was recalculated and added server-side")

        # TEST 9: Stock Was Decremented Atomically (Rule 7 & 11)
        status, prods_after = make_request('/api/products', 'GET', token=cashier_token)
        prod_after = next(p for p in prods_after if p['id'] == first_prod['id'])
        check(prod_after['stockQuantity'] == initial_stock - 1,
              f"Rule 7: Stock atomically decremented from {initial_stock} to {prod_after['stockQuantity']}")

        # TEST 10: Insufficient Stock Prevents Sale
        excess_payload = {
            'items': [{
                'productId': first_prod['id'],
                'quantity': 99999
            }],
            'paymentMethod': 'CASH'
        }
        status, _ = make_request('/api/cashier/sales', 'POST', excess_payload, token=cashier_token)
        check(status == 400, "Sale with insufficient inventory rejected with 400 Bad Request")

        # TEST 11: Audit Logs Track System Events (Rule 8)
        status, logs = make_request('/api/admin/audit-logs', 'GET', token=admin_token)
        check(status == 200, "Admin can view security audit logs")
        check(isinstance(logs, list) and len(logs) > 0, "Audit logs contain recorded system and transaction events")

        # TEST 12: Product Soft Deletion Preserves Invoices (Rule 6)
        status, del_res = make_request(f"/api/admin/products/{first_prod['id']}", 'DELETE', token=admin_token)
        check(status == 200, "Product soft-deactivated successfully")
        status, cashier_prods = make_request('/api/products', 'GET', token=cashier_token)
        check(not any(p['id'] == first_prod['id'] for p in cashier_prods),
              "Deactivated product is hidden from active Cashier catalog")

        # TEST 13: Cashier Update (Admin Only)
        if created_cashier_id:
            status, update_res = make_request(f"/api/admin/cashiers/{created_cashier_id}", 'PUT', {
                'fullName': 'Suresh Raina Updated',
                'mobile': '+91 9999999999',
                'email': 'suresh_updated@readymadeshop.com'
            }, token=admin_token)
            check(status == 200, "Admin can successfully update cashier details")
            check(isinstance(update_res, dict) and update_res.get('cashier', {}).get('fullName') == 'Suresh Raina Updated', "Cashier name was updated in the response")

        # TEST 14: Cashier Soft-Deletion & Listing Filtering
        if created_cashier_id:
            # Delete cashier
            status, del_csh_res = make_request(f"/api/admin/cashiers/{created_cashier_id}", 'DELETE', token=admin_token)
            check(status == 200, "Cashier soft-deleted successfully")
            
            # Verify cashier is not in listing anymore
            status, cashiers_list = make_request('/api/admin/cashiers', 'GET', token=admin_token)
            check(not any(c['id'] == created_cashier_id for c in cashiers_list), "Soft-deleted cashier is filtered out from listing")

        # TEST 15: Category Management (Create & Delete)
        # Create category
        status, cat_res = make_request('/api/admin/categories', 'POST', {'name': 'Woolen Wear'}, token=admin_token)
        check(status == 201, "Admin can successfully create a new category")
        check(isinstance(cat_res, dict) and cat_res.get('name') == 'Woolen Wear', "Created category name returned correctly")

        # Delete category (should succeed since no product belongs to it)
        status, del_cat_res = make_request('/api/admin/categories/Woolen%20Wear', 'DELETE', token=admin_token)
        check(status == 200, "Admin can successfully delete an unused category")

        # Create category that is used
        status, _ = make_request('/api/admin/categories', 'POST', {'name': 'Heavy Jackets'}, token=admin_token)
        # Let's add a product with category = 'Heavy Jackets'
        status, prod_res = make_request('/api/admin/products', 'POST', {
            'name': 'Puffer Jacket',
            'sku': 'JKT-PUF-01',
            'barcode': '9900011',
            'category': 'Heavy Jackets',
            'size': 'XL',
            'color': 'Black',
            'purchasePrice': 1500,
            'sellingPrice': 2999,
            'stockQuantity': 5
        }, token=admin_token)
        check(status == 201, "Product created with the new category")

        # Attempt to delete used category - should fail with 400
        status, err_cat_res = make_request('/api/admin/categories/Heavy%20Jackets', 'DELETE', token=admin_token)
        check(status == 400, "Attempting to delete a used category is blocked with 400 Bad Request")

        # TEST 16: Password Complexity Check
        # Attempt to register cashier with weak password
        status, pass_res = make_request('/api/admin/cashiers', 'POST', {
            'fullName': 'Weak Password Cashier',
            'employeeId': 'CSHWEAK',
            'username': 'weak_cashier',
            'mobile': '+91 9999999991',
            'email': 'weak@readymadeshop.com',
            'password': 'weak'
        }, token=admin_token)
        check(status == 400, "Weak password during cashier registration rejected with 400 Bad Request")

        # TEST 17: CSRF Protection Validation
        saved_csrf = token_csrf_map.get(admin_token)
        if admin_token in token_csrf_map:
            del token_csrf_map[admin_token]
        
        status, _ = make_request('/api/admin/categories', 'POST', {'name': 'Woolen Wear 2'}, token=admin_token)
        check(status == 403, "Request without CSRF header rejected with 403 Forbidden")
        
        token_csrf_map[admin_token] = "tampered_csrf_token_value_999"
        status, _ = make_request('/api/admin/categories', 'POST', {'name': 'Woolen Wear 2'}, token=admin_token)
        check(status == 403, "Request with invalid/tampered CSRF header rejected with 403 Forbidden")
        
        if saved_csrf:
            token_csrf_map[admin_token] = saved_csrf

        # TEST 18: Progressive Account Lockout
        # Perform 5 consecutive failed login attempts on existing user 'cashier1'
        for i in range(5):
            make_request('/api/auth/login', 'POST', {
                'username': 'cashier1',
                'password': 'incorrect_password_attempt'
            })
        
        # 6th attempt with CORRECT credentials should fail due to lockout
        status, lockout_res = make_request('/api/auth/login', 'POST', {
            'username': 'cashier1',
            'password': 'Cashier@123',
            'requestedRole': 'CASHIER'
        })
        check(status == 401, "6th login attempt with correct password fails due to lockout (returns 401)")

        print("=" * 65)
        print(f"  TEST RESULTS: {passed} PASSED, {failed} FAILED")
        print("=" * 65)

    finally:
        server.shutdown()
        server.server_close()

    if failed > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == '__main__':
    run_tests()
