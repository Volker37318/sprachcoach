/* =======================================================================
   core-access.js  —  Zentrale Zugangslogik (Trial + Lizenz, topicspezifisch)
   Volker: Drop-in verwenden. Nur ENDPOINT_BASE unten ggf. per localStorage
           überschreiben (siehe CONFIG).
   ======================================================================= */

export const TOPICS = {
  poss: { id: 'poss', label: 'Possessivpronomen' },
  artikel: { id: 'artikel', label: 'Deklination der Artikel' },
  adj: { id: 'adj', label: 'Deklination der Adjektive' },
};

// ------------------------- Konfiguration ---------------------------------
const CONFIG = {
  // Standard: Platzhalter. In Produktion per localStorage überschreiben:
  // localStorage.setItem('sp_access_base', 'https://<dein-koyeb-host>.koyeb.app');
  ENDPOINT_BASE:
    localStorage.getItem('sp_access_base') ||
    'https://<SETZE-DEINEN-KOYEB-HOST-HIER-EIN>.koyeb.app',

  // Trial-Dauer in Tagen (Standard 21)
  TRIAL_DAYS: 21,

  // Clock-Skew Puffer (ms) gegen falsche Clientzeit
  SKEW_MS: 15 * 1000,
};

// ------------------------- Storage-Keys ----------------------------------
const LS = {
  accessMode: 'cc_access_mode', // 'trial' | 'trial-teacher' | 'licensed'
  teacherAuthed: 'cc_teacher_authed', // '1' | undefined
  trialUntilFor: (topic) => `cc_trial_until::${topic}`,
  licenseScope: 'cc_license_scope', // z.B. 'bundle:grammarA'
  licenseTopics: 'cc_license_topics', // JSON: ["poss","artikel","adj"]
  licenseMask: (topic) => `cc_license_mask::${topic}`, // maskierter Code (optional)
};

// ------------------------- Kleine Utils ----------------------------------
const now = () => Date.now();
const clampInt = (n) => (Number.isFinite(n) ? Math.floor(n) : 0);

function daysToMs(days) {
  return clampInt(days) * 24 * 60 * 60 * 1000;
}

function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function maskCode(code) {
  if (!code) return '';
  const s = String(code).trim();
  if (s.length <= 6) return '*'.repeat(Math.max(0, s.length - 2)) + s.slice(-2);
  return s.slice(0, 2) + '***' + s.slice(-4);
}

function topicKey(topic) {
  return TOPICS[topic]?.id || String(topic || '').trim();
}

// ------------------------- Trial-Logik -----------------------------------
export function setTrial({ topic, days = CONFIG.TRIAL_DAYS, mode = 'trial-teacher' } = {}) {
  const t = topicKey(topic);
  if (!t) throw new Error('setTrial: topic fehlt/ungültig');
  const until = now() + daysToMs(days) - CONFIG.SKEW_MS; // kleiner Puffer
  localStorage.setItem(LS.trialUntilFor(t), String(until));
  localStorage.setItem(LS.accessMode, mode);
  if (mode === 'trial-teacher') localStorage.setItem(LS.teacherAuthed, '1');
  return until;
}

export function hasActiveTrial(topic) {
  const t = topicKey(topic);
  if (!t) return false;
  const until = Number(localStorage.getItem(LS.trialUntilFor(t)) || 0);
  return until > now();
}

// ------------------------- Lizenz-Logik ----------------------------------
export function setLicensed({ topics = [], scope = 'bundle:grammar', masks = {} } = {}) {
  const unique = Array.from(new Set(topics.map(topicKey))).filter(Boolean);
  localStorage.setItem(LS.accessMode, 'licensed');
  localStorage.setItem(LS.licenseScope, scope || 'bundle:grammar');
  localStorage.setItem(LS.licenseTopics, JSON.stringify(unique));
  // optionale Masken pro Topic
  for (const t of unique) {
    const m = masks?.[t];
    if (m) localStorage.setItem(LS.licenseMask(t), m);
  }
}

export function hasLicenseFor(topic) {
  const t = topicKey(topic);
  if (!t) return false;
  if (localStorage.getItem(LS.accessMode) !== 'licensed') return false;

  const topics = safeParseJSON(localStorage.getItem(LS.licenseTopics), []);
  const scope = localStorage.getItem(LS.licenseScope) || '';

  return topics.includes(t) || scope.startsWith('bundle:');
}

// ------------------------- Guards / Navigation ---------------------------
/**
 * Guardiert Zugriff auf eine inhalts-Seite.
 * @param {string} topic - 'poss' | 'artikel' | 'adj'
 * @param {object} options - { fallback?: string, requireTeacher?: boolean }
 * @returns {boolean} true wenn Zugriff erlaubt (Seite kann fortfahren)
 */
