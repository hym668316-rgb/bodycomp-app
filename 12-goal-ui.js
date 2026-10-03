/* ═══════════════════════════════════════════════════════════════
   12-goal-ui.js · 目标选择与进度界面
   ─────────────────────────────────────────────────────────────
   用户要求：目标在**第一次给出身体数据后**出现可选项；
   并且进度随时间推进（完成度、在轨判断、里程碑）。
   ═══════════════════════════════════════════════════════════════ */
(function (g) {
  "use strict";
  var S = g.Store, GL = g.Goal;

  /* el/card/esc 由 04-views.js 导出到 g.U（不是 g.Views）*/
  function U() { return g.U; }
  function esc(s) { return U().esc(String(s == null ? "" : s)); }
  function toast(m) { if (g.toast) g.toast(m); else if (g.FX && g.FX.toast) g.FX.toast(m); }

  /* ── 设置目标（首次录入后出现）── */
  function picker(root) {
    var el = U().el, card = U().card;
    var st = S.ST();
    var draft = st.goalDraft || { key: "bodyfat_pct", target: null, weeks: 12 };
    var has = GL.hasGoal();

    var c = card(has ? "调整目标" : "设定你的目标", has ? "改了会立刻重算每天的摄入与缺口" : "先定目标，后面所有数字才有依据");

    /* 1) 目标类型三选一 */
    c.appendChild(el("div", "tiny", "选一个主目标 —— 注意：<b>减脂期不建议同时追增肌</b>，两个一起追通常两个都做不好。"));
    var gp = el("div", "goalpick");
    GL.GOALS.forEach(function (o) {
      var cur = GL.currentValue(o.key);
      var on = draft.key === o.key;
      var b = el("button", "goalopt" + (on ? " on" : ""),
        "<b>" + esc(o.label) + "</b>" +
        "<span class='tiny'>当前 " + (cur === null || cur === undefined ? "—" : cur + o.unit) + "</span>" +
        "<span class='tiny'>" + esc(o.desc) + "</span>");
      b.onclick = function () {
        var sg = GL.suggest(o.key);
        S.ST().goalDraft = { key: o.key, target: sg.target, weeks: sg.weeks };
        S.save(); g.render();
      };
      gp.appendChild(b);
    });
    c.appendChild(gp);

    var meta = GL.metaOf(draft.key) || GL.GOALS[0];
    var cur = GL.currentValue(draft.key);
    if (cur === null || cur === undefined) {
      c.appendChild(el("div", "warnbox2",
        "还没有「" + esc(meta.label) + "」的读数。先去首页记一次体重，或到「体测」粘贴体脂秤报告 —— 有了读数才能算缺口。"));
    } else {
      var sg2 = GL.suggest(draft.key);
      var tgt = (draft.target === null || draft.target === undefined) ? sg2.target : draft.target;
      var wks = draft.weeks || sg2.weeks;

      /* 2) 目标值 */
      var r1 = el("div", "numrow");
      r1.appendChild(el("label", null, "目标" + meta.label));
      var ti = el("input"); ti.type = "number"; ti.id = "goalTarget";
      ti.value = String(tgt); ti.step = String(meta.step);
      ti.min = String(meta.range[0]); ti.max = String(meta.range[1]); ti.inputMode = "decimal";
      r1.appendChild(ti);
      r1.appendChild(el("span", "uu", meta.unit));
      c.appendChild(r1);

      /* 3) 期限 */
      var r2 = el("div", "numrow");
      r2.appendChild(el("label", null, "计划期限"));
      var wi = el("input"); wi.type = "number"; wi.id = "goalWeeks";
      wi.value = String(wks); wi.step = "1"; wi.min = "1"; wi.max = "104"; wi.inputMode = "numeric";
      r2.appendChild(wi);
      r2.appendChild(el("span", "uu", "周"));
      c.appendChild(r2);

      /* 4) 实时预览 */
      var pv = el("div"); pv.id = "goalPreview";
      c.appendChild(pv);

      function refresh() {
        var t = parseFloat(ti.value), w = parseInt(wi.value, 10);
        if (!isFinite(t) || !isFinite(w) || w < 1) { pv.innerHTML = "<div class='tiny'>填一个目标值与期限。</div>"; return; }
        var res = GL.compute({ key: draft.key, target: t, weeks: w, startValue: cur, startDate: S.todayStr() });
        if (!res || !res.ok) { pv.innerHTML = "<div class='tiny'>" + esc(res ? res.message : "算不出来") + "</div>"; return; }
        var h = "";
        h += "<div class='okbox'><b>" + esc(res.label) + " " + res.start + " → " + res.target + res.unit + "</b>" +
             "，需改 " + res.need + res.unit + "，<b>" + res.weeks + " 周</b>，" +
             "速率 <b>" + res.perWeek + " " + res.perUnit + "</b>（安全上限 " + res.safeMax + "）</div>";
        h += "<div class='mstone'><span>每天摄入</span><b>" + res.kcal + " kcal</b></div>";
        h += "<div class='mstone'><span>缺口</span><b>" + (res.dailyGap > 0 ? "−" + res.dailyGap : "+" + (-res.dailyGap)) +
             " kcal / 天</b></div>";
        h += "<div class='mstone'><span>蛋白 / 脂肪 / 碳水</span><b>" + res.protein + " / " + res.fat + " / " + res.carb + " g</b></div>";
        h += "<div class='mstone'><span>维持热量（基线）</span><b>" + res.maint + " kcal</b></div>";
        (res.warnings || []).forEach(function (w) { h += "<div class='warnbox2'>⚠ " + w + "</div>"; });
        (res.notes || []).forEach(function (w) { h += "<div class='tiny'>· " + esc(w) + "</div>"; });
        /* 里程碑 */
        h += "<div class='tiny' style='margin-top:8px'><b>按周预期</b></div>";
        res.milestones.forEach(function (m) {
          h += "<div class='mstone'><span>第 " + m.week + " 周</span><b>" + m.value + res.unit + "</b></div>";
        });
        pv.innerHTML = h;
        draft.target = t; draft.weeks = w;
      }
      ti.oninput = refresh; wi.oninput = refresh;
      setTimeout(refresh, 0);

      /* 5) 保存 */
      var save = el("button", "btn primary", has ? "更新目标" : "就用这个目标");
      save.onclick = function () {
        var t = parseFloat(ti.value), w = parseInt(wi.value, 10);
        if (!isFinite(t)) { toast("目标值填一下"); return; }
        if (!isFinite(w) || w < 1) { toast("期限填一下（周）"); return; }
        GL.setGoal(draft.key, t, w);
        S.ST().goalDraft = null; S.save();
        toast("目标已设定：" + meta.label + " → " + t + meta.unit);
        S.ST().tab = "home"; g.render();
      };
      c.appendChild(save);
      if (has) {
        var cl = el("button", "btn ghost", "清除目标（回退到固定路线）");
        cl.onclick = function () { GL.clearGoal(); toast("已清除目标"); g.render(); };
        c.appendChild(cl);
      }
    }
    root.appendChild(c);
  }

  /* ── 进度卡（有目标时显示在首页）── */
  function progressCard(root) {
    var el = U().el, card = U().card;
    var c = GL.compute();
    if (!c) return;
    var cd = card("我的目标", c.label + " · " + c.startDate + " 起 · 共 " + c.weeks + " 周");

    if (!c.ok) { cd.appendChild(el("div", "warnbox2", esc(c.message))); root.appendChild(cd); return; }

    var di = c.dir === "down" ? "↓" : "↑";
    cd.appendChild(el("div", "goalhero",
      "<span class='gv'>" + c.actualNow + "</span><span class='gu'>" + c.unit + "</span>" +
      "<span class='gu'>" + di + " 目标 <b>" + c.target + c.unit + "</b></span>"));

    /* 进度条 */
    cd.appendChild(el("div", "goalbar", "<i style='width:" + c.pctDone + "%'></i>"));
    cd.appendChild(el("div", "tiny", "完成度 <b>" + c.pctDone + "%</b>（已走 " + c.moved + c.unit +
      "，全程 " + c.needTotal + c.unit + "）· 已过 <b>" + c.elapsedWeeks + "</b> 周"));

    /* 在轨判断 */
    var track;
    if (c.onTrack === null) track = "<div class='tiny'>还没有足够数据判断是否在轨。</div>";
    else if (c.onTrack) track = "<div class='okbox'>✅ <b>在轨</b> —— 预期此时 " + c.expectedNow + c.unit +
      "，你在 " + c.actualNow + c.unit + "（偏差 " + c.drift + "）</div>";
    else track = "<div class='warnbox2'>⚠ <b>偏离预期</b> —— 预期此时 " + c.expectedNow + c.unit +
      "，你在 " + c.actualNow + c.unit + "。差 " + Math.abs(c.drift) + c.unit + "，" +
      "按现在的速率会晚到；可以延长期限，或把缺口调紧一点。</div>";
    cd.appendChild(el("div", null, track));

    /* 每日执行数字 */
    cd.appendChild(el("div", "rollup", "每天吃 <b>" + c.kcal + " kcal</b>（缺口 " +
      (c.dailyGap > 0 ? "−" + c.dailyGap : "+" + (-c.dailyGap)) + "）· 蛋白 <b>" + c.protein +
      "g</b> · 碳水 " + c.carb + "g · 脂肪 " + c.fat + "g"));

    (c.warnings || []).forEach(function (w) { cd.appendChild(el("div", "warnbox2", "⚠ " + w)); });

    /* 里程碑 */
    var ms = el("details", "picker");
    ms.appendChild(el("summary", null, "按周预期（" + c.milestones.length + " 个节点）"));
    c.milestones.forEach(function (m) {
      var passed = c.elapsedWeeks >= m.week;
      ms.appendChild(el("div", "mstone", "<span>第 " + m.week + " 周" + (passed ? "（已过）" : "") +
        "</span><b>" + m.value + c.unit + "</b>"));
    });
    cd.appendChild(ms);

    /* 重设目标 */
    var re = el("button", "btn ghost", "调整目标 / 期限");
    re.onclick = function () { S.ST().goalDraft = { key: c.key, target: c.target, weeks: c.weeks }; S.save(); g.render(); };
    cd.appendChild(re);
    root.appendChild(cd);
  }

  g.GoalUI = { picker: picker, progressCard: progressCard };
})(window);
