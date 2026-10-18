(() => {
  const { esc, STATES, PARTY, store, accounts, toast } = CHI;
  const M = (window.CHI_MEMBERS || { members: [] }).members;
  const PHOTOS = window.CHI_PHOTOS || {};
  const $ = id => document.getElementById(id);
  const MAX = 8;
  // Well-known members. Anyone who has left Congress is skipped automatically.
  const FAMOUS = ["Bernie Sanders", "Elizabeth Warren", "Chuck Schumer", "Mitch McConnell", "John Thune", "Ted Cruz", "Rand Paul", "Josh Hawley",
    "Amy Klobuchar", "Cory Booker", "Chris Murphy", "Raphael Warnock", "Jon Ossoff", "John Fetterman", "Susan Collins", "Lisa Murkowski",
    "Tim Scott", "Rick Scott", "Tommy Tuberville", "Adam Schiff", "Alex Padilla", "Mark Kelly", "Ruben Gallego", "Kirsten Gillibrand",
    "Tammy Duckworth", "Dick Durbin", "Chuck Grassley", "Joni Ernst", "Tom Cotton", "John Kennedy", "Bill Cassidy", "Mike Lee", "John Cornyn",
    "Ron Wyden", "Mark Warner", "Tim Kaine", "Jeanne Shaheen", "Elissa Slotkin", "Jacky Rosen", "John Hickenlooper", "Michael Bennet",
    "Richard Durbin", "Patty Murray", "Sheldon Whitehouse", "Ed Markey", "Angus King", "Brian Schatz", "Mazie Hirono", "Shelley Moore Capito", "Jim Justice",
    "Bernie Moreno", "Dave McCormick", "Katie Britt", "Marsha Blackburn", "Steve Daines", "John Barrasso", "Ron Johnson", "Tammy Baldwin",
    "Thom Tillis", "Eric Schmitt", "Andy Kim", "Chris Van Hollen", "Roger Marshall", "Lindsey Graham", "Ashley Moody",
    "Mike Johnson", "Hakeem Jeffries", "Nancy Pelosi", "Alexandria Ocasio-Cortez", "Jim Jordan", "Steve Scalise", "Lauren Boebert",
    "Ilhan Omar", "Rashida Tlaib", "Jamie Raskin", "Ro Khanna", "Dan Crenshaw", "Byron Donalds", "Nancy Mace", "Elise Stefanik",
    "Thomas Massie", "Jasmine Crockett", "Maxine Waters", "Jim Clyburn", "Ayanna Pressley", "Pramila Jayapal", "Eric Swalwell", "Ted Lieu",
    "Chip Roy", "Anna Paulina Luna", "Josh Gottheimer", "Tom Emmer", "Mike Lawler", "Brian Fitzpatrick", "Don Bacon", "Katherine Clark",
    "Pete Aguilar", "Steny Hoyer", "Ritchie Torres", "Jared Moskowitz", "Debbie Wasserman Schultz", "Maxwell Frost", "Andy Biggs",
    "Paul Gosar", "Marjorie Taylor Greene", "Matt Gaetz", "Jim McGovern", "Joaquin Castro", "Ruben Gallego", "Lisa Blunt Rochester",
    "Adam Smith", "Mike Rogers", "Jodey Arrington", "Jason Smith", "James Comer", "Virginia Foxx", "Elise Stefanik", "Mike Turner",
    "Tony Gonzales", "Henry Cuellar", "Greg Casar", "Summer Lee", "Cori Bush", "Ronny Jackson", "Wesley Hunt", "Byron Donalds", "Andy Ogles"];
  const REGION = {};
  Object.entries({ NE: "CT ME MA NH RI VT NJ NY PA", MW: "IL IN MI OH WI IA KS MN MO NE ND SD", S: "DE FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX", W: "AZ CO ID MT NV NM UT WY AK CA HI OR WA" })
    .forEach(([r, list]) => list.split(" ").forEach(s => REGION[s] = r));
  const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  const display = m => `${m.first} ${m.last}`;
  const byName = new Map();
  M.forEach(m => { byName.set(norm(m.name), m); byName.set(norm(display(m)), m); });
  function resolve(n) {
    const exact = M.find(m => norm(m.name) === norm(n) || norm(display(m)) === norm(n));
    if (exact) return exact;
    const last = norm(n.split(" ").slice(-1)[0]), init = norm(n)[0];
    const c = M.filter(m => norm(m.last).split(" ").includes(last) && norm(m.name)[0] === init);
    return c.length === 1 ? c[0] : null;
  }
  const pool = [...new Set(FAMOUS)].map(resolve).filter(Boolean);

  // date in US Eastern time, so everyone gets the same answer
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const dayNum = Math.floor((Date.parse(today + "T00:00:00Z") - Date.parse("2026-01-01T00:00:00Z")) / 864e5);
  function shuffled(arr, seed) { const a = arr.slice(); let s = seed; for (let i = a.length - 1; i > 0; i--) { s = (s * 1664525 + 1013904223) % 4294967296; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const cycle = Math.floor(dayNum / pool.length);
  const ANSWER = shuffled(pool.sort((a, b) => a.id.localeCompare(b.id)), 20260101 + cycle)[dayNum % pool.length];
  $("meta").textContent = `Capitle #${dayNum + 1} · ${new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`;
  if (!ANSWER) { $("msg").textContent = "Today's game couldn't load."; return; }

  // Suggestions show names only; party and state would give too much away.
  $("names").innerHTML = [...new Set(M.map(display))].sort((a, b) => a.split(" ").slice(-1)[0].localeCompare(b.split(" ").slice(-1)[0])).map(n => `<option value="${esc(n)}"></option>`).join("");
  let state = store.get("game-" + today, { guesses: [], hints: {}, over: false, won: false });
  if (typeof state.hints !== "object" || state.hints === null) state.hints = {};

  const yrs = m => Math.round(m.yearsInCongress);
  function compare(g) {
    const a = ANSWER;
    const cell = (cls, txt, title = "") => `<td style="background:${cls === "g" ? "#2e8b57" : cls === "y" ? "#d7b33a" : "#e7e9ec"};color:${cls === "n" ? "#333" : "#fff"};font-weight:700" title="${title}">${txt}</td>`;
    const arrow = (gv, av) => gv === av ? "" : gv < av ? " ↑" : " ↓";
    return `<tr><td style="text-align:left;font-weight:700">${esc(display(g))}</td>
      ${cell(g.party === a.party ? "g" : "n", g.party)}
      ${cell(g.state === a.state ? "g" : REGION[g.state] === REGION[a.state] ? "y" : "n", g.state, REGION[g.state] === REGION[a.state] && g.state !== a.state ? "Same region" : "")}
      ${cell(g.chamber === a.chamber ? "g" : "n", g.chamber)}
      ${cell(g.age === a.age ? "g" : Math.abs(g.age - a.age) <= 3 ? "y" : "n", g.age + arrow(g.age, a.age))}
      ${cell(Math.abs(yrs(g) - yrs(a)) <= 1 ? "g" : Math.abs(yrs(g) - yrs(a)) <= 3 ? "y" : "n", yrs(g) + (Math.abs(yrs(g) - yrs(a)) <= 1 ? "" : arrow(yrs(g), yrs(a))))}
      ${cell(g.gender === a.gender ? "g" : "n", g.gender === "F" ? "Woman" : "Man")}</tr>`;
  }
  // Three hints, one per tier. Each tier opens and closes at set points in the round,
  // so hints have to be spent as you go: pick one option per tier before it expires.
  const a5 = Math.floor(ANSWER.age / 5) * 5;
  const TIERS = [
    { id: "t1", name: "Hint 1", opens: 0, closes: 2, options: [
      ["gender", "Gender", () => ANSWER.gender === "F" ? "Woman" : "Man"],
      ["chamber", "Chamber", () => ANSWER.chamber],
      ["party", "Party", () => PARTY[ANSWER.party]]] },
    { id: "t2", name: "Hint 2", opens: 1, closes: 4, options: [
      ["age", "Age range", () => `${a5} to ${a5 + 5} years old`],
      ["terms", "Terms served", () => { const t = ANSWER.houseTerms + ANSWER.senateTerms; return `${t} term${t === 1 ? "" : "s"} in Congress`; }]] },
    { id: "t3", name: "Hint 3", opens: 3, closes: 6, options: [
      ["state", "State", () => STATES[ANSWER.state]],
      ["start", "Year they took office", () => `First took office in ${ANSWER.firstTookOffice.slice(0, 4)}`]] },
  ];
  const ord = n => n + (n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th");
  function paintHints(n) {
    $("hints").innerHTML = TIERS.map(t => {
      const used = state.hints[t.id];
      const opt = used && t.options.find(o => o[0] === used);
      let body, status;
      if (opt) { body = `<div style="font-weight:700">${esc(opt[1])}: ${esc(opt[2]())}</div>`; status = "Used"; }
      else if (state.over) { body = ""; status = "Not used"; }
      else if (n < t.opens) { body = t.options.map(o => `<button class="btn ghost" disabled style="padding:4px 10px">${o[1]}</button>`).join(""); status = `Opens after your ${ord(t.opens)} guess`; }
      else if (n >= t.closes) { body = ""; status = `Expired after your ${ord(t.closes)} guess`; }
      else { body = t.options.map(o => `<button class="btn ghost" data-tier="${t.id}" data-opt="${o[0]}" style="padding:4px 10px">${o[1]}</button>`).join(""); status = `Pick one before your ${ord(t.closes)} guess`; }
      const live = !opt && !state.over && n >= t.opens && n < t.closes;
      return `<div class="panel" style="padding:12px 14px;${live ? "border-color:var(--ink)" : opt ? "" : "opacity:.7"}">
        <div class="row" style="justify-content:space-between;gap:6px"><b>${t.name}</b><span class="tiny muted">${status}</span></div>
        <div class="row small" style="gap:6px;margin-top:8px;min-height:30px">${body}</div></div>`;
    }).join("");
  }
  $("hints").addEventListener("click", e => {
    const b = e.target.closest("[data-tier]"); if (!b || state.over) return;
    state.hints[b.dataset.tier] = b.dataset.opt;
    store.set("game-" + today, state); paint(); CHI.track("game-hint");
  });
  function paint() {
    const gs = state.guesses.map(id => M.find(m => m.id === id)).filter(Boolean);
    $("rows").innerHTML = gs.map(compare).join("");
    paintHints(gs.length);
    const left = MAX - gs.length;
    $("msg").textContent = state.over ? "" : `${left} guess${left === 1 ? "" : "es"} left.`;
    ["guess", "submit", "giveup"].forEach(id => $(id).disabled = state.over);
    if (state.over) finish();
  }
  function submit() {
    if (state.over) return;
    const g = byName.get(norm($("guess").value)) || M.find(m => norm(m.last) === norm($("guess").value) && M.filter(x => norm(x.last) === norm($("guess").value)).length === 1);
    if (!g) { $("msg").textContent = "Pick a current member of Congress from the list."; return; }
    if (state.guesses.includes(g.id)) { $("msg").textContent = "You already guessed them."; return; }
    state.guesses.push(g.id);
    $("guess").value = "";
    if (g.id === ANSWER.id) { state.over = true; state.won = true; record(true); }
    else if (state.guesses.length >= MAX) { state.over = true; record(false); }
    store.set("game-" + today, state);
    paint();
    CHI.track("game-guess");
  }
  $("submit").onclick = submit;
  $("guess").addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
  $("giveup").onclick = () => { state.over = true; record(false); store.set("game-" + today, state); paint(); CHI.track("game-giveup"); };

  async function record(won) {
    const s = accounts.load("game-stats", { played: 0, wins: 0, streak: 0, best: 0, last: null, dist: {} });
    if (s.last === today) return;
    const yesterday = new Date(Date.parse(today + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
    s.played++; s.last = today;
    if (won) { s.wins++; s.streak = s.lastWin === yesterday ? s.streak + 1 : 1; s.lastWin = today; s.best = Math.max(s.best, s.streak); s.dist[state.guesses.length] = (s.dist[state.guesses.length] || 0) + 1; }
    else s.streak = 0;
    CHI.track(won ? "capitle-win" : "capitle-loss");
    try { await accounts.save("game-stats", s); } catch (e) {}
    paintStreak();
  }
  const BLANK = { played: 0, wins: 0, streak: 0, best: 0, last: null, lastWin: null, dist: {} };
  const yesterdayOf = d => new Date(Date.parse(d + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
  // A streak only counts if the last win was today or yesterday.
  const liveStreak = s => (s.lastWin === today || s.lastWin === yesterdayOf(today)) ? s.streak : 0;
  function paintStreak() {
    const s = accounts.load("game-stats", BLANK);
    const stat = (n, l) => `<div class="stat" style="text-align:center"><b style="font-size:22px">${n}</b><span>${l}</span></div>`;
    $("streak").innerHTML = stat(liveStreak(s), "Streak") + stat(s.best || 0, "Best") + stat(s.played || 0, "Played");
  }
  function untilMidnightET() {
    const now = new Date();
    const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const mins = Math.max(1, Math.round((24 * 60) - (et.getHours() * 60 + et.getMinutes())));
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }
  function finish() {
    const a = ANSWER, s = accounts.load("game-stats", BLANK);
    const grid = state.guesses.map(id => { const g = M.find(m => m.id === id); return [g.party === a.party, g.state === a.state, g.chamber === a.chamber, g.age === a.age, Math.abs(yrs(g) - yrs(a)) <= 1].map(x => x ? "🟩" : "⬜").join(""); }).join("\n");
    const share = `Capitle #${dayNum + 1}: ${state.won ? `${state.guesses.length}/${MAX}` : "X/" + MAX}${Object.keys(state.hints).length ? ` (${Object.keys(state.hints).length} hint${Object.keys(state.hints).length > 1 ? "s" : ""})` : ""}\n${grid}`;
    $("done").hidden = false;
    $("done").innerHTML = `<div class="panel row" style="gap:18px;align-items:center">
      ${PHOTOS[a.id] ? `<img src="${PHOTOS[a.id]}" alt="Portrait of ${esc(a.name)}" width="96" height="118" style="object-fit:cover">` : ""}
      <div class="stack" style="gap:4px;min-width:0"><span class="kicker" style="color:var(--${state.won ? "ok" : "bad"})">${state.won ? `Solved in ${state.guesses.length}` : "Today's answer"}</span>
        <h2>${esc(a.name)}</h2><div class="small">${PARTY[a.party]}, ${STATES[a.state]} · ${a.chamber === "Senate" ? "Senator" : "Representative"} · age ${a.age} · ${yrs(a)} years in Congress</div>
        <div class="row" style="margin-top:8px"><button class="btn" id="share">Copy result</button><a class="btn ghost" href="../members/#${a.state}">See ${esc(a.last)}'s finances</a></div></div></div>
      <div class="grid2" style="margin-top:16px;align-items:start">
        <div class="panel"><h3>Your stats</h3>
          <div class="row" style="gap:22px;margin-top:10px">${[[s.played || 0, "Played"], [s.played ? Math.round((s.wins / s.played) * 100) + "%" : "0%", "Won"], [liveStreak(s), "Current streak"], [s.best || 0, "Best streak"]].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("")}</div>
          <p class="small muted" style="margin:12px 0 0">Next Capitle in <b>${untilMidnightET()}</b>, at midnight Eastern.</p>
          ${accounts.enabled() && !CHI.profile.uid ? `<button class="btn ghost" id="keep" style="margin-top:12px">Create a free account to keep your streak</button>` : ""}</div>
        <div class="panel"><h3>Guesses to solve</h3><div class="stack" style="gap:4px;margin-top:10px">${(() => {
          const d = s.dist || {}, max = Math.max(1, ...Object.values(d));
          return Array.from({ length: MAX }, (_, i) => i + 1).map(n => { const c = d[n] || 0, mine = state.won && state.guesses.length === n;
            return `<div class="row small" style="gap:8px;flex-wrap:nowrap"><span style="width:12px;text-align:right">${n}</span><div style="flex:1"><div style="width:${Math.max(6, (c / max) * 100)}%;background:${mine ? "var(--ok)" : "#9aa1a9"};color:#fff;font-weight:700;font-size:12px;padding:1px 6px;border-radius:2px;text-align:right">${c}</div></div></div>`; }).join(""); })()}</div></div>
      </div><pre id="sharetext" hidden>${esc(share)}</pre>`;
    $("share").onclick = () => navigator.clipboard.writeText(share).then(() => toast("Copied")).catch(() => { const p = $("sharetext"); p.hidden = false; getSelection().selectAllChildren(p); });
    $("keep")?.addEventListener("click", () => CHI.promptSignIn("Save your Capitle streak"));
  }
  paint();
  paintStreak();
  // After signing in, stats saved to the account replace the ones on this device.
  CHI.onProfile(() => { paintStreak(); if (state.over) finish(); });
})();
