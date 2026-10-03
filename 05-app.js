/* ═══════════════════════════════════════════════════════════════
   05-app.js · 主入口：导航 / 渲染 / 体测 / 设置 / 提醒 / 导入导出
   ═══════════════════════════════════════════════════════════════ */
(function (g) {
  "use strict";
  var S = g.Store, V = g.Derive, C = g.Charts, D = g.DATA;
  var $ = function (s) { return document.querySelector(s); };
  var el = g.U.el, esc = g.U.esc, card = g.U.card, grid = g.U.grid, kpi = g.U.kpi;

  g.toast = function (msg) {
    var t = $("#toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 1900);
  };

  var TABS = [
    ["home", "首页", "◎"], ["diet", "饮食", "🍚"], ["train", "训练", "🏋"],
    ["sup", "补剂", "💊"], ["report", "报表", "📊"]
  ];
  var SET = ["body", "set"];   // 次级页（从首页/设置进入）

  /* ═══════ 体测 ═══════ */
  function body(root) {
    var cur = V.latest(), tgt = V.targetWeight();
    var a = V.allReadings();
    var hasAny = a.length > 0;

    /* 第一次使用（没有任何记录）：不要显示一堆"安全默认值"冒充真实数据，
       直接说明该怎么开始。 */
    if (!hasAny) {
      var first = card("体测", "还没有记录");
      first.appendChild(el("div", "warnbox",
        "你还没有录入过体测数据。两种方式：<br>" +
        "① <b>手动填一个体重</b>：回到「首页」，在「体重」那一行填今天的数据，点「记下来」；<br>" +
        "② <b>粘贴秤 App 的报告</b>：用下面这个框，把报告文字贴进来 → 解析 → 核对 → 确认。"));
      root.appendChild(first);
    } else {
      var c = card("体测", a.length + " 次记录 · 最近 " + cur.date);
      c.appendChild(el("div", "kpis",
        kpi("体重", cur.weight_kg || "—", "kg") + kpi("体脂率", cur.bodyfat_pct !== null ? cur.bodyfat_pct : "—", "%") +
        kpi("去脂体重", cur.lean_kg || "—", "kg") + kpi("脂肪量", cur.fat_kg || "—", "kg") +
        kpi("BMI", cur.bmi_true || "—", "") + kpi("基代", cur.bmr_true || "—", "kcal")));
      c.appendChild(el("div", "tiny", "按当前去脂体重推算：<b>体脂 " + D.target.bodyfat_pct + "% 对应 " + tgt +
        " kg</b>（" + (cur.weight_kg - tgt > 0 ? "还差 " + V.f1(cur.weight_kg - tgt) + " kg" : "已达成") + "）"));
      root.appendChild(c);
    }

    /* 导入 */
    var im = card("导入新报告", "粘贴文字 → 自动解析 → 你确认");
    var ta = el("textarea"); ta.id = "imText";
    ta.placeholder = "体重 74.40 公斤\n体脂率 22.8 %\nBMI 23.7\n基础代谢 1634\n肌肉 54.6 公斤\n内脏脂肪 9\n皮下脂肪 15.2 %\n蛋白质 16.1 %\n骨骼肌率 43.2 %\n去脂体重 57.4 公斤\n水分 52.9 %\n骨量 2.9 公斤";
    im.appendChild(ta);
    var row = el("div", "row c2");
    var dIn = el("input"); dIn.type = "date"; dIn.value = S.todayStr();
    var tIn = el("input"); tIn.placeholder = "时间（可选）";
    var w1 = el("div", null, "<label class='f'>日期</label>"), w2 = el("div", null, "<label class='f'>时间</label>");
    w1.appendChild(dIn); w2.appendChild(tIn); row.appendChild(w1); row.appendChild(w2);
    im.appendChild(row);
    var pb = el("button", "btn primary", "解析并预览");
    pb.onclick = function () {
      var res = V.parseReport(ta.value);
      if (!res.matched) { g.toast("没解析出内容 —— 截图不行，要文字"); return; }
      preview(res.values, res.missing, dIn.value, tIn.value, res);
    };
    im.appendChild(pb);
    var demo = el("button", "btn ghost", "填入示例文本");
    demo.onclick = function () {
      ta.value = "体重 " + cur.weight_kg + " 公斤\n体脂率 " + cur.bodyfat_pct + " %\nBMI " + cur.bmi_true +
        "\n基础代谢 " + cur.bmr_true + "\n肌肉 " + (cur.muscle_kg || 54.6) + " 公斤\n内脏脂肪 " + (cur.visceral || 9) +
        "\n皮下脂肪 " + (cur.subcut_pct || 15.2) + " %\n蛋白质 " + (cur.protein_pct || 16.1) + " %\n骨骼肌率 " +
        (cur.skeletal_muscle_pct || 43.2) + " %\n去脂体重 " + cur.lean_kg + " 公斤\n水分 " + (cur.water_pct || 52.9) + " %\n骨量 2.9 公斤";
    };
    im.appendChild(demo);
    im.appendChild(el("div", null, "<div id='imPrev' style='margin-top:10px'></div>"));
    root.appendChild(im);

    /* 历史 */
    var h = card("历史记录");
    var t = el("table");
    t.innerHTML = "<thead><tr><th>日期</th><th>体重</th><th>体脂</th><th>去脂</th><th>来源</th><th></th></tr></thead>";
    var tb = el("tbody");
    a.slice().reverse().forEach(function (r) {
      var tr = el("tr");
      tr.innerHTML = "<td>" + r.date.slice(5) + "</td><td>" + (r.weight_kg || "—") + "</td><td>" +
        (r.bodyfat_pct !== null ? r.bodyfat_pct : "—") + "</td><td>" + (r.lean_kg || "—") + "</td><td class='tiny'>" +
        (r.source || "—") + "</td><td>" + (r.source === "导入" ? "<button class='btn' data-delrd='" + r.date +
        "' style='padding:3px 8px;width:auto'>删</button>" : "") + "</td>";
      tb.appendChild(tr);
    });
    t.appendChild(tb); h.appendChild(t);
    root.appendChild(h);

    /* 趋势 */
    var tc = card("趋势");
    var tcv = el("canvas", "linecv"); tcv.width = 640; tcv.height = 220;
    tc.appendChild(tcv);
    tc.appendChild(el("div", "tiny", "去脂体重是最该守住的一条线；它下降 = 在减肌肉。"));
    root.appendChild(tc);
    setTimeout(function () {
      g.FX.lineAnimated(tcv, a.map(function (r) { return { d: r.date, v: r.lean_kg }; }),
        { goal: cur.lean_kg, unit: "", minPad: 0.4 });
    }, 0);
  }

  function preview(vals, missing, date, time, meta) {
    var rec = Object.assign({}, vals, { date: date, time: time });
    var cur = V.derive(rec), pv = V.prevOf(date);
    var al = V.alerts(cur, pv);
    var html = "<h4>解析结果（命中 " + (meta ? meta.matched + "/" + meta.total : "") + "）</h4>";
    if (missing && missing.length) html += "<div class='warnbox'>缺少必需项：<b>" + missing.join("、") + "</b></div>";
    html += "<div class='kpis'>" + kpi("体重", cur.weight_kg, "kg") + kpi("体脂率", cur.bodyfat_pct, "%") +
      kpi("去脂体重", cur.lean_kg, "kg") + kpi("脂肪量", cur.fat_kg, "kg") + kpi("BMI", cur.bmi_true, "") +
      kpi("基代", cur.bmr_true, "kcal") + "</div>";
    if (pv) html += "<div class='tiny'>与上次（" + pv.date + "，" + S.daysBetween(pv.date, date) + " 天前）比：" +
      "体重 " + V.sgn(cur.weight_kg - pv.weight_kg) + " kg、体脂 " + V.sgn(cur.bodyfat_pct - pv.bodyfat_pct) +
      " 点、去脂体重 " + V.sgn(cur.lean_kg - pv.lean_kg) + " kg</div>";
    html += al.length ? al.map(function (x) {
      return "<div class='" + (x[0] === "danger" ? "dangerbox" : x[0] === "ok" ? "okbox" : "warnbox") + "' style='margin-top:6px'>" + x[1] + "</div>";
    }).join("") : "<div class='tiny'>没有触发告警。</div>";
    html += "<div class='warnbox' style='margin-top:8px'><b>请核对体重与体脂率是否与秤上一致。</b>" +
      "<div class='tiny'>这一步不能省：本机 OCR 实测曾把 74.40 kg 误读成 57.4 kg。核一眼 2 秒。</div></div>" +
      "<button class='btn primary' id='imSave' style='margin-top:8px'>确认无误，存入历史</button>";
    $("#imPrev").innerHTML = html;
    $("#imSave").onclick = function () {
      S.ST().readings = S.ST().readings || {};
      if (S.ST().readings[date] && !confirm(date + " 已有记录，覆盖吗？")) return;
      S.ST().readings[date] = Object.assign({}, rec, { source: "导入" });
      S.save(); g.toast("已存入 " + date); g.render();
    };
  }

  /* ═══════ 设置 ═══════ */
  function setView(root) {
    var c = card("设置", "数据只存本机，不联网、不上传");
    root.appendChild(c);

    /* 备份提醒：localStorage 会被"清除站点数据/隐私模式/系统清理"抹掉，
       实测中确实发生过。数据越多，越不能只靠一份本地存储。 */
    var st = S.ST();
    var logDays = Object.keys(st.logs || {}).length;
    var lastExport = st.lastExportAt ? new Date(st.lastExportAt) : null;
    var daysSince = lastExport ? Math.floor((Date.now() - lastExport.getTime()) / 86400000) : null;
    if (logDays >= 3 && (daysSince === null || daysSince >= 14)) {
      var warn = card("建议现在备份", daysSince === null ? "你还没导出过" : "距上次导出 " + daysSince + " 天");
      warn.appendChild(el("div", "warnbox",
        "你已经记了 <b>" + logDays + " 天</b>的数据。这些只存在这台手机/浏览器的本地存储里，" +
        "一旦「清除站点数据」或换地址就会丢。<br><b>花 10 秒导出一次：</b>下面点「导出备份」，" +
        "把内容存到微信文件传输助手或网盘。"));
      root.appendChild(warn);
    }

    /* 体测 / 每日打卡入口 */
    var en = card("记录入口");
    var b1 = el("button", "btn", "体测与趋势（" + V.allReadings().length + " 次记录）");
    b1.onclick = function () { S.ST().tab = "body"; S.save(); g.render(); };
    en.appendChild(b1);
    root.appendChild(en);

    /* 提醒 */
    var r = card("每日提醒");
    var row = el("div", "row c2");
    var oW = el("div", null, "<label class='f'>开关</label>");
    var sel = el("select");
    sel.innerHTML = "<option value='0'>关闭</option><option value='1'>开启</option>";
    sel.value = S.ST().reminder.on ? "1" : "0";
    oW.appendChild(sel);
    var tW = el("div", null, "<label class='f'>提醒时间</label>");
    var tin = el("input"); tin.type = "time"; tin.value = S.ST().reminder.time || "21:00";
    tW.appendChild(tin);
    row.appendChild(oW); row.appendChild(tW); r.appendChild(row);
    var sb = el("button", "btn primary", "保存提醒设置");
    sb.onclick = function () { setReminder(sel.value === "1", tin.value); };
    r.appendChild(sb);
    r.appendChild(el("div", "tiny", "如果手机浏览器不支持定时通知，就用系统「日历 / 备忘录」设一个每天 " +
      (S.ST().reminder.time || "21:00") + " 的重复提醒 —— 这在任何手机上 100% 可靠。"));
    root.appendChild(r);

    /* 数据 */
    var d = card("数据");
    d.appendChild(el("div", "tiny", "打卡 " + Object.keys(S.ST().logs).length + " 天 · 体测导入 " +
      Object.keys(S.ST().readings).length + " 次 · 主项 " + (S.ST().lifts || []).length + " 条"));
    var eb = el("button", "btn", "导出备份（复制 / 分享）");
    eb.onclick = exportData; d.appendChild(eb);
    var ib = el("button", "btn ghost", "从剪贴板导入");
    ib.onclick = importData; d.appendChild(ib);
    var cb = el("button", "btn ghost", "清空全部数据");
    cb.onclick = function () { if (confirm("清空全部记录？不可撤销。")) { S.reset(); g.toast("已清空"); g.render(); } };
    d.appendChild(cb);
    root.appendChild(d);

    var ab = card("关于");
    ab.appendChild(el("div", "tiny", "版本 2.0 · 数据引擎 body_data.py（自检 " +
      ((D.summary || {}).check_count || "?") + " 条全 PASS）<br>" +
      "体脂秤为生物电阻抗法，绝对值误差 ±3–5 个点，固定条件测、只看趋势。<br>" +
      "本 App 提供通用减脂建议，不能替代医生或注册营养师的个体化诊疗。"));
    root.appendChild(ab);
  }

  function setReminder(on, time) {
    S.ST().reminder = { on: on, time: time }; S.save();
    var LN = g.Capacitor && g.Capacitor.Plugins && g.Capacitor.Plugins.LocalNotifications;
    if (!LN) { g.toast("已保存（浏览器不支持系统通知，装成 App 才会真响）"); return; }
    LN.cancel({ notifications: [{ id: 1 }] }).catch(function () { }).then(function () {
      if (!on) { g.toast("已关闭"); return; }
      LN.requestPermissions().then(function (p) {
        if (p.display !== "granted") { g.toast("通知权限被拒绝"); return; }
        var hm = (time || "21:00").split(":");
        LN.schedule({ notifications: [{ id: 1, title: "今天的记录还没打",
          body: "30 秒：体重 / 训练 / 蛋白 / 补剂。", smallIcon: "ic_stat_icon",
          schedule: { on: { hour: +hm[0], minute: +hm[1] }, allowWhileIdle: true } }] })
          .then(function () { g.toast("已设置每天 " + time + " 提醒"); })
          .catch(function (e) { g.toast("失败：" + e.message); });
      });
    });
  }
  function exportData() {
    var txt = JSON.stringify(S.exportObj(), null, 1);
    S.ST().lastExportAt = new Date().toISOString(); S.save();
    var SH = g.Capacitor && g.Capacitor.Plugins && g.Capacitor.Plugins.Share;
    if (SH) SH.share({ title: "体成分记录备份", text: txt, dialogTitle: "导出" }).catch(function () { fallbackCopy(txt); });
    else fallbackCopy(txt);
  }
  function fallbackCopy(txt) {
    if (navigator.clipboard) navigator.clipboard.writeText(txt)
      .then(function () { g.toast("已复制（" + txt.length + " 字符）"); }, function () { prompt("复制保存：", txt); });
    else prompt("复制保存：", txt);
  }
  function importData() {
    var s = prompt("粘贴导出的 JSON：");
    if (!s) return;
    try { S.importObj(JSON.parse(s)); g.toast("导入成功"); g.render(); }
    catch (e) { g.toast("解析失败：" + e.message); }
  }

  /* ═══════ 渲染 ═══════ */
  function render() {
    var app = $("#app"); app.innerHTML = "";
    var tab = S.ST().tab || "home";
    var R = g.Views;
    g.FX.topProgress(true);
    if (tab === "home") R.home(app);
    else if (tab === "diet") R.diet(app);
    else if (tab === "train") R.train(app);
    else if (tab === "sup") R.sup(app);
    else if (tab === "report") R.report(app);
    else if (tab === "body") body(app);
    else setView(app);

    var nav = $("#nav"); nav.innerHTML = "";
    TABS.forEach(function (t) {
      var b = el("button", null, "<span class='em'>" + t[2] + "</span>" + t[1]);
      b.setAttribute("aria-selected", (tab === t[0] || (t[0] === "home" && SET.indexOf(tab) >= 0)) ? "true" : "false");
      b.onclick = function () { g.FX.haptic("light"); S.ST().tab = t[0]; S.save(); render(); window.scrollTo(0, 0); };
      nav.appendChild(b);
    });
    var sb = el("button", null, "<span class='em'>⚙️</span>设置");
    sb.setAttribute("aria-selected", tab === "set" ? "true" : "false");
    sb.onclick = function () { g.FX.haptic("light"); S.ST().tab = "set"; S.save(); render(); window.scrollTo(0, 0); };
    nav.appendChild(sb);

    g.FX.fadeIn(app);
    g.FX.topProgress(false);
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-delrd]");
    if (b) {
      if (confirm("删除 " + b.dataset.delrd + " 的导入记录？")) {
        delete S.ST().readings[b.dataset.delrd]; S.save(); render();
      }
    }
  });

  S.load();
  if (S.ST().firstRun) { S.ST().firstRun = false; S.save(); }
  g.FX.installRipple();
  window.addEventListener("resize", function () {
    if (S.ST().tab === "report" || S.ST().tab === "home") render();
  });
  render();
  g.render = render;
  window.__appReady = true;
})(window);
