// Political quiz: questions and scoring. Pure functions, no page code, so it can be tested on its own.
//
// Score: 0 = the most liberal set of answers possible, 100 = the most conservative.
// Each agree/disagree answer is placed between the liberal end (0) and the conservative end (1) of that
// question, and each ranking is placed between a typical Democratic and a typical Republican order.
// Questions count in proportion to how sharply they divide Democrats and Republicans in national surveys
// (Pew Research Center and Gallup), so a question that splits the parties by 60 points counts more than
// one that splits them by 30.
(function (root) {
  const SCALE = ["Strongly agree", "Agree", "Not sure", "Disagree", "Strongly disagree"];
  // agree: % of Democrats, Republicans and independents who agree (Pew Research Center / Gallup, 2019-2025).
  // dir: +1 when agreeing is the conservative answer, -1 when agreeing is the liberal answer.
  const ITEMS = [
    { id: "health", axis: "econ", dir: -1, agree: [78, 25, 52], text: "The government should make sure all Americans have health insurance, even if it means higher taxes." },
    { id: "taxes", axis: "econ", dir: 1, agree: [25, 80, 50], text: "Lower taxes and fewer regulations on business are the best way to grow the economy." },
    { id: "wage", axis: "econ", dir: -1, agree: [85, 40, 62], text: "The federal minimum wage should be raised to at least $15 an hour." },
    { id: "govsize", axis: "econ", dir: 1, agree: [26, 77, 55], text: "Government is doing too many things that are better left to businesses and individuals." },
    { id: "climate", axis: "econ", dir: -1, agree: [75, 20, 45], text: "The government should do more about climate change, even if it raises energy costs." },
    { id: "tariffs", axis: "econ", dir: 1, agree: [14, 70, 35], text: "Tariffs on imported goods help American workers more than they hurt American consumers." },
    { id: "abortion", axis: "social", dir: -1, agree: [85, 41, 63], text: "Abortion should be legal in all or most cases." },
    { id: "guns", axis: "social", dir: -1, agree: [86, 31, 56], text: "Gun laws in this country should be stricter than they are today." },
    { id: "deport", axis: "social", dir: 1, agree: [20, 84, 48], text: "The U.S. should deport more of the immigrants living here illegally." },
    { id: "gender", axis: "social", dir: 1, agree: [41, 90, 64], text: "Whether someone is a man or a woman is determined by the sex they were assigned at birth." },
    { id: "rights", axis: "social", dir: -1, agree: [78, 22, 47], text: "The country still needs to do more to give Black Americans equal rights with white Americans." },
    { id: "religion", axis: "social", dir: 1, agree: [25, 69, 40], text: "Religion should play a bigger role in American public life." },
    { id: "police", axis: "social", dir: 1, agree: [35, 66, 48], text: "Police departments in my area should get more funding." },
  ];
  // Rankings: each option's importance score for Democrats, Republicans and independents
  // (roughly the % calling it very important).
  const RANKS = [
    { id: "issues", axis: "social", short: "How you ranked the issues that matter to your vote", text: "Rank these issues by how much they matter to your vote, most important first.",
      options: [["The economy and inflation", [70, 93, 82]], ["Immigration", [39, 82, 58]], ["Health care", [76, 50, 62]],
                ["Abortion", [67, 35, 48]], ["Climate change", [55, 12, 34]], ["Crime", [47, 68, 56]]] },
    { id: "priorities", axis: "econ", short: "What you'd have the government work on first", text: "If you ran the federal government, what would you work on first? Rank them.",
      options: [["Lowering taxes", [35, 72, 52]], ["Securing the border", [35, 86, 58]], ["Reducing the national debt", [50, 72, 62]],
                ["Expanding health care and social programs", [80, 28, 52]], ["Fighting climate change", [70, 10, 38]]] },
    { id: "values", axis: "social", short: "How you ranked your values", text: "Rank these values by how important they are to you.",
      options: [["Individual freedom", [62, 82, 74]], ["Equality", [85, 45, 62]], ["Family and faith", [48, 80, 60]],
                ["Law and order", [48, 80, 62]], ["Fairness in the economy", [82, 45, 62]]] },
  ];
  const QUESTIONS = [ITEMS[0], ITEMS[1], RANKS[0], ITEMS[6], ITEMS[2], ITEMS[7], ITEMS[3], RANKS[1], ITEMS[8], ITEMS[4],
    ITEMS[9], ITEMS[5], RANKS[2], ITEMS[10], ITEMS[11], ITEMS[12]].map(q => ({ ...q, kind: q.options ? "rank" : "scale" }));

  const RANK_WEIGHT = 0.45;
  // Where each label starts on the 0-100 line. Calibrated so typical Democrats and Republicans in the
  // survey data land in their party's label and only genuinely mixed answers land in the middle.
  const BANDS = [[0, "Democrat"], [33, "Moderate Democrat"], [45, "Independent"], [55, "Moderate Republican"], [67, "Republican"]];

  const weightOf = q => q.kind === "scale" ? Math.abs(q.agree[1] - q.agree[0]) / 100 : RANK_WEIGHT;

  // 0 = most liberal answer, 1 = most conservative
  function scaleValue(q, a) { return q.dir > 0 ? (4 - a) / 4 : a / 4; }
  function rankValue(q, order) {
    const lean = j => (q.options[j][1][1] - q.options[j][1][0]) / 100; // + = Republicans rank it higher
    const n = order.length, pw = i => (n - 1 - i) / (n - 1);
    const s = o => o.reduce((acc, j, i) => acc + pw(i) * lean(j), 0);
    const idx = q.options.map((_, j) => j);
    const lo = s(idx.slice().sort((a, b) => lean(a) - lean(b))), hi = s(idx.slice().sort((a, b) => lean(b) - lean(a)));
    return (s(order) - lo) / (hi - lo);
  }
  function valueOf(q, a) { return q.kind === "scale" ? scaleValue(q, a) : rankValue(q, a); }
  function label(score) { let l = BANDS[0][1]; for (const [start, name] of BANDS) if (score >= start) l = name; return l; }

  function score(answers) {
    let num = 0, den = 0;
    const axes = { econ: [0, 0], social: [0, 0] }, items = [];
    for (const q of QUESTIONS) {
      const a = answers[q.id];
      if (a == null) continue;
      const v = valueOf(q, a), w = weightOf(q);
      num += v * w; den += w;
      axes[q.axis][0] += v * w; axes[q.axis][1] += w;
      items.push({ id: q.id, text: q.text, short: q.short, value: v, weight: w });
    }
    const s = den ? Math.round((num / den) * 100) : 50;
    const ax = k => axes[k][1] ? Math.round((axes[k][0] / axes[k][1]) * 100) : null;
    // answers that pulled hardest each way, relative to the middle
    const pullL = items.filter(x => x.value <= 0.25).sort((a, b) => a.value * b.weight - b.value * a.weight || b.weight - a.weight).slice(0, 3);
    const pullR = items.filter(x => x.value >= 0.75).sort((a, b) => b.value * b.weight - a.value * a.weight).slice(0, 3);
    return { score: s, label: label(s), econ: ax("econ"), social: ax("social"), pullL, pullR };
  }

  // Expected score for a typical member of each group, used to mark the line.
  function typical(pi) {
    let num = 0, den = 0;
    for (const q of QUESTIONS) {
      const w = weightOf(q);
      let v;
      if (q.kind === "scale") {
        const a = q.agree[pi] / 100, neutral = pi === 2 ? 0.24 : 0.1;
        const d = [a * 0.42, a * 0.46, neutral, (1 - a) * 0.46, (1 - a) * 0.42], t = d.reduce((x, y) => x + y);
        v = d.reduce((acc, p, k) => acc + (p / t) * scaleValue(q, k), 0);
      } else {
        v = rankValue(q, q.options.map((_, j) => j).sort((x, y) => q.options[y][1][pi] - q.options[x][1][pi]));
      }
      num += v * w; den += w;
    }
    return Math.round((num / den) * 100);
  }
  const TYPICAL = { D: typical(0), R: typical(1), I: typical(2) };

  const api = { SCALE, QUESTIONS, ITEMS, RANKS, BANDS, TYPICAL, score, label, scaleValue, rankValue };
  if (typeof module !== "undefined") module.exports = api; else root.CHI_QUIZ = api;
})(typeof window !== "undefined" ? window : globalThis);
