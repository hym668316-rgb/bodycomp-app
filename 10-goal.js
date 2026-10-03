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

  /* 安全速率（每周），依据常见运动营养共识区间。
     **每个目标给两档**：稳健档（推荐，代价小）/ 激进档（更快，但代价明确）。
     用户要的"两个档位"就是这两档 —— 而且它们不是简单的"快慢"，
     是**代价不同**：激进减脂掉肌肉更多，激进增肌长脂肪更多。 */
  var SAFE = {
    bodyfat_pct: {
      steady:     { max: 0.5,  unit: "%/周", what: "体脂率", label: "稳健", cost: "肌肉几乎不掉，最容易坚持" },
      aggressive: { max: 0.75, unit: "%/周", what: "体脂率", label: "激进", cost: "更快，但掉肌肉与掉力量的风险明显上升，需要高蛋白 + 保住训练强度" }
    },
    weight_kg: {
      steady:     { max: 0.6, unit: "kg/周", what: "体重", label: "稳健", cost: "每周 0.5–0.6 kg，可持续" },
      aggressive: { max: 0.9, unit: "kg/周", what: "体重", label: "激进", cost: "接近每周 1% 体重上限，容易连带掉肌肉与代谢适应" }
    },
    muscle_kg: {
      steady:     { max: 0.15, unit: "kg/周", what: "肌肉量", label: "稳健（瘦增肌）", cost: "增肌慢但几乎不长脂肪，适合体脂已经不高时" },
      aggressive: { max: 0.30, unit: "kg/周", what: "肌肉量", label: "激进（常规增肌）", cost: "增肌更快，但必然伴随脂肪增加，之后要再减一轮" }
    }
  };
  /* 取某一档的安全上限；key 不存在时给个保守默认 */
  function safeOf(key, tier) {
    var s = SAFE[key];
    if (!s) return { max: 0.75, unit: "", what: key, label: "", cost: "" };
    return s[tier] || s.steady;
  }

  /* 基线 PAL —— **必须与 08-activity-db.js 的 PAL_BASE 一致**，
     否则「维持热量」和「运动边际额度」会各用一套基线，同一份运动被算两次。 */
  var PAL_BASE = 1.5;
  var KCAL_PER_KG_FAT = 7700;
  var KCAL_PER_KG_MUSCLE = 5500;     // 增肌伴随的水分/糖原，单位质量所需热量低于脂肪

  /* ══════════════════════════════════════════════════════════════
     「减脂的同时增肌」= 身体重组（recomposition）
     ──────────────────────────────────────────────────────────────
     用户明确要的是**这一个目标本身分稳健 / 激进两档**，各配 3 种时长。
     （我先前误做成「减脂一个目标、增肌一个目标」两个独立档位，方向错了。）

     机制 —— 这是重组与「先减后增」的根本差别：
       · 热量：稳健档吃**维持**；激进档吃**小幅赤字（约 −12%）**。
         赤字越大，增肌部分越先归零。所以激进档不是"更狠的减脂"，
         而是"用更多赤字换更快的体脂下降，代价是增肌几乎停滞"。
       · 蛋白：两档都 2.2 g/kg **去脂体重**（重组对蛋白的要求高于普通减脂）。
       · 训练：必须力量训练且逐周加重 —— 没有这个，重组不会发生，只会变成普通减脂。
       · 体重：**几乎不变**（脂肪掉、肌肉涨，互相抵消）。所以看体脂率与围度，不看秤。

     诚实前提：重组**很慢**，效果高度依赖起点：
       · 体脂越高、训练年限越短 → 重组潜力越大
       · 训练 2 年以上 + 体脂已低 → 基本不动，应改成「先增肌再减脂」
     recPotential() 按这两点分级，而不是一刀切。
     ══════════════════════════════════════════════════════════════ */
  var RECOMP = {
    steady: {
      key: "recomp_steady", dir: "recomp", tier: "steady",
      name: "减脂增肌 · 稳健档", tag: "推荐", unit: "%/周",
      bfPerWeek: 0.20, musclePerWeek: 0.06, deficitPct: 0,
      who: "想同时改善体脂与肌肉、不赶时间 —— 多数人该从这一档开始",
      cost: "体脂下降较慢，但肌肉确实在涨；体重几乎不变，要看体脂率而不是秤",
      mealNote: "吃在维持热量：不亏空也不盈余",
      options: [
        { weeks: 8,  note: "短期验证期 —— 主要看这个方案对你有没有反应" },
        { weeks: 14, note: "中等周期，通常已经能看到体脂与围度的变化" },
        { weeks: 20, note: "完整重组周期，效果最稳" }
      ]
    },
    aggressive: {
      key: "recomp_aggressive", dir: "recomp", tier: "aggressive",
      name: "减脂增肌 · 激进档", tag: "快", unit: "%/周",
      bfPerWeek: 0.35, musclePerWeek: 0.03, deficitPct: 0.12,
      who: "体脂偏高（>22%）、想先把体脂压下来，同时尽量保住并小幅增长肌肉",
      cost: "⚠ 体脂掉得更快，但增肌几乎停滞（赤字下增肌优先级最低）；" +
            "蛋白与训练必须严格守住，否则会退化成纯减脂",
      mealNote: "吃小幅赤字（约 −12%）：比减脂温和，比维持略低",
      options: [
        { weeks: 8,  note: "短期冲刺，结束后建议回到稳健档继续" },
        { weeks: 14, note: "典型激进重组周期" },
        { weeks: 20, note: "激进档的最长周期；再长建议切回稳健档" }
      ]
    }
  };
  var RECOMP_LIST = [RECOMP.steady, RECOMP.aggressive];

  /* 重组潜力分级：回答"这个方案对你到底有没有用" */
  function recPotential(bf, trainingYears) {
    var y = Number(trainingYears);
    if (!isFinite(y)) y = 1;                 // 不知道训练年限时按 1 年估
    var bfScore = (bf === null || bf === undefined) ? 1 : (bf >= 20 ? 2 : bf >= 16 ? 1 : 0);
    var trScore = y < 0.5 ? 2 : y < 2 ? 1 : 0;
    var score = bfScore + trScore;           // 0–4
    if (score >= 3) return { level: "高", score: score,
      why: "体脂偏高 + 训练年限短 → 这是重组效果最明显的人群" };
    if (score >= 2) return { level: "中", score: score,
      why: "有重组空间，但比新手慢；建议先按 8 周验证期看有没有反应" };
    return { level: "低", score: score,
      why: "体脂已低或训练年限长 → 同时减脂增肌基本不动，建议改成「先增肌再减脂」" };
  }

  /* 计算重组的一个时长方案 */
  function recComp(tierKey, weeks) {
    var T = (tierKey === "aggressive") ? RECOMP.aggressive : RECOMP.steady;
    var cur = V().latest() || {};
    var bf = cur.bodyfat_pct, lean = cur.lean_kg, wt = cur.weight_kg;
    var notes = [], warnings = [];
    if (bf === null || bf === undefined || !lean || !wt) {
      return { ok: false, message: "身体重组需要体脂率、去脂体重、体重三个数 —— " +
        "先去「设置 → 体测与趋势」粘贴一次体脂秤报告。" };
    }
    var bmr = cur.bmr_true || 1700;
    var maint = cur.tdee_maint || Math.round(bmr * PAL_BASE);
    var protein = Math.round(2.2 * lean);                       // 重组对蛋白要求更高
    var kcal = Math.round(maint * (1 - T.deficitPct));
    var fat = Math.max(Math.round(wt * 0.8), Math.round(kcal * 0.25 / 9));
    var carb = Math.round((kcal - protein * 4 - fat * 9) / 4);
    if (carb < 80) {                                        // 碳水太低没法练
      carb = 80;
      kcal = protein * 4 + fat * 9 + carb * 4;
      notes.push("为保住训练所需碳水（≥80 g），热量已上调到 " + kcal + " kcal。");
    }
    /* 预期变化：体脂率按当前体重折算成脂肪质量，肌肉按去脂体重折算 */
    var fatKg0 = wt - lean;
    var dMuscle = +(T.musclePerWeek * weeks).toFixed(1);
    var dFat = +Math.min(fatKg0 * 0.45, T.bfPerWeek / 100 * wt * weeks).toFixed(1);  // 最多掉 45% 脂肪
    var leanEnd = lean + dMuscle;
    var fatEnd = Math.max(0.5, fatKg0 - dFat);
    var wtEnd = +(leanEnd + fatEnd).toFixed(1);
    var bfEnd = +(fatEnd / wtEnd * 100).toFixed(1);
    var pot = recPotential(bf, 1);

    if (T.deficitPct > 0) {
      warnings.push("激进档吃的是赤字（" + (maint - kcal) + " kcal/天）。赤字下增肌优先级最低 —— " +
        "预期肌肉只涨约 " + dMuscle + " kg；而稳健档吃维持能涨约 " +
        +(RECOMP.steady.musclePerWeek * weeks).toFixed(1) + " kg。");
    }
    notes.push(pot.why);
    notes.push("判断有没有效果的三个信号：<b>体重几乎不变、体脂率在降、主项重量在涨</b>。三个都满足就是成了。");
    if (weeks <= 8) notes.push("8 周属于<b>验证期</b>：主要看方案对你有没有反应，别期待大变化。");

    return {
      ok: true, tierKey: T.key, tierLabel: T.tier === "steady" ? "稳健档" : "激进档",
      name: T.name, dir: "recomp", weeks: weeks,
      kcal: kcal, maint: maint, deficit: maint - kcal, deficitPct: Math.round(T.deficitPct * 100),
      protein: protein, fat: fat, carb: carb,
      dMuscle: dMuscle, dFat: dFat,
      bfStart: bf, bfEnd: bfEnd, wtStart: wt, wtEnd: wtEnd,
      leanStart: lean, leanEnd: +leanEnd.toFixed(1),
      potential: pot, warnings: warnings, notes: notes,
      mealNote: T.mealNote, cost: T.cost,
      watchMetrics: ["体脂率", "腰围", "主项重量"]
    };
  }

  /* 列出某一档的全部时长方案（含算好的结果），供界面直接渲染 */
  function recOptions(tierKey) {
    var T = (tierKey === "aggressive") ? RECOMP.aggressive : RECOMP.steady;
    return T.options.map(function (o) {
      return { weeks: o.weeks, note: o.note, calc: recComp(T.tier, o.weeks) };
    });
  }

  /* 兼容旧引用 */
  var PRESETS = RECOMP_LIST;

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

    /* ── 安全闸：按**档位**取上限；超速则降级到该档上限并延长周数 ──
       tier 缺省用 steady（稳健档）—— 保守默认比激进默认安全。 */
    var tier = (G.tier === "aggressive") ? "aggressive" : "steady";
    var safe = safeOf(G.key, tier);
    var safeWeeks = Math.max(1, Math.ceil(need / safe.max));
    var capped = false;
    if (perWeek > safe.max * 1.001) {
      capped = true;
      var asked = perWeek;
      perWeek = safe.max;
      weeks = safeWeeks;
      warnings.push("你给的期限（" + Math.round(Number(G.weeks)) + " 周）要求 " + asked.toFixed(2) +
        " " + safe.unit + " 的变化，超过「" + safe.label + "档」上限 " + safe.max + " " + safe.unit +
        "。已按该档速率重排为 <b>" + safeWeeks + " 周</b>。" +
        (tier === "steady" ? "想更快可以切到激进档 —— 但它有明确代价。" : "激进档也已到顶，再快就是拿肌肉换速度。"));
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
      tier: tier, tierLabel: safe.label, tierCost: safe.cost,
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
  function setGoal(key, target, weeks, dir, tier, presetKey) {
    var st = S.ST();
    var cur = currentValue(key);
    var keepStart = !!(st.goal && st.goal.key === key && st.goal.startValue !== undefined
                       && st.goal.startValue !== null && isFinite(st.goal.startValue));
    st.goal = {
      key: key,
      target: Number(target),
      weeks: Math.max(1, Math.round(Number(weeks) || 12)),
      dir: dir || (cur !== null && Number(target) < cur ? "down" : "up"),
      /* 档位：steady（稳健）/ aggressive（激进）。缺省 steady。 */
      tier: (tier === "aggressive") ? "aggressive" : "steady",
      /* 用哪个预设方案设的（复合方案会把阶段信息记下来） */
      preset: presetKey || null,
      phase: null,
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

  /* ── 按方案档位直接设定目标（身体重组的主入口）──
     用户要的是「减脂同时增肌」分稳健/激进两档 × 各 3 种时长。
     重组**不设单一的体脂/体重目标值**（因为体重几乎不变），
     而是把**预期体脂率**与**预期去脂体重**一起记下来，进度同时看这两个。 */
  function applyRecomp(tierKey, weeks) {
    var c = recComp(tierKey, weeks);
    if (!c || !c.ok) return c;
    var st = S.ST();
    var prev = st.goal;
    var sameTier = prev && prev.preset === c.tierKey;
    st.goal = {
      key: "bodyfat_pct",                 // 主指标用体脂率
      dir: "down",
      target: c.bfEnd,                    // 预期达到的体脂率
      targetLean: c.leanEnd,              // 预期达到的去脂体重（肌肉目标）
      weeks: weeks,
      tier: (tierKey === "aggressive") ? "aggressive" : "steady",
      preset: c.tierKey,
      kind: "recomp",
      /* 起点：首次设定时记下，之后微调不重置（否则完成度恒为 0 —— 踩过） */
      startValue: (sameTier && prev.startValue !== undefined) ? prev.startValue : c.bfStart,
      startLean: (sameTier && prev.startLean !== undefined) ? prev.startLean : c.leanStart,
      startDate: (sameTier && prev.startDate) ? prev.startDate : S.todayStr(),
      createdAt: (prev && prev.createdAt) || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    S.save();
    return c;
  }

  /* 兼容旧调用名：compose(key[, weeks]) 直接给重组方案结果 */
  function compose(presetKey, weeks) {
    if (presetKey === "recomp_aggressive") return recComp("aggressive", weeks || 14);
    return recComp("steady", weeks || 14);
  }

  /* 两档位并列对比（给界面用）：同一个目标值，稳健 vs 激进分别需要多少周、吃多少。
     要点：**不能给两档传同一个 weeks** —— 那样速率被摊薄、永远不触发安全闸，
     两档会算出完全一样的数（实测踩到：都变成 99 周 / 2532 kcal）。
     正解：按各档上限反推它**最少需要多少周**，再在那个周数下算热量。 */
  function compareTiers(key, target) {
    var start = currentValue(key);
    if (start === null || start === undefined || !isFinite(start)) return [];
    var need = Math.abs(Number(target) - start);
    return ["steady", "aggressive"].map(function (t) {
      var s = safeOf(key, t);
      var weeks = Math.max(1, Math.ceil(need / s.max));
      var c = compute({ key: key, target: target, weeks: weeks, tier: t,
                        startValue: start, startDate: S.todayStr() });
      return {
        tier: t, label: s.label, maxRate: s.max, unit: s.unit, cost: s.cost,
        weeks: weeks,
        days: weeks * 7,
        kcal: c && c.ok ? c.kcal : null,
        gap: c && c.ok ? c.dailyGap : null,
        protein: c && c.ok ? c.protein : null,
        ok: !!(c && c.ok)
      };
    });
  }

  /* 给界面用的建议默认值：从当前值出发，按常见目标的合理幅度 */
  function suggest(key) {
    var cur = currentValue(key);
    if (cur === null) return { target: metaOf(key) ? metaOf(key).def : null, weeks: 12 };
    if (key === "bodyfat_pct") return { target: Math.max(8, Math.round((cur - 6) * 2) / 2), weeks: 14 };
    if (key === "weight_kg") return { target: Math.round((cur * 0.92) * 2) / 2, weeks: 14 };
    return { target: Math.round((cur + 2) * 2) / 2, weeks: 16 };
  }

  g.Goal = { GOALS: GOALS, SAFE: SAFE, PRESETS: PRESETS, safeOf: safeOf,
             RECOMP: RECOMP, recComp: recComp, applyRecomp: applyRecomp, recOptions: recOptions, recPotential: recPotential,
             compose: compose, compareTiers: compareTiers, KCAL_PER_KG_FAT: KCAL_PER_KG_FAT, PAL_BASE: PAL_BASE,
             goal: goal, hasGoal: hasGoal, compute: compute, setGoal: setGoal,
             clearGoal: clearGoal, suggest: suggest, labelOf: labelOf, metaOf: metaOf,
             currentValue: currentValue };
})(window);
