"use strict";
/* ===================== Prawko — kategoria B ===================== */

const EXAM = {
  basic: [[3, 10], [2, 6], [1, 4]],       // [waga, ile pytań] — jak w rozporządzeniu
  specialist: [[3, 6], [2, 4], [1, 2]],
  readSec: 20, answerSec: 15, specSec: 50,
  pass: 68, max: 74,
};
const LESSON_LEN = 12;                     // pytań w jednej lekcji
const XP_RIGHT = 10, XP_PERFECT = 25;
const MASTER_BOX = 3;                      // od tylu poprawnych z rzędu pytanie = opanowane
const GOALS = [[30, "Spokojnie"], [50, "Normalnie"], [100, "Ostro"], [200, "Maraton"]];
const LANGS = { uk: "українська", en: "English", de: "Deutsch" };
const KEY = "prawko.v2";

const TOPIC_ICON = {
  bezp: "🚑", znaki: "🛑", pierwsz: "⚠️", predkosc: "💨", piesi: "🚶", postoj: "🅿️",
  manewry: "🔄", pasy: "🛣️", pojazd: "🔧", prawo: "📄", sytuacje: "🎬", inne: "🧩",
};

let DATA = [], TOPICS = [], S = {}, P = null;
const app = document.getElementById("app");
const $ = id => document.getElementById(id);
const toTop = () => window.scrollTo(0, 0);   // экран сменился — всегда сверху
const esc = s => (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]]; } return a; };
const isTF = q => !q.pl[1];
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

/* ===================== stan ===================== */
const FRESH = () => ({
  v: 2, xp: 0, streak: 0, best: 0, lastDay: null, goal: 50, examDate: null,
  days: {}, q: {}, ach: [], sound: true, lang: "", recent: [], ans: 0,
});

// Пауза перед повторным показом — в количестве ответов, а не в днях: учишься
// пачками, и «через 3 дня» просто выкинуло бы вопрос из оборота. Индекс — коробка.
const DELAY = [10, 30, 90, 250, 600, 1200];
const dueIn = q => {
  const p = P.q[q.id];
  return p ? (P.ans - (p.at || 0)) - DELAY[p.box] : Infinity;   // >=0 — пора показывать
};

function loadState() {
  try { P = JSON.parse(localStorage.getItem(KEY)); } catch (e) { P = null; }
  if (!P) {
    P = FRESH();
    try {                                   // перенос прогресса из первой версии
      const old = JSON.parse(localStorage.getItem("prawko.progress.B") || "null");
      if (old) { P.q = old; }
    } catch (e) { /* пусто */ }
  }
  for (const [k, v] of Object.entries(FRESH())) if (P[k] === undefined) P[k] = v;
  rollDay();
}
const save = () => localStorage.setItem(KEY, JSON.stringify(P));

function rollDay() {
  const t = today();
  if (P.lastDay === t) return;
  if (P.lastDay) {
    const gap = daysBetween(P.lastDay, t);
    // серия жива, если вчера цель была взята; пропущенный день её обнуляет
    if (gap > 1 || (P.days[P.lastDay] || 0) < P.goal) P.streak = 0;
  }
  save();
}

function addXP(n) {
  const t = today();
  const before = P.days[t] || 0;
  P.days[t] = before + n;
  P.xp += n;
  if (before < P.goal && P.days[t] >= P.goal) {   // цель дня взята именно сейчас
    if (P.lastDay !== t) P.streak++;
    P.lastDay = t;
    if (P.streak > P.best) P.best = P.streak;
    fireworks(); sfx("goal");
  }
  save();
}

function mark(id, right) {
  const p = P.q[id] || (P.q[id] = { box: 0, seen: 0, wrong: 0 });
  p.seen++;
  if (right) p.box = Math.min(5, p.box + 1); else { p.box = 0; p.wrong++; }
  p.last = right ? 1 : 0;
  P.ans = (P.ans || 0) + 1;
  p.at = P.ans;                       // отметка «когда показывали» для паузы
  P.recent.push(right ? 1 : 0);
  if (P.recent.length > 100) P.recent.shift();
}