export function guardAccess(topic, options = {}) {
  const { fallback = '/index.html', requireTeacher = false } = options;
  const t = topicKey(topic);

  const ok =
    hasLicenseFor(t) ||
    hasActiveTrial(t) ||
    false;

  const teacherOk = !requireTeacher || localStorage.getItem(LS.teacherAuthed) === '1';

  if (ok && teacherOk) return true;

  // Sanfte Umleitung
  try {
    window.location.replace(fallback);
  } catch {
    window.location.href = fallback;
  }
  return false;
}

// ------------------------- Backend Calls ---------------------------------
async function api(path, { method = 'GET', body, headers } = {}) {
  const base = (localStorage.getItem('sp_access_base') || CONFIG.ENDPOINT_BASE).replace(/\/+$/, '');
  const url = `${base}${path.startsWith('/') ? path : '/' + path}`;

  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    // Nur für POST/PUT body mitschicken
    ...(body ? { body: JSON.stringify(body) } : {}),
  };

  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Server darf auch leeren Body liefern
    data = null;
  }
  if (!res.ok) {
    const msg = (data && data.error) || `HTTP ${res.status}`;
    throw new Error(`API-Fehler: ${msg}`);
  }
  return data || {};
}

/**
 * Trial anfordern (E-Mail → Magic-Link). Auf den *-21d.html Seiten verwenden.
 * Backend: POST /trial/request  Body: { email, topic }
 */
export async function requestTrial({ email, topic }) {
  const t = topicKey(topic);
  if (!t) throw new Error('requestTrial: topic fehlt/ungültig');
  if (!isValidEmail(email)) throw new Error('Bitte eine gültige E-Mail-Adresse eingeben.');

  const resp = await api('/trial/request', {
    method: 'POST',
    body: { email: String(email).trim(), topic: t },
  });

  // Erwartet: { ok: true } (genaue Payload ist egal)
  return !!resp?.ok;
}

/**
 * Trial-Bestätigung über URL-Token (Aufruf auf /trial/confirm.html)
 * Erwartet URL-Params: ?token=...   → Backend validiert Token & liefert { ok, topic, days, mode }
 * Bei Erfolg: setzt LocalStorage und leitet optional weiter.
 */
export async function handleTrialConfirmFromURL({ redirectTo } = {}) {
  const params = new URLSearchParams(location.search);
  const token = params.get('token') || '';

  if (!token) throw new Error('Bestätigungslink unvollständig oder abgelaufen.');

  const resp = await api('/trial/confirm', {
    method: 'POST',
    body: { token },
  });
  // resp: { ok:true, topic:'poss', days:21, mode:'trial'|'trial-teacher' }
  if (!resp?.ok) throw new Error('Trial konnte nicht bestätigt werden.');

  const topic = topicKey(resp.topic);
  const days = clampInt(resp.days ?? CONFIG.TRIAL_DAYS);
  const mode = resp.mode || 'trial';

  setTrial({ topic, days, mode });

  if (redirectTo) navigateSafe(redirectTo);
  return { topic, days, mode };
}

/**
 * Lizenz prüfen & setzen (auf den Lizenz-Seiten nutzen)
 * Backend: POST /license/verify  Body: { code, topic }
 * Antwort: { ok, scope, topics }  (topics = Array erlaubter Topics)
 */
export async function verifyLicense({ code, topic }) {
  const cleanCode = String(code || '').trim();
  if (!cleanCode) return false;

  const t = topicKey(topic);
  if (!t) throw new Error('verifyLicense: topic fehlt/ungültig');

  const resp = await api('/license/verify', {
    method: 'POST',
    body: { code: cleanCode, topic: t },
  });

  if (!resp?.ok) return false;

  const topics = Array.isArray(resp.topics)
    ? resp.topics.map(topicKey).filter(Boolean)
    : [t];

  const scope = resp.scope || 'bundle:grammar';
  const masks = Object.fromEntries(topics.map((tp) => [tp, maskCode(cleanCode)]));

  setLicensed({ topics, scope, masks });
  return true;
}

// ------------------------- Hilfsfunktionen -------------------------------
export function isValidEmail(email) {
  const s = String(email || '').trim();
  // bewusst pragmatisch
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function navigateSafe(url) {
  try {
    window.location.replace(url);
  } catch {
    window.location.href = url;
  }
}

// Komfort: Query lesen
export function getQueryParam(name, def = null) {
  const p = new URLSearchParams(location.search);
  return p.get(name) ?? def;
}

// Komfort: weiche Fehleranzeige (optional einblendbar)
export function toast(msg) {
  console.warn('[Access]', msg);
  try {
    let el = document.getElementById('cc_toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cc_toast';
      el.style.cssText =
        'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);' +
        'background:#1e293b;color:#eaf1ff;padding:10px 14px;border-radius:10px;' +
        'border:1px solid #334155;font:14px/1.3 system-ui;z-index:9999';
      document.body.appendChild(el);
    }
    el.textContent = String(msg);
    el.style.opacity = '1';
    setTimeout(() => (el.style.opacity = '0'), 3000);
  } catch {
    /* no-op */
  }
}
