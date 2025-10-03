
// ===== ÉTAT GLOBAL =====
const state = {
  page: "menu",
  day: "",
  points: 0,
  answered: {},        // quiz normal
  // Cartes:
  cards: {
    memory: { deck: [], flipped: [], found: {}, moves: 0, time: 60, tick: null },
    vision: { idx: 0, points: 0, timeLeft: 0, tick: null },
    drills: { idx: 0, done: 0 }
  }
};
let CURRENT_QS = []; // liste actuellement affichée pour le quiz classique

// ===== DONNÉES =====
const DB = { questions: {}, cards: { memory_pairs: [], vision: [], drills: [] } };

// ===== CHARGEMENT =====
async function loadAll() {
  try {
    const qRes = await fetch("./data.json");
    const qData = await qRes.json();
    DB.questions = qData.questions || {};
  } catch(e){ console.error("data.json", e); }

  try {
    const cRes = await fetch("./cards.json");
    const cData = await cRes.json();
    DB.cards.memory_pairs = cData.memory_pairs || [];
    DB.cards.vision = cData.vision || [];
    DB.cards.drills = cData.drills || [];
  } catch(e){ console.error("cards.json", e); }

  render();
}

// ===== OUTILS QUIZ CLASSIQUE =====
function questionsToday(){ return DB.questions[state.day] || []; }
function allQuestions(){
  let all=[]; for (let d in DB.questions) if (Array.isArray(DB.questions[d])) all=all.concat(DB.questions[d]); return all;
}
function pointsFor(q){ return Number.isFinite(q.p)? q.p : 10; }
function rewardBadge(pts){ return pts>=60 ? "🏆 Or" : pts>=30 ? "🥈 Argent" : "🥉 Bronze"; }
function qKey(q){ return q.q; }
function ensureRecord(q){ const k=qKey(q); if(!state.answered[k]) state.answered[k]={correct:false,tries:[]}; return state.answered[k]; }
function resetSession(){ state.points=0; state.answered={}; render(); }
function go(p){ state.page=p; render(); }

// ===== RÉPONSE QCM =====
function answerQuestion(q, choice){
  const rec = ensureRecord(q);
  if (choice===q.a){
    const first = rec.tries.length===0;
    if (!rec.correct){
      rec.correct=true;
      if (first){ state.points += pointsFor(q); alert(`✅ +${pointsFor(q)} pts`); }
      else { alert("✅ Bonne réponse (0 pt)"); }
    } else { alert("⭐ Déjà validée"); }
  } else {
    if (!rec.tries.includes(choice)) rec.tries.push(choice);
    alert("❌ Essaie encore");
  }
  render();
}

// ===== VUES =====
const V = {};
function scoreHeader(){ return `<div class="card"><b>Points :</b> ${state.points} • <b>Récompense :</b> ${rewardBadge(state.points)}</div>`; }

V.menu = () => `
  <h2>Menu principal</h2>
  ${scoreHeader()}
  <button data-action="day">📅 Quiz du jour</button>
  <button data-action="all">📚 Toutes les questions</button>
  <button data-action="cards">🃏 Cartes (Mémoire • Vision • Drills)</button>
`;

function selectDay(){
  const jours=["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche","avantpasse"];
  const choix=prompt("Jour : lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche, avantpasse");
  if (choix && jours.includes(choix.toLowerCase())){ state.day=choix.toLowerCase(); go("quiz"); }
  else alert("Jour invalide");
}

function renderQuestion(q,i){
  const rec=ensureRecord(q);
  return `
    <div class="card">
      <div class="badge">Q${i+1} • ${pointsFor(q)} pts ${rec.correct?"⭐":""}</div>
      <p><b>${q.q}</b></p>
      ${q.c.map((c,j)=>{
        const isGood=j===q.a, tried=rec.tries.includes(j);
        let cls=""; if (rec.correct && isGood) cls="correct"; else if (tried) cls="wrong";
        return `<button class="ans ${cls}" data-i="${i}" data-j="${j}">${c}</button>`;
      }).join("")}
    </div>
  `;
}

V.quiz = ()=>{
  const qs=questionsToday(); CURRENT_QS = qs;
  if (!qs.length) return scoreHeader()+`<p>Aucune question pour <b>${state.day||"?"}</b>.</p><button data-action="back">⬅ Retour</button>`;
  let h=scoreHeader()+`<h2>📅 Quiz du jour (${state.day})</h2>`;
  qs.forEach((q,i)=> h+=renderQuestion(q,i));
  return h+`<button data-action="back">⬅ Retour</button>`;
};