/* ===================== метрики ===================== */
const mastered = list => (list || DATA).filter(q => (P.q[q.id]?.box || 0) >= MASTER_BOX).length;
// Готовность считаем дробно: вопрос закрывается тремя правильными подряд, и если
// показывать только закрытые, шкала висит на нуле весь первый проход базы.
// Один верный ответ = треть вопроса — видно, что работа идёт.
const readiness = () => DATA.length
  ? DATA.reduce((s, q) => s + Math.min(P.q[q.id]?.box || 0, MASTER_BOX) / MASTER_BOX, 0) / DATA.length
  : 0;
const accuracy = () => P.recent.length ? P.recent.reduce((a, b) => a + b, 0) / P.recent.length : 0;
const weakOf = list => list.filter(q => { const b = P.q[q.id]; return b && b.box < MASTER_BOX; });
const freshOf = list => list.filter(q => !P.q[q.id]);
const byTopic = t => DATA.filter(q => q.t === t);

function examPlan() {
  if (!P.examDate) return null;
  const left = daysBetween(today(), P.examDate);
  const todo = DATA.length - mastered();
  return { left, todo, perDay: left > 0 ? Math.ceil(todo / left) : todo };
}

/* ===================== звук ===================== */
let AC = null;
function sfx(kind, n) {
  if (!P.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const seq = {
      right: [[660, 0], [880, .07]],
      wrong: [[180, 0], [140, .09]],
      combo: [[520 + Math.min(n || 0, 12) * 45, 0]],
      finish: [[523, 0], [659, .1], [784, .2], [1046, .3]],
      goal: [[784, 0], [1046, .09], [1318, .18]],
    }[kind] || [];
    for (const [f, at] of seq) {
      const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime + at;
      o.type = kind === "wrong" ? "sawtooth" : "sine";
      o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(kind === "wrong" ? .22 : .16, t + .012);
      g.gain.exponentialRampToValueAtTime(.0001, t + .19);
      o.connect(g).connect(AC.destination); o.start(t); o.stop(t + .22);
    }
  } catch (e) { /* звук не критичен */ }
}
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { } };

/* ===================== конфетти ===================== */
function fireworks(power) {
  const cv = $("confetti"), ctx = cv.getContext("2d");
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = ["#4ade80", "#facc15", "#38bdf8", "#a78bfa", "#fb923c", "#f87171"];
  const parts = Array.from({ length: power || 90 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * innerWidth * .55, y: innerHeight * .42,
    vx: (Math.random() - .5) * 13, vy: -Math.random() * 15 - 5,
    s: 5 + Math.random() * 7, c: colors[(Math.random() * colors.length) | 0],
    r: Math.random() * 6, vr: (Math.random() - .5) * .4,
  }));
  let frames = 0;
  (function loop() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    let alive = false;
    for (const p of parts) {
      p.vy += .42; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      if (p.y < cv.height + 40) alive = true;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .62); ctx.restore();
    }
    if (alive && frames++ < 190) requestAnimationFrame(loop);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}
