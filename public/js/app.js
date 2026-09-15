/**
 * Readymade Shop - Central State, RBAC API & Local Bridge
 * Connects frontend UI to Express REST API with seamless fallback
 */

const AppStore = {
  API_BASE: '/api',

  // Helper for authenticated API calls
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('rms_auth_token');
    const csrfToken = localStorage.getItem('rms_csrf_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(options.headers || {})
    };

    try {
      const response = await fetch(`${this.API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();
      if (response.status === 401) {
        if (endpoint !== '/auth/login') {
          SecurityEngine.clearSession();
          window.location.href = SecurityEngine.resolvePath('index.html');
        }
        throw new Error(data.error || 'Session expired or unauthorized. Please log in again.');
      }
      if (response.status === 403) {
        if (endpoint !== '/auth/login') {
          window.location.href = SecurityEngine.resolvePath('index.html');
        }
        throw new Error(data.error || 'Access Denied: You do not have permission to access this resource.');
      }
      if (!response.ok) {
        throw new Error(data.error || `HTTP Error ${response.status}`);
      }
      return data;
    } catch (err) {
      // If server is not responding (e.g. static preview), handle via fallback
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        return this.fallbackHandler(endpoint, options);
      }
      throw err;
    }
  },

  // Initialize Default State
  async init() {
    if (!localStorage.getItem('rms_initialized')) {
      const adminSalt = 'admin_salt_8971';
      const adminHash = await SecurityEngine.hashPassword('Admin@123456', adminSalt);
      const cshSalt = 'csh_salt_1234';
      const cshHash = await SecurityEngine.hashPassword('Cashier@123', cshSalt);

      const defaultUsers = [
        {
          id: 'usr_admin_001',
          username: 'admin',
          passwordHash: adminHash,
          salt: adminSalt,
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
          passwordHash: cshHash,
          salt: cshSalt,
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

      const defaultProducts = [
        { id: 'prd_01', name: 'Slim Fit Cotton Shirt', sku: 'SHT-SLM-01', barcode: '8901001', category: 'Shirts', size: 'M', color: 'Sky Blue', purchasePrice: 450, sellingPrice: 899, taxRate: 5, stockQuantity: 24, initialStock: 24, reorderLevel: 5, isActive: true, description: '100% Pure cotton breathable shirt for daily wear', image: 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&auto=format&fit=crop', mrp: 999, discount: 10, quantity: '1 piece' },
        { id: 'prd_02', name: 'Slim Fit Cotton Shirt', sku: 'SHT-SLM-02', barcode: '8901002', category: 'Shirts', size: 'L', color: 'Sky Blue', purchasePrice: 450, sellingPrice: 899, taxRate: 5, stockQuantity: 18, initialStock: 18, reorderLevel: 5, isActive: true, description: '100% Pure cotton breathable shirt for daily wear', image: 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&auto=format&fit=crop', mrp: 999, discount: 10, quantity: '1 piece' },
        { id: 'prd_03', name: 'Premium Denim Jeans', sku: 'JNS-PRM-32', barcode: '8902001', category: 'Jeans', size: '32', color: 'Dark Indigo', purchasePrice: 750, sellingPrice: 1599, taxRate: 5, stockQuantity: 12, initialStock: 12, reorderLevel: 4, isActive: true, description: 'Stretchy durable denim jeans with standard 5 pockets', image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&auto=format&fit=crop', mrp: 1999, discount: 20, quantity: '1 piece' },
        { id: 'prd_04', name: 'Premium Denim Jeans', sku: 'JNS-PRM-34', barcode: '8902002', category: 'Jeans', size: '34', color: 'Dark Indigo', purchasePrice: 750, sellingPrice: 1599, taxRate: 5, stockQuantity: 15, initialStock: 15, reorderLevel: 4, isActive: true, description: 'Stretchy durable denim jeans with standard 5 pockets', image: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&auto=format&fit=crop', mrp: 1999, discount: 20, quantity: '1 piece' },
        { id: 'prd_05', name: 'Round Neck Casual T-Shirt', sku: 'TSH-RND-BLK', barcode: '8903001', category: 'T-Shirts', size: 'XL', color: 'Black', purchasePrice: 200, sellingPrice: 499, taxRate: 5, stockQuantity: 40, initialStock: 40, reorderLevel: 10, isActive: true, description: 'Soft combed cotton t-shirt with classic round neck', image: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400&auto=format&fit=crop', mrp: 599, discount: 16, quantity: '1 piece' },
        { id: 'prd_06', name: 'Formal Chino Trousers', sku: 'TRS-CHN-32', barcode: '8904001', category: 'Trousers', size: '32', color: 'Beige', purchasePrice: 600, sellingPrice: 1299, taxRate: 5, stockQuantity: 8, initialStock: 8, reorderLevel: 3, isActive: true, description: 'Office wear formal chino trousers', image: 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400&auto=format&fit=crop', mrp: 1499, discount: 13, quantity: '1 piece' },
        { id: 'prd_07', name: 'Designer Silk Saree', sku: 'SAR-SLK-RED', barcode: '8905001', category: 'Sarees', size: 'Free Size', color: 'Crimson Red', purchasePrice: 1200, sellingPrice: 2499, taxRate: 5, stockQuantity: 6, initialStock: 6, reorderLevel: 2, isActive: true, description: 'Banarasi silk saree with gold embroidery work', image: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&auto=format&fit=crop', mrp: 2999, discount: 16, quantity: '1 piece' },
        { id: 'prd_08', name: 'Printed Cotton Kurti', sku: 'KUR-COT-M', barcode: '8906001', category: 'Kurtis', size: 'M', color: 'Mustard Yellow', purchasePrice: 350, sellingPrice: 799, taxRate: 5, stockQuantity: 15, initialStock: 15, reorderLevel: 4, isActive: true, description: 'Traditional printed cotton kurti for office or home wear', image: 'https://images.unsplash.com/photo-1608748010899-18f300247112?w=400&auto=format&fit=crop', mrp: 899, discount: 11, quantity: '1 piece' }
      ];

      const defaultPurchases = [
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

      const defaultCustomers = [
        { id: 'cust_01', name: 'Amit Verma', mobile: '9876501234', email: 'amit@example.com', totalSpend: 2498, visits: 2, createdAt: new Date().toISOString() },
        { id: 'cust_02', name: 'Priya Patel', mobile: '9876505678', email: 'priya@example.com', totalSpend: 1599, visits: 1, createdAt: new Date().toISOString() }
      ];

      const defaultExpenses = [
        { id: 'exp_01', title: 'Shop Electricity Bill', category: 'Utilities', amount: 3500, date: new Date().toISOString().split('T')[0], recordedBy: 'Admin' },
        { id: 'exp_02', title: 'Carry Bags & Packaging Material', category: 'Supplies', amount: 1200, date: new Date().toISOString().split('T')[0], recordedBy: 'Admin' }
      ];

      const nowUtc = Date.now();
      const oneDayMs = 86400000;

      const defaultSales = [
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

      const defaultCategories = [
        'Shirts', 'T-Shirts', 'Jeans', 'Trousers', 'Sarees', 'Kurtis', 
        'Salwar Kameez', 'Salwar Materials', 'Lehengas', 'Kids Wear', 
        'Frocks & Gowns', 'Skirts & Tops', 'Leggings & Jeggings', 'Nightwear', 
        'Innerwear', 'Ethnic Wear', 'Sherwanis', 'Coats & Blazers', 
        'Tracks & Joggers', 'Shorts & 3/4ths', 'Dhotis', 'Lungi', 
        'Dupattas & Shawls', 'Socks & Handkerchiefs', 'Western Wear', 'General'
      ];
      localStorage.setItem('rms_users', JSON.stringify(defaultUsers));
      localStorage.setItem('rms_categories', JSON.stringify(defaultCategories));
      localStorage.setItem('rms_products', JSON.stringify(defaultProducts));
      localStorage.setItem('rms_customers', JSON.stringify(defaultCustomers));
      localStorage.setItem('rms_expenses', JSON.stringify(defaultExpenses));
      localStorage.setItem('rms_sales', JSON.stringify(defaultSales));
      localStorage.setItem('rms_purchases', JSON.stringify(defaultPurchases));
      localStorage.setItem('rms_inventory_movements', JSON.stringify([]));
      localStorage.setItem('rms_audit_logs', JSON.stringify([]));
      localStorage.setItem('rms_initialized', 'true');
    }

    // Migration patch for existing local database to ensure image property is seeded with HD matching apparel images
    try {
      if (!localStorage.getItem('rms_mig_suitable_images_v2')) {
        const storedProds = JSON.parse(localStorage.getItem('rms_products') || '[]');
        const imageMap = {
          'prd_01': 'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400&auto=format&fit=crop',
          'prd_02': 'https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400&auto=format&fit=crop',
          'prd_03': 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400&auto=format&fit=crop',
          'prd_04': 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&auto=format&fit=crop',
          'prd_05': 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400&auto=format&fit=crop',
          'prd_06': 'https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400&auto=format&fit=crop',
          'prd_07': 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=400&auto=format&fit=crop',
          'prd_08': 'https://images.unsplash.com/photo-1608748010899-18f300247112?w=400&auto=format&fit=crop'
        };
        const descriptionMap = {
          'prd_01': '100% Pure cotton breathable shirt for daily wear',
          'prd_02': '100% Pure cotton breathable shirt for daily wear',
          'prd_03': 'Stretchy durable denim jeans with standard 5 pockets',
          'prd_04': 'Stretchy durable denim jeans with standard 5 pockets',
          'prd_05': 'Soft combed cotton t-shirt with classic round neck',
          'prd_06': 'Office wear formal chino trousers',
          'prd_07': 'Banarasi silk saree with gold embroidery work',
          'prd_08': 'Traditional printed cotton kurti for office or home wear'
        };
        const quantityMap = {
          'prd_01': '1 piece', 'prd_02': '1 piece', 'prd_03': '1 piece', 'prd_04': '1 piece',
          'prd_05': '1 piece', 'prd_06': '1 piece', 'prd_07': '1 piece', 'prd_08': '1 piece'
        };
        const mrpMap = {
          'prd_01': 999, 'prd_02': 999, 'prd_03': 1999, 'prd_04': 1999,
          'prd_05': 599, 'prd_06': 1499, 'prd_07': 2999, 'prd_08': 899
        };
        const discountMap = {
          'prd_01': 10, 'prd_02': 10, 'prd_03': 20, 'prd_04': 20,
          'prd_05': 16, 'prd_06': 13, 'prd_07': 16, 'prd_08': 11
        };

        const updated = storedProds.map(p => {
          if (imageMap[p.id]) {
            return {
              ...p,
              image: imageMap[p.id],
              description: descriptionMap[p.id] || p.description,
              quantity: quantityMap[p.id] || p.quantity || '1 piece',
              mrp: mrpMap[p.id] || p.mrp || p.sellingPrice,
              discount: discountMap[p.id] !== undefined ? discountMap[p.id] : (p.discount || 0)
            };
          }
          return p;
        });
        localStorage.setItem('rms_products', JSON.stringify(updated));
        localStorage.setItem('rms_mig_suitable_images_v2', 'true');
      }
    } catch (e) {
      console.error('Migration failed', e);
    }

    // Migration patch for categories to seed comprehensive readymade list
    try {
      const storedCats = JSON.parse(localStorage.getItem('rms_categories') || '[]');
      if (storedCats.length < 25) {
        const newCats = [
          'Shirts', 'T-Shirts', 'Jeans', 'Trousers', 'Sarees', 'Kurtis', 
          'Salwar Kameez', 'Salwar Materials', 'Lehengas', 'Kids Wear', 
          'Frocks & Gowns', 'Skirts & Tops', 'Leggings & Jeggings', 'Nightwear', 
          'Innerwear', 'Ethnic Wear', 'Sherwanis', 'Coats & Blazers', 
          'Tracks & Joggers', 'Shorts & 3/4ths', 'Dhotis', 'Lungi', 
          'Dupattas & Shawls', 'Socks & Handkerchiefs', 'Western Wear', 'General'
        ];
        localStorage.setItem('rms_categories', JSON.stringify(newCats));
      }
    } catch (e) {
      console.error('Category migration failed', e);
    }

    // Migration patch for multi-day sample sales records
    try {
      if (!localStorage.getItem('rms_mig_sales_reports_v1')) {
        const storedSales = JSON.parse(localStorage.getItem('rms_sales') || '[]');
        if (storedSales.length <= 1) {
          const nowUtc = Date.now();
          const oneDayMs = 86400000;
          const multiDaySales = [
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
          localStorage.setItem('rms_sales', JSON.stringify(multiDaySales));
        }
        localStorage.setItem('rms_mig_sales_reports_v1', 'true');
      }
    } catch (e) {
      console.error('Sales migration failed', e);
    }

    // Migration patch for purchases and initial stock tracking
    try {
      if (!localStorage.getItem('rms_mig_purchases_valuation_v1')) {
        const storedPurchases = JSON.parse(localStorage.getItem('rms_purchases') || '[]');
        if (storedPurchases.length === 0) {
          const samplePurchases = [
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
          localStorage.setItem('rms_purchases', JSON.stringify(samplePurchases));
        }

        const storedProds = JSON.parse(localStorage.getItem('rms_products') || '[]');
        let prodChanged = false;
        const updatedProds = storedProds.map(p => {
          if (p.initialStock === undefined) {
            prodChanged = true;
            return { ...p, initialStock: p.stockQuantity || 0 };
          }
          return p;
        });
        if (prodChanged) {
          localStorage.setItem('rms_products', JSON.stringify(updatedProds));
        }

        localStorage.setItem('rms_mig_purchases_valuation_v1', 'true');
      }
    } catch (e) {
    // Seed sample damaged goods and returns if needed
    if (!localStorage.getItem('rms_damaged_products')) {
      const sampleDamage = [
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
      localStorage.setItem('rms_damaged_products', JSON.stringify(sampleDamage));
    }

    if (!localStorage.getItem('rms_customer_returns')) {
      const sampleCustReturns = [
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
      localStorage.setItem('rms_customer_returns', JSON.stringify(sampleCustReturns));
    }

    if (!localStorage.getItem('rms_supplier_returns')) {
      const sampleSuppReturns = [
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
      localStorage.setItem('rms_supplier_returns', JSON.stringify(sampleSuppReturns));
    }

    // Always run stock synchronization
    this.syncProductStocksLocally();
  },

  syncProductStocksLocally() {
    try {
      const storedProds = JSON.parse(localStorage.getItem('rms_products') || '[]');
      const storedPurchases = JSON.parse(localStorage.getItem('rms_purchases') || '[]');
      const storedSales = JSON.parse(localStorage.getItem('rms_sales') || '[]');
      const storedDamage = JSON.parse(localStorage.getItem('rms_damaged_products') || '[]');
      const storedCustReturns = JSON.parse(localStorage.getItem('rms_customer_returns') || '[]');

      const updated = storedProds.map(p => {
        const initStock = p.initialStock !== undefined ? Number(p.initialStock) : (Number(p.stockQuantity) || 0);
        const inwardQty = storedPurchases.filter(pch => pch.productId === p.id).reduce((acc, pch) => acc + (Number(pch.quantity) || 0), 0);
        const soldQty = storedSales.reduce((acc, s) => {
          const itemSum = (s.items || []).filter(i => i.productId === p.id).reduce((iAcc, i) => iAcc + (Number(i.quantity) || 0), 0);
          return acc + itemSum;
        }, 0);
        const damagedQty = storedDamage.filter(d => d.productId === p.id && d.damageSource !== 'CUSTOMER_RETURN').reduce((acc, d) => acc + (Number(d.quantity) || 0), 0);
        const restockedQty = storedCustReturns.filter(c => c.productId === p.id && c.itemCondition === 'GOOD_CONDITION_RESTOCK').reduce((acc, c) => acc + (Number(c.quantity) || 0), 0);
        const available = Math.max(0, initStock + inwardQty - soldQty - damagedQty + restockedQty);
        return {
          ...p,
          initialStock: initStock,
          stockQuantity: available
        };
      });
      localStorage.setItem('rms_products', JSON.stringify(updated));
      return updated;
    } catch (e) {
      return JSON.parse(localStorage.getItem('rms_products') || '[]');
    }
  },

  // ----------------------------------------------------
  // AUTHENTICATION
  // ----------------------------------------------------
  async login(username, password, requestedRole) {
    try {
      const data = await this.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, requestedRole })
      });
      SecurityEngine.saveSession(data.token, data.user);
      if (data.csrfToken) {
        localStorage.setItem('rms_csrf_token', data.csrfToken);
      }
      return data;
    } catch (err) {
      // Offline / Direct fallback
      await this.init();
      const users = JSON.parse(localStorage.getItem('rms_users') || '[]');
      const cleanUser = username.trim().toLowerCase();
      const user = users.find(u => u.username.toLowerCase() === cleanUser || (u.employeeId && u.employeeId.toLowerCase() === cleanUser));

      if (!user) throw new Error('Invalid username or password.');
      const testHash = await SecurityEngine.hashPassword(password, user.salt);
      if (testHash !== user.passwordHash) throw new Error('Invalid username or password.');

      if (user.status !== 'ACTIVE') throw new Error(`Your account is ${user.status}. Please contact administrator.`);
      if (requestedRole && user.role !== requestedRole) throw new Error('Invalid credentials for this login portal.');

      user.lastLoginAt = new Date().toISOString();
      localStorage.setItem('rms_users', JSON.stringify(users));

      const token = SecurityEngine.generateToken(user);
      SecurityEngine.saveSession(token, user);
      localStorage.setItem('rms_csrf_token', 'offline_csrf_token_12345');
      return { token, user };
    }
  },

  // ----------------------------------------------------
  // CASHIERS MANAGEMENT (ADMIN)
  // ----------------------------------------------------
  async getCashiers() {
    try {
      return await this.request('/admin/cashiers');
    } catch {
      const users = JSON.parse(localStorage.getItem('rms_users') || '[]');
      return users.filter(u => u.role === 'CASHIER' && u.status !== 'DELETED');
    }
  },

  async updateCashier(token, id, cashierData) {
    try {
      return await this.request(`/admin/cashiers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(cashierData)
      });
    } catch (err) {
      const users = JSON.parse(localStorage.getItem('rms_users') || '[]');
      const c = users.find(u => u.id === id);
      if (c) {
        if (cashierData.fullName) c.fullName = cashierData.fullName.trim();
        if (cashierData.mobile !== undefined) c.mobile = cashierData.mobile.trim();
        if (cashierData.email !== undefined) c.email = cashierData.email.trim();
        localStorage.setItem('rms_users', JSON.stringify(users));
      }
      return { success: true, cashier: c };
    }
  },

  async deleteCashier(token, id) {
    try {
      return await this.request(`/admin/cashiers/${id}`, { method: 'DELETE' });
    } catch (err) {
      const users = JSON.parse(localStorage.getItem('rms_users') || '[]');
      const c = users.find(u => u.id === id);
      if (c) {
        c.status = 'DELETED';
        localStorage.setItem('rms_users', JSON.stringify(users));
      }
      return { success: true, message: 'Cashier deleted successfully.' };
    }
  },

  async registerCashier(token, cashierData) {
    try {
      return await this.request('/admin/cashiers', {
        method: 'POST',
        body: JSON.stringify(cashierData)
      });
    } catch (err) {
      if (err.message.includes('403') || err.message.includes('401')) throw err;
      // Fallback
      const users = JSON.parse(localStorage.getItem('rms_users') || '[]');
      const salt = 'csh_salt_' + Date.now();
      const hash = await SecurityEngine.hashPassword(cashierData.password, salt);
      const newCashier = {
        id: 'usr_csh_' + Date.now(),
        username: cashierData.username.trim().toLowerCase(),
        passwordHash: hash,
        salt,
        fullName: cashierData.fullName.trim(),
        employeeId: cashierData.employeeId.trim().toUpperCase(),
        mobile: (cashierData.mobile || '').trim(),
        email: (cashierData.email || '').trim(),
        role: 'CASHIER',
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        lastLoginAt: null
      };
      users.push(newCashier);
      localStorage.setItem('rms_users', JSON.stringify(users));
      return newCashier;
    }
  },

  async updateCashierStatus(token, id, status) {
    try {
      return await this.request(`/admin/cashiers/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
    } catch {
      const users = JSON.parse(localStorage.getItem('rms_users') || '[]');
      const c = users.find(u => u.id === id);
      if (c) c.status = status;
      localStorage.setItem('rms_users', JSON.stringify(users));
      return { success: true };
    }
  },

  async resetCashierPassword(token, id, newPassword) {
    try {
      return await this.request(`/admin/cashiers/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword })
      });
    } catch {
      const users = JSON.parse(localStorage.getItem('rms_users') || '[]');
      const c = users.find(u => u.id === id);
      if (c) {
        c.salt = 'csh_salt_' + Date.now();
        c.passwordHash = await SecurityEngine.hashPassword(newPassword, c.salt);
        localStorage.setItem('rms_users', JSON.stringify(users));
      }
      return { success: true };
    }
  },

  async getCashierActivity(token, id) {
    try {
      return await this.request(`/admin/cashiers/${id}/activity`);
    } catch {
      const sales = JSON.parse(localStorage.getItem('rms_sales') || '[]').filter(s => s.cashierId === id);
      return { totalSalesCount: sales.length, sales };
    }
  },

  // ----------------------------------------------------
  // PRODUCTS & CATEGORIES
  // ----------------------------------------------------
  async getProducts() {
    // One-time cleanup of old "crop tshirt"
    if (!localStorage.getItem('rms_mig_crop_deleted_v1')) {
      try {
        const stored = JSON.parse(localStorage.getItem('rms_products') || '[]');
        const updated = stored.filter(p => !p.name.toLowerCase().includes('crop t-shirt') && !p.name.toLowerCase().includes('crop tshirt'));
        localStorage.setItem('rms_products', JSON.stringify(updated));
        localStorage.setItem('rms_mig_crop_deleted_v1', 'true');
      } catch (e) {}
    }

    try {
      return await this.request('/products');
    } catch {
      return this.syncProductStocksLocally();
    }
  },

  async createProduct(token, productData) {
    try {
      return await this.request('/admin/products', {
        method: 'POST',
        body: JSON.stringify(productData)
      });
    } catch (err) {
      const products = JSON.parse(localStorage.getItem('rms_products') || '[]');
      const finalId = (productData.productId || productData.id || 'prd_' + Date.now()).trim();
      const newP = {
        id: finalId,
        name: (productData.name || '').trim(),
        description: (productData.description || '').trim(),
        image: (productData.image || 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=150').trim(),
        stockQuantity: Number(productData.stock !== undefined ? productData.stock : productData.stockQuantity) || 0,
        quantity: (productData.quantity || '1 Piece').trim(),
        sellingPrice: Number(productData.sellingPrice) || 0,
        mrp: Number(productData.mrp || productData.sellingPrice) || 0,
        discount: Number(productData.discount) || 0,
        taxRate: Number(productData.gst !== undefined ? productData.gst : productData.taxRate) || 5,
        barcode: (productData.barcode || (window.BarcodeEngine ? BarcodeEngine.generateUniqueBarcode(products) : '890' + Math.floor(100000 + Math.random() * 900000))).trim(),
        sku: (productData.sku || 'SKU-' + (productData.barcode ? productData.barcode.slice(-6) : Date.now().toString().slice(-6))).trim().toUpperCase(),
        category: (productData.category || 'General').trim(),
        size: (productData.size || 'Free Size').trim(),
        color: (productData.color || 'Neutral').trim(),
        purchasePrice: Number(productData.purchasePrice) || Number(productData.sellingPrice) * 0.6,
        initialStock: Number(productData.stock !== undefined ? productData.stock : productData.stockQuantity) || 0,
        reorderLevel: Number(productData.reorderLevel) || 5,
        isActive: true
      };
      products.unshift(newP);
      localStorage.setItem('rms_products', JSON.stringify(products));
      return newP;
    }
  },

  async updateProduct(token, id, productData) {
    try {
      return await this.request(`/admin/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(productData)
      });
    } catch {
      const products = JSON.parse(localStorage.getItem('rms_products') || '[]');
      const p = products.find(prod => prod.id === id);
      if (p) {
        if (productData.name !== undefined) p.name = productData.name;
        if (productData.description !== undefined) p.description = productData.description;
        if (productData.image !== undefined) p.image = productData.image;
        if (productData.stockQuantity !== undefined) p.stockQuantity = Number(productData.stockQuantity);
        if (productData.quantity !== undefined) p.quantity = productData.quantity;
        if (productData.sellingPrice !== undefined) p.sellingPrice = Number(productData.sellingPrice);
        if (productData.mrp !== undefined) p.mrp = Number(productData.mrp);
        if (productData.discount !== undefined) p.discount = Number(productData.discount);
        if (productData.gst !== undefined) p.taxRate = Number(productData.gst);
        if (productData.taxRate !== undefined) p.taxRate = Number(productData.taxRate);
        if (productData.category !== undefined) p.category = productData.category;
        if (productData.size !== undefined) p.size = productData.size;
        if (productData.color !== undefined) p.color = productData.color;
        if (productData.purchasePrice !== undefined) p.purchasePrice = Number(productData.purchasePrice);
        if (productData.isActive !== undefined) p.isActive = Boolean(productData.isActive);
      }
      localStorage.setItem('rms_products', JSON.stringify(products));
      return p;
    }
  },

  async deleteProduct(token, id) {
    try {
      return await this.request(`/admin/products/${id}`, { method: 'DELETE' });
    } catch {
      const products = JSON.parse(localStorage.getItem('rms_products') || '[]');
      const p = products.find(prod => prod.id === id);
      if (p) p.isActive = false;
      localStorage.setItem('rms_products', JSON.stringify(products));
      return { success: true };
    }
  },

  async getCategories() {
    try {
      return await this.request('/categories');
    } catch {
      return JSON.parse(localStorage.getItem('rms_categories') || '[]');
    }
  },

  async createCategory(token, name) {
    try {
      return await this.request('/admin/categories', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
    } catch (err) {
      const categories = JSON.parse(localStorage.getItem('rms_categories') || '[]');
      const cleanName = name.trim();
      if (categories.includes(cleanName)) {
        throw new Error(`Category "${cleanName}" already exists.`);
      }
      categories.push(cleanName);
      localStorage.setItem('rms_categories', JSON.stringify(categories));
      return { name: cleanName };
    }
  },

  async deleteCategory(token, name) {
    try {
      return await this.request(`/admin/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
    } catch (err) {
      let categories = JSON.parse(localStorage.getItem('rms_categories') || '[]');
      const products = JSON.parse(localStorage.getItem('rms_products') || '[]');
      if (products.some(p => p.category === name && p.isActive)) {
        throw new Error('Cannot delete category as it is currently assigned to active products.');
      }
      categories = categories.filter(c => c !== name);
      localStorage.setItem('rms_categories', JSON.stringify(categories));
      return { success: true };
    }
  },

  // ----------------------------------------------------
  // INVENTORY ADJUSTMENTS (ADMIN)
  // ----------------------------------------------------
  async adjustStock(token, adjustmentData) {
    try {
      return await this.request('/admin/inventory/adjust', {
        method: 'POST',
        body: JSON.stringify(adjustmentData)
      });
    } catch {
      const products = JSON.parse(localStorage.getItem('rms_products') || '[]');
      const p = products.find(prod => prod.id === adjustmentData.productId);
      if (p) {
        if (adjustmentData.type === 'STOCK_IN' || adjustmentData.type === 'RETURN') p.stockQuantity += Number(adjustmentData.quantity);
        else if (adjustmentData.type === 'STOCK_OUT') p.stockQuantity -= Number(adjustmentData.quantity);
        else if (adjustmentData.type === 'ADJUSTMENT') p.stockQuantity = Number(adjustmentData.quantity);
        localStorage.setItem('rms_products', JSON.stringify(products));
      }
      return { success: true, product: p };
    }
  },

  async getInventoryHistory(token) {
    try {
      return await this.request('/admin/inventory/history');
    } catch {
      return JSON.parse(localStorage.getItem('rms_inventory_movements') || '[]');
    }
  },

  async getPurchases(token) {
    try {
      return await this.request('/admin/inventory/purchases');
    } catch {
      return JSON.parse(localStorage.getItem('rms_purchases') || '[]');
    }
  },

  async addPurchase(token, purchaseData) {
    try {
      return await this.request('/admin/inventory/purchases', {
        method: 'POST',
        body: JSON.stringify(purchaseData)
      });
    } catch (err) {
      const products = JSON.parse(localStorage.getItem('rms_products') || '[]');
      const purchases = JSON.parse(localStorage.getItem('rms_purchases') || '[]');
      const movements = JSON.parse(localStorage.getItem('rms_inventory_movements') || '[]');
      const user = SecurityEngine.getCurrentUser() || { username: 'admin' };

      const prod = products.find(p => p.id === purchaseData.productId);
      if (!prod) throw new Error('Product not found.');

      const qty = parseInt(purchaseData.quantity, 10);
      const price = parseFloat(purchaseData.purchasePrice);
      if (isNaN(qty) || qty <= 0 || isNaN(price) || price <= 0) {
        throw new Error('Quantity and Purchase Price must be positive numbers.');
      }

      const prevStock = prod.stockQuantity || 0;
      prod.stockQuantity = prevStock + qty;
      prod.purchasePrice = price;

      const totalAmt = Number((qty * price).toFixed(2));
      const purchaseRecord = {
        id: 'pch_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        productId: prod.id,
        productName: `${prod.name} (${prod.size || 'Std'}, ${prod.color || 'Std'})`,
        sku: prod.sku || '',
        supplierName: (purchaseData.supplierName || '').trim(),
        supplierMobile: (purchaseData.supplierMobile || '').trim(),
        invoiceNo: (purchaseData.invoiceNo || '').trim(),
        quantity: qty,
        purchasePrice: price,
        totalAmount: totalAmt,
        paymentStatus: purchaseData.paymentStatus || 'PAID',
        purchaseDate: purchaseData.purchaseDate || new Date().toISOString().split('T')[0],
        notes: (purchaseData.notes || `Stock Purchase from ${purchaseData.supplierName}`).trim(),
        receivedBy: user.username,
        createdAt: new Date().toISOString()
      };

      purchases.unshift(purchaseRecord);

      const movement = {
        id: 'inv_m_' + Date.now(),
        productId: prod.id,
        productName: purchaseRecord.productName,
        type: 'STOCK_IN',
        quantity: qty,
        previousStock: prevStock,
        newStock: prod.stockQuantity,
        reason: `Supplier Purchase: ${purchaseData.supplierName} (Bill #${purchaseData.invoiceNo})`,
        timestamp: new Date().toISOString(),
        actor: user.username
      };
      movements.unshift(movement);

      localStorage.setItem('rms_products', JSON.stringify(products));
      localStorage.setItem('rms_purchases', JSON.stringify(purchases));
      localStorage.setItem('rms_inventory_movements', JSON.stringify(movements));

      return {
        success: true,
        purchase: purchaseRecord,
        product: prod,
        movementRecord: movement
      };
    }
  },

  async getStockValuation(token) {
    try {
      return await this.request('/admin/inventory/valuation');
    } catch {
      const products = JSON.parse(localStorage.getItem('rms_products') || '[]');
      const purchases = JSON.parse(localStorage.getItem('rms_purchases') || '[]');
      const sales = JSON.parse(localStorage.getItem('rms_sales') || '[]');

      const valList = products.map(p => {
        const pId = p.id;
        const initStock = p.initialStock !== undefined ? p.initialStock : (p.stockQuantity || 0);
        const inwardQty = purchases.filter(pch => pch.productId === pId).reduce((acc, pch) => acc + (pch.quantity || 0), 0);
        const soldQty = sales.reduce((acc, s) => {
          const itemSum = (s.items || []).filter(i => i.productId === pId).reduce((iAcc, i) => iAcc + (i.quantity || 0), 0);
          return acc + itemSum;
        }, 0);
        const currStock = Math.max(0, initStock + inwardQty - soldQty);
        p.stockQuantity = currStock;
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

      return { summary, items: valList };
    }
  },

  // ----------------------------------------------------
  // DAMAGED GOODS, CUSTOMER RETURNS & SUPPLIER RETURNS (RTV)
  // ----------------------------------------------------
  async getDamagedAndReturns(token) {
    try {
      return await this.request('/admin/inventory/damaged-returns');
    } catch {
      this.syncProductStocksLocally();
      const damagedProducts = JSON.parse(localStorage.getItem('rms_damaged_products') || '[]');
      const customerReturns = JSON.parse(localStorage.getItem('rms_customer_returns') || '[]');
      const supplierReturns = JSON.parse(localStorage.getItem('rms_supplier_returns') || '[]');

      const totDamagedUnits = damagedProducts.reduce((acc, d) => acc + (Number(d.quantity) || 0), 0);
      const totDamageLoss = Number(damagedProducts.reduce((acc, d) => acc + (Number(d.lossAmount) || 0), 0).toFixed(2));
      const totCustReturns = customerReturns.length;
      const totCustRefund = Number(customerReturns.reduce((acc, c) => acc + (Number(c.refundAmount) || 0), 0).toFixed(2));
      const totSuppReturns = supplierReturns.length;
      const totSuppClaim = Number(supplierReturns.reduce((acc, r) => acc + (Number(r.totalReturnAmount) || 0), 0).toFixed(2));
      const totSuppRecovered = Number(supplierReturns.reduce((acc, r) => acc + (Number(r.recoveredAmount) || 0), 0).toFixed(2));
      const netUnrecoveredLoss = Number(Math.max(0, totDamageLoss - totSuppRecovered).toFixed(2));

      return {
        summary: {
          totalDamagedUnits: totDamagedUnits,
          totalDamageLossAmount: totDamageLoss,
          totalCustomerReturns: totCustReturns,
          totalCustomerRefundAmount: totCustRefund,
          totalSupplierReturnsCount: totSuppReturns,
          totalSupplierReturnClaimed: totSuppClaim,
          totalSupplierRecoveredAmount: totSuppRecovered,
          netUnrecoveredLoss: netUnrecoveredLoss
        },
        damagedProducts,
        customerReturns,
        supplierReturns
      };
    }
  },

  async recordDamagedProduct(token, data) {
    try {
      return await this.request('/admin/inventory/damage', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    } catch (err) {
      const products = JSON.parse(localStorage.getItem('rms_products') || '[]');
      const damaged = JSON.parse(localStorage.getItem('rms_damaged_products') || '[]');
      const purchases = JSON.parse(localStorage.getItem('rms_purchases') || '[]');
      const movements = JSON.parse(localStorage.getItem('rms_inventory_movements') || '[]');
      const user = SecurityEngine.getCurrentUser() || { username: 'admin' };

      const prod = products.find(p => p.id === data.productId);
      if (!prod) throw new Error('Product not found.');

      const qty = parseInt(data.quantity, 10);
      if (isNaN(qty) || qty <= 0) throw new Error('Quantity must be greater than zero.');

      let finalSupplier = (data.supplierName || '').trim();
      if (!finalSupplier) {
        const matchedPch = purchases.find(pch => pch.productId === data.productId);
        if (matchedPch) finalSupplier = matchedPch.supplierName;
      }

      const purchPrice = Number(prod.purchasePrice) || 0;
      const sellPrice = Number(prod.sellingPrice) || 0;
      const lossAmt = Number((qty * purchPrice).toFixed(2));
      const potSalesLoss = Number((qty * sellPrice).toFixed(2));

      const damageRecord = {
        id: 'dmg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        productId: prod.id,
        productName: `${prod.name} (${prod.size || 'Std'}, ${prod.color || 'Std'})`,
        sku: prod.sku || '',
        barcode: prod.barcode || '',
        category: prod.category || 'General',
        size: prod.size || 'Std',
        color: prod.color || 'Std',
        quantity: qty,
        purchasePrice: purchPrice,
        sellingPrice: sellPrice,
        lossAmount: lossAmt,
        potentialSalesLoss: potSalesLoss,
        damageReason: (data.damageReason || 'FABRIC_TORN').trim(),
        damageSource: (data.damageSource || 'SHOP_FLOOR_FOUND').trim(),
        supplierName: finalSupplier,
        status: 'PENDING_ACTION',
        notes: (data.notes || '').trim(),
        recordedBy: user.username,
        createdAt: new Date().toISOString()
      };

      damaged.unshift(damageRecord);

      if (damageRecord.damageSource !== 'CUSTOMER_RETURN') {
        const prevStock = prod.stockQuantity || 0;
        prod.stockQuantity = Math.max(0, prevStock - qty);
        movements.unshift({
          id: 'inv_m_' + Date.now(),
          productId: prod.id,
          productName: damageRecord.productName,
          type: 'STOCK_OUT',
          quantity: qty,
          previousStock: prevStock,
          newStock: prod.stockQuantity,
          reason: `Damaged Garment: ${damageRecord.damageReason} (${damageRecord.notes || 'Defect'})`,
          timestamp: new Date().toISOString(),
          actor: user.username
        });
      }

      localStorage.setItem('rms_products', JSON.stringify(products));
      localStorage.setItem('rms_damaged_products', JSON.stringify(damaged));
      localStorage.setItem('rms_inventory_movements', JSON.stringify(movements));
      this.syncProductStocksLocally();

      return { success: true, damagedProduct: damageRecord, product: prod };
    }
  },

  async recordCustomerReturn(token, data) {
    try {
      return await this.request('/admin/inventory/customer-returns', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    } catch (err) {
      const products = JSON.parse(localStorage.getItem('rms_products') || '[]');
      const returns = JSON.parse(localStorage.getItem('rms_customer_returns') || '[]');
      const damaged = JSON.parse(localStorage.getItem('rms_damaged_products') || '[]');
      const movements = JSON.parse(localStorage.getItem('rms_inventory_movements') || '[]');
      const user = SecurityEngine.getCurrentUser() || { username: 'admin' };

      const prod = products.find(p => p.id === data.productId);
      if (!prod) throw new Error('Product not found.');

      const qty = parseInt(data.quantity, 10);
      if (isNaN(qty) || qty <= 0) throw new Error('Quantity must be greater than zero.');

      const refAmt = data.refundAmount !== undefined ? Number(data.refundAmount) : Number((Number(prod.sellingPrice || 0) * qty).toFixed(2));

      const returnRecord = {
        id: 'crt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        invoiceNo: (data.invoiceNo || 'N/A').trim(),
        productId: prod.id,
        productName: `${prod.name} (${prod.size || 'Std'}, ${prod.color || 'Std'})`,
        sku: prod.sku || '',
        quantity: qty,
        refundAmount: refAmt,
        itemCondition: data.itemCondition || 'GOOD_CONDITION_RESTOCK',
        refundMethod: data.refundMethod || 'CASH',
        customerName: (data.customerName || 'Customer').trim(),
        customerMobile: (data.customerMobile || '').trim(),
        returnReason: (data.returnReason || 'Customer Return').trim(),
        recordedBy: user.username,
        createdAt: new Date().toISOString()
      };

      returns.unshift(returnRecord);

      if (returnRecord.itemCondition === 'GOOD_CONDITION_RESTOCK') {
        const prevStock = prod.stockQuantity || 0;
        prod.stockQuantity = prevStock + qty;
        movements.unshift({
          id: 'inv_m_' + Date.now(),
          productId: prod.id,
          productName: returnRecord.productName,
          type: 'RETURN',
          quantity: qty,
          previousStock: prevStock,
          newStock: prod.stockQuantity,
          reason: `Customer Return Restocked: Bill #${returnRecord.invoiceNo} (${returnRecord.returnReason})`,
          timestamp: new Date().toISOString(),
          actor: user.username
        });
      } else {
        const purchPrice = Number(prod.purchasePrice) || 0;
        damaged.unshift({
          id: 'dmg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          productId: prod.id,
          productName: returnRecord.productName,
          sku: prod.sku || '',
          barcode: prod.barcode || '',
          category: prod.category || 'General',
          size: prod.size || 'Std',
          color: prod.color || 'Std',
          quantity: qty,
          purchasePrice: purchPrice,
          sellingPrice: Number(prod.sellingPrice) || 0,
          lossAmount: Number((qty * purchPrice).toFixed(2)),
          potentialSalesLoss: Number((qty * Number(prod.sellingPrice)).toFixed(2)),
          damageReason: `Customer Return Defective: ${returnRecord.returnReason}`,
          damageSource: 'CUSTOMER_RETURN',
          supplierName: '',
          status: 'PENDING_ACTION',
          notes: `Returned by ${returnRecord.customerName} under invoice ${returnRecord.invoiceNo}`,
          recordedBy: user.username,
          createdAt: new Date().toISOString()
        });
      }

      localStorage.setItem('rms_products', JSON.stringify(products));
      localStorage.setItem('rms_customer_returns', JSON.stringify(returns));
      localStorage.setItem('rms_damaged_products', JSON.stringify(damaged));
      localStorage.setItem('rms_inventory_movements', JSON.stringify(movements));
      this.syncProductStocksLocally();

      return { success: true, customerReturn: returnRecord, product: prod };
    }
  },

  async createSupplierReturn(token, data) {
    try {
      return await this.request('/admin/inventory/supplier-returns', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    } catch (err) {
      const products = JSON.parse(localStorage.getItem('rms_products') || '[]');
      const damaged = JSON.parse(localStorage.getItem('rms_damaged_products') || '[]');
      const supplierReturns = JSON.parse(localStorage.getItem('rms_supplier_returns') || '[]');
      const user = SecurityEngine.getCurrentUser() || { username: 'admin' };

      const items = data.items || [];
      if (!data.supplierName || items.length === 0) throw new Error('Supplier name and items are required.');

      let totalReturnAmount = 0;
      const verifiedItems = [];

      for (const it of items) {
        const prod = products.find(p => p.id === it.productId);
        if (!prod) continue;

        const itQty = parseInt(it.quantity, 10) || 1;
        const itPrice = parseFloat(it.purchasePrice !== undefined ? it.purchasePrice : prod.purchasePrice) || 0;
        const claimAmt = Number((itQty * itPrice).toFixed(2));
        totalReturnAmount += claimAmt;

        if (it.damageId) {
          const dmgRec = damaged.find(d => d.id === it.damageId);
          if (dmgRec) {
            dmgRec.status = 'RETURNED_TO_SUPPLIER';
            dmgRec.supplierName = data.supplierName.trim();
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
          reason: it.reason || data.returnReason || 'MANUFACTURING_DEFECT'
        });
      }

      const rtvRecord = {
        id: 'rtv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        supplierName: (data.supplierName || '').trim(),
        supplierMobile: (data.supplierMobile || '').trim(),
        originalInvoiceNo: (data.originalInvoiceNo || '').trim(),
        items: verifiedItems,
        totalReturnAmount: Number(totalReturnAmount.toFixed(2)),
        returnReason: (data.returnReason || 'MANUFACTURING_DEFECT').trim(),
        courierName: (data.courierName || '').trim(),
        trackingNo: (data.trackingNo || '').trim(),
        dispatchDate: data.dispatchDate || new Date().toISOString(),
        status: 'RETURN_DISPATCHED',
        recoveredAmount: 0,
        resolutionNotes: (data.notes || '').trim() || `Returned to ${data.supplierName} via ${data.courierName || 'Direct Parcel'}`,
        resolvedDate: null,
        recordedBy: user.username,
        createdAt: new Date().toISOString()
      };

      supplierReturns.unshift(rtvRecord);
      localStorage.setItem('rms_damaged_products', JSON.stringify(damaged));
      localStorage.setItem('rms_supplier_returns', JSON.stringify(supplierReturns));
      this.syncProductStocksLocally();

      return { success: true, supplierReturn: rtvRecord };
    }
  },

  async updateSupplierReturnStatus(token, id, statusData) {
    try {
      return await this.request(`/admin/inventory/supplier-returns/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(statusData)
      });
    } catch (err) {
      const supplierReturns = JSON.parse(localStorage.getItem('rms_supplier_returns') || '[]');
      const rtv = supplierReturns.find(r => r.id === id);
      if (!rtv) throw new Error('Supplier return not found.');

      if (statusData.status) rtv.status = statusData.status;
      if (statusData.recoveredAmount !== undefined) rtv.recoveredAmount = Number(parseFloat(statusData.recoveredAmount).toFixed(2)) || 0;
      if (statusData.resolutionNotes) rtv.resolutionNotes = statusData.resolutionNotes.trim();
      rtv.resolvedDate = new Date().toISOString();

      localStorage.setItem('rms_supplier_returns', JSON.stringify(supplierReturns));
      return { success: true, supplierReturn: rtv };
    }
  },

  // ----------------------------------------------------
  // CUSTOMERS & EXPENSES
  // ----------------------------------------------------
  async getCustomers(token) {
    try {
      return await this.request('/admin/customers');
    } catch {
      return JSON.parse(localStorage.getItem('rms_customers') || '[]');
    }
  },

  async createCustomer(token, customerData) {
    return await this.request('/admin/customers', {
      method: 'POST',
      body: JSON.stringify(customerData)
    });
  },

  async getExpenses(token) {
    try {
      return await this.request('/admin/expenses');
    } catch {
      return JSON.parse(localStorage.getItem('rms_expenses') || '[]');
    }
  },

  async createExpense(token, expenseData) {
    try {
      return await this.request('/admin/expenses', {
        method: 'POST',
        body: JSON.stringify(expenseData)
      });
    } catch {
      const exps = JSON.parse(localStorage.getItem('rms_expenses') || '[]');
      const newE = { id: 'exp_' + Date.now(), ...expenseData, recordedBy: 'Admin' };
      exps.unshift(newE);
      localStorage.setItem('rms_expenses', JSON.stringify(exps));
      return newE;
    }
  },

  // ----------------------------------------------------
  // SALES & POS BILLING (ATOMIC)
  // ----------------------------------------------------
  async createSale(token, items, discountPercent, paymentMethod, customerName, customerMobile) {
    try {
      return await this.request('/cashier/sales', {
        method: 'POST',
        body: JSON.stringify({ items, discountPercent, paymentMethod, customerName, customerMobile })
      });
    } catch (err) {
      if (err.message.includes('403') || err.message.includes('401')) throw err;
      // Fallback
      const products = JSON.parse(localStorage.getItem('rms_products') || '[]');
      const sales = JSON.parse(localStorage.getItem('rms_sales') || '[]');
      const user = SecurityEngine.getCurrentUser() || { id: 'usr_csh', username: 'cashier' };

      let subtotal = 0;
      let tax = 0;
      const verified = [];

      for (const item of items) {
        const p = products.find(prod => prod.id === item.productId);
        if (!p || !p.isActive) throw new Error('Product is unavailable.');
        if (p.stockQuantity < item.quantity) throw new Error(`Insufficient stock for "${p.name}".`);

        const sub = p.sellingPrice * item.quantity;
        const tx = (sub * (p.taxRate || 0)) / 100;
        verified.push({
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          size: p.size,
          color: p.color,
          unitPrice: p.sellingPrice,
          quantity: item.quantity,
          subtotal: sub,
          taxAmount: tx,
          total: sub + tx
        });
        subtotal += sub;
        tax += tx;
        p.stockQuantity -= item.quantity;
      }

      const disc = Math.min(Math.max(Number(discountPercent) || 0, 0), 20);
      const discAmt = (subtotal * disc) / 100;
      const total = Math.max(0, subtotal - discAmt + tax);

      const sale = {
        id: 'sal_' + Date.now(),
        invoiceNo: 'INV-' + Date.now().toString().slice(-6),
        cashierId: user.id,
        cashierName: user.username,
        customerName: customerName || 'Walk-in Customer',
        customerMobile: customerMobile || '',
        items: verified,
        subtotal,
        discountPercent: disc,
        discountAmount: discAmt,
        taxAmount: tax,
        totalAmount: total,
        paymentMethod,
        paymentStatus: 'PAID',
        createdAt: new Date().toISOString()
      };

      sales.unshift(sale);
      localStorage.setItem('rms_products', JSON.stringify(products));
      localStorage.setItem('rms_sales', JSON.stringify(sales));
      return sale;
    }
  },

  async getSales(token) {
    try {
      return await this.request('/admin/sales');
    } catch {
      return JSON.parse(localStorage.getItem('rms_sales') || '[]');
    }
  },

  async getMySales(token) {
    try {
      return await this.request('/cashier/my-sales');
    } catch {
      const user = SecurityEngine.getCurrentUser();
      const sales = JSON.parse(localStorage.getItem('rms_sales') || '[]');
      return user ? sales.filter(s => s.cashierId === user.id) : sales;
    }
  },

  async getReportsSummary(token) {
    try {
      return await this.request('/admin/reports/summary');
    } catch {
      const sales = JSON.parse(localStorage.getItem('rms_sales') || '[]');
      const products = JSON.parse(localStorage.getItem('rms_products') || '[]');
      const expenses = JSON.parse(localStorage.getItem('rms_expenses') || '[]');
      const users = JSON.parse(localStorage.getItem('rms_users') || '[]');

      const totalRevenue = sales.reduce((a, s) => a + s.totalAmount, 0);
      const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);

      const paymentBreakdown = { CASH: 0, UPI: 0, CARD: 0 };
      sales.forEach(s => {
        if (paymentBreakdown[s.paymentMethod] !== undefined) paymentBreakdown[s.paymentMethod] += s.totalAmount;
      });

      return {
        totalRevenue,
        totalBills: sales.length,
        totalStock: products.reduce((a, p) => a + (p.stockQuantity || 0), 0),
        lowStockCount: products.filter(p => p.isActive && p.stockQuantity <= (p.reorderLevel || 5)).length,
        activeCashiers: users.filter(u => u.role === 'CASHIER' && u.status === 'ACTIVE').length,
        totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        paymentBreakdown,
        recentSales: sales.slice(0, 10)
      };
    }
  },

  async getAuditLogs(token) {
    try {
      return await this.request('/admin/audit-logs');
    } catch {
      return JSON.parse(localStorage.getItem('rms_audit_logs') || '[]');
    }
  }
};

window.AppStore = AppStore;
