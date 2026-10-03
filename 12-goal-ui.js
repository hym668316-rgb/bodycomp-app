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


  /* ── 进度卡（有目标时显示在首页）── */
  function progressCard(root) {
    var el = U().el, card = U().card;
    /* 重组方案必须走 recComp —— 它吃维持热量，与 compute() 按体脂目标反推缺口
       是两套算法。早先这里统一用 compute()，导致按钮显示 2588、进度卡显示 2442
       （同一个方案两个数，实测抓到）。 */
    var g0 = GL.goal();
    var isRecomp = !!(g0 && g0.kind === 'recomp');
    var c = isRecomp ? GL.recComp(g0.tier, g0.weeks) : GL.compute();
    if (!c) return;
    if (isRecomp && c.ok) {
      /* recComp 的返回结构与 compute 不同，转成进度卡需要的字段 */
      c = {
        ok: true, key: 'bodyfat_pct', label: '体脂率（重组）', dir: 'down',
        start: c.bfStart, target: c.bfEnd, need: +(c.bfStart - c.bfEnd).toFixed(1),
        needTotal: +(c.bfStart - c.bfEnd).toFixed(1),
        unit: '%', perUnit: '%/周', weeks: c.weeks,
        perWeek: +((c.bfStart - c.bfEnd) / c.weeks).toFixed(2),
        kcal: c.kcal, maint: c.maint, dailyGap: -c.deficit,
        protein: c.protein, fat: c.fat, carb: c.carb,
        startDate: (g0.startDate || S.todayStr()),
        milestones: [], warnings: c.warnings, notes: c.notes,
        /* 重组看体脂与去脂体重的双向变化 */
        actualNow: c.bfStart, expectedNow: c.bfStart, drift: 0, onTrack: true,
        moved: 0, pctDone: 0, elapsedWeeks: 0,
        isRecomp: true, recomp: c,
        leanStart: c.leanStart, leanEnd: c.leanEnd, dMuscle: c.dMuscle, dFat: c.dFat,
        potential: c.potential, wtStart: c.wtStart, wtEnd: c.wtEnd
      };
      var elx = U().el, cdx = U().card;
      var rc = cdx('我的目标（减脂的同时增肌）',
        c.recomp.name + ' · ' + c.weeks + ' 周 · ' + (g0.startDate || '') + ' 起');
      rc.appendChild(elx('div', 'goalhero',
        '<span class=\'gv\'>' + c.recomp.bfStart + '</span><span class=\'gu\'>% 体脂</span>' +
        '<span class=\'gu\'>↓ 预期 <b>' + c.recomp.bfEnd + '%</b></span>'));
      rc.appendChild(elx('div', 'okbox',
        '预期同时发生：<b>肌肉 +' + c.recomp.dMuscle + ' kg</b>（' + c.recomp.leanStart + ' → ' +
        c.recomp.leanEnd + ' kg 去脂体重），<b>脂肪 −' + c.recomp.dFat + ' kg</b>，' +
        '体重 ' + c.recomp.wtStart + ' → ' + c.recomp.wtEnd + ' kg'));
      rc.appendChild(elx('div', 'whybox',
        '⚠ <b>别看秤</b> —— 重组期体重几乎不动是正常的（脂肪掉、肌肉涨互相抵消）。' +
        '要看的三个指标：<b>体脂率、腰围、主项重量</b>。'));
      rc.appendChild(elx('div', 'rollup', '每天吃 <b>' + c.kcal + ' kcal</b>（' +
        (c.maint === c.kcal ? '维持热量，不亏不盈' : '赤字 ' + c.recomp.deficit + ' kcal') +
        '）· 蛋白 <b>' + c.protein + 'g</b> · 碳水 ' + c.carb + 'g · 脂肪 ' + c.fat + 'g'));
      rc.appendChild(elx('div', 'tiny', '潜力评级：<b>[' + c.recomp.potential.level + ']</b> —— ' +
        esc(c.recomp.potential.why)));
      (c.warnings || []).forEach(function (w) { rc.appendChild(elx('div', 'warnbox2', '⚠ ' + w)); });
      (c.notes || []).forEach(function (w) { rc.appendChild(elx('div', 'tiny', '· ' + esc(w))); });
      var rl2 = elx('details', 'picker');
      rl2.appendChild(elx('summary', null, '换档位 / 换时长'));
      var rw = elx('div', 'timerow');
      ['steady', 'aggressive'].forEach(function (tk) {
        GL.recOptions(tk).forEach(function (o) {
          if (!o.calc || !o.calc.ok) return;
          var b = elx('button', 'timebtn' + (o.calc.tierKey === c.recomp.tierKey && o.weeks === c.weeks ? ' on' : ''),
            '<b>' + o.weeks + ' 周</b><span class=\'tb-num\'>' +
            (tk === 'aggressive' ? '激进' : '稳健') + '</span>' +
            '<span class=\'tb-num\'>肌肉 +' + o.calc.dMuscle + 'kg</span>');
          b.onclick = function () { GL.applyRecomp(tk, o.weeks); toast('已切换'); g.render(); };
          rw.appendChild(b);
        });
      });
      rl2.appendChild(rw);
      rc.appendChild(rl2);
      var cl2 = elx('button', 'btn ghost', '清除目标（回退到固定路线）');
      cl2.onclick = function () { GL.clearGoal(); toast('已清除目标'); g.render(); };
      rc.appendChild(cl2);
      root.appendChild(rc);
      return;
    }
    var cd = card("我的目标", c.label + " · " + c.startDate + " 起 · 共 " + c.weeks + " 周");

    if (!c.ok) { cd.appendChild(el("div", "warnbox2", esc(c.message))); root.appendChild(cd); return; }

    var di = c.dir === "down" ? "↓" : "↑";
    cd.appendChild(el("div", "goalhero",
      "<span class='gv'>" + c.actualNow + "</span><span class='gu'>" + c.unit + "</span>" +
      "<span class='gu'>" + di + " 目标 <b>" + c.target + c.unit + "</b></span>"));

    /* 进度条 */
    cd.appendChild(el("div", "goalbar", "<i style='width:" + c.pctDone + "%'></i>"));
    var movedTxt = (c.elapsedWeeks < 0.5 && c.moved === 0)
      ? "刚开始，还没产生变化"
      : ("已走 <b>" + c.moved + c.unit + "</b> / 全程 " + c.needTotal + c.unit);
    cd.appendChild(el("div", "tiny", "完成度 <b>" + c.pctDone + "%</b>（" + movedTxt +
      "）· 已过 <b>" + (Math.round(c.elapsedWeeks * 10) / 10) + "</b> 周"));

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

  /* ══════════════════════════════════════════════════════════════
     「减脂的同时增肌」选择器 —— 两档卡片平铺，每档下面 3 个时长按钮
     ══════════════════════════════════════════════════════════════ */
  function recompPicker(root) {
    var el = U().el, card = U().card;
    var c = card("减脂的同时增肌（身体重组）", "两档 · 每档 3 种时长 —— 点一下就直接用");

    var cur = GL.recComp("steady", 14);
    if (!cur || !cur.ok) {
      c.appendChild(el("div", "warnbox2", esc(cur ? cur.message : "算不出来")));
      root.appendChild(c); return;
    }
    c.appendChild(el("div", "whybox",
      "这个方案的特点：<b>体重几乎不变，但体脂在掉、肌肉在涨</b>。" +
      "所以别看秤 —— 看体脂率、腰围和主项重量。蛋白要求比普通减脂更高（2.2 g/kg 去脂体重），" +
      "而且<b>必须力量训练且逐周加重</b>，否则不会发生重组，只会变成普通减脂。"));

    ["steady", "aggressive"].forEach(function (tierKey) {
      var T = (tierKey === "aggressive") ? GL.RECOMP.aggressive : GL.RECOMP.steady;
      var opts = GL.recOptions(tierKey);
      var box = el("div", "tierbox" + (tierKey === "aggressive" ? " agg" : ""));
      box.appendChild(el("div", "tierhead",
        "<b>" + esc(T.name) + "</b>" +
        (T.tag ? " <span class='pill accent'>" + esc(T.tag) + "</span>" : "")));
      box.appendChild(el("div", "tiny", "<b>谁适合：</b>" + esc(T.who)));
      box.appendChild(el("div", "tiny", "<b>吃饭方式：</b>" + esc(T.mealNote)));
      box.appendChild(el("div", "tiny cost", "<b>代价：</b>" + esc(T.cost)));

      var row = el("div", "timerow");
      opts.forEach(function (o) {
        var cc = o.calc;
        if (!cc || !cc.ok) return;
        var b = el("button", "timebtn",
          "<b>" + o.weeks + " 周</b>" +
          "<span class='tb-num'>体脂 " + cc.bfStart + "→" + cc.bfEnd + "%</span>" +
          "<span class='tb-num'>肌肉 +" + cc.dMuscle + "kg</span>" +
          "<span class='tb-num'>吃 " + cc.kcal + " kcal</span>");
        b.onclick = function () {
          var r = GL.applyRecomp(tierKey, o.weeks);
          if (!r || !r.ok) { toast(r ? r.message : "设定失败"); return; }
          toast("已选：" + T.name + " · " + o.weeks + " 周");
          S.ST().tab = "home"; g.render();
        };
        row.appendChild(b);
      });
      box.appendChild(row);
      c.appendChild(box);
    });

    var pot = cur.potential;
    c.appendChild(el("div", pot.level === "低" ? "warnbox2" : "okbox",
      "<b>你的重组潜力：[" + esc(pot.level) + "]</b> —— " + esc(pot.why)));
    if (pot.level === "低") {
      c.appendChild(el("div", "tiny",
        "建议改用「先增肌再减脂」：体脂已低时，先把肌肉与训练基础拉起来，再减脂会更容易。"));
    }
    c.appendChild(el("div", "tiny",
      "判断有没有效果的三个信号：<b>体重几乎不变、体脂率在降、主项重量在涨</b>。三个都满足就是成了。"));
    root.appendChild(c);
  }

  /* ── 单独目标设定器（体脂率 / 体重 / 肌肉量，含稳健·激进两档）── */
  function singlePicker(root) {
    var el = U().el, card = U().card;
    var st = S.ST();
    var draft = st.goalDraft || { key: "bodyfat_pct", target: null, weeks: 14, tier: "steady" };
    var has = GL.hasGoal() && (!st.goal || st.goal.kind !== "recomp");

    var c = card(has ? "调整目标" : "设定一个单独目标", "体脂率 / 体重 / 肌肉量 —— 选一个主目标");

    var gp = el("div", "goalpick");
    GL.GOALS.forEach(function (o) {
      var cv = GL.currentValue(o.key);
      var b = el("button", "goalopt" + (draft.key === o.key ? " on" : ""),
        "<b>" + esc(o.label) + "</b>" +
        "<span class='tiny'>当前 " + (cv === null || cv === undefined ? "—" : cv + o.unit) + "</span>" +
        "<span class='tiny'>" + esc(o.desc) + "</span>");
      b.onclick = function () {
        var sg = GL.suggest(o.key);
        S.ST().goalDraft = { key: o.key, target: sg.target, weeks: sg.weeks, tier: draft.tier || "steady" };
        S.save(); g.render();
      };
      gp.appendChild(b);
    });
    c.appendChild(gp);

    var meta = GL.metaOf(draft.key) || GL.GOALS[0];
    var cv2 = GL.currentValue(draft.key);
    if (cv2 === null || cv2 === undefined) {
      c.appendChild(el("div", "warnbox2",
        "还没有「" + esc(meta.label) + "」的读数 —— 先在首页记一次体重，或到「设置 → 体测与趋势」粘贴体脂秤报告。"));
      root.appendChild(c); return;
    }

    var sg2 = GL.suggest(draft.key);
    var tgt = (draft.target === null || draft.target === undefined) ? sg2.target : draft.target;
    var wks = draft.weeks || sg2.weeks;

    var r1 = el("div", "numrow");
    r1.appendChild(el("label", null, "目标" + meta.label));
    var ti = el("input"); ti.type = "number"; ti.id = "goalTarget";
    ti.value = String(tgt); ti.step = String(meta.step);
    ti.min = String(meta.range[0]); ti.max = String(meta.range[1]); ti.inputMode = "decimal";
    r1.appendChild(ti); r1.appendChild(el("span", "uu", meta.unit));
    c.appendChild(r1);

    c.appendChild(el("div", "tiny", "<b>档位</b> —— 两档不是快慢之分，是代价不同"));
    var tseg = el("div", "seg");
    ["steady", "aggressive"].forEach(function (t) {
      var s = GL.safeOf(draft.key, t);
      var b = el("button", "seg-b" + (draft.tier === t ? " on" : ""), s.label + "档");
      b.onclick = function () { draft.tier = t; S.ST().goalDraft = draft; S.save(); g.render(); };
      tseg.appendChild(b);
    });
    c.appendChild(tseg);
    var cs = GL.safeOf(draft.key, draft.tier);
    c.appendChild(el("div", "tiny", "上限 <b>" + cs.max + " " + cs.unit + "</b> —— " + esc(cs.cost)));

    var optRow = el("div", "timerow");
    [[8, "短周期"], [14, "中周期"], [20, "长周期"]].forEach(function (p) {
      var b = el("button", "timebtn" + (wks === p[0] ? " on" : ""),
        "<b>" + p[0] + " 周</b><span class='tb-num'>" + p[1] + "</span>");
      b.onclick = function () { draft.weeks = p[0]; S.ST().goalDraft = draft; S.save(); g.render(); };
      optRow.appendChild(b);
    });
    c.appendChild(optRow);

    var r2 = el("div", "numrow");
    r2.appendChild(el("label", null, "或自定义"));
    var wi = el("input"); wi.type = "number"; wi.id = "goalWeeks";
    wi.value = String(wks); wi.step = "1"; wi.min = "1"; wi.max = "104"; wi.inputMode = "numeric";
    r2.appendChild(wi); r2.appendChild(el("span", "uu", "周"));
    c.appendChild(r2);

    var pv = el("div"); pv.id = "goalPreview";
    c.appendChild(pv);
    function refresh() {
      var t = parseFloat(ti.value), w = parseInt(wi.value, 10);
      if (!isFinite(t) || !isFinite(w) || w < 1) { pv.innerHTML = "<div class='tiny'>填一个目标值与期限。</div>"; return; }
      var res = GL.compute({ key: draft.key, target: t, weeks: w, tier: draft.tier,
                             startValue: cv2, startDate: S.todayStr() });
      if (!res || !res.ok) { pv.innerHTML = "<div class='tiny'>" + esc(res ? res.message : "算不出来") + "</div>"; return; }
      var h = "";
      h += "<div class='okbox'><b>" + esc(res.label) + " " + res.start + " → " + res.target + res.unit + "</b>" +
           "，需改 " + res.need + res.unit + "，<b>" + res.weeks + " 周</b>（" + esc(res.tierLabel) + "档），" +
           "速率 <b>" + res.perWeek + " " + res.perUnit + "</b></div>";
      h += "<div class='mstone'><span>每天摄入</span><b>" + res.kcal + " kcal</b></div>";
      h += "<div class='mstone'><span>缺口</span><b>" + (res.dailyGap > 0 ? "−" + res.dailyGap : "+" + (-res.dailyGap)) + " kcal / 天</b></div>";
      h += "<div class='mstone'><span>蛋白 / 脂肪 / 碳水</span><b>" + res.protein + " / " + res.fat + " / " + res.carb + " g</b></div>";
      (res.warnings || []).forEach(function (w) { h += "<div class='warnbox2'>⚠ " + w + "</div>"; });
      res.milestones.forEach(function (m) {
        h += "<div class='mstone'><span>第 " + m.week + " 周</span><b>" + m.value + res.unit + "</b></div>";
      });
      pv.innerHTML = h;
      draft.target = t; draft.weeks = w;
    }
    ti.oninput = refresh; wi.oninput = refresh;
    setTimeout(refresh, 0);

    var save = el("button", "btn primary", has ? "更新目标" : "就用这个目标");
    save.onclick = function () {
      var t = parseFloat(ti.value), w = parseInt(wi.value, 10);
      if (!isFinite(t)) { toast("目标值填一下"); return; }
      if (!isFinite(w) || w < 1) { toast("期限填一下（周）"); return; }
      GL.setGoal(draft.key, t, w, null, draft.tier, "single_" + draft.tier);
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
    root.appendChild(c);
  }

  /* ── 入口：先选方向，再看档位与时长 ── */
  function entry(root) {
    var el = U().el, card = U().card;
    var st = S.ST();
    var mode = st.goalMode || null;

    var c = card("设定你的目标", "先选方向，再选档位与时长");
    var mb = el("div", "goalpick");
    var o1 = el("button", "goalopt" + (mode === "single" ? " on" : ""),
      "<b>单独目标</b><span class='tiny'>体脂率 / 体重 / 肌肉量 三选一</span>" +
      "<span class='tiny'>适合目标明确、只追一个指标</span>");
    o1.onclick = function () { S.ST().goalMode = "single"; S.save(); g.render(); };
    var o2 = el("button", "goalopt" + (mode === "recomp" ? " on" : ""),
      "<b>减脂的同时增肌</b><span class='tiny'>身体重组 · 稳健 / 激进两档</span>" +
      "<span class='tiny'>体重几乎不变，但体脂掉、肌肉涨</span>");
    o2.onclick = function () { S.ST().goalMode = "recomp"; S.save(); g.render(); };
    mb.appendChild(o1); mb.appendChild(o2);
    c.appendChild(mb);
    root.appendChild(c);

    if (mode === "single") singlePicker(root);
    else if (mode === "recomp") recompPicker(root);
  }

  g.GoalUI = { entry: entry, picker: entry, singlePicker: singlePicker,
               recompPicker: recompPicker, progressCard: progressCard };
})(window);
