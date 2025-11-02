// netlify/functions/webhook-digistore.js
import { PRODUCTS } from "./_catalog.js";

const clamp = (n,min,max)=> Math.min(max, Math.max(min, n|0));
const addMonths = (ts, m)=> { const d=new Date(ts); d.setMonth(d.getMonth()+m); return d.getTime(); };

function extractMonths(payload){
  // versuche mehrere Felder – passe das an deine Digistore-Konfig an
  const cf = (payload.custom_fields || {});
  const m  = Number(payload.months ?? cf.months ?? cf.duration ?? payload.variant_months ?? 0);
  return clamp(m || 1, 1, 12);
}

export async function handler(event){
  if(event.httpMethod!=="POST") return { statusCode:405, body:"Method Not Allowed" };
  const p = JSON.parse(event.body||"{}");

  const product = PRODUCTS[String(p.product_id)];
  if(!product) return { statusCode:400, body: JSON.stringify({ error:"Unbekanntes Produkt" }) };

  const months = extractMonths(p);              // <-- 1..12 dynamisch
  const expiresAt = addMonths(Date.now(), months);

  // HIER: Bestellung + { entitlements: product.entitlements, expiresAt } persistieren
  // (Pilot: du kannst erst claim.js nutzen, später DB/KV)
  return { statusCode:200, body: JSON.stringify({ ok:true }) };
}

