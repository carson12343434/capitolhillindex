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
      // Start each ranking in a random order so the starting order can't nudge anyone's result.
      const order = answers[q.id] || q.options.map((_, k) => k).map(k => [Math.random(), k]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
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
    const { TYPICAL, BANDS } = CHI_QUIZ;
    const SHORT = { "Democrat": "Dem", "Moderate Democrat": "Mod D", "Independent": "Ind", "Moderate Republican": "Mod R", "Republican": "Rep" };
    const color = sc => sc < 33 ? "var(--d)" : sc < 45 ? "#6f97d6" : sc < 55 ? "#7d858e" : sc < 67 ? "#e0776d" : "var(--r)";
    const bandColors = ["var(--d)", "#9db8e6", "#d4d7db", "#f0b2ac", "var(--r)"];
    const bands = BANDS.map(([start, name], i) => ({ start, end: i < BANDS.length - 1 ? BANDS[i + 1][0] : 100, name, col: bandColors[i] }));
    const tick = (v, text) => `<div style="position:absolute;left:${v}%;bottom:22px;transform:translateX(-50%);text-align:center;white-space:nowrap;line-height:1.2" class="tiny muted">${text}<br>▼</div>`;
    const text = `I scored ${r.score}/100 (${r.label}) on the Capitol Hill Index political quiz. 0 is most liberal, 100 is most conservative.`;
    box.innerHTML = `<div class="stack" style="gap:22px">
      <div><span class="kicker">Your result</span>
        <div class="row" style="align-items:baseline;gap:6px 16px;margin-top:6px"><h2 style="font-size:40px;color:${color(r.score)}">${esc(r.label)}</h2>
          <span style="font-size:28px;font-weight:800">${r.score}<span class="muted" style="font-size:16px;font-weight:600"> / 100</span></span></div>
        <p class="small muted" style="margin:4px 0 0">0 is the most liberal set of answers possible. 100 is the most conservative.</p></div>
      <div class="panel" style="padding-top:58px;padding-bottom:20px">
        <div style="position:relative;margin:0 6px">
          ${tick(TYPICAL.D, `Avg. Dem.<br>${TYPICAL.D}`)}${tick(TYPICAL.I, `Avg. Ind.<br>${TYPICAL.I}`)}${tick(TYPICAL.R, `Avg. Rep.<br>${TYPICAL.R}`)}
          <div style="display:flex;height:16px;border-radius:8px;overflow:hidden;gap:2px">${bands.map(b => `<div style="flex:${b.end - b.start};background:${b.col}" title="${b.name}: ${b.start}-${b.end}"></div>`).join("")}</div>
          <div style="position:absolute;top:-9px;left:${r.score}%;transform:translateX(-50%);width:34px;height:34px;border-radius:50%;background:${color(r.score)};border:4px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.25);display:grid;place-items:center;color:#fff;font-size:11px;font-weight:800" aria-label="Your score ${r.score}">${r.score}</div>
        </div>
        <div style="display:flex;margin:18px 6px 0;gap:2px" class="tiny">${bands.map(b => `<div style="flex:${b.end - b.start};text-align:center;min-width:0;${b.name === r.label ? "font-weight:800" : "color:var(--muted)"}"><span class="qfull">${b.name}</span><span class="qshort">${SHORT[b.name]}</span></div>`).join("")}</div>
      <p class="tiny muted" style="margin:10px 6px 0">Avg. marks show where a typical Democrat, independent and Republican land, based on national survey answers.</p>
      </div>
      <div class="grid2" style="align-items:start">
        <div class="panel stack" style="gap:10px"><h3>By topic</h3>
          ${[["Economic issues", r.econ], ["Social issues", r.social]].map(([n, v]) => v == null ? "" : `<div><div class="row small" style="justify-content:space-between"><span>${n}</span><b>${v} / 100 · ${esc(CHI_QUIZ.label(v))}</b></div>
            <div style="position:relative;height:8px;background:linear-gradient(90deg,var(--d),#d4d7db,var(--r));border-radius:4px;margin-top:6px"><span style="position:absolute;left:${v}%;top:-4px;width:4px;height:16px;background:var(--ink);transform:translateX(-50%)"></span></div></div>`).join("")}</div>
        <div class="panel stack small" style="gap:10px"><h3>What moved your score</h3>
          ${r.pullL.length ? `<div><b class="D">Most liberal answers</b><ul style="margin:4px 0 0;padding-left:18px">${r.pullL.map(c => `<li>${esc(c.short || c.text)}</li>`).join("")}</ul></div>` : ""}
          ${r.pullR.length ? `<div><b class="R">Most conservative answers</b><ul style="margin:4px 0 0;padding-left:18px">${r.pullR.map(c => `<li>${esc(c.short || c.text)}</li>`).join("")}</ul></div>` : ""}
          ${!r.pullL.length && !r.pullR.length ? "<p>Your answers stayed near the middle on every question.</p>" : ""}</div>
      </div>
      <div class="row"><button class="btn" id="copy">Copy my result</button><button class="btn ghost" id="save">${CHI.profile.uid ? "Save to my account" : "Save my result"}</button><button class="btn ghost" id="again">Take it again</button></div>
      <p class="small muted" id="copytext" hidden>${esc(text)}</p></div>`;
    box.querySelector("#copy").onclick = () => navigator.clipboard.writeText(text).then(() => toast("Copied")).catch(() => { const p = box.querySelector("#copytext"); p.hidden = false; getSelection().selectAllChildren(p); });
    box.querySelector("#save").onclick = async () => {
      try { await accounts.save("quiz-result", { answers, score: r.score, label: r.label, at: new Date().toISOString() }); toast(CHI.profile.uid ? "Saved to your account" : "Saved on this device"); }
      catch (e) { toast("Couldn't save. Try again."); }
      if (!CHI.profile.uid && accounts.enabled()) CHI.promptSignIn("Save your quiz result");
    };
    box.querySelector("#again").onclick = () => { answers = {}; save(); i = 0; ask(); };
    store.set("quiz-progress", {});
    CHI.track("quiz-finish");
    box.scrollIntoView({ block: "start" });
  }
  intro();
})();
