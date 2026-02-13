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

  users: {
    "bnelson": {
      displayName: "bnelson",
      passwordHash: "494a715f7e9b4071aca61bac42ca858a309524e5864f0920030862a4ae7589be",
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
      passwordHash: "494a715f7e9b4071aca61bac42ca858a309524e5864f0920030862a4ae7589be",
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
