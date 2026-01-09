/**
 * Chatwoot Razorpay Dashboard App
 * Google Apps Script - Server Side
 *
 * This script serves a web app that displays Razorpay transactions
 * for customers identified by email/phone from Chatwoot.
 */

// Sheet names - adjust if your sheets have different names
const PAYMENTS_SHEET = 'Razorpay Payments';
const ORDERS_SHEET = 'Razorpay Orders';
const REFUNDS_SHEET = 'Razorpay Refunds';

/**
 * API endpoint - returns JSON data
 * Called by frontend hosted on Vercel
 *
 * Usage: GET ?email=xxx&phone=xxx
 */
function doGet(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const email = e.parameter.email || '';
    const phone = e.parameter.phone || '';

    if (!email && !phone) {
      return output.setContent(JSON.stringify({
        success: false,
        error: 'No email or phone provided',
        payments: [],
        orders: [],
        refunds: []
      }));
    }

    const result = getAllCustomerData(email, phone);
    return output.setContent(JSON.stringify(result));

  } catch (error) {
    console.error('doGet error:', error);
    return output.setContent(JSON.stringify({
      success: false,
      error: error.toString(),
      payments: [],
      orders: [],
      refunds: []
    }));
  }
}

/**
 * Get all customer data (payments, orders, refunds) by email and/or phone
 * This is the main function called from the frontend
 */
function getAllCustomerData(email, phone) {
  try {
    // Normalize inputs
    email = email ? email.toLowerCase().trim() : '';
    phone = normalizePhone(phone);

    if (!email && !phone) {
      return {
        success: false,
        error: 'No email or phone provided',
        payments: [],
        orders: [],
        refunds: []
      };
    }

    // Get payments by email/phone
    const payments = getPaymentsByCustomer(email, phone);

    // Extract payment IDs for orders and refunds lookup
    const paymentIds = payments.map(p => p.id);

    // Get orders linked to these payments
    const orders = getOrdersByPaymentIds(paymentIds);

    // Get refunds for these payments
    const refunds = getRefundsByPaymentIds(paymentIds);

    return {
      success: true,
      payments: payments,
      orders: orders,
      refunds: refunds,
      customerEmail: email,
      customerPhone: phone
    };

  } catch (error) {
    console.error('Error in getAllCustomerData:', error);
    return {
      success: false,
      error: error.toString(),
      payments: [],
      orders: [],
      refunds: []
    };
  }
}

/**
 * Get payments by customer email or phone
 */
function getPaymentsByCustomer(email, phone) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PAYMENTS_SHEET);

  if (!sheet) {
    console.error('Payments sheet not found:', PAYMENTS_SHEET);
    return [];
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return []; // No data besides header

  const headers = data[0];
  const rows = data.slice(1);

  // Find column indices
  const colIndex = {
    id: headers.indexOf('id'),
    amount: headers.indexOf('amount'),
    currency: headers.indexOf('currency'),
    status: headers.indexOf('status'),
    order_id: headers.indexOf('order_id'),
    method: headers.indexOf('method'),
    amount_refunded: headers.indexOf('amount_refunded'),
    refund_status: headers.indexOf('refund_status'),
    description: headers.indexOf('description'),
    email: headers.indexOf('email'),
    contact: headers.indexOf('contact'),
    error_description: headers.indexOf('error_description'),
    created_at_readable: headers.indexOf('created_at_readable'),
    receipt: headers.indexOf('receipt')
  };

  // Filter rows by email or phone
  const payments = [];

  for (let i = 0; i < rows.length && payments.length < 50; i++) {
    const row = rows[i];
    const rowEmail = row[colIndex.email] ? row[colIndex.email].toString().toLowerCase().trim() : '';
    const rowPhone = normalizePhone(row[colIndex.contact]);

    // Match by email or phone
    const emailMatch = email && rowEmail === email;
    const phoneMatch = phone && rowPhone === phone;

    if (emailMatch || phoneMatch) {
      payments.push({
        id: row[colIndex.id] || '',
        amount: formatAmount(row[colIndex.amount]),
        amountRaw: row[colIndex.amount] || 0,
        currency: row[colIndex.currency] || 'INR',
        status: row[colIndex.status] || '',
        order_id: row[colIndex.order_id] || '',
        method: row[colIndex.method] || '',
        amount_refunded: formatAmount(row[colIndex.amount_refunded]),
        refund_status: row[colIndex.refund_status] || '',
        description: row[colIndex.description] || '',
        email: row[colIndex.email] || '',
        contact: row[colIndex.contact] || '',
        error_description: row[colIndex.error_description] || '',
        created_at_readable: row[colIndex.created_at_readable] || '',
        receipt: row[colIndex.receipt] || ''
      });
    }
  }

  // Sort by date (newest first)
  payments.sort((a, b) => {
    const dateA = new Date(a.created_at_readable);
    const dateB = new Date(b.created_at_readable);
    return dateB - dateA;
  });

  return payments;
}

