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
  $("meta").textContent = `Game #${dayNum + 1} · ${new Date(today + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`;
  if (!ANSWER) { $("msg").textContent = "Today's game couldn't load."; return; }

  $("names").innerHTML = M.map(m => `<option value="${esc(display(m))}">${esc(m.chamber === "Senate" ? "Sen." : "Rep.")} ${m.party}-${m.state}</option>`).join("");
  let state = store.get("game-" + today, { guesses: [], hints: 0, over: false, won: false });

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
  const HINTS = [() => `Party: ${PARTY[ANSWER.party]}`, () => `State: ${STATES[ANSWER.state]}`, () => `Initials: ${ANSWER.first[0]}. ${ANSWER.last[0]}.`];
  function paint() {
    const gs = state.guesses.map(id => M.find(m => m.id === id)).filter(Boolean);
    $("rows").innerHTML = gs.map(compare).join("");
    $("hints").innerHTML = HINTS.slice(0, state.hints).map(h => `<div class="chip" style="justify-self:start">${esc(h())}</div>`).join("");
    $("hint").disabled = state.over || state.hints >= HINTS.length;
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
  $("hint").onclick = () => { state.hints = Math.min(HINTS.length, state.hints + 1); store.set("game-" + today, state); paint(); CHI.track("game-hint"); };
  $("giveup").onclick = () => { state.over = true; record(false); store.set("game-" + today, state); paint(); CHI.track("game-giveup"); };

  async function record(won) {
    const s = accounts.load("game-stats", { played: 0, wins: 0, streak: 0, best: 0, last: null, dist: {} });
    if (s.last === today) return;
    const yesterday = new Date(Date.parse(today + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);
    s.played++; s.last = today;
    if (won) { s.wins++; s.streak = s.lastWin === yesterday ? s.streak + 1 : 1; s.lastWin = today; s.best = Math.max(s.best, s.streak); s.dist[state.guesses.length] = (s.dist[state.guesses.length] || 0) + 1; }
    else s.streak = 0;
    try { await accounts.save("game-stats", s); } catch (e) {}
  }
  function finish() {
    const a = ANSWER, s = accounts.load("game-stats", { played: 0, wins: 0, streak: 0, best: 0 });
    const grid = state.guesses.map(id => { const g = M.find(m => m.id === id); return [g.party === a.party, g.state === a.state, g.chamber === a.chamber, g.age === a.age, Math.abs(yrs(g) - yrs(a)) <= 1].map(x => x ? "🟩" : "⬜").join(""); }).join("\n");
    const share = `Guess the Politician #${dayNum + 1}: ${state.won ? `${state.guesses.length}/${MAX}` : "X/" + MAX}${state.hints ? ` (${state.hints} hint${state.hints > 1 ? "s" : ""})` : ""}\n${grid}`;
    $("done").hidden = false;
    $("done").innerHTML = `<div class="panel row" style="gap:18px;align-items:center">
      ${PHOTOS[a.id] ? `<img src="${PHOTOS[a.id]}" alt="Portrait of ${esc(a.name)}" width="96" height="118" style="object-fit:cover">` : ""}
      <div class="stack" style="gap:4px;min-width:0"><span class="kicker" style="color:var(--${state.won ? "ok" : "bad"})">${state.won ? `Solved in ${state.guesses.length}` : "Today's answer"}</span>
        <h2>${esc(a.name)}</h2><div class="small">${PARTY[a.party]}, ${STATES[a.state]} · ${a.chamber === "Senate" ? "Senator" : "Representative"} · age ${a.age} · ${yrs(a)} years in Congress</div>
        <div class="small muted">Played ${s.played} · won ${s.played ? Math.round((s.wins / s.played) * 100) : 0}% · streak ${s.streak} · best ${s.best}</div>
        <div class="row" style="margin-top:8px"><button class="btn" id="share">Copy result</button><a class="btn ghost" href="../members/#${a.state}">See ${esc(a.last)}'s finances</a></div></div></div>
      <p class="small muted" style="margin-top:10px">Next politician at midnight Eastern.</p><pre id="sharetext" hidden>${esc(share)}</pre>`;
    $("share").onclick = () => navigator.clipboard.writeText(share).then(() => toast("Copied")).catch(() => { const p = $("sharetext"); p.hidden = false; getSelection().selectAllChildren(p); });
  }
  paint();
})();
