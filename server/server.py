"""
Readymade Clothing Shop Management System - Backend Server (Python 3)
Strict Role-Based Access Control (RBAC), Secure Password Hashing, Atomic Inventory Management & POS
"""

import os
import sys
import json
import time
import hmac
import base64
import hashlib
import mimetypes
from datetime import datetime, timezone, timedelta
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
import urllib.parse
import threading

PORT = int(os.environ.get('PORT', 3000))
JWT_SECRET = os.environ.get('JWT_SECRET', 'rms_super_secure_jwt_secret_key_2026')
PUBLIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../public'))

# Lock for atomic database transactions
db_lock = threading.Lock()

# ----------------------------------------------------
# PASSWORD HASHING & COMPLEXITY UTILITIES
# ----------------------------------------------------
def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    """Hashes password using PBKDF2-HMAC-SHA256 with unique salt."""
    if not salt:
        salt = os.urandom(16).hex()
    hashed = hashlib.pbkdf2_hmac(
        'sha256',
        password.encode('utf-8'),
        salt.encode('utf-8'),
        100000
    ).hex()
    return hashed, salt

def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    """Timing-safe password verification."""
    test_hash, _ = hash_password(password, salt)
    return hmac.compare_digest(test_hash, stored_hash)

def is_strong_password(password: str) -> bool:
    """Validates that password meets complexity rules (Min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special)."""
    if len(password) < 8:
        return False
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(not c.isalnum() for c in password)
    return has_upper and has_lower and has_digit and has_special

# Progressive Login Lockout In-Memory Store
failed_attempts = {}
lockout_times = {}
attempts_lock = threading.Lock()

# ----------------------------------------------------
# TOKEN GENERATION & VERIFICATION (HMAC-SHA256 JWT)
# ----------------------------------------------------
def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def base64url_decode(s: str) -> bytes:
    padding = '=' * (4 - (len(s) % 4)) if (len(s) % 4) != 0 else ''
    return base64.urlsafe_b64decode(s + padding)