V.quizAll = ()=>{
  const qs=allQuestions(); CURRENT_QS = qs;
  if (!qs.length) return scoreHeader()+`<p>Aucune question.</p><button data-action="back">⬅ Retour</button>`;
  let h=scoreHeader()+`<h2>📚 Toutes les questions (${qs.length})</h2>`;
  qs.forEach((q,i)=> h+=renderQuestion(q,i));
  return h+`<button data-action="back">⬅ Retour</button>`;
};

// ====== CARTES : MENU ======
V.cardsMenu = () => `
  <h2>🃏 Cartes – Choisis un mode</h2>
  <div class="card">
    <p><b>Mémoire (paires)</b> – Associe 6 paires (12 cartes) en un minimum de coups avant la fin du temps.</p>
    <button data-action="memStart">🧠 Lancer Mémoire</button>
  </div>
  <div class="card">
    <p><b>Vision</b> – Cartes rapides (QCM) avec chrono par carte.</p>
    <button data-action="visionStart">👀 Lancer Vision</button>
  </div>
  <div class="card">
    <p><b>Drills</b> – Automatismes courts (mini minuteur), tu valides “Fait”.</p>
    <button data-action="drillStart">⚙️ Lancer Drills</button>
  </div>
  <button data-action="back">⬅ Retour</button>
`;

// ====== MÉMOIRE (PAIRES) ======
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function memStart(){
  const base = DB.cards.memory_pairs.slice(0,6); // 6 paires
  let deck = [];
  base.forEach((b,idx)=>{ deck.push({k:b.id+"A",id:b.id,emoji:b.emoji,label:b.label}); deck.push({k:b.id+"B",id:b.id,emoji:b.emoji,label:b.label}); });
  state.cards.memory.deck = shuffle(deck);
  state.cards.memory.flipped = []; state.cards.memory.found = {}; state.cards.memory.moves = 0; state.cards.memory.time = 60;
  clearInterval(state.cards.memory.tick);
  state.cards.memory.tick = setInterval(()=>{
    state.cards.memory.time = Math.max(0, state.cards.memory.time-1);
    const t = document.getElementById("mem-timer"); if (t) t.textContent = state.cards.memory.time+"s";
    if (state.cards.memory.time===0) clearInterval(state.cards.memory.tick);
  }, 1000);
  go("cardsMemory");
}

function memFlip(index){
  const M = state.cards.memory;
  if (M.found[index]) return;                 // déjà trouvé
  if (M.flipped.includes(index)) return;      // déjà face visible
  if (M.flipped.length === 2) return;         // attendre résolution

  M.flipped.push(index);
  render();

  if (M.flipped.length === 2){
    M.moves++;
    const [i1,i2] = M.flipped;
    const c1 = M.deck[i1], c2 = M.deck[i2];
    setTimeout(()=>{
      if (c1.id === c2.id){
        M.found[i1]=true; M.found[i2]=true;
      }
      M.flipped = [];
      render();
      // victoire ?
      const allFound = Object.keys(M.found).length === M.deck.length;
      if (allFound){
        clearInterval(M.tick);
        alert(`🏁 Terminé ! Coups: ${M.moves} • Temps restant: ${M.time}s`);
      }
    }, 500);
  }
}

V.cardsMemory = ()=>{
  const M = state.cards.memory;
  const cards = M.deck.map((c,idx)=>{
    const face = M.found[idx] || M.flipped.includes(idx);
    return `
      <div class="mem-card ${M.found[idx]?"found":""}">
        <button data-action="memFlip" data-i="${idx}">
          ${face ? `<span class="mem-emoji">${c.emoji}</span><span class="mem-label">${c.label}</span>`
                 : `🃏`}
        </button>
      </div>`;
  }).join("");

  return `
    <h2>🧠 Mémoire (paires)</h2>
    <div class="card">
      <b>Temps :</b> <span id="mem-timer">${M.time}s</span> • <b>Coups :</b> ${M.moves}
    </div>
    <div class="grid">${cards}</div>
    <button data-action="cards">⬅ Mode Cartes</button>
  `;
};

