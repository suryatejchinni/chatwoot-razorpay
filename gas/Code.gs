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
 * Get payments by customer email or phone using TextFinder (optimized)
 */
function getPaymentsByCustomer(email, phone) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PAYMENTS_SHEET);

  if (!sheet) {
    console.error('Payments sheet not found:', PAYMENTS_SHEET);
    return [];
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return []; // No data besides header

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // Find column indices (1-based for getRange)
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

  // Use TextFinder to find matching rows
  const matchingRows = new Set();

  if (email) {
    const emailCol = colIndex.email + 1; // 1-based
    const emailRange = sheet.getRange(2, emailCol, lastRow - 1, 1);
    const finder = emailRange.createTextFinder(email)
      .matchEntireCell(true)
      .matchCase(false);
    finder.findAll().forEach(cell => matchingRows.add(cell.getRow()));
  }

  if (phone) {
    const contactCol = colIndex.contact + 1; // 1-based
    const contactRange = sheet.getRange(2, contactCol, lastRow - 1, 1);
    const finder = contactRange.createTextFinder(phone)
      .matchEntireCell(true);
    finder.findAll().forEach(cell => matchingRows.add(cell.getRow()));
  }

  // Fetch only matching rows (limit to 50)
  const payments = [];
  const rowArray = Array.from(matchingRows).slice(0, 60); // Fetch a few extra in case some are filtered

  for (const rowNum of rowArray) {
    if (payments.length >= 50) break;

    const rowData = sheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];

    // Skip failed payments
    const status = rowData[colIndex.status] ? rowData[colIndex.status].toString().toLowerCase() : '';
    if (status === 'failed') continue;

    payments.push({
      id: rowData[colIndex.id] || '',
      amount: formatAmount(rowData[colIndex.amount]),
      amountRaw: rowData[colIndex.amount] || 0,
      currency: rowData[colIndex.currency] || 'INR',
      status: rowData[colIndex.status] || '',
      order_id: rowData[colIndex.order_id] || '',
      method: rowData[colIndex.method] || '',
      amount_refunded: formatAmount(rowData[colIndex.amount_refunded]),
      refund_status: rowData[colIndex.refund_status] || '',
      description: rowData[colIndex.description] || '',
      email: rowData[colIndex.email] || '',
      contact: rowData[colIndex.contact] || '',
      error_description: rowData[colIndex.error_description] || '',
      created_at_readable: rowData[colIndex.created_at_readable] || '',
      receipt: rowData[colIndex.receipt] || ''
    });
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
 * Get orders by payment IDs using TextFinder (optimized)
 */
function getOrdersByPaymentIds(paymentIds) {
  if (!paymentIds || paymentIds.length === 0) return [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(ORDERS_SHEET);

  if (!sheet) {
    console.error('Orders sheet not found:', ORDERS_SHEET);
    return [];
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

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

  // Use TextFinder to find matching rows for each payment ID
  const matchingRows = new Set();
  const paymentIdCol = colIndex.payment_id + 1; // 1-based
  const paymentIdRange = sheet.getRange(2, paymentIdCol, lastRow - 1, 1);

  for (const paymentId of paymentIds) {
    if (!paymentId) continue;
    const finder = paymentIdRange.createTextFinder(paymentId)
      .matchEntireCell(true);
    finder.findAll().forEach(cell => matchingRows.add(cell.getRow()));
  }

  // Fetch only matching rows (limit to 50)
  const orders = [];
  const rowArray = Array.from(matchingRows).slice(0, 50);

  for (const rowNum of rowArray) {
    const rowData = sheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];

    orders.push({
      order_id: rowData[colIndex.order_id] || '',
      amount: formatAmount(rowData[colIndex.amount]),
      amountRaw: rowData[colIndex.amount] || 0,
      amount_paid: formatAmount(rowData[colIndex.amount_paid]),
      amount_due: formatAmount(rowData[colIndex.amount_due]),
      currency: rowData[colIndex.currency] || 'INR',
      receipt: rowData[colIndex.receipt] || '',
      status: rowData[colIndex.status] || '',
      attempts: rowData[colIndex.attempts] || 0,
      created_at_readable: rowData[colIndex.created_at_readable] || '',
      payment_id: rowData[colIndex.payment_id] || ''
    });
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
 * Get refunds by payment IDs using TextFinder (optimized)
 */
function getRefundsByPaymentIds(paymentIds) {
  if (!paymentIds || paymentIds.length === 0) return [];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(REFUNDS_SHEET);

  if (!sheet) {
    console.error('Refunds sheet not found:', REFUNDS_SHEET);
    return [];
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

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

  // Use TextFinder to find matching rows for each payment ID
  const matchingRows = new Set();
  const paymentIdCol = colIndex.payment_id + 1; // 1-based
  const paymentIdRange = sheet.getRange(2, paymentIdCol, lastRow - 1, 1);

  for (const paymentId of paymentIds) {
    if (!paymentId) continue;
    const finder = paymentIdRange.createTextFinder(paymentId)
      .matchEntireCell(true);
    finder.findAll().forEach(cell => matchingRows.add(cell.getRow()));
  }

  // Fetch only matching rows (limit to 50)
  const refunds = [];
  const rowArray = Array.from(matchingRows).slice(0, 50);

  for (const rowNum of rowArray) {
    const rowData = sheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];

    refunds.push({
      id: rowData[colIndex.id] || '',
      amount: formatAmount(rowData[colIndex.amount]),
      amountRaw: rowData[colIndex.amount] || 0,
      currency: rowData[colIndex.currency] || 'INR',
      payment_id: rowData[colIndex.payment_id] || '',
      status: rowData[colIndex.status] || '',
      created_at_readable: rowData[colIndex.created_at_readable] || '',
      speed_requested: rowData[colIndex.speed_requested] || '',
      speed_processed: rowData[colIndex.speed_processed] || '',
      receipt: rowData[colIndex.receipt] || ''
    });
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
