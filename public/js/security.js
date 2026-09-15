/**
 * Readymade Shop - Security & Cryptographic Engine
 * Enforces RBAC constraints, rate limiting, and inactivity auto-logout
 */

const SecurityEngine = {
  INACTIVITY_TIMEOUT_MS: 15 * 60 * 1000, // 15 minutes auto-logout
  inactivityTimer: null,
  inactivityWarningTimer: null,

  // Hash password using SHA-256 with user-specific salt
  async hashPassword(password, salt) {
    const enc = new TextEncoder();
    const data = enc.encode(password + '::' + (salt || 'RMS_SECURE_SALT_v1'));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  isStrongPassword(password) {
    if (!password || password.length < 8) return false;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    return hasUpper && hasLower && hasDigit && hasSpecial;
  },

  // Generate cryptographic session token
  generateToken(user) {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role, // 'ADMIN' or 'CASHIER'
      status: user.status,
      iat: Date.now(),
      exp: Date.now() + 8 * 3600 * 1000 // 8 hours validity
    };
    return btoa(JSON.stringify(payload)) + '.' + Math.random().toString(36).substring(2, 15);
  },

  // Parse and validate token (supports standard JWT header.payload.signature and 2-part tokens)
  verifyToken(token) {
    if (!token) return null;
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;

      // Standard JWT (header.payload.signature) -> payload is parts[1]
      // 2-part token (payload.random) -> payload is parts[0]
      const rawPayload = parts.length >= 3 ? parts[1] : parts[0];

      // Safe base64 / base64url decoding
      const base64 = rawPayload.replace(/-/g, '+').replace(/_/g, '/');
      const jsonStr = decodeURIComponent(atob(base64).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      const payload = JSON.parse(jsonStr);

      // Handle expiry: seconds vs milliseconds
      let expMs = payload.exp;
      if (expMs && expMs < 100000000000) {
        expMs = expMs * 1000; // Convert Unix timestamp in seconds to ms
      }

      if (expMs && expMs < Date.now()) {
        this.clearSession();
        return null;
      }
      return payload;
    } catch (e) {
      console.warn('verifyToken decode failed', e);
      return null;
    }
  },

  // Save session
  saveSession(token, user) {
    localStorage.setItem('rms_auth_token', token);
    const safeUser = {
      id: user.id,
      username: user.username,
      fullName: user.fullName || user.full_name,
      employeeId: user.employeeId || user.employee_id,
      role: user.role,
      status: user.status,
      mobile: user.mobile,
      email: user.email
    };
    localStorage.setItem('rms_user_profile', JSON.stringify(safeUser));
  },

  // Get current authenticated user
  getCurrentUser() {
    const token = localStorage.getItem('rms_auth_token');
    const tokenPayload = this.verifyToken(token);
    if (!tokenPayload) return null;
    try {
      const raw = localStorage.getItem('rms_user_profile');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clearSession() {
    localStorage.removeItem('rms_auth_token');
    localStorage.removeItem('rms_user_profile');
    localStorage.removeItem('rms_csrf_token');
  },

  // Rate Limiting on login attempts
  checkRateLimit(key = 'login_attempts') {
    const raw = localStorage.getItem('rms_ratelimit_' + key);
    const now = Date.now();
    let data = raw ? JSON.parse(raw) : { count: 0, lockUntil: 0 };

    if (data.lockUntil > now) {
      const remainingSecs = Math.ceil((data.lockUntil - now) / 1000);
      return { allowed: false, remainingSecs };
    }

    if (data.lastAttempt && now - data.lastAttempt > 60000) {
      data.count = 0;
    }

    return { allowed: true };
  },

  recordFailedAttempt(key = 'login_attempts') {
    const raw = localStorage.getItem('rms_ratelimit_' + key);
    const now = Date.now();
    let data = raw ? JSON.parse(raw) : { count: 0, lockUntil: 0 };

    data.count = (data.count || 0) + 1;
    data.lastAttempt = now;

    if (data.count >= 5) {
      data.lockUntil = now + 30000; // 30 sec lockout
    }

    localStorage.setItem('rms_ratelimit_' + key, JSON.stringify(data));
  },

  resetRateLimit(key = 'login_attempts') {
    localStorage.removeItem('rms_ratelimit_' + key);
  },

  // Universal path resolver for local files and web server
  resolvePath(target) {
    const isSub = window.location.pathname.includes('/admin/') || window.location.pathname.includes('\\admin\\') ||
                  window.location.pathname.includes('/cashier/') || window.location.pathname.includes('\\cashier\\');
    const cleanTarget = target.startsWith('/') ? target.slice(1) : target;
    
    if (window.location.protocol === 'file:') {
      return isSub ? '../' + cleanTarget : './' + cleanTarget;
    }
    return '/' + cleanTarget;
  },

  // Route Guard: Enforce strict page access
  guardPage(requiredRole) {
    const user = this.getCurrentUser();
    if (!user) {
      if (requiredRole === 'ADMIN') {
        window.location.href = this.resolvePath('admin-login.html');
      } else {
        window.location.href = this.resolvePath('cashier-login.html');
      }
      return false;
    }

    if (user.status !== 'ACTIVE') {
      alert('Your account is currently ' + user.status + '. Please contact the shop administrator.');
      this.clearSession();
      window.location.href = this.resolvePath('index.html');
      return false;
    }

    if (requiredRole && user.role !== requiredRole) {
      // Administrator (Shop Owner) is authorized to access and oversee the Cashier POS Terminal
      if (user.role === 'ADMIN' && requiredRole === 'CASHIER') {
        this.initInactivityMonitor();
        return true;
      }

      alert('Access Denied: You do not have permission to view this page.');
      if (user.role === 'ADMIN') {
        window.location.href = this.resolvePath('admin/index.html');
      } else {
        window.location.href = this.resolvePath('cashier/index.html');
      }
      return false;
    }

    // Start Inactivity Monitor
    this.initInactivityMonitor();
    return true;
  },

  // Inactivity Auto-Logout Watcher
  initInactivityMonitor() {
    const resetTimer = () => {
      clearTimeout(this.inactivityTimer);
      clearTimeout(this.inactivityWarningTimer);

      // Warning at 14 minutes
      this.inactivityWarningTimer = setTimeout(() => {
        const warnBanner = document.getElementById('inactivityWarning');
        if (warnBanner) {
          warnBanner.style.display = 'block';
        }
      }, this.INACTIVITY_TIMEOUT_MS - 60000);

      // Logout at 15 minutes
      this.inactivityTimer = setTimeout(() => {
        alert('You have been automatically logged out due to 15 minutes of inactivity.');
        const user = this.getCurrentUser();
        const role = user ? user.role : 'CASHIER';
        this.clearSession();
        window.location.href = role === 'ADMIN' ? '/admin-login.html' : '/cashier-login.html';
      }, this.INACTIVITY_TIMEOUT_MS);
    };

    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
      window.addEventListener(evt, resetTimer, { passive: true });
    });

    resetTimer();
  }
};

window.SecurityEngine = SecurityEngine;
