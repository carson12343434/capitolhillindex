(() => {
  const { esc, STATES, accounts, toast } = CHI;
  const M = (window.CHI_MEMBERS || { members: [] }).members;
  const PHOTOS = window.CHI_PHOTOS || {};
  const $ = id => document.getElementById(id);
  const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z\- ]/g, "").replace(/\s+/g, " ").trim();
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const fmtLimit = s => s < 60 ? `${s} seconds` : s % 60 ? `${(s / 60).toFixed(1)} minutes` : `${s / 60} minute${s === 60 ? "" : "s"}`;
  const TIMES = {
    roster: [[0, "No limit"], [300, "5 minutes"], [600, "10 minutes"], [900, "15 minutes"], [1800, "30 minutes"]],
    speed: [[30, "30 seconds"], [60, "1 minute"], [120, "2 minutes"], [180, "3 minutes"], [300, "5 minutes"], [600, "10 minutes"], ["custom", "Custom"]],
  };
  const INFO = {
    roster: "Find everyone in the group. Blank slots show each member's seat and party; give up any time to see who you missed.",
    speed: "Name as many as you can before the clock runs out. Your best score for each group and time limit is saved to your account.",
  };
  let mode = "roster";

  const scopeName = () => ({ Senate: "Senators", House: "Representatives", Both: "All of Congress" }[$("scope").value]) + ($("state").value ? `, ${STATES[$("state").value]}` : "");
  const speedSecs = () => $("timer").value === "custom" ? Math.round(Math.min(60, Math.max(0.5, +$("custom").value || 1)) * 60) : +$("timer").value;
  const key = () => mode === "roster" ? `name-${$("scope").value}-${$("state").value || "US"}` : `blitz-${$("scope").value}-${$("state").value || "US"}-${speedSecs()}`;

  function setMode(m) {
    mode = m;
    $("modes").querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", b.dataset.mode === m));
    $("timer").innerHTML = TIMES[m].map(([v, l]) => `<option value="${v}"${m === "speed" && v === 120 ? " selected" : ""}>${l}</option>`).join("");
    $("customwrap").hidden = true;
    $("modeinfo").textContent = INFO[m];
    $("play").hidden = true;
    clearInterval(timer); over = true;
    showBest(); showScores();
  }
  $("modes").addEventListener("click", e => { const b = e.target.closest("[data-mode]"); if (b) setMode(b.dataset.mode); });
  $("timer").addEventListener("input", () => { $("customwrap").hidden = $("timer").value !== "custom"; showBest(); });
  $("custom").addEventListener("input", showBest);

  function showBest() {
    const b = accounts.load(key());
    $("best").textContent = !b ? "" : mode === "roster" ? `Your best: ${b.score} of ${b.total}${b.secs ? ` in ${fmt(b.secs)}` : ""}` : `High score: ${b.score}`;
  }
  function showScores() {
    const all = Object.entries(allSaved()).filter(([k]) => k.startsWith("blitz-"));
    $("scores").hidden = mode !== "speed" || !all.length;
    if ($("scores").hidden) return;
    const group = k => { const [, sc, st] = k.split("-"); return ({ Senate: "Senators", House: "Representatives", Both: "All of Congress" }[sc]) + (st !== "US" ? `, ${STATES[st] || st}` : ""); };
    $("scorerows").innerHTML = all.sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) =>
      `<tr><td>${esc(group(k))}</td><td>${fmtLimit(+k.split("-")[3])}</td><td class="n"><b>${v.score}</b></td><td class="small muted">${v.at ? new Date(v.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}</td></tr>`).join("");
    $("scorenote").textContent = CHI.profile.uid ? "Saved to your account, so they follow you to any device." : accounts.enabled() ? "Saved on this device. Sign in to keep them on every device." : "Saved on this device.";
  }
  function allSaved() { return CHI.store.get("cloud", {}) || {}; }

  $("state").innerHTML = CHI.stateOptions("", "All states");
  CHI.onProfile(p => { if (p.state && !$("state").dataset.touched) $("state").value = p.state; showBest(); showScores(); });
  $("state").addEventListener("input", () => { $("state").dataset.touched = 1; showBest(); });
  $("scope").addEventListener("input", showBest);

  let pool = [], found = [], started = 0, limit = 0, timer = null, over = true, runKey = "";
  $("go").onclick = start;
  function start() {
    const scope = $("scope").value, st = $("state").value;
    pool = M.filter(m => (scope === "Both" || m.chamber === scope) && (!st || m.state === st));
    if (!pool.length) { toast("No members match that choice"); return; }
    found = []; over = false; started = Date.now(); runKey = key();
    limit = mode === "speed" ? speedSecs() : +$("timer").value;
    $("play").hidden = false; $("giveup").textContent = mode === "speed" ? "Stop" : "Give up"; $("giveup").disabled = false; $("guess").disabled = false;
    const prev = accounts.load(runKey);
    $("msg").textContent = mode === "speed" ? `${fmtLimit(limit)} on the clock.${prev ? ` Your high score is ${prev.score}.` : ""} Go!` : `${pool.length} to find. Last names work when they're unique.`;
    $("clocklabel").textContent = limit ? "left" : "elapsed";
    clearInterval(timer); timer = setInterval(tick, 200); tick();
    board(); $("guess").value = ""; $("guess").focus();
    $("play").scrollIntoView({ block: "start" });
    CHI.track(mode === "speed" ? "speed-start" : "name-start");
  }
  function tick() {
    const el = (Date.now() - started) / 1000;
    $("clock").textContent = fmt(limit ? Math.max(0, limit - el) : el);
    if (limit && el >= limit) end("Time's up!");
  }
  function board() {
    $("score").textContent = mode === "speed" ? String(found.length) : `${found.length}/${pool.length}`;
    if (mode === "speed") {
      $("board").innerHTML = found.slice().reverse().map(id => slot(M.find(x => x.id === id), true)).join("");
      return;
    }
    const by = {};
    pool.forEach(m => (by[m.state] = by[m.state] || []).push(m));
    $("board").innerHTML = Object.keys(by).sort((a, b) => STATES[a].localeCompare(STATES[b])).map(s => `<div><h3 style="font-size:14px;margin-bottom:6px">${STATES[s]}</h3><div class="stack" style="gap:4px">${by[s].map(m => slot(m)).join("")}</div></div>`).join("");
  }
  function slot(m, speed) {
    const got = found.includes(m.id), missed = over && !got;
    const label = m.chamber === "Senate" ? "Senator" : m.district ? `District ${m.district}` : "At-large";
    return `<div class="row" style="gap:8px;flex-wrap:nowrap;min-height:38px">
      ${(got || missed) && PHOTOS[m.id] ? `<img src="${PHOTOS[m.id]}" alt="" width="28" height="34" style="object-fit:cover;flex:none${missed ? ";opacity:.45" : ""}">` : `<span style="width:28px;height:34px;flex:none;background:var(--soft);border-left:3px solid var(--${m.party === "D" ? "d" : m.party === "R" ? "r" : "i"})"></span>`}
      <span class="small" style="line-height:1.25"><span class="tiny muted">${speed ? `${m.state}, ` : ""}${label}, ${m.party}</span><br>${got ? `<b>${esc(m.name)}</b>` : missed ? `<span class="muted">${esc(m.name)}</span>` : '<span class="blank">? ? ?</span>'}</span></div>`;
  }
  $("guess").addEventListener("keydown", e => {
    if (e.key !== "Enter" || over) return;
    const g = norm($("guess").value);
    if (!g) return;
    const left = pool.filter(m => !found.includes(m.id));
    const full = left.filter(m => [norm(m.first + " " + m.last), norm(m.name)].includes(g) || norm(m.name).replace(/ [a-z]\.? /, " ") === g);
    const lastParts = m => { const l = norm(m.last); return [l, l.replace(/-/g, " "), ...l.split(/[- ]/).filter(x => x.length > 2)]; };
    let hits = full.length ? full : left.filter(m => lastParts(m).includes(g) || lastParts(m).includes(g.split(" ").slice(-1)[0]) && g.split(" ").length > 1 && norm(m.first).startsWith(g.split(" ")[0]));
    if (!hits.length && g.split(" ").length === 1) hits = left.filter(m => lastParts(m).includes(g));
    const already = pool.filter(m => found.includes(m.id) && (norm(m.last) === g || norm(m.name) === g));
    if (hits.length === 1) {
      found.push(hits[0].id); $("msg").innerHTML = `<b>${esc(hits[0].name)}</b>, ${esc(STATES[hits[0].state])}`; $("guess").value = ""; board();
      if (found.length === pool.length) end("You got all of them!");
    } else if (hits.length > 1) {
      $("msg").textContent = `${hits.length} members are named ${$("guess").value.trim()}. Add a first name.`;
    } else {
      $("msg").textContent = already.length ? "You already named them." : "No match. Check the spelling, or they may not be in this group.";
    }
  });
  $("giveup").onclick = () => end(mode === "speed" ? "Stopped." : "Here's everyone you missed.");
  async function end(text) {
    if (over) return;
    over = true; clearInterval(timer);
    const secs = Math.round((Date.now() - started) / 1000);
    $("guess").disabled = true; $("giveup").disabled = true;
    board();
    const prev = accounts.load(runKey);
    if (mode === "speed") {
      const best = !prev || found.length > prev.score;
      $("msg").innerHTML = `${esc(text)} You named <b>${found.length}</b> in ${fmtLimit(limit)}. ${best && found.length ? "<b>New high score!</b>" : prev ? `Your high score is ${prev.score}.` : ""}`;
      if (best && found.length) {
        try { await accounts.save(runKey, { score: found.length, secs: limit, at: new Date().toISOString() }); } catch (e) {}
        toast("New high score");
        if (!CHI.profile.uid && accounts.enabled()) CHI.promptSignIn("Keep your high scores");
      }
      CHI.track("speed-finish");
    } else {
      $("msg").textContent = `${text} You named ${found.length} of ${pool.length}.`;
      if (!prev || found.length > prev.score || (found.length === prev.score && secs < (prev.secs || 1e9))) {
        try { await accounts.save(runKey, { score: found.length, total: pool.length, secs, at: new Date().toISOString() }); } catch (e) {}
        if (found.length) toast("New personal best");
      }
      CHI.track("name-finish");
    }
    showBest(); showScores();
  }
  setMode(location.hash === "#speed" ? "speed" : "roster");
})();
