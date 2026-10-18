(() => {
  const { esc, day, STATES, PARTY } = CHI;
  const P = window.CHI_POLLS;
  const MAP = window.CHI_USMAP;
  const $ = id => document.getElementById(id);
  if (!P) {
    document.querySelectorAll("main > section, main > .grid2, main > .tabs").forEach(e => { if (e.id !== "method") e.hidden = true; });
    $("lede").textContent = "Polling averages and the forecast appear here after the first daily data update.";
    return;
  }
  const RACES = P.races;
  const ORDER = ["safe-d", "likely-d", "lean-d", "tossup", "lean-r", "likely-r", "safe-r"];
  const LABEL = { "safe-d": "Safe D", "likely-d": "Likely D", "lean-d": "Lean D", tossup: "Toss-up", "lean-r": "Lean R", "likely-r": "Likely R", "safe-r": "Safe R" };
  const COLOR = s => `var(--${s})`;
  const pct = x => Math.round(x * 100) + "%";
  const pctFine = x => x > 0.99 ? ">99%" : x < 0.01 ? "<1%" : pct(x);
  const raceName = r => r.office === "HOUSE" ? `${r.state}-${r.district}` : `${STATES[r.state]}${r.special ? " (special)" : ""}`;
  const partyClass = p => p === "D" ? "D" : p === "R" ? "R" : "I";
  const marginTxt = (m, r) => m == null ? "–" : Math.abs(m) < 0.05 ? "Even" : m > 0 ? `${r.left.party}+${m.toFixed(1)}` : `${r.right.party}+${(-m).toFixed(1)}`;
  const leader = r => r.pLeft >= 0.5 ? r.left : r.right;
  const lead = r => r.pLeft >= 0.5 ? r.pLeft : 1 - r.pLeft;
  const winParty = r => (r.pLeft >= 0.5 ? r.left.party : r.right.party);
  const flips = r => r.incParty && !r.uncontested && winParty(r) !== r.incParty && !(r.incParty === "I" && winParty(r) === "R" && r.office === "HOUSE");
  const PHOTOS = window.CHI_CANDPHOTOS || {};
  const norm = n => (n || "").replace(/\(.*?\)/g, " ").toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/'/g, "").replace(/-/g, " ").trim().split(/\s+/).join(" ");
  const photoOf = (r, c) => c && c.name ? PHOTOS[`${r.state}|${norm(c.name)}`] : null;
  const initials = n => (n || "").replace(/\(.*?\)/g, "").split(/\s+/).filter(w => /^[A-Za-z]/.test(w) && !/^(jr|sr|ii|iii|iv)\.?$/i.test(w)).map(w => w[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join("").toUpperCase();
  const face = (r, c, size) => {
    const ph = photoOf(r, c), h = Math.round(size * 1.22);
    return ph ? `<img class="face" src="${CHI.root}data/${esc(ph.src)}" alt="" width="${size}" height="${h}" loading="lazy" style="width:${size}px;height:${h}px">`
      : `<span class="face none" aria-hidden="true" style="width:${size}px;height:${h}px;font-size:${Math.round(size / 2.6)}px">${esc(initials(c && c.name))}</span>`;
  };
  const share = (r, side) => r.share ? r.share[side] : null;
  const pct1 = v => v == null ? "–" : v >= 99.95 ? "100%" : v.toFixed(1) + "%";
  const tip = $("tip");
  const showTip = (e, html) => { tip.innerHTML = html; tip.hidden = false; const x = Math.min(e.clientX + 14, innerWidth - 280); tip.style.left = x + "px"; tip.style.top = (e.clientY + 14) + "px"; };
  const hideTip = () => { tip.hidden = true; };
  const cand = (c, short) => c && c.name ? `<span class="${partyClass(c.party)}" style="font-weight:600">${esc(short ? c.name.split(" ").slice(-1)[0] : c.name)}</span> <span class="tiny muted">(${esc(c.party)}${c.age ? ", " + c.age : ""})</span>` : '<span class="blank">none</span>';

  $("lede").textContent = `${P.daysOut} days until Election Day, November 3. Averages for every Senate, House and governor race, adjusted so no pollster's lean tilts the result. Updated ${day(P.generated.slice(0, 10))}.`;

  // ---------- topline ----------
  const S = P.senate, H = P.house, G = P.national.generic, A = P.national.approval;
  const control = (c, need) => `<div class="row" style="gap:6px 14px"><span class="D" style="font-weight:800;font-size:26px">${pct(c.pD)}</span><span class="small muted">Democrats</span>
    <span class="R" style="font-weight:800;font-size:26px">${pct(c.pR)}</span><span class="small muted">Republicans</span></div>
    <div class="small muted">Projected ${Math.round(c.dMean)} D, ${Math.round(c.rMean)} R${c.iMean >= 0.5 ? `, ${Math.round(c.iMean)} I` : ""}. Majority is ${need}.</div>`;
  $("topline").innerHTML = `
    <div class="panel stack" style="gap:6px"><span class="kicker" style="color:var(--ink2)">Senate control</span>${control(S, "51, or 50 with the vice president")}</div>
    <div class="panel stack" style="gap:6px"><span class="kicker" style="color:var(--ink2)">House control</span>${control(H, "218")}</div>
    <div class="panel stack" style="gap:6px"><span class="kicker" style="color:var(--ink2)">Generic ballot</span>
      ${G ? `<b style="font-size:26px;font-weight:800" class="${G.margin >= 0 ? "D" : "R"}">${G.margin >= 0 ? "D" : "R"}+${Math.abs(G.margin).toFixed(1)}</b><div class="small muted">Democrats ${G.a}%, Republicans ${G.b}% across ${G.n} polls</div>` : '<span class="muted">No recent polls</span>'}</div>
    <div class="panel stack" style="gap:6px"><span class="kicker" style="color:var(--ink2)">Trump approval</span>
      ${A ? `<b style="font-size:26px;font-weight:800">${A.a}%</b><div class="small muted">${A.b}% disapprove, net ${(A.a - A.b).toFixed(0)} across ${A.n} polls</div>` : '<span class="small muted">No recent polls</span>'}</div>`;

  // ---------- chamber bars ----------
  function bar(title, c, total, need) {
    const segs = [];
    if (c.notUp) segs.push({ k: "held-d", n: c.notUp.D || 0, label: "Democrats not up", bg: "repeating-linear-gradient(135deg,var(--safe-d) 0 3px,#cfdcf2 3px 6px)" });
    ORDER.forEach(k => segs.push({ k, n: c.ratings[k] || 0, label: LABEL[k], bg: COLOR(k) }));
    if (c.notUp) { if (c.notUp.I) segs.splice(1, 0, { k: "held-i", n: c.notUp.I, label: "Independents not up", bg: "var(--i)" }); segs.push({ k: "held-r", n: c.notUp.R || 0, label: "Republicans not up", bg: "repeating-linear-gradient(135deg,var(--safe-r) 0 3px,#f3d0cd 3px 6px)" }); }
    const html = segs.filter(s => s.n).map(s => `<div title="${s.label}: ${s.n}" style="flex:${s.n};background:${s.bg};min-width:2px;display:grid;place-items:center;color:${["lean-d", "lean-r", "tossup"].includes(s.k) ? "#222" : "#fff"};font-size:12px;font-weight:700">${s.n >= total / 30 ? s.n : ""}</div>`).join("");
    return `<div><div class="row" style="justify-content:space-between"><h3>${title}</h3><span class="small muted">${need} for a majority</span></div>
      <div style="position:relative;margin-top:6px"><div style="display:flex;gap:2px;height:30px;border-radius:3px;overflow:hidden">${html}</div>
      <div style="position:absolute;top:-4px;bottom:-4px;left:${(need / total) * 100}%;width:2px;background:var(--ink)" aria-hidden="true"></div></div></div>`;
  }
  $("bars").innerHTML = bar("Senate (100 seats)", S, 100, 51) + bar("House (435 seats)", H, 435, 218);
  $("legend").innerHTML = ORDER.map(k => `<span style="white-space:nowrap;margin-right:12px"><span class="dot" style="color:${COLOR(k)}"></span> ${LABEL[k]}</span>`).join("") + `<span style="white-space:nowrap">Striped: seats not up this year</span>`;

  // ---------- tabs ----------
  let tab = "SEN";
  const st = { limit: 60 };
  $("tabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-tab]"); if (!b) return;
    tab = b.dataset.tab; st.limit = 60;
    $("tabs").querySelectorAll("button").forEach(x => x.setAttribute("aria-selected", x === b));
    try { history.replaceState(null, "", "#" + tab.toLowerCase()); } catch (e) {}
    paint();
  });
  const fromHash = { sen: "SEN", senate: "SEN", house: "HOUSE", gov: "GOV", governors: "GOV", nat: "NAT", national: "NAT", pres: "PRES", president: "PRES" }[location.hash.slice(1).toLowerCase()];
  if (fromHash) { tab = fromHash; $("tabs").querySelectorAll("button").forEach(x => x.setAttribute("aria-selected", x.dataset.tab === tab)); }

  $("fstate").innerHTML = CHI.stateOptions("", "All states");
  ["q", "fstate", "frate", "finc", "fpolls"].forEach(id => $(id).addEventListener("input", () => { st.limit = 60; renderTable(); }));
  $("more").addEventListener("click", () => { st.limit = Infinity; renderTable(); });

  function paint() {
    const races = tab === "SEN" || tab === "HOUSE" || tab === "GOV";
    $("pane-races").hidden = !races; $("pane-nat").hidden = tab !== "NAT"; $("pane-pres").hidden = tab !== "PRES";
    if (races) { renderViz(); renderTable(); }
    if (tab === "NAT") renderNational();
    if (tab === "PRES") renderPres();
  }

  // ---------- map / grid ----------
  function tipHtml(r) {
    return `<b>${esc(raceName(r))}</b> <span class="rate ${r.ratingSlug}">${r.rating}</span><br>${cand(r.left)} vs ${cand(r.right)}<br>
      ${r.uncontested ? "Uncontested" : `Projected vote ${pct1(share(r, "left"))} to ${pct1(share(r, "right"))}<br>${esc(leader(r).name)} ${pctFine(lead(r))} to win`}${r.polls ? `<br><span class="muted">Poll average ${marginTxt(r.polls.margin, r)} (${r.polls.n} polls)</span>` : ""}`;
  }
  function renderViz() {
    const list = RACES.filter(r => r.office === tab);
    if (tab === "HOUSE") {
      const by = {};
      list.forEach(r => (by[r.state] = by[r.state] || []).push(r));
      $("map").innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 14px" aria-label="House districts by state">${Object.keys(by).sort().map(s =>
        `<div><div class="tiny" style="font-weight:700">${s}</div><div style="display:flex;flex-wrap:wrap;gap:2px">${by[s].map(r =>
          `<button class="cell" data-id="${r.id}" aria-label="${esc(raceName(r))}: ${r.rating}" style="width:14px;height:14px;border:0;padding:0;border-radius:2px;background:${COLOR(r.ratingSlug)};cursor:pointer"></button>`).join("")}</div></div>`).join("")}</div>`;
    } else {
      const byState = Object.fromEntries(list.map(r => [r.state, r]));
      const paths = Object.entries(MAP.states).map(([s, g]) => {
        const r = byState[s] || list.find(x => x.state === s);
        return `<path d="${g.d}" data-id="${r ? r.id : ""}" fill="${r ? COLOR(r.ratingSlug) : "#eef0f2"}" stroke="#fff" stroke-width="1" style="${r ? "cursor:pointer" : ""}"><title>${STATES[s]}${r ? ": " + r.rating : ": no race"}</title></path>`;
      }).join("");
      const labels = Object.entries(MAP.states).filter(([s]) => !["RI", "DE", "CT", "NJ", "MD", "MA", "NH", "VT", "DC", "HI"].includes(s)).map(([s, g]) =>
        `<text x="${g.c[0]}" y="${g.c[1]}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="600" fill="${byState[s] && ["safe-d", "likely-d", "likely-r", "safe-r"].includes(byState[s].ratingSlug) ? "#fff" : "#333"}" pointer-events="none">${s}</text>`).join("");
      $("map").innerHTML = `<svg viewBox="0 0 ${MAP.w} ${MAP.h}" role="img" aria-label="${tab === "SEN" ? "Senate" : "Governor"} race ratings by state" style="width:100%;height:auto;display:block">${paths}${labels}</svg>`;
    }
    $("map").onmousemove = e => { const t = e.target.closest("[data-id]"); const r = t && RACES.find(x => x.id === t.dataset.id); r ? showTip(e, tipHtml(r)) : hideTip(); };
    $("map").onmouseleave = hideTip;
    $("map").onclick = e => { const t = e.target.closest("[data-id]"); if (t && t.dataset.id) open(t.dataset.id); };

    // side panel: seat distribution + home-state races
    const c = tab === "SEN" ? S : tab === "HOUSE" ? H : null;
    let side = "";
    if (c) {
      const need = tab === "SEN" ? 51 : 218;
      const entries = Object.entries(c.dHist).map(([k, v]) => [+k, v]).filter(([, v]) => v >= 0.002);
      const max = Math.max(...entries.map(e => e[1]));
      const lo = entries[0][0], hi = entries[entries.length - 1][0];
      const W = 100 / (hi - lo + 1);
      side += `<div class="panel"><h3>Democratic seats in 20,000 simulations</h3>
        <div style="display:flex;align-items:flex-end;gap:1px;height:120px;margin-top:10px" role="img" aria-label="Distribution of Democratic seats">${entries.map(([k, v]) =>
          `<div title="${k} D seats: ${(v * 100).toFixed(1)}%" style="width:${W}%;height:${(v / max) * 100}%;background:${k >= need ? "var(--d)" : "var(--r)"};border-radius:2px 2px 0 0"></div>`).join("")}</div>
        <div class="row tiny muted" style="justify-content:space-between;margin-top:4px"><span>${lo}</span><span>Democratic seats</span><span>${hi}</span></div>
        <p class="small" style="margin:8px 0 0">Middle 80% of outcomes: ${c.dP10} to ${c.dP90} Democratic seats. Blue bars are Democratic majorities.</p></div>`;
    } else {
      const g = P.governors;
      side += `<div class="panel"><h3>Governors</h3><p class="small" style="margin:6px 0 0">${g.up} races this year. Democrats are projected to win about ${Math.round(g.dMean)} of them.</p>
        <div class="stack small" style="gap:4px;margin-top:10px">${ORDER.map(k => `<div class="row" style="justify-content:space-between"><span><span class="dot" style="color:${COLOR(k)}"></span> ${LABEL[k]}</span><b>${g.ratings[k]}</b></div>`).join("")}</div></div>`;
    }
    const mine = CHI.profile.state;
    if (mine) {
      const ours = RACES.filter(r => r.state === mine && (r.office !== "HOUSE" || tab === "HOUSE")).filter(r => r.office === tab || tab !== "HOUSE");
      side += `<div class="panel"><h3>Your state: ${STATES[mine]}</h3><div class="stack small" style="gap:6px;margin-top:8px">${ours.length ? ours.map(r =>
        `<button class="row" data-id="${r.id}" style="justify-content:space-between;border:0;background:none;padding:0;text-align:left;cursor:pointer"><span>${r.office === "SEN" ? "Senate" : r.office === "GOV" ? "Governor" : r.state + "-" + r.district}: ${cand(r.left, true)} vs ${cand(r.right, true)}</span><span class="rate ${r.ratingSlug}">${r.rating}</span></button>`).join("") : '<span class="muted">No races of this type in your state this year.</span>'}</div></div>`;
    } else {
      side += `<div class="panel small">Set your home state on the <a href="../account/">account page</a> and your races show up here first.</div>`;
    }
    $("side").innerHTML = side;
    $("side").onclick = e => { const t = e.target.closest("[data-id]"); if (t) open(t.dataset.id); };
  }

  // ---------- table ----------
  function renderTable() {
    const q = $("q").value.trim().toLowerCase(), fs = $("fstate").value, fr = $("frate").value, fi = $("finc").value, fp = $("fpolls").value;
    const list = RACES.filter(r => r.office === tab).filter(r =>
      (!fs || r.state === fs) && (!fp || r.polls) &&
      (!fi || (fi === "open" ? !r.incRunning : r.incRunning && r.incParty === fi)) &&
      (!fr || (fr === "comp" ? ["lean-d", "tossup", "lean-r"].includes(r.ratingSlug) : fr === "tossup" ? r.ratingSlug === "tossup" : fr === "d" ? r.ratingSlug.endsWith("-d") : fr === "r" ? r.ratingSlug.endsWith("-r") : flips(r))) &&
      (!q || [r.left.name, r.right.name, r.incumbent, STATES[r.state], r.state, raceName(r)].some(x => (x || "").toLowerCase().includes(q))))
      .sort((a, b) => Math.abs(a.pLeft - 0.5) - Math.abs(b.pLeft - 0.5) || a.id.localeCompare(b.id));
    $("count").textContent = `${list.length} races, closest first`;
    $("thead").innerHTML = `<tr><th>Race</th><th>Candidates</th><th class="n">Projected vote</th><th class="n">Chance to win</th><th class="n">Poll average</th><th>Incumbent</th><th>Rating</th></tr>`;
    const two = (r, f) => `<div class="pair">${["left", "right"].map(sd => `<div>${f(sd)}</div>`).join("")}</div>`;
    $("rows").innerHTML = list.slice(0, st.limit).map(r => `<tr class="click" data-id="${r.id}" tabindex="0">
      <td><b>${esc(raceName(r))}</b>${flips(r) ? ' <span class="chip" style="border-color:var(--ink)">Flip</span>' : ""}</td>
      <td>${two(r, sd => r[sd].name ? `<span class="who">${face(r, r[sd], 26)}<span>${cand(r[sd])}${r[sd].name === r.incumbent || (r[sd].mid && r[sd].mid === r.incumbentId) ? ' <span class="tiny muted">inc.</span>' : ""}</span></span>` : '<span class="blank">No candidate</span>')}</td>
      <td class="n">${r.uncontested ? "Unopposed" : two(r, sd => `<b class="${partyClass(r[sd].party)}">${pct1(share(r, sd))}</b>`)}</td>
      <td class="n">${r.uncontested ? "" : two(r, sd => { const p = sd === "left" ? r.pLeft : 1 - r.pLeft; return `<span class="${p >= 0.5 ? partyClass(r[sd].party) : "muted"}" style="font-weight:${p >= 0.5 ? 700 : 400}">${pctFine(p)}</span>`; })}</td>
      <td class="n">${r.polls ? `${two(r, sd => (sd === "left" ? r.polls.a : r.polls.b).toFixed(1))}<span class="tiny muted">${r.polls.n} poll${r.polls.n > 1 ? "s" : ""}</span>` : '<span class="blank">no polls</span>'}</td>
      <td class="small">${r.incRunning ? `<span class="${partyClass(r.incParty)}">${esc(r.incParty)}</span> running` : r.incParty ? `Open (${esc(r.incParty)} held)` : "Open"}</td>
      <td><span class="rate ${r.ratingSlug}">${r.rating}</span></td></tr>`).join("");
    $("more").hidden = list.length <= st.limit;
    $("more").textContent = `Show all ${list.length}`;
  }
  $("rows").addEventListener("click", e => { const tr = e.target.closest("tr[data-id]"); if (tr) open(tr.dataset.id); });
  $("rows").addEventListener("keydown", e => { if (e.key === "Enter") { const tr = e.target.closest("tr[data-id]"); if (tr) open(tr.dataset.id); } });

  // ---------- race drawer ----------
  function open(id) {
    const r = RACES.find(x => x.id === id); if (!r) return;
    const lo = r.mean - 1.28 * r.sd, hi = r.mean + 1.28 * r.sd;
    const fact = (a, b) => `<dt>${a}</dt><dd>${b}</dd>`;
    const polls = r.polls ? `<div class="tablewrap"><table class="data" style="font-size:13px"><thead><tr><th>Pollster</th><th>Dates</th><th class="n">Sample</th><th class="n">${esc(r.left.name.split(" ").slice(-1)[0])}</th><th class="n">${esc(r.right.name.split(" ").slice(-1)[0])}</th><th class="n">Adj.</th></tr></thead><tbody>
      ${r.polls.list.map(p => `<tr><td style="white-space:normal">${esc(p.pollster)}${p.party ? ` <span class="chip ${p.party}" title="Sponsored by a ${PARTY[p.party]} group">${p.party} sponsor</span>` : p.internal ? ' <span class="chip">internal</span>' : ""}</td>
        <td>${esc(day(p.end))}</td><td class="n">${p.n ? p.n.toLocaleString() + " " + esc(p.pop) : esc(p.pop)}</td><td class="n">${p.left}</td><td class="n">${p.right}</td><td class="n">${p.adj ? (p.adj > 0 ? "+" : "") + p.adj : "0"}</td></tr>`).join("")}</tbody></table></div>
      <p class="tiny muted">Adj. is the change to the poll's margin from sponsor and house-effect corrections (positive moves it toward the Democratic side).</p>` : '<p class="small muted">No public polls yet. The forecast uses the baseline only.</p>';
    $("drawer").innerHTML = `<button class="btn ghost close" id="close">Close</button>
      <span class="kicker">${r.office === "SEN" ? "Senate" : r.office === "GOV" ? "Governor" : "House"}</span>
      <h2 id="dname" style="margin:4px 0 8px">${esc(raceName(r))}</h2>
      <span class="rate ${r.ratingSlug}">${r.rating}</span>
      <div class="duel">${["left", "right"].map(sd => { const c = r[sd], p = sd === "left" ? r.pLeft : 1 - r.pLeft, ph = photoOf(r, c), sh = r.share || {};
        return `<div class="side">${face(r, c, 72)}<div class="stack" style="gap:2px;min-width:0"><div>${cand(c)}</div>
          ${r.uncontested ? (c.name ? '<div class="small">Unopposed</div>' : "") : `<div class="big ${partyClass(c.party)}">${pct1(sh[sd])}</div>
          <div class="tiny muted">projected vote${sh[sd + "Lo"] != null ? `, likely ${sh[sd + "Lo"].toFixed(0)} to ${sh[sd + "Hi"].toFixed(0)}` : ""}</div>
          <div class="small" style="margin-top:4px"><b>${pctFine(p)}</b> chance to win</div>`}
          ${r.polls ? `<div class="tiny muted">Poll average ${(sd === "left" ? r.polls.a : r.polls.b).toFixed(1)}%</div>` : ""}
          ${ph && ph.credit ? `<div class="tiny muted credit">${esc(ph.credit)}</div>` : ""}</div></div>`; }).join("")}</div>
      ${r.other ? `<p class="small muted" style="margin-top:10px">Also running: ${esc(r.other.name)} (${esc(r.other.party)})${r.share && r.share.other ? `. Third-party and write-in vote projected at ${r.share.other.toFixed(1)}%.` : ""}</p>` : ""}
      ${r.uncontested ? `<p class="small" style="margin-top:14px">Only one major-party candidate is on the ballot.</p>` : `
      <div style="margin-top:16px"><div class="row small" style="justify-content:space-between"><span class="${partyClass(r.left.party)}"><b>${pctFine(r.pLeft)}</b> ${esc(r.left.name)}</span><span class="${partyClass(r.right.party)}">${esc(r.right.name)} <b>${pctFine(1 - r.pLeft)}</b></span></div>
        <div style="display:flex;gap:2px;height:10px;margin-top:4px"><div style="flex:${r.pLeft};background:var(--d);border-radius:2px"></div><div style="flex:${1 - r.pLeft};background:var(--r);border-radius:2px"></div></div></div>
      <dl class="facts" style="margin-top:16px">
        ${fact("Forecast margin", marginTxt(r.mean, r))}
        ${fact("80% range", `${marginTxt(lo, r)} to ${marginTxt(hi, r)}`)}
        ${fact("Poll average", r.polls ? `${marginTxt(r.polls.margin, r)} <span class="tiny muted">${r.polls.n} polls, latest ${day(r.polls.last)}</span>` : "No polls")}
        ${fact("Baseline", `${marginTxt(r.fund, r)} <span class="tiny muted">national ${marginTxt(P.national.generic?.margin ?? 0, { left: { party: "D" }, right: { party: "R" } })}, lean ${marginTxt(r.lean, { left: { party: "D" }, right: { party: "R" } })}${r.incRunning ? ", incumbency" : ""}</span>`)}
        ${fact("Incumbent", r.incumbent ? `${esc(r.incumbent)} (${esc(r.incParty)})${r.incumbentAge ? `, age ${r.incumbentAge}` : ""}${r.incRunning ? "" : ", not running"}` : "Open seat")}
      </dl>`}
      <h3 style="margin:22px 0 8px">Polls</h3>${polls}
      ${r.status ? `<p class="small muted" style="margin-top:14px">${esc(r.status)}</p>` : ""}`;
    $("drawer").hidden = $("shade").hidden = false;
    $("close").focus(); $("close").onclick = shut;
    CHI.track("race-open");
  }
  function shut() { $("drawer").hidden = $("shade").hidden = true; }
  $("shade").addEventListener("click", shut);
  document.addEventListener("keydown", e => { if (e.key === "Escape") shut(); });

  // ---------- national polls ----------
  function lineChart(series, opts) {
    const all = series.flatMap(s => s.pts);
    if (!all.length) return '<p class="muted small">Not enough polls yet.</p>';
    const W = 720, Hh = 260, L = 36, R = 64, T = 12, B = 26;
    const t0 = new Date(all[0][0]).getTime(), t1 = Math.max(...all.map(p => new Date(p[0]).getTime()));
    let y0 = Math.floor(Math.min(...all.map(p => p[1])) - 2), y1 = Math.ceil(Math.max(...all.map(p => p[1])) + 2);
    const x = t => L + ((new Date(t).getTime() - t0) / Math.max(1, t1 - t0)) * (W - L - R);
    const y = v => T + (1 - (v - y0) / (y1 - y0)) * (Hh - T - B);
    const ticks = []; for (let v = Math.ceil(y0 / 2) * 2; v <= y1; v += 2) ticks.push(v);
    const months = []; const d = new Date(t0); d.setDate(1); d.setMonth(d.getMonth() + 1);
    while (d.getTime() <= t1) { months.push(new Date(d)); d.setMonth(d.getMonth() + 1); }
    const lines = series.map(s => {
      const last = s.pts[s.pts.length - 1];
      return `<path d="${s.pts.map((p, i) => (i ? "L" : "M") + x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1)).join("")}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="${x(last[0])}" cy="${y(last[1])}" r="4" fill="${s.color}" stroke="#fff" stroke-width="2"/>
        <text x="${x(last[0]) + 8}" y="${y(last[1])}" dominant-baseline="central" font-size="12" font-weight="700" fill="#15181c">${s.name} ${last[1].toFixed(1)}${opts.unit || ""}</text>`;
    }).join("");
    const id = "c" + Math.random().toString(36).slice(2, 7);
    setTimeout(() => {
      const svg = document.getElementById(id); if (!svg) return;
      const dates = series[0].pts.map(p => p[0]);
      svg.addEventListener("mousemove", e => {
        const b = svg.getBoundingClientRect(); const px = (e.clientX - b.left) / b.width * W;
        let best = 0; dates.forEach((dt, i) => { if (Math.abs(x(dt) - px) < Math.abs(x(dates[best]) - px)) best = i; });
        const cx = x(dates[best]); svg.querySelector(".xh").setAttribute("x1", cx); svg.querySelector(".xh").setAttribute("x2", cx); svg.querySelector(".xh").style.display = "";
        showTip(e, `<b>${day(dates[best])}</b><br>${series.map(s => `<span style="color:${s.color}">●</span> ${s.name}: ${s.pts[best] ? s.pts[best][1].toFixed(1) + (opts.unit || "") : "–"}`).join("<br>")}`);
      });
      svg.addEventListener("mouseleave", () => { hideTip(); svg.querySelector(".xh").style.display = "none"; });
    });
    return `<svg id="${id}" viewBox="0 0 ${W} ${Hh}" style="width:100%;height:auto;display:block" role="img" aria-label="${esc(opts.label)}">
      ${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#eceef1"/><text x="${L - 6}" y="${y(v)}" text-anchor="end" dominant-baseline="central" font-size="11" fill="#6a727b">${v}</text>`).join("")}
      ${months.map(m => `<text x="${x(m.toISOString().slice(0, 10))}" y="${Hh - 6}" text-anchor="middle" font-size="11" fill="#6a727b">${m.toLocaleDateString("en-US", { month: "short" })}</text>`).join("")}
      <line class="xh" x1="0" x2="0" y1="${T}" y2="${Hh - B}" stroke="#9aa1a9" stroke-dasharray="3 3" style="display:none"/>
      ${lines}</svg>`;
  }
  function renderNational() {
    const N = P.national, g = N.genericByLean || {};
    const gs = N.genericSeries || [], as = N.approvalSeries || [];
    $("pane-nat").innerHTML = `
      <div class="grid2" style="margin-top:22px">
        <div class="panel"><h3>Generic congressional ballot</h3><p class="small muted" style="margin:4px 0 10px">Which party would you vote for in your district? Adjusted average, last six months.</p>
          ${lineChart([{ name: "Dem", color: "var(--d)", pts: gs.map(p => [p[0], p[2]]) }, { name: "Rep", color: "var(--r)", pts: gs.map(p => [p[0], p[3]]) }], { unit: "%", label: "Generic ballot average over time" })}</div>
        <div class="panel"><h3>Trump job approval</h3><p class="small muted" style="margin:4px 0 10px">Adjusted average, last six months.</p>
          ${lineChart([{ name: "Approve", color: "#5b6470", pts: as.map(p => [p[0], p[2]]) }, { name: "Disapprove", color: "#b07a00", pts: as.map(p => [p[0], p[3]]) }], { unit: "%", label: "Approval average over time" })}</div>
      </div>
      <section class="section"><h2>Does the pollster's lean change the answer?</h2>
        <p class="small">The same generic-ballot average built three ways. Raw numbers differ by who's asking; after our corrections they land close together.</p>
        <div class="tablewrap"><table class="data"><thead><tr><th>Pollsters</th><th class="n">Polls</th><th class="n">Raw average</th><th class="n">After adjustments</th></tr></thead><tbody>
        ${["R", "N", "D"].filter(k => g[k]).map(k => `<tr><td>${g[k].label}</td><td class="n">${g[k].n}</td><td class="n">${fmtGB(g[k].raw)}</td><td class="n"><b>${fmtGB(g[k].adjusted)}</b></td></tr>`).join("")}
        ${N.generic ? `<tr><td><b>All pollsters (our average)</b></td><td class="n">${N.generic.n}</td><td class="n">${fmtGB(N.generic.raw)}</td><td class="n"><b>${fmtGB(N.generic.margin)}</b></td></tr>` : ""}
        </tbody></table></div></section>
      <section class="section"><h2>Pollster house effects</h2>
        <p class="small">How far each pollster's national numbers run from the average of the others around the same dates, after shrinking toward zero for firms with few polls. We subtract this from their polls in every race.</p>
        <div class="tablewrap"><table class="data"><thead><tr><th>Pollster</th><th class="n">Polls measured</th><th class="n">House effect</th></tr></thead><tbody>
        ${N.pollsters.slice().sort((a, b) => Math.abs(b.he) - Math.abs(a.he)).slice(0, 30).map(p => `<tr><td>${esc(p.name)}</td><td class="n">${p.n}</td><td class="n ${p.he > 0.3 ? "D" : p.he < -0.3 ? "R" : ""}">${Math.abs(p.he) < 0.3 ? "About even" : (p.he > 0 ? "D+" : "R+") + Math.abs(p.he).toFixed(1)}</td></tr>`).join("")}
        </tbody></table></div></section>`;
  }
  const fmtGB = m => m == null ? "–" : (m >= 0 ? "D+" : "R+") + Math.abs(m).toFixed(1);

  function renderPres() {
    const list = P.president || [];
    $("pane-pres").innerHTML = `<div style="margin-top:22px" class="stack">
      <p>The next presidential election is November 7, 2028. There's no presidential race on the 2026 ballot, so this tab tracks early 2028 polling and the president's approval (see National polls).</p>
      ${list.length ? `<div class="grid2">${list.map(g => `<div class="panel"><h3>${esc(g.subject)}</h3><p class="tiny muted" style="margin:2px 0 10px">${g.n} polls, latest ${day(g.last)}. Simple average of the last four months.</p>
        ${g.candidates.map(c => `<div class="row small" style="justify-content:space-between;margin-bottom:4px"><span>${esc(c.name)}</span><b>${c.avg}%</b></div><div style="height:6px;background:var(--soft);border-radius:3px;margin-bottom:8px"><div style="width:${Math.min(100, c.avg * 1.5)}%;height:100%;background:var(--ink2);border-radius:3px"></div></div>`).join("")}</div>`).join("")}</div>`
        : `<p class="muted small">No 2028 polls in the database yet.</p>`}</div>`;
  }

  CHI.onProfile(() => { if (!$("pane-races").hidden) renderViz(); });
  paint();
})();
