(() => {
  const { esc, day, STATES, PARTY } = CHI;
  const S = window.CHI_SUMMARY || {};
  const P = S.polls;
  const $ = id => document.getElementById(id);
  const pct = x => x > 0.99 ? ">99%" : x < 0.01 ? "<1%" : Math.round(x * 100) + "%";
  const cls = p => p === "D" ? "D" : p === "R" ? "R" : "I";
  const partyName = p => p === "D" ? "Democrat" : p === "R" ? "Republican" : p === "I" ? "Independent" : p || "";
  const initials = n => (n || "").split(/\s+/).filter(w => /^[A-Za-z]/.test(w) && !/^(jr|sr|ii|iii|iv)\.?$/i.test(w)).map(w => w[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join("").toUpperCase();
  const face = (c, size) => c.photo
    ? `<img class="face" src="data/${esc(c.photo)}" alt="" width="${size}" height="${Math.round(size * 1.22)}" style="width:${size}px;height:${Math.round(size * 1.22)}px">`
    : `<span class="face none" aria-hidden="true" style="width:${size}px;height:${Math.round(size * 1.22)}px;font-size:${Math.round(size / 3)}px">${esc(initials(c.name))}</span>`;
  const raceName = r => r.office === "HOUSE" ? `${r.state}-${r.district}` : `${STATES[r.state]} ${r.office === "SEN" ? "Senate" : "governor"}`;

  // ---------- scoreboard ----------
  if (P) {
    const chamber = (name, c, total, need) => {
      const d = Math.round(c.dMean), r = total - d;
      return `<div><p class="ch">${name} forecast</p>
        <div class="nums"><span class="D">${d}<small>Dem.</small></span><span class="R"><small>Rep.</small>${r}</span></div>
        <div class="seatbar" role="img" aria-label="${d} Democratic and ${r} Republican seats projected; ${need} needed for a majority"><i style="flex:${d};background:var(--d)"></i><i style="flex:${r};background:var(--r)"></i><b style="left:calc(${(need / total) * 100}% - 1px)"></b></div>
        <div class="odds"><span class="D">Democrats ${pct(c.pD)} to win</span><span class="R">Republicans ${pct(c.pR)}</span></div></div>`;
    };
    const updated = new Date(P.generated).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
    $("board").innerHTML = chamber("Senate", P.senate, 100, 51) + chamber("House", P.house, 435, 218) +
      `<div><div class="big">${P.daysOut}</div><p style="margin:6px 0 0;font-weight:600">${P.daysOut === 1 ? "day" : "days"} to Election Day,<br>Tuesday, Nov. 3</p><p class="note">Updated ${esc(updated)} ET</p></div>`;
    if (P.nRaces) $("allraces").textContent = `All ${P.nRaces} races`;
    $("watch").innerHTML = P.close.map(r => {
      const sh = r.share || {};
      const side = (sd, right) => {
        const c = r[sd], inc = c.name === r.incumbent || (c.mid && c.mid === r.incumbentId);
        return `<div class="c${right ? " rt" : ""}"><div class="n">${esc(c.name)}</div><div class="p">${partyName(c.party)}${inc ? ", incumbent" : ""}</div><div class="v ${cls(c.party)}">${sh[sd] != null ? sh[sd].toFixed(1) + "%" : ""}</div></div>`;
      };
      const lc = cls(r.left.party) === "R" ? "var(--r)" : cls(r.left.party) === "I" ? "var(--i)" : "var(--d)";
      const rc = cls(r.right.party) === "D" ? "var(--d)" : cls(r.right.party) === "I" ? "var(--i)" : "var(--r)";
      return `<a class="h2h" href="polls/#${esc(r.id)}">${face(r.left, 64)}${side("left")}
        <div class="mid"><div class="t">${esc(raceName(r))}</div><div class="wb"><i style="flex:${r.pLeft};background:${lc}"></i><i style="flex:${1 - r.pLeft};background:${rc}"></i></div>
          <div class="lab"><span class="${cls(r.left.party)}">${pct(r.pLeft)}</span> chance to win <span class="${cls(r.right.party)}">${pct(1 - r.pLeft)}</span></div></div>
        ${side("right", true)}${face(r.right, 64)}</a>`;
    }).join("");
  } else {
    $("board").innerHTML = `<div><p class="ch">2026 forecast</p><p class="note">The forecast appears after the first daily data update.</p></div>`;
  }

  // ---------- traders + votes ----------
  $("traders").innerHTML = (S.traders || []).map(t => `<li><img class="face" src="data/photos/m/${esc(t.id)}.webp" alt="" width="38" height="46" style="width:38px;height:46px">
    <a class="who" href="members/#${esc(t.state)}" style="text-decoration:none"><b>${esc(t.name)}</b><span><span class="${t.party}">${t.party}-${t.state}</span>, ${t.chamber === "Senate" ? "senator" : "representative"}</span></a>
    <span class="k">${t.term.toLocaleString()}</span></li>`).join("") || '<li class="muted">No trades disclosed this term.</li>';

  const shortResult = s => { const m = (s || "").match(/(Not Agreed to|Agreed to|Not Sustained|Sustained|Confirmed|Rejected|Passed|Failed|Adopted|Not Invoked|Invoked)$/i); return m ? m[1] : s || ""; };
  $("latest").innerHTML = (S.votes || []).map(v => `<a class="vote" href="votes/"><div><b>${esc(v.bill || "")}</b> ${esc((v.title || v.desc || v.q).slice(0, 90))}
      <div class="q">${v.c === "H" ? "House" : "Senate"}, ${esc(new Date(v.date + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }))}. ${esc(v.q)}</div></div>
    <div><div class="tally">${v.yea}–${v.nay}</div><div class="res">${esc(shortResult(v.result))}</div></div></a>`).join("") || '<p class="muted">No recent roll calls.</p>';

  // ---------- your state ----------
  CHI.onProfile(p => {
    const box = $("yours");
    box.className = "yours";
    if (!p.state) {
      box.innerHTML = `<div class="row" style="justify-content:space-between"><span style="font-weight:600">See your senators, representatives and races first.</span>
        <label for="pick" class="row small" style="gap:8px">Your state <select id="pick" class="input">${CHI.stateOptions("", "Choose")}</select></label></div>`;
      $("pick").onchange = e => CHI.accounts.setState(e.target.value);
      return;
    }
    const d = (S.delegations || []).filter(m => m[3] === p.state).sort((a, b) => (a[4] === "Senate" ? -1 : 1) - (b[4] === "Senate" ? -1 : 1) || (+a[5] || 0) - (+b[5] || 0));
    const races = P ? P.races.filter(r => r[2] === p.state) : [];
    box.innerHTML = `<div class="grid2" style="align-items:start;gap:28px">
        <div><h2 style="font-size:26px;margin-bottom:8px">Your delegation: ${esc(STATES[p.state])}</h2><div class="stack small" style="gap:4px">${d.map(m =>
          `<a href="members/#${p.state}" style="text-decoration:none"><span class="${m[2]}" style="font-weight:700">${esc(m[1])}</span> <span class="muted">${m[4] === "Senate" ? "Senator" : m[5] ? "District " + m[5] : "At-large"}</span></a>`).join("")}</div></div>
        <div><h2 style="font-size:26px;margin-bottom:8px">Statewide races</h2><div class="stack small" style="gap:6px">${races.length ? races.map(r =>
          `<a href="polls/#${esc(r[0])}" class="row" style="justify-content:space-between;text-decoration:none"><span><b>${r[1] === "SEN" ? "Senate" : "Governor"}</b> ${esc(r[5])} vs ${esc(r[6])}</span><span class="rate ${r[4]}">${esc(r[3])}</span></a>`).join("") : '<span class="muted">No Senate or governor race this year.</span>'}</div>
          <p class="small" style="margin-top:8px"><a href="polls/#house">House races in ${esc(STATES[p.state])}</a></p></div>
      </div>`;
  });
})();
