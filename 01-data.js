/* ═══════════════════════════════════════════════════════════════
   01-data.js · 数据层
   · ST 全局状态与持久化
   · 全部读写经过这里，其它模块不直接碰 localStorage
   ═══════════════════════════════════════════════════════════════ */
(function (g) {
  "use strict";
  var D = g.DATA;
  var KEY = "bodycomp_v2";
  var PAL_BASE = 1.2;

  /* 默认结构 */
  function blank() {
    return {
      plan: "B",              // 当前路线 A/B/C/D
      dietPlan: 0,            // 饮食方案索引（早/午/晚 三套模板）
      trainPlan: 0,           // 训练方案索引（0=新手三分化 1=精简二分化）
      logs: {},               // date -> {w, bf, waist, water, sleep, protein, breakfast, meals:{...}, train, sup:{}, mood, note}
      lifts: [],              // [{d,name,w,r}]
      readings: {},           // date -> 体测原始值
      checkpoints: {},        // key -> 周/月复盘
      reminder: { on: false, time: "21:00" },
      tab: "home",
      firstRun: true
    };
  }
  var ST = blank();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(ST)); return true; }
    catch (e) { if (g.toast) g.toast("保存失败：" + e.message); return false; }
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) { var o = JSON.parse(raw); if (o && typeof o === "object") ST = Object.assign(blank(), o); }
    } catch (e) { }
  }
  function reset() { ST = blank(); save(); }

  /* ── 日志读写 ── */
  function day(date) { return ST.logs[date] || {}; }
  function setDay(date, patch) {
    ST.logs[date] = Object.assign({}, ST.logs[date] || {}, patch);
    save();
    return ST.logs[date];
  }
  function toggle(date, key) {
    var d = day(date), v = d[key] === "1" ? "0" : "1";
    return setDay(date, (function () { var o = {}; o[key] = v; return o; })());
  }
  function toggleSup(date, name) {
    var d = ST.logs[date] || {};
    var sup = Object.assign({}, d.sup || {});
    if (sup[name]) delete sup[name]; else sup[name] = 1;
    return setDay(date, { sup: sup });
  }
  function addLift(rec) { ST.lifts.push(rec); save(); }
  function delLift(i) { ST.lifts.splice(i, 1); save(); }

  /* ── 日期工具 ── */
  function pad(n) { return String(n).padStart(2, "0"); }
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function shift(date, days) {
    var d = new Date(date + "T00:00:00"); d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function daysBetween(a, b) { return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000); }
  function lastN(n) { var a = [], t = todayStr(); for (var i = n - 1; i >= 0; i--) a.push(shift(t, -i)); return a; }
  /* ISO 周序号（用于周报分组） */
  function isoWeek(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    var wk1 = new Date(t.getFullYear(), 0, 4);
    var n = 1 + Math.round(((t - wk1) / 86400000 - 3 + ((wk1.getDay() + 6) % 7)) / 7);
    return t.getFullYear() + "-W" + pad(n);
  }
  function monthOf(dateStr) { return dateStr.slice(0, 7); }

  /* ── 补剂：每天必吃清单 ── */
  function mustSupps() {
    var S = D.supplements || {};
    var items = S.items || [];
    return items.filter(function (x) { return x.must; });
  }

  /* ── 每日完成度：五大板块 ── */
  /* 每个板块返回 {key,label,pct,done,total,detail[]} */
  function dailySections(date) {
    var d = day(date);
    var must = mustSupps();
    var supDone = Object.keys(d.sup || {}).length;

    /* 1 饮食 */
    var dietItems = [
      ["protein", "蛋白达标", d.protein === "1"],
      ["breakfast", "吃了早饭", d.breakfast === "1"],
      ["lunch", "午餐记录", !!(d.meals && d.meals.lunch)],
      ["dinner", "晚餐记录", !!(d.meals && d.meals.dinner)],
      ["water", "饮水 ≥2.5L", d.water === "1"]
    ];
    /* 2 训练 */
    var trainItems = [
      ["train", "今日训练", !!d.train],
      ["duration", "记录时长", !!(d.trainMin > 0)]
    ];
    /* 3 补剂 */
    var supItems = must.map(function (x) { return [x.name, x.name, !!(d.sup && d.sup[x.name])]; });
    if (!supItems.length) supItems = [["sup", "补剂", false]];
    /* 4 体测：当天记了体重、或当天有体测读数，都算完成（否则明明有数据却显示 0%） */
    var hasReading = !!(g.Derive && g.Derive.allReadings().filter(function (r) { return r.date === date; }).length);
    var bodyItems = [
      ["weight", "体重已记", (d.w !== undefined && d.w !== "") || hasReading],
      /* 腰围是「周一次」的事，**不算进每日完成度**（weekly=true 会被下面的 pack 排除），
         否则用户每一天都不可能 100%。但它仍然可以在体测页记录、在周报里体现。 */
      ["waist", "腰围（每周一次即可）", d.waist !== undefined && d.waist !== "", true]
    ];
    /* 5 作息 */
    var habitItems = [
      ["sleep", "睡够 7 小时", d.sleep === "1"],
      ["mood", "状态已记", !!d.mood]
    ];

    /* pack 的 arr 元素格式：[key, label, ok, weekly?]
       weekly=true 的项属于「本周做一次即可」，**不计入每日完成度**，但仍在 detail 里展示
       （否则用户每天都不可能达到 100%，会让人放弃打卡）。 */
    function pack(key, label, arr) {
      var daily = arr.filter(function (x) { return !x[3]; });
      var done = daily.filter(function (x) { return x[2]; }).length;
      return { key: key, label: label, done: done, total: daily.length,
               pct: daily.length ? Math.round(done / daily.length * 100) : 0,
               weeklyDone: arr.filter(function (x) { return x[3] && x[2]; }).length,
               weeklyTotal: arr.filter(function (x) { return x[3]; }).length,
               detail: arr.map(function (x) {
                 return { k: x[0], label: x[1], ok: x[2], weekly: !!x[3] };
               }) };
    }
    return [pack("diet", "饮食", dietItems), pack("train", "训练", trainItems),
            pack("sup", "补剂", supItems), pack("body", "体测", bodyItems),
            pack("habit", "作息", habitItems)];
  }
  function dayScore(date) {
    var s = dailySections(date);
    var done = s.reduce(function (a, x) { return a + x.done; }, 0);
    var total = s.reduce(function (a, x) { return a + x.total; }, 0);
    return { done: done, total: total, pct: total ? Math.round(done / total * 100) : 0, sections: s };
  }

  /* ── 区间统计（日/周/月报表用） ── */
  function rangeStats(from, to) {
    var out = { from: from, to: to, days: 0, logged: 0, avgPct: 0, bySection: {},
                weight: { first: null, last: null, min: null, max: null, avg: null, n: 0 },
                trainCount: 0, trainMin: 0, liftVolume: 0, proteinDays: 0, breakfastDays: 0,
                supRate: 0, supFull: 0, waterDays: 0, sleepDays: 0, lifts: [] };
    var cur = from, guard = 0;
    while (daysBetween(cur, to) >= 0 && guard++ < 800) {
      out.days++;
      var d = ST.logs[cur];
      if (d) {
        out.logged++;
        var sc = dayScore(cur);
        out.avgPct += sc.pct;
        sc.sections.forEach(function (s) {
          var b = out.bySection[s.key] || (out.bySection[s.key] = { label: s.label, done: 0, total: 0 });
          b.done += s.done; b.total += s.total;
        });
        if (d.w) { var w = parseFloat(d.w); if (!isNaN(w)) { out.weight.n++;
          out.weight.first = out.weight.first === null ? w : out.weight.first;
          out.weight.last = w;
          out.weight.min = out.weight.min === null ? w : Math.min(out.weight.min, w);
          out.weight.max = out.weight.max === null ? w : Math.max(out.weight.max, w); } }
        if (d.train) out.trainCount++;
        if (d.trainMin) out.trainMin += parseFloat(d.trainMin) || 0;
        if (d.protein === "1") out.proteinDays++;
        if (d.breakfast === "1") out.breakfastDays++;
        if (d.water === "1") out.waterDays++;
        if (d.sleep === "1") out.sleepDays++;
        var must = mustSupps().length;
        var sn = Object.keys(d.sup || {}).length;
        if (must) { out.supRate += sn / must; if (sn >= must) out.supFull++; }
      }
      cur = shift(cur, 1);
    }
    out.avgPct = out.logged ? Math.round(out.avgPct / out.logged) : 0;
    out.supRate = out.logged ? Math.round(out.supRate / out.logged * 100) : 0;
    Object.keys(out.bySection).forEach(function (k) {
      var b = out.bySection[k]; b.pct = b.total ? Math.round(b.done / b.total * 100) : 0;
    });
    if (out.weight.n) out.weight.avg = +((out.weight.min + out.weight.max) / 2).toFixed(1);
    out.lifts = ST.lifts.filter(function (L) { return daysBetween(from, L.d) >= 0 && daysBetween(L.d, to) >= 0; });
    out.liftVolume = out.lifts.reduce(function (a, L) { return a + (L.w * L.r); }, 0);
    return out;
  }

  /* ── 连续打卡 ── */
  function streak() {
    var n = 0, cur = todayStr();
    if (!ST.logs[cur] || dayScore(cur).pct === 0) cur = shift(cur, -1);
    for (var i = 0; i < 500; i++) {
      if (ST.logs[cur] && dayScore(cur).pct > 0) { n++; cur = shift(cur, -1); } else break;
    }
    return n;
  }

  /* ── 导出 / 导入 ── */
  function exportObj() { return { app: "bodycomp", version: 2, exportedAt: new Date().toISOString(), state: ST }; }
  function importObj(o) {
    if (!o || typeof o !== "object") throw new Error("格式不对");
    var s = o.state || o;
    if (!s || typeof s !== "object") throw new Error("找不到 state");
    ST = Object.assign(blank(), s); save();
  }

  g.Store = {
    D: D, ST: function () { return ST; }, PAL_BASE: PAL_BASE,
    save: save, load: load, reset: reset, blank: blank,
    day: day, setDay: setDay, toggle: toggle, toggleSup: toggleSup,
    addLift: addLift, delLift: delLift,
    pad: pad, todayStr: todayStr, shift: shift, daysBetween: daysBetween, lastN: lastN,
    isoWeek: isoWeek, monthOf: monthOf,
    mustSupps: mustSupps, dailySections: dailySections, dayScore: dayScore,
    rangeStats: rangeStats, streak: streak,
    exportObj: exportObj, importObj: importObj
  };
})(window);
