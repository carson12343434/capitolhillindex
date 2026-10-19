(() => {
  const { STATES } = CHI;
  const P = window.CHI_POLLS, PHOTOS = window.CHI_CANDPHOTOS || {}, S = window.CHI_SUMMARY || {};
  const $ = id => document.getElementById(id);
  const cv = $("card"), ctx = cv.getContext("2d");
  const W = 1080, H = 1350, PAD = 72, R = W - PAD;
  const C = { ink: "#1d1f23", ink2: "#4a4f57", mute: "#6f757d", line: "#dcdfe3", soft: "#f3f4f6", D: "#1f5fbf", R: "#c62f2a", I: "#6b4ea0",
    "safe-d": "#1f5fbf", "likely-d": "#5d8fd8", "lean-d": "#a8c3ec", tossup: "#c9c9c9", "lean-r": "#f1b1aa", "likely-r": "#e16b60", "safe-r": "#c62f2a" };
  const RATE_TEXT = { "safe-d": "#fff", "likely-d": "#fff", "lean-d": "#10305f", tossup: "#222", "lean-r": "#5f1410", "likely-r": "#fff", "safe-r": "#fff" };
  const DISP = '"Big Shoulders Display", "Arial Narrow", sans-serif', TEXT = '"Public Sans", Arial, sans-serif';
  const root = CHI.root;
  if (!P) { $("caption").value = "The forecast isn't available yet."; return; }

  const pc = p => p === "D" ? C.D : p === "R" ? C.R : C.I;
  const partyName = p => p === "D" ? "Democrat" : p === "R" ? "Republican" : p === "I" ? "Independent" : p || "";
  const pct = x => x > 0.99 ? ">99%" : x < 0.01 ? "<1%" : Math.round(x * 100) + "%";
  const norm = n => (n || "").replace(/\(.*?\)/g, " ").toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/'/g, "").replace(/-/g, " ").trim().split(/\s+/).join(" ");
  const photoOf = (r, c) => c && c.name ? PHOTOS[`${r.state}|${norm(c.name)}`] || null : null;
  const raceTitle = r => r.office === "HOUSE" ? `${STATES[r.state]} ${r.district && +r.district ? ordinal(+r.district) + " District" : "at-large district"}` : `${STATES[r.state]} ${r.office === "SEN" ? (r.special ? "Senate special" : "Senate") : "governor"}`;
  const ordinal = n => !n ? "" : n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
  const dateText = new Date(P.generated).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  const daysText = `${P.daysOut} ${P.daysOut === 1 ? "day" : "days"} to Election Day`;
  const tagState = r => "#" + STATES[r.state].replace(/\s+/g, "") + (r.office === "SEN" ? "Senate" : r.office === "GOV" ? "Governor" : "");

  // ---------- drawing helpers ----------
  const font = (w, size, fam) => `${w} ${size}px ${fam}`;
  function text(s, x, y, { w = 400, size = 30, fam = TEXT, color = C.ink, align = "left", max = 0 } = {}) {
    let sz = size;
    ctx.font = font(w, sz, fam);
    while (max && ctx.measureText(s).width > max && sz > 10) { sz -= 2; ctx.font = font(w, sz, fam); }
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    ctx.fillText(s, x, y);
    return ctx.measureText(s).width;
  }
  function wrap(s, x, y, maxW, lineH, opts) {
    ctx.font = font(opts.w || 400, opts.size || 30, opts.fam || TEXT);
    const words = s.split(/\s+/); let line = "", lines = [];
    for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    lines.forEach((l, i) => text(l, x, y + i * lineH, opts));
    return lines.length;
  }
  const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  const cache = {};
  function load(src) {
    if (!src) return Promise.resolve(null);
    if (!cache[src]) cache[src] = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    return cache[src];
  }
  function drawPhoto(im, x, y, w, h, name) {
    if (im) {
      const r = w / h, ir = im.width / im.height;
      let sw = im.width, sh = im.height, sx = 0, sy = 0;
      if (ir > r) { sw = im.height * r; sx = (im.width - sw) / 2; } else { sh = im.width / r; sy = (im.height - sh) * 0.2; }
      ctx.drawImage(im, sx, sy, sw, sh, x, y, w, h);
    } else {
      rect(x, y, w, h, C.soft);
      const ini = (name || "").split(/\s+/).filter(t => /^[A-Za-z]/.test(t) && !/^(jr|sr|ii|iii|iv)\.?$/i.test(t)).map(t => t[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join("").toUpperCase();
      text(ini, x + w / 2, y + h / 2 + w * 0.13, { w: 800, size: Math.round(w * 0.36), fam: DISP, color: "#9aa1a9", align: "center" });
    }
  }
  async function frame() {
    rect(0, 0, W, H, "#ffffff");
    const seal = await load(root + "assets/brand/logo-mark.png");
    if (seal) ctx.drawImage(seal, PAD, 66, 70, 70);
    text("Capitol Hill Index", PAD + 86, 122, { w: 800, size: 54, fam: DISP });
    text(dateText, R, 118, { w: 600, size: 28, color: C.mute, align: "right" });
    rect(PAD, 162, W - 2 * PAD, 6, C.ink);
    rect(PAD, 1222, W - 2 * PAD, 3, C.ink);
    text("capitolhillindex.com", PAD, 1290, { w: 800, size: 44, fam: DISP });
    text(daysText, R, 1286, { w: 600, size: 28, color: C.ink2, align: "right" });
  }
  function rateChip(r, x, y) {
    ctx.font = font(700, 30, TEXT);
    const tw = ctx.measureText(r.rating).width;
    rect(x, y - 34, tw + 28, 46, C[r.ratingSlug] || C.tossup);
    text(r.rating, x + 14, y, { w: 700, size: 30, color: RATE_TEXT[r.ratingSlug] || "#222" });
    return tw + 28;
  }
  function winBar(pL, cL, cR, y, h) {
    const inner = W - 2 * PAD - 6, lw = Math.max(4, Math.round(inner * pL));
    rect(PAD, y, lw, h, cL); rect(PAD + lw + 6, y, inner - lw, h, cR);
  }

  // ---------- templates ----------
  async function race(r) {
    await frame();
    text(r.office === "SEN" ? "Senate race" : r.office === "GOV" ? "Governor's race" : "House race", PAD, 236, { w: 700, size: 32, color: C.mute });
    text(raceTitle(r).replace(/ (Senate|governor)$/, ""), PAD, 340, { w: 900, size: 120, fam: DISP, max: W - 2 * PAD });
    const cw = rateChip(r, PAD, 410);
    text(r.incumbent ? (r.incRunning ? `Incumbent: ${r.incumbent}` : `Open seat, held by ${r.incumbent}`) : "Open seat", PAD + cw + 22, 410, { w: 500, size: 30, color: C.ink2, max: W - 2 * PAD - cw - 22 });
    const [imL, imR] = await Promise.all([load(photoOf(r, r.left) && root + "data/" + photoOf(r, r.left).src), load(photoOf(r, r.right) && root + "data/" + photoOf(r, r.right).src)]);
    const pw = 250, ph = 306, top = 466;
    drawPhoto(imL, PAD, top, pw, ph, r.left.name);
    drawPhoto(imR, R - pw, top, pw, ph, r.right.name);
    const sh = r.share || {};
    const side = (c, x, align, v) => {
      text(c.name, x, top + ph + 56, { w: 700, size: 40, align, max: 440 });
      text(partyName(c.party) + ((c.name === r.incumbent || (c.mid && c.mid === r.incumbentId)) ? ", incumbent" : ""), x, top + ph + 96, { w: 500, size: 28, color: C.mute, align, max: 440 });
      text(v != null ? v.toFixed(1) + "%" : "", x, top + ph + 236, { w: 900, size: 140, fam: DISP, color: pc(c.party), align, max: 420 });
      text("projected vote", x, top + ph + 278, { w: 600, size: 26, color: C.mute, align });
    };
    side(r.left, PAD, "left", sh.left); side(r.right, R, "right", sh.right);
    winBar(r.pLeft, pc(r.left.party), pc(r.right.party), 1098, 24);
    text(`${pct(r.pLeft)} chance to win`, PAD, 1168, { w: 700, size: 32, color: pc(r.left.party) });
    text(`${pct(1 - r.pLeft)} chance to win`, R, 1168, { w: 700, size: 32, color: pc(r.right.party), align: "right" });
  }

  async function control(which) {
    await frame();
    const c = P[which], total = which === "senate" ? 100 : 435, need = which === "senate" ? 51 : 218;
    const d = Math.round(c.dMean), rr = total - d;
    text(`${which === "senate" ? "Senate" : "House"} forecast`, PAD, 330, { w: 900, size: 132, fam: DISP });
    text(`${need} seats for a majority${which === "senate" ? ", or 50 with the vice president" : ""}`, PAD, 396, { w: 500, size: 32, color: C.ink2 });
    text(String(d), PAD, 720, { w: 900, size: 330, fam: DISP, color: C.D });
    text(String(rr), R, 720, { w: 900, size: 330, fam: DISP, color: C.R, align: "right" });
    text("Democrats", PAD, 790, { w: 700, size: 40, color: C.D });
    text("Republicans", R, 790, { w: 700, size: 40, color: C.R, align: "right" });
    const inner = W - 2 * PAD - 6, lw = Math.round(inner * d / total);
    rect(PAD, 840, lw, 50, C.D); rect(PAD + lw + 6, 840, inner - lw, 50, C.R);
    const mx = PAD + Math.round((W - 2 * PAD) * need / total);
    rect(mx - 4, 824, 8, 82, C.ink);
    text("projected seats", W / 2, 960, { w: 600, size: 28, color: C.mute, align: "center" });
    text(`Democrats ${pct(c.pD)} to win control`, PAD, 1060, { w: 800, size: 46, fam: DISP, color: C.D });
    text(`Republicans ${pct(c.pR)}`, R, 1060, { w: 800, size: 46, fam: DISP, color: C.R, align: "right" });
    const G = P.national.generic;
    if (G) text(`Generic ballot: ${G.margin >= 0 ? "D" : "R"}+${Math.abs(G.margin).toFixed(1)}, from ${G.n} national polls`, PAD, 1140, { w: 500, size: 30, color: C.ink2 });
  }

  const closestList = off => P.races.filter(r => r.office === off && !r.uncontested).sort((a, b) => Math.abs(a.pLeft - 0.5) - Math.abs(b.pLeft - 0.5)).slice(0, 5);
  async function closest(off) {
    await frame();
    text(`Closest ${off === "SEN" ? "Senate" : off === "GOV" ? "governor" : "House"} races`, PAD, 318, { w: 900, size: 116, fam: DISP, max: W - 2 * PAD });
    text("Projected share of the vote", PAD, 378, { w: 500, size: 32, color: C.ink2 });
    const list = closestList(off);
    const imgs = await Promise.all(list.flatMap(r => [r.left, r.right].map(c => load(photoOf(r, c) && root + "data/" + photoOf(r, c).src))));
    const rowH = 160, y0 = 420;
    list.forEach((r, i) => {
      const y = y0 + i * rowH;
      rect(PAD, y, W - 2 * PAD, 2, C.line);
      const pw = 96, ph = 118, py = y + 21;
      drawPhoto(imgs[i * 2], PAD, py, pw, ph, r.left.name);
      drawPhoto(imgs[i * 2 + 1], R - pw, py, pw, ph, r.right.name);
      const sh = r.share || {};
      text(r.left.name, PAD + pw + 20, py + 34, { w: 700, size: 28, max: 250 });
      text(sh.left != null ? sh.left.toFixed(1) + "%" : "", PAD + pw + 20, py + 106, { w: 900, size: 72, fam: DISP, color: pc(r.left.party) });
      text(r.right.name, R - pw - 20, py + 34, { w: 700, size: 28, align: "right", max: 250 });
      text(sh.right != null ? sh.right.toFixed(1) + "%" : "", R - pw - 20, py + 106, { w: 900, size: 72, fam: DISP, color: pc(r.right.party), align: "right" });
      text(off === "HOUSE" ? `${r.state}-${r.district}` : STATES[r.state], W / 2, py + 58, { w: 800, size: 38, fam: DISP, align: "center", max: 230 });
      text(r.rating, W / 2, py + 98, { w: 700, size: 24, color: C.mute, align: "center" });
    });
    rect(PAD, y0 + list.length * rowH, W - 2 * PAD, 2, C.line);
  }

  async function traders() {
    await frame();
    text("Most stock trades this term", PAD, 318, { w: 900, size: 112, fam: DISP, max: W - 2 * PAD });
    text("Disclosed trades from House and Senate financial filings", PAD, 378, { w: 500, size: 30, color: C.ink2, max: W - 2 * PAD });
    const list = (S.traders || []).slice(0, 5);
    const imgs = await Promise.all(list.map(t => load(root + "data/photos/m/" + t.id + ".webp")));
    const rowH = 160, y0 = 420;
    list.forEach((t, i) => {
      const y = y0 + i * rowH;
      rect(PAD, y, W - 2 * PAD, 2, C.line);
      drawPhoto(imgs[i], PAD, y + 21, 96, 118, t.name);
      text(t.name, PAD + 120, y + 74, { w: 700, size: 40, max: 520 });
      text(`${t.party === "D" ? "Democrat" : t.party === "R" ? "Republican" : "Independent"}, ${STATES[t.state]}, ${t.chamber === "Senate" ? "senator" : "representative"}`, PAD + 120, y + 116, { w: 500, size: 28, color: C.mute, max: 560 });
      text(t.term.toLocaleString(), R, y + 112, { w: 900, size: 110, fam: DISP, align: "right" });
    });
    rect(PAD, y0 + list.length * rowH, W - 2 * PAD, 2, C.line);
  }

  // ---------- captions ----------
  function credits(pairs) {
    const lines = pairs.map(([r, c]) => { const p = photoOf(r, c); return p && p.credit ? `${c.name}: ${p.credit.replace(/^Photo: /, "")}` : null; }).filter(Boolean);
    return lines.length ? `\n\nPhotos: ${lines.join("; ")}` : "";
  }
  const FOOT = "\n\nProjections blend polling averages, corrected for each pollster's lean, with each state's partisan lean. Full forecast at capitolhillindex.com";
  function caption(kind, arg) {
    if (kind === "race") {
      const r = arg, sh = r.share || {};
      const lead = r.pLeft >= 0.5 ? r.left : r.right, lp = Math.max(r.pLeft, 1 - r.pLeft);
      const odds = Math.abs(r.pLeft - 0.5) < 0.015 ? "Our forecast has it as a coin flip" : `Our forecast gives ${lead.name} a ${pct(lp)} chance to win`;
      return `${raceTitle(r)}: ${r.left.name} (${r.left.party}) ${sh.left?.toFixed(1)}%, ${r.right.name} (${r.right.party}) ${sh.right?.toFixed(1)}%. ${odds}, with ${daysText.replace(" to", " until")}.` +
        FOOT + credits([[r, r.left], [r, r.right]]) + `\n\n#Election2026 #Midterms ${tagState(r)} #Polls`;
    }
    if (kind === "control") {
      const c = P[arg], total = arg === "senate" ? 100 : 435, d = Math.round(c.dMean);
      return `${arg === "senate" ? "Senate" : "House"} forecast, ${dateText}: Democrats ${d}, Republicans ${total - d} projected seats. Democrats win control in ${pct(c.pD)} of our 20,000 simulations, Republicans in ${pct(c.pR)}.` +
        FOOT + `\n\n#Election2026 #Midterms #${arg === "senate" ? "Senate" : "House"} #Polls`;
    }
    if (kind === "closest") {
      const list = closestList(arg);
      return `The closest ${arg === "SEN" ? "Senate" : arg === "GOV" ? "governor" : "House"} races, ${dateText}:\n` +
        list.map(r => `${arg === "HOUSE" ? r.state + "-" + r.district : STATES[r.state]}: ${r.left.name} ${r.share?.left?.toFixed(1)}%, ${r.right.name} ${r.share?.right?.toFixed(1)}%`).join("\n") +
        FOOT + credits(list.flatMap(r => [[r, r.left], [r, r.right]])) + `\n\n#Election2026 #Midterms #Polls`;
    }
    const list = (S.traders || []).slice(0, 5);
    return `Most stock trades by members of Congress this term:\n` + list.map((t, i) => `${i + 1}. ${t.name} (${t.party}-${t.state}): ${t.term.toLocaleString()}`).join("\n") +
      `\n\nCounts come from the periodic transaction reports members file with the House and Senate. Every trade, with dates and amounts, at capitolhillindex.com\n\n#Congress #StockTrading #STOCKAct`;
  }

  // ---------- controls ----------
  const sel = { tpl: $("tpl"), office: $("office"), race: $("race"), chamber: $("chamber") };
  function fillRaces() {
    const off = sel.office.value;
    const list = P.races.filter(r => r.office === off && !r.uncontested).sort((a, b) => Math.abs(a.pLeft - 0.5) - Math.abs(b.pLeft - 0.5));
    const keep = sel.race.value;
    sel.race.innerHTML = list.map(r => `<option value="${r.id}">${CHI.esc(off === "HOUSE" ? r.state + "-" + r.district : STATES[r.state] + (r.special ? " (special)" : ""))}: ${CHI.esc(r.left.name)} vs ${CHI.esc(r.right.name)}</option>`).join("");
    if (list.some(r => r.id === keep)) sel.race.value = keep;
  }
  let busy = Promise.resolve(), current = "";
  async function render() {
    const t = sel.tpl.value;
    $("f-race").hidden = t !== "race";
    $("f-office").hidden = !(t === "race" || t === "closest");
    $("f-chamber").hidden = t !== "control";
    let cap;
    if (t === "race") { const r = P.races.find(x => x.id === sel.race.value); if (!r) return; await race(r); cap = caption("race", r); current = r.id; }
    else if (t === "control") { await control(sel.chamber.value); cap = caption("control", sel.chamber.value); current = sel.chamber.value; }
    else if (t === "closest") { await closest(sel.office.value); cap = caption("closest", sel.office.value); current = "closest-" + sel.office.value.toLowerCase(); }
    else { await traders(); cap = caption("traders"); current = "traders"; }
    $("caption").value = cap;
  }
  const queue = () => { busy = busy.then(render).catch(e => console.error(e)); };
  sel.office.addEventListener("change", () => { fillRaces(); queue(); });
  [sel.tpl, sel.race, sel.chamber].forEach(s => s.addEventListener("change", queue));

  const fileName = () => `capitolhillindex-${sel.tpl.value}-${current}-${P.generated.slice(0, 10)}.png`.toLowerCase();
  const blob = () => new Promise(res => cv.toBlob(res, "image/png"));
  $("download").onclick = async () => {
    await busy;
    const b = await blob(), a = document.createElement("a");
    a.href = URL.createObjectURL(b); a.download = fileName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    CHI.track("post-download");
  };
  if (navigator.canShare) {
    const probe = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
    if (navigator.canShare({ files: [probe] })) {
      $("share").hidden = false;
      $("share").onclick = async () => {
        await busy;
        const f = new File([await blob()], fileName(), { type: "image/png" });
        try { await navigator.share({ files: [f], text: $("caption").value }); CHI.track("post-share"); } catch (e) { /* closed the share sheet */ }
      };
    }
  }
  $("copy").onclick = async () => {
    try { await navigator.clipboard.writeText($("caption").value); $("copied").textContent = "Copied."; }
    catch (e) { $("caption").select(); $("copied").textContent = "Press Ctrl+C or Cmd+C to copy."; }
    setTimeout(() => { $("copied").textContent = ""; }, 2500);
  };

  fillRaces();
  Promise.all([
    document.fonts.load(`900 100px ${DISP}`), document.fonts.load(`800 50px ${DISP}`),
    document.fonts.load(`400 30px ${TEXT}`), document.fonts.load(`500 30px ${TEXT}`), document.fonts.load(`600 30px ${TEXT}`), document.fonts.load(`700 30px ${TEXT}`),
  ]).catch(() => {}).then(queue);
})();
