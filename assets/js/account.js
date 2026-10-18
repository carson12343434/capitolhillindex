(() => {
  const { esc, STATES, accounts, toast } = CHI;
  const box = document.getElementById("box");
  const friendly = e => {
    const c = (e && e.code) || "";
    return c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found") ? "That email and password don't match an account."
      : c.includes("email-already-in-use") ? "An account with that email already exists. Sign in instead."
      : c.includes("weak-password") ? "Use a password with at least 8 characters."
      : c.includes("invalid-email") ? "Check the email address."
      : c.includes("too-many-requests") ? "Too many tries. Wait a minute and try again."
      : (e && e.message) || "Something went wrong. Try again.";
  };

  function render(p) {
    if (!accounts.enabled()) {
      document.getElementById("title").textContent = "Your home state";
      box.innerHTML = `<div class="panel stack">
        <p style="margin:0">Pick your state and the site shows your senators, representatives and races first. It's saved on this device.</p>
        <label for="st" class="small" style="display:grid;gap:4px;max-width:280px">Home state<select id="st" class="input">${CHI.stateOptions(p.state, "Choose a state")}</select></label>
        <p class="small muted" style="margin:0">Sign-in with email is coming soon, so your streaks and results follow you to other devices.</p></div>`;
      box.querySelector("#st").onchange = e => { accounts.setState(e.target.value); toast("Saved"); };
      return;
    }
    if (p.uid) {
      const g = accounts.load("game-stats"), q = accounts.load("quiz-result");
      box.innerHTML = `<div class="panel stack">
        <div><span class="small muted">Signed in as</span><br><b>${esc(p.email)}</b></div>
        <label for="st" class="small" style="display:grid;gap:4px;max-width:280px">Home state<select id="st" class="input">${CHI.stateOptions(p.state, "Choose a state")}</select></label>
        <div class="small"><b>Daily game:</b> ${g ? `played ${g.played}, won ${g.wins}, current streak ${g.streak}, best ${g.best}` : "not played yet"}</div>
        <div class="small"><b>Political quiz:</b> ${q ? `${q.score != null ? `${q.score}/100, ` : ""}${esc(q.label || q.party)} <button class="btn ghost" id="delquiz" style="padding:2px 8px;margin-left:6px">Delete</button>` : "no saved result"}</div>
        <div class="row"><button class="btn ghost" id="out">Sign out</button></div></div>`;
      box.querySelector("#st").onchange = async e => { try { await accounts.setState(e.target.value); toast("Saved"); } catch (er) { toast(friendly(er)); } };
      box.querySelector("#out").onclick = () => accounts.signOut();
      box.querySelector("#delquiz")?.addEventListener("click", async () => { await accounts.remove("quiz-result"); toast("Deleted"); render(CHI.profile); });
      return;
    }
    box.innerHTML = `<div class="tabs" role="tablist" style="margin-top:0"><button role="tab" aria-selected="true" data-m="in">Sign in</button><button role="tab" aria-selected="false" data-m="up">Create account</button></div>
      <form id="f" class="panel stack" style="border-top:0;border-radius:0 0 6px 6px" novalidate>
        <label for="em" class="small" style="display:grid;gap:4px">Email<input id="em" type="email" class="input" autocomplete="email" required></label>
        <label for="pw" class="small" style="display:grid;gap:4px">Password<input id="pw" type="password" class="input" autocomplete="current-password" minlength="8" required></label>
        <label for="st" class="small" style="display:grid;gap:4px" hidden id="stwrap">Home state<select id="st" class="input">${CHI.stateOptions(p.state, "Choose a state")}</select></label>
        <p class="small" id="err" role="alert" style="color:var(--bad);margin:0;min-height:1.2em"></p>
        <div class="row"><button class="btn" id="go">Sign in</button><button type="button" class="btn ghost" id="forgot">Forgot password?</button></div>
      </form>`;
    let mode = "in";
    const f = box.querySelector("#f"), err = box.querySelector("#err");
    box.querySelector(".tabs").onclick = e => {
      const b = e.target.closest("button[data-m]"); if (!b) return;
      mode = b.dataset.m;
      box.querySelectorAll(".tabs button").forEach(x => x.setAttribute("aria-selected", x === b));
      box.querySelector("#stwrap").hidden = mode !== "up";
      box.querySelector("#go").textContent = mode === "up" ? "Create account" : "Sign in";
      box.querySelector("#forgot").hidden = mode === "up";
      box.querySelector("#pw").autocomplete = mode === "up" ? "new-password" : "current-password";
      err.textContent = "";
    };
    f.onsubmit = async e => {
      e.preventDefault();
      const em = box.querySelector("#em").value.trim(), pw = box.querySelector("#pw").value, st = box.querySelector("#st").value;
      if (!em || !pw) { err.textContent = "Enter your email and password."; return; }
      if (mode === "up" && pw.length < 8) { err.textContent = "Use a password with at least 8 characters."; return; }
      if (mode === "up" && !st) { err.textContent = "Choose your home state."; return; }
      box.querySelector("#go").disabled = true; err.textContent = "";
      try {
        if (mode === "up") { await accounts.signUp(em, pw, st); toast("Account created"); CHI.track("signup"); }
        else { await accounts.signIn(em, pw); toast("Signed in"); }
      } catch (er) { err.textContent = friendly(er); }
      box.querySelector("#go") && (box.querySelector("#go").disabled = false);
    };
    box.querySelector("#forgot").onclick = async () => {
      const em = box.querySelector("#em").value.trim();
      if (!em) { err.textContent = "Enter your email first."; return; }
      try { await accounts.resetPassword(em); err.style.color = "var(--ok)"; err.textContent = "If that email has an account, a reset link is on its way."; } catch (er) { err.textContent = friendly(er); }
    };
  }
  CHI.onProfile(render);
})();
