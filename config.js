/**
 * finance.config.js
 * ─────────────────────────────────────────────
 * to generate a password hash:
 * open browser console (f12) and run:
 *
 * crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpassword'))
 *   .then(buf => console.log(Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')))
 *
 * default password: changeme123
 */

window.FINANCE_CONFIG = {

  githubPagesBase: "https://bnelson12812.github.io/Personal-Finance",

  // auto-scan for csv files starting from this month
  dataStartDate: { month: 1, year: 2026 },

  users: {
    "bnelson": {
      displayName: "bnelson",
      passwordHash: "494a715f7e9b4071aca61bac42ca858a309524e5864f0920030862a4ae7589be",
      dataFolder: "data/bnelson",
      settings: {
        // budget
        rentAmount:       2480,
        incomeOverride:   null,
        rentKeyword:      "",
        incomeKeyword:    "",
        // net worth — manual entries
        hysaBalance:      31138,
        // budget ratios (% of total income)
        // rent is fixed — remaining ratios split the rest
        budgetRatios: {
          housing:        0.41,   // fixed rent ~$2480 / $6000
          otherNeeds:     0.15,   // groceries, transport, utilities
          wants:          0.20,   // dining, shopping, entertainment
          savings:        0.24,   // protected savings target
        },
        // need categories mapped to otherNeeds bucket
        needsCategories:  ['Groceries','Transportation','Utilities'],
        // want categories
        wantsCategories:  ['Dining','Shopping','Entertainment','Health & Fitness','Pharmacy','Business Services'],
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
          housing:        0.30,
          otherNeeds:     0.20,
          wants:          0.30,
          savings:        0.20,
        },
        needsCategories:  ['Groceries','Transportation','Utilities'],
        wantsCategories:  ['Dining','Shopping','Entertainment','Health & Fitness','Pharmacy','Business Services'],
      }
    }
  }
};
