(() => {
  const { esc } = CHI;
  const CODE = (window.CHI_CONFIG || {}).goatcounter;
  const box = document.getElementById("stats");
  if (!CODE) {
    box.innerHTML = `<div class="panel small">Visitor stats switch on once the GoatCounter code is added to <code>assets/config.js</code>.</div>`;
    return;
  }
  const base = `https://${CODE}.goatcounter.com`;
  const PAGES = [["Home", "/"], ["Members", "/members/"], ["Polls", "/polls/"], ["Votes", "/votes/"], ["Political quiz", "/political-quiz/"],
    ["Headcount", "/headcount/"], ["Capitle", "/capitle/"], ["Account", "/account/"]];
  const EVENTS = [["Sign-ups", "signup"], ["Sign-ins", "signin"], ["Sign-up prompt shown", "welcome-shown"], ["Prompt dismissed", "welcome-later"],
    ["Capitle wins", "capitle-win"], ["Capitle losses", "capitle-loss"], ["Capitle guesses", "game-guess"], ["Capitle hints", "game-hint"],
    ["Quiz starts", "quiz-start"], ["Quiz finishes", "quiz-finish"], ["Headcount games", "name-start"], ["Headcount finishes", "name-finish"], ["Speed rounds played", "speed-start"], ["Speed rounds finished", "speed-finish"],
    ["Member profiles opened", "member-open"], ["Races opened", "race-open"], ["Votes opened", "vote-open"]];
  const prefix = (() => { const p = location.pathname.replace(/stats\/?$/, ""); return p.endsWith("/") ? p : p + "/"; })();
  async function count(path) {
    try {
      const r = await fetch(`${base}/counter/${encodeURIComponent(path)}.json`);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }
  const fmt = c => c ? esc(c.count ?? "0") : '<span class="blank">–</span>';
  async function load() {
    const total = await count("TOTAL");
    const pages = await Promise.all(PAGES.map(([, p]) => count((prefix + p.slice(1)).replace(/\/+/g, "/"))));
    const events = await Promise.all(EVENTS.map(([, e]) => count(e)));
    if (!total) {
      box.innerHTML = `<div class="panel small stack"><p style="margin:0">GoatCounter didn't return counts yet. In your GoatCounter dashboard, open <b>Settings</b>, tick <b>Allow adding visitor counts on your website</b>, and save. Counts appear after the first visits.</p>
        <p style="margin:0"><a href="${base}" target="_blank" rel="noopener">Open the full GoatCounter dashboard</a></p></div>`;
      return;
    }
    box.innerHTML = `
      <div class="grid2" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
        <div class="panel stat"><b>${fmt(total)}</b><span>Page views, all time</span></div>
        <div class="panel stat"><b>${total.count_unique ? esc(total.count_unique) : "–"}</b><span>Unique visitors, all time</span></div>
      </div>
      <div class="grid2 section" style="align-items:start">
        <div><h2>Views by page</h2><div class="tablewrap"><table class="data"><tbody>${PAGES.map(([n], i) => `<tr><td>${n}</td><td class="n">${fmt(pages[i])}</td></tr>`).join("")}</tbody></table></div></div>
        <div><h2>Activity</h2><div class="tablewrap"><table class="data"><tbody>${EVENTS.map(([n], i) => `<tr><td>${n}</td><td class="n">${fmt(events[i])}</td></tr>`).join("")}</tbody></table></div></div>
      </div>
      <p class="small section">For visitors by day, where they came from, devices and countries, open the <a href="${base}" target="_blank" rel="noopener">GoatCounter dashboard</a>. For the list of accounts, open Firebase → Authentication → Users.</p>`;
  }
  box.innerHTML = '<p class="muted">Loading counts…</p>';
  load();
})();
