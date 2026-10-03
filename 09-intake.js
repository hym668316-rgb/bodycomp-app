/* ═══════════════════════════════════════════════════════════════
   09-intake.js · 当天摄入汇总 + 缺口动态计算
   ─────────────────────────────────────────────────────────────
   设计原则：
     · 数据只存"选了什么、几份"（foods），摄入与缺口**每次渲染实时算**，
       所以改动立刻反映在缺口上，不需要存中间结果（也就不会不一致）。
     · 缺口按「还差多少 + 建议吃什么补齐」给，而不是只报一个数字。
   ═══════════════════════════════════════════════════════════════ */
(function (g) {
  "use strict";
  var S = g.Store, V = g.Derive, FOOD = g.FoodDB, ACT = g.ActDB;

  var MEALS = [
    { key: "breakfast", label: "早餐", hint: "7:00–8:00" },
    { key: "lunch", label: "午餐", hint: "12:00 食堂" },
    { key: "dinner", label: "晚餐", hint: "18:15 外卖/食堂" },
    { key: "snack", label: "加餐", hint: "训练后 / 下午" }
  ];

  /* 当天选中的食物：d.foods = { breakfast: [{name, qty}], ... } */
  function foodsOf(date) {
    var d = S.day(date);
    return (d && d.foods) || {};
  }

  /* 汇总当天摄入 */
  function intake(date) {
    var foods = foodsOf(date);
    var tot = { kcal: 0, p: 0, c: 0, f: 0, items: 0, byMeal: {}, unknown: [] };
    MEALS.forEach(function (m) {
      var list = foods[m.key] || [];
      var mm = { kcal: 0, p: 0, c: 0, f: 0, n: list.length };
      list.forEach(function (sel) {
        var it = FOOD.get(sel.name);
        if (!it) { tot.unknown.push(sel.name); return; }   // 未知食物：报出来，不静默算 0
        var q = Number(sel.qty);
        if (!isFinite(q) || q <= 0) q = 1;                 // 防 NaN / 负数 / 0
        if (q > 20) q = 20;                                // 防 "x 份" 之类算出天文数字
        mm.kcal += it.kcal * q; mm.p += it.p * q; mm.c += it.c * q; mm.f += it.f * q;
        tot.items++;
      });
      tot.byMeal[m.key] = mm;
      tot.kcal += mm.kcal; tot.p += mm.p; tot.c += mm.c; tot.f += mm.f;
    });
    ["kcal", "p", "c", "f"].forEach(function (k) { tot[k] = Math.round(tot[k]); });
    return tot;
  }

  /* 当天运动消耗（支持多项）。
     加进额度的用 **marginal（比本人 PAL1.5 基线的边际值）**，不是 net（比卧床）。
     验证者实测过用 net 的后果：只记「久坐 16 小时」会凭空 +375 kcal 额度（真实应为 0 或负）。
     总消耗（含静息）仍展示，因为"这段时间总共烧了多少"是用户想看的数。 */
  function burn(date) {
    var d = S.day(date);
    var w = V.latest().weight_kg;
    var badWeight = !(w > 0);
    if (badWeight) w = 70;
    var list = ((d && d.sessions) || []).slice();
    /* 兼容旧数据：早期只存 d.train / d.trainMin 单项 */
    if (!list.length && d && d.train && d.trainMin) {
      list = [{ name: d.train, min: d.trainMin, legacy: true }];
    }
    var out = list.map(function (x) {
      var nm = ACT.migrateName(x.name);
      var min = Number(x.min);
      if (!isFinite(min) || min < 0) min = 0;              // 防负数/NaN 一路泄漏到界面
      if (min > 600) min = 600;                            // 防"1e5 分钟"算出 43 万 kcal
      return {
        name: nm, rawName: x.name, min: min,
        unknown: !ACT.isKnown(x.name),
        isBaseline: ACT.isBaseline(nm),
        needConfirm: !!(ACT.needsConfirm && ACT.needsConfirm[x.name]),
        gross: ACT.grossKcal(nm, w, min),
        net: ACT.netKcal(nm, w, min),
        marginal: ACT.marginalKcal(nm, w, min)
      };
    });
    return {
      list: out, weight: w, badWeight: badWeight,
      gross: out.reduce(function (a, x) { return a + x.gross; }, 0),
      totalNet: out.reduce(function (a, x) { return a + x.net; }, 0),
      marginal: out.reduce(function (a, x) { return a + x.marginal; }, 0),
      hasUnknown: out.some(function (x) { return x.unknown; }),
      baselineOnly: out.length > 0 && out.every(function (x) { return x.isBaseline; }),
      needConfirm: out.filter(function (x) { return x.needConfirm; })
    };
  }

  /* 缺口：路线目标 − 已摄入；运动只按**边际值**加额度 */
  function gaps(date) {
    var nut = V.nutrition();
    var intk = intake(date);
    var brn = burn(date);
    /* 当天可摄入 = 路线目标 + 运动**边际**消耗。
       基线是 PAL 1.5（实测 derived.tdee_maint/bmr = 2588/1725 = 1.500），
       所以只有超出 1.5 的那部分才算"额外可吃"；久坐/站立/家务等基线行为边际为 0。
       先前用 (MET−1)（即假设基线 PAL 1.0）是错的 —— 验证者实测：
       只记「久坐 16 小时」会虚增 375 kcal 额度。 */
    var budget = {
      kcal: nut.kcal + brn.marginal,
      p: nut.protein, c: nut.carb, f: nut.fat
    };
    var gap = {
      kcal: Math.round(budget.kcal - intk.kcal),
      p: Math.round(budget.p - intk.p),
      c: Math.round(budget.c - intk.c),
      f: Math.round(budget.f - intk.f)
    };
    return { nut: nut, intake: intk, burn: brn, budget: budget, gap: gap,
             overKcal: gap.kcal < -50, progress: {
               kcal: budget.kcal ? Math.min(999, Math.round(intk.kcal / budget.kcal * 100)) : 0,
               p: budget.p ? Math.min(999, Math.round(intk.p / budget.p * 100)) : 0,
               c: budget.c ? Math.min(999, Math.round(intk.c / budget.c * 100)) : 0,
               f: budget.f ? Math.min(999, Math.round(intk.f / budget.f * 100)) : 0
             } };
  }

  /* 补缺建议：按缺口给具体食物组合（优先蛋白密度高、食堂易得） */
  function advise(date) {
    var G = gaps(date), tips = [];
    var p = G.gap.p, k = G.gap.kcal;

    if (p > 25) {
      var picks = [], left = p;
      var cands = FOOD.proteinPriority.slice();
      for (var i = 0; i < cands.length && left > 6 && picks.length < 3; i++) {
        var it = FOOD.get(cands[i]);
        if (!it) continue;
        var n = Math.min(3, Math.max(1, Math.round(left / it.p)));
        picks.push(it.name + (n > 1 ? " ×" + n : ""));
        left -= it.p * n;
      }
      tips.push({ level: "warn", label: "蛋白还差 " + p + " g",
        text: "建议补：" + picks.join("、") + (left > 6 ? "（还差约 " + Math.max(0, Math.round(left)) + " g）" : "") });
    } else if (p <= 25 && p > -10) {
      tips.push({ level: "ok", label: "蛋白已达标", text: "还差 " + Math.max(0, p) + " g 以内，不用刻意补。" });
    }

    if (k > 250) {
      tips.push({ level: "warn", label: "热量还差 " + k + " kcal",
        text: "吃太少会掉肌肉、也会让训练没力气。可以加一份主食 + 一份蛋白（如米饭 1 碗 + 鸡胸 150g ≈ 316 kcal）。" });
    } else if (k < -200) {
      tips.push({ level: "danger", label: "热量超了 " + Math.abs(k) + " kcal",
        text: "超出的部分不会凭空消失。两个最省事的动作：今晚主食减半、把奶茶/可乐换成无糖。" });
    }

    if (G.gap.c < -40) tips.push({ level: "warn", label: "碳水超了 " + Math.abs(G.gap.c) + " g", text: "多半来自米饭/面条/奶茶。主食减半最快。" });
    if (G.gap.f < -15) tips.push({ level: "warn", label: "脂肪超了 " + Math.abs(G.gap.f) + " g", text: "重点查炒菜油、坚果、奶茶。一份炒菜油就是 10 g。" });

    if (G.burn.marginal > 0) {
      tips.push({ level: "ok", label: "运动额外可吃 " + G.burn.marginal + " kcal",
        text: "按体重 " + G.burn.weight + " kg、相对你的日常基线（PAL " + (ACT.PAL_BASE || 1.5) +
          "）算出的边际消耗，已加进今天额度。总消耗 " + G.burn.gross + " kcal。" });
    } else if (G.burn.baselineOnly) {
      tips.push({ level: "warn", label: "只有日常活动，不加额度",
        text: "久坐/站立/家务本来就含在日常消耗基线里。要增加可吃额度，请记真正的运动（力量/球类/有氧）。" });
    }
    if (G.burn.badWeight) {
      tips.push({ level: "warn", label: "还没记体重",
        text: "运动消耗暂按 70 kg 估算。去「首页」记一次体重，这里立刻变准。" });
    }
    if (!G.intake.items) {
      tips.unshift({ level: "warn", label: "今天还没记吃的", text: "点上面的餐次，选你实际吃了什么；选完这里会实时算缺口。" });
    }
    return { gaps: G, tips: tips };
  }

  /* 增删改：选食物 / 调份数 / 删除 */
  function addFood(date, mealKey, name) {
    var foods = Object.assign({}, foodsOf(date));
    var list = (foods[mealKey] || []).slice();
    var hit = null;
    for (var i = 0; i < list.length; i++) if (list[i].name === name) hit = list[i];
    if (hit) hit.qty = Math.min(20, (hit.qty || 1) + 1);
    else list.push({ name: name, qty: 1 });
    foods[mealKey] = list;
    S.setDay(date, { foods: foods });
  }
  function setQty(date, mealKey, name, qty) {
    var foods = Object.assign({}, foodsOf(date));
    var list = (foods[mealKey] || []).slice();
    if (qty <= 0) list = list.filter(function (x) { return x.name !== name; });
    else list = list.map(function (x) { return x.name === name ? { name: x.name, qty: qty } : x; });
    if (list.length) foods[mealKey] = list; else delete foods[mealKey];
    S.setDay(date, { foods: foods });
  }
  function delFood(date, mealKey, name) { setQty(date, mealKey, name, 0); }

  /* 运动项增删 */
  function addSession(date, name, min) {
    var d = S.day(date);
    var list = ((d && d.sessions) || []).slice();
    /* 闸门：验证者实测 addSession(-120) 会存负数、addSession(0) 会静默变 30、
       时长 1e5 会算出 43 万 kcal。这里统一夹到 5–600 分钟。 */
    var m = parseInt(min, 10);
    if (!isFinite(m) || m <= 0) m = 30;
    m = Math.max(5, Math.min(600, m));
    list.push({ name: name, min: m });
    /* 同步旧的单向字段，保持周报/兼容逻辑可用 */
    S.setDay(date, { sessions: list, train: list[0].name, trainMin: list.reduce(function (a, x) { return a + (x.min || 0); }, 0) });
  }
  function setSessionMin(date, idx, min) {
    var d = S.day(date);
    var list = ((d && d.sessions) || []).slice();
    if (!list[idx]) return;
    list[idx] = { name: list[idx].name, min: Math.max(5, Math.min(600, min)) };
    S.setDay(date, { sessions: list, train: list[0].name, trainMin: list.reduce(function (a, x) { return a + (x.min || 0); }, 0) });
  }
  function delSession(date, idx) {
    var d = S.day(date);
    var list = ((d && d.sessions) || []).slice();
    list.splice(idx, 1);
    S.setDay(date, { sessions: list, train: list.length ? list[0].name : "", trainMin: list.reduce(function (a, x) { return a + (x.min || 0); }, 0) });
  }

  g.Intake = { MEALS: MEALS, foodsOf: foodsOf, intake: intake, burn: burn, gaps: gaps,
               advise: advise, addFood: addFood, setQty: setQty, delFood: delFood,
               addSession: addSession, setSessionMin: setSessionMin, delSession: delSession };
})(window);