/**
 * Get orders by payment IDs
 */
function getOrdersByPaymentIds(paymentIds) {
  if (!paymentIds || paymentIds.length === 0) return [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ORDERS_SHEET);

  if (!sheet) {
    console.error('Orders sheet not found:', ORDERS_SHEET);
    return [];
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0];
  const rows = data.slice(1);

  // Find column indices
  const colIndex = {
    order_id: headers.indexOf('order_id'),
    amount: headers.indexOf('amount'),
    amount_paid: headers.indexOf('amount_paid'),
    amount_due: headers.indexOf('amount_due'),
    currency: headers.indexOf('currency'),
    receipt: headers.indexOf('receipt'),
    status: headers.indexOf('status'),
    attempts: headers.indexOf('attempts'),
    created_at_readable: headers.indexOf('created_at_readable'),
    payment_id: headers.indexOf('payment_id')
  };

  // Create a Set for faster lookup
  const paymentIdSet = new Set(paymentIds);

  const orders = [];

  for (let i = 0; i < rows.length && orders.length < 50; i++) {
    const row = rows[i];
    const rowPaymentId = row[colIndex.payment_id] ? row[colIndex.payment_id].toString() : '';

    if (paymentIdSet.has(rowPaymentId)) {
      orders.push({
        order_id: row[colIndex.order_id] || '',
        amount: formatAmount(row[colIndex.amount]),
        amountRaw: row[colIndex.amount] || 0,
        amount_paid: formatAmount(row[colIndex.amount_paid]),
        amount_due: formatAmount(row[colIndex.amount_due]),
        currency: row[colIndex.currency] || 'INR',
        receipt: row[colIndex.receipt] || '',
        status: row[colIndex.status] || '',
        attempts: row[colIndex.attempts] || 0,
        created_at_readable: row[colIndex.created_at_readable] || '',
        payment_id: rowPaymentId
      });
    }
  }

  // Sort by date (newest first)
  orders.sort((a, b) => {
    const dateA = new Date(a.created_at_readable);
    const dateB = new Date(b.created_at_readable);
    return dateB - dateA;
  });

  return orders;
}

/**
 * Get refunds by payment IDs
 */
function getRefundsByPaymentIds(paymentIds) {
  if (!paymentIds || paymentIds.length === 0) return [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(REFUNDS_SHEET);

  if (!sheet) {
    console.error('Refunds sheet not found:', REFUNDS_SHEET);
    return [];
  }

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0];
  const rows = data.slice(1);

  // Find column indices
  const colIndex = {
    id: headers.indexOf('id'),
    amount: headers.indexOf('amount'),
    currency: headers.indexOf('currency'),
    payment_id: headers.indexOf('payment_id'),
    status: headers.indexOf('status'),
    created_at_readable: headers.indexOf('created_at_readable'),
    speed_requested: headers.indexOf('speed_requested'),
    speed_processed: headers.indexOf('speed_processed'),
    receipt: headers.indexOf('receipt')
  };

  // Create a Set for faster lookup
  const paymentIdSet = new Set(paymentIds);

  const refunds = [];

  for (let i = 0; i < rows.length && refunds.length < 50; i++) {
    const row = rows[i];
    const rowPaymentId = row[colIndex.payment_id] ? row[colIndex.payment_id].toString() : '';

    if (paymentIdSet.has(rowPaymentId)) {
      refunds.push({
        id: row[colIndex.id] || '',
        amount: formatAmount(row[colIndex.amount]),
        amountRaw: row[colIndex.amount] || 0,
        currency: row[colIndex.currency] || 'INR',
        payment_id: rowPaymentId,
        status: row[colIndex.status] || '',
        created_at_readable: row[colIndex.created_at_readable] || '',
        speed_requested: row[colIndex.speed_requested] || '',
        speed_processed: row[colIndex.speed_processed] || '',
        receipt: row[colIndex.receipt] || ''
      });
    }
  }

  // Sort by date (newest first)
  refunds.sort((a, b) => {
    const dateA = new Date(a.created_at_readable);
    const dateB = new Date(b.created_at_readable);
    return dateB - dateA;
  });

  return refunds;
}

/**
 * Normalize phone number for comparison
 * Removes spaces, dashes, and ensures consistent format
 */
function normalizePhone(phone) {
  if (!phone) return '';
  return phone.toString().replace(/[\s\-\(\)]/g, '').trim();
}

/**
 * Format amount from paise to rupees
 * @param {number} paise - Amount in paise
 * @returns {string} - Formatted amount with rupee symbol
 */
function formatAmount(paise) {
  if (!paise || isNaN(paise)) return '₹0.00';
  const rupees = parseFloat(paise) / 100;
  return '₹' + rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Test function - can be run from GAS editor to verify setup
 */
function testGetCustomerData() {
  const result = getAllCustomerData('suryatchinni@gmail.com', '+918123199351');
  console.log(JSON.stringify(result, null, 2));
}
