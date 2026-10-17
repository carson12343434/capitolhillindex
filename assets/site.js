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
  const FB_VER = "10.12.2";
  async function firebase() {
    if (fb || !CFG.firebase || !CFG.firebase.apiKey) return fb;
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    const [app, auth, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    const a = app.initializeApp(CFG.firebase);
    fb = { auth: auth.getAuth(a), db: fs.getFirestore(a), A: auth, F: fs };
    auth.onAuthStateChanged(fb.auth, async user => {
      if (!user) { if (profile.uid) setLocal({ uid: "", email: "" }); return; }
      let data = {};
      try { const snap = await fs.getDoc(fs.doc(fb.db, "users", user.uid)); data = snap.exists() ? snap.data() : {}; } catch (e) { console.warn(e); }
      setLocal({ uid: user.uid, email: user.email || "", state: data.state || profile.state || "" });
      if (data.saved) store.set("cloud", data.saved);
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

  window.CHI = { root, STATES, PARTY, esc, money, signedMoney, month, day, store, toast, onProfile, accounts, track, stateOptions, get profile() { return profile; } };
  document.addEventListener("DOMContentLoaded", () => { paintAccount(); firebase().catch(e => console.warn("accounts unavailable", e)); });
})();
