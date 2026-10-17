(() => {
  const { esc, STATES, accounts, toast } = CHI;
  const M = (window.CHI_MEMBERS || { members: [] }).members;
  const PHOTOS = window.CHI_PHOTOS || {};
  const $ = id => document.getElementById(id);
  const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z\- ]/g, "").replace(/\s+/g, " ").trim();
  const key = () => `name-${$("scope").value}-${$("state").value || "US"}`;
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  function showBest() { const b = accounts.load(key()); $("best").textContent = b ? `Your best: ${b.score} of ${b.total}${b.secs ? ` in ${fmt(b.secs)}` : ""}` : ""; }
  $("state").innerHTML = CHI.stateOptions("", "All states");
  CHI.onProfile(p => { if (p.state && !$("state").dataset.touched) $("state").value = p.state; showBest(); });
  $("state").addEventListener("input", () => { $("state").dataset.touched = 1; showBest(); });
  $("scope").addEventListener("input", showBest);

  let pool = [], found = new Set(), started = 0, limit = 0, timer = null, over = false;
  $("go").onclick = start;
  function start() {
    const scope = $("scope").value, st = $("state").value;
    pool = M.filter(m => (scope === "Both" || m.chamber === scope) && (!st || m.state === st));
    if (!pool.length) { toast("No members match that choice"); return; }
    found = new Set(); over = false; started = Date.now(); limit = +$("timer").value;
    $("play").hidden = false; $("giveup").textContent = "Give up"; $("giveup").disabled = false; $("guess").disabled = false;
    $("msg").textContent = `${pool.length} to find. Last names work when they're unique.`;
    $("clocklabel").textContent = limit ? "left" : "elapsed";
    clearInterval(timer); timer = setInterval(tick, 250); tick();
    board(); $("guess").value = ""; $("guess").focus();
    CHI.track("name-start");
  }
  function tick() {
    const el = (Date.now() - started) / 1000;
    $("clock").textContent = fmt(limit ? Math.max(0, limit - el) : el);
    if (limit && el >= limit) end("Time's up.");
  }
  function board() {
    const by = {};
    pool.forEach(m => (by[m.state] = by[m.state] || []).push(m));
    $("board").innerHTML = Object.keys(by).sort((a, b) => STATES[a].localeCompare(STATES[b])).map(s => `<div><h3 style="font-size:14px;margin-bottom:6px">${STATES[s]}</h3><div class="stack" style="gap:4px">${by[s].map(m => slot(m)).join("")}</div></div>`).join("");
    $("score").textContent = `${found.size}/${pool.length}`;
  }
  function slot(m) {
    const got = found.has(m.id), missed = over && !got;
    const label = m.chamber === "Senate" ? "Senator" : m.district ? `District ${m.district}` : "At-large";
    return `<div class="row" style="gap:8px;flex-wrap:nowrap;min-height:38px">
      ${(got || missed) && PHOTOS[m.id] ? `<img src="${PHOTOS[m.id]}" alt="" width="28" height="34" style="object-fit:cover;flex:none${missed ? ";opacity:.45" : ""}">` : `<span style="width:28px;height:34px;flex:none;background:var(--soft);border-left:3px solid var(--${m.party === "D" ? "d" : m.party === "R" ? "r" : "i"})"></span>`}
      <span class="small" style="line-height:1.25"><span class="tiny muted">${label} · ${m.party}</span><br>${got ? `<b>${esc(m.name)}</b>` : missed ? `<span class="muted">${esc(m.name)}</span>` : '<span class="blank">? ? ?</span>'}</span></div>`;
  }
  $("guess").addEventListener("keydown", e => {
    if (e.key !== "Enter" || over) return;
    const g = norm($("guess").value);
    if (!g) return;
    const left = pool.filter(m => !found.has(m.id));
    const full = left.filter(m => [norm(m.first + " " + m.last), norm(m.name)].includes(g) || norm(m.name).replace(/ [a-z]\.? /, " ") === g);
    const lastParts = m => { const l = norm(m.last); return [l, l.replace(/-/g, " "), ...l.split(/[- ]/).filter(x => x.length > 2)]; };
    let hits = full.length ? full : left.filter(m => lastParts(m).includes(g) || lastParts(m).includes(g.split(" ").slice(-1)[0]) && g.split(" ").length > 1 && norm(m.first).startsWith(g.split(" ")[0]));
    if (!hits.length && g.split(" ").length === 1) hits = left.filter(m => lastParts(m).includes(g));
    const already = pool.filter(m => found.has(m.id) && (norm(m.last) === g || norm(m.name) === g));
    if (hits.length === 1) {
      found.add(hits[0].id); $("msg").innerHTML = `<b>${esc(hits[0].name)}</b>, ${esc(STATES[hits[0].state])}`; $("guess").value = ""; board();
      if (found.size === pool.length) end("You got all of them!");
    } else if (hits.length > 1) {
      $("msg").textContent = `${hits.length} members are named ${$("guess").value.trim()}. Add a first name.`;
    } else {
      $("msg").textContent = already.length ? "You already named them." : "No match. Check the spelling, or they may not be in this group.";
    }
  });
  $("giveup").onclick = () => end("Here's everyone you missed.");
  async function end(text) {
    if (over) return;
    over = true; clearInterval(timer);
    const secs = Math.round((Date.now() - started) / 1000);
    $("guess").disabled = true; $("giveup").disabled = true;
    $("msg").textContent = `${text} You named ${found.size} of ${pool.length}.`;
    board();
    const prev = accounts.load(key());
    if (!prev || found.size > prev.score || (found.size === prev.score && secs < (prev.secs || 1e9))) {
      try { await accounts.save(key(), { score: found.size, total: pool.length, secs, at: new Date().toISOString() }); } catch (e) {}
      if (found.size) toast("New personal best");
    }
    showBest();
    CHI.track("name-finish");
  }
  showBest();
})();
