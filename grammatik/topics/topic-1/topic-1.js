<script>
/*!
 * topic-1.js – universeller Datensatz-Loader für Lückentexte
 * - Lädt JSON-Dateien (per fetch)
 * - Optional: prüft SHA-256-Hash aus .sha256-Begleitdatei
 * - Validiert & normalisiert Schema: { text: string, ans: string|string[], art?: "der"|"die"|"das"|"xxx" }
 * - Bietet Map: Level → Dateiname (konfigurierbar)
 *
 * Globale API: window.TopicLoader
 *   TopicLoader.configure({ basePath, levelMap })
 *   TopicLoader.loadByLevel(level, opts) -> Array von Items
 *   TopicLoader.loadDataset(url, opts)   -> Array von Items
 *
 * opts:
 *   { verifyHash?: boolean, fallback?: Array, signal?: AbortSignal }
 *
 * Benötigt keine weiteren Libraries.
 */

(function(){
  const DEFAULTS = {
    basePath: 'topics/topic-1/',
    levelMap: {
      // Passe die Namen an deine Dateien an:
      'A1_1': 'a1-1-21d.json',
      'A1_2': 'a1-2-21d.json',
      'A2'  : 'a2-21d.json',
      'B1'  : 'b1-21d.json',
      'B2'  : 'b2-21d.json',
    }
  };

  const state = {
    basePath: DEFAULTS.basePath,
    levelMap: { ...DEFAULTS.levelMap },
    cache: new Map() // url -> Promise<Array>
  };

  /** Öffentliche Konfiguration */
  function configure(cfg={}){
    if (cfg.basePath) state.basePath = String(cfg.basePath).replace(/\/+$/, '') + '/';
    if (cfg.levelMap && typeof cfg.levelMap === 'object') state.levelMap = { ...state.levelMap, ...cfg.levelMap };
  }

  /** Hilfsfunktionen */
  function isString(x){ return typeof x === 'string'; }
  function toArray(x){ return Array.isArray(x) ? x : (x == null ? [] : [x]); }
  function trimStr(x){ return isString(x) ? x.trim() : x; }

  function normalizeItem(raw, index){
    const out = {};
    // text
    if (!isString(raw.text)) {
      throw new Error(`Item ${index+1}: "text" fehlt oder ist kein String.`);
    }
    out.text = String(raw.text);

    // ans
    const ansRaw = ('ans' in raw) ? raw.ans : null;
    const arr = toArray(ansRaw).map(v => trimStr(String(v||'')));
    if (!arr.length || arr.some(v => !v)) {
      throw new Error(`Item ${index+1}: "ans" leer oder ungültig.`);
    }
    out.ans = arr;

    // art (optional)
    if (raw.art != null && String(raw.art).trim() !== '') {
      const a = String(raw.art).trim().toLowerCase();
      const allowed = new Set(['der','die','das','xxx']);
      if (!allowed.has(a)) {
        throw new Error(`Item ${index+1}: "art" ist ungültig (erlaubt: der|die|das|xxx).`);
      }
      out.art = a;
    }

    return out;
  }

  function normalizeList(json){
    if (!Array.isArray(json)) {
      throw new Error('Datensatz muss ein Array sein.');
    }
    return json.map((item, i) => normalizeItem(item, i));
  }

  async function sha256Hex(buf){
    // nutzt WebCrypto; Browser-unterstützt
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map(b => b.toString(16).padStart(2,'0')).join('');
  }

  async function fetchText(url, opts){
    const res = await fetch(url, { cache: 'no-cache', signal: opts?.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} beim Laden von ${url}`);
    return await res.text();
  }

  async function fetchJsonWithOptionalHash(url, opts){
    // 1) JSON als Text laden (für Hash)
    const txt = await fetchText(url, opts);
    // 2) Optional Hash prüfen
    if (opts?.verifyHash) {
      const expectedUrl = url.replace(/\.json(\?.*)?$/i, '.sha256$1');
      try {
        const expected = (await fetchText(expectedUrl, opts)).trim().toLowerCase();
        const buf = new TextEncoder().encode(txt);
        const actual = await sha256Hex(buf);
        if (expected !== actual) {
          throw new Error(`Integritätsprüfung fehlgeschlagen: erwarteter Hash ${expected}, erhalten ${actual}`);
        }
      } catch (e) {
        throw new Error(`Hash-Datei fehlt oder ist ungültig (${e.message||e}) – ${url}`);
      }
    }
    // 3) JSON parsen
    try {
      return JSON.parse(txt);
    } catch (e) {
      throw new Error(`JSON-Parsing fehlgeschlagen: ${e.message||e}`);
    }
  }

  /** Kern: Datensatz laden + validieren + normalisieren */
  async function loadDataset(url, opts={}){
    // Cache: gleiche URL nicht mehrfach laden
    if (state.cache.has(url)) return state.cache.get(url);

    const job = (async ()=>{
      try{
        const raw = await fetchJsonWithOptionalHash(url, opts);
        const list = normalizeList(raw);
        return list;
      }catch(err){
        // Fallback?
        if (Array.isArray(opts.fallback) && opts.fallback.length) {
          console.warn('[TopicLoader] Fehler beim Laden, nutze Fallback:', err);
          return normalizeList(opts.fallback);
        }
        throw err;
      }
    })();

    state.cache.set(url, job);
    return job;
  }

  /** Quality-of-life: Level → Dateiname → Load */
  function levelToUrl(level){
    const key = String(level||'').toUpperCase();
    const mapKey = (key === 'A1.1') ? 'A1_1'
                 : (key === 'A1.2') ? 'A1_2'
                 : key.replace('.', '_');
    const file = state.levelMap[mapKey];
    if (!file) throw new Error(`Kein Dateiname für Level "${level}" konfiguriert.`);
    return state.basePath + file;
  }

  async function loadByLevel(level, opts={}){
    const url = levelToUrl(level);
    return loadDataset(url, opts);
  }

  // Expose global
  window.TopicLoader = {
    configure,
    loadDataset,
    loadByLevel,
    /** debug: zeigt aktuelle Konfiguration */
    _config(){ return { basePath: state.basePath, levelMap: { ...state.levelMap } }; }
  };
})();
</script>
