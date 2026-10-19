(() => {
  const { STATES } = CHI;
  const P = window.CHI_POLLS, PHOTOS = window.CHI_CANDPHOTOS || {}, S = window.CHI_SUMMARY || {};
  const $ = id => document.getElementById(id);
  const W = 1080, PAD = 72, R = W - PAD;
  let H = 1440, ctx = null;
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
  const photoSrc = (r, c) => { const p = photoOf(r, c); return p ? root + "data/" + p.src : null; };
  const ordinal = n => !n ? "" : n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
  const raceTitle = r => r.office === "HOUSE" ? `${STATES[r.state]} ${r.district && +r.district ? ordinal(+r.district) + " District" : "at-large district"}` : `${STATES[r.state]} ${r.office === "SEN" ? (r.special ? "Senate special" : "Senate") : "governor"}`;
  const placeName = r => r.office === "HOUSE" ? `${r.state}-${r.district}` : STATES[r.state];
  const dateText = new Date(P.generated).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
  const dayMonth = new Date(P.generated).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/New_York" });
  const days = P.daysOut;
  const isInc = (r, c) => c.name === r.incumbent || (c.mid && c.mid === r.incumbentId);
  const closestList = (off, n = 5) => P.races.filter(r => r.office === off && !r.uncontested).sort((a, b) => Math.abs(a.pLeft - 0.5) - Math.abs(b.pLeft - 0.5)).slice(0, n);

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
    const lines = []; let line = "";
    for (const word of s.split(/\s+/)) { const t = line ? line + " " + word : word; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = word; } else line = t; }
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
  const FOOT = () => H - 128;
  async function frame() {
    rect(0, 0, W, H, "#ffffff");
    const seal = await load(root + "assets/brand/logo-mark.png");
    if (seal) ctx.drawImage(seal, PAD, 66, 70, 70);
    text("Capitol Hill Index", PAD + 86, 122, { w: 800, size: 54, fam: DISP });
    text(dateText, R, 118, { w: 600, size: 30, color: C.mute, align: "right" });
    rect(PAD, 162, W - 2 * PAD, 6, C.ink);
    rect(PAD, FOOT(), W - 2 * PAD, 3, C.ink);
    text("capitolhillindex.com", PAD, H - 58, { w: 800, size: 46, fam: DISP });
    text(`${days} ${days === 1 ? "day" : "days"} to Election Day`, R, H - 60, { w: 700, size: 34, color: C.ink2, align: "right" });
  }
  function rateChip(r, x, y) {
    ctx.font = font(700, 32, TEXT);
    const tw = ctx.measureText(r.rating).width;
    rect(x, y - 36, tw + 30, 50, C[r.ratingSlug] || C.tossup);
    text(r.rating, x + 15, y, { w: 700, size: 32, color: RATE_TEXT[r.ratingSlug] || "#222" });
    return tw + 30;
  }
  function seatBar(x, y, w, h, d, total, need) {
    const inner = w - 6, lw = Math.round(inner * d / total);
    rect(x, y, lw, h, C.D); rect(x + lw + 6, y, inner - lw, h, C.R);
    const mx = x + Math.round(w * need / total);
    rect(mx - 4, y - Math.round(h * 0.35), 8, h + Math.round(h * 0.7), C.ink);
  }

  // ---------- slides ----------
  async function slideRace(r) {
    await frame();
    const X = H - 1350;
    text(r.office === "SEN" ? (r.special ? "Senate special election" : "Senate race") : r.office === "GOV" ? "Governor's race" : "House race", PAD, 240, { w: 700, size: 34, color: C.mute });
    text(r.office === "HOUSE" ? raceTitle(r) : STATES[r.state], PAD, 350, { w: 900, size: 124, fam: DISP, max: W - 2 * PAD });
    const cw = rateChip(r, PAD, 424);
    text(r.incumbent ? (r.incRunning ? `Incumbent: ${r.incumbent}` : `Open seat, held by ${r.incumbent}`) : "Open seat", PAD + cw + 22, 424, { w: 500, size: 32, color: C.ink2, max: W - 2 * PAD - cw - 22 });
    const [imL, imR] = await Promise.all([load(photoSrc(r, r.left)), load(photoSrc(r, r.right))]);
    const pw = 260 + Math.round(X / 3), ph = Math.round(pw * 1.223), top = 486 + Math.round(X / 6);
    drawPhoto(imL, PAD, top, pw, ph, r.left.name);
    drawPhoto(imR, R - pw, top, pw, ph, r.right.name);
    const sh = r.share || {};
    const side = (c, x, align, v) => {
      text(c.name, x, top + ph + 58, { w: 700, size: 42, align, max: 450 });
      text(partyName(c.party) + (isInc(r, c) ? ", incumbent" : ""), x, top + ph + 100, { w: 500, size: 30, color: C.mute, align, max: 450 });
      text(v != null ? v.toFixed(1) + "%" : "", x, top + ph + 244, { w: 900, size: 144, fam: DISP, color: pc(c.party), align, max: 430 });
      text("projected vote", x, top + ph + 288, { w: 600, size: 30, color: C.mute, align });
    };
    side(r.left, PAD, "left", sh.left); side(r.right, R, "right", sh.right);
    const by = FOOT() - 120;
    const inner = W - 2 * PAD - 6, lw = Math.max(4, Math.round(inner * r.pLeft));
    rect(PAD, by, lw, 26, pc(r.left.party)); rect(PAD + lw + 6, by, inner - lw, 26, pc(r.right.party));
    text(`${pct(r.pLeft)} chance to win`, PAD, by + 70, { w: 700, size: 34, color: pc(r.left.party) });
    text(`${pct(1 - r.pLeft)} chance to win`, R, by + 70, { w: 700, size: 34, color: pc(r.right.party), align: "right" });
  }

  async function slideControl(which) {
    await frame();
    const X = H - 1350;
    const c = P[which], total = which === "senate" ? 100 : 435, need = which === "senate" ? 51 : 218;
    const d = Math.round(c.dMean), rr = total - d;
    text(`${which === "senate" ? "Senate" : "House"} forecast`, PAD, 340, { w: 900, size: 136, fam: DISP });
    text(`${need} seats for a majority${which === "senate" ? ", or 50 with the vice president" : ""}`, PAD, 404, { w: 500, size: 34, color: C.ink2, max: W - 2 * PAD });
    const ny = 740 + Math.round(X / 2);
    text(String(d), PAD, ny, { w: 900, size: 330, fam: DISP, color: C.D });
    text(String(rr), R, ny, { w: 900, size: 330, fam: DISP, color: C.R, align: "right" });
    text("Democrats", PAD, ny + 72, { w: 700, size: 42, color: C.D });
    text("Republicans", R, ny + 72, { w: 700, size: 42, color: C.R, align: "right" });
    seatBar(PAD, ny + 124, W - 2 * PAD, 50, d, total, need);
    text("projected seats", W / 2, ny + 240, { w: 600, size: 30, color: C.mute, align: "center" });
    text(`Democrats ${pct(c.pD)} to win control`, PAD, FOOT() - 130, { w: 800, size: 48, fam: DISP, color: C.D });
    text(`Republicans ${pct(c.pR)}`, R, FOOT() - 130, { w: 800, size: 48, fam: DISP, color: C.R, align: "right" });
    const G = P.national.generic;
    if (G) text(`Generic ballot: ${G.margin >= 0 ? "D" : "R"}+${Math.abs(G.margin).toFixed(1)}, from ${G.n} national polls`, PAD, FOOT() - 56, { w: 500, size: 32, color: C.ink2 });
  }

  async function slideClosest(off, n = 5) {
    await frame();
    text(`Closest ${off === "SEN" ? "Senate" : off === "GOV" ? "governor" : "House"} races`, PAD, 320, { w: 900, size: 118, fam: DISP, max: W - 2 * PAD });
    text("Projected share of the vote", PAD, 384, { w: 500, size: 34, color: C.ink2 });
    const list = closestList(off, n);
    const imgs = await Promise.all(list.flatMap(r => [r.left, r.right].map(c => load(photoSrc(r, c)))));
    const y0 = 430, rowH = Math.floor((FOOT() - 30 - y0) / list.length);
    list.forEach((r, i) => {
      const y = y0 + i * rowH, ph = Math.min(128, rowH - 36), pw = Math.round(ph / 1.223), py = y + Math.round((rowH - ph) / 2);
      rect(PAD, y, W - 2 * PAD, 2, C.line);
      drawPhoto(imgs[i * 2], PAD, py, pw, ph, r.left.name);
      drawPhoto(imgs[i * 2 + 1], R - pw, py, pw, ph, r.right.name);
      const sh = r.share || {};
      text(r.left.name, PAD + pw + 20, py + 34, { w: 700, size: 30, max: 250 });
      text(sh.left != null ? sh.left.toFixed(1) + "%" : "", PAD + pw + 20, py + 110, { w: 900, size: 76, fam: DISP, color: pc(r.left.party) });
      text(r.right.name, R - pw - 20, py + 34, { w: 700, size: 30, align: "right", max: 250 });
      text(sh.right != null ? sh.right.toFixed(1) + "%" : "", R - pw - 20, py + 110, { w: 900, size: 76, fam: DISP, color: pc(r.right.party), align: "right" });
      text(placeName(r), W / 2, py + 62, { w: 800, size: 40, fam: DISP, align: "center", max: 230 });
      text(r.rating, W / 2, py + 102, { w: 700, size: 26, color: C.mute, align: "center" });
    });
    rect(PAD, y0 + list.length * rowH, W - 2 * PAD, 2, C.line);
  }

  async function slideTraders() {
    await frame();
    text("Most stock trades this term", PAD, 320, { w: 900, size: 114, fam: DISP, max: W - 2 * PAD });
    text("Disclosed trades from House and Senate financial filings", PAD, 384, { w: 500, size: 32, color: C.ink2, max: W - 2 * PAD });
    const list = (S.traders || []).slice(0, 5);
    const imgs = await Promise.all(list.map(t => load(root + "data/photos/m/" + t.id + ".webp")));
    const y0 = 430, rowH = Math.floor((FOOT() - 30 - y0) / Math.max(1, list.length));
    list.forEach((t, i) => {
      const y = y0 + i * rowH, ph = Math.min(132, rowH - 36), pw = Math.round(ph / 1.223), py = y + Math.round((rowH - ph) / 2);
      rect(PAD, y, W - 2 * PAD, 2, C.line);
      drawPhoto(imgs[i], PAD, py, pw, ph, t.name);
      text(t.name, PAD + pw + 24, py + ph / 2 + 4, { w: 700, size: 42, max: 520 });
      text(`${partyName(t.party)}, ${STATES[t.state]}, ${t.chamber === "Senate" ? "senator" : "representative"}`, PAD + pw + 24, py + ph / 2 + 50, { w: 500, size: 30, color: C.mute, max: 560 });
      text(t.term.toLocaleString(), R, py + ph / 2 + 44, { w: 900, size: 116, fam: DISP, align: "right" });
    });
    rect(PAD, y0 + list.length * rowH, W - 2 * PAD, 2, C.line);
  }

  async function slideCover() {
    await frame();
    const X = H - 1350;
    text(String(days), PAD, 520 + Math.round(X / 4), { w: 900, size: 380, fam: DISP });
    ctx.font = font(900, 380, DISP);
    const nw = ctx.measureText(String(days)).width;
    text(days === 1 ? "day until" : "days until", PAD + nw + 34, 372 + Math.round(X / 4), { w: 800, size: 92, fam: DISP });
    text("Election Day", PAD + nw + 34, 470 + Math.round(X / 4), { w: 800, size: 92, fam: DISP });
    text(`Where the race for Congress stands on ${dayMonth}`, PAD, 610 + Math.round(X / 4), { w: 600, size: 38, color: C.ink2, max: W - 2 * PAD });
    const block = (label, c, total, need, y) => {
      const d = Math.round(c.dMean);
      rect(PAD, y - 66, W - 2 * PAD, 2, C.line);
      text(label, PAD, y, { w: 800, size: 54, fam: DISP });
      text(`${d}`, PAD + 260, y + 6, { w: 900, size: 120, fam: DISP, color: C.D });
      text(`${total - d}`, R, y + 6, { w: 900, size: 120, fam: DISP, color: C.R, align: "right" });
      seatBar(PAD, y + 46, W - 2 * PAD, 30, d, total, need);
      text(`Democrats ${pct(c.pD)} to win`, PAD, y + 124, { w: 700, size: 34, color: C.D });
      text(`Republicans ${pct(c.pR)}`, R, y + 124, { w: 700, size: 34, color: C.R, align: "right" });
    };
    block("Senate", P.senate, 100, 51, 800 + Math.round(X / 2));
    block("House", P.house, 435, 218, 1040 + Math.round(X * 0.8));
  }

  async function slideMethod() {
    await frame();
    text("How the forecast works", PAD, 330, { w: 900, size: 118, fam: DISP, max: W - 2 * PAD });
    const items = [
      ["Polls, corrected for lean", "We average public polls after measuring and removing each pollster's tilt. Polls paid for by a party or campaign count half."],
      ["A baseline for every race", "Each race also starts from the state's partisan lean, the national generic ballot and incumbency. Races with few polls rely on it more."],
      ["20,000 simulated elections", "Races move together in the simulations, the way they do on election night, so the odds reflect real uncertainty."],
    ];
    let y = 470 + Math.round((H - 1350) / 4);
    for (const [lead, body] of items) {
      rect(PAD, y - 70, W - 2 * PAD, 2, C.line);
      text(lead, PAD, y, { w: 800, size: 58, fam: DISP });
      const n = wrap(body, PAD, y + 58, W - 2 * PAD, 48, { w: 400, size: 36, color: C.ink2 });
      y += 120 + n * 48 + 30;
    }
  }

  async function slideEnd() {
    rect(0, 0, W, H, "#ffffff");
    const seal = await load(root + "assets/brand/logo-mark.png");
    const top = Math.round(H * 0.16);
    if (seal) ctx.drawImage(seal, W / 2 - 150, top, 300, 300);
    text("Capitol Hill Index", W / 2, top + 420, { w: 900, size: 110, fam: DISP, align: "center" });
    const n = wrap("Every Senate, House and governor race, plus stock trades, campaign money and votes for all 533 members of Congress. Updated every morning.", W / 2, top + 510, W - 280, 52, { w: 400, size: 38, color: C.ink2, align: "center" });
    rect(PAD, top + 560 + n * 52, W - 2 * PAD, 6, C.ink);
    text("capitolhillindex.com", W / 2, top + 680 + n * 52, { w: 900, size: 96, fam: DISP, align: "center" });
    text("Link in bio", W / 2, top + 750 + n * 52, { w: 700, size: 40, color: C.ink2, align: "center" });
  }

  async function slideTradersCover() {
    await frame();
    const list = (S.traders || []).slice(0, 5);
    const n = wrap("Who in Congress trades the most stock?", PAD, 360, W - 2 * PAD, 150, { w: 900, size: 160, fam: DISP });
    const y = 360 + (n - 1) * 150 + 90;
    wrap("Members of Congress must disclose most stock trades over $1,000 within 45 days. These five filed the most this term.", PAD, y, W - 2 * PAD, 50, { w: 500, size: 38, color: C.ink2 });
    const imgs = await Promise.all(list.map(t => load(root + "data/photos/m/" + t.id + ".webp")));
    const gap = 16, pw = Math.floor((W - 2 * PAD - gap * 4) / 5), ph = Math.round(pw * 1.223), py = FOOT() - ph - 60;
    list.forEach((t, i) => drawPhoto(imgs[i], PAD + i * (pw + gap), py, pw, ph, t.name));
  }

  // ---------- templates: each returns a list of slides plus a caption ----------
  function credits(pairs) {
    const seen = new Set(), lines = [];
    for (const [r, c] of pairs) { const p = photoOf(r, c); if (p && p.credit && !seen.has(c.name)) { seen.add(c.name); lines.push(`${c.name}: ${p.credit.replace(/^Photo: /, "")}`); } }
    return lines.length ? `\n\nPhotos: ${lines.join("; ")}` : "";
  }
  const METHOD = "We correct every poll for its pollster's lean and count party-funded polls at half weight.";
  const LINK = "Full forecast for every race at capitolhillindex.com (link in bio).";
  const until = `${days} ${days === 1 ? "day" : "days"} until Election Day`;
  const TEMPLATES = {
    forecast: {
      label: "Forecast carousel",
      build() {
        const sen = closestList("SEN", 5), gov = closestList("GOV", 1);
        const races = [...sen, ...gov];
        return {
          slides: [["Cover", slideCover], ["Senate", () => slideControl("senate")], ["House", () => slideControl("house")], ["Closest Senate races", () => slideClosest("SEN")],
            ...races.map(r => [raceTitle(r), () => slideRace(r)]), ["How it works", slideMethod], ["End", slideEnd]],
          caption: `${until}. Here's where the race for Congress stands as of ${dayMonth}.\n\n` +
            `Senate: Democrats ${Math.round(P.senate.dMean)}, Republicans ${100 - Math.round(P.senate.dMean)} projected. Democrats win control in ${pct(P.senate.pD)} of our simulations, Republicans in ${pct(P.senate.pR)}.\n` +
            `House: Democrats ${Math.round(P.house.dMean)}, Republicans ${435 - Math.round(P.house.dMean)} projected. Democrats win control in ${pct(P.house.pD)}, Republicans in ${pct(P.house.pR)}.\n\n` +
            `Closest races: ${races.map(r => raceTitle(r)).join(", ")}. Swipe for each one.\n\n${METHOD} ${LINK}` +
            credits(races.flatMap(r => [[r, r.left], [r, r.right]])) + `\n\n#Election2026 #Midterms #Senate #Polls #Congress`,
          name: "forecast",
        };
      },
    },
    race: {
      label: "One race, head to head",
      build() {
        const r = P.races.find(x => x.id === $("race").value);
        if (!r) return { slides: [], caption: "" };
        const sh = r.share || {}, lead = r.pLeft >= 0.5 ? r.left : r.right, lp = Math.max(r.pLeft, 1 - r.pLeft);
        const odds = Math.abs(r.pLeft - 0.5) < 0.015 ? "Our forecast has it as a coin flip" : `Our forecast gives ${lead.name} a ${pct(lp)} chance to win`;
        return {
          slides: [[raceTitle(r), () => slideRace(r)]],
          caption: `${raceTitle(r)}: ${r.left.name} (${r.left.party}) ${sh.left?.toFixed(1)}%, ${r.right.name} (${r.right.party}) ${sh.right?.toFixed(1)}%. ${odds}, with ${until.toLowerCase()}.\n\n${METHOD} ${LINK}` +
            credits([[r, r.left], [r, r.right]]) + `\n\n#Election2026 #Midterms #${STATES[r.state].replace(/\s+/g, "")} #Polls`,
          name: r.id.toLowerCase(),
        };
      },
    },
    control: {
      label: "Senate or House control",
      build() {
        const which = $("chamber").value, c = P[which], total = which === "senate" ? 100 : 435, d = Math.round(c.dMean);
        return {
          slides: [[which === "senate" ? "Senate" : "House", () => slideControl(which)]],
          caption: `${which === "senate" ? "Senate" : "House"} forecast, ${dayMonth}: Democrats ${d}, Republicans ${total - d} projected seats. Democrats win control in ${pct(c.pD)} of our 20,000 simulations, Republicans in ${pct(c.pR)}.\n\n${METHOD} ${LINK}\n\n#Election2026 #Midterms #${which === "senate" ? "Senate" : "House"} #Polls #Congress`,
          name: which,
        };
      },
    },
    closest: {
      label: "Closest races",
      build() {
        const off = $("office").value, list = closestList(off);
        const word = off === "SEN" ? "Senate" : off === "GOV" ? "governor" : "House";
        return {
          slides: [[`Closest ${word} races`, () => slideClosest(off)]],
          caption: `The closest ${word} races as of ${dayMonth}, by projected vote:\n` +
            list.map(r => `${placeName(r)}: ${r.left.name} ${r.share?.left?.toFixed(1)}%, ${r.right.name} ${r.share?.right?.toFixed(1)}%`).join("\n") +
            `\n\n${METHOD} ${LINK}` + credits(list.flatMap(r => [[r, r.left], [r, r.right]])) + `\n\n#Election2026 #Midterms #${off === "GOV" ? "Governor" : word} #Polls`,
          name: "closest-" + off.toLowerCase(),
        };
      },
    },
    traders: {
      label: "Stock trades carousel",
      build() {
        const list = (S.traders || []).slice(0, 5);
        return {
          slides: [["Cover", slideTradersCover], ["Top five", slideTraders], ["End", slideEnd]],
          caption: `Which members of Congress trade the most stock? These five filed the most trades this term:\n` +
            list.map((t, i) => `${i + 1}. ${t.name} (${t.party}-${t.state}): ${t.term.toLocaleString()}`).join("\n") +
            `\n\nThe STOCK Act requires members to disclose most trades over $1,000 within 45 days. Counts come from the reports they file with the House and Senate. Every member's trades, dates and amounts are at capitolhillindex.com (link in bio).\n\n#Congress #StockTrading #STOCKAct #Politics`,
          name: "stock-trades",
        };
      },
    },
  };

  // ---------- render ----------
  const sel = { tpl: $("tpl"), office: $("office"), race: $("race"), chamber: $("chamber"), size: $("size") };
  sel.tpl.innerHTML = Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join("");
  function fillRaces() {
    const off = sel.office.value;
    const list = P.races.filter(r => r.office === off && !r.uncontested).sort((a, b) => Math.abs(a.pLeft - 0.5) - Math.abs(b.pLeft - 0.5));
    const keep = sel.race.value;
    sel.race.innerHTML = list.map(r => `<option value="${r.id}">${CHI.esc(placeName(r) + (r.special ? " (special)" : ""))}: ${CHI.esc(r.left.name)} vs ${CHI.esc(r.right.name)}</option>`).join("");
    if (list.some(r => r.id === keep)) sel.race.value = keep;
  }
  let current = { canvases: [], name: "" }, busy = Promise.resolve();
  async function render() {
    const t = sel.tpl.value;
    H = sel.size.value === "45" ? 1350 : 1440;
    $("f-race").hidden = t !== "race";
    $("f-office").hidden = !(t === "race" || t === "closest");
    $("f-chamber").hidden = t !== "control";
    const built = TEMPLATES[t].build();
    const strip = $("slides");
    strip.innerHTML = "";
    const canvases = [];
    for (const [i, [label, draw]] of built.slides.entries()) {
      const fig = document.createElement("figure");
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = H;
      cv.setAttribute("aria-label", `Slide ${i + 1}: ${label}`);
      ctx = cv.getContext("2d");
      await draw();
      const cap = document.createElement("figcaption");
      cap.innerHTML = `<span>${i + 1}. ${CHI.esc(label)}</span><button class="btn ghost" type="button">Download</button>`;
      cap.querySelector("button").onclick = () => saveOne(cv, `${i + 1}`);
      fig.append(cv, cap);
      strip.append(fig);
      canvases.push(cv);
    }
    $("caption").value = built.caption;
    $("count").textContent = built.slides.length > 1 ? `${built.slides.length} slides. Post them in this order as one carousel.` : "One image.";
    current = { canvases, name: built.name };
  }
  const queue = () => { busy = busy.then(render).catch(e => console.error(e)); return busy; };
  sel.office.addEventListener("change", () => { fillRaces(); queue(); });
  [sel.tpl, sel.race, sel.chamber, sel.size].forEach(s => s.addEventListener("change", queue));

  // ---------- export ----------
  const stamp = P.generated.slice(0, 10);
  const blobOf = cv => new Promise(res => cv.toBlob(res, "image/png"));
  const fileName = (suffix) => `capitolhillindex-${current.name}-${stamp}${suffix ? "-" + suffix : ""}.png`;
  function trigger(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function saveOne(cv, n) { trigger(await blobOf(cv), fileName(current.canvases.length > 1 ? n : "")); CHI.track("post-download"); }

  // Minimal ZIP writer (stored, no compression) so a whole carousel downloads as one file.
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  async function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const data = new Uint8Array(await f.blob.arrayBuffer()), name = enc.encode(f.name), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(h, name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(c, name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((s, p) => s + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: "application/zip" });
  }
  $("download").onclick = async () => {
    await busy;
    const cs = current.canvases;
    if (cs.length === 1) return saveOne(cs[0], "");
    const files = await Promise.all(cs.map(async (cv, i) => ({ name: fileName(String(i + 1).padStart(2, "0")), blob: await blobOf(cv) })));
    trigger(await zip(files), `capitolhillindex-${current.name}-${stamp}.zip`);
    CHI.track("post-download");
  };
  if (navigator.canShare) {
    const probe = new File([new Blob(["x"], { type: "image/png" })], "x.png", { type: "image/png" });
    if (navigator.canShare({ files: [probe] })) {
      $("share").hidden = false;
      $("share").onclick = async () => {
        await busy;
        const files = await Promise.all(current.canvases.map(async (cv, i) => new File([await blobOf(cv)], fileName(current.canvases.length > 1 ? String(i + 1).padStart(2, "0") : ""), { type: "image/png" })));
        try { await navigator.share({ files }); CHI.track("post-share"); } catch (e) { /* share sheet closed */ }
      };
    }
  }
  $("copy").onclick = async () => {
    try { await navigator.clipboard.writeText($("caption").value); $("copied").textContent = "Copied."; }
    catch (e) { $("caption").select(); $("copied").textContent = "Press Ctrl+C or Cmd+C to copy."; }
    setTimeout(() => { $("copied").textContent = ""; }, 2500);
  };

  fillRaces();
  window.CHI_POSTS = { ready: null };
  window.CHI_POSTS.ready = Promise.all([
    document.fonts.load(`900 100px ${DISP}`), document.fonts.load(`800 50px ${DISP}`),
    document.fonts.load(`400 30px ${TEXT}`), document.fonts.load(`500 30px ${TEXT}`), document.fonts.load(`600 30px ${TEXT}`), document.fonts.load(`700 30px ${TEXT}`),
  ]).catch(() => {}).then(queue);
  window.CHI_POSTS.render = () => queue();
})();
