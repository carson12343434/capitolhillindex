(() => {
  const { esc, money, signedMoney, month, day, store, PARTY, STATES } = CHI;
  const D = window.CHI_MEMBERS || { members: [], sources: {} };
  const PHOTOS = window.CHI_PHOTOS || {};
  const M = D.members;
  const S = D.sources || {};
  const $ = id => document.getElementById(id);
  const TODAY = new Date(), STOCK_ACT = new Date("2012-04-04");
  const clamp = v => Math.max(0, Math.min(100, v));
  const blank = '<span class="blank">–</span>';
  const show = (v, f = x => x) => v == null ? blank : esc(f(v));
  const terms = m => m.houseTerms + m.senateTerms;
  const corp = m => m.fec?.last?.corp ?? null;
  const vol = m => m.trades ? (m.trades.volLow + m.trades.volHigh) / 2 : null;
  const seat = m => m.chamber === "Senate" ? "Senator" : m.district ? `District ${m.district}` : "At-large";

  // ---------- score ----------
  function parts(m) {
    const p = {};
    const t = m.trades;
    if (t && !t.partial) {
      const since = new Date(Math.max(new Date(m.firstTookOffice), STOCK_ACT));
      const yrs = Math.max(0.5, (TODAY - since) / 3.156e10);
      p.restraint = { v: clamp(100 - 25 * Math.log2(1 + t.total / yrs)), why: `${t.total.toLocaleString()} trades in ${yrs.toFixed(1)} years` };
      p.timely = { v: t.total ? clamp(100 * (1 - t.late / t.total)) : 100, why: t.total ? `${t.late} of ${t.total} filed after 45 days` : "no trades to file" };
    }
    const last = m.fec?.last;
    if (last && last.receipts > 0) {
      const share = last.corp / last.receipts;
      p.pac = { v: clamp(100 - 500 * share), why: `${(share * 100).toFixed(1)}% of ${money(last.receipts)} raised in ${last.years}` };
    }
    return p;
  }
  const W = () => ({ restraint: +$("w1").value, timely: +$("w2").value, pac: +$("w3").value });
  function score(p) { const w = W(); let s = 0, t = 0; for (const k in p) { s += p[k].v * w[k]; t += w[k]; } return t ? Math.round(s / t) : null; }
  const tone = s => s >= 80 ? "ok" : s >= 60 ? "warn" : "bad";
  const scoreHtml = s => s == null ? blank : `<b style="color:var(--${tone(s)})">${s}</b>`;

  // ---------- summary ----------
  const withAge = M.filter(m => m.age);
  const avg = withAge.reduce((a, m) => a + m.age, 0) / withAge.length;
  const traders = M.filter(m => m.trades && m.trades.total > 0).length;
  const parts2 = [`${M.length} members`, `average age ${avg.toFixed(0)}`, `${traders} have disclosed stock trades`];
  if (S.trades?.throughHouse) parts2.push(`House filings through ${day(S.trades.throughHouse)}`);
  if (!S.trades?.covered?.Senate) parts2.push("Senate trade filings not yet available");
  $("summary").textContent = parts2.join(" · ") + ".";

  // ---------- table ----------
  const COLS = [
    { k: "name", label: "Member", sort: m => m.last },
    { k: "party", label: "Party", sort: m => m.party },
    { k: "state", label: "State", sort: m => m.state + (m.chamber === "Senate" ? "0" : "1") + String(m.district || 0).padStart(2, "0") },
    { k: "age", label: "Age", n: 1, sort: m => m.age },
    { k: "terms", label: "Terms", n: 1, sort: terms },
    { k: "since", label: "In seat since", n: 1, sort: m => m.seatSince },
    { k: "trades", label: "Trades in office", n: 1, sort: m => m.trades?.total },
    { k: "term", label: "This term", n: 1, sort: m => m.trades?.term },
    { k: "vol", label: "Trading volume", n: 1, sort: vol },
    { k: "gain", label: "Est. gain", n: 1, sort: m => m.gains?.estGain },
    { k: "pac", label: "Corporate PAC $", n: 1, sort: corp },
    { k: "edu", label: "Education", sort: m => m.edu?.top },
    { k: "score", label: "Score", n: 1, sort: m => score(parts(m)) },
  ];
  const st = { k: "state", dir: 1, limit: 120 };
  $("heads").innerHTML = COLS.map(c => `<th class="${c.n ? "n" : ""}" data-k="${c.k}" scope="col"><button>${c.label}</button></th>`).join("");
  $("heads").addEventListener("click", e => {
    const th = e.target.closest("th"); if (!th) return;
    const c = COLS.find(x => x.k === th.dataset.k);
    st.dir = st.k === c.k ? -st.dir : (c.n ? -1 : 1); st.k = c.k;
    const o = [...$("sort").options].find(o => o.value === `${st.k}:${st.dir}`); $("sort").value = o ? o.value : "";
    render();
  });
  $("sort").addEventListener("input", () => { const [k, d] = $("sort").value.split(":"); st.k = k; st.dir = +d; render(); });
  $("state").innerHTML = CHI.stateOptions("", "All states");
  const inRange = (v, r) => { if (!r) return true; if (v == null) return false; const [lo, hi] = r.split("-").map(Number); return v >= lo && v <= hi; };
  ["q", "chamber", "party", "state", "age", "band"].forEach(id => $(id).addEventListener("input", () => { st.limit = 120; render(); }));
  $("more").addEventListener("click", () => { st.limit = Infinity; render(); });

  const saved = store.get("weights");
  if (saved) ["w1", "w2", "w3"].forEach((k, i) => $(k).value = saved[i]);
  ["w1", "w2", "w3"].forEach(id => $(id).addEventListener("input", () => { store.set("weights", ["w1", "w2", "w3"].map(k => +$(k).value)); weights(); render(); }));
  function weights() { const w = W(), t = w.restraint + w.timely + w.pac; [["w1", w.restraint], ["w2", w.timely], ["w3", w.pac]].forEach(([k, v]) => $(k + "v").textContent = (t ? Math.round(100 * v / t) : 0) + "%"); }

  const pic = (m, w = 30, h = 37) => PHOTOS[m.id] ? `<img src="${PHOTOS[m.id]}" alt="" width="${w}" height="${h}" loading="lazy" style="object-fit:cover;flex:none;background:var(--line)">`
    : `<span style="width:${w}px;height:${h}px;flex:none;background:var(--line);display:grid;place-items:center;font-size:11px;color:var(--muted)">${esc(m.first[0] + m.last[0])}</span>`;
  const tradesCell = m => m.trades == null ? `<span class="blank" title="Senate filings not yet available">n/a</span>` : m.trades.partial ? `<span title="House-era trades only">${m.trades.total}*</span>` : m.trades.total.toLocaleString();

  function render() {
    const q = $("q").value.trim().toLowerCase(), ch = $("chamber").value, pa = $("party").value, sa = $("state").value;
    const col = COLS.find(c => c.k === st.k) || COLS[2];
    const list = M.filter(m => (!ch || m.chamber === ch) && (!pa || m.party === pa) && (!sa || m.state === sa)
      && (!q || m.name.toLowerCase().includes(q) || m.state.toLowerCase() === q || (STATES[m.state] || "").toLowerCase().startsWith(q))
      && inRange(m.age, $("age").value) && inRange(score(parts(m)), $("band").value))
      .map(m => ({ m, key: col.sort(m) }))
      .sort((a, b) => a.key == null && b.key == null ? 0 : a.key == null ? 1 : b.key == null ? -1 : (a.key > b.key ? 1 : a.key < b.key ? -1 : 0) * st.dir)
      .map(x => x.m);
    document.querySelectorAll("#heads th").forEach(th => th.removeAttribute("aria-sort"));
    document.querySelector(`#heads th[data-k="${col.k}"]`)?.setAttribute("aria-sort", st.dir > 0 ? "ascending" : "descending");
    $("count").textContent = `${list.length} shown`;
    $("rows").innerHTML = list.slice(0, st.limit).map(m => {
      const s = score(parts(m));
      return `<tr class="click" data-id="${m.id}" tabindex="0">
        <td><span class="row" style="flex-wrap:nowrap;gap:10px">${pic(m)}<span><b>${esc(m.name)}</b><br><span class="tiny muted">${seat(m)}</span></span></span></td>
        <td class="${m.party}">${PARTY[m.party]}</td><td>${m.state}</td>
        <td class="n">${show(m.age)}</td><td class="n">${terms(m)}</td><td class="n">${m.seatSince.slice(0, 4)}</td>
        <td class="n">${tradesCell(m)}</td><td class="n">${m.trades == null ? blank : m.trades.term.toLocaleString()}</td>
        <td class="n">${m.trades && m.trades.total ? money(vol(m)) : m.trades ? "$0" : blank}</td>
        <td class="n">${m.gains && m.gains.priced ? signedMoney(m.gains.estGain) : blank}</td>
        <td class="n">${show(corp(m), money)}</td>
        <td style="white-space:normal;min-width:180px" class="small">${show(m.edu?.top)}</td>
        <td class="n">${scoreHtml(s)}</td></tr>`;
    }).join("");
    $("more").hidden = list.length <= st.limit;
    $("more").textContent = `Show all ${list.length}`;
  }

  // ---------- drawer ----------
  const openRow = e => { const tr = e.target.closest("tr[data-id]"); if (tr) open(tr.dataset.id); };
  $("rows").addEventListener("click", openRow);
  $("rows").addEventListener("keydown", e => { if (e.key === "Enter") openRow(e); });
  function open(id) {
    const m = M.find(x => x.id === id); if (!m) return;
    const p = parts(m), s = score(p), t = m.trades, f = m.fec;
    const fact = (a, b) => `<dt>${a}</dt><dd>${b}</dd>`;
    const part = (k, n) => fact(n, p[k] ? `${Math.round(p[k].v)} <span class="tiny muted">${esc(p[k].why)}</span>` : blank);
    const pacRows = span => span ? [fact(`Raised ${span.years}`, money(span.receipts)), fact("From all PACs", money(span.pac)),
      fact("From corporate PACs", money(span.corp)), fact("From trade groups", money(span.trade)), fact("From labor unions", money(span.labor))].join("") : "";
    const recent = t && t.recent && t.recent.length ? `<div class="tablewrap"><table class="data" style="font-size:13px"><thead><tr><th>Date</th><th>Asset</th><th>Type</th><th class="n">Amount</th></tr></thead><tbody>
      ${t.recent.map(r => `<tr><td>${esc(r[0])}</td><td style="white-space:normal">${r[1] ? `<b>${esc(r[1])}</b> ` : ""}<span class="small">${esc(r[2].replace(/\s*\[[A-Z]{2}\]\s*$/, "").replace(/\s*\([A-Z.]+\)\s*$/, "").slice(0, 48))}</span><br><span class="tiny muted">${esc(r[6])}</span></td><td>${esc(r[3].replace("_", " "))}</td><td class="n">${money(r[4])}–${money(r[5])}</td></tr>`).join("")}</tbody></table></div>` : "";
    $("drawer").innerHTML = `<button class="btn ghost close" id="close">Close</button>
      <div class="row" style="gap:14px;align-items:flex-end;margin:6px 0 18px">${pic(m, 90, 110)}
        <div><h2 id="dname">${esc(m.name)}</h2><div class="${m.party}" style="font-weight:600">${PARTY[m.party]}</div><div class="small muted">${STATES[m.state]} · ${seat(m)}</div>${m.photoCredit ? `<div class="tiny muted" style="margin-top:4px">${esc(m.photoCredit)}</div>` : ""}</div></div>
      <dl class="facts">
        ${fact("Age", show(m.age))}
        ${fact("In this seat since", month(m.seatSince))}
        ${fact("First took federal office", month(m.firstTookOffice))}
        ${fact("Terms served", [m.houseTerms && m.houseTerms + " House", m.senateTerms && m.senateTerms + " Senate"].filter(Boolean).join(", "))}
        ${fact("Current term", `${month(m.termStart)} to ${month(m.termEnd)}`)}
      </dl>
      <h3 style="margin:22px 0 8px">Education</h3>
      ${m.edu ? `<ul class="small" style="margin:0;padding-left:18px">${m.edu.list.map(e => `<li>${e.degree ? `<b>${esc(e.degree)}</b>, ` : ""}${esc(e.school)}${e.year ? ` (${e.year})` : ""}</li>`).join("")}</ul>${m.edu.source ? `<p class="tiny muted" style="margin-top:6px">Source: ${esc(m.edu.source)}</p>` : ""}` : `<p class="small muted">No college or degree is listed in this member's official biography.</p>`}
      <h3 style="margin:22px 0 8px">Stock trading</h3>
      ${t == null ? `<p class="small muted">Senate trade filings aren't available yet.</p>` : `<dl class="facts">
        ${fact("Trades while in office", t.total.toLocaleString() + (t.partial ? " (House years only)" : ""))}
        ${fact("Trades this term", t.term.toLocaleString())}
        ${fact("Filed late (over 45 days)", t.late.toLocaleString())}
        ${fact("Trading volume", t.total ? `${money(t.volLow)}–${money(t.volHigh)}` : "$0")}
        ${fact("Est. gain on stock purchases", m.gains && m.gains.priced ? `${signedMoney(m.gains.estGain)} <span class="tiny muted">on ${money(m.gains.basis)} bought</span>` : blank)}
      </dl>${recent ? `<p class="small muted" style="margin:12px 0 4px">Most recent disclosed trades</p>${recent}` : ""}`}
      <h3 style="margin:22px 0 8px">Campaign money</h3>
      ${f ? `<dl class="facts">${pacRows(f.last)}</dl>${f.cycle && f.cycle.years !== f.last?.years ? `<p class="small muted" style="margin:12px 0 4px">This cycle so far</p><dl class="facts">${pacRows(f.cycle)}</dl>` : ""}`
        : `<p class="small muted">${esc(m.fecNote || (m.fecId ? "The FEC has not published totals for this campaign committee." : "No federal campaign committee is on file with the FEC for this member."))}</p>`}
      <h3 style="margin:22px 0 8px">Integrity score: ${scoreHtml(s)}</h3>
      <dl class="facts">${part("restraint", "Trading restraint")}${part("timely", "Filing on time")}${part("pac", "Corporate PAC independence")}</dl>
      <p class="small" style="margin-top:20px;display:flex;gap:14px;flex-wrap:wrap">
        ${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">Official site</a>` : ""}
        ${m.fecId ? `<a href="https://www.fec.gov/data/candidate/${esc(m.fecId)}/" target="_blank" rel="noopener">FEC filings</a>` : ""}
        <a href="${m.chamber === "House" ? "https://disclosures-clerk.house.gov/FinancialDisclosure" : "https://efdsearch.senate.gov/search/"}" target="_blank" rel="noopener">Financial disclosures</a>
        <a href="../votes/?member=${m.id}">Voting record</a>
      </p>`;
    $("drawer").hidden = $("shade").hidden = false;
    $("close").focus(); $("close").onclick = shut;
    CHI.track("member-open");
  }
  function shut() { $("drawer").hidden = $("shade").hidden = true; }
  $("shade").addEventListener("click", shut);
  document.addEventListener("keydown", e => { if (e.key === "Escape") shut(); });

  // Home state from the visitor's profile becomes the default filter (once per visit).
  let applied = false;
  CHI.onProfile(p => { if (!applied && p.state && !location.hash) { $("state").value = p.state; applied = true; render(); } });
  const hash = location.hash.slice(1).toUpperCase();
  if (STATES[hash]) $("state").value = hash;
  weights(); render();
})();
