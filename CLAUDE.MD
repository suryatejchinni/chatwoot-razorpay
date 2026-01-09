# Chatwoot Razorpay Dashboard App

A Chatwoot dashboard app to display customer's Razorpay transactions directly within the Chatwoot agent interface.

## Project Overview

This dashboard app integrates with Chatwoot to show Razorpay payment history, orders, and refunds for customers during support conversations. Data is sourced from a Google Sheet that syncs with Razorpay.

## Tech Stack

- **Frontend**: Static HTML/CSS/JS hosted on Vercel
- **Backend API**: Google Apps Script (returns JSON)
- **Data Source**: Google Sheets (Razorpay data export)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chatwoot Dashboard                        │
│  ┌─────────────────────────────────────────────────────────┐│
│  │           Dashboard App (iframe)                         ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │     Vercel (Static HTML/JS)                         │││
│  │  │  - Receives postMessage from Chatwoot               │││
│  │  │  - Extracts email/phone from contact                │││
│  │  │  - Calls GAS API via fetch()                        │││
│  │  │  - Displays tabbed UI (Payments/Orders/Refunds)     │││
│  │  └──────────────────────┬──────────────────────────────┘││
│  └─────────────────────────┼───────────────────────────────┘│
└────────────────────────────┼────────────────────────────────┘
                             │ fetch(GAS_URL?email=x&phone=y)
                             ▼
              ┌──────────────────────────────┐
              │  Google Apps Script (API)    │
              │  - Receives email/phone      │
              │  - Queries Google Sheets     │
              │  - Returns JSON              │
              └──────────────────────┬───────┘
                                     │
                                     ▼
              ┌──────────────────────────────┐
              │     Google Sheets            │
              │  ├─ Razorpay Payments        │
              │  ├─ Razorpay Orders          │
              │  └─ Razorpay Refunds         │
              └──────────────────────────────┘
```

## Project Structure

```
chatwoot-razorpay/
├── gas/
│   └── Code.gs              # GAS API endpoint (returns JSON)
├── public/
│   └── index.html           # Frontend for Vercel
├── CLAUDE.MD                # Project documentation
└── package.json             # For Vercel deployment
```

## Deployment Steps

### Step 1: Deploy GAS API

1. **Open your Razorpay Google Sheet**

2. **Go to Extensions → Apps Script**

3. **Replace Code.gs** with contents of `gas/Code.gs`

4. **Verify sheet names in Code.gs:**
   ```javascript
   const PAYMENTS_SHEET = 'Razorpay Payments';
   const ORDERS_SHEET = 'Razorpay Orders';
   const REFUNDS_SHEET = 'Razorpay Refunds';
   ```

5. **Deploy as Web App:**
   - Click **Deploy → New deployment**
   - Select type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**
   - **Copy the deployment URL** (you'll need this for the frontend)

### Step 2: Deploy Frontend to Vercel

1. **Update the GAS URL** in `public/index.html`:
   ```javascript
   const GAS_API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
   ```

2. **Deploy to Vercel:**
   ```bash
   # Option A: Via Vercel CLI
   npm i -g vercel
   vercel

   # Option B: Via GitHub
   # Push to GitHub, then import in vercel.com
   ```

3. **Copy the Vercel URL** (e.g., `https://your-app.vercel.app`)

### Step 3: Add to Chatwoot

1. Go to **Settings → Integrations → Dashboard Apps**
2. Click **Configure**
3. Add your app:
   - **Name**: Razorpay Transactions
   - **URL**: Your Vercel URL (NOT the GAS URL)
4. Save

## Testing

### Test GAS API
Open in browser:
```
https://script.google.com/macros/s/YOUR_ID/exec?email=test@example.com&phone=+919876543210
```
Should return JSON with payments, orders, refunds.

### Test Frontend
Open the Vercel URL directly - should show "Waiting for conversation data..."

### Test in Chatwoot
Open a conversation with a contact that has email/phone matching your sheet data.

## How Chatwoot Dashboard Apps Work

Dashboard apps are embedded iframes within the Chatwoot dashboard. They communicate with Chatwoot via the `postMessage` API.

### Receiving Data from Chatwoot

```javascript
window.addEventListener("message", function (event) {
  const eventData = JSON.parse(event.data);
  // eventData contains: { event: "appContext", data: { conversation, contact, currentAgent } }
});
```

### Requesting Data on Demand

```javascript
window.parent.postMessage('chatwoot-dashboard-app:fetch-info', '*')
```

## Google Sheets Structure

### Razorpay Payments
Key columns: `id`, `amount`, `status`, `email`, `contact`, `method`, `created_at_readable`, `error_description`

### Razorpay Orders
Key columns: `order_id`, `amount`, `status`, `receipt`, `payment_id`, `created_at_readable`

### Razorpay Refunds
Key columns: `id`, `amount`, `status`, `payment_id`, `speed_processed`, `created_at_readable`

## Key Features

- [x] Display customer payments by email/phone from Chatwoot contact
- [x] Show payment status with color-coded badges
- [x] Display amount (converted from paise to ₹)
- [x] Show payment method and date
- [x] Tabbed interface for Payments/Orders/Refunds
- [x] Error details for failed payments
- [x] Copy payment/order IDs to clipboard
- [x] Refresh button to reload data
- [x] Loading, empty, and error states

## Status Badge Colors

| Status | Color |
|--------|-------|
| captured, paid, processed | Green |
| authorized, created, placed | Blue |
| pending, attempted | Yellow |
| failed, refunded | Red |

## Troubleshooting

### "Waiting for conversation data..."
- Ensure the app is opened within Chatwoot (not standalone)
- Check that the contact has email or phone set

### "GAS API URL not configured"
- Update `GAS_API_URL` in `public/index.html` with your deployment URL

### "No transactions found"
- Verify customer email/phone matches exactly with sheet data
- Check sheet names match the constants in Code.gs

### "Error loading data"
- Check GAS execution logs (View → Logs in Apps Script)
- Verify sheet permissions
- Test the GAS API URL directly in browser

## References

- [Chatwoot Dashboard Apps Guide](https://www.chatwoot.com/hc/user-guide/articles/1677691702-how-to-use-dashboard-apps)
- [Google Apps Script ContentService](https://developers.google.com/apps-script/reference/content)
- [Vercel Deployment](https://vercel.com/docs)
