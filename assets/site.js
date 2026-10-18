// Shared runtime: helpers, home-state profile, accounts (Firebase when configured), visitor stats.
(() => {
  const CFG = window.CHI_CONFIG || {};
  const root = document.querySelector('meta[name="chi-root"]')?.content || "./";

  const STATES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
    DE: "Delaware", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
    MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
    NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
    OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
    TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  };
  const PARTY = { D: "Democrat", R: "Republican", I: "Independent" };

  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = n => n == null ? null : Math.abs(n) >= 1e9 ? "$" + (n / 1e9).toFixed(1) + "B" : Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M"
    : Math.abs(n) >= 1e3 ? "$" + Math.round(n / 1e3) + "K" : "$" + Math.round(n);
  const signedMoney = n => n == null ? null : (n < 0 ? "−" : "+") + money(Math.abs(n));
  const month = d => d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "";
  const day = d => d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const store = {
    get(k, fallback = null) { try { const v = localStorage.getItem("chi:" + k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem("chi:" + k, JSON.stringify(v)); } catch (e) {} },
  };
  function toast(msg) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }

  // ---------------- profile (home state) ----------------
  let profile = store.get("profile", { state: "", email: "", uid: "" });
  const listeners = [];
  function emit() { listeners.forEach(f => { try { f(profile); } catch (e) { console.error(e); } }); paintAccount(); }
  function onProfile(f) { listeners.push(f); f(profile); }
  function setLocal(p) { profile = { ...profile, ...p }; store.set("profile", profile); emit(); }

  function paintAccount() {
    const a = document.getElementById("acct"); if (!a) return;
    a.textContent = profile.uid ? `My account${profile.state ? " · " + profile.state : ""}` : profile.state ? `Your state: ${profile.state}` : "Sign in";
  }

  // ---------------- Firebase accounts (optional) ----------------
  let fb = null; // { auth, db, mods }
  let authKnown = false;
  function mergeSaved(local, remote) {
    const out = { ...local, ...remote };
    for (const k of Object.keys(local)) {
      if (!(k in remote)) continue;
      const a = local[k], b = remote[k];
      if (k === "game-stats") out[k] = (a.played || 0) > (b.played || 0) ? a : b;
      else if (k.startsWith("blitz-")) out[k] = (a.score || 0) >= (b.score || 0) ? a : b;
      else if (k.startsWith("name-")) out[k] = (a.score || 0) > (b.score || 0) || ((a.score || 0) === (b.score || 0) && (a.secs || 1e9) < (b.secs || 1e9)) ? a : b;
      else if (a && b && a.at && b.at) out[k] = a.at > b.at ? a : b;
    }
    return out;
  }
  const FB_VER = "10.12.2";
  let fbLoading = null;
  function firebase() {
    if (fb || !CFG.firebase || !CFG.firebase.apiKey) return Promise.resolve(fb);
    if (!fbLoading) fbLoading = loadFirebase().catch(e => { fbLoading = null; throw e; });
    return fbLoading;
  }
  async function loadFirebase() {
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    const [app, auth, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    const a = app.initializeApp(CFG.firebase);
    fb = { auth: auth.getAuth(a), db: fs.getFirestore(a), A: auth, F: fs };
    auth.onAuthStateChanged(fb.auth, async user => {
      authKnown = true;
      if (!user) { if (profile.uid) setLocal({ uid: "", email: "" }); maybeWelcome(); return; }
      let data = {};
      try { const snap = await fs.getDoc(fs.doc(fb.db, "users", user.uid)); data = snap.exists() ? snap.data() : {}; } catch (e) { console.warn(e); }
      // Progress made on this device before signing in is kept and copied to the account.
      const local = store.get("cloud", {}), remote = data.saved || {};
      const merged = mergeSaved(local, remote);
      store.set("cloud", merged);
      const state = data.state || profile.state || "";
      setLocal({ uid: user.uid, email: user.email || "", state });
      const patch = {};
      if (JSON.stringify(merged) !== JSON.stringify(remote)) patch.saved = merged;
      if (!data.state && state) patch.state = state;
      if (Object.keys(patch).length) {
        try { await fs.setDoc(fs.doc(fb.db, "users", user.uid), patch, { merge: true }); } catch (e) { console.warn(e); }
      }
      closeWelcome();
    });
    return fb;
  }
  const accounts = {
    enabled: () => !!(CFG.firebase && CFG.firebase.apiKey),
    async signUp(email, password, state) {
      const f = await firebase(); if (!f) throw new Error("Accounts are not switched on yet.");
      const cred = await f.A.createUserWithEmailAndPassword(f.auth, email, password);
      await f.F.setDoc(f.F.doc(f.db, "users", cred.user.uid), { state, email, created: f.F.serverTimestamp() }, { merge: true });
      setLocal({ uid: cred.user.uid, email, state });
    },
    async signIn(email, password) {
      const f = await firebase(); if (!f) throw new Error("Accounts are not switched on yet.");
      await f.A.signInWithEmailAndPassword(f.auth, email, password);
    },
    async resetPassword(email) { const f = await firebase(); if (f) await f.A.sendPasswordResetEmail(f.auth, email); },
    async signOut() { const f = await firebase(); if (f) await f.A.signOut(f.auth); setLocal({ uid: "", email: "" }); },
    async setState(state) {
      setLocal({ state });
      const f = await firebase();
      if (f && profile.uid) await f.F.setDoc(f.F.doc(f.db, "users", profile.uid), { state }, { merge: true });
    },
    // Small per-user saves (game streaks, quiz scores). Always kept on the device; synced when signed in.
    async save(key, value) {
      const all = store.get("cloud", {}); all[key] = value; store.set("cloud", all);
      const f = await firebase();
      if (f && profile.uid) await f.F.setDoc(f.F.doc(f.db, "users", profile.uid), { saved: { [key]: value } }, { merge: true });
    },
    load(key, fallback = null) { const all = store.get("cloud", {}); return key in all ? all[key] : fallback; },
    async remove(key) {
      const all = store.get("cloud", {}); delete all[key]; store.set("cloud", all);
      const f = await firebase();
      if (f && profile.uid) await f.F.updateDoc(f.F.doc(f.db, "users", profile.uid), { ["saved." + key]: f.F.deleteField() });
    },
  };

  // ---------------- welcome / sign-in prompt ----------------
  const WELCOME_SNOOZE_DAYS = 7;
  let welcomeEl = null;
  function onAccountPage() { return /\/account\/?$/.test(location.pathname); }
  function maybeWelcome() {
    if (!accounts.enabled() || profile.uid || onAccountPage() || document.title.startsWith("Page not found")) return;
    const later = store.get("welcome-later", 0);
    if (later && Date.now() - later < WELCOME_SNOOZE_DAYS * 864e5) return;
    try { if (sessionStorage.getItem("chi:welcome-shown")) return; } catch (e) {}
    setTimeout(() => { if (!profile.uid) promptSignIn(); }, 1500);
  }
  function closeWelcome() { if (welcomeEl) { welcomeEl.remove(); welcomeEl = null; document.body.style.overflow = ""; } }
  function promptSignIn(reason) {
    if (!accounts.enabled() || profile.uid || welcomeEl) return;
    try { sessionStorage.setItem("chi:welcome-shown", "1"); } catch (e) {}
    const opener = document.activeElement;
    welcomeEl = document.createElement("div");
    welcomeEl.className = "shade";
    welcomeEl.style.cssText = "display:grid;place-items:center;padding:16px;z-index:70";
    welcomeEl.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="w-title" class="panel stack" style="width:min(430px,100%);gap:12px;box-shadow:0 18px 50px rgba(0,0,0,.18);padding:22px">
      <div><span class="kicker">Free account</span><h2 id="w-title" style="margin-top:6px">${esc(reason || "Keep your streak going")}</h2>
        <p class="small muted" style="margin:6px 0 0">Save your Capitle streak, Headcount scores and quiz results, and see your own senators and races first on every device.</p></div>
      <div class="tabs" role="tablist" style="margin-top:0"><button type="button" role="tab" aria-selected="true" data-m="up">Create account</button><button type="button" role="tab" aria-selected="false" data-m="in">Sign in</button></div>
      <form class="stack" style="gap:10px" novalidate>
        <label class="small" style="display:grid;gap:4px">Email<input class="input" type="email" name="em" autocomplete="email" required></label>
        <label class="small" style="display:grid;gap:4px">Password<input class="input" type="password" name="pw" autocomplete="new-password" minlength="8" required></label>
        <label class="small" style="display:grid;gap:4px" data-up>Home state<select class="input" name="st">${stateOptions(profile.state, "Choose your state")}</select></label>
        <p class="small" role="alert" data-err style="color:var(--bad);margin:0;min-height:1.2em"></p>
        <button class="btn" type="submit">Create account</button>
      </form>
      <button type="button" class="btn ghost" data-later>Maybe later</button></div>`;
    document.body.appendChild(welcomeEl);
    document.body.style.overflow = "hidden";
    const form = welcomeEl.querySelector("form"), err = welcomeEl.querySelector("[data-err]");
    let mode = "up";
    welcomeEl.querySelector(".tabs").onclick = e => {
      const b = e.target.closest("[data-m]"); if (!b) return;
      mode = b.dataset.m;
      welcomeEl.querySelectorAll("[data-m]").forEach(x => x.setAttribute("aria-selected", x === b));
      welcomeEl.querySelector("[data-up]").hidden = mode !== "up";
      form.querySelector("[type=submit]").textContent = mode === "up" ? "Create account" : "Sign in";
      form.pw.autocomplete = mode === "up" ? "new-password" : "current-password";
      err.textContent = "";
    };
    const later = () => { store.set("welcome-later", Date.now()); closeWelcome(); track("welcome-later"); if (opener && opener.focus) opener.focus(); };
    welcomeEl.querySelector("[data-later]").onclick = later;
    welcomeEl.addEventListener("click", e => { if (e.target === welcomeEl) later(); });
    welcomeEl.addEventListener("keydown", e => { if (e.key === "Escape") later(); });
    form.onsubmit = async e => {
      e.preventDefault();
      const em = form.em.value.trim(), pw = form.pw.value, st = form.st.value;
      if (!em || !pw) { err.textContent = "Enter your email and a password."; return; }
      if (mode === "up" && pw.length < 8) { err.textContent = "Use a password with at least 8 characters."; return; }
      if (mode === "up" && !st) { err.textContent = "Choose your home state."; return; }
      const btn = form.querySelector("[type=submit]"); btn.disabled = true; err.textContent = "";
      try {
        if (mode === "up") { await accounts.signUp(em, pw, st); track("signup"); toast("Account created. Your progress is saved."); }
        else { await accounts.signIn(em, pw); track("signin"); toast("Signed in"); }
        closeWelcome();
      } catch (er) { err.textContent = friendlyError(er); btn.disabled = false; }
    };
    setTimeout(() => form.em.focus(), 50);
    track("welcome-shown");
  }
  function friendlyError(e) {
    const c = (e && e.code) || "";
    return c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found") ? "That email and password don't match an account."
      : c.includes("email-already-in-use") ? "An account with that email already exists. Use Sign in."
      : c.includes("weak-password") ? "Use a password with at least 8 characters."
      : c.includes("invalid-email") ? "Check the email address."
      : c.includes("too-many-requests") ? "Too many tries. Wait a minute and try again."
      : (e && e.message) || "Something went wrong. Try again.";
  }

  // ---------------- visitor stats (GoatCounter) ----------------
  function track(name) {
    try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, title: name, event: true }); } catch (e) {}
  }
  if (CFG.goatcounter) {
    const s = document.createElement("script");
    s.async = true; s.src = "https://gc.zgo.at/count.js";
    s.dataset.goatcounter = `https://${CFG.goatcounter}.goatcounter.com/count`;
    document.head.appendChild(s);
    document.addEventListener("click", e => { const t = e.target.closest("[data-track]"); if (t) track(t.dataset.track); });
  }

  // ---------------- state picker helper ----------------
  function stateOptions(selected = "", blankLabel = "All states") {
    return `<option value="">${esc(blankLabel)}</option>` + Object.entries(STATES).map(([k, v]) => `<option value="${k}"${k === selected ? " selected" : ""}>${esc(v)}</option>`).join("");
  }

  window.CHI = { root, STATES, PARTY, esc, money, signedMoney, month, day, store, toast, onProfile, accounts, track, stateOptions, promptSignIn, friendlyError, get profile() { return profile; } };
  document.addEventListener("DOMContentLoaded", () => { paintAccount(); firebase().catch(e => console.warn("accounts unavailable", e)); });
})();
