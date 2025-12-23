
(() => {
  'use strict';

  // ---------- Utils
  const $ = (id) => document.getElementById(id);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const nowISO = () => new Date().toISOString();
  const todayKey = () => new Date().toISOString().slice(0,10);

  function safeVibrate(pattern){
    try{ if(navigator.vibrate) navigator.vibrate(pattern); }catch(e){}
  }

  // ---------- Visual ambience
  const stars = $('stars');
  for(let i=0;i<38;i++){
    const s=document.createElement('div');
    s.className='star';
    s.style.left = (Math.random()*100).toFixed(2)+'%';
    s.style.top = (Math.random()*55).toFixed(2)+'%';
    s.style.animationDelay = (Math.random()*4).toFixed(2)+'s';
    s.style.opacity = (0.25+Math.random()*0.65).toFixed(2);
    stars.appendChild(s);
  }

  const particles = $('particles');
  const particleGlyphs = ['🍃','✨','🌿','❄️'];
  function spawnParticle(){
    const p=document.createElement('div');
    p.className='p';
    p.textContent=particleGlyphs[Math.floor(Math.random()*particleGlyphs.length)];
    p.style.left = (Math.random()*100).toFixed(2)+'%';
    p.style.animationDuration = (8+Math.random()*9).toFixed(2)+'s';
    p.style.animationDelay = (Math.random()*2).toFixed(2)+'s';
    p.style.transform = `translate3d(0, -40px, 0) rotate(${Math.random()*80}deg)`;
    particles.appendChild(p);
    setTimeout(() => p.remove(), 20000);
  }
  for(let i=0;i<12;i++) spawnParticle();
  setInterval(spawnParticle, 1600);

  // ---------- Secure storage (optional PIN)
  // State model: {v:350, name, pinEnabled, lockEnabled, soundEnabled, haptics, audio:{env,vol,on}, moods:[{date, mood, note, gratitude, energy}]}
  const STATE_KEY = 'aura_state_v350';
  const SEC_KEY = 'aura_sec_v350';

  const defaultState = () => ({
    v:350,
    createdAt: nowISO(),
    name: '',
    pinEnabled: false,
    lockEnabled: false,
    soundEnabled: true,
    haptics: true,
    audio: { env:'forest', vol:0.40, on:false },
    moods: []
  });

  async function deriveKey(pin, saltB64){
    const enc = new TextEncoder();
    const salt = saltB64 ? Uint8Array.from(atob(saltB64), c => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), {name:'PBKDF2'}, false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name:'PBKDF2', salt, iterations: 120000, hash:'SHA-256' },
      baseKey,
      { name:'AES-GCM', length: 256 },
      false,
      ['encrypt','decrypt']
    );
    const saltOut = saltB64 || btoa(String.fromCharCode(...salt));
    return { key, saltB64: saltOut };
  }

  async function encryptJSON(obj, pin){
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const secMeta = JSON.parse(localStorage.getItem(SEC_KEY) || '{}');
    const {key, saltB64} = await deriveKey(pin, secMeta.saltB64);
    const enc = new TextEncoder();
    const data = enc.encode(JSON.stringify(obj));
    const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, data);
    localStorage.setItem(SEC_KEY, JSON.stringify({ saltB64 }));
    const ctB64 = btoa(String.fromCharCode(...new Uint8Array(ct)));
    const ivB64 = btoa(String.fromCharCode(...iv));
    return { ctB64, ivB64 };
  }

  async function decryptJSON(payload, pin){
    const secMeta = JSON.parse(localStorage.getItem(SEC_KEY) || '{}');
    if(!secMeta.saltB64) throw new Error('NO_SALT');
    const {key} = await deriveKey(pin, secMeta.saltB64);
    const iv = Uint8Array.from(atob(payload.ivB64), c => c.charCodeAt(0));
    const ct = Uint8Array.from(atob(payload.ctB64), c => c.charCodeAt(0));
    const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct);
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(new Uint8Array(pt)));
  }

  function loadPlain(){
    try{ return JSON.parse(localStorage.getItem(STATE_KEY) || 'null') || defaultState(); }
    catch(e){ return defaultState(); }
  }

  function savePlain(st){
    localStorage.setItem(STATE_KEY, JSON.stringify(st));
  }

  // Encrypted blob is stored under STATE_KEY with {enc:true, ivB64, ctB64}
  async function saveState(st, pin){
    if(st.pinEnabled && pin){
      const payload = await encryptJSON(st, pin);
      localStorage.setItem(STATE_KEY, JSON.stringify({ enc:true, ...payload }));
    } else {
      savePlain(st);
    }
  }

  async function loadState(pin){
    const raw = localStorage.getItem(STATE_KEY);
    if(!raw) return defaultState();
    let parsed;
    try{ parsed = JSON.parse(raw); }catch(e){ return defaultState(); }
    if(parsed && parsed.enc){
      if(!pin) throw new Error('LOCKED');
      return await decryptJSON(parsed, pin);
    }
    return parsed || defaultState();
  }

  // Lightweight hash for PIN verification (not reversible)
  async function pinHash(pin){
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode('AURA|'+pin+'|v350'));
    return btoa(String.fromCharCode(...new Uint8Array(buf))).slice(0,44);
  }

  function getPinMeta(){
    try{ return JSON.parse(localStorage.getItem('aura_pin_meta_v350') || 'null'); }catch(e){ return null; }
  }
  function setPinMeta(meta){
    localStorage.setItem('aura_pin_meta_v350', JSON.stringify(meta));
  }

  // ---------- Audio
  const audio = {
    ctx:null,
    master:null,
    nodes:null,
    on:false,
    env:'forest',
    vol:0.40
  };

  function ensureAudioCtx(){
    if(audio.ctx) return audio.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return null;
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.0001;
    audio.master.connect(audio.ctx.destination);
    return audio.ctx;
  }

  function softClick(){
    if(!state.soundEnabled) return;
    const ctx = ensureAudioCtx();
    if(!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(440, t+0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.12);
    o.connect(g); g.connect(audio.master || ctx.destination);
    o.start(t); o.stop(t+0.13);
  }

  function buildAmbience(ctx, env){
    // soft pad + gentle noise bed
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(audio.master);

    const noiseLen = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i=0;i<noiseLen;i++) data[i] = (Math.random()*2-1) * 0.22;
    const ns = ctx.createBufferSource();
    ns.buffer=buf; ns.loop=true;

    const f = ctx.createBiquadFilter();
    f.type='lowpass';
    f.frequency.value = env==='night' ? 1200 : (env==='river' ? 1600 : 900);
    f.Q.value = 0.6;

    const nsGain = ctx.createGain();
    nsGain.gain.value = env==='rain' ? 0.30 : (env==='river' ? 0.22 : 0.16);

    ns.connect(f); f.connect(nsGain); nsGain.connect(g);

    // pad oscillators
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const o3 = ctx.createOscillator();
    o1.type='sine'; o2.type='sine'; o3.type='triangle';

    const base = env==='night' ? 196 : (env==='river' ? 220 : 207.65);
    o1.frequency.value = base;
    o2.frequency.value = base*1.5;
    o3.frequency.value = base*2;

    const pGain = ctx.createGain();
    pGain.gain.value = 0.10;

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type='sine'; lfo.frequency.value = 0.08;
    lfoGain.gain.value = env==='rain' ? 8 : 5;
    lfo.connect(lfoGain); lfoGain.connect(o1.frequency);

    const hp = ctx.createBiquadFilter();
    hp.type='highpass'; hp.frequency.value = 120;

    o1.connect(pGain); o2.connect(pGain); o3.connect(pGain);
    pGain.connect(hp); hp.connect(g);

    const t = ctx.currentTime;
    ns.start(t); o1.start(t); o2.start(t); o3.start(t); lfo.start(t);

    return {
      g,
      stop: () => {
        const now = ctx.currentTime;
        try{ g.gain.cancelScheduledValues(now); }catch(e){}
        try{ g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now); }catch(e){}
        try{ g.gain.exponentialRampToValueAtTime(0.0001, now+0.35); }catch(e){}
        setTimeout(() => {
          [ns,o1,o2,o3,lfo].forEach(x => { try{x.stop();}catch(e){} });
          try{ g.disconnect(); }catch(e){}
        }, 420);
      }
    };
  }

  async function audioStart(){
    if(!state.soundEnabled){
      setAudioStatus('Audio disattivato nelle impostazioni.');
      return;
    }
    const ctx = ensureAudioCtx();
    if(!ctx){ setAudioStatus('Audio non supportato.'); return; }
    if(ctx.state==='suspended'){ try{ await ctx.resume(); }catch(e){} }

    if(audio.nodes){ try{ audio.nodes.stop(); }catch(e){} audio.nodes=null; }
    audio.nodes = buildAmbience(ctx, audio.env);

    const t=ctx.currentTime;
    audio.master.gain.setValueAtTime(0.0001, t);
    audio.master.gain.exponentialRampToValueAtTime(clamp(audio.vol,0.05,1), t+0.8);
    audio.on=true;
    $('audioToggle').innerHTML = '⏸ <span>Pausa</span>';
    setAudioStatus('In riproduzione • volume '+Math.round(audio.vol*100)+'%');
  }
  function audioStop(){
    const ctx = audio.ctx;
    if(audio.nodes){ try{ audio.nodes.stop(); }catch(e){} audio.nodes=null; }
    if(ctx && audio.master){
      const t=ctx.currentTime;
      try{ audio.master.gain.cancelScheduledValues(t); }catch(e){}
      try{ audio.master.gain.setValueAtTime(Math.max(0.0001, audio.master.gain.value), t); }catch(e){}
      try{ audio.master.gain.exponentialRampToValueAtTime(0.0001, t+0.35); }catch(e){}
    }
    audio.on=false;
    $('audioToggle').innerHTML = '▶ <span>Play</span>';
    setAudioStatus('In pausa.');
  }
  function setAudioStatus(s){ $('audioStatus').textContent = s; }

  // ---------- Advice
  const advice = {
    calm: [
      'Tieniti vicino a ciò che è semplice: un bicchiere d\'acqua, una luce morbida, un respiro lento.',
      'Se puoi, fai 2 minuti di camminata lenta: piedi, aria, presenza.',
      'Scrivi una frase: “Oggi va bene anche così.”'
    ],
    tense: [
      'Contrai le spalle 2 secondi e poi lasciale cadere. Ripeti 3 volte.',
      'Scegli UNA cosa piccola da finire entro 10 minuti. Solo una.',
      'Respira 4‑2‑6: inspira 4, pausa 2, espira 6. Per 6 cicli.'
    ],
    tired: [
      'Se puoi, luce naturale sul viso per 60 secondi. Poi un sorso d\'acqua.',
      'Micro‑riposo: occhi chiusi 30 secondi, espira lungo.',
      'Riduci il rumore: metti il telefono in silenzio per 10 minuti.'
    ],
    down: [
      'Nomina 3 cose che vedi. Poi 2 suoni. Poi 1 sensazione. Sei qui.',
      'Fai un gesto gentile per te: una doccia breve o una tisana.',
      'Scrivi una gratitudine minuscola: anche “ho respirato” va bene.'
    ]
  };

  const quotes = [
    '“Niente è troppo piccolo per meritare cura.”',
    '“Un passo gentile è sempre un passo.”',
    '“La calma è forza che non urla.”',
    '“Il respiro è un ponte: torna qui.”',
    '“Oggi scegli morbidezza.”'
  ];

  // ---------- App state and boot
  let state = defaultState();
  let sessionPin = null;

  function setTime(){
    const d = new Date();
    $('time').textContent = d.toLocaleString('it-IT',{weekday:'long', hour:'2-digit', minute:'2-digit'});
  }

  function computeStreak(){
    // consecutive days with mood entries
    const days = new Set(state.moods.map(m => m.date));
    let streak=0;
    let cur = new Date();
    for(;;){
      const k = cur.toISOString().slice(0,10);
      if(days.has(k)) streak++;
      else break;
      cur.setDate(cur.getDate()-1);
    }
    return streak;
  }

  function todayMood(){
    const k=todayKey();
    return state.moods.find(m => m.date===k) || null;
  }

  function render(){
    setTime();
    const name = state.name ? ('Ciao, '+state.name+' ✨') : 'Ciao ✨';
    $('subtitle').textContent = 'Elfo nella Foresta • '+name;

    const st = computeStreak();
    $('streakText').textContent = st;

    const tm = todayMood();
    const energy = tm ? clamp(tm.energy ?? 55, 0, 100) : 55;
    $('energyFill').style.width = energy+'%';
    $('energyText').textContent = energy+'%';

    // quote / rune reacts to last mood
    const last = state.moods[state.moods.length-1];
    const mood = last ? last.mood : 'calm';
    const rune = mood==='calm' ? '🌿' : mood==='tense' ? '🔥' : mood==='tired' ? '🌙' : '💛';
    $('rune').textContent = rune;

    // occasional quote
    const q = quotes[Math.floor(Math.random()*quotes.length)];
    $('quote').textContent = q;

    // lock button dot
    const lockBtn = $('btnLock');
    lockBtn.innerHTML = '<span>🔒</span>' + (state.lockEnabled ? '<span class="dot"></span>' : '');
  }

  // ---------- Modals
  const modal = $('modal');
  const mTitle=$('mTitle'), mBody=$('mBody'), mContent=$('mContent');
  let modalResolve = null;

  function closeModal(){
    modal.classList.remove('show');
    modalResolve && modalResolve(false);
    modalResolve = null;
  }
  $('mCancel').addEventListener('click', closeModal);
  $('mOk').addEventListener('click', () => {
    modal.classList.remove('show');
    modalResolve && modalResolve(true);
    modalResolve = null;
  });

  function openModal({title, body, contentHTML, okText='Ok', cancelText='Chiudi'}){
    mTitle.textContent = title || '';
    mBody.innerHTML = body || '';
    mContent.innerHTML = contentHTML || '';
    $('mOk').textContent = okText;
    $('mCancel').textContent = cancelText;
    modal.classList.add('show');
    return new Promise(res => modalResolve = res);
  }

  // ---------- Demo (guided)
  async function runDemo(){
    // gentle guided sequence
    const steps = [
      {id:'bMood', text:'1/3 Tocca “Umore” e scegli come stai.'},
      {id:'bBreath', text:'2/3 Prova “Respiro” per 30 secondi.'},
      {id:'audioFab', text:'3/3 Attiva “Musica” per rendere tutto più rilassante.'}
    ];
    for(const s of steps){
      $('hint').textContent = s.text;
      const el = $(s.id);
      el.classList.add('shake');
      safeVibrate(state.haptics ? 20 : 0);
      await new Promise(r => setTimeout(r, 520));
      el.classList.remove('shake');
      await new Promise(r => setTimeout(r, 620));
    }
    $('hint').textContent = 'Demo finita. Ora fai un passo gentile: registra l\'umore di oggi.';
  }

  // ---------- Mood flow
    async function moodDialog(){
    const tm = todayMood();
    const current = tm ? tm.mood : null;

    const html = `
      <div class="grid2">
        <button class="ghost" data-mood="calm">🌿 Calmo</button>
        <button class="ghost" data-mood="tense">🔥 Teso</button>
        <button class="ghost" data-mood="tired">🌙 Stanco</button>
        <button class="ghost" data-mood="down">💛 Giù</button>
      </div>
      <div style="margin-top:12px" class="card">
        <div class="k">Energia (0‑100)</div>
        <input id="mEnergy" type="range" min="0" max="100" value="${tm ? clamp(tm.energy??55,0,100) : 55}">
        <div style="display:flex; justify-content:space-between; margin-top:6px; color:var(--dim2); font-weight:900; font-size:12px">
          <span>Scarico</span><span>Carico</span>
        </div>
      </div>
      <div style="margin-top:12px">
        <div class="p" style="margin-bottom:8px">Una nota (opzionale)</div>
        <textarea id="mNote" placeholder="Scrivi senza giudizio...">${tm && tm.note ? tm.note.replace(/</g,'&lt;') : ''}</textarea>
      </div>
      <div style="margin-top:10px">
        <div class="p" style="margin-bottom:8px">Gratitudine (opzionale)</div>
        <input id="mGrat" type="text" placeholder="Anche una cosa minuscola..." value="${tm && tm.gratitude ? tm.gratitude.replace(/</g,'&lt;') : ''}">
      </div>
      <div class="hint" style="margin-top:10px">Se hai impostato un PIN, questi contenuti vengono cifrati localmente.</div>
    `;

    let picked = current || 'calm';

    const confirmP = openModal({
      title: 'Come ti senti oggi?',
      body: current ? `Oggi risulta già registrato: <b>${current}</b>. Puoi aggiornare.` : 'Scegli una parola semplice.',
      contentHTML: html,
      okText: 'Salva',
      cancelText: 'Annulla'
    });

    const buttons = [...modal.querySelectorAll('[data-mood]')];
    const paint = () => {
      buttons.forEach(b => {
        const on = b.getAttribute('data-mood') === picked;
        b.style.borderColor = on ? 'rgba(111,227,166,.7)' : 'rgba(255,255,255,.14)';
        b.style.background = on ? 'rgba(111,227,166,.12)' : 'rgba(255,255,255,.06)';
      });
    };
    paint();
    buttons.forEach(b => b.addEventListener('click', () => { softClick(); picked = b.getAttribute('data-mood'); paint(); }));

    const confirmed = await confirmP;
    if(!confirmed) return;

    const energy = Number(modal.querySelector('#mEnergy')?.value ?? 55);
    const note = (modal.querySelector('#mNote')?.value ?? '').trim();
    const grat = (modal.querySelector('#mGrat')?.value ?? '').trim();

    upsertTodayMood({ mood: picked, energy, note, gratitude: grat });
    await persist();
    softSuccess();
    renderAll();
    maybeAward();
    maybeAdviceToast();
  }

  // ---------- Breath
    async function breathDialog(){
    const html = `
      <div class="card">
        <div class="k">Timer</div>
        <div class="v serif" style="font-size:26px" id="bTimer">00:30</div>
        <div class="hint">Inspira 4 • Trattieni 2 • Espira 6</div>
      </div>
      <div style="margin-top:12px" class="grid2">
        <button class="ghost" id="bStart">▶ Avvia</button>
        <button class="ghost" id="bStop">■ Ferma</button>
      </div>
      <div class="hint" style="margin-top:10px">Se vuoi, attiva l'audio “Pioggia” e segui il ritmo.</div>
    `;
    const confirmP = openModal({ title:'Respiro guidato', body:'Un minuto può cambiare il tono della giornata.', contentHTML: html, okText:'Fatto', cancelText:'Chiudi' });

    let left = 30;
    let int = null;

    const timerEl = () => modal.querySelector('#bTimer');
    const fmt = (s)=> `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

    function tick(){
      left = Math.max(0, left-1);
      const el = timerEl(); if(el) el.textContent = fmt(left);
      if(left===0){ stop(); softSuccess(); }
    }
    function start(){
      if(int) return;
      if(state.haptics) safeVibrate(15);
      left = 30;
      const el = timerEl(); if(el) el.textContent = fmt(left);
      int = setInterval(tick, 1000);
      breathCueLoop();
    }
    function stop(){
      if(int){ clearInterval(int); int=null; }
      stopBreathCue();
    }

    modal.querySelector('#bStart')?.addEventListener('click', ()=>{ softClick(); start(); });
    modal.querySelector('#bStop')?.addEventListener('click', ()=>{ softClick(); stop(); });

    const confirmed = await confirmP;
    stop();
    if(!confirmed) return;
  }

  // ---------- Advice quick
    async function adviceDialog(){
    const a = getAdvice();
    const html = `
      <div class="card">
        <div class="k">Oggi</div>
        <div class="v serif" style="font-size:20px; line-height:1.25">${a.title}</div>
        <div class="p" style="margin-top:10px; line-height:1.5">${a.text}</div>
      </div>
      <div style="margin-top:12px" class="grid2">
        <button class="ghost" id="aCopy">📋 Copia</button>
        <button class="ghost" id="aNext">✨ Altro</button>
      </div>
      <div class="hint" style="margin-top:10px">Consigli generativi: non sostituiscono pareri medici.</div>
    `;
    const p = openModal({ title:'Consiglio', body:'AURA non giudica. Ti accompagna.', contentHTML: html, okText:'Grazie', cancelText:'Chiudi' });

    modal.querySelector('#aCopy')?.addEventListener('click', async ()=>{
      softClick();
      try{ await navigator.clipboard.writeText(`${a.title}\n\n${a.text}`); toast('Copiato ✅'); }catch(e){ toast('Copia non disponibile'); }
    });
    modal.querySelector('#aNext')?.addEventListener('click', ()=>{
      softClick();
      modal.classList.remove('show');
      modalResolve && modalResolve(false);
      modalResolve = null;
      setTimeout(()=> adviceDialog(), 60);
    });

    await p;
  }

  // ---------- Journal
    async function journalDialog(){
    const html = `
      <div class="card">
        <div class="k">Diario (solo locale)</div>
        <div class="p">Scrivi liberamente. Se abiliti il PIN, il testo viene cifrato sul dispositivo.</div>
      </div>
      <div style="margin-top:12px">
        <textarea id="jText" placeholder="Oggi..."></textarea>
      </div>
      <div style="margin-top:12px" class="grid2">
        <button class="ghost" id="jExport">⬇ Export</button>
        <button class="ghost" id="jClear">🗑 Pulisci</button>
      </div>
      <div class="hint" style="margin-top:10px">Export crea un file .txt (nessun invio a server).</div>
    `;

    const p = openModal({ title:'Diario', body:'Qui puoi essere te stesso.', contentHTML: html, okText:'Salva', cancelText:'Chiudi' });

    const ta = ()=> modal.querySelector('#jText');
    const last = state.journal[state.journal.length-1];
    if(last && ta()) ta().value = last.text || '';

    modal.querySelector('#jExport')?.addEventListener('click', ()=>{
      softClick();
      const text = (ta()?.value ?? '').trim();
      if(!text){ toast('Niente da esportare'); return; }
      const blob = new Blob([text], {type:'text/plain;charset=utf-8'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `AURA_diario_${todayKey()}.txt`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=> URL.revokeObjectURL(a.href), 800);
      toast('Export creato ✅');
    });

    modal.querySelector('#jClear')?.addEventListener('click', ()=>{
      softClick();
      if(ta()) ta().value = '';
      toast('Pulito.');
    });

    const confirmed = await p;
    if(!confirmed) return;

    const text = (ta()?.value ?? '').trim();
    if(text){
      state.journal.push({ t: Date.now(), date: todayKey(), text });
      if(state.journal.length > 120) state.journal = state.journal.slice(-120);
      await persist();
      softSuccess();
      toast('Salvato ✅');
    }else{
      toast('Nessun testo.');
    }
  }

  // ---------- Journey
    async function journeyDialog(){
    const steps = state.moods.length;
    const html = `
      <div class="card">
        <div class="k">Passi registrati</div>
        <div class="v serif" style="font-size:34px">${steps}</div>
        <div class="hint">Un passo = un giorno con umore registrato.</div>
      </div>
      <div style="margin-top:12px" class="card">
        <div class="k">Stagione</div>
        <div class="v serif" style="font-size:20px">${seasonName()}</div>
        <div class="p" style="margin-top:6px">Ogni stagione cambia particelle e luce della foresta.</div>
      </div>
      <div style="margin-top:12px" class="card">
        <div class="k">Rituale rapido</div>
        <div class="p">1) Registra l'umore • 2) 30s di respiro • 3) Un micro‑obiettivo gentile.</div>
      </div>
    `;
    await openModal({ title:'Il tuo percorso', body:'Ogni giorno è un passo nella foresta.', contentHTML: html, okText:'Ok', cancelText:'Chiudi' });
  }

  // ---------- Stats
    async function statsDialog(){
    if(state.moods.length === 0){
      await openModal({
        title:'Statistiche',
        body:'Ancora nessun dato.',
        contentHTML:'<div class="card"><div class="k">Suggerimento</div><div class="v serif" style="font-size:18px">Registra l\'umore oggi. Bastano 10 secondi.</div></div>',
        okText:'Ok', cancelText:'Chiudi'
      });
      return;
    }
    const last = state.moods.slice(-14);
    const counts = {calm:0, tense:0, tired:0, down:0};
    last.forEach(x=> counts[x.mood] = (counts[x.mood]||0)+1);
    const max = Math.max(1, ...Object.values(counts));
    const bar = (label,val,emo)=> `
      <div class="card" style="display:flex; align-items:center; justify-content:space-between; gap:10px">
        <div style="display:flex; align-items:center; gap:10px">
          <div style="font-size:22px">${emo}</div>
          <div>
            <div class="k">${label}</div>
            <div class="p">${val} / ${last.length}</div>
          </div>
        </div>
        <div style="width:120px; height:10px; border-radius:999px; background:rgba(255,255,255,.08); overflow:hidden">
          <div style="height:100%; width:${Math.round((val/max)*100)}%; background:linear-gradient(135deg,var(--g1),var(--g2))"></div>
        </div>
      </div>`;
    const avgEnergy = Math.round(last.reduce((s,x)=> s+(x.energy||55),0)/last.length);
    const html = `
      <div class="card">
        <div class="k">Energia media (ultimi ${last.length})</div>
        <div class="v serif" style="font-size:34px">${avgEnergy}%</div>
      </div>
      <div style="margin-top:12px">${bar('Calmo',counts.calm,'🌿')}${bar('Teso',counts.tense,'🔥')}${bar('Stanco',counts.tired,'🌙')}${bar('Giù',counts.down,'💛')}</div>
      <div class="hint" style="margin-top:10px">Dati solo locali. Nessun tracciamento.</div>
    `;
    await openModal({ title:'Statistiche', body:'Un piccolo sguardo, senza pressione.', contentHTML: html, okText:'Ok', cancelText:'Chiudi' });
  }

  // ---------- Settings
    async function settingsDialog(){
    const html = `
      <div class="card">
        <div class="k">Tema</div>
        <div class="apGrid">
          ${themes.map(t => `<button class="ghost" data-theme="${t.id}">${t.emoji} ${t.name}</button>`).join('')}
        </div>
      </div>
      <div style="margin-top:12px" class="card">
        <div class="k">Feedback</div>
        <div style="display:flex; gap:10px; margin-top:10px">
          <button class="ghost" id="tHaptics">${state.haptics ? '📳 Haptics ON' : '📳 Haptics OFF'}</button>
          <button class="ghost" id="tSfx">${state.sfx ? '🔔 SFX ON' : '🔔 SFX OFF'}</button>
        </div>
        <div class="hint" style="margin-top:10px">Su iPhone la vibrazione può essere limitata da iOS.</div>
      </div>
      <div style="margin-top:12px" class="card">
        <div class="k">Privacy</div>
        <button class="ghost" id="tLock">${state.lockEnabled ? '🔒 Blocco PIN: ON' : '🔒 Blocco PIN: OFF'}</button>
        <div class="hint" style="margin-top:10px">Il PIN abilita anche la cifratura locale (AES‑GCM).</div>
      </div>
      <div style="margin-top:12px" class="card">
        <div class="k">Dati</div>
        <div class="grid2">
          <button class="ghost" id="tExportAll">⬇ Export JSON</button>
          <button class="ghost" id="tReset">🧨 Reset</button>
        </div>
        <div class="hint" style="margin-top:10px">Export salva un file locale. Reset cancella tutto sul dispositivo.</div>
      </div>
    `;

    const p = openModal({ title:'Impostazioni', body:'Personalizza AURA senza perdere la calma.', contentHTML: html, okText:'Fatto', cancelText:'Chiudi' });

    [...modal.querySelectorAll('[data-theme]')].forEach(b=>{
      b.addEventListener('click', ()=>{
        softClick();
        state.theme = b.getAttribute('data-theme');
        applyTheme();
        toast('Tema applicato');
        persist();
      });
    });

    modal.querySelector('#tHaptics')?.addEventListener('click', ()=>{
      softClick();
      state.haptics = !state.haptics;
      modal.querySelector('#tHaptics').textContent = state.haptics ? '📳 Haptics ON' : '📳 Haptics OFF';
      persist();
    });
    modal.querySelector('#tSfx')?.addEventListener('click', ()=>{
      softClick();
      state.sfx = !state.sfx;
      modal.querySelector('#tSfx').textContent = state.sfx ? '🔔 SFX ON' : '🔔 SFX OFF';
      persist();
    });
    modal.querySelector('#tLock')?.addEventListener('click', async ()=>{
      softClick();
      if(state.lockEnabled){
        state.lockEnabled = false;
        state.pinSalt = null;
        state.pinVerifier = null;
        cryptoKey = null;
        await persist();
        toast('Blocco disattivato');
        modal.querySelector('#tLock').textContent = '🔒 Blocco PIN: OFF';
        renderAll();
      }else{
        await lockSetupFlow();
        modal.querySelector('#tLock').textContent = state.lockEnabled ? '🔒 Blocco PIN: ON' : '🔒 Blocco PIN: OFF';
        renderAll();
      }
    });

    modal.querySelector('#tExportAll')?.addEventListener('click', ()=>{
      softClick();
      const blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json;charset=utf-8'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `AURA_export_${todayKey()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=> URL.revokeObjectURL(a.href), 800);
      toast('Export creato ✅');
    });

    modal.querySelector('#tReset')?.addEventListener('click', ()=>{
      softClick();
      if(!confirm('Vuoi cancellare TUTTI i dati locali di AURA?')) return;
      localStorage.removeItem(STORAGE_KEY);
      state = structuredClone(DEFAULT_STATE);
      cryptoKey = null;
      renderAll();
      toast('Reset completato');
    });

    await p;
  }

  // ---------- Persist wrapper
  async function persist(){
    // keep audio prefs synced
    state.audio.env = audio.env;
    state.audio.vol = audio.vol;
    state.audio.on = audio.on;
    try{ await saveState(state, state.pinEnabled ? sessionPin : null); }
    catch(e){ savePlain(state); }
  }

  // ---------- Lock / intro logic
  async function boot(){
    // Register SW
    if('serviceWorker' in navigator){
      try{ await navigator.serviceWorker.register('./sw.js'); }catch(e){}
    }

    // Decide intro vs normal
    const pinMeta = getPinMeta();
    const hasState = !!localStorage.getItem(STATE_KEY);

    if(!hasState){
      $('intro').classList.add('show');
      return;
    }

    // If locked, request PIN
    if(pinMeta && pinMeta.enabled){
      // try silent load if not locked
      if(state.lockEnabled){
        $('lock').classList.add('show');
        return;
      }
    }

    // load plain first
    try{
      state = loadPlain();
      if(state && state.enc){
        // old blob; force unlock
        $('lock').classList.add('show');
        return;
      }
    }catch(e){ state = defaultState(); }

    // If encrypted, require pin anyway
    try{
      const raw = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      if(raw && raw.enc){
        $('lock').classList.add('show');
        return;
      }
    }catch(e){}

    // read and sync audio settings
    audio.env = state.audio?.env || 'forest';
    audio.vol = state.audio?.vol ?? 0.40;
    $('audioEnv').value = audio.env;
    $('audioVol').value = Math.round(audio.vol*100);
    $('volLbl').textContent = Math.round(audio.vol*100)+'%';

    render();
  }

  // Intro actions
  $('introStart').addEventListener('click', async () => {
    softClick();
    const name = $('nameInput').value.trim().slice(0,24);
    const pin = $('pinInput').value.trim();
    state = defaultState();
    state.name = name;

    if(pin){
      if(!/^\d{4,8}$/.test(pin)){
        alert('PIN non valido: usa 4-8 cifre.');
        return;
      }
      state.pinEnabled = true;
      state.lockEnabled = true;
      sessionPin = pin;
      const h = await pinHash(pin);
      setPinMeta({enabled:true, hash:h});
      await saveState(state, sessionPin);
    } else {
      setPinMeta({enabled:false, hash:''});
      savePlain(state);
    }

    $('intro').classList.remove('show');
    render();
    // auto demo
    setTimeout(runDemo, 350);
  });

  $('introSkip').addEventListener('click', () => {
    softClick();
    state = defaultState();
    savePlain(state);
    setPinMeta({enabled:false, hash:''});
    $('intro').classList.remove('show');
    render();
  });

  // Unlock
  $('unlockBtn').addEventListener('click', async () => {
    softClick();
    const pin = $('unlockPin').value.trim();
    const meta = getPinMeta();
    if(!(meta && meta.enabled)){
      $('lock').classList.remove('show');
      return;
    }
    if(!/^\d{4,8}$/.test(pin)){
      $('lockHint').textContent='PIN non valido.';
      $('unlockPin').classList.add('shake');
      setTimeout(()=>$('unlockPin').classList.remove('shake'), 320);
      if(state.haptics) safeVibrate([18,40,18]);
      return;
    }
    const h = await pinHash(pin);
    if(h !== meta.hash){
      $('lockHint').textContent='PIN errato. Riprova.';
      $('unlockPin').classList.add('shake');
      setTimeout(()=>$('unlockPin').classList.remove('shake'), 320);
      if(state.haptics) safeVibrate([18,40,18]);
      return;
    }
    try{
      sessionPin = pin;
      state = await loadState(sessionPin);
      state.pinEnabled = true;
      audio.env = state.audio?.env || 'forest';
      audio.vol = state.audio?.vol ?? 0.40;
      $('audioEnv').value = audio.env;
      $('audioVol').value = Math.round(audio.vol*100);
      $('volLbl').textContent = Math.round(audio.vol*100)+'%';
      $('lock').classList.remove('show');
      render();
    }catch(e){
      $('lockHint').textContent='Impossibile decrittare i dati.';
    }
  });

  // ---------- UI hooks
  $('elfWrap').addEventListener('click', () => {
    // sparkle + soft sound
    softClick();
    if(state.haptics) safeVibrate(12);
    $('elfWrap').classList.add('happy');
    setTimeout(()=>$('elfWrap').classList.remove('happy'), 520);

    // rotate hint/advice
    const last = state.moods[state.moods.length-1];
    const mood = last ? last.mood : 'calm';
    const a = advice[mood] || advice.calm;
    $('hint').textContent = a[Math.floor(Math.random()*a.length)];
  });

  // Buttons
  $('bMood').addEventListener('click', async ()=>{ softClick(); await moodDialog(); });
  $('bBreath').addEventListener('click', async ()=>{ softClick(); await breathDialog(); });
  $('bAdvice').addEventListener('click', async ()=>{ softClick(); await adviceDialog(); });
  $('bJournal').addEventListener('click', async ()=>{ softClick(); await journalDialog(); });
  $('bJourney').addEventListener('click', async ()=>{ softClick(); await journeyDialog(); });
  $('bHelp').addEventListener('click', async ()=>{ softClick(); await runDemo(); });

  $('btnStats').addEventListener('click', async ()=>{ softClick(); await statsDialog(); });
  $('btnSettings').addEventListener('click', async ()=>{ softClick(); await settingsDialog(); });
  $('btnLock').addEventListener('click', async ()=>{
    softClick();
    const meta = getPinMeta();
    if(meta && meta.enabled){
      state.lockEnabled = !state.lockEnabled;
      await persist();
      render();
      $('hint').textContent = state.lockEnabled ? 'Blocco attivo: al prossimo avvio verrà chiesto il PIN.' : 'Blocco disattivato.';
      if(state.haptics) safeVibrate(state.lockEnabled ? [10,20,10] : 12);
    } else {
      $('hint').textContent = 'Per proteggere i dati: Impostazioni → Imposta PIN.';
      if(state.haptics) safeVibrate([18,40,18]);
    }
  });

  // Audio panel
  const audioPanel = $('audioPanel');
  $('audioFab').addEventListener('click', () => {
    softClick();
    audioPanel.classList.toggle('open');
    if(state.haptics) safeVibrate(10);
  });
  $('audioClose').addEventListener('click', () => { softClick(); audioPanel.classList.remove('open'); });
  $('audioToggle').addEventListener('click', async () => { softClick(); audio.on ? audioStop() : await audioStart(); await persist(); });
  $('audioEnv').addEventListener('change', async (e) => { softClick(); audio.env = e.target.value; if(audio.on) await audioStart(); await persist(); });
  $('audioVol').addEventListener('input', (e) => {
    audio.vol = clamp(Number(e.target.value)/100, 0.05, 1);
    $('volLbl').textContent = Math.round(audio.vol*100)+'%';
    if(audio.ctx && audio.master){
      const t = audio.ctx.currentTime;
      try{ audio.master.gain.cancelScheduledValues(t); }catch(err){}
      try{ audio.master.gain.setValueAtTime(Math.max(0.0001, audio.master.gain.value), t); }catch(err){}
      try{ audio.master.gain.exponentialRampToValueAtTime(audio.vol, t+0.15); }catch(err){}
    }
    if(audio.on) setAudioStatus('In riproduzione • volume '+Math.round(audio.vol*100)+'%');
    persist();
  });

  // Keep time fresh
  setTime();
  setInterval(setTime, 15000);

  // Boot
  boot().then(render).catch(()=>{});
})();
