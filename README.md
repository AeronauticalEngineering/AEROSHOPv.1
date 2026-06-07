# Costcode Next.js

Next.js replacement for the existing AppSheet / Apps Script cost tracking app.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Fill `GOOGLE_SHEET_ID`.
3. Add Google service account credentials.
4. Share the Google Sheet with the service account email.
5. Run:

```powershell
npm install
npm run dev
```

Default local URL: `http://localhost:3000`

## Current Scope

- Reads Google Sheet data through Google Sheets API.
- Provides API routes for bootstrap, rows, dashboard, form schema, and bill creation.
- Starts with the same table/view names as the current app.
