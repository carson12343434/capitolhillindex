// Political quiz: questions and scoring. Pure functions, no page code, so it can be tested on its own.
//
// Party match uses naive Bayes. For every question we stored roughly how Democrats, Republicans and
// independents answer it in national surveys (Pew Research Center and Gallup, 2019-2025). The quiz asks how
// likely your full set of answers would be from a typical member of each group. Ranking questions use a
// Plackett-Luce model of each group's priorities (from the share of each group calling an issue "very important").
// The two axes come from the agree/disagree answers alone.
(function (root) {
  const SCALE = ["Strongly agree", "Agree", "Not sure", "Disagree", "Strongly disagree"];
  // agree: share of each group (D, R, I) that agrees or strongly agrees. dir: +1 when agreeing is the
  // economically or socially conservative answer, -1 when agreeing is the liberal answer.
  const ITEMS = [
    { id: "health", axis: "econ", dir: -1, agree: [78, 25, 52], text: "The government should make sure all Americans have health insurance, even if it means higher taxes." },
    { id: "taxes", axis: "econ", dir: 1, agree: [25, 80, 50], text: "Lower taxes and fewer regulations on business are the best way to grow the economy." },
    { id: "wage", axis: "econ", dir: -1, agree: [85, 40, 62], text: "The federal minimum wage should be raised to at least $15 an hour." },
    { id: "govsize", axis: "econ", dir: 1, agree: [26, 77, 55], text: "Government is doing too many things that are better left to businesses and individuals." },
    { id: "climate", axis: "econ", dir: -1, agree: [75, 20, 45], text: "The government should do more about climate change, even if it raises energy costs." },
    { id: "tariffs", axis: null, dir: 1, agree: [14, 70, 35], text: "Tariffs on imported goods help American workers more than they hurt American consumers." },
    { id: "abortion", axis: "social", dir: -1, agree: [85, 41, 63], text: "Abortion should be legal in all or most cases." },
    { id: "guns", axis: "social", dir: -1, agree: [86, 31, 56], text: "Gun laws in this country should be stricter than they are today." },
    { id: "deport", axis: "social", dir: 1, agree: [20, 84, 48], text: "The U.S. should deport more of the immigrants living here illegally." },
    { id: "gender", axis: "social", dir: 1, agree: [41, 90, 64], text: "Whether someone is a man or a woman is determined by the sex they were assigned at birth." },
    { id: "rights", axis: "social", dir: -1, agree: [78, 22, 47], text: "The country still needs to do more to give Black Americans equal rights with white Americans." },
    { id: "religion", axis: "social", dir: 1, agree: [25, 69, 40], text: "Religion should play a bigger role in American public life." },
    { id: "police", axis: "social", dir: 1, agree: [35, 66, 48], text: "Police departments in my area should get more funding." },
  ];
  // Rankings: each option has an importance score per group (D, R, I), roughly the % calling it very important.
  const RANKS = [
    { id: "issues", text: "Rank these issues by how much they matter to your vote, most important first.",
      options: [["The economy and inflation", [70, 93, 82]], ["Immigration", [39, 82, 58]], ["Health care", [76, 50, 62]],
                ["Abortion", [67, 35, 48]], ["Climate change", [55, 12, 34]], ["Crime", [47, 68, 56]]] },
    { id: "priorities", text: "If you ran the federal government, what would you work on first? Rank them.",
      options: [["Lowering taxes", [35, 72, 52]], ["Securing the border", [35, 86, 58]], ["Reducing the national debt", [50, 72, 62]],
                ["Expanding health care and social programs", [80, 28, 52]], ["Fighting climate change", [70, 10, 38]]] },
    { id: "values", text: "Rank these values by how important they are to you.",
      options: [["Individual freedom", [62, 82, 74]], ["Equality", [85, 45, 62]], ["Family and faith", [48, 80, 60]],
                ["Law and order", [48, 80, 62]], ["Fairness in the economy", [82, 45, 62]]] },
  ];
  const QUESTIONS = [ITEMS[0], ITEMS[1], RANKS[0], ITEMS[6], ITEMS[2], ITEMS[7], ITEMS[3], RANKS[1], ITEMS[8], ITEMS[4],
    ITEMS[9], ITEMS[5], RANKS[2], ITEMS[10], ITEMS[11], ITEMS[12]].map(q => ({ ...q, kind: q.options ? "rank" : "scale" }));
  const PARTIES = ["D", "R", "I"];
  const PRIOR = [0.4, 0.4, 0.2];
  const K = 4.0; // how sharply importance scores turn into ranking preferences

  function scaleDist(agreePct, neutral) {
    const a = agreePct / 100;
    const d = [a * 0.42, a * 0.46, neutral, (1 - a) * 0.46, (1 - a) * 0.42];
    const s = d.reduce((x, y) => x + y, 0);
    return d.map(x => x / s);
  }
  function scaleLik(item, answer) { // answer 0..4
    return PARTIES.map((p, i) => scaleDist(item.agree[i], i === 2 ? 0.24 : 0.1)[answer]);
  }
  function rankLik(item, order) { // order: option indexes, most important first
    return PARTIES.map((p, pi) => {
      let rest = order.slice(), lik = 1;
      for (const o of order) {
        const den = rest.reduce((s, j) => s + Math.exp(K * item.options[j][1][pi] / 100), 0);
        lik *= Math.exp(K * item.options[o][1][pi] / 100) / den;
        rest = rest.filter(j => j !== o);
      }
      return lik;
    });
  }

  function score(answers) { // answers: { [id]: number (0..4) | number[] (ranking) }
    let logp = PRIOR.map(Math.log);
    const contrib = [];
    const axes = { econ: [], social: [] };
    for (const q of QUESTIONS) {
      const a = answers[q.id];
      if (a == null) continue;
      const lik = q.kind === "scale" ? scaleLik(q, a) : rankLik(q, a);
      const l = lik.map(Math.log);
      logp = logp.map((x, i) => x + l[i]);
      contrib.push({ id: q.id, text: q.text, push: l[0] - l[1] }); // >0 pushes toward D, <0 toward R
      if (q.kind === "scale" && q.axis) axes[q.axis].push((2 - a) * q.dir); // agree=+2 .. disagree=-2, signed so + is conservative
    }
    const m = Math.max(...logp);
    const ex = logp.map(x => Math.exp(x - m));
    const tot = ex.reduce((x, y) => x + y, 0);
    const prob = ex.map(x => x / tot);
    const axis = k => axes[k].length ? Math.round((axes[k].reduce((x, y) => x + y, 0) / axes[k].length) * 5 * 10) / 10 : 0; // -10..10
    const econ = axis("econ"), social = axis("social");
    const pD = prob[0], pR = prob[1], pI = prob[2];
    let party, strength;
    const top = Math.max(pD, pR, pI);
    if (top === pI || top < 0.6) {
      party = "Independent";
      strength = Math.abs(pD - pR) < 0.15 ? "right in the middle" : pD > pR ? "leaning Democratic" : "leaning Republican";
    } else {
      party = pD > pR ? "Democrat" : "Republican";
      strength = top >= 0.97 ? "strong" : top >= 0.85 ? "solid" : "moderate";
    }
    return { prob: { D: pD, R: pR, I: pI }, party, strength, econ, social, label: label(econ, social),
             pushD: contrib.filter(c => c.push > 0.4).sort((a, b) => b.push - a.push).slice(0, 3),
             pushR: contrib.filter(c => c.push < -0.4).sort((a, b) => a.push - b.push).slice(0, 3) };
  }
  function label(e, s) {
    const E = e < -3 ? "L" : e > 3 ? "R" : "M", S = s < -3 ? "L" : s > 3 ? "R" : "M";
    return {
      LL: "Progressive", LM: "Economic liberal", LR: "Populist left", ML: "Social liberal", MM: "Centrist", MR: "Social conservative",
      RL: "Libertarian-leaning", RM: "Fiscal conservative", RR: "Conservative",
    }[E + S];
  }
  const api = { SCALE, QUESTIONS, ITEMS, RANKS, score, scaleDist, rankLik, PARTIES };
  if (typeof module !== "undefined") module.exports = api; else root.CHI_QUIZ = api;
})(typeof window !== "undefined" ? window : globalThis);
