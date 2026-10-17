(() => {
  const { esc, day, STATES, PARTY } = CHI;
  const V = window.CHI_VOTES;
  const $ = id => document.getElementById(id);
  if (!V || !V.votes.length) {
    $("summary").textContent = "Vote records load after the first daily data update.";
    $("rows").innerHTML = `<tr><td class="muted">Votes will appear here once the data job has run.</td></tr>`;
    return;
  }
  const CH = { H: V.chambers.House, S: V.chambers.Senate };
  const NAME = { H: "House", S: "Senate" };
  const WORD = { Y: "Yea", N: "Nay", P: "Present", "-": "Not voting" };
  const cleanName = n => { const [last, rest] = n.split(","); return rest ? `${rest.trim().replace(/\s*\(.*?\)/, "")} ${last.trim()[0]}${last.trim().slice(1).toLowerCase()}` : n; };
  const pretty = n => n.split(",").length > 1 ? cleanName(n).replace(/\b([A-Z])([A-Z]+)\b/g, (m, a, b) => a + b.toLowerCase()) : n;

  function split(v) {
    const mem = CH[v.c].members, s = { D: { Y: 0, N: 0, other: 0 }, R: { Y: 0, N: 0, other: 0 }, I: { Y: 0, N: 0, other: 0 } };
    for (let i = 0; i < v.v.length; i++) { const c = v.v[i]; if (c === " ") continue; const p = s[mem[i].party] || s.I; if (c === "Y") p.Y++; else if (c === "N") p.N++; else p.other++; }
    return s;
  }
  const passed = v => /pass|agreed|confirmed|adopted|sustained|overridden/i.test(v.result) && !/not|fail|rejected/i.test(v.result);
  const kindOf = v => /nomination|PN\d/i.test(v.q + v.bill + v.desc) ? "nom" : /amendment/i.test(v.q) ? "amend"
    : /^on (passage|agreeing to the (resolution|conference report)|the joint resolution|the concurrent resolution|motion to suspend the rules and pass|cloture on the motion to proceed)/i.test(v.q) || /passage/i.test(v.q) ? "passage" : "proc";
  const partyLine = s => { const d = s.D.Y + s.D.N, r = s.R.Y + s.R.N; if (!d || !r) return false; const dy = s.D.Y / d, ry = s.R.Y / r; return (dy > 0.9 && ry < 0.1) || (dy < 0.1 && ry > 0.9); };
  const bipartisan = s => { const d = s.D.Y + s.D.N, r = s.R.Y + s.R.N; return d && r && s.D.Y / d > 0.5 && s.R.Y / r > 0.5; };

  // member picker (current members first)
  const opts = [];
  for (const c of ["S", "H"]) CH[c] && CH[c].members.forEach((m, i) => opts.push({ c, i, m }));
  opts.sort((a, b) => a.m.state.localeCompare(b.m.state) || (a.c > b.c ? -1 : 1) || a.m.name.localeCompare(b.m.name));
  $("member").insertAdjacentHTML("beforeend", opts.map(o => `<option value="${o.c}:${o.i}">${esc(o.m.state)}: ${esc(pretty(o.m.name))} (${o.m.party}, ${NAME[o.c]})</option>`).join(""));
  const params = new URLSearchParams(location.search);
  if (params.get("member")) { const o = opts.find(o => o.m.id === params.get("member")); if (o) { $("member").value = `${o.c}:${o.i}`; $("chamber").value = o.c; } }

  const total = { H: V.votes.filter(v => v.c === "H").length, S: V.votes.filter(v => v.c === "S").length };
  $("summary").textContent = `${ordinal(V.congress)} Congress: ${total.H.toLocaleString()} House and ${total.S.toLocaleString()} Senate roll calls. Latest ${day(V.votes[0].date)}.`;
  function ordinal(n) { return n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"); }

  const st = { limit: 80 };
  ["q", "chamber", "kind", "result", "party", "member"].forEach(id => $(id).addEventListener("input", () => { st.limit = 80; render(); }));
  $("more").addEventListener("click", () => { st.limit += 200; render(); });

  const miniBar = s => {
    const seg = (n, col) => n ? `<span style="flex:${n};background:${col}"></span>` : "";
    return `<span style="display:inline-flex;gap:1px;width:120px;height:10px;vertical-align:middle;border-radius:2px;overflow:hidden" aria-hidden="true">${seg(s.D.Y, "var(--d)")}${seg(s.D.N, "#bcd0ef")}${seg(s.I.Y + s.I.N, "var(--i)")}${seg(s.R.N, "#f1c4c0")}${seg(s.R.Y, "var(--r)")}</span>`;
  };
  function render() {
    const q = $("q").value.trim().toLowerCase(), c = $("chamber").value, k = $("kind").value, res = $("result").value, pl = $("party").value;
    const pick = $("member").value ? $("member").value.split(":") : null;
    const list = V.votes.filter(v => (!c || v.c === c) && (!pick || v.c === pick[0]) && (!k || kindOf(v) === k) && (!res || (res === "pass") === passed(v))
      && (!q || [v.bill, v.title, v.q, v.desc, v.sponsor?.name].some(x => (x || "").toLowerCase().includes(q))));
    const withSplit = list.map(v => ({ v, s: split(v) })).filter(x => !pl || (pl === "bi" ? bipartisan(x.s) : partyLine(x.s)));
    $("count").textContent = `${withSplit.length.toLocaleString()} votes`;
    const pm = pick ? CH[pick[0]].members[+pick[1]] : null;
    $("thead").innerHTML = `<tr><th>Date</th><th>Vote</th><th>Question</th><th>Result</th><th class="n">Yea–Nay</th><th>Party split</th><th>Sponsor</th>${pm ? `<th>${esc(pretty(pm.name).split(" ").slice(-1)[0])}</th>` : ""}</tr>`;
    $("rows").innerHTML = withSplit.slice(0, st.limit).map(({ v, s }) => {
      const mv = pm ? v.v[+pick[1]] : null;
      return `<tr class="click" data-k="${v.c}${v.roll}-${v.date}" tabindex="0">
        <td class="small">${esc(day(v.date))}<br><span class="tiny muted">${NAME[v.c]} #${v.roll}</span></td>
        <td style="white-space:normal;min-width:260px"><b>${esc(v.bill || "Vote")}</b> ${v.title ? `<span class="small">${esc(v.title.length > 110 ? v.title.slice(0, 107) + "…" : v.title)}</span>` : `<span class="small muted">${esc(v.desc.slice(0, 110))}</span>`}</td>
        <td class="small" style="white-space:normal;min-width:160px">${esc(v.q)}</td>
        <td class="small"><b style="color:var(--${passed(v) ? "ok" : "bad"})">${passed(v) ? "Passed" : "Failed"}</b></td>
        <td class="n">${v.yea}–${v.nay}</td>
        <td>${miniBar(s)}<br><span class="tiny muted">D ${s.D.Y}–${s.D.N} · R ${s.R.Y}–${s.R.N}</span></td>
        <td class="small">${v.sponsor ? `<span class="${v.sponsor.party}">${esc(v.sponsor.name.replace(/^(Rep\.|Sen\.)\s*/, ""))}</span>` : '<span class="blank">–</span>'}</td>
        ${pm ? `<td><b style="color:var(--${mv === "Y" ? "ok" : mv === "N" ? "bad" : "muted"})">${WORD[mv] || "–"}</b></td>` : ""}</tr>`;
    }).join("");
    $("more").hidden = withSplit.length <= st.limit;
  }
  $("rows").addEventListener("click", e => { const tr = e.target.closest("tr[data-k]"); if (tr) open(tr.dataset.k); });
  $("rows").addEventListener("keydown", e => { if (e.key === "Enter") { const tr = e.target.closest("tr[data-k]"); if (tr) open(tr.dataset.k); } });

  function open(key) {
    const v = V.votes.find(x => `${x.c}${x.roll}-${x.date}` === key); if (!v) return;
    const mem = CH[v.c].members, s = split(v);
    const mine = CHI.profile.state;
    const groups = { Y: [], N: [], P: [], "-": [] };
    for (let i = 0; i < v.v.length; i++) if (v.v[i] !== " ") groups[v.v[i]].push(mem[i]);
    const list = arr => arr.sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name)).map(m =>
      `<li style="${m.state === mine ? "font-weight:700" : ""}"><span class="${m.party}">${esc(pretty(m.name))}</span> <span class="tiny muted">${m.party}-${m.state}${m.district && v.c === "H" && m.district !== "0" ? "-" + m.district : ""}</span></li>`).join("");
    const yours = mine ? mem.map((m, i) => ({ m, c: v.v[i] })).filter(x => x.m.state === mine && x.c !== " ") : [];
    $("drawer").innerHTML = `<button class="btn ghost close" id="close">Close</button>
      <span class="kicker">${NAME[v.c]} roll call #${v.roll} · ${esc(day(v.date))}</span>
      <h2 id="dname" style="margin:6px 0 6px">${esc(v.bill || "Recorded vote")}</h2>
      ${v.title ? `<p>${esc(v.title)}</p>` : ""}
      <p class="small"><b>${esc(v.q)}</b>: <b style="color:var(--${passed(v) ? "ok" : "bad"})">${esc(v.result)}</b>, ${v.yea}–${v.nay}</p>
      ${v.desc ? `<p class="small muted">${esc(v.desc)}</p>` : ""}
      ${v.sponsor ? `<p class="small">Sponsor: <span class="${v.sponsor.party}" style="font-weight:600">${esc(v.sponsor.name)}</span> (${esc(v.sponsor.party)}-${esc(v.sponsor.state)}${v.sponsor.district ? "-" + esc(v.sponsor.district) : ""})${v.cos != null ? `, ${v.cos} cosponsors` : ""}${v.policy ? `<br><span class="muted">Topic: ${esc(v.policy)}</span>` : ""}</p>` : ""}
      ${v.url ? `<p class="small"><a href="${esc(v.url)}" target="_blank" rel="noopener">Bill text and history on Congress.gov</a></p>` : ""}
      <div class="tablewrap"><table class="data" style="font-size:13px;margin-top:8px"><thead><tr><th>Party</th><th class="n">Yea</th><th class="n">Nay</th><th class="n">Other</th></tr></thead><tbody>
        ${["D", "R", "I"].filter(p => s[p].Y + s[p].N + s[p].other).map(p => `<tr><td class="${p}">${PARTY[p]}s</td><td class="n">${s[p].Y}</td><td class="n">${s[p].N}</td><td class="n">${s[p].other}</td></tr>`).join("")}</tbody></table></div>
      ${yours.length ? `<h3 style="margin:18px 0 6px">Your state: ${STATES[mine]}</h3><ul class="small" style="margin:0;padding-left:18px">${yours.map(x => `<li><span class="${x.m.party}">${esc(pretty(x.m.name))}</span>: <b>${WORD[x.c]}</b></li>`).join("")}</ul>` : ""}
      ${["Y", "N", "P", "-"].filter(k => groups[k].length).map(k => `<h3 style="margin:18px 0 6px">${WORD[k]} (${groups[k].length})</h3><ul class="small" style="margin:0;padding-left:18px;columns:2;column-gap:18px">${list(groups[k])}</ul>`).join("")}`;
    $("drawer").hidden = $("shade").hidden = false;
    $("close").focus(); $("close").onclick = shut;
    CHI.track("vote-open");
  }
  function shut() { $("drawer").hidden = $("shade").hidden = true; }
  $("shade").addEventListener("click", shut);
  document.addEventListener("keydown", e => { if (e.key === "Escape") shut(); });
  render();
})();
