# DeLeon Judo Club — Setup Guide

## Architecture

```
Netlify (hosting)                    Google Cloud
┌────────────────────┐               ┌──────────────────┐
│  /signin/          │──── API ────▶│  Apps Script      │
│   Student kiosk    │               │  (web app)        │
│                    │               └────────┬─────────┘
│  /admin/           │──── API ────▶          │
│   Attendance mgmt  │               ┌────────▼─────────┐
└────────────────────┘               │  Google Sheet     │
                                     │  (database)       │
                                     └──────────────────┘
```

Both apps work offline. Data syncs to Google Sheets when wifi is available.

---

## 1. Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it **DeLeon Judo Club**
3. Create these tabs (exact names):
   - **Roster** — Column A header: `Name`
   - **Attendance** — Headers: `Date`, `Names`
   - **Check-ins** — Headers: `Date`, `Name`, `Timestamp`, `Class`, `Paid`
   - **New Students** — Headers: `First Name`, `Last Name`, `Date`, `Time`, `Class`, `Status`
   - **Cancelled** — Headers: `Date`, `Timestamp`
4. In the **Roster** tab, add your students in Column A using `Last, First` format:
   ```
   Zhang, Bob
   Smith, Jane
   ```
   The Apps Script will auto-create missing tabs with headers if needed.

---

## 2. Deploy the Apps Script

1. In your Google Sheet, go to **Extensions > Apps Script**
2. Delete any existing code in `Code.gs`
3. Paste the entire contents of `apps-script.js`
4. Go to **Project Settings** (gear icon):
   - Scroll to **Script Properties**
   - Click **Add script property**
   - Property: `WRITE_KEY`, Value: any secret string (e.g., `deleon-judo-2026`)
5. Click **Deploy > New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy** and copy the web app URL (looks like `https://script.google.com/macros/s/.../exec`)

---

## 3. Configure the apps

### signin/index.html
Open the file and find this line near the top of the `<script>` block:
```javascript
const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';
```
Replace `YOUR_APPS_SCRIPT_URL_HERE` with your Apps Script URL.

### admin/index.html
Open the file and find these lines near the top of the `<script>` block:
```javascript
const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';
const WRITE_KEY = 'YOUR_WRITE_KEY_HERE';
```
Replace both with your Apps Script URL and the WRITE_KEY you set in step 2.

### Changing the PIN
The admin PIN is set at the top of the admin script:
```javascript
const ADMIN_PIN = '1970';
```
Change `'1970'` to any 4-digit code.

---

## 4. Deploy to Netlify

### Option A: Drag and drop
1. Go to [app.netlify.com](https://app.netlify.com)
2. Drag the entire project folder onto the deploy area
3. Your site will be live at `random-name.netlify.app`

### Option B: Git deploy
1. Push this repo to GitHub
2. In Netlify, click **Add new site > Import an existing project**
3. Connect your GitHub repo
4. Build settings: leave blank (no build command needed)
5. Deploy

### URLs
Once deployed:
- **Student kiosk**: `https://your-site.netlify.app/signin/`
- **Admin tracker**: `https://your-site.netlify.app/admin/`

---

## 5. Install as PWA

### iPad / iPhone (Safari)
1. Open the URL in Safari
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add**

### Android (Chrome)
1. Open the URL in Chrome
2. Tap the **three-dot menu**
3. Tap **Add to Home screen** or **Install app**
4. Tap **Install**

Install each app separately:
- Install `/signin/` on the kiosk iPad at the dojo
- Install `/admin/` on any device the sensei uses

---

## 6. Generate QR codes (optional)

For the sign-in kiosk, print a QR code so students can check in from their own phones:

1. Go to [qr-code-generator.com](https://www.qr-code-generator.com) or similar
2. Enter your signin URL: `https://your-site.netlify.app/signin/`
3. Download and print

---

## Offline behavior

Both apps are designed for **no-wifi environments**:

- **Sign-in kiosk**: Students check in → data queues locally → syncs when wifi reconnects
- **Admin**: Mark attendance, add/remove students → all saved locally → syncs when wifi reconnects

The offline queue handles intermittent connectivity gracefully. No data is lost.

---

## Updating the Apps Script

If you modify `apps-script.js`:
1. Open your Google Sheet > Extensions > Apps Script
2. Paste the updated code
3. Deploy > **Manage deployments** > Edit the existing deployment
4. Click **Deploy** (increment the version)

The URL stays the same. No changes needed in the HTML files.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dropdown is empty | Check APPS_SCRIPT_URL is set correctly. Check the Roster tab has names. |
| "Save failed" in admin | Check WRITE_KEY matches between admin and Apps Script properties. |
| PWA won't install | Make sure you're on HTTPS (Netlify provides this). Clear browser cache. |
| Data not syncing | Check the device has internet. Open browser console for errors. |
| Wrong date showing | Make sure `todayStr()` returns `fmtDate(new Date())` (not hardcoded). |

---

## File structure

```
deleon-judo-kiosk/
├── signin/
│   ├── index.html        ← Student check-in kiosk
│   ├── manifest.json     ← PWA manifest
│   └── sw.js             ← Service worker (offline support)
├── admin/
│   ├── index.html        ← Admin attendance tracker
│   ├── manifest.json     ← PWA manifest
│   └── sw.js             ← Service worker (offline support)
├── apps-script.js        ← Google Apps Script (deploy to Sheet, not Netlify)
└── SETUP.md              ← This file
```
