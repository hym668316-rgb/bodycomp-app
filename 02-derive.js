/* ═══════════════════════════════════════════════════════════════
   02-derive.js · 派生计算层
   体测读数 → 脂肪量/去脂体重/BMI/基代；报告文字 → 结构化；告警
   ═══════════════════════════════════════════════════════════════ */
(function (g) {
  "use strict";
  var S = g.Store, D = g.DATA;

  function num(v) { if (v === null || v === undefined || v === "") return null; var x = parseFloat(v); return isNaN(x) ? null : x; }
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function sgn(v) { if (v === null || v === undefined || isNaN(v)) return "—"; return (v > 0 ? "+" : "") + f1(v); }

  /* 把一条读数补齐为带派生值的完整记录 */
  function derive(r) {
    r = Object.assign({}, r);
    r.weight_kg = num(r.weight_kg);
    r.bodyfat_pct = num(r.bodyfat_pct);
    if (r.weight_kg && r.bodyfat_pct !== null) {
      r.fat_kg = +(r.weight_kg * r.bodyfat_pct / 100).toFixed(2);
      r.lean_kg = num(r.lean_kg) || +(r.weight_kg - r.fat_kg).toFixed(2);
    } else { r.lean_kg = num(r.lean_kg); }
    var h = (D.profile.height_cm || 170) / 100;
    r.bmi_true = r.weight_kg ? +(r.weight_kg / (h * h)).toFixed(1) : null;
    r.bmr_true = r.weight_kg ? Math.round(10 * r.weight_kg + 6.25 * D.profile.height_cm - 5 * D.profile.age + 5) : null;
    r.maint_true = r.bmr_true ? Math.round(r.bmr_true * S.PAL_BASE) : null;
    return r;
  }

  /* 基线（构建时内置）+ 用户导入 + 每日打卡里的体重，合并成时间序列 */
  function allReadings() {
    var baked = (D.readings || []).map(function (x) {
      var R = x.raw || {};
      return { date: x.date, time: R.time || "", source: "基线", weight_kg: x.weight_kg, bodyfat_pct: x.bodyfat_pct,
        lean_kg: x.lean_kg, fat_kg: x.fat_kg, bmi_scale: R.bmi_scale, bmr_scale: R.bmr_scale, muscle_kg: R.muscle_kg,
        visceral: R.visceral, subcut_pct: R.subcut_pct, protein_pct: R.protein_pct,
        skeletal_muscle_pct: R.skeletal_muscle_pct, water_pct: R.water_pct, bone_kg: R.bone_kg,
        score: R.score, body_age: R.body_age };
    });
    var mine = Object.keys(S.ST().readings || {}).map(function (k) {
      var r = Object.assign({}, S.ST().readings[k]); r.date = r.date || k; r.source = r.source || "导入"; return r;
    });
    var map = {};
    baked.concat(mine).forEach(function (r) { map[r.date] = r; });
    return Object.keys(map).sort().map(function (k) { return derive(map[k]); });
  }
  /* 没有任何体测记录时的「安全空档案」。
     为什么需要它（实测崩溃）：脱敏公开版 / 用户第一次在新设备打开 / 清空记录后，
     readings 为空 → latest() 返回 undefined → 所有读 .weight_kg/.lean_kg 的地方
     抛 "can't access property ... of undefined"，**整个 App 白屏**。
     给一个中性默认档案，让计算能跑、界面显示「还没记录」，而不是崩掉。 */
  var EMPTY = {
    date: "", time: "", source: "空",
    weight_kg: 70, bodyfat_pct: 22, fat_kg: 15.4, lean_kg: 54.6,
    bmi_true: null, bmr_true: null, maint_true: null,
    muscle_kg: null, visceral: null, subcut_pct: null, protein_pct: null,
    skeletal_muscle_pct: null, water_pct: null, bone_kg: null, score: null, body_age: null
  };
  function emptyReading() { return Object.assign({}, EMPTY); }

  function latest() {
    var a = allReadings();
    return a.length ? a[a.length - 1] : emptyReading();
  }
  function hasReadings() { return allReadings().length > 0; }
  function prevOf(date) {
    var a = allReadings().filter(function (r) { return r.date < date; });
    return a.length ? a[a.length - 1] : null;
  }
  function currentPlan() {
    var ps = D.plans || [];
    return ps.filter(function (p) { return p.id === S.ST().plan; })[0] || ps[1] || ps[0] || { id: "?", title: "—", kcal: 2000 };
  }
  /* 目标体重：按当前去脂体重推算（体脂 16%） */
  function targetWeight() {
    var cur = latest(), lean = cur.lean_kg || (D.derived && D.derived.lean_kg) || 54.6;
    var bf = (D.target && D.target.bodyfat_pct) || 16;
    return +(lean / (1 - bf / 100)).toFixed(1);
  }
  /* 营养目标：**优先用用户设定的目标**（体脂/体重/肌肉量 + 期限 → 动态算缺口与配比）；
     没设目标时回退到固定路线（plans A–D）。
     这样「目标可变」才真的改变每天该吃多少，而不只是显示一个数字。 */
  function nutrition() {
    var p = currentPlan(), cur = latest();
    var lean = cur.lean_kg || (D.derived && D.derived.lean_kg) || 54.6;

    /* ① 有目标：用目标引擎算出的方案。
       注意**重组方案要单独走 recComp()** —— 它吃的是"维持热量"，与
       compute() 按体脂目标反推缺口是两套算法。早先统一走 compute()，
       结果按钮显示 2588、进度卡显示 2442，同一个方案出现两个数（实测抓到）。 */
    var GM = g.Goal;
    if (GM && GM.hasGoal && GM.hasGoal()) {
      var g0 = GM.goal();
      var c;
      if (g0 && g0.kind === "recomp" && GM.recComp) {
        c = GM.recComp(g0.tier, g0.weeks);
      } else {
        c = GM.compute();
      }
      if (c && c.ok) {
        return {
          kcal: c.kcal, protein: c.protein, fat: c.fat, carb: c.carb,
          protein_kcal: c.protein * 4, fat_kcal: c.fat * 9, carb_kcal: c.carb * 4,
          planId: g0 && g0.kind === "recomp" ? "重组" : "目标",
          planTitle: (g0 && g0.kind === "recomp")
            ? (c.name + " · " + c.weeks + " 周")
            : (c.label + " " + c.start + "→" + c.target + c.unit),
          src: "goal", goal: c, kind: g0 ? g0.kind : null
        };
      }
    }

    /* ② 没目标：回退到固定路线 */
    var protein = Math.round(2.0 * lean);                 // 减脂期取 2.0 g/kg 去脂体重
    var kcal = p.kcal;
    var fat = Math.round(kcal * 0.28 / 9);
    var carb = Math.round((kcal - protein * 4 - fat * 9) / 4);
    return { kcal: kcal, protein: protein, fat: fat, carb: carb,
             protein_kcal: protein * 4, fat_kcal: fat * 9, carb_kcal: carb * 4,
             planId: p.id, planTitle: p.title, src: "plan" };
  }

  /* ── 报告文字解析 ── */
  function parseReport(text) {
    var T = String(text || "").replace(/\u3000/g, " ").replace(/：/g, ":");
    var lines = T.split(/\r?\n/), flat = T.replace(/\n/g, " ");
    var found = {};
    var fields = (D.import_spec && D.import_spec.fields) || [];
    fields.forEach(function (f) {
      for (var i = 0; i < lines.length; i++) {
        var ln = lines[i], hit = false;
        if (f.key === "protein_pct" && ln.indexOf("率") >= 0) continue;
        for (var a = 0; a < f.aliases.length; a++) {
          var al = f.aliases[a], idx = ln.indexOf(al);
          if (idx < 0) continue;
          var seg = ln.slice(idx + al.length, idx + al.length + 30);
          var m = seg.match(/(\d+(?:\.\d+)?)\s*(斤|公斤|kg|千克|%|kcal|千卡)?/i);
          if (m) {
            var v = parseFloat(m[1]);
            if ((m[2] || "").toLowerCase() === "斤") v = v / 2;
            found[f.key] = v; hit = true; break;
          }
        }
        if (hit) break;
      }
    });
    if (found.bmi_scale === undefined) { var mb = flat.match(/BMI[^0-9]{0,4}(\d+(?:\.\d+)?)/i); if (mb) found.bmi_scale = parseFloat(mb[1]); }
    if (found.weight_kg === undefined) { var mw = flat.match(/(\d+(?:\.\d+)?)\s*(公斤|kg|千克)/i); if (mw) found.weight_kg = parseFloat(mw[1]); }
    var missing = fields.filter(function (f) { return f.required && found[f.key] === undefined; })
      .map(function (f) { return f.aliases[0]; });
    return { values: found, missing: missing, ok: missing.length === 0, matched: Object.keys(found).length, total: fields.length };
  }

  /* ── 告警 ── */
  function alerts(cur, pv) {
    var out = [];
    if (!cur) return out;
    if (pv && cur.lean_kg && pv.lean_kg) {
      var dl = +(pv.lean_kg - cur.lean_kg).toFixed(2);
      if (dl > 0.5) out.push(["danger", "去脂体重比上次掉了 " + f1(dl) + " kg —— 在减肌肉。先把摄入加 200 kcal，并核对蛋白（目标 " + nutrition().protein + " g/天）。"]);
      if (dl < -0.5) out.push(["ok", "去脂体重涨了 " + f1(-dl) + " kg —— 减脂期还能守住瘦体重，蛋白与训练量都对。"]);
      var d = S.daysBetween(pv.date, cur.date);
      if (d >= 5 && d <= 20) {
        var perW = (pv.weight_kg - cur.weight_kg) / (d / 7);
        if (perW > 1.5) out.push(["warn", "体重掉太快（约 " + f1(perW) + " kg/周）。超过 1.5 通常掺了水分与肌肉，把缺口收小。"]);
        if (Math.abs(perW) < 0.1) out.push(["warn", "这段时间体重几乎没动。先核对记录完整性、蛋白与饮水，不要直接砍热量。"]);
      }
      if (cur.bodyfat_pct > pv.bodyfat_pct && cur.weight_kg < pv.weight_kg)
        out.push(["warn", "体重降了但体脂率升了。生物电阻抗波动大，先同条件复测；若复现，说明在减肌肉。"]);
    }
    if (cur.bodyfat_pct !== null && cur.bodyfat_pct <= D.target.bodyfat_pct)
      out.push(["ok", "体脂已到 " + f1(cur.bodyfat_pct) + "%（目标 " + D.target.bodyfat_pct + "%）。把摄入加回维持量（约 " + (cur.maint_true || 0) + " kcal）维持，不要再往下减。"]);
    if (cur.water_pct !== null && cur.water_pct !== undefined && cur.water_pct < 55)
      out.push(["warn", "水分率 " + f1(cur.water_pct) + "% 偏低。目标 3 L/天；脱水会让秤的体脂读数虚高。"]);
    if (cur.bmi_true !== null && cur.bmi_true >= 24)
      out.push(["warn", "BMI " + cur.bmi_true + " 已在标准区上沿之外（中国标准 18.5–23.9）。继续按当前缺口走即可。"]);
    return out;
  }

  /* 周/月环比 */
  function compare(fromA, toA, fromB, toB) {
    var a = S.rangeStats(fromA, toA), b = S.rangeStats(fromB, toB);
    function d(x, y, unit, betterDown) {
      if (x === null || y === null || x === undefined || y === undefined) return { txt: "—", dir: 0 };
      var v = x - y;
      var dir = Math.abs(v) < 0.05 ? 0 : (v > 0 ? 1 : -1);
      if (betterDown) dir = -dir;
      return { txt: (v > 0 ? "+" : "") + f1(v) + (unit || ""), dir: dir, raw: +v.toFixed(2) };
    }
    return {
      a: a, b: b,
      weight: d(a.weight.last, b.weight.last, " kg", true),
      avgPct: d(a.avgPct, b.avgPct, "%", false),
      train: d(a.trainCount, b.trainCount, " 次", false),
      protein: d(a.proteinDays, b.proteinDays, " 天", false),
      supRate: d(a.supRate, b.supRate, "%", false)
    };
  }

  g.Derive = {
    num: num, f1: f1, sgn: sgn, derive: derive,
    allReadings: allReadings, latest: latest, prevOf: prevOf,
    hasReadings: hasReadings, emptyReading: emptyReading,
    currentPlan: currentPlan, targetWeight: targetWeight, nutrition: nutrition,
    parseReport: parseReport, alerts: alerts, compare: compare
  };
})(window);
