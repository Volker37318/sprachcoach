// netlify/functions/_catalog.js
const BASE = {
  PG: { name: "Modul: Grammatik-Trainer",                   entitlements: { grammar: true,  dialog: false } },
  PD: { name: "Modul: Dialog-Partner",                      entitlements: { grammar: false, dialog: true  } },
  PK: { name: "Kombination Grammatik- und Dialog-Training", entitlements: { grammar: true,  dialog: true  } },
};

// Falls du echte Digistore24-Produkt-IDs nutzt, hier zusätzlich mappen:
export const PRODUCTS = {
  ...BASE,
  // "11111": BASE.PG,
  // "11112": BASE.PD,
  // "11113": BASE.PK,
};
