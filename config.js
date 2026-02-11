/**
 * Finance Dashboard — config.js
 * ================================
 * IMPORTANT: Change passwords before uploading to GitHub!
 *
 * To generate a password hash:
 * 1. Open browser console (F12)
 * 2. Run this (replace 'yourpassword' with your actual password):
 *
 *    crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassword'))
 *      .then(buf => console.log(Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')))
 *
 * 3. Copy the output and paste below as passwordHash
 *
 * Default password for both users: changeme123
 */

window.FINANCE_CONFIG = {

  // GitHub Pages base URL
  // Format: https://USERNAME.github.io/REPONAME
  githubPagesBase: "https://bnelson12812.github.io/personal-finance",

  // Auto-detection: scan for CSV files starting from this month
  // Format: { month: 1-12, year: YYYY }
  // File naming convention: Debit012026.csv / Credit012026.csv (MMYYYY)
  dataStartDate: { month: 1, year: 2026 },

  // User accounts
  users: {
    "bnelson": {
      displayName: "B Nelson",
      // SHA-256 hash of "changeme123" — CHANGE THIS!
      passwordHash: "494a715f7e9b4071aca61bac42ca858a309524e5864f0920030862a4ae7589be",
      dataFolder: "data/bnelson",
      budgetSettings: {
        rentAmount:     2480,
        incomeOverride: null,
        rentKeyword:    "",
        incomeKeyword:  ""
      }
    },
    "wnelson": {
      displayName: "W Nelson",
      // SHA-256 hash of "changeme123" — CHANGE THIS!
      passwordHash: "494a715f7e9b4071aca61bac42ca858a309524e5864f0920030862a4ae7589be",
      dataFolder: "data/wnelson",
      budgetSettings: {
        rentAmount:     0,
        incomeOverride: null,
        rentKeyword:    "",
        incomeKeyword:  ""
      }
    }
  }
};