// ====== VISION ======
function visionStart(){
  const VZ = state.cards.vision; VZ.idx=0; VZ.points=0; VZ.timeLeft=0;
  clearInterval(VZ.tick);
  go("cardsVision");
  visionNext(); // affiche première carte
}
function visionStartTimer(sec){
  const VZ = state.cards.vision; VZ.timeLeft = sec;
  clearInterval(VZ.tick);
  VZ.tick = setInterval(()=>{
    VZ.timeLeft = Math.max(0, VZ.timeLeft-1);
    const e = document.getElementById("vz-timer"); if (e) e.textContent = VZ.timeLeft+"s";
    if (VZ.timeLeft===0) clearInterval(VZ.tick);
  }, 1000);
}
function visionCurrent(){ return DB.cards.vision[state.cards.vision.idx]; }
function visionAnswer(j){
  const VZ = state.cards.vision; const card = visionCurrent(); if (!card) return;
  const first = (card._tried? false : true);
  card._tried = true;
  if (j===card.a){
    let pts = card.p||10;
    if (first && VZ.timeLeft>0) pts += 5; // bonus vitesse
    VZ.points += pts;
    alert(`✅ +${pts} pts (total ${VZ.points})`);
    visionNext();
  } else {
    alert("❌ Essaie encore");
    render(); // on laisse retenter mais sans bonus
  }
}
function visionNext(){
  const VZ = state.cards.vision;
  if (VZ.idx >= DB.cards.vision.length){ clearInterval(VZ.tick); alert(`🏁 Vision terminé • ${VZ.points} pts`); go("cardsMenu"); return; }
  const card = DB.cards.vision[VZ.idx];
  card._tried = false;
  visionStartTimer(card.t || 6);
  render();
}
V.cardsVision = ()=>{
  const VZ = state.cards.vision;
  const card = DB.cards.vision[VZ.idx];
  if (!card) return `<p>Aucune carte Vision.</p><button data-action="cards">⬅ Mode Cartes</button>`;
  const opts = card.o.map((c,j)=> `<button data-action="vzAns" data-j="${j}">${c}</button>`).join("");
  return `
    <h2>👀 Vision</h2>
    <div class="card">
      <div class="badge">Carte ${VZ.idx+1}/${DB.cards.vision.length} • ⏱ <span id="vz-timer">${VZ.timeLeft}s</span> • Points: ${VZ.points}</div>
      <p><b>${card.s}</b></p>
      ${opts}
    </div>
    <button data-action="vzNext">➡️ Carte suivante</button>
    <button data-action="cards">⬅ Mode Cartes</button>
  `;
};

// ====== DRILLS ======
function drillStart(){ state.cards.drills.idx=0; state.cards.drills.done=0; go("cardsDrills"); render(); }
function drillDone(){ state.cards.drills.done++; state.cards.drills.idx++; if (state.cards.drills.idx>=DB.cards.drills.length){ alert(`🏁 Drills terminé • ${state.cards.drills.done}/${DB.cards.drills.length} faits`); go("cardsMenu"); } render(); }
function drillSkip(){ state.cards.drills.idx++; if (state.cards.drills.idx>=DB.cards.drills.length){ alert("🏁 Drills terminé"); go("cardsMenu"); } render(); }

V.cardsDrills = ()=>{
  const D = state.cards.drills;
  const card = DB.cards.drills[D.idx];
  if (!card) return `<p>Aucun drill.</p><button data-action="cards">⬅ Mode Cartes</button>`;
  return `
    <h2>⚙️ Drills (Automatismes)</h2>
    <div class="card">
      <div class="badge">Drill ${D.idx+1}/${DB.cards.drills.length} • Faits: ${D.done}</div>
      <p style="font-size:18px;"><b>${card.cue}</b></p>
      <p>⏱ ${card.sec}s • Réalise le geste, puis valide.</p>
      <button data-action="drillDone">✅ Fait</button>
      <button data-action="drillSkip">⏭️ Passer</button>
    </div>
    <button data-action="cards">⬅ Mode Cartes</button>
  `;
};

// ===== RENDU =====
function render(){
  const root=document.getElementById("app");
  const view = V[state.page] ? V[state.page]() : "<p>Chargement…</p>";
  root.innerHTML = view;
}

// ===== DÉLÉGATION CLICS =====
document.addEventListener("click", (e)=>{
  const b = e.target.closest("button"); if (!b) return;
  const act = b.getAttribute("data-action");

  // Menu principal & quiz classique
  if (act==="day"){ selectDay(); return; }
  if (act==="all"){ go("quizAll"); return; }
  if (act==="back"){ go("menu"); return; }
  if (b.classList.contains("ans")){
    const i=Number(b.getAttribute("data-i")), j=Number(b.getAttribute("data-j"));
    const q = CURRENT_QS[i]; if (q) answerQuestion(q,j);
    return;
  }

  // Cartes : navigation
  if (act==="cards"){ go("cardsMenu"); return; }

  // Mémoire
  if (act==="memStart"){ memStart(); return; }
  if (act==="memFlip"){ const i=Number(b.getAttribute("data-i")); memFlip(i); return; }

  // Vision
  if (act==="visionStart"){ visionStart(); return; }
  if (act==="vzAns"){ const j=Number(b.getAttribute("data-j")); visionAnswer(j); return; }
  if (act==="vzNext"){ state.cards.vision.idx++; visionNext(); return; }

  // Drills
  if (act==="drillStart"){ drillStart(); return; }
  if (act==="drillDone"){ drillDone(); return; }
  if (act==="drillSkip"){ drillSkip(); return; }
});

// ===== INIT =====
loadAll();
