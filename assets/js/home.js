(() => {
  const { esc, day, STATES, PARTY } = CHI;
  const S = window.CHI_SUMMARY || {};
  const $ = id => document.getElementById(id);
  const pct = x => Math.round(x * 100) + "%";
  const P = S.polls;
  const tile = (href, kicker, big, text) => `<a class="panel stack" href="${href}" style="text-decoration:none;gap:6px"><span class="kicker" style="color:var(--ink2)">${kicker}</span><b style="font-size:24px;font-weight:800;line-height:1.15">${big}</b><span class="small muted">${text}</span></a>`;
  $("tiles").innerHTML = [
    tile("polls/", "2026 forecast", P ? `<span class="D">D ${pct(P.senate.pD)}</span> · <span class="R">R ${pct(P.senate.pR)}</span>` : "Polls", P ? `Chance of controlling the Senate. ${P.daysOut} days to Election Day.` : "Senate, House and governor races."),
    tile("members/", "Members", "Financial integrity", "Stock trades, trading volume, corporate PAC money and education for every member."),
    tile("votes/", "Votes", "How they voted", "Every roll call with the sponsor and each member's vote."),
    tile("capitle/", "Daily game", "Capitle", "Guess the politician. A new member of Congress every day."),
    tile("political-quiz/", "Quiz", "Where do you land, 0 to 100?", "16 questions place you from Democrat to Republican."),
    tile("headcount/", "Quiz", "Headcount", "Name every senator, or race the clock in a speed round and beat your high score."),
  ].join("");

  const raceName = r => r.office === "HOUSE" ? `${r.state}-${r.district}` : STATES[r.state];
  if (P) $("close").innerHTML = P.close.map(r => `<a href="polls/#sen" class="row" style="justify-content:space-between;text-decoration:none;border-bottom:1px solid var(--line);padding-bottom:6px">
    <span><b>${esc(raceName(r))}</b> <span class="small"><span class="${r.left.party}">${esc(r.left.name)}</span> vs <span class="${r.right.party}">${esc(r.right.name)}</span></span></span><span class="rate ${r.slug}">${r.rating}</span></a>`).join("");
  $("traders").innerHTML = (S.traders || []).map(t => `<a href="members/#${t.state}" class="row" style="justify-content:space-between;text-decoration:none;border-bottom:1px solid var(--line);padding-bottom:6px">
    <span><b>${esc(t.name)}</b> <span class="small ${t.party}">${t.party}-${t.state}</span></span><span class="small"><b>${t.term.toLocaleString()}</b> trades this term</span></a>`).join("") || '<p class="small muted">Loads with the next data update.</p>';
  if (S.votes && S.votes.length) $("latest").innerHTML = `<h2>Latest votes</h2><div class="stack" style="margin-top:10px;gap:6px">${S.votes.map(v => `<a href="votes/" class="row" style="justify-content:space-between;text-decoration:none;border-bottom:1px solid var(--line);padding-bottom:6px;flex-wrap:nowrap;gap:12px">
    <span style="min-width:0"><b>${esc(v.bill || "Vote")}</b> <span class="small">${esc((v.title || v.q).slice(0, 90))}</span><br><span class="tiny muted">${v.c === "H" ? "House" : "Senate"} · ${esc(day(v.date))} · ${esc(v.q)}</span></span><span class="small" style="white-space:nowrap">${v.yea}–${v.nay}</span></a>`).join("")}</div>`;

  CHI.onProfile(p => {
    const box = $("yours");
    if (!p.state) {
      box.innerHTML = `<div class="panel row" style="justify-content:space-between"><span>See your senators, representatives and races first.</span>
        <label for="pick" class="row small" style="gap:8px">Your state <select id="pick" class="input">${CHI.stateOptions("", "Choose")}</select></label></div>`;
      $("pick").onchange = e => CHI.accounts.setState(e.target.value);
      return;
    }
    const d = (S.delegations || []).filter(m => m[3] === p.state).sort((a, b) => (a[4] === "Senate" ? -1 : 1) - (b[4] === "Senate" ? -1 : 1) || (+a[5] || 0) - (+b[5] || 0));
    const races = P ? P.races.filter(r => r[2] === p.state) : [];
    box.innerHTML = `<h2>${STATES[p.state]}</h2>
      <div class="grid2" style="margin-top:10px;align-items:start">
        <div><h3 style="margin-bottom:6px">Your delegation</h3><div class="stack small" style="gap:4px">${d.map(m => `<a href="members/#${p.state}" style="text-decoration:none"><span class="${m[2]}" style="font-weight:600">${esc(m[1])}</span> <span class="muted">${m[4] === "Senate" ? "Senator" : m[5] ? "District " + m[5] : "At-large"} · ${PARTY[m[2]]}</span></a>`).join("")}</div></div>
        <div><h3 style="margin-bottom:6px">Your statewide races</h3><div class="stack small" style="gap:6px">${races.length ? races.map(r => `<a href="polls/#${r[1] === "SEN" ? "sen" : "gov"}" class="row" style="justify-content:space-between;text-decoration:none"><span>${r[1] === "SEN" ? "Senate" : "Governor"}: ${esc(r[5])} vs ${esc(r[6])}</span><span class="rate ${r[4]}">${r[3]}</span></a>`).join("") : '<span class="muted">No Senate or governor race this year.</span>'}</div>
        <p class="small" style="margin-top:8px"><a href="polls/#house">House races in ${STATES[p.state]}</a></p></div>
      </div>`;
  });
})();
