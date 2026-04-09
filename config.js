/**
 * finance.config.js
 * ─────────────────────────────────────────────
 * to generate a password hash open browser console (f12):
 *
 * crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassword'))
 *   .then(buf => console.log(Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')))
 *
 * default password: changeme123
 */

window.FINANCE_CONFIG = {

  githubPagesBase: "https://bnelson12812.github.io/Personal-Finance",

  // scan for csv files starting from this month
  dataStartDate: { month: 10, year: 2025 },

  // group → category mapping for budget matrix
  // category values must match your bank's Classification column exactly
  budgetGroups: {
    "needs": {
      label: "needs",
      categories: ["Housing", "Groceries", "Transportation", "Utilities"]
    },
    "wants": {
      label: "wants",
      categories: ["Dining", "Shopping", "Entertainment", "Health & Fitness", "Pharmacy", "Business Services"]
    },
    "savings": {
      label: "savings",
      categories: []  // calculated as income - needs - wants
    }
  },

  // Map bank categories to budget categories
  // Add your bank's category names here to auto-classify them
  categoryMapping: {
    // NEEDS
    "Mortgage & Rent": "Housing",
    "Home Insurance": "Housing",
    "Gas": "Transportation",
    "Rental Car & Taxi": "Transportation",
    "Bills & Utilities": "Utilities",
    "Auto Insurance": "Utilities",
    "Groceries": "Groceries",
    
    // WANTS
    "Restaurants": "Dining",
    "Coffee Shops": "Dining",
    "Fast Food": "Dining",
    "Shopping": "Shopping",
    "Alcohol & Bars": "Dining",
    "Gym": "Health & Fitness",
    "Entertainment": "Entertainment",
    "Music": "Entertainment",
    "Hair": "Health & Fitness",
    "Furnishings": "Shopping",
    "Home Improvement": "Shopping",
    "Electronics & Software": "Shopping",
    "Charity": "Shopping",
    
    // IGNORE (not spending)
    "Paycheck": "IGNORE",
    "Transfer": "IGNORE",
    "Financial": "IGNORE",
    "Cash": "IGNORE",
  },

  users: {
    "bnelson": {
      displayName: "bnelson",
      passwordHash: "e99a18c428cb38d5f260853678922e03",
      dataFolder: "data/bnelson",
      settings: {
        rentAmount:       2480,
        incomeOverride:   null,
        rentKeyword:      "",
        incomeKeyword:    "",
        hysaBalance:      31138,
        budgetRatios: {
          housing:    0.41,
          otherNeeds: 0.15,
          wants:      0.20,
          savings:    0.24,
        },
        needsCategories:  ["Groceries", "Transportation", "Utilities"],
        wantsCategories:  ["Dining", "Shopping", "Entertainment", "Health & Fitness", "Pharmacy", "Business Services"],
      }
    },
    "wnelson": {
      displayName: "wnelson",
      passwordHash: "e99a18c428cb38d5f260853678922e03",
      dataFolder: "data/wnelson",
      settings: {
        rentAmount:       0,
        incomeOverride:   null,
        rentKeyword:      "",
        incomeKeyword:    "",
        hysaBalance:      0,
        budgetRatios: {
          housing:    0.30,
          otherNeeds: 0.20,
          wants:      0.30,
          savings:    0.20,
        },
        needsCategories:  ["Groceries", "Transportation", "Utilities"],
        wantsCategories:  ["Dining", "Shopping", "Entertainment", "Health & Fitness", "Pharmacy", "Business Services"],
      }
    }
  }
};
