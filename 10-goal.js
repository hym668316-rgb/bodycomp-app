/* ═══════════════════════════════════════════════════════════════
   10-goal.js · 目标引擎（目标可变 + 按期限动态适配）
   ─────────────────────────────────────────────────────────────
   用户要求：目标分为「体脂率 / 体重 / 肌肉量」增减，可在首次录入体测后选；
   并根据目标与计划时间**动态适配**（而不是原来那 4 条写死的路线）。

   设计要点：
     1. 目标必带**幅度**与**期限**（周数），否则"减脂"只是口号，算不出缺口。
     2. 期限由用户给，但**速率要过安全闸**——超过安全速率不是"更快"，是"掉肌肉/伤身体"，
        所以引擎会把不安全的目标**降级到安全速率并明确告知**，而不是默默照做。
     3. 缺口由"要改的质量 ÷ 周数 × 7700 kcal"反推，再按方向取正负。
     4. 热量有下限：不低于 BMR（低于 BMR 长期不可持续，且会掉肌肉）。
     5. 输出里必须带上"为什么是这个数"，用户才能判断该不该信。
   ═══════════════════════════════════════════════════════════════ */
(function (g) {
  "use strict";
  var S = g.Store;
  /* Derive 惰性取：本模块会在 02-derive.js 之前加载（它依赖本模块的目标值），
     所以不能在加载期就绑 g.Derive —— 那会拿到 undefined。 */
  function V() { return g.Derive; }

  /* 安全速率（每周），依据常见运动营养共识区间 */
  var SAFE = {
    bodyfat_pct: { max: 0.75, unit: "%/周", what: "体脂率" },      // 0.5–0.75%/周，激进上限
    weight_kg:   { max: 0.9,  unit: "kg/周", what: "体重" },        // 减重 ≤1%/周；以 74kg 计约 0.74
    muscle_kg:   { max: 0.25, unit: "kg/周", what: "肌肉量" }        // 自然训练者增肌上限约 0.25–0.5 kg/周
  };
  /* 基线 PAL —— **必须与 08-activity-db.js 的 PAL_BASE 一致**，
     否则维持热量和运动边际额度会各用一套基线，同一份运动被算两次。 */
  var PAL_BASE = 1.5;
  var KCAL_PER_KG_FAT = 7700;
  var KCAL_PER_KG_MUSCLE = 5500;     // 增肌伴随的水分/糖原，单位质量所需热量低于脂肪

  var GOALS = [
    { key: "bodyfat_pct", label: "体脂率", def: 16, range: [5, 45], step: 0.5, unit: "%", desc: "最贴近「看起来精不精神」的指标" },
    { key: "weight_kg", label: "体重", def: 68, range: [35, 200], step: 0.5, unit: "kg", desc: "简单直观，但分不清掉的是脂肪还是肌肉" },
    { key: "muscle_kg", label: "肌肉量", def: null, range: [10, 90], step: 0.5, unit: "kg", desc: "增肌为主，需要热量不亏空" }
  ];

  /* 当前目标的存储结构：ST.goal = {key, dir:'down'|'up', target, weeks, startDate, createdAt} */
  function goal() { return S.ST().goal || null; }
  function hasGoal() { var x = goal(); return !!(x && x.key && x.target !== undefined && x.target !== null && x.weeks); }

  function currentValue(key) {
    var c = V().latest() || {};
    if (key === "bodyfat_pct") return c.bodyfat_pct;
    if (key === "weight_kg") return c.weight_kg;
    if (key === "muscle_kg") return c.muscle_kg;
    return null;
  }

  /* 核心：把「目标 + 期限」算成可执行的每日方案 */
  function compute(goalObj) {
    var G = goalObj || goal();
    if (!G || !G.key) return null;
    var cur = V().latest() || {};
    /* 起点口径很重要：
       · 设目标那天记下的值（G.startValue）—— 用于**进度与完成度**
       · 当前读数 —— 用于**重新校准还差多少**
       早先两处都用"当前读数"，结果设完目标后分子恒为 0、完成度永远是 0%（实测抓到）。 */
    var now = currentValue(G.key);
    var start = (G.startValue !== undefined && G.startValue !== null && isFinite(G.startValue))
      ? Number(G.startValue) : now;
    var notes = [], warnings = [];

    if (now === null || now === undefined || !isFinite(now)) {
      return { ok: false, reason: "no-data", key: G.key,
               message: "还没有" + labelOf(G.key) + "的读数 —— 先在首页记一次体重，或到「体测」粘贴秤的报告，之后这里才能算。" };
    }

    var target = Number(G.target);
    var weeks = Math.max(1, Math.round(Number(G.weeks) || 12));
    /* 剩余量按**当前**读数算（目标可能要按进展重排），
       但"已完成多少"按 startValue 算。两者口径不同、各有用途。 */
    var delta = target - now;
    var dir = (target < start) ? "down" : "up";
    var need = Math.abs(delta);
    var needTotal = Math.abs(target - start);
    var perWeek = need / weeks;

    /* ── 安全闸：超速则降级到安全速率，并延长所需周数 ── */
    var safe = SAFE[G.key] || { max: 0.75, unit: "", what: labelOf(G.key) };
    var safeWeeks = Math.max(1, Math.ceil(need / safe.max));
    var capped = false;
    if (perWeek > safe.max * 1.001) {
      capped = true;
      perWeek = safe.max;
      weeks = safeWeeks;
      warnings.push("你给的期限（" + Math.round(Number(G.weeks)) + " 周）要求 " +
        perWeek.toFixed(2) + " " + safe.unit + " 的变化，超过安全上限 " + safe.max + " " + safe.unit +
        "。已按安全速率重排为 <b>" + safeWeeks + " 周</b> —— 更快不是「更有效」，通常意味着掉肌肉。");
    }

    /* ── 缺口：要改的质量换算成总热量，再摊到每天 ── */
    var kcalPerKg = (G.key === "muscle_kg") ? KCAL_PER_KG_MUSCLE : KCAL_PER_KG_FAT;
    var totalKcal = (G.key === "bodyfat_pct")
      ? need / 100 * (cur.weight_kg || 70) * KCAL_PER_KG_FAT      // 体脂率变化要先换算成脂肪质量
      : need * kcalPerKg;
    var dailyGap = Math.round(totalKcal / (weeks * 7));
    if (dir === "up") dailyGap = -dailyGap;          // 增重/增肌 = 热量盈余（负缺口）

    /* ── 热量目标：基线（维持）± 方向 ──
       基线口径必须与「缺口额度」（09-intake.js）一致，否则同一份运动会被算两次。
       约定：**PAL 1.5**，即"平时那样过日子（含每周 3 次力量 + 2 次球）"的维持热量。
         · 优先用秤给的 tdee_maint（它就是按实际活动量估的，最准）
         · 没有就用 bmr × 1.5
         · 都没有才退到 bmr × 1.2 —— 但那样基线偏低、缺口会偏大，所以要告警说明
       早先这里写死 ×1.2，与 2588 的额度基线不一致（实测：同一人算出 2070 vs 2588）。 */
    var bmr = cur.bmr_true || (cur.weight_kg
      ? Math.round(10 * cur.weight_kg + 6.25 * (V().latest().height_cm || 170) - 5 * 26 + 5)
      : 1700);
    var maint, maintSrc;
    if (cur.tdee_maint) { maint = cur.tdee_maint; maintSrc = "秤估算"; }
    else { maint = Math.round(bmr * PAL_BASE); maintSrc = "按 PAL " + PAL_BASE + " 估算"; }
    if (!cur.tdee_maint) {
      warnings.push("没有秤给的维持热量，基线按 BMR × " + PAL_BASE + " 估算（" + maint +
        " kcal）。若你实际活动量更高，真实缺口会比这里算的小。");
    }
    var kcal = maint - dailyGap;
    var minKcal = Math.round(bmr * 1.0);             // 不低于 BMR
    if (kcal < minKcal) {
      warnings.push("按这个缺口算出的热量（" + kcal + " kcal）低于你的基础代谢（" + minKcal +
        " kcal），已上调到 " + minKcal + " kcal。长期低于基代不可持续，也会掉肌肉。");
      kcal = minKcal;
      dailyGap = maint - kcal;
    }

    /* ── 三大营养素：方向不同，配比不同 ── */
    var lean = cur.lean_kg || 54.6;
    var weight = cur.weight_kg || 70;
    var protein, fat, carb;
    if (dir === "down") {
      protein = Math.round(2.0 * lean);                          // 减脂期高蛋白保肌
      fat = Math.max(Math.round(weight * 0.8), Math.round(kcal * 0.25 / 9));
    } else if (G.key === "muscle_kg") {
      protein = Math.round(1.8 * lean);
      fat = Math.max(Math.round(weight * 0.9), Math.round(kcal * 0.25 / 9));
    } else {
      protein = Math.round(1.6 * lean);
      fat = Math.max(Math.round(weight * 0.8), Math.round(kcal * 0.25 / 9));
    }
    carb = Math.max(60, Math.round((kcal - protein * 4 - fat * 9) / 4));
    if (carb < 100) notes.push("碳水偏低（" + carb + " g），训练日可能没力气；若掉力量先把碳水加回来。");

    /* ── 里程碑：按周给预期值 ── */
    var milestones = [];
    var stepWeeks = weeks <= 8 ? 1 : (weeks <= 20 ? 2 : 4);
    for (var w = stepWeeks; w <= weeks; w += stepWeeks) {
      var v = start + (dir === "down" ? -perWeek : perWeek) * w;
      milestones.push({ week: w, value: +v.toFixed(1) });
    }
    if (!milestones.length || milestones[milestones.length - 1].week !== weeks) {
      milestones.push({ week: weeks, value: +target.toFixed(1) });
    }

    /* ── 进度：起点用 startValue（设目标那天的值），不是当前值 ── */
    var startDate = G.startDate || S.todayStr();
    var elapsedDays = Math.max(0, S.daysBetween(startDate, S.todayStr()));
    var elapsedWeeks = elapsedDays / 7;
    var expectedNow = start + (dir === "down" ? -perWeek : perWeek) * elapsedWeeks;
    var actualNow = now;
    var onTrack = null, drift = null;
    if (actualNow !== null && isFinite(actualNow)) {
      drift = +(actualNow - expectedNow).toFixed(2);
      /* 方向向下时，"比预期低"是好事 */
      onTrack = dir === "down" ? (actualNow <= expectedNow + 0.6) : (actualNow >= expectedNow - 0.6);
    }

    /* 完成度 = 从起点走了多少 / 总共要走多少。
       分母是 needTotal（起点→目标），不是 need（当前→目标）——
       否则设完目标当天就是 0%，永远停在 0%（实测抓到过）。 */
    var moved = dir === "down" ? (start - actualNow) : (actualNow - start);
    var pctDone = needTotal > 0 ? Math.min(100, Math.max(0, Math.round(moved / needTotal * 100))) : 100;

    return {
      ok: true, key: G.key, label: labelOf(G.key), dir: dir,
      start: start, target: +target.toFixed(1), need: +need.toFixed(1),
      /* needTotal = 起点到目标的全程；need = 从当前还差多少。两者用途不同。 */
      needTotal: +needTotal.toFixed(1),
      /* unit 是"显示单位"（%/kg），perUnit 是"速率单位"（%/周、kg/周）——
         早先把两者混用，界面会显示成「目标 16%/周」这种错的拼接。 */
      unit: (metaOf(G.key) || {}).unit || "",
      perUnit: safe.unit,
      weeks: weeks, perWeek: +perWeek.toFixed(2), safeMax: safe.max,
      totalKcal: Math.round(totalKcal), dailyGap: dailyGap,
      bmr: bmr, maint: maint, kcal: kcal,
      protein: protein, fat: fat, carb: carb,
      milestones: milestones, capped: capped, warnings: warnings, notes: notes,
      startDate: startDate, elapsedWeeks: +elapsedWeeks.toFixed(1),
      expectedNow: +expectedNow.toFixed(1), actualNow: actualNow, onTrack: onTrack, drift: drift,
      pctDone: pctDone, moved: +moved.toFixed(2)
    };
  }

  function labelOf(key) {
    for (var i = 0; i < GOALS.length; i++) if (GOALS[i].key === key) return GOALS[i].label;
    return key;
  }
  function metaOf(key) {
    for (var i = 0; i < GOALS.length; i++) if (GOALS[i].key === key) return GOALS[i];
    return null;
  }

  /* 设定/修改目标。第一次设定时**记下当天的实际值**作为进度起点 ——
     这是完成度能算对的前提（只存目标不存起点，完成度会恒为 0）。 */
  function setGoal(key, target, weeks, dir) {
    var st = S.ST();
    var cur = currentValue(key);
    var keepStart = !!(st.goal && st.goal.key === key && st.goal.startValue !== undefined
                       && st.goal.startValue !== null && isFinite(st.goal.startValue));
    st.goal = {
      key: key,
      target: Number(target),
      weeks: Math.max(1, Math.round(Number(weeks) || 12)),
      dir: dir || (cur !== null && Number(target) < cur ? "down" : "up"),
      /* 同一个目标上反复微调时不重置起点（否则进度会一直被清零） */
      startValue: keepStart ? st.goal.startValue : cur,
      startDate: keepStart ? st.goal.startDate : S.todayStr(),
      createdAt: (st.goal && st.goal.createdAt) || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    S.save();
    return st.goal;
  }
  function clearGoal() { var st = S.ST(); delete st.goal; S.save(); }

  /* 给界面用的建议默认值：从当前值出发，按常见目标的合理幅度 */
  function suggest(key) {
    var cur = currentValue(key);
    if (cur === null) return { target: metaOf(key) ? metaOf(key).def : null, weeks: 12 };
    if (key === "bodyfat_pct") return { target: Math.max(8, Math.round((cur - 6) * 2) / 2), weeks: 14 };
    if (key === "weight_kg") return { target: Math.round((cur * 0.92) * 2) / 2, weeks: 14 };
    return { target: Math.round((cur + 2) * 2) / 2, weeks: 16 };
  }

  g.Goal = { GOALS: GOALS, SAFE: SAFE, KCAL_PER_KG_FAT: KCAL_PER_KG_FAT, PAL_BASE: PAL_BASE,
             goal: goal, hasGoal: hasGoal, compute: compute, setGoal: setGoal,
             clearGoal: clearGoal, suggest: suggest, labelOf: labelOf, metaOf: metaOf,
             currentValue: currentValue };
})(window);
