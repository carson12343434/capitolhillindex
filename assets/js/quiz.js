(() => {
  const { esc, store, accounts, toast } = CHI;
  const { QUESTIONS, SCALE, score } = CHI_QUIZ;
  const box = document.getElementById("quiz");
  let answers = store.get("quiz-progress", {}) || {};
  let i = 0;

  function intro() {
    const last = accounts.load("quiz-result");
    box.innerHTML = `<div class="panel stack">
      <h2>Ready?</h2><p style="margin:0">About three minutes. You can go back and change any answer.</p>
      <div class="row"><button class="btn" id="start">${Object.keys(answers).length ? "Continue where you left off" : "Start the quiz"}</button>
      ${Object.keys(answers).length ? '<button class="btn ghost" id="reset">Start over</button>' : ""}
      ${last ? '<button class="btn ghost" id="lastres">See my last result</button>' : ""}</div></div>`;
    box.querySelector("#start").onclick = () => { i = Math.min(Object.keys(answers).length, QUESTIONS.length - 1); ask(); CHI.track("quiz-start"); };
    box.querySelector("#reset")?.addEventListener("click", () => { answers = {}; store.set("quiz-progress", {}); i = 0; ask(); });
    box.querySelector("#lastres")?.addEventListener("click", () => { answers = last.answers; result(); });
  }

  function ask() {
    const q = QUESTIONS[i];
    const progress = `<div class="row small muted" style="justify-content:space-between"><span>Question ${i + 1} of ${QUESTIONS.length}</span><span>${Math.round((i / QUESTIONS.length) * 100)}% done</span></div>
      <div style="height:4px;background:var(--soft);border-radius:2px;margin:6px 0 18px"><div style="width:${(i / QUESTIONS.length) * 100}%;height:100%;background:var(--brand);border-radius:2px"></div></div>`;
    if (q.kind === "scale") {
      const cur = answers[q.id];
      box.innerHTML = `${progress}<h2 style="font-size:24px;margin-bottom:18px">${esc(q.text)}</h2>
        <div class="stack" role="radiogroup" aria-label="Your answer">${SCALE.map((s, k) => `<button class="btn ghost" role="radio" aria-checked="${cur === k}" data-k="${k}" style="justify-content:flex-start;${cur === k ? "border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)" : ""}">${s}</button>`).join("")}</div>
        <div class="row" style="margin-top:18px">${i ? '<button class="btn ghost" id="back">Back</button>' : ""}</div>`;
      box.querySelectorAll("[data-k]").forEach(b => b.onclick = () => { answers[q.id] = +b.dataset.k; save(); next(); });
    } else {
      const order = answers[q.id] || q.options.map((_, k) => k);
      const draw = () => {
        box.innerHTML = `${progress}<h2 style="font-size:24px;margin-bottom:6px">${esc(q.text)}</h2><p class="small muted">Use the arrows to move items up or down.</p>
          <ol class="stack" style="list-style:none;padding:0;margin:14px 0 0;gap:8px">${order.map((o, pos) => `<li class="panel row" style="padding:10px 12px;justify-content:space-between;flex-wrap:nowrap">
            <span class="row" style="gap:12px;flex-wrap:nowrap"><b style="width:22px;text-align:right">${pos + 1}</b><span>${esc(q.options[o][0])}</span></span>
            <span class="row" style="gap:4px;flex-wrap:nowrap"><button class="btn ghost" data-up="${pos}" aria-label="Move ${esc(q.options[o][0])} up" ${pos === 0 ? "disabled" : ""} style="padding:4px 10px">▲</button>
            <button class="btn ghost" data-down="${pos}" aria-label="Move ${esc(q.options[o][0])} down" ${pos === order.length - 1 ? "disabled" : ""} style="padding:4px 10px">▼</button></span></li>`).join("")}</ol>
          <div class="row" style="margin-top:18px">${i ? '<button class="btn ghost" id="back">Back</button>' : ""}<button class="btn" id="next">This is my order</button></div>`;
        box.querySelectorAll("[data-up]").forEach(b => b.onclick = () => { const p = +b.dataset.up; [order[p - 1], order[p]] = [order[p], order[p - 1]]; draw(); box.querySelector(`[data-up="${p - 1}"],[data-down="${p - 1}"]`)?.focus(); });
        box.querySelectorAll("[data-down]").forEach(b => b.onclick = () => { const p = +b.dataset.down; [order[p + 1], order[p]] = [order[p], order[p + 1]]; draw(); box.querySelector(`[data-down="${p + 1}"],[data-up="${p + 1}"]`)?.focus(); });
        box.querySelector("#next").onclick = () => { answers[q.id] = order.slice(); save(); next(); };
        box.querySelector("#back")?.addEventListener("click", back);
      };
      draw();
      return;
    }
    box.querySelector("#back")?.addEventListener("click", back);
  }
  const save = () => store.set("quiz-progress", answers);
  const next = () => { if (i < QUESTIONS.length - 1) { i++; ask(); box.scrollIntoView({ block: "start" }); } else result(); };
  const back = () => { i = Math.max(0, i - 1); ask(); };

  function result() {
    const r = score(answers);
    const pct = x => Math.round(x * 100);
    const col = r.party === "Democrat" ? "var(--d)" : r.party === "Republican" ? "var(--r)" : "var(--i)";
    const x = 160 + r.econ * 14, y = 160 + r.social * 14;
    const text = `Capitol Hill Index political quiz: I match ${r.party === "Independent" ? `Independent (${r.strength})` : `${r.strength} ${r.party}`}, ${r.label}. Economic ${r.econ > 0 ? "+" : ""}${r.econ}, social ${r.social > 0 ? "+" : ""}${r.social}.`;
    box.innerHTML = `<div class="stack" style="gap:18px">
      <div><span class="kicker">Your result</span><h2 style="font-size:32px;margin-top:6px;color:${col}">${r.party === "Independent" ? `Independent, ${r.strength}` : `${r.strength[0].toUpperCase() + r.strength.slice(1)} ${r.party}`}</h2>
        <p class="lede" style="margin-top:4px">Your views fit the <b>${r.label}</b> profile.</p></div>
      <div class="panel stack" style="gap:8px"><h3>How closely you match each group</h3>
        ${[["Democrats", r.prob.D, "var(--d)"], ["Republicans", r.prob.R, "var(--r)"], ["Independents", r.prob.I, "var(--i)"]].map(([n, p, c]) =>
          `<div><div class="row small" style="justify-content:space-between"><span>${n}</span><b>${pct(p)}%</b></div><div style="height:8px;background:var(--soft);border-radius:4px"><div style="width:${Math.max(1, pct(p))}%;height:100%;background:${c};border-radius:4px"></div></div></div>`).join("")}</div>
      <div class="grid2" style="align-items:start">
        <div class="panel"><h3>Where you fall</h3>
          <svg viewBox="0 0 320 320" style="width:100%;max-width:340px;height:auto;display:block;margin-top:8px" role="img" aria-label="Economic score ${r.econ}, social score ${r.social}">
            <rect x="20" y="20" width="280" height="280" fill="#fff" stroke="#d6dade"/><line x1="160" y1="20" x2="160" y2="300" stroke="#d6dade"/><line x1="20" y1="160" x2="300" y2="160" stroke="#d6dade"/>
            <text x="160" y="14" text-anchor="middle" font-size="11" fill="#6a727b">Socially progressive</text><text x="160" y="314" text-anchor="middle" font-size="11" fill="#6a727b">Socially traditional</text>
            <text x="16" y="164" text-anchor="end" font-size="11" fill="#6a727b" transform="rotate(-90 16 164)" dy="-2">Economic left</text>
            <text x="304" y="160" text-anchor="middle" font-size="11" fill="#6a727b" transform="rotate(90 304 160)" dy="-2">Economic right</text>
            <circle cx="${x}" cy="${y}" r="9" fill="${col}" stroke="#fff" stroke-width="3"/></svg>
          <p class="small muted">Economic ${r.econ > 0 ? "+" : ""}${r.econ} and social ${r.social > 0 ? "+" : ""}${r.social}, on scales from −10 (left) to +10 (right).</p></div>
        <div class="panel stack small" style="gap:10px"><h3>What moved your result</h3>
          ${r.pushD.length ? `<div><b class="D">Toward Democrats</b><ul style="margin:4px 0 0;padding-left:18px">${r.pushD.map(c => `<li>${esc(c.text)}</li>`).join("")}</ul></div>` : ""}
          ${r.pushR.length ? `<div><b class="R">Toward Republicans</b><ul style="margin:4px 0 0;padding-left:18px">${r.pushR.map(c => `<li>${esc(c.text)}</li>`).join("")}</ul></div>` : ""}
          ${!r.pushD.length && !r.pushR.length ? "<p>No single answer pulled you strongly either way.</p>" : ""}</div>
      </div>
      <div class="row"><button class="btn" id="copy">Copy my result</button><button class="btn ghost" id="save">${accounts.enabled() && CHI.profile.uid ? "Save to my account" : "Save on this device"}</button><button class="btn ghost" id="again">Take it again</button></div>
      <p class="small muted" id="copytext" hidden>${esc(text)}</p></div>`;
    box.querySelector("#copy").onclick = () => navigator.clipboard.writeText(text).then(() => toast("Copied")).catch(() => { const p = box.querySelector("#copytext"); p.hidden = false; getSelection().selectAllChildren(p); });
    box.querySelector("#save").onclick = async () => { try { await accounts.save("quiz-result", { answers, party: r.party, label: r.label, at: new Date().toISOString() }); toast("Saved"); } catch (e) { toast("Couldn't save. Try again."); } };
    box.querySelector("#again").onclick = () => { answers = {}; save(); i = 0; ask(); };
    store.set("quiz-progress", {});
    CHI.track("quiz-finish");
    box.scrollIntoView({ block: "start" });
  }
  intro();
})();
