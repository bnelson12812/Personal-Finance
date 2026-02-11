# 💰 Personal Finance Dashboard

A browser-based personal finance dashboard. No installs, no third-party services — just upload your bank CSVs and go.

## 🌐 Hosting on GitHub Pages (Free)

### Step 1: Create a GitHub Repository

1. Go to [github.com](https://github.com) → click **"+"** → **"New repository"**
2. Name it: `finance-dashboard`
3. Set to **Private** (recommended) or Public
4. Click **"Create repository"**

### Step 2: Upload Your Files

Upload these 4 files to your repository:
- `index.html`
- `dashboard.html`
- `app.js`
- `config.js`

### Step 3: Enable GitHub Pages

1. Go to your repository on GitHub
2. Click **"Settings"** (top menu)
3. Scroll down to **"Pages"** (left sidebar)
4. Under **"Source"**, select **"Deploy from a branch"**
5. Choose **"main"** branch → **"/ (root)"**
6. Click **"Save"**

### Step 4: Get Your URL

After 1-2 minutes your site will be live at:
```
https://YOUR-USERNAME.github.io/finance-dashboard
```

Bookmark this — it's your permanent dashboard URL!

---

## 🔐 Setting Your Own Password

**Do this before uploading to GitHub!**

### Step 1: Generate Your Password Hash

1. Open any browser
2. Press **F12** to open Developer Tools
3. Click the **Console** tab
4. Paste this (replace `yourpassword` with your actual password):

```javascript
crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassword'))
  .then(buf => console.log(Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')))
```

5. Press Enter
6. Copy the long string of letters and numbers that appears

### Step 2: Update config.js

Open `config.js` and update:

```javascript
window.FINANCE_CONFIG = {
  username: "yourname",           // ← Change this
  passwordHash: "paste-hash-here" // ← Paste your hash here
};
```

### Step 3: Upload Updated config.js to GitHub

---

## 📊 Using the Dashboard

### Every Month:

1. Go to your dashboard URL and log in
2. Export CSV files from your bank:
   - Checking/debit account transactions
   - Credit card transactions
3. On the dashboard, upload both CSV files
4. Click **"Load Dashboard"**
5. Explore your finances!

### CSV Format Required:

Your bank CSV should have these columns:
```
Account Number | Post Date | Check | Description | Debit | Credit | Status | Balance | Classification
```

---

## 📁 File Overview

| File | Purpose |
|------|---------|
| `index.html` | Login page |
| `dashboard.html` | Main dashboard with charts and tables |
| `app.js` | All processing logic (CSV parsing, charts, transfers) |
| `config.js` | Your username and password hash (**change before uploading!**) |

---

## 🔒 Security Notes

- Passwords are stored as SHA-256 hashes — never in plain text
- Your CSV data is processed entirely in your browser — nothing is sent anywhere
- Sessions expire when you close the browser tab
- For a private repository, only people with GitHub access can see your code

---

## 💡 Tips

- Use **Private** repository on GitHub to keep your code hidden
- Never commit your actual CSV files to GitHub
- Change your password every few months
- The dashboard works on mobile too!
