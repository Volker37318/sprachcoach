// /assets/js/access.js
(function(){
  const TRIAL_DAYS = 21;

  function hasPro(){
    const p = (localStorage.getItem('paket')||'').toLowerCase();
    if(p==='1'||p==='3'||p==='lifetime') return true;
    if(localStorage.getItem('ts')) return true;
    if(localStorage.getItem('proToken')) return true;
    return false;
  }

  function anyTrialActive(){
    const now = Date.now();
    // Deine topic-basierten Keys: cc_trial_until::<topic>
    for(let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if(k && k.startsWith('cc_trial_until::')){
        const until = Number(localStorage.getItem(k)||0);
        if(until > now) return true;
      }
    }
    // Fallback: generischer Startstempel
    const start = Number(localStorage.getItem('sp_trial_started_at')||0);
    return !!(start && (now - start) < TRIAL_DAYS*86400000);
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    if(!(hasPro() || anyTrialActive())){
      window.location.href = '/preise.html#app-guard';
    }
  });
})();