function flyXP(text, x, y) {
  const el = document.createElement("div");
  el.className = "xpfly"; el.textContent = text;
  el.style.left = (x - 30) + "px"; el.style.top = y + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

/* ===================== достижения ===================== */
const ACH = [
  { id: "first", ic: "🎓", name: "Pierwsza lekcja", test: () => Object.keys(P.q).length > 0 },
  { id: "s3", ic: "🔥", name: "3 dni z rzędu", test: () => P.best >= 3 },
  { id: "s7", ic: "🔥", name: "Tydzień z rzędu", test: () => P.best >= 7 },
  { id: "s30", ic: "🏆", name: "Miesiąc z rzędu", test: () => P.best >= 30 },
  { id: "xp500", ic: "⚡", name: "500 XP", test: () => P.xp >= 500 },
  { id: "xp2000", ic: "⚡", name: "2000 XP", test: () => P.xp >= 2000 },
  { id: "q100", ic: "💯", name: "100 pytań", test: () => Object.keys(P.q).length >= 100 },
  { id: "q1000", ic: "📚", name: "1000 pytań", test: () => Object.keys(P.q).length >= 1000 },
  { id: "perfect", ic: "✨", name: "Lekcja bez błędu", test: () => false },
  { id: "exam", ic: "🚗", name: "Zdany egzamin próbny", test: () => false },
  { id: "topic", ic: "🧠", name: "Dział opanowany", test: () => TOPICS.some(t => byTopic(t.id).length && mastered(byTopic(t.id)) === byTopic(t.id).length) },
  { id: "ready", ic: "🎯", name: "85% gotowości", test: () => readiness() >= .85 },
];
function checkAch(force) {
  const got = [];
  for (const a of ACH) {
    if (P.ach.includes(a.id)) continue;
    if ((force && force.includes(a.id)) || a.test()) { P.ach.push(a.id); got.push(a); }
  }
  if (got.length) save();
  return got;
}

/* ===================== ekran główny ===================== */
function home() {
  clearTimer();
  rollDay();
  toTop();
  const t = today(), dayXP = P.days[t] || 0;
  const pct = Math.min(100, dayXP / P.goal * 100);
  const plan = examPlan();
  const rd = readiness();

  app.innerHTML = `
    <div class="top">
      <div class="chip fire ${P.streak ? "" : "off"}"><span class="ic">🔥</span>${P.streak}</div>
      <div class="chip xp"><span class="ic">⚡</span>${P.xp}</div>
      <div class="spacer"></div>
      <div class="chip exam tap" onclick="screenSettings()">
        <span class="ic">${plan ? "🎯" : "⚙️"}</span>${plan ? plan.left + " dni" : "ustaw"}
      </div>
    </div>

    <div class="card">
      <div class="goal">
        <div class="ring ${dayXP >= P.goal ? "done" : ""}">
          <svg width="118" height="118" viewBox="0 0 118 118">
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#4ade80"/><stop offset="100%" stop-color="#22d3ee"/>
              </linearGradient>
              <linearGradient id="gradGold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#facc15"/><stop offset="100%" stop-color="#fb923c"/>
              </linearGradient>
            </defs>
            <circle class="bg" cx="59" cy="59" r="50"/>
            <circle class="fg" cx="59" cy="59" r="50"
              stroke-dasharray="${2 * Math.PI * 50}"
              stroke-dashoffset="${2 * Math.PI * 50 * (1 - pct / 100)}"/>
          </svg>
          <div class="val"><b>${dayXP}</b><span>z ${P.goal} xp</span></div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:18px;margin-bottom:4px">${dayXP >= P.goal ? "Cel dnia zrobiony 🎉" : "Cel na dziś"}</div>
          <div class="dim" style="font-size:14px;margin-bottom:12px">
            ${dayXP >= P.goal
      ? (P.streak > 1 ? `Seria ${P.streak} dni — nie przerywaj jutro.` : "Seria ruszyła. Jutro dobij drugą.")
      : `Zostało ${P.goal - dayXP} XP — jakieś ${Math.ceil((P.goal - dayXP) / XP_RIGHT)} pytań.`}
          </div>
          <button class="btn big ${dayXP >= P.goal ? "" : "pulse"}" onclick="startLesson()">Ucz się</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
        <b style="font-size:16px">Gotowość do egzaminu</b>
        <b style="font-size:20px" class="${rd >= .85 ? "ok-c" : ""}">${Math.round(rd * 100)}%</b>
      </div>
      <div class="bar"><i style="width:${rd * 100}%"></i></div>
      <div class="dim" style="font-size:13px;margin-top:9px">
        Zaliczone na stałe: ${mastered()} z ${DATA.length}
        <span style="opacity:.75">(pytanie zalicza się po 3 poprawnych z rzędu)</span>${P.recent.length >= 10
      ? `<br>Skuteczność ostatnich ${P.recent.length} odpowiedzi:
           <b class="${accuracy() >= .9 ? "ok-c" : "bad-c"}">${Math.round(accuracy() * 100)}%</b>` : ""}
      </div>
      ${plan ? `<div class="dim" style="font-size:13px;margin-top:6px">
        Do egzaminu ${plan.left} dni · zostało ${plan.todo} pytań ·
        <b style="color:var(--blue)">${plan.perDay} dziennie</b>, żeby zdążyć</div>` : ""}
    </div>

    <div class="row" style="margin-bottom:14px">
      <button class="btn blue" onclick="startExam()">Egzamin</button>
      <button class="btn ghost" onclick="screenStats()">Postępy</button>
    </div>

    <h2>Działy</h2>
    ${TOPICS.map(t => {
        const list = byTopic(t.id), m = mastered(list);
        const p = list.length ? m / list.length * 100 : 0;
        return `<button class="topic ${p >= 100 ? "done" : ""}" style="--pct:${p}" onclick="startLesson('${t.id}')">
          <div class="dot">${TOPIC_ICON[t.id] || "🧩"}</div>
          <div class="tt"><b>${esc(t.name)}</b><span>${m} / ${list.length} opanowane</span></div>
          <div class="dim" style="font-size:15px">${Math.round(p)}%</div>
        </button>`;
      }).join("")}

    <div class="foot">
      Pytania i multimedia — oficjalny katalog Ministerstwa Infrastruktury RP, wersja 07.2026.
      Podział na działy jest nasz (heurystyka po słowach kluczowych), w katalogu go nie ma.
      Narzędzie niekomercyjne, bez reklam.
    </div>`;
}

/* ===================== ustawienia ===================== */
function screenSettings() {
  clearTimer();
  toTop();
  app.innerHTML = `
    <div class="top"><button class="x" onclick="home()">‹</button><b style="font-size:19px">Ustawienia</b></div>
    <div class="card">
      <label class="f">Data egzaminu</label>
      <input type="date" id="ed" value="${P.examDate || ""}" min="${today()}"
             onchange="P.examDate=this.value||null;save();home()">
      <div class="dim" style="font-size:13px;margin-top:8px">
        Policzę, ile pytań dziennie trzeba zrobić, żeby zdążyć.
      </div>
    </div>
    <div class="card">
      <label class="f">Cel dzienny</label>
      ${GOALS.map(([xp, name]) => `
        <button class="opt" onclick="P.goal=${xp};save();home()" ${P.goal === xp ? 'style="border-color:var(--green)"' : ""}>
          <span class="k">${xp}</span>${name}
          <span class="oh">${xp / XP_RIGHT} pytań dziennie</span>
        </button>`).join("")}
    </div>
    <div class="card">
      <label class="f">Podpowiedź w innym języku</label>
      <select onchange="P.lang=this.value;save()">
        <option value="">bez podpowiedzi</option>
        ${Object.entries(LANGS).map(([k, v]) =>
    `<option value="${k}" ${P.lang === k ? "selected" : ""}>${v}</option>`).join("")}
      </select>
      <div class="dim" style="font-size:13px;margin-top:8px">
        W katalogu ministerstwa nie ma rosyjskiego — są tylko te trzy.
      </div>
    </div>
    <div class="card">
      <label class="f">Dźwięk</label>
      <button class="opt" onclick="P.sound=!P.sound;save();screenSettings();sfx('right')">
        <span class="k">${P.sound ? "🔊" : "🔇"}</span>${P.sound ? "Włączony" : "Wyłączony"}
      </button>
    </div>
    <button class="btn red" onclick="if(confirm('Skasować CAŁY postęp — XP, serię, wszystko?')){localStorage.removeItem(KEY);P=FRESH();save();home()}">
      Zeruj postęp</button>`;
}

/* ===================== postępy ===================== */
function screenStats() {
  clearTimer();
  toTop();
  const days = [];
  for (let i = 97; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    days.push([d, P.days[d] || 0]);
  }
  const lvl = xp => xp === 0 ? "" : xp < P.goal * .34 ? "l1" : xp < P.goal * .67 ? "l2" : xp < P.goal ? "l3" : "l4";
  const active = days.filter(d => d[1] > 0).length;

  app.innerHTML = `
    <div class="top"><button class="x" onclick="home()">‹</button><b style="font-size:19px">Postępy</b></div>
    <div class="stats">
      <div><b class="fire-c">${P.streak}</b><span>seria</span></div>
      <div><b class="fire-c">${P.best}</b><span>rekord</span></div>
      <div><b class="xp-c">${P.xp}</b><span>xp</span></div>
      <div><b>${active}</b><span>dni</span></div>
    </div>
    <div class="card">
      <b style="font-size:16px">Ostatnie 14 tygodni</b>
      <div class="heat">${days.map(([d, xp]) => `<i class="${lvl(xp)}" title="${d}: ${xp} XP"></i>`).join("")}</div>
    </div>
    <div class="card">
      <b style="font-size:16px">Osiągnięcia ${P.ach.length}/${ACH.length}</b>
      <div class="ach" style="margin-top:11px">
        ${ACH.map(a => `<div class="${P.ach.includes(a.id) ? "" : "locked"}"><span>${a.ic}</span>${esc(a.name)}</div>`).join("")}
      </div>
    </div>
    <div class="card">
      <b style="font-size:16px">Działy</b>
      ${TOPICS.map(t => {
    const l = byTopic(t.id), m = mastered(l), p = l.length ? m / l.length * 100 : 0;
    return `<div style="margin-top:12px">
          <div style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:5px">
            <span>${TOPIC_ICON[t.id]} ${esc(t.name)}</span><span class="dim">${m}/${l.length}</span></div>
          <div class="bar thin"><i style="width:${p}%"></i></div></div>`;
  }).join("")}
    </div>`;
}

/* ===================== dobór pytań ===================== */
function lessonQuestions(topic) {
  const pool = topic ? byTopic(topic) : DATA;
  // «Отлежавшиеся» — те, у кого пауза после прошлого показа уже вышла.
  const ripe = q => dueIn(q) >= 0;
  const weak = shuffle(weakOf(pool).filter(ripe));
  const fresh = shuffle(freshOf(pool));
  const rest = shuffle(pool.filter(q => (P.q[q.id]?.box || 0) >= MASTER_BOX).filter(ripe));

  // половина урока — то, что валится, дальше новое, в конце повторение освоенного
  const out = weak.slice(0, Math.ceil(LESSON_LEN * .5));
  for (const src of [fresh, weak.slice(out.length), rest]) {
    for (const q of src) { if (out.length >= LESSON_LEN) break; if (!out.includes(q)) out.push(q); }
  }
  // если отлежавшихся не хватило на полный урок — добираем самыми давними,
  // чтобы урок не оказался короче, но и не подсовывал только что отвеченное
  if (out.length < LESSON_LEN) {
    const back = pool.filter(q => !out.includes(q)).sort((a, b) => dueIn(b) - dueIn(a));
    out.push(...back.slice(0, LESSON_LEN - out.length));
  }
  return shuffle(out);
}

/* ===================== lekcja ===================== */
function startLesson(topic) {
  const qs = lessonQuestions(topic);
  if (!qs.length) return home();
  S = { mode: "lesson", topic, qs, i: 0, right: 0, xp: 0, combo: 0, maxCombo: 0, wrong: [], t0: Date.now() };
  renderQ();
}

function startExam() {
  const out = [];
  for (const [scope, plan] of [["b", EXAM.basic], ["s", EXAM.specialist]])
    for (const [pts, n] of plan)
      out.push(...shuffle(DATA.filter(q => q.s === scope && q.p === pts)).slice(0, n));
  S = { mode: "exam", qs: out, i: 0, right: 0, score: 0, wrong: [], phase: "read", t0: Date.now() };
  renderQ();
}

let timer = null;
const clearTimer = () => {
  if (timer) { clearInterval(timer); timer = null; }
  if (S.filmGuard) { clearTimeout(S.filmGuard); S.filmGuard = null; }
};

/* Один медиа-блок на все случаи. Состояния:
   idle   — размытое превью и кнопка ▶: сначала читаешь вопрос, смотришь когда готов
   play   — фильм крутится, ровно один раз (самоповтор сбивает с мысли)
   ended  — стоп-кадр и кнопка ↻ (на экзамене пересмотр недоступен)
   frozen — сразу последний кадр: так экран выглядит на экзамене во время ответа  */
function mediaHTML(q, state) {
  if (!q.k) return "";
  // 7% имён в каталоге министерства содержат пробелы и скобки — кодируем сами,
  // не полагаясь на браузер: 'MW 18(151,154).jpg' иначе даёт 404
  const src = "media/" + encodeURIComponent(q.m);
  const fallback = `this.parentNode.innerHTML='<div class=none>⚠️ nie wczytano pliku ${esc(q.m)}</div>'`;

  if (q.k !== "v")
    return `<div class="media ${state === "idle" ? "idle" : ""}" id="medbox">
              <img src="${src}" onerror="${fallback}">
              ${state === "idle" ? `<button class="playbtn" onclick="startMedia()"></button>` : ""}
            </div>`;

  const frozen = state === "frozen";
  // Без перемотки браузер не рисует ни одного кадра и на месте видео чёрный
  // прямоугольник — размывать нечего. Поэтому подталкиваем: idle к первому
  // кадру, frozen к последнему (на экзамене отвечают по стоп-кадру).
  const seek = frozen ? "Math.max(0,this.duration-0.05)" : state === "idle" ? "0.1" : null;
  return `<div class="media ${state}" id="medbox">
      <video id="med" src="${src}" muted playsinline preload="auto"
        ${seek ? `onloadeddata="this.currentTime=${seek}"` : ""}
        onplay="document.getElementById('medbox').className='media play'"
        onended="document.getElementById('medbox').className='media ended'"
        onerror="${fallback}"></video>
      ${frozen ? "" : `<button class="playbtn" onclick="playFilm()"></button>`}
    </div>`;
}

// Снять размытие и пустить фильм. В уроке — просто смотрим, в экзамене
// после фильма пойдёт отсчёт на ответ.
function playFilm() {
  const v = $("med"), box = $("medbox");
  if (!v) return;
  if (S.mode === "exam" && S.phase === "read") return startMedia();
  box.className = "media play";
  v.currentTime = 0;
  v.play();
}

/* Экзамен идёт тремя этапами — как в WORD:
   1) read   — только текст вопроса, 20 с, медиа ещё не показывают (кнопка START)
   2) film   — фильм проигрывается ОДИН раз, его длительность в лимит не входит
   3) answer — стоп-кадр (или фото) + варианты, 15 с
   Специалистические идут одной фазой на 50 с — фильмов в них нет вовсе. */
function renderQ() {
  clearTimer();
  toTop();
  if (S.i >= S.qs.length) return finish();
  const q = S.qs[S.i], exam = S.mode === "exam";
  // у специалистических 50 с идут одной фазой — ознакомление и ответ вместе
  if (exam && q.s === "s") S.phase = "answer";
  const phase = exam ? S.phase : "answer";
  const alt = P.lang && q[P.lang] ? q[P.lang] : null;
  const tf = isTF(q);
  const opts = tf ? [["T", "Tak"], ["N", "Nie"]] : [["A", q.pl[1]], ["B", q.pl[2]], ["C", q.pl[3]]];
  const pct = S.i / S.qs.length * 100;

  // Фото видно сразу и целиком — прятать статичную картинку незачем.
  // Размытие с кнопкой ▶ только у фильма, и это единственный элемент управления.
  const media = q.k !== "v" ? mediaHTML(q, "shown")
    : phase === "film" ? mediaHTML(q, "play")
      : phase === "answer" && exam ? mediaHTML(q, "frozen")
        : mediaHTML(q, "idle");

  // Варианты ответа видны всегда — иначе непонятно, что происходит,
  // и нажатие на «Start» ощущается как пропуск вопроса.
  const bottom = opts.map(([k, text], n) => `
      <button class="opt" id="o${k}" onclick="answer('${k}',event)">
        <span class="k">${tf ? (k === "T" ? "✓" : "✕") : k}</span>${esc(text)}
        ${alt && !tf ? `<span class="oh">${esc(alt[n + 1])}</span>` : ""}
      </button>`).join("");

  app.innerHTML = `
    <div class="lessonTop">
      <button class="x" onclick="quit()">✕</button>
      <div class="bar" style="flex:1"><i style="width:${pct}%"></i></div>
      ${exam ? `<span class="timer" id="clock"></span>`
      : `<span class="combo ${S.combo >= 2 ? "on" : ""}" id="combo">🔥 ${S.combo}</span>`}
    </div>
    <div class="qcard" id="qcard">
      <div class="tags">
        <span class="tg">${S.i + 1} / ${S.qs.length}</span>
        <span class="tg">${q.s === "b" ? "podstawowe" : "specjalistyczne"}</span>
        <span class="tg">${q.p} pkt</span>
        ${exam ? "" : `<span class="tg">${esc((TOPICS.find(t => t.id === q.t) || {}).name || "")}</span>`}
      </div>
      ${media}
      <p class="qtext">${esc(q.pl[0])}</p>
      ${alt ? `<p class="qhint">${esc(alt[0])}</p>` : ""}
      <div id="opts" style="margin-top:16px">${bottom}</div>
    </div>
    <div class="verdict" id="verdict"><div class="in">
      <div class="msg"><b id="vt"></b><span id="vs"></span></div>
      <button class="btn" id="vb" onclick="next()">Dalej</button>
    </div></div>`;

  // Chrome игнорирует preload="auto", пока видео не тронули: readyState остаётся 0,
  // кадра нет и размывать нечего. Просим загрузку явно.
  if (q.k === "v" && phase !== "film") { const mv = $("med"); if (mv) mv.load(); }

  if (!exam) return;
  // Не тронул фильм за отведённое время — он запускается сам, как на экзамене
  if (phase === "read") startClock(EXAM.readSec, q.k === "v" ? startMedia : toAnswer);
  else if (phase === "film") {
    const v = $("med");
    $("clock").textContent = "▶";                       // время фильма не тикает
    if (!v) return toAnswer();                          // видео не загрузилось — не наказываем
    v.addEventListener("ended", toAnswer, { once: true });
    const p = v.play();
    if (p && p.catch) p.catch(() => toAnswer());        // браузер не дал автозапуск
    // Страховка от зависания: в этой фазе таймера нет, поэтому если фильм
    // не доиграл (застрял, не подгрузился) — всё равно пускаем к ответу.
    const limit = (isFinite(v.duration) && v.duration ? v.duration : 20) * 1000 + 5000;
    S.filmGuard = setTimeout(() => { if (S.phase === "film") toAnswer(); }, limit);
  } else {
    startClock(q.s === "b" ? EXAM.answerSec : EXAM.specSec, () => answer(null));
  }
}

// START на ознакомлении: у фильма — крутим его, у фото и текста — сразу к ответу
function startMedia() {
  clearTimer();
  const q = S.qs[S.i];
  S.phase = q.k === "v" ? "film" : "answer";
  renderQ();
}

function startClock(sec, onEnd) {
  const el = $("clock"); let left = sec;
  const tick = () => {
    el.textContent = left + "s";
    el.className = "timer" + (left <= 5 ? " warn" : "");
    if (left-- <= 0) { clearTimer(); onEnd(); }
  };
  tick(); timer = setInterval(tick, 1000);
}

function toAnswer() {
  clearTimer();
  S.phase = "answer";
  renderQ();
}

function answer(choice, ev) {
  clearTimer();
  const q = S.qs[S.i], right = choice === q.c;
  mark(q.id, right);
  if (!right) S.wrong.push({ q, choice });
  else S.right++;

  if (S.mode === "exam") {
    if (right) S.score += q.p;
    S.i++; S.phase = "read"; save();
    return renderQ();
  }

  /* --- lekcja: дофамин --- */
  S.combo = right ? S.combo + 1 : 0;
  S.maxCombo = Math.max(S.maxCombo, S.combo);
  let gain = 0;
  if (right) {
    gain = XP_RIGHT + (S.combo >= 10 ? 10 : S.combo >= 5 ? 5 : 0);
    S.xp += gain; addXP(gain);
    sfx(S.combo >= 3 ? "combo" : "right", S.combo); buzz(18);
  } else { sfx("wrong"); buzz([40, 60, 40]); $("qcard").classList.add("shake"); }

  document.querySelectorAll("#opts .opt").forEach(b => {
    const k = b.id.slice(1); b.disabled = true;
    if (k === q.c) b.classList.add("ok", "pop");
    else if (k === choice) b.classList.add("bad");
  });

  if (right && ev) flyXP("+" + gain, ev.clientX, ev.clientY - 20);
  if (S.combo && S.combo % 5 === 0) fireworks(46);

  const v = $("verdict");
  v.className = "verdict on " + (right ? "good" : "bad");
  $("vt").textContent = right
    ? (S.combo >= 5 ? `Seria ${S.combo}! +${gain} XP` : `Dobrze! +${gain} XP`)
    : "Niedobrze";
  $("vs").textContent = right ? "" : "Poprawna odpowiedź: " + q.c;
  $("vb").className = "btn" + (right ? "" : " red");
  $("vb").focus();
}

const next = () => { S.i++; S.phase = "read"; renderQ(); };
const quit = () => {
  clearTimer();
  if (S.mode === "exam" && S.i < S.qs.length && !confirm("Przerwać egzamin?")) return;
  save(); home();
};

/* ===================== koniec ===================== */
function finish() {
  clearTimer();
  toTop();
  const exam = S.mode === "exam";
  const secs = Math.round((Date.now() - S.t0) / 1000);
  const perfect = !exam && S.wrong.length === 0;
  const passed = exam && S.score >= EXAM.pass;
  let bonus = 0;

  if (perfect) { bonus = XP_PERFECT; S.xp += bonus; addXP(bonus); }
  if (exam && passed) addXP(50);
  save();

  const force = [];
  if (perfect) force.push("perfect");
  if (passed) force.push("exam");
  const got = checkAch(force);

  if (exam ? passed : true) { fireworks(exam ? 160 : 110); sfx("finish"); }

  app.innerHTML = `
    <div class="card center">
      <div class="trophy">${exam ? (passed ? "🏆" : "😬") : perfect ? "🌟" : S.right >= S.qs.length * .7 ? "🎉" : "💪"}</div>
      ${exam
      ? `<div class="big ${passed ? "ok-c" : "bad-c"}">${S.score} / ${EXAM.max}</div>
           <div style="font-size:19px" class="${passed ? "ok-c" : "bad-c"}">${passed ? "ZDANY" : "NIEZDANY"}</div>
           <div class="dim" style="font-size:14px;margin-top:6px">próg ${EXAM.pass} pkt · ${S.wrong.length} błędów · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}</div>`
      : `<div class="big">${perfect ? "Bez błędu!" : "Lekcja zaliczona"}</div>`}
      <div class="stats">
        <div><b class="ok-c">${S.right}/${S.qs.length}</b><span>poprawnych</span></div>
        ${exam ? "" : `<div><b class="xp-c">+${S.xp}</b><span>xp</span></div>
                       <div><b class="fire-c">${S.maxCombo}</b><span>seria</span></div>`}
        ${exam ? `<div><b>${Math.round(S.right / S.qs.length * 100)}%</b><span>trafień</span></div>` : ""}
      </div>
      ${bonus ? `<div class="ok-c" style="font-size:15px">Bonus za czystą lekcję: +${bonus} XP</div>` : ""}
    </div>

    ${got.length ? `<div class="card">
      <b style="font-size:16px">Nowe osiągnięcia</b>
      <div class="ach" style="margin-top:10px">${got.map(a => `<div><span>${a.ic}</span>${esc(a.name)}</div>`).join("")}</div>
    </div>` : ""}

    ${S.wrong.length ? `<div class="card">
      <b style="font-size:16px">Do powtórki (${S.wrong.length})</b>
      ${S.wrong.map(w => `<div class="rev">
        <div style="margin-bottom:4px">${esc(w.q.pl[0])}</div>
        <div class="dim" style="font-size:13px">twoja: ${w.choice || "brak (czas minął)"} ·
          poprawna: <b class="ok-c">${w.q.c}</b></div></div>`).join("")}
    </div>` : ""}

    <div class="row">
      <button class="btn" onclick="${exam ? "startExam()" : `startLesson(${S.topic ? `'${S.topic}'` : ""})`}">Jeszcze raz</button>
      <button class="btn ghost" onclick="home()">Do domu</button>
    </div>`;
}

/* ===================== klawiatura ===================== */
document.addEventListener("keydown", e => {
  if (!S.qs || S.i >= S.qs.length) return;
  const map = { "1": "oA", "2": "oB", "3": "oC", t: "oT", n: "oN", a: "oA", b: "oB", c: "oC" };
  const el = map[e.key.toLowerCase()] && $(map[e.key.toLowerCase()]);
  if (el && !el.disabled) return el.click();
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    const v = $("verdict");
    if (v && v.classList.contains("on")) return next();
    const b = document.querySelector("#opts .btn");
    if (b) b.click();
  }
});

/* ===================== start ===================== */
loadState();
fetch("questions.json")
  .then(r => r.json())
  .then(d => { DATA = d.questions; TOPICS = d.topics; home(); })
  .catch(() => {
    app.innerHTML = `<div class="card">Nie wczytano <b>questions.json</b>.<br>
      <span class="dim">Uruchom <code>python3 scripts/build_db.py</code>, potem <code>scripts/serve.sh</code></span></div>`;
  });