def create_token(user: dict, csrf_token: str, expires_in_seconds: int = 28800) -> str:
    """Generates a secure HMAC-SHA256 signed JWT including a CSRF token claim."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "role": user["role"],
        "status": user["status"],
        "csrf": csrf_token,
        "iat": int(time.time()),
        "exp": int(time.time()) + expires_in_seconds
    }
    header_b64 = base64url_encode(json.dumps(header).encode('utf-8'))
    payload_b64 = base64url_encode(json.dumps(payload).encode('utf-8'))
    message = f"{header_b64}.{payload_b64}".encode('utf-8')
    sig = hmac.new(JWT_SECRET.encode('utf-8'), message, hashlib.sha256).digest()
    sig_b64 = base64url_encode(sig)
    return f"{header_b64}.{payload_b64}.{sig_b64}"

def verify_token(token: str) -> dict | None:
    if not token:
        return None
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        message = f"{header_b64}.{payload_b64}".encode('utf-8')
        expected_sig = hmac.new(JWT_SECRET.encode('utf-8'), message, hashlib.sha256).digest()
        actual_sig = base64url_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload = json.loads(base64url_decode(payload_b64).decode('utf-8'))
        if payload.get('exp', 0) < time.time():
            return None
        return payload
    except Exception:
        return None

# ----------------------------------------------------
# IN-MEMORY DATA STORE
# ----------------------------------------------------
admin_salt = "admin_salt_8971"
admin_hash, _ = hash_password("Admin@123456", admin_salt)

csh_salt = "csh_salt_1234"
csh_hash, _ = hash_password("Cashier@123", csh_salt)

users = [
    {
        "id": "usr_admin_001",
        "username": "admin",
        "passwordHash": admin_hash,
        "salt": admin_salt,
        "fullName": "Shop Owner & Administrator",
        "employeeId": "ADM001",
        "mobile": "+91 9876543210",
        "email": "admin@readymadeshop.com",
        "role": "ADMIN",
        "status": "ACTIVE",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "lastLoginAt": None
    },
    {
        "id": "usr_csh_001",
        "username": "cashier1",
        "passwordHash": csh_hash,
        "salt": csh_salt,
        "fullName": "Rajesh Sharma",
        "employeeId": "CSH001",
        "mobile": "+91 9876543211",
        "email": "rajesh@readymadeshop.com",
        "role": "CASHIER",
        "status": "ACTIVE",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "lastLoginAt": None
    }
]

categories = ["Shirts", "T-Shirts", "Jeans", "Trousers", "Sarees", "Kurtis", "Kids Wear", "Ethnic Wear", "Winter Wear"]

products = [
    {"id": "prd_01", "name": "Slim Fit Cotton Shirt", "sku": "SHT-SLM-01", "barcode": "8901001", "category": "Shirts", "size": "M", "color": "Sky Blue", "purchasePrice": 450, "sellingPrice": 899, "taxRate": 5, "initialStock": 24, "stockQuantity": 24, "reorderLevel": 5, "isActive": True, "description": "100% Pure cotton breathable shirt for daily wear", "image": "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&auto=format&fit=crop", "mrp": 999, "discount": 10, "quantity": "1 piece"},
    {"id": "prd_02", "name": "Slim Fit Cotton Shirt", "sku": "SHT-SLM-02", "barcode": "8901002", "category": "Shirts", "size": "L", "color": "Sky Blue", "purchasePrice": 450, "sellingPrice": 899, "taxRate": 5, "initialStock": 18, "stockQuantity": 18, "reorderLevel": 5, "isActive": True, "description": "100% Pure cotton breathable shirt for daily wear", "image": "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&auto=format&fit=crop", "mrp": 999, "discount": 10, "quantity": "1 piece"},
    {"id": "prd_03", "name": "Premium Denim Jeans", "sku": "JNS-PRM-32", "barcode": "8902001", "category": "Jeans", "size": "32", "color": "Dark Indigo", "purchasePrice": 750, "sellingPrice": 1599, "taxRate": 5, "initialStock": 12, "stockQuantity": 12, "reorderLevel": 4, "isActive": True, "description": "Stretchy durable denim jeans with standard 5 pockets", "image": "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&auto=format&fit=crop", "mrp": 1999, "discount": 20, "quantity": "1 piece"},
    {"id": "prd_04", "name": "Premium Denim Jeans", "sku": "JNS-PRM-34", "barcode": "8902002", "category": "Jeans", "size": "34", "color": "Dark Indigo", "purchasePrice": 750, "sellingPrice": 1599, "taxRate": 5, "initialStock": 15, "stockQuantity": 15, "reorderLevel": 4, "isActive": True, "description": "Stretchy durable denim jeans with standard 5 pockets", "image": "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&auto=format&fit=crop", "mrp": 1999, "discount": 20, "quantity": "1 piece"},
    {"id": "prd_05", "name": "Round Neck Casual T-Shirt", "sku": "TSH-RND-BLK", "barcode": "8903001", "category": "T-Shirts", "size": "XL", "color": "Black", "purchasePrice": 200, "sellingPrice": 499, "taxRate": 5, "initialStock": 40, "stockQuantity": 40, "reorderLevel": 10, "isActive": True, "description": "Soft combed cotton t-shirt with classic round neck", "image": "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400&auto=format&fit=crop", "mrp": 599, "discount": 16, "quantity": "1 piece"},
    {"id": "prd_06", "name": "Formal Chino Trousers", "sku": "TRS-CHN-32", "barcode": "8904001", "category": "Trousers", "size": "32", "color": "Beige", "purchasePrice": 600, "sellingPrice": 1299, "taxRate": 5, "initialStock": 8, "stockQuantity": 8, "reorderLevel": 3, "isActive": True, "description": "Office wear formal chino trousers", "image": "https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400&auto=format&fit=crop", "mrp": 1499, "discount": 13, "quantity": "1 piece"},
    {"id": "prd_07", "name": "Designer Silk Saree", "sku": "SAR-SLK-RED", "barcode": "8905001", "category": "Sarees", "size": "Free Size", "color": "Crimson Red", "purchasePrice": 1200, "sellingPrice": 2499, "taxRate": 5, "initialStock": 6, "stockQuantity": 6, "reorderLevel": 2, "isActive": True, "description": "Banarasi silk saree with gold embroidery work", "image": "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&auto=format&fit=crop", "mrp": 2999, "discount": 16, "quantity": "1 piece"},
    {"id": "prd_08", "name": "Printed Cotton Kurti", "sku": "KUR-COT-M", "barcode": "8906001", "category": "Kurtis", "size": "M", "color": "Mustard Yellow", "purchasePrice": 350, "sellingPrice": 799, "taxRate": 5, "initialStock": 15, "stockQuantity": 15, "reorderLevel": 4, "isActive": True, "description": "Traditional printed cotton kurti for office or home wear", "image": "https://images.unsplash.com/photo-1608748010899-18f300247112?w=400&auto=format&fit=crop", "mrp": 899, "discount": 11, "quantity": "1 piece"}
]

customers = [
    {"id": "cust_01", "name": "Amit Verma", "mobile": "9876501234", "email": "amit@example.com", "totalSpend": 2498, "visits": 2, "createdAt": datetime.now(timezone.utc).isoformat()},
    {"id": "cust_02", "name": "Priya Patel", "mobile": "9876505678", "email": "priya@example.com", "totalSpend": 1599, "visits": 1, "createdAt": datetime.now(timezone.utc).isoformat()}
]

expenses = [
    {"id": "exp_01", "title": "Shop Electricity Bill", "category": "Utilities", "amount": 3500, "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "recordedBy": "Admin"},
    {"id": "exp_02", "title": "Carry Bags & Packaging Material", "category": "Supplies", "amount": 1200, "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"), "recordedBy": "Admin"}
]

inventory_movements = [
    {"id": "inv_m_01", "productId": "prd_01", "productName": "Slim Fit Cotton Shirt (M, Sky Blue)", "type": "STOCK_IN", "quantity": 24, "reason": "Initial Inventory Opening", "timestamp": datetime.now(timezone.utc).isoformat(), "actor": "ADM001"}
]

_now_utc = datetime.now(timezone.utc)
_yesterday_utc = _now_utc - timedelta(days=1)
_two_days_ago_utc = _now_utc - timedelta(days=2)

purchases = [
    {
        "id": "pch_01",
        "productId": "prd_01",
        "productName": "Slim Fit Cotton Shirt (M, Sky Blue)",
        "sku": "SHT-SLM-01",
        "supplierName": "Tirupur Tex Wholesale Mills",
        "supplierMobile": "+91 98421 55667",
        "invoiceNo": "TEX-INV-8910",
        "quantity": 10,
        "purchasePrice": 420.0,
        "totalAmount": 4200.0,
        "paymentStatus": "PAID",
        "purchaseDate": (_two_days_ago_utc.replace(hour=10, minute=30, second=0, microsecond=0)).isoformat(),
        "notes": "Fresh Cotton Casual Shirts Batch",
        "receivedBy": "Admin (Shop Owner)",
        "createdAt": _two_days_ago_utc.isoformat()
    },
    {
        "id": "pch_02",
        "productId": "prd_03",
        "productName": "Premium Denim Jeans (32, Dark Indigo)",
        "sku": "JNS-PRM-32",
        "supplierName": "Surat Denim Apparels Co",
        "supplierMobile": "+91 98790 12345",
        "invoiceNo": "SDA-9021",
        "quantity": 8,
        "purchasePrice": 720.0,
        "totalAmount": 5760.0,
        "paymentStatus": "PAID",
        "purchaseDate": (_yesterday_utc.replace(hour=15, minute=0, second=0, microsecond=0)).isoformat(),
        "notes": "Dark Indigo Stretchable Denims Restock",
        "receivedBy": "Admin (Shop Owner)",
        "createdAt": _yesterday_utc.isoformat()
    }
]

sales = [
    {
        "id": "sal_sample_01",
        "invoiceNo": "INV-100201",
        "cashierId": "usr_csh_001",
        "cashierName": "cashier1",
        "customerName": "Amit Verma",
        "customerMobile": "9876501234",
        "items": [
            {"productId": "prd_01", "productName": "Slim Fit Cotton Shirt", "sku": "SHT-SLM-01", "size": "M", "color": "Sky Blue", "unitPrice": 899, "quantity": 1, "subtotal": 899, "taxAmount": 44.95, "total": 943.95},
            {"productId": "prd_03", "productName": "Premium Denim Jeans", "sku": "JNS-PRM-32", "size": "32", "color": "Dark Indigo", "unitPrice": 1599, "quantity": 1, "subtotal": 1599, "taxAmount": 79.95, "total": 1678.95}
        ],
        "subtotal": 2498,
        "discountPercent": 0,
        "discountAmount": 0,
        "taxAmount": 124.90,
        "totalAmount": 2622.90,
        "paymentMethod": "UPI",
        "paymentStatus": "PAID",
        "createdAt": (_now_utc - timedelta(hours=2)).isoformat()
    },
    {
        "id": "sal_sample_02",
        "invoiceNo": "INV-100202",
        "cashierId": "usr_csh_001",
        "cashierName": "cashier1",
        "customerName": "Priya Patel",
        "customerMobile": "9876505678",
        "items": [
            {"productId": "prd_08", "productName": "Printed Cotton Kurti", "sku": "KUR-COT-M", "size": "M", "color": "Mustard Yellow", "unitPrice": 799, "quantity": 1, "subtotal": 799, "taxAmount": 39.95, "total": 838.95},
            {"productId": "prd_05", "productName": "Round Neck Casual T-Shirt", "sku": "TSH-RND-BLK", "size": "XL", "color": "Black", "unitPrice": 499, "quantity": 1, "subtotal": 499, "taxAmount": 24.95, "total": 523.95}
        ],
        "subtotal": 1298,
        "discountPercent": 5,
        "discountAmount": 64.90,
        "taxAmount": 61.65,
        "totalAmount": 1294.75,
        "paymentMethod": "CASH",
        "paymentStatus": "PAID",
        "createdAt": (_now_utc - timedelta(hours=4)).isoformat()
    },
    {
        "id": "sal_sample_03",
        "invoiceNo": "INV-100199",
        "cashierId": "usr_csh_001",
        "cashierName": "cashier1",
        "customerName": "Rajesh Kumar",
        "customerMobile": "9840112233",
        "items": [
            {"productId": "prd_07", "productName": "Designer Silk Saree", "sku": "SAR-SLK-RED", "size": "Free Size", "color": "Crimson Red", "unitPrice": 2499, "quantity": 1, "subtotal": 2499, "taxAmount": 124.95, "total": 2623.95},
            {"productId": "prd_06", "productName": "Formal Chino Trousers", "sku": "TRS-CHN-32", "size": "32", "color": "Beige", "unitPrice": 1299, "quantity": 1, "subtotal": 1299, "taxAmount": 64.95, "total": 1363.95}
        ],
        "subtotal": 3798,
        "discountPercent": 10,
        "discountAmount": 379.80,
        "taxAmount": 170.91,
        "totalAmount": 3589.11,
        "paymentMethod": "CARD",
        "paymentStatus": "PAID",
        "createdAt": (_yesterday_utc.replace(hour=14, minute=30, second=0, microsecond=0)).isoformat()
    },
    {
        "id": "sal_sample_04",
        "invoiceNo": "INV-100198",
        "cashierId": "usr_adm_001",
        "cashierName": "admin",
        "customerName": "Sneha Reddy",
        "customerMobile": "9884055667",
        "items": [
            {"productId": "prd_02", "productName": "Slim Fit Cotton Shirt", "sku": "SHT-SLM-02", "size": "L", "color": "Sky Blue", "unitPrice": 899, "quantity": 1, "subtotal": 899, "taxAmount": 44.95, "total": 943.95}
        ],
        "subtotal": 899,
        "discountPercent": 0,
        "discountAmount": 0,
        "taxAmount": 44.95,
        "totalAmount": 943.95,
        "paymentMethod": "UPI",
        "paymentStatus": "PAID",
        "createdAt": (_yesterday_utc.replace(hour=11, minute=15, second=0, microsecond=0)).isoformat()
    },
    {
        "id": "sal_sample_05",
        "invoiceNo": "INV-100195",
        "cashierId": "usr_csh_001",
        "cashierName": "cashier1",
        "customerName": "Kavitha Sundar",
        "customerMobile": "9790887766",
        "items": [
            {"productId": "prd_04", "productName": "Premium Denim Jeans", "sku": "JNS-PRM-34", "size": "34", "color": "Dark Indigo", "unitPrice": 1599, "quantity": 1, "subtotal": 1599, "taxAmount": 79.95, "total": 1678.95}
        ],
        "subtotal": 1599,
        "discountPercent": 0,
        "discountAmount": 0,
        "taxAmount": 79.95,
        "totalAmount": 1678.95,
        "paymentMethod": "CASH",
        "paymentStatus": "PAID",
        "createdAt": (_two_days_ago_utc.replace(hour=16, minute=45, second=0, microsecond=0)).isoformat()
    }
]

audit_logs = [
    {
        "id": "log_01",
        "actorUserId": "SYSTEM",
        "action": "SYSTEM_BOOT",
        "entityType": "system",
        "entityId": "sys_root",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": {"message": "Readymade Garment Shop Management System Initialized"}
    }
]

def log_audit(actor_id: str, action: str, entity_type: str, entity_id: str, metadata: dict = None):
    audit_logs.insert(0, {
        "id": f"log_{int(time.time()*1000)}_{os.urandom(2).hex()}",
        "actorUserId": actor_id,
        "action": action,
        "entityType": entity_type,
        "entityId": entity_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metadata": metadata or {}
    })

damaged_products = [
    {
        "id": "dmg_01",
        "productId": "prd_01",
        "productName": "Slim Fit Cotton Shirt (M, Sky Blue)",
        "sku": "SHT-SLM-01",
        "barcode": "8901001",
        "category": "Shirts",
        "size": "M",
        "color": "Sky Blue",
        "quantity": 1,
        "purchasePrice": 450.0,
        "sellingPrice": 899.0,
        "lossAmount": 450.0,
        "potentialSalesLoss": 899.0,
        "damageReason": "FABRIC_TORN",
        "damageSource": "SHOP_FLOOR_FOUND",
        "supplierName": "Tirupur Tex Wholesale Mills",
        "status": "PENDING_ACTION",
        "notes": "Sleeve seam torn during customer trial",
        "recordedBy": "admin",
        "createdAt": (_yesterday_utc.replace(hour=11, minute=0, second=0, microsecond=0)).isoformat()
    }
]

customer_returns = [
    {
        "id": "crt_01",
        "invoiceNo": "INV-100198",
        "productId": "prd_02",
        "productName": "Slim Fit Cotton Shirt (L, Sky Blue)",
        "sku": "SHT-SLM-02",
        "quantity": 1,
        "refundAmount": 943.95,
        "itemCondition": "GOOD_CONDITION_RESTOCK",
        "refundMethod": "CASH",
        "customerName": "Sneha Reddy",
        "customerMobile": "9884055667",
        "returnReason": "Size Mismatch - requested exchange or refund",
        "recordedBy": "admin",
        "createdAt": (_now_utc - timedelta(hours=5)).isoformat()
    }
]

supplier_returns = [
    {
        "id": "rtv_01",
        "supplierName": "Tirupur Tex Wholesale Mills",
        "supplierMobile": "+91 98421 55667",
        "originalInvoiceNo": "TEX-INV-8910",
        "items": [
            {
                "productId": "prd_01",
                "productName": "Slim Fit Cotton Shirt (M, Sky Blue)",
                "sku": "SHT-SLM-01",
                "quantity": 1,
                "purchasePrice": 420.0,
                "damageId": "dmg_sample_prev",
                "totalClaimAmount": 420.0,
                "reason": "Weaving defect on collar"
            }
        ],
        "totalReturnAmount": 420.0,
        "returnReason": "MANUFACTURING_DEFECT",
        "courierName": "ST Courier / Parcel Service",
        "trackingNo": "STC-998822",
        "dispatchDate": (_yesterday_utc.replace(hour=17, minute=0, second=0, microsecond=0)).isoformat(),
        "status": "SUPPLIER_CREDIT_NOTE",
        "recoveredAmount": 420.0,
        "resolutionNotes": "Supplier issued credit note CR-8802 against next purchase bill",
        "resolvedDate": _now_utc.isoformat(),
        "recordedBy": "admin",
        "createdAt": (_yesterday_utc.replace(hour=16, minute=30, second=0, microsecond=0)).isoformat()
    }
]

def sync_all_product_stocks():
    """
    Recalculates product stockQuantity based on:
    Available Stock = Initial Stock + Inward Purchases (+) - POS Sales (-) - Damaged Stock (-) + Customer Restocks (+)
    """
    for p in products:
        p_id = p["id"]
        init_stock = p.get("initialStock", p.get("stockQuantity", 0))
        p["initialStock"] = init_stock
        inward_qty = sum(pch.get("quantity", 0) for pch in purchases if pch.get("productId") == p_id)
        sold_qty = sum(sum(item.get("quantity", 0) for item in s.get("items", []) if item.get("productId") == p_id) for s in sales)
        # Damaged items found on shop floor or received damaged are deducted from active sellable stock
        damaged_qty = sum(d.get("quantity", 0) for d in damaged_products if d.get("productId") == p_id and d.get("damageSource") != "CUSTOMER_RETURN")
        # Customer returns in good condition are added back to active sellable stock
        restocked_qty = sum(c.get("quantity", 0) for c in customer_returns if c.get("productId") == p_id and c.get("itemCondition") == "GOOD_CONDITION_RESTOCK")
        p["stockQuantity"] = max(0, init_stock + inward_qty - sold_qty - damaged_qty + restocked_qty)

# Perform initial sync
with db_lock:
    sync_all_product_stocks()

# Rate Limiter
rate_limit_store = {}

def is_rate_limited(ip: str, limit: int = 15, window: int = 60) -> bool:
    now = time.time()
    history = rate_limit_store.get(ip, [])
    # Remove old requests
    history = [t for t in history if now - t < window]
    if len(history) >= limit:
        return True
    history.append(now)
    rate_limit_store[ip] = history
    return False

# ----------------------------------------------------
# REQUEST HANDLER
# ----------------------------------------------------
class ReadymadeShopHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Security Headers
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-XSS-Protection', '1; mode=block')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, status_code: int, data: dict | list):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def parse_json_body(self) -> dict:
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length == 0:
            return {}
        body = self.rfile.read(content_length).decode('utf-8')
        try:
            return json.loads(body)
        except Exception:
            return {}

    def get_auth_user(self) -> dict | None:
        auth_header = self.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return None
        token = auth_header.split(' ', 1)[1].strip()
        return verify_token(token)

    # ----------------------------------------------------
    # GET ROUTER
    # ----------------------------------------------------
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # Handle API Routes
        if path.startswith('/api/'):
            user = self.get_auth_user()

            # /api/auth/me
            if path == '/api/auth/me':
                if not user:
                    return self.send_json(401, {"error": "401 Unauthorized: Authentication token required."})
                with db_lock:
                    found = next((u for u in users if u["id"] == user["sub"]), None)
                    if not found:
                        return self.send_json(404, {"error": "User not found."})
                    return self.send_json(200, {
                        "id": found["id"], "username": found["username"], "fullName": found["fullName"],
                        "employeeId": found["employeeId"], "role": found["role"], "status": found["status"],
                        "mobile": found["mobile"], "email": found["email"]
                    })

            # /api/products (Cashier sees active, Admin sees all)
            if path == '/api/products':
                if not user:
                    return self.send_json(401, {"error": "401 Unauthorized"})
                with db_lock:
                    sync_all_product_stocks()
                    if user["role"] == "ADMIN":
                        return self.send_json(200, products)
                    return self.send_json(200, [p for p in products if p.get("isActive", True)])

            # /api/categories
            if path == '/api/categories':
                if not user:
                    return self.send_json(401, {"error": "401 Unauthorized"})
                return self.send_json(200, categories)

            # /api/cashier/my-sales
            if path == '/api/cashier/my-sales':
                if not user:
                    return self.send_json(401, {"error": "401 Unauthorized"})
                with db_lock:
                    my_sales = [s for s in sales if s.get("cashierId") == user["sub"]]
                    return self.send_json(200, my_sales)

            # ADMIN ONLY ROUTES
            if path.startswith('/api/admin/'):
                if not user:
                    return self.send_json(401, {"error": "401 Unauthorized"})
                if user.get("role") != "ADMIN":
                    return self.send_json(403, {"error": "403 Forbidden: Access restricted to ADMIN accounts only."})

                if path == '/api/admin/cashiers':
                    with db_lock:
                        cashier_list = [
                            {
                                "id": u["id"], "fullName": u["fullName"], "employeeId": u["employeeId"],
                                "username": u["username"], "mobile": u["mobile"], "email": u["email"],
                                "role": u["role"], "status": u["status"], "createdAt": u["createdAt"],
                                "lastLoginAt": u["lastLoginAt"]
                            }
                            for u in users if u["role"] == "CASHIER" and u["status"] != "DELETED"
                        ]
                        return self.send_json(200, cashier_list)

                if path.startswith('/api/admin/cashiers/') and path.endswith('/activity'):
                    cashier_id = path.split('/')[4]
                    with db_lock:
                        cashier = next((u for u in users if u["id"] == cashier_id), None)
                        if not cashier:
                            return self.send_json(404, {"error": "Cashier not found."})
                        c_sales = [s for s in sales if s.get("cashierId") == cashier_id]
                        c_logs = [l for l in audit_logs if l.get("actorUserId") == cashier_id]
                        return self.send_json(200, {
                            "cashier": {
                                "id": cashier["id"], "fullName": cashier["fullName"], "username": cashier["username"],
                                "employeeId": cashier["employeeId"], "status": cashier["status"], "lastLoginAt": cashier["lastLoginAt"]
                            },
                            "totalSalesCount": len(c_sales),
                            "totalRevenue": sum(s.get("totalAmount", 0) for s in c_sales),
                            "sales": c_sales[:20],
                            "activityLogs": c_logs[:20]
                        })

                if path == '/api/admin/sales':
                    with db_lock:
                        return self.send_json(200, sales)

                if path == '/api/admin/customers':
                    with db_lock:
                        return self.send_json(200, customers)

                if path == '/api/admin/expenses':
                    with db_lock:
                        return self.send_json(200, expenses)

                if path == '/api/admin/inventory/history':
                    with db_lock:
                        return self.send_json(200, inventory_movements)

                if path == '/api/admin/inventory/purchases':
                    with db_lock:
                        return self.send_json(200, purchases)

                if path == '/api/admin/inventory/valuation':
                    with db_lock:
                        sync_all_product_stocks()
                        val_list = []
                        for p in products:
                            p_id = p["id"]
                            init_stock = p.get("initialStock", p.get("stockQuantity", 0))
                            inward_qty = sum(pch.get("quantity", 0) for pch in purchases if pch.get("productId") == p_id)
                            sold_qty = sum(sum(item.get("quantity", 0) for item in s.get("items", []) if item.get("productId") == p_id) for s in sales)
                            damaged_qty = sum(d.get("quantity", 0) for d in damaged_products if d.get("productId") == p_id and d.get("damageSource") != "CUSTOMER_RETURN")
                            restock_qty = sum(c.get("quantity", 0) for c in customer_returns if c.get("productId") == p_id and c.get("itemCondition") == "GOOD_CONDITION_RESTOCK")
                            curr_stock = p.get("stockQuantity", 0)
                            purch_price = float(p.get("purchasePrice", 0))
                            sell_price = float(p.get("sellingPrice", 0))
                            cost_val = round(curr_stock * purch_price, 2)
                            sell_val = round(curr_stock * sell_price, 2)
                            margin_val = round(sell_val - cost_val, 2)
                            margin_pct = round(((sell_price - purch_price) / purch_price * 100), 1) if purch_price > 0 else 0.0

                            val_list.append({
                                "id": p_id,
                                "name": p.get("name"),
                                "sku": p.get("sku"),
                                "barcode": p.get("barcode"),
                                "category": p.get("category"),
                                "size": p.get("size"),
                                "color": p.get("color"),
                                "image": p.get("image"),
                                "quantity": p.get("quantity", "1 piece"),
                                "mrp": p.get("mrp", sell_price),
                                "purchasePrice": purch_price,
                                "sellingPrice": sell_price,
                                "initialStock": init_stock,
                                "inwardStock": inward_qty,
                                "soldStock": sold_qty,
                                "damagedStock": damaged_qty,
                                "customerRestockStock": restock_qty,
                                "currentStock": curr_stock,
                                "reorderLevel": p.get("reorderLevel", 5),
                                "isActive": p.get("isActive", True),
                                "costValuation": cost_val,
                                "sellingValuation": sell_val,
                                "marginAmount": margin_val,
                                "marginPercent": margin_pct
                            })

                        active_items = [v for v in val_list if v["isActive"]]
                        summary = {
                            "totalProducts": len(active_items),
                            "totalStockQuantity": sum(v["currentStock"] for v in active_items),
                            "totalInitialStock": sum(v["initialStock"] for v in active_items),
                            "totalInwardStock": sum(v["inwardStock"] for v in active_items),
                            "totalSoldStock": sum(v["soldStock"] for v in active_items),
                            "totalCostValuation": round(sum(v["costValuation"] for v in active_items), 2),
                            "totalSellingValuation": round(sum(v["sellingValuation"] for v in active_items), 2),
                            "totalPotentialMargin": round(sum(v["marginAmount"] for v in active_items), 2),
                            "totalInwardSpending": round(sum(pch.get("totalAmount", 0) for pch in purchases), 2),
                            "totalPurchasesCount": len(purchases),
                            "lowStockCount": sum(1 for v in active_items if v["currentStock"] <= v["reorderLevel"])
                        }
                        return self.send_json(200, {"summary": summary, "items": val_list})

                if path == '/api/admin/inventory/damaged-returns':
                    with db_lock:
                        sync_all_product_stocks()
                        tot_damaged_units = sum(d.get("quantity", 0) for d in damaged_products)
                        tot_damage_loss = round(sum(d.get("lossAmount", 0) for d in damaged_products), 2)
                        tot_cust_returns = len(customer_returns)
                        tot_cust_refund = round(sum(c.get("refundAmount", 0) for c in customer_returns), 2)
                        tot_supp_returns = len(supplier_returns)
                        tot_supp_claim = round(sum(r.get("totalReturnAmount", 0) for r in supplier_returns), 2)
                        tot_supp_recovered = round(sum(r.get("recoveredAmount", 0) for r in supplier_returns), 2)
                        net_unrec_loss = round(max(0.0, tot_damage_loss - tot_supp_recovered), 2)

                        summary = {
                            "totalDamagedUnits": tot_damaged_units,
                            "totalDamageLossAmount": tot_damage_loss,
                            "totalCustomerReturns": tot_cust_returns,
                            "totalCustomerRefundAmount": tot_cust_refund,
                            "totalSupplierReturnsCount": tot_supp_returns,
                            "totalSupplierReturnClaimed": tot_supp_claim,
                            "totalSupplierRecoveredAmount": tot_supp_recovered,
                            "netUnrecoveredLoss": net_unrec_loss
                        }
                        return self.send_json(200, {
                            "summary": summary,
                            "damagedProducts": damaged_products,
                            "customerReturns": customer_returns,
                            "supplierReturns": supplier_returns
                        })

                if path == '/api/admin/audit-logs':
                    with db_lock:
                        return self.send_json(200, audit_logs)

                if path == '/api/admin/reports/summary':
                    with db_lock:
                        total_revenue = sum(s.get("totalAmount", 0) for s in sales)
                        total_bills = len(sales)
                        total_stock = sum(p.get("stockQuantity", 0) for p in products)
                        low_stock_count = sum(1 for p in products if p.get("isActive", True) and p.get("stockQuantity", 0) <= p.get("reorderLevel", 5))
                        active_cashiers = sum(1 for u in users if u["role"] == "CASHIER" and u["status"] == "ACTIVE")
                        total_expenses = sum(e.get("amount", 0) for e in expenses)
                        net_profit = total_revenue - total_expenses

                        category_sales = {}
                        for s in sales:
                            for item in s.get("items", []):
                                prod = next((p for p in products if p["id"] == item.get("productId")), None)
                                cat = prod["category"] if prod else "Other"
                                category_sales[cat] = category_sales.get(cat, 0) + item.get("total", 0)

                        payment_breakdown = {"CASH": 0, "UPI": 0, "CARD": 0}
                        for s in sales:
                            pm = s.get("paymentMethod", "CASH")
                            payment_breakdown[pm] = payment_breakdown.get(pm, 0) + s.get("totalAmount", 0)

                        return self.send_json(200, {
                            "totalRevenue": total_revenue,
                            "totalBills": total_bills,
                            "totalStock": total_stock,
                            "lowStockCount": low_stock_count,
                            "activeCashiers": active_cashiers,
                            "totalExpenses": total_expenses,
                            "netProfit": net_profit,
                            "categorySales": category_sales,
                            "paymentBreakdown": payment_breakdown,
                            "recentSales": sales[:10]
                        })

            return self.send_json(404, {"error": "API endpoint not found."})

        # Static File Delivery
        clean_path = path.strip('/')
        if not clean_path:
            local_path = os.path.join(PUBLIC_DIR, 'index.html')
        else:
            local_path = os.path.join(PUBLIC_DIR, clean_path.replace('/', os.sep))

        # 1. If path is a directory, check for index.html inside it
        if os.path.isdir(local_path):
            index_in_dir = os.path.join(local_path, 'index.html')
            if os.path.isfile(index_in_dir):
                local_path = index_in_dir

        # 2. If file doesn't exist, check if appending .html works (clean URLs)
        if not os.path.exists(local_path) and os.path.isfile(local_path + '.html'):
            local_path = local_path + '.html'

        if os.path.exists(local_path) and os.path.isfile(local_path):
            mime_type, _ = mimetypes.guess_type(local_path)
            self.send_response(200)
            self.send_header('Content-Type', mime_type or 'text/html; charset=utf-8')
            self.end_headers()
            with open(local_path, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(b"<h1>404 Not Found</h1><p>The requested file or page was not found.</p>")

    # ----------------------------------------------------
    # POST ROUTER
    # ----------------------------------------------------
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_json_body()

        # 1. /api/auth/login (Rate Limited)
        if path == '/api/auth/login':
            client_ip = self.client_address[0]
            if is_rate_limited(client_ip):
                return self.send_json(429, {"error": "Too many login attempts. Please wait 1 minute before retrying."})

            username = (body.get('username') or '').strip()
            password = body.get('password') or ''
            requested_role = body.get('requestedRole')

            if not username or not password:
                return self.send_json(400, {"error": "Username/Employee ID and password are required."})

            clean_user = username.lower()

            # Progressive Lockout Check
            with attempts_lock:
                now = time.time()
                if clean_user in lockout_times and lockout_times[clean_user] > now:
                    log_audit("ANONYMOUS", "LOGIN_BLOCKED_LOCKOUT", "user", username, {"reason": "Account temporarily locked"})
                    return self.send_json(401, {"error": "Invalid username or password."})

            with db_lock:
                user = next((
                    u for u in users
                    if u["username"].lower() == clean_user or (u.get("employeeId") and u["employeeId"].lower() == clean_user)
                ), None)

                # Timing-safe verification & generic error prevents username harvesting
                if not user or not verify_password(password, user["passwordHash"], user.get("salt", "")):
                    log_audit("ANONYMOUS", "LOGIN_FAILED", "user", username, {"reason": "Invalid credentials"})
                    
                    # Track failed attempts for progressive lockout
                    with attempts_lock:
                        now = time.time()
                        failed_attempts[clean_user] = failed_attempts.get(clean_user, 0) + 1
                        if failed_attempts[clean_user] >= 5:
                            lockout_times[clean_user] = now + 60  # Lock for 60 seconds
                            failed_attempts[clean_user] = 0  # Reset attempts
                            
                    return self.send_json(401, {"error": "Invalid username or password."})

                if user["status"] != "ACTIVE":
                    log_audit(user["id"], "LOGIN_BLOCKED", "user", user["id"], {"reason": f"Status is {user['status']}"})
                    return self.send_json(403, {"error": f"Your account is {user['status']}. Please contact the administrator."})

                if requested_role and user["role"] != requested_role:
                    log_audit(user["id"], "UNAUTHORIZED_PORTAL_ATTEMPT", "user", user["id"], {"requestedRole": requested_role, "actualRole": user["role"]})
                    return self.send_json(401, {"error": "Invalid credentials for this login portal."})

                # Reset lockout on success
                with attempts_lock:
                    failed_attempts[clean_user] = 0
                    if clean_user in lockout_times:
                        del lockout_times[clean_user]

                user["lastLoginAt"] = datetime.now(timezone.utc).isoformat()
                
                # CSRF Token Generation
                csrf_token = os.urandom(16).hex()
                token = create_token(user, csrf_token)
                log_audit(user["id"], f"{user['role']}_LOGIN_SUCCESS", "user", user["id"])

                # Never return passwordHash or salt
                return self.send_json(200, {
                    "token": token,
                    "csrfToken": csrf_token,
                    "user": {
                        "id": user["id"], "username": user["username"], "fullName": user["fullName"],
                        "employeeId": user["employeeId"], "role": user["role"], "status": user["status"],
                        "mobile": user["mobile"], "email": user["email"]
                    }
                })

        user = self.get_auth_user()
        if not user:
            return self.send_json(401, {"error": "401 Unauthorized: Authentication token required."})

        # CSRF Protection Check for mutating requests
        csrf_header = self.headers.get('X-CSRF-Token', '').strip()
        if not csrf_header or csrf_header != user.get('csrf'):
            return self.send_json(403, {"error": "403 Forbidden: CSRF token mismatch."})

        # 2. /api/cashier/sales (POS Billing - Atomic stock deduction & price recalculation)
        if path == '/api/cashier/sales':
            items = body.get('items', [])
            discount_percent = body.get('discountPercent', 0)
            payment_method = body.get('paymentMethod', 'CASH')
            customer_name = body.get('customerName', 'Walk-in Customer')
            customer_mobile = (body.get('customerMobile') or '').strip()

            if not items or not isinstance(items, list):
                return self.send_json(400, {"error": "Cart items cannot be empty."})

            with db_lock:
                calculated_subtotal = 0
                calculated_tax = 0
                verified_items = []

                # Validation & price recalculation (Rule 5)
                for it in items:
                    prod = next((p for p in products if p["id"] == it.get("productId")), None)
                    if not prod or not prod.get("isActive", True):
                        return self.send_json(400, {"error": "Selected product is no longer active or available."})

                    try:
                        qty = int(it.get("quantity", 0))
                    except (ValueError, TypeError):
                        qty = 0

                    if qty <= 0:
                        return self.send_json(400, {"error": f"Invalid quantity for \"{prod['name']}\"."})

                    if prod["stockQuantity"] < qty:
                        return self.send_json(400, {
                            "error": f"Insufficient stock for \"{prod['name']}\" ({prod['size']}, {prod['color']}). Available: {prod['stockQuantity']}, Requested: {qty}"
                        })

                    sub = prod["sellingPrice"] * qty
                    tax = (sub * prod.get("taxRate", 5)) / 100

                    verified_items.append({
                        "productId": prod["id"],
                        "productName": prod["name"],
                        "sku": prod["sku"],
                        "size": prod["size"],
                        "color": prod["color"],
                        "unitPrice": prod["sellingPrice"],
                        "quantity": qty,
                        "subtotal": sub,
                        "taxAmount": tax,
                        "total": sub + tax
                    })
                    calculated_subtotal += sub
                    calculated_tax += tax

                # Step 2: Atomic Inventory Deduction
                for it in items:
                    prod = next(p for p in products if p["id"] == it["productId"])
                    qty = int(it["quantity"])
                    prod["stockQuantity"] -= qty
                    inventory_movements.insert(0, {
                        "id": f"inv_m_{int(time.time()*1000)}_{os.urandom(2).hex()}",
                        "productId": prod["id"],
                        "productName": f"{prod['name']} ({prod['size']})",
                        "type": "STOCK_OUT",
                        "quantity": qty,
                        "reason": "POS Sale",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "actor": user["username"]
                    })

                # Step 3: Discount calculation (Strictly capped to 20% max server-side)
                try:
                    disc_pct = min(max(float(discount_percent), 0.0), 20.0)
                except (ValueError, TypeError):
                    disc_pct = 0.0

                discount_amount = (calculated_subtotal * disc_pct) / 100
                total_amount = max(0.0, calculated_subtotal - discount_amount + calculated_tax)

                sale_record = {
                    "id": f"sal_{int(time.time()*1000)}",
                    "invoiceNo": f"INV-{str(int(time.time()))[-6:]}",
                    "cashierId": user["sub"],
                    "cashierName": user["username"],
                    "customerName": customer_name.strip() if customer_name else "Walk-in Customer",
                    "customerMobile": customer_mobile,
                    "items": verified_items,
                    "subtotal": calculated_subtotal,
                    "discountPercent": disc_pct,
                    "discountAmount": discount_amount,
                    "taxAmount": calculated_tax,
                    "totalAmount": round(total_amount, 2),
                    "paymentMethod": payment_method if payment_method in ['CASH', 'UPI', 'CARD'] else 'CASH',
                    "paymentStatus": "PAID",
                    "createdAt": datetime.now(timezone.utc).isoformat()
                }

                sales.insert(0, sale_record)

                if customer_mobile:
                    cust = next((c for c in customers if c["mobile"] == customer_mobile), None)
                    if cust:
                        cust["totalSpend"] += total_amount
                        cust["visits"] += 1
                        if customer_name:
                            cust["name"] = customer_name.strip()
                    else:
                        customers.insert(0, {
                            "id": f"cust_{int(time.time()*1000)}",
                            "name": customer_name.strip() if customer_name else "Customer",
                            "mobile": customer_mobile,
                            "email": "",
                            "totalSpend": total_amount,
                            "visits": 1,
                            "createdAt": datetime.now(timezone.utc).isoformat()
                        })

                log_audit(user["sub"], "SALE_COMPLETED", "sale", sale_record["id"], {
                    "invoiceNo": sale_record["invoiceNo"],
                    "totalAmount": total_amount
                })

                return self.send_json(201, sale_record)

        # 3. ADMIN ONLY POST ROUTES
        if path.startswith('/api/admin/'):
            if user.get("role") != "ADMIN":
                return self.send_json(403, {"error": "403 Forbidden: Access restricted to ADMIN accounts only."})

            # Register Cashier (Admin Only - RBAC Rule 1 & 2)
            if path == '/api/admin/cashiers':
                full_name = (body.get('fullName') or '').strip()
                employee_id = (body.get('employeeId') or '').strip().upper()
                username = (body.get('username') or '').strip().lower()
                password = body.get('password') or ''
                mobile = (body.get('mobile') or '').strip()
                email = (body.get('email') or '').strip()

                if not full_name or not employee_id or not username or not password:
                    return self.send_json(400, {"error": "Full Name, Employee ID, Username, and Password are required."})

                if not is_strong_password(password):
                    return self.send_json(400, {"error": "Password must be at least 8 characters long and contain uppercase, lowercase, numbers, and special characters."})

                with db_lock:
                    if any(u["username"].lower() == username for u in users):
                        return self.send_json(409, {"error": f"Username \"{username}\" is already taken."})

                    if any(u.get("employeeId", "").upper() == employee_id for u in users):
                        return self.send_json(409, {"error": f"Employee ID \"{employee_id}\" is already registered."})

                    salt = f"csh_salt_{int(time.time())}"
                    p_hash, _ = hash_password(password, salt)

                    new_cashier = {
                        "id": f"usr_csh_{int(time.time()*1000)}",
                        "username": username,
                        "passwordHash": p_hash,
                        "salt": salt,
                        "fullName": full_name,
                        "employeeId": employee_id,
                        "mobile": mobile,
                        "email": email,
                        "role": "CASHIER",  # Immutable role assignment
                        "status": "ACTIVE",
                        "createdAt": datetime.now(timezone.utc).isoformat(),
                        "lastLoginAt": None
                    }

                    users.append(new_cashier)
                    log_audit(user["sub"], "CASHIER_CREATED", "user", new_cashier["id"], {
                        "employeeId": employee_id,
                        "username": username
                    })

                    return self.send_json(201, {
                        "id": new_cashier["id"],
                        "fullName": new_cashier["fullName"],
                        "employeeId": new_cashier["employeeId"],
                        "username": new_cashier["username"],
                        "role": new_cashier["role"],
                        "status": new_cashier["status"],
                        "mobile": new_cashier["mobile"],
                        "email": new_cashier["email"],
                        "createdAt": new_cashier["createdAt"]
                    })

            # Add Product
            if path == '/api/admin/products':
                name = (body.get('name') or '').strip()
                category = (body.get('category') or '').strip()
                size = (body.get('size') or '').strip()
                color = (body.get('color') or '').strip()
                selling_price = body.get('sellingPrice')

                if not name or not category or not size or not color or selling_price is None:
                    return self.send_json(400, {"error": "Name, Category, Size, Color, and Selling Price are required."})

                with db_lock:
                    barcode = (body.get('barcode') or '').strip()
                    if not barcode:
                        # Auto-generate unique 890 standard barcode
                        import random
                        while True:
                            barcode = f"890{random.randint(100000, 999999)}"
                            if not any(p.get("barcode") == barcode for p in products):
                                break
                    elif any(p.get("barcode") == barcode for p in products):
                        return self.send_json(409, {"error": f"Barcode \"{barcode}\" already exists."})

                    sku = (body.get('sku') or '').strip().upper()
                    if not sku:
                        sku = f"SKU-{barcode[-6:]}"
                    elif any(p.get("sku", "").upper() == sku for p in products):
                        return self.send_json(409, {"error": f"SKU \"{sku}\" already exists."})

                    stock_init = max(0, int(body.get('stockQuantity', 0)))
                    new_prod = {
                        "id": f"prd_{int(time.time()*1000)}",
                        "name": name,
                        "sku": sku,
                        "barcode": barcode,
                        "category": category,
                        "size": size,
                        "color": color,
                        "purchasePrice": float(body.get('purchasePrice', 0)),
                        "sellingPrice": float(selling_price),
                        "taxRate": float(body.get('taxRate', 5)),
                        "initialStock": stock_init,
                        "stockQuantity": stock_init,
                        "reorderLevel": max(0, int(body.get('reorderLevel', 5))),
                        "mrp": float(body.get('mrp', selling_price)),
                        "discount": float(body.get('discount', 0)),
                        "description": str(body.get('description', '')),
                        "image": str(body.get('image', 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400&auto=format&fit=crop')),
                        "quantity": str(body.get('quantity', '1 piece')),
                        "isActive": True
                    }

                    products.append(new_prod)

                    if new_prod["stockQuantity"] > 0:
                        inventory_movements.insert(0, {
                            "id": f"inv_m_{int(time.time()*1000)}",
                            "productId": new_prod["id"],
                            "productName": f"{new_prod['name']} ({new_prod['size']}, {new_prod['color']})",
                            "type": "STOCK_IN",
                            "quantity": new_prod["stockQuantity"],
                            "reason": "Initial Product Stocking (Opening Stock)",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "actor": user["username"]
                        })

                    log_audit(user["sub"], "PRODUCT_CREATED", "product", new_prod["id"], {"name": name, "sku": sku})
                    return self.send_json(201, new_prod)

            # Inventory Adjust
            if path == '/api/admin/inventory/adjust':
                product_id = body.get('productId')
                adj_type = body.get('type')
                quantity = body.get('quantity')
                reason = body.get('reason', 'Manual Admin Stock Adjustment')

                with db_lock:
                    prod = next((p for p in products if p["id"] == product_id), None)
                    if not prod:
                        return self.send_json(404, {"error": "Product not found."})

                    try:
                        qty = int(quantity)
                    except (ValueError, TypeError):
                        qty = 0

                    if qty <= 0:
                        return self.send_json(400, {"error": "Adjustment quantity must be a positive integer."})

                    if adj_type not in ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'RETURN']:
                        return self.send_json(400, {"error": "Invalid adjustment type."})

                    prev_stock = prod["stockQuantity"]

                    if adj_type in ['STOCK_IN', 'RETURN']:
                        prod["stockQuantity"] += qty
                    elif adj_type == 'STOCK_OUT':
                        if prod["stockQuantity"] < qty:
                            return self.send_json(400, {"error": f"Cannot deduct {qty}. Current stock is only {prod['stockQuantity']}."})
                        prod["stockQuantity"] -= qty
                    elif adj_type == 'ADJUSTMENT':
                        prod["stockQuantity"] = qty

                    movement = {
                        "id": f"inv_m_{int(time.time()*1000)}",
                        "productId": prod["id"],
                        "productName": f"{prod['name']} ({prod['size']}, {prod['color']})",
                        "type": adj_type,
                        "quantity": qty,
                        "previousStock": prev_stock,
                        "newStock": prod["stockQuantity"],
                        "reason": reason,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "actor": user["username"]
                    }

                    inventory_movements.insert(0, movement)
                    log_audit(user["sub"], "STOCK_ADJUSTED", "product", prod["id"], movement)
                    return self.send_json(200, {"success": True, "product": prod, "movementRecord": movement})

            # Record Supplier Inward Purchase (Admin Only)
            if path == '/api/admin/inventory/purchases':
                product_id = body.get('productId')
                supplier_name = (body.get('supplierName') or '').strip()
                supplier_mobile = (body.get('supplierMobile') or '').strip()
                invoice_no = (body.get('invoiceNo') or '').strip()
                quantity = body.get('quantity')
                purchase_price = body.get('purchasePrice')
                purchase_date = body.get('purchaseDate') or datetime.now(timezone.utc).isoformat()
                payment_status = body.get('paymentStatus') or 'PAID'
                notes = (body.get('notes') or '').strip()

                if not product_id or not supplier_name or not invoice_no:
                    return self.send_json(400, {"error": "Product ID, Supplier Name, and Supplier Bill/Invoice Number are required."})

                try:
                    qty = int(quantity)
                    price = float(purchase_price)
                except (ValueError, TypeError):
                    return self.send_json(400, {"error": "Quantity and Purchase Price must be valid positive numbers."})

                if qty <= 0 or price <= 0:
                    return self.send_json(400, {"error": "Quantity and Purchase Price must be greater than zero."})

                with db_lock:
                    prod = next((p for p in products if p["id"] == product_id), None)
                    if not prod:
                        return self.send_json(404, {"error": "Product not found."})

                    prev_stock = prod["stockQuantity"]
                    prod["stockQuantity"] += qty
                    # Update purchasePrice to latest batch cost
                    prod["purchasePrice"] = price

                    total_amt = round(qty * price, 2)
                    purchase_record = {
                        "id": f"pch_{int(time.time()*1000)}_{os.urandom(2).hex()}",
                        "productId": prod["id"],
                        "productName": f"{prod['name']} ({prod.get('size', 'Std')}, {prod.get('color', 'Std')})",
                        "sku": prod.get("sku", ""),
                        "supplierName": supplier_name,
                        "supplierMobile": supplier_mobile,
                        "invoiceNo": invoice_no,
                        "quantity": qty,
                        "purchasePrice": price,
                        "totalAmount": total_amt,
                        "paymentStatus": payment_status,
                        "purchaseDate": purchase_date,
                        "notes": notes or f"Stock Purchase from {supplier_name}",
                        "receivedBy": user["username"],
                        "createdAt": datetime.now(timezone.utc).isoformat()
                    }

                    purchases.insert(0, purchase_record)

                    # Log inventory movement journal
                    movement = {
                        "id": f"inv_m_{int(time.time()*1000)}",
                        "productId": prod["id"],
                        "productName": purchase_record["productName"],
                        "type": "STOCK_IN",
                        "quantity": qty,
                        "previousStock": prev_stock,
                        "newStock": prod["stockQuantity"],
                        "reason": f"Supplier Purchase: {supplier_name} (Bill #{invoice_no})",
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "actor": user["username"]
                    }
                    inventory_movements.insert(0, movement)

                    log_audit(user["sub"], "SUPPLIER_PURCHASE_RECORDED", "purchase", purchase_record["id"], {
                        "productId": prod["id"],
                        "supplier": supplier_name,
                        "invoiceNo": invoice_no,
                        "quantity": qty,
                        "totalAmount": total_amt
                    })

                    return self.send_json(201, {"success": True, "purchase": purchase_record, "product": prod})

            # Record Damaged Product (Admin Only)
            if path == '/api/admin/inventory/damage':
                product_id = body.get('productId')
                quantity = body.get('quantity')
                damage_reason = (body.get('damageReason') or 'FABRIC_TORN').strip()
                damage_source = (body.get('damageSource') or 'SHOP_FLOOR_FOUND').strip()
                supplier_name = (body.get('supplierName') or '').strip()
                notes = (body.get('notes') or '').strip()

                if not product_id or not quantity:
                    return self.send_json(400, {"error": "Product ID and Quantity are required."})

                try:
                    qty = int(quantity)
                except (ValueError, TypeError):
                    return self.send_json(400, {"error": "Quantity must be a positive integer."})

                if qty <= 0:
                    return self.send_json(400, {"error": "Quantity must be greater than zero."})

                with db_lock:
                    prod = next((p for p in products if p["id"] == product_id), None)
                    if not prod:
                        return self.send_json(404, {"error": "Product not found."})

                    if damage_source != 'CUSTOMER_RETURN' and prod["stockQuantity"] < qty:
                        return self.send_json(400, {"error": f"Insufficient stock. Available sellable stock is only {prod['stockQuantity']}."})

                    purch_price = float(prod.get("purchasePrice", 0))
                    sell_price = float(prod.get("sellingPrice", 0))
                    loss_amt = round(qty * purch_price, 2)
                    pot_sales_loss = round(qty * sell_price, 2)

                    if not supplier_name:
                        matched_pch = next((pch for pch in purchases if pch.get("productId") == product_id), None)
                        if matched_pch:
                            supplier_name = matched_pch.get("supplierName", "")

                    damage_record = {
                        "id": f"dmg_{int(time.time()*1000)}_{os.urandom(2).hex()}",
                        "productId": prod["id"],
                        "productName": f"{prod['name']} ({prod.get('size', 'Std')}, {prod.get('color', 'Std')})",
                        "sku": prod.get("sku", ""),
                        "barcode": prod.get("barcode", ""),
                        "category": prod.get("category", "General"),
                        "size": prod.get("size", "Std"),
                        "color": prod.get("color", "Std"),
                        "quantity": qty,
                        "purchasePrice": purch_price,
                        "sellingPrice": sell_price,
                        "lossAmount": loss_amt,
                        "potentialSalesLoss": pot_sales_loss,
                        "damageReason": damage_reason,
                        "damageSource": damage_source,
                        "supplierName": supplier_name,
                        "status": "PENDING_ACTION",
                        "notes": notes,
                        "recordedBy": user["username"],
                        "createdAt": datetime.now(timezone.utc).isoformat()
                    }

                    damaged_products.insert(0, damage_record)

                    if damage_source != 'CUSTOMER_RETURN':
                        prev_stock = prod["stockQuantity"]
                        prod["stockQuantity"] -= qty
                        movement = {
                            "id": f"inv_m_{int(time.time()*1000)}",
                            "productId": prod["id"],
                            "productName": damage_record["productName"],
                            "type": "STOCK_OUT",
                            "quantity": qty,
                            "previousStock": prev_stock,
                            "newStock": prod["stockQuantity"],
                            "reason": f"Damaged Garment: {damage_reason} ({notes or 'Defect'})",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "actor": user["username"]
                        }
                        inventory_movements.insert(0, movement)

                    sync_all_product_stocks()
                    log_audit(user["sub"], "DAMAGED_PRODUCT_RECORDED", "damaged_product", damage_record["id"], {
                        "productId": product_id,
                        "quantity": qty,
                        "lossAmount": loss_amt,
                        "reason": damage_reason
                    })

                    return self.send_json(201, {"success": True, "damagedProduct": damage_record, "product": prod})

            # Record Customer Return (Admin Only)
            if path == '/api/admin/inventory/customer-returns':
                product_id = body.get('productId')
                invoice_no = (body.get('invoiceNo') or '').strip()
                quantity = body.get('quantity')
                refund_amount = body.get('refundAmount')
                item_condition = body.get('itemCondition') or 'GOOD_CONDITION_RESTOCK'
                refund_method = body.get('refundMethod') or 'CASH'
                customer_name = (body.get('customerName') or 'Customer').strip()
                customer_mobile = (body.get('customerMobile') or '').strip()
                return_reason = (body.get('returnReason') or 'Customer Return').strip()

                if not product_id or not quantity:
                    return self.send_json(400, {"error": "Product ID and Quantity are required."})

                try:
                    qty = int(quantity)
                    ref_amt = float(refund_amount) if refund_amount is not None else 0.0
                except (ValueError, TypeError):
                    return self.send_json(400, {"error": "Quantity and Refund Amount must be valid numbers."})

                if qty <= 0:
                    return self.send_json(400, {"error": "Quantity must be greater than zero."})

                with db_lock:
                    prod = next((p for p in products if p["id"] == product_id), None)
                    if not prod:
                        return self.send_json(404, {"error": "Product not found."})

                    if ref_amt <= 0:
                        ref_amt = round(prod.get("sellingPrice", 0) * qty, 2)

                    return_record = {
                        "id": f"crt_{int(time.time()*1000)}_{os.urandom(2).hex()}",
                        "invoiceNo": invoice_no or "N/A",
                        "productId": prod["id"],
                        "productName": f"{prod['name']} ({prod.get('size', 'Std')}, {prod.get('color', 'Std')})",
                        "sku": prod.get("sku", ""),
                        "quantity": qty,
                        "refundAmount": ref_amt,
                        "itemCondition": item_condition,
                        "refundMethod": refund_method,
                        "customerName": customer_name,
                        "customerMobile": customer_mobile,
                        "returnReason": return_reason,
                        "recordedBy": user["username"],
                        "createdAt": datetime.now(timezone.utc).isoformat()
                    }

                    customer_returns.insert(0, return_record)

                    if item_condition == 'GOOD_CONDITION_RESTOCK':
                        prev_stock = prod["stockQuantity"]
                        prod["stockQuantity"] += qty
                        movement = {
                            "id": f"inv_m_{int(time.time()*1000)}",
                            "productId": prod["id"],
                            "productName": return_record["productName"],
                            "type": "RETURN",
                            "quantity": qty,
                            "previousStock": prev_stock,
                            "newStock": prod["stockQuantity"],
                            "reason": f"Customer Return Restocked: Bill #{invoice_no} ({return_reason})",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "actor": user["username"]
                        }
                        inventory_movements.insert(0, movement)
                    else:
                        purch_price = float(prod.get("purchasePrice", 0))
                        dmg_entry = {
                            "id": f"dmg_{int(time.time()*1000)}_{os.urandom(2).hex()}",
                            "productId": prod["id"],
                            "productName": return_record["productName"],
                            "sku": prod.get("sku", ""),
                            "barcode": prod.get("barcode", ""),
                            "category": prod.get("category", "General"),
                            "size": prod.get("size", "Std"),
                            "color": prod.get("color", "Std"),
                            "quantity": qty,
                            "purchasePrice": purch_price,
                            "sellingPrice": float(prod.get("sellingPrice", 0)),
                            "lossAmount": round(qty * purch_price, 2),
                            "potentialSalesLoss": round(qty * float(prod.get("sellingPrice", 0)), 2),
                            "damageReason": f"Customer Return Defective: {return_reason}",
                            "damageSource": "CUSTOMER_RETURN",
                            "supplierName": "",
                            "status": "PENDING_ACTION",
                            "notes": f"Returned by {customer_name} under invoice {invoice_no}",
                            "recordedBy": user["username"],
                            "createdAt": datetime.now(timezone.utc).isoformat()
                        }
                        damaged_products.insert(0, dmg_entry)

                    sync_all_product_stocks()
                    log_audit(user["sub"], "CUSTOMER_RETURN_RECORDED", "customer_return", return_record["id"], {
                        "invoiceNo": invoice_no,
                        "refundAmount": ref_amt,
                        "condition": item_condition
                    })

                    return self.send_json(201, {"success": True, "customerReturn": return_record, "product": prod})

            # Create Supplier Return / RTV (Admin Only)
            if path == '/api/admin/inventory/supplier-returns':
                supplier_name = (body.get('supplierName') or '').strip()
                supplier_mobile = (body.get('supplierMobile') or '').strip()
                original_invoice_no = (body.get('originalInvoiceNo') or '').strip()
                items = body.get('items') or []
                return_reason = (body.get('returnReason') or 'MANUFACTURING_DEFECT').strip()
                courier_name = (body.get('courierName') or '').strip()
                tracking_no = (body.get('trackingNo') or '').strip()
                dispatch_date = body.get('dispatchDate') or datetime.now(timezone.utc).isoformat()
                notes = (body.get('notes') or '').strip()

                if not supplier_name or not items:
                    return self.send_json(400, {"error": "Supplier Name and at least one Item are required for Supplier Return."})

                with db_lock:
                    verified_items = []
                    total_return_amount = 0.0

                    for item in items:
                        p_id = item.get('productId')
                        prod = next((p for p in products if p["id"] == p_id), None)
                        if not prod:
                            return self.send_json(404, {"error": f"Product with ID {p_id} not found."})

                        try:
                            it_qty = int(item.get('quantity', 1))
                            it_price = float(item.get('purchasePrice', prod.get('purchasePrice', 0)))
                        except (ValueError, TypeError):
                            return self.send_json(400, {"error": "Invalid item quantity or price."})

                        claim_amt = round(it_qty * it_price, 2)
                        total_return_amount += claim_amt

                        dmg_id = item.get('damageId')
                        if dmg_id:
                            dmg_rec = next((d for d in damaged_products if d["id"] == dmg_id), None)
                            if dmg_rec:
                                dmg_rec["status"] = "RETURNED_TO_SUPPLIER"
                                dmg_rec["supplierName"] = supplier_name

                        verified_items.append({
                            "productId": prod["id"],
                            "productName": f"{prod['name']} ({prod.get('size', 'Std')}, {prod.get('color', 'Std')})",
                            "sku": prod.get("sku", ""),
                            "quantity": it_qty,
                            "purchasePrice": it_price,
                            "damageId": dmg_id or "",
                            "totalClaimAmount": claim_amt,
                            "reason": item.get('reason', return_reason)
                        })

                    rtv_record = {
                        "id": f"rtv_{int(time.time()*1000)}_{os.urandom(2).hex()}",
                        "supplierName": supplier_name,
                        "supplierMobile": supplier_mobile,
                        "originalInvoiceNo": original_invoice_no,
                        "items": verified_items,
                        "totalReturnAmount": round(total_return_amount, 2),
                        "returnReason": return_reason,
                        "courierName": courier_name,
                        "trackingNo": tracking_no,
                        "dispatchDate": dispatch_date,
                        "status": "RETURN_DISPATCHED",
                        "recoveredAmount": 0.0,
                        "resolutionNotes": notes or f"Returned to {supplier_name} via {courier_name or 'Direct Parcel'}",
                        "resolvedDate": None,
                        "recordedBy": user["username"],
                        "createdAt": datetime.now(timezone.utc).isoformat()
                    }

                    supplier_returns.insert(0, rtv_record)
                    sync_all_product_stocks()
                    log_audit(user["sub"], "SUPPLIER_RETURN_DISPATCHED", "supplier_return", rtv_record["id"], {
                        "supplierName": supplier_name,
                        "totalAmount": total_return_amount,
                        "itemsCount": len(verified_items)
                    })

                    return self.send_json(201, {"success": True, "supplierReturn": rtv_record})

            # Add Category (Admin Only)
            if path == '/api/admin/categories':
                name = (body.get('name') or '').strip()
                if not name:
                    return self.send_json(400, {"error": "Category name is required."})
                with db_lock:
                    if name.lower() in [c.lower() for c in categories]:
                        return self.send_json(409, {"error": f"Category \"{name}\" already exists."})
                    categories.append(name)
                    log_audit(user["sub"], "CATEGORY_CREATED", "category", name)
                    return self.send_json(201, {"name": name})

            # Add Expense
            if path == '/api/admin/expenses':
                title = (body.get('title') or '').strip()
                category = (body.get('category') or 'General').strip()
                amount = float(body.get('amount', 0))
                date_str = body.get('date', datetime.now(timezone.utc).strftime("%Y-%m-%d"))

                if not title or amount <= 0:
                    return self.send_json(400, {"error": "Expense title and valid amount are required."})

                with db_lock:
                    exp = {
                        "id": f"exp_{int(time.time()*1000)}",
                        "title": title,
                        "category": category,
                        "amount": amount,
                        "date": date_str,
                        "recordedBy": user["username"],
                        "createdAt": datetime.now(timezone.utc).isoformat()
                    }
                    expenses.insert(0, exp)
                    log_audit(user["sub"], "EXPENSE_RECORDED", "expense", exp["id"], exp)
                    return self.send_json(201, exp)

            # Reset Cashier Password
            if path.startswith('/api/admin/cashiers/') and path.endswith('/reset-password'):
                cashier_id = path.split('/')[4]
                new_pass = body.get('newPassword')
                if not new_pass or not is_strong_password(new_pass):
                    return self.send_json(400, {"error": "Password must be at least 8 characters long and contain uppercase, lowercase, numbers, and special characters."})

                with db_lock:
                    csh = next((u for u in users if u["id"] == cashier_id and u["role"] == "CASHIER"), None)
                    if not csh:
                        return self.send_json(404, {"error": "Cashier not found."})

                    salt = f"csh_salt_{int(time.time())}"
                    p_hash, _ = hash_password(new_pass, salt)
                    csh["passwordHash"] = p_hash
                    csh["salt"] = salt
                    log_audit(user["sub"], "CASHIER_PASSWORD_RESET", "user", cashier_id)
                    return self.send_json(200, {"success": True, "message": "Password updated successfully."})

        return self.send_json(404, {"error": "API endpoint not found."})

    # ----------------------------------------------------
    # PUT & PATCH ROUTER
    # ----------------------------------------------------
    def do_PUT(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_json_body()
        user = self.get_auth_user()

        if not user:
            return self.send_json(401, {"error": "401 Unauthorized"})

        # CSRF Protection Check
        csrf_header = self.headers.get('X-CSRF-Token', '').strip()
        if not csrf_header or csrf_header != user.get('csrf'):
            return self.send_json(403, {"error": "403 Forbidden: CSRF token mismatch."})

        if user.get("role") != "ADMIN":
            return self.send_json(403, {"error": "403 Forbidden"})

        # Edit Cashier
        if path.startswith('/api/admin/cashiers/'):
            cashier_id = path.split('/')[4]
            with db_lock:
                csh = next((u for u in users if u["id"] == cashier_id and u["role"] == "CASHIER"), None)
                if not csh:
                    return self.send_json(404, {"error": "Cashier not found."})

                if "fullName" in body:
                    csh["fullName"] = body["fullName"].strip()
                if "mobile" in body:
                    csh["mobile"] = body["mobile"].strip()
                if "email" in body:
                    csh["email"] = body["email"].strip()

                log_audit(user["sub"], "CASHIER_UPDATED", "user", cashier_id, body)
                return self.send_json(200, {"success": True, "cashier": csh})

        # Edit Product
        if path.startswith('/api/admin/products/'):
            product_id = path.split('/')[4]
            with db_lock:
                prod = next((p for p in products if p["id"] == product_id), None)
                if not prod:
                    return self.send_json(404, {"error": "Product not found."})

                for field in ['name', 'category', 'size', 'color', 'barcode', 'sku', 'description', 'image', 'quantity']:
                    if field in body:
                        prod[field] = str(body[field]).strip()
                for num_field in ['purchasePrice', 'sellingPrice', 'taxRate', 'reorderLevel', 'mrp', 'discount']:
                    if num_field in body:
                        prod[num_field] = float(body[num_field])
                if 'isActive' in body:
                    prod['isActive'] = bool(body['isActive'])

                log_audit(user["sub"], "PRODUCT_UPDATED", "product", product_id, body)
                return self.send_json(200, prod)

        return self.send_json(404, {"error": "API endpoint not found."})

    def do_PATCH(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self.parse_json_body()
        user = self.get_auth_user()

        if not user:
            return self.send_json(401, {"error": "401 Unauthorized"})

        # CSRF Protection Check
        csrf_header = self.headers.get('X-CSRF-Token', '').strip()
        if not csrf_header or csrf_header != user.get('csrf'):
            return self.send_json(403, {"error": "403 Forbidden: CSRF token mismatch."})

        if user.get("role") != "ADMIN":
            return self.send_json(403, {"error": "403 Forbidden"})

        # Change Cashier Status
        if path.startswith('/api/admin/cashiers/') and path.endswith('/status'):
            cashier_id = path.split('/')[4]
            status = body.get('status')
            if status not in ['ACTIVE', 'INACTIVE', 'SUSPENDED']:
                return self.send_json(400, {"error": "Invalid status."})

            with db_lock:
                csh = next((u for u in users if u["id"] == cashier_id and u["role"] == "CASHIER"), None)
                if not csh:
                    return self.send_json(404, {"error": "Cashier not found."})

                prev = csh["status"]
                csh["status"] = status
                log_audit(user["sub"], "CASHIER_STATUS_UPDATED", "user", cashier_id, {"from": prev, "to": status})
                return self.send_json(200, {"success": True, "cashierId": cashier_id, "status": status})

        # Update Supplier Return Claim Status (Admin Only)
        if path.startswith('/api/admin/inventory/supplier-returns/') and path.endswith('/status'):
            rtv_id = path.split('/')[5]
            with db_lock:
                rtv = next((r for r in supplier_returns if r["id"] == rtv_id), None)
                if not rtv:
                    return self.send_json(404, {"error": "Supplier return record not found."})

                status = body.get('status')
                recovered_amount = body.get('recoveredAmount')
                resolution_notes = body.get('resolutionNotes')

                if status:
                    rtv["status"] = status
                if recovered_amount is not None:
                    try:
                        rtv["recoveredAmount"] = round(float(recovered_amount), 2)
                    except (ValueError, TypeError):
                        pass
                if resolution_notes:
                    rtv["resolutionNotes"] = resolution_notes.strip()

                rtv["resolvedDate"] = datetime.now(timezone.utc).isoformat()

                log_audit(user["sub"], "SUPPLIER_RETURN_STATUS_UPDATED", "supplier_return", rtv["id"], {
                    "status": rtv["status"],
                    "recoveredAmount": rtv.get("recoveredAmount", 0)
                })

                return self.send_json(200, {"success": True, "supplierReturn": rtv})

        return self.send_json(404, {"error": "API endpoint not found."})

    # ----------------------------------------------------
    # DELETE ROUTER (SOFT DELETE)
    # ----------------------------------------------------
    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        user = self.get_auth_user()

        if not user:
            return self.send_json(401, {"error": "401 Unauthorized"})

        # CSRF Protection Check
        csrf_header = self.headers.get('X-CSRF-Token', '').strip()
        if not csrf_header or csrf_header != user.get('csrf'):
            return self.send_json(403, {"error": "403 Forbidden: CSRF token mismatch."})

        if user.get("role") != "ADMIN":
            return self.send_json(403, {"error": "403 Forbidden"})

        # Soft Delete / Deactivate Product (Rule 6)
        if path.startswith('/api/admin/products/'):
            product_id = path.split('/')[4]
            with db_lock:
                prod = next((p for p in products if p["id"] == product_id), None)
                if not prod:
                    return self.send_json(404, {"error": "Product not found."})

                prod["isActive"] = False
                log_audit(user["sub"], "PRODUCT_DEACTIVATED", "product", product_id)
                return self.send_json(200, {"success": True, "message": "Product successfully deactivated."})

        # Soft Delete Cashier (Admin Only)
        if path.startswith('/api/admin/cashiers/'):
            cashier_id = path.split('/')[4]
            with db_lock:
                csh = next((u for u in users if u["id"] == cashier_id and u["role"] == "CASHIER"), None)
                if not csh:
                    return self.send_json(404, {"error": "Cashier not found."})

                csh["status"] = "DELETED"
                log_audit(user["sub"], "CASHIER_DELETED", "user", cashier_id)
                return self.send_json(200, {"success": True, "message": "Cashier successfully deleted."})

        # Delete Category (Admin Only)
        if path.startswith('/api/admin/categories/'):
            cat_name = urllib.parse.unquote(path.split('/')[4])
            with db_lock:
                if cat_name not in categories:
                    return self.send_json(404, {"error": "Category not found."})
                # Check if category is used by any active product
                if any(p.get("category") == cat_name and p.get("isActive", True) for p in products):
                    return self.send_json(400, {"error": "Cannot delete category as it is currently assigned to active products."})
                categories.remove(cat_name)
                log_audit(user["sub"], "CATEGORY_DELETED", "category", cat_name)
                return self.send_json(200, {"success": True, "message": "Category successfully deleted."})

        return self.send_json(404, {"error": "API endpoint not found."})


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

def run(port=PORT):
    if sys.stdout.encoding != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
    server = ThreadedHTTPServer(('0.0.0.0', port), ReadymadeShopHandler)
    print("=" * 60)
    print("  Readymade Garment Shop Management System (Production)")
    print(f"  Server listening on: http://localhost:{port}")
    print(f"  Admin Portal:        http://localhost:{port}/admin-login.html")
    print(f"  Cashier POS:         http://localhost:{port}/cashier-login.html")
    print("=" * 60)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.server_close()

if __name__ == '__main__':
    run()
