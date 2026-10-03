/* ═══════════════════════════════════════════════════════════════
   04-views.js · 视图层
   home 首页 / diet 饮食 / train 训练 / sup 补剂 / report 报表 / body 体测 / set 设置
   ═══════════════════════════════════════════════════════════════ */
(function (g) {
  "use strict";
  var S = g.Store, V = g.Derive, C = g.Charts, D = g.DATA;

  function $(s) { return document.querySelector(s); }
  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h !== undefined) e.innerHTML = h; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]; }); }
  function toast(m) { g.toast(m); }

  /* ─────────── 通用组件 ─────────── */
  function card(title, sub) {
    var c = el("div", "card");
    if (title) c.appendChild(el("div", "card-h", "<h3>" + title + "</h3>" + (sub ? "<span class='tiny'>" + sub + "</span>" : "")));
    return c;
  }
  function tapRow(label, on, onTap, sub) {
    var b = el("button", "tap" + (on ? " on" : ""));
    b.innerHTML = "<span class='tap-k'>" + (on ? "✓ " : "") + esc(label) + "</span>" +
      (sub ? "<span class='tap-sub'>" + esc(sub) + "</span>" : "");
    b.onclick = onTap;
    return b;
  }
  function grid(children, n) {
    var d = el("div", "grid" + (n ? " g" + n : ""));
    children.forEach(function (x) { d.appendChild(x); });
    return d;
  }

  /* ═══════════ 首页 ═══════════ */
  var SEC_ICON = { diet: "🍚", train: "🏋", sup: "💊", body: "⚖️", habit: "🌙" };
  var SEC_COLOR = { diet: "#0B7A6C", train: "#2F6BFF", sup: "#8A5A0B", body: "#7A3E9D", habit: "#1F7A5C" };

  function home(root) {
    var today = S.todayStr(), sc = S.dayScore(today), d = S.day(today);
    var lr = V.latest(), nut = V.nutrition(), plan = V.currentPlan();
    var FX = g.FX;

    /* 全新使用（没有任何体测记录 / 清空过）→ 说明一句，避免用户以为坏了。
       latest() 现在返回安全空档案，所以下面照常渲染。 */
    if (!V.hasReadings()) {
      var fresh = el("div", "card");
      fresh.appendChild(el("div", "warnbox",
        "<b>还没有体测记录</b> —— 下面「体重」那一行填一次今天的体重，或者去「设置 → 体测与趋势」" +
        "粘贴秤 App 的报告文字。填了之后，BMI / 基础代谢 / 缺口都会自动算出来。"));
      root.appendChild(fresh);
    }

    /* ── 目标：有目标显示进度；有体测数据但还没设目标 → 出现可选项 ──
       用户要求「第一次给出身体数据后出现可选项」，所以门槛是 hasReadings()。 */
    var GUI = g.GoalUI, GL = g.Goal;
    if (GUI && GL) {
      if (GL.hasGoal()) {
        GUI.progressCard(root);
      } else if (V.hasReadings()) {
        GUI.picker(root);
      }
    }

    /* ── 主视觉：今日完成度大环 ── */
    var hero = el("div", "hero");
    var heroL = el("div", "hero-l");
    var bigCv = el("canvas", "bigring"); bigCv.width = 220; bigCv.height = 220;
    heroL.appendChild(bigCv);
    var heroR = el("div", "hero-r");
    heroR.appendChild(el("div", "hero-date", today.slice(5) + " · " + ["周日","周一","周二","周三","周四","周五","周六"][new Date(today + "T00:00:00").getDay()]));
    heroR.appendChild(el("div", "hero-title", "今日完成度"));
    var big = el("div", "hero-big", "0%");
    heroR.appendChild(big);
    heroR.appendChild(el("div", "hero-sub", "已记 " + sc.done + " / " + sc.total + " 项 · 连续 <b>" + S.streak() + "</b> 天"));
    heroR.appendChild(el("div", "hero-chip",
      "<span class='chip'>" + plan.id + " · " + esc(plan.title) + "</span>" +
      "<span class='chip'>" + nut.kcal + " kcal</span>" +
      "<span class='chip'>蛋白 " + nut.protein + "g</span>"));
    hero.appendChild(heroL); hero.appendChild(heroR);
    root.appendChild(hero);
    setTimeout(function () {
      FX.ringAnimated(bigCv, sc.pct, "", "", "#FFFFFF", 900, { lw: 11, fill: "rgba(255,255,255,.16)", track: "rgba(255,255,255,.30)" });
      FX.countUp(big, sc.pct, 900, "%");
    }, 0);

    /* ── 分区环 ── */
    var secs = el("div", "seccards");
    sc.sections.forEach(function (s) {
      var b = el("div", "seccard");
      var cv = el("canvas", "secring"); cv.width = 92; cv.height = 92;
      b.appendChild(cv);
      b.appendChild(el("div", "sec-ic", SEC_ICON[s.key] || "•"));
      b.appendChild(el("div", "sec-lb", s.label));
      b.appendChild(el("div", "sec-sub", s.done + "/" + s.total +
        (s.weeklyTotal ? " · 周" + (s.weeklyDone || 0) + "/" + s.weeklyTotal : "")));
      b.onclick = function () {
        FX.haptic("light");
        S.ST().tab = { diet: "diet", train: "train", sup: "sup", body: "body", habit: "home" }[s.key] || "home";
        S.save(); g.render();
      };
      secs.appendChild(b);
      setTimeout(function () { FX.ringAnimated(cv, s.pct, "", "", SEC_COLOR[s.key], 800, { lw: 7, track: "#E9F0F2" }); }, 60);
    });
    root.appendChild(secs);

    /* ── 一键打卡 ── */
    var quick = card("一键打卡", "点一下即记录");
    quick.appendChild(grid([
      tapRow("蛋白达标", d.protein === "1", function () { S.toggle(today, "protein"); g.render(); }),
      tapRow("吃了早饭", d.breakfast === "1", function () { S.toggle(today, "breakfast"); g.render(); }),
      tapRow("饮水 ≥2.5L", d.water === "1", function () { S.toggle(today, "water"); g.render(); }),
      tapRow("睡够 7 小时", d.sleep === "1", function () { S.toggle(today, "sleep"); g.render(); })
    ], 2));

    /* 体重：首页直接记。
       原来只能在「设置 → 体测」里记体重，导致今日完成度在首页永远到不了 100%
       —— 与「手机端极简打卡（含体重）」的目标冲突。 */
    quick.appendChild(el("div", "sect-sep", "体重"));
    var prevW = 0;
    Object.keys(S.ST().logs || {}).sort().reverse().some(function (k) {
      var v = parseFloat((S.ST().logs[k] || {}).w);
      if (!isNaN(v)) { prevW = v; return true; }
      return false;
    });
    if (!prevW) { var lr0 = V.latest(); prevW = (lr0 && lr0.weight_kg) || 0; }
    var curW = parseFloat(d.w);
    var startW = !isNaN(curW) ? curW : prevW;
    var wRow = el("div", "wrow");
    var wIn = el("input", "winput");
    wIn.type = "number"; wIn.step = "0.1"; wIn.inputMode = "decimal";
    wIn.value = startW ? startW.toFixed(1) : "";
    wIn.placeholder = "kg";
    function bump(delta) {
      var v = parseFloat(wIn.value) || startW || 70;
      v = Math.max(30, Math.min(250, +(v + delta).toFixed(1)));
      wIn.value = v.toFixed(1);
    }
    var wMinus = el("button", "wbtn", "−0.1");
    var wPlus = el("button", "wbtn", "+0.1");
    wMinus.onclick = function () { bump(-0.1); };
    wPlus.onclick = function () { bump(0.1); };
    var wSave = el("button", "wbtn save", "记下来");
    wSave.onclick = function () {
      var v = parseFloat(wIn.value);
      if (!v || v < 30 || v > 250) { toast("体重看着不对（应在 30–250 kg）"); return; }
      S.setDay(today, { w: +v.toFixed(1) });
      toast("已记 " + v.toFixed(1) + " kg");
      g.render();
    };
    wRow.appendChild(wMinus); wRow.appendChild(wIn); wRow.appendChild(wPlus); wRow.appendChild(wSave);
    quick.appendChild(wRow);
    quick.appendChild(el("div", "tiny", !isNaN(curW)
      ? "今天已记 <b>" + curW.toFixed(1) + " kg</b>" +
        (prevW ? "（上次 " + prevW.toFixed(1) + " kg，" + V.sgn(curW - prevW) + " kg）" : "") +
        " · 改完再点一次「记下来」"
      : "晨起空腹、排空后称最准。" + (prevW ? "上次记录 " + prevW.toFixed(1) + " kg。" : "") +
        "点「记下来」存入今天；体脂等详细数据在「设置 → 体测」里导入。"));

    /* 状态：点标签，不用打字 */
    quick.appendChild(el("div", "sect-sep", "今天状态"));
    quick.appendChild(grid(["精力充沛", "一般", "疲惫", "很累"].map(function (m) {
      return tapRow(m, d.mood === m, function () { S.setDay(today, { mood: d.mood === m ? "" : m }); g.render(); });
    }), 4));

    var must = S.mustSupps();
    if (must.length) {
      quick.appendChild(el("div", "sect-sep", "补剂 · 每天必吃 " + must.length + " 项"));
      quick.appendChild(grid(must.map(function (x) {
        return tapRow(x.name, !!(d.sup && d.sup[x.name]), function () { S.toggleSup(today, x.name); g.render(); }, x.dose);
      }), 1));
    }
    root.appendChild(quick);

    /* ── 近 4 周热力（GitHub 风格） ── */
    var days = S.lastN(28).map(function (dt) { return { d: dt, pct: S.dayScore(dt).pct }; });
    var heat = card("近 4 周", "每格一天，颜色越深越完整");
    var hcv = el("canvas", "heatcv"); hcv.width = 560; hcv.height = 132;
    heat.appendChild(hcv);
    heat.appendChild(el("div", "legend",
      "<span class='lg'><i style='background:#EDF3F4'></i>未记</span>" +
      "<span class='lg'><i style='background:#CFE7E3'></i>低</span>" +
      "<span class='lg'><i style='background:#7FCBC0'></i>中</span>" +
      "<span class='lg'><i style='background:#12A594'></i>高</span>" +
      "<span class='lg'><i style='background:#0B7A6C'></i>满分</span>"));
    heat.appendChild(el("div", "tiny", "缺一天不影响趋势 —— 别为了「补记录」编数据。"));
    root.appendChild(heat);
    setTimeout(function () { C.heat(hcv, days, { cols: 14 }); }, 0);

    /* ── 今日小结 ── */
    var tips = [];
    if (!d.train) tips.push(["warn", "今天还没记训练 —— 休息日也点一下，这样才有对比。"]);
    if (d.protein !== "1") tips.push(["warn", "蛋白没达标：一勺蛋白粉 + 2 个鸡蛋 ≈ 38 g，是最快的补法。"]);
    if (d.breakfast !== "1") tips.push(["danger", "早饭没吃 —— 这是你最大的口子（会连带午餐吃过量与全天蛋白不足）。"]);
    var eaten = Object.keys(d.meals || {}).length;
    if (eaten < 2) tips.push(["warn", "今天只记了 " + eaten + " 餐。去「饮食」把三餐勾上，系统才能算日缺口。"]);
    if (!tips.length) tips.push(["ok", "今天全部达标，保持。"]);
    var sum = card("今日小结");
    tips.forEach(function (t) {
      sum.appendChild(el("div", "tiprow " + t[0], "<span class='dot'></span><span>" + esc(t[1]) + "</span>"));
    });
    root.appendChild(sum);
  }

  /* ═══════════ 饮食 ═══════════ */
  function diet(root) {
    var today = S.todayStr(), d = S.day(today), nut = V.nutrition();
    var I = g.Intake, FOOD = g.FoodDB;
    var adv = I.advise(today), G = adv.gaps;

    /* ── 1) 实时仪表：目标 / 已吃 / 还差 ── */
    var head = card("今天吃了多少", "每选一样食物，这里立刻更新");
    var rows = [
      ["热量", G.intake.kcal, G.budget.kcal, "kcal", "#0B7A6C"],
      ["蛋白", G.intake.p, G.budget.p, "g", "#2F6BFF"],
      ["碳水", G.intake.c, G.budget.c, "g", "#12A594"],
      ["脂肪", G.intake.f, G.budget.f, "g", "#B87A0A"]
    ];
    var tbl = el("table");
    tbl.innerHTML = "<thead><tr><th>项目</th><th>已吃</th><th>额度</th><th>还差</th><th style='width:34%'>进度</th></tr></thead>";
    var tb = el("tbody");
    rows.forEach(function (r) {
      var gap = Math.round(r[2] - r[1]);
      var pct = r[2] ? Math.min(150, Math.round(r[1] / r[2] * 100)) : 0;
      var col = gap < -50 ? "#C4402A" : pct >= 90 ? "#1F7A5C" : "#0B7A6C";
      var tr = el("tr");
      tr.innerHTML = "<td><b>" + r[0] + "</b></td><td>" + r[1] + " " + r[3] + "</td><td>" + r[2] + " " + r[3] +
        "</td><td style='color:" + col + ";font-weight:700'>" + (gap > 0 ? "还差 " + gap : gap < 0 ? "超 " + (-gap) : "刚好") +
        "</td><td><span class='mb-t' style='display:block'><i style='width:" + Math.min(100, pct) + "%;background:" + r[4] + "'></i></span></td>";
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    head.appendChild(tbl);
    if (G.burn.list.length) {
      var bnote = "今天的运动：总消耗 <b>" + G.burn.gross + " kcal</b>。";
      if (G.burn.marginal > 0) {
        bnote += "其中比日常（PAL 1.5 基线）多烧的 <b>" + G.burn.marginal + " kcal</b> 已加进上面的额度。";
      } else if (G.burn.baselineOnly) {
        bnote += "你记的都是<b>日常活动</b>（久坐/站立/家务）—— 它们本就含在日常基线里，" +
          "<b>不额外加额度</b>，否则等于把「坐着」当成运动。";
      }
      head.appendChild(el("div", "tiny", bnote));
    }
    if (G.intake.unknown && G.intake.unknown.length) {
      head.appendChild(el("div", "warnbox", "有 <b>" + G.intake.unknown.length + " 样食物不在库里</b>，" +
        "已跳过不计：<b>" + esc(G.intake.unknown.join("、")) + "</b>。它们的热量没有算进上面的摄入。"));
    }
    if (G.burn.badWeight) {
      head.appendChild(el("div", "warnbox", "还没记体重，运动消耗暂按 70 kg 估算。" +
        "去「首页」记一次体重，这里会立刻变准。"));
    }
    root.appendChild(head);

    /* ── 2) 缺口建议（动态）── */
    var tipCard = card("还缺什么 / 怎么补", "按你当前吃到的实时算");
    adv.tips.forEach(function (t) {
      tipCard.appendChild(el("div", "tiprow " + (t.level === "danger" ? "danger" : t.level === "warn" ? "warn" : "ok"),
        "<span class='dot'></span><span><b>" + esc(t.label) + "</b> —— " + esc(t.text) + "</span>"));
    });
    root.appendChild(tipCard);

    /* ── 3) 四个餐次：点进去选实际吃了什么 ── */
    I.MEALS.forEach(function (m) {
      var picked = (I.foodsOf(today)[m.key] || []);
      var mc = card(m.label, m.hint + (picked.length ? " · 已选 " + picked.length + " 样" : " · 还没选"));
      /* 已选列表（可调份数 / 删除） */
      if (picked.length) {
        var sum = { kcal: 0, p: 0 };
        picked.forEach(function (sel) {
          var it = FOOD.get(sel.name) || { kcal: 0, p: 0 };
          var q = sel.qty || 1;
          sum.kcal += it.kcal * q; sum.p += it.p * q;
        });
        picked.forEach(function (sel) {
          var it = FOOD.get(sel.name);
          if (!it) return;
          var q = sel.qty || 1;
          var row = el("div", "foodrow");
          row.appendChild(el("div", "foodrow-l",
            "<b>" + esc(it.name) + "</b><span class='tiny'>" + it.kcal * q + " kcal · 蛋白 " +
            Math.round(it.p * q) + "g</span>"));
          var st = el("div", "qty");
          var minus = el("button", "qbtn", "−");
          var num = el("span", "qnum", String(q));
          var plus = el("button", "qbtn", "+");
          var del = el("button", "qbtn del", "删");
          minus.onclick = function () { I.setQty(today, m.key, sel.name, q - 1); g.render(); };
          plus.onclick = function () { I.setQty(today, m.key, sel.name, q + 1); g.render(); };
          del.onclick = function () { I.delFood(today, m.key, sel.name); g.render(); };
          st.appendChild(minus); st.appendChild(num); st.appendChild(plus); st.appendChild(del);
          row.appendChild(st);
          mc.appendChild(row);
        });
        mc.appendChild(el("div", "tiny", "这一餐合计 <b>" + Math.round(sum.kcal) + " kcal</b> · 蛋白 " +
          Math.round(sum.p) + " g"));
      } else {
        mc.appendChild(el("div", "tiny", "下面点你吃的东西，会自动累加。"));
      }

      /* 选食物：按分类分组，可折叠 */
      var picker = el("details", "picker");
      picker.appendChild(el("summary", null, "＋ 添加食物（" + FOOD.items.length + " 项，按分类）"));
      FOOD.cats.forEach(function (cat) {
        var list = FOOD.byCat(cat);
        if (!list.length) return;
        picker.appendChild(el("div", "pickcat", "<b>" + cat + "</b>"));
        var wrap = el("div", "pickwrap");
        list.forEach(function (it) {
          var b = el("button", "pickbtn", esc(it.name) +
            "<span class='pickmac'>" + it.kcal + " kcal · P" + it.p + " C" + it.c + " F" + it.f + "</span>");
          b.onclick = function () { I.addFood(today, m.key, it.name); g.render(); };
          wrap.appendChild(b);
        });
        picker.appendChild(wrap);
      });
      mc.appendChild(picker);
      root.appendChild(mc);
    });

    /* ── 4) 保留：方案与速查（折叠，避免刷屏）── */
    var more = el("details", "picker");
    more.appendChild(el("summary", null, "早餐方案（三选一）与蛋白来源速查"));

    var bf = D.breakfast || { plans: [] };
    var bseg = el("div", "seg");
    bf.plans.forEach(function (p, i) {
      var b = el("button", "seg-b" + (S.ST().dietPlan === i ? " on" : ""), "方案 " + "ABC"[i]);
      b.onclick = function () { S.ST().dietPlan = i; S.save(); g.render(); };
      bseg.appendChild(b);
    });
    more.appendChild(bseg);
    var pick = bf.plans[S.ST().dietPlan] || bf.plans[0];
    if (pick) {
      more.appendChild(el("div", "planbox",
        "<b>" + esc(pick.t) + "</b><span class='pill accent'>" + pick.kcal + " kcal · 蛋白 " + pick.p + " g</span>" +
        "<ul>" + pick.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" +
        "<div class='tiny'>" + esc(pick.note) + "</div>"));
    }
    var pc = el("div");
    var t2 = el("table");
    t2.innerHTML = "<thead><tr><th>蛋白来源</th><th>蛋白</th><th>热量</th></tr></thead>";
    var tb2 = el("tbody");
    ((D.macros || {}).protein_sources || []).forEach(function (x) {
      var tr = el("tr");
      tr.innerHTML = "<td>" + esc(x.food) + "<div class='tiny'>" + esc(x.note) + "</div></td><td><b>" + x.p +
        " g</b></td><td>" + x.kcal + "</td>";
      tb2.appendChild(tr);
    });
    t2.appendChild(tb2); pc.appendChild(t2);
    more.appendChild(pc);
    root.appendChild(more);
  }

  /* 旧的宏量条组件（仍被其它视图引用，保留） */
  function dietLegacy(root) {
    var today = S.todayStr(), d = S.day(today), nut = V.nutrition();
    var head = card("饮食", "目标 " + nut.kcal + " kcal · 蛋白 " + nut.protein + " g");
    head.appendChild(el("div", "macro-bar",
      bar("蛋白", nut.protein_kcal, nut.kcal, "#0B7A6C") +
      bar("碳水", nut.carb_kcal, nut.kcal, "#12A594") +
      bar("脂肪", nut.fat_kcal, nut.kcal, "#B87A0A")));
    head.appendChild(el("div", "tiny", "蛋白 " + nut.protein + "g / 碳水 " + nut.carb + "g / 脂肪 " + nut.fat + "g" +
      "（按路线 " + nut.planId + " 与当前去脂体重算出）"));
    root.appendChild(head);

    /* 三餐记录 + 外卖/食堂场景 */
    var meals = [["breakfast", "早餐", "7:00–8:00"], ["lunch", "午餐", "12:00 食堂"], ["dinner", "晚餐", "18:15 外卖"], ["snack", "加餐", "训练后/下午"]];
    var mc = card("三餐记录", "勾选已吃，或选外卖/食堂场景");
    meals.forEach(function (m) {
      var rec = (d.meals && d.meals[m[0]]) || null;
      var row = el("div", "mealrow");
      row.appendChild(el("div", "mealrow-h", "<b>" + m[1] + "</b><span class='tiny'>" + m[2] + "</span>"));
      var opts = [["", "没吃/不记"], ["self", "食堂"], ["takeout", "外卖"], ["cook", "自己做"]];
      var seg = el("div", "seg");
      opts.forEach(function (o) {
        var b = el("button", "seg-b" + (rec === o[0] ? " on" : ""), o[1]);
        b.onclick = function () {
          var mm = Object.assign({}, d.meals || {});
          if (o[0]) mm[m[0]] = o[0]; else delete mm[m[0]];
          S.setDay(today, { meals: mm }); g.render();
        };
        seg.appendChild(b);
      });
      row.appendChild(seg);
      mc.appendChild(row);
    });
    root.appendChild(mc);

    /* 方案选择：早餐三套 */
    var bf = D.breakfast || { plans: [] };
    var bc = card("早餐方案（三选一）", "针对「经常不吃早饭」设计");
    var bseg = el("div", "seg");
    bf.plans.forEach(function (p, i) {
      var b = el("button", "seg-b" + (S.ST().dietPlan === i ? " on" : ""), "方案 " + "ABC"[i]);
      b.onclick = function () { S.ST().dietPlan = i; S.save(); g.render(); };
      bseg.appendChild(b);
    });
    bc.appendChild(bseg);
    var pick = bf.plans[S.ST().dietPlan] || bf.plans[0];
    if (pick) {
      bc.appendChild(el("div", "planbox",
        "<b>" + esc(pick.t) + "</b><span class='pill accent'>" + pick.kcal + " kcal · 蛋白 " + pick.p + " g</span>" +
        "<ul>" + pick.items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" +
        "<div class='tiny'>" + esc(pick.note) + "</div>"));
    }
    root.appendChild(bc);

    /* 蛋白来源速查 */
    var pc = card("蛋白来源速查", "挑着凑够 " + nut.protein + " g");
    var t = el("table");
    t.innerHTML = "<thead><tr><th>食物</th><th>蛋白</th><th>热量</th></tr></thead>";
    var tb = el("tbody");
    ((D.macros || {}).protein_sources || []).forEach(function (x) {
      var tr = el("tr");
      tr.innerHTML = "<td>" + esc(x.food) + "<div class='tiny'>" + esc(x.note) + "</div></td><td><b>" + x.p +
        " g</b></td><td>" + x.kcal + "</td>";
      tb.appendChild(tr);
    });
    t.appendChild(tb); pc.appendChild(t);
    root.appendChild(pc);

    /* 食堂战术 4 类 */
    var cc = card("食堂 / 外卖战术");
    Object.keys(D.canteen || {}).forEach(function (k) {
      var x = D.canteen[k];
      cc.appendChild(el("div", "planbox", "<b>" + esc(x.title) + "</b><ul>" +
        x.items.map(function (i) { return "<li>" + i + "</li>"; }).join("") + "</ul>"));
    });
    root.appendChild(cc);

    /* 替换对照 */
    var sc2 = card("外卖替换对照");
    var t2 = el("table");
    t2.innerHTML = "<thead><tr><th>现在</th><th>换成</th><th>省</th></tr></thead>";
    var tb2 = el("tbody");
    (D.swap || []).forEach(function (x) {
      var tr = el("tr");
      tr.innerHTML = "<td>" + esc(x.bad) + "<div class='tiny'>" + x.bad_kcal + " kcal</div></td><td><b>" +
        esc(x.good) + "</b><div class='tiny'>" + x.good_kcal + " kcal</div></td><td style='color:var(--dangerText);font-weight:700'>−" +
        (x.bad_kcal - x.good_kcal) + "</td>";
      tb2.appendChild(tr);
    });
    t2.appendChild(tb2); sc2.appendChild(t2);
    root.appendChild(sc2);
  }
  function bar(label, v, total, color) {
    var pct = Math.round(v / total * 100);
    return "<div class='mb'><span class='mb-l'>" + label + " " + pct + "%</span>" +
      "<span class='mb-t'><i style='width:" + pct + "%;background:" + color + "'></i></span></div>";
  }

  /* ═══════════ 训练（自由选择，动态消耗）═══════════ */
  function train(root) {
    var today = S.todayStr(), d = S.day(today);
    var I = g.Intake, ACT = g.ActDB;
    var idx = new Date(today + "T00:00:00").getDay();
    var weekmap = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    var refPlan = (D.training || []).filter(function (x) { return x.day === weekmap[idx]; })[0];
    var B = I.burn(today);

    /* ── 1) 今天练了什么（可加多项，不同运动不同时长）── */
    var head = card("今天练了什么", "自己选，可以加多项：不同运动、不同时长");
    if (refPlan) {
      head.appendChild(el("div", "tiny", "（参考：原计划今天一般是「" + esc(refPlan.what) + "」——只是建议，你可以自由换）"));
    }

    if (B.list.length) {
      B.list.forEach(function (s, i) {
        var row = el("div", "foodrow");
        row.appendChild(el("div", "foodrow-l",
          "<b>" + esc(s.name) + "</b>" +
          (s.unknown ? " <span class='pill danger'>库里没有，按 0 算</span>" : "") +
          (s.needConfirm ? " <span class='pill warn'>旧记录·强度待确认</span>" : "") +
          "<span class='tiny'>总消耗 " + s.gross + " kcal" +
          (s.isBaseline ? " · 日常活动，不加额度" : " · 额外可吃 " + s.marginal + " kcal") + "</span>"));
        var st = el("div", "qty");
        var minus = el("button", "qbtn", "−5");
        var num = el("span", "qnum", s.min + "′");
        var plus = el("button", "qbtn", "+5");
        var del = el("button", "qbtn del", "删");
        minus.onclick = function () { I.setSessionMin(today, i, s.min - 5); g.render(); };
        plus.onclick = function () { I.setSessionMin(today, i, s.min + 5); g.render(); };
        del.onclick = function () { I.delSession(today, i); g.render(); };
        st.appendChild(minus); st.appendChild(num); st.appendChild(plus); st.appendChild(del);
        row.appendChild(st);
        head.appendChild(row);
      });
      head.appendChild(el("div", "rollup",
        "今日运动合计 <b>" + B.gross + " kcal</b>（总消耗）· 可多吃 <b>" + B.marginal +
        " kcal</b> <span class='tiny'>· 按体重 " + B.weight + " kg 算</span>"));
      if (B.baselineOnly) {
        head.appendChild(el("div", "warnbox",
          "你记的都是<b>日常活动</b>（久坐/站立/家务/通勤骑车）—— 这些本身就含在日常消耗基线里，" +
          "<b>不会增加今天可吃的额度</b>。要加额度，请记真正的运动（力量/球类/有氧）。"));
      }
      if (B.needConfirm.length) {
        head.appendChild(el("div", "warnbox", "有 " + B.needConfirm.length +
          " 条是旧记录迁移来的，<b>强度不确定</b>（休闲/双打/单打差很多）。删掉重新选一次更准。"));
      }
    } else {
      head.appendChild(el("div", "tiny", "还没记。下面选一项 + 填时长即可，消耗会自动算出来。"));

      /* ── 2) 添加运动：选项目 + 时长 ── */
      var form = el("div", "addrow");
      var sel = el("select", "addsel"); sel.id = "actSel0";
      ACT.cats.forEach(function (c) {
        var og = el("optgroup"); og.label = c;
        ACT.byCat(c).forEach(function (a) {
          var o = el("option"); o.value = a.name; o.textContent = a.name + "（" + a.met + " MET）";
          og.appendChild(o);
        });
        sel.appendChild(og);
      });
      var minIn = el("input", "addmin"); minIn.id = "actMin0";
      minIn.type = "number"; minIn.value = "45"; minIn.min = "5"; minIn.step = "5"; minIn.inputMode = "numeric";
      var addBtn = el("button", "addbtn", "加入"); addBtn.id = "actAdd0";
      form.appendChild(sel); form.appendChild(minIn); form.appendChild(addBtn);

      var preview = el("div", "tiny", "");
      /* 一律从 DOM 按 id 取元素，不用闭包捕获的引用 ——
         本页有多个 select（添加运动 / 主项记录），闭包引用在重渲染与多表单下
         实测取错过，导致名称落库成「哑铃/器械卧推」且消耗算 0。 */
      function readForm() {
        var s0 = document.getElementById("actSel0");
        var m0 = document.getElementById("actMin0");
        return { name: s0 ? s0.value : "", min: m0 ? (parseInt(m0.value, 10) || 0) : 0 };
      }
      function upd() {
        var f = readForm();
        var w = B.weight;
        var g2 = ACT.grossKcal(f.name, w, f.min);
        var mg = ACT.marginalKcal(f.name, w, f.min);
        var base = ACT.isBaseline(f.name);
        preview.innerHTML = "按体重 <b>" + w + " kg</b> 估算：总消耗 <b>" + g2 + " kcal</b>，" +
          (base ? "<b>日常活动，不增加可吃额度</b>" : "额外可吃 <b>" + mg + " kcal</b>") +
          "（" + f.min + " 分钟）";
      }
      sel.onchange = upd; minIn.oninput = upd; upd();
      addBtn.onclick = function () {
        var f = readForm();
        if (!f.name) { toast("先选一项运动"); return; }
        if (!f.min || f.min < 5) { toast("时长填一下（至少 5 分钟）"); return; }
        I.addSession(today, f.name, f.min); toast("已加入 " + f.name); g.render();
      };
      head.appendChild(form);
      head.appendChild(preview);
    }
    root.appendChild(head);
    var hasSessions = B.list.length > 0;
    if (hasSessions) {
      var add2 = card("再加一项", "比如练完力量又打了球");
      var form2 = el("div", "addrow");
      var sel2 = el("select", "addsel"); sel2.id = "actSel1";
      ACT.cats.forEach(function (c) {
        var og = el("optgroup"); og.label = c;
        ACT.byCat(c).forEach(function (a) {
          var o = el("option"); o.value = a.name; o.textContent = a.name + "（" + a.met + " MET）";
          og.appendChild(o);
        });
        sel2.appendChild(og);
      });
      var min2 = el("input", "addmin"); min2.id = "actMin1"; min2.type = "number"; min2.value = "30"; min2.min = "5"; min2.step = "5"; min2.inputMode = "numeric";
      var addBtn2 = el("button", "addbtn", "加入"); addBtn2.id = "actAdd1";
      addBtn2.onclick = function () {
        var s1 = document.getElementById("actSel1");
        var m1 = document.getElementById("actMin1");
        var name = s1 ? s1.value : "";
        var m = m1 ? (parseInt(m1.value, 10) || 0) : 0;
        if (!name) { toast("先选一项运动"); return; }
        if (!m || m < 5) { toast("时长填一下"); return; }
        I.addSession(today, name, m); g.render();
      };
      form2.appendChild(sel2); form2.appendChild(min2); form2.appendChild(addBtn2);
      add2.appendChild(form2);
      root.appendChild(add2);
    }

    /* 动作与组次：三档（新手 / 进阶 / 高手），每档不同分化 */
    var TDB = g.TrainDB;
    var lvlKey = S.ST().trainLevel || "beginner";
    var L = TDB.byKey(lvlKey);

    var bc = card("动作与组次", L.label + "档 · " + L.split + " · 每周 " + L.perWeek + " 练");
    /* 档位切换 */
    var lseg = el("div", "seg");
    TDB.levels.forEach(function (x) {
      var on = x.key === lvlKey;
      var b = el("button", "seg-b" + (on ? " on" : ""), x.label);
      b.onclick = function () {
        S.ST().trainLevel = x.key; S.ST().trainPlan = 0; S.save(); g.render();
      };
      lseg.appendChild(b);
    });
    bc.appendChild(lseg);
    bc.appendChild(el("div", "tiny", "<b>" + esc(L.sub) + "</b> · " + esc(L.split) +
      " · 每次约 " + L.min + " 分钟 · 组间休息 " + esc(L.rest)));
    bc.appendChild(el("div", "whybox", esc(L.why)));

    /* 训练日切换 */
    var dseg = el("div", "seg");
    L.days.forEach(function (x, i) {
      var b = el("button", "seg-b" + (S.ST().trainPlan === i ? " on" : ""), x.d);
      b.onclick = function () { S.ST().trainPlan = i; S.save(); g.render(); };
      dseg.appendChild(b);
    });
    bc.appendChild(dseg);

    var blk = L.days[S.ST().trainPlan] || L.days[0];
    if (blk) {
      bc.appendChild(el("div", "tiny", "训练日重点：<b>" + esc(blk.focus) + "</b>"));
      var t = el("table");
      t.innerHTML = "<thead><tr><th>动作</th><th>组×次</th><th>做不动时</th></tr></thead>";
      var tb = el("tbody");
      blk.items.forEach(function (it) {
        var tr = el("tr");
        tr.innerHTML = "<td><b>" + esc(it.name) + "</b><div class='tiny'>" + esc(it.cue) + "</div></td>" +
          "<td style='white-space:nowrap'><b>" + esc(it.sets) + "</b></td>" +
          "<td class='tiny'>" + esc(it.alt || "—") + "</td>";
        tb.appendChild(tr);
      });
      t.appendChild(tb); bc.appendChild(t);
    }
    /* 训练纪律（折叠） */
    var rl = el("details", "picker");
    rl.appendChild(el("summary", null, "训练纪律（" + TDB.rules.length + " 条，三档通用）"));
    var ul = el("div");
    TDB.rules.forEach(function (x) {
      ul.appendChild(el("div", "rulebox", esc(x).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")));
    });
    rl.appendChild(ul);
    bc.appendChild(rl);
    root.appendChild(bc);
    var blocks = blk ? [blk] : [];

    /* 主项记录：列出**当前档位的全部动作**（方便记任何一天的动作） */
    var lc = card("主项记录", "判断「有没有掉肌肉」的唯一基准 —— 减脂期这个数别掉");
    var names = [];
    TDB.byKey(lvlKey).days.forEach(function (b) {
      b.items.forEach(function (it) { if (names.indexOf(it.name) < 0) names.push(it.name); });
    });
    var row = el("div", "row c3");
    var sel = el("select"); sel.id = "liftSel"; names.forEach(function (n) { var o = el("option", null, n); o.value = n; sel.appendChild(o); });
    var wi = el("input"); wi.type = "number"; wi.placeholder = "kg"; wi.step = "2.5";
    var ri = el("input"); ri.type = "number"; ri.placeholder = "次";
    row.appendChild(sel); row.appendChild(wi); row.appendChild(ri);
    lc.appendChild(row);
    var addb = el("button", "btn primary", "记录这一组");
    addb.onclick = function () {
      var w = parseFloat(wi.value), r = parseInt(ri.value, 10);
      if (!w || !r) { toast("重量与次数都要填"); return; }
      S.addLift({ d: today, name: sel.value, w: w, r: r }); toast("已记录"); g.render();
    };
    lc.appendChild(addb);
    var lifts = (S.ST().lifts || []).slice().reverse().slice(0, 12);
    if (lifts.length) {
      var t3 = el("table");
      t3.innerHTML = "<thead><tr><th>日期</th><th>动作</th><th>重量×次</th><th>估 1RM</th></tr></thead>";
      var tb3 = el("tbody");
      lifts.forEach(function (L) {
        var tr = el("tr");
        tr.innerHTML = "<td>" + L.d.slice(5) + "</td><td>" + esc(L.name) + "</td><td>" + L.w + "×" + L.r +
          "</td><td>" + Math.round(L.w * (1 + L.r / 30)) + "</td>";
        tb3.appendChild(tr);
      });
      t3.appendChild(tb3); lc.appendChild(t3);
    }
    root.appendChild(lc);
  }

  /* ═══════════ 补剂 ═══════════ */
  function sup(root) {
    var today = S.todayStr(), d = S.day(today);
    var items = (D.supplements || {}).items || [];
    var must = S.mustSupps();
    /* 分类顺序：**「你在吃的」放最前** —— 那是你当前的方案，先看它；
       后面几类是"建议清单"，用来对比和扩充。 */
    var cats = ["你在吃的", "基础必需", "值得买", "可选", "不建议"];

    var head = card("补剂", "每天必吃 " + must.length + " 项 · 今日已勾 " + Object.keys(d.sup || {}).length);
    var seg = el("div", "seg");
    must.forEach(function (x) {
      var b = el("button", "seg-b" + (d.sup && d.sup[x.name] ? " on" : ""), (d.sup && d.sup[x.name] ? "✓ " : "") + x.name);
      b.onclick = function () { S.toggleSup(today, x.name); g.render(); };
      seg.appendChild(b);
    });
    head.appendChild(seg);
    head.appendChild(el("div", "tiny", (D.supplements || {}).principle || ""));
    root.appendChild(head);

    /* 近 14 天补剂坚持率 */
    var rate = card("补剂坚持率", "近 14 天");
    var days = S.lastN(14).map(function (dt) {
      var dd = S.day(dt), n = Object.keys(dd.sup || {}).length;
      return { d: dt, pct: must.length ? Math.round(n / must.length * 100) : 0 };
    });
    var cv = el("canvas", "barcv"); cv.width = 640; cv.height = 160;
    rate.appendChild(cv);
    var full = days.filter(function (x) { return x.pct === 100; }).length;
    rate.appendChild(el("div", "tiny", "14 天里 <b>" + full + " 天</b>吃全。坚持率 <b>" +
      Math.round(days.reduce(function (a, x) { return a + x.pct; }, 0) / 14) + "%</b>。" +
      "补剂效果来自长期天天吃，不是吃一次。"));
    root.appendChild(rate);
    setTimeout(function () {
      g.FX.barsAnimated(cv, days.map(function (x) { return { label: x.d.slice(8), v: x.pct }; }),
        { unit: "%", max: 100, good: 1, xLabel: true, note: "每根柱子 = 一天（%）" });
    }, 0);

    /* 分类清单 */
    cats.forEach(function (cat) {
      var list = items.filter(function (x) { return x.cat === cat; });
      if (!list.length) return;
      var c = card(cat + "（" + list.length + " 项）");
      list.forEach(function (x) {
        var cls = cat === "你在吃的" ? "accent" : cat === "基础必需" ? "ok" : cat === "值得买" ? "accent" : cat === "可选" ? "warn" : "danger";
        c.appendChild(el("div", "planbox",
          "<b>" + esc(x.name) + "</b> <span class='pill " + cls + "'>" + cat + "</span>" +
          (x.must ? " <span class='pill ok'>每天必吃</span>" : "") +
          "<div class='tiny' style='margin-top:4px'>" + esc(x.dose) + " · " + esc(x.when) + " · " + esc(x.cost) +
          " · 证据 " + x.evidence + "</div>" +
          "<div style='font-size:13.5px;margin-top:4px'>" + x.why + "</div>" +
          "<div class='tiny' style='margin-top:4px'>" + x.note + "</div>"));
      });
      root.appendChild(c);
    });
  }

  /* ═══════════ 报表 ═══════════ */
  function report(root) {
    var today = S.todayStr();
    var mode = S.ST().reportMode || "week";
    var head = card("报表", "日 / 周 / 月自动汇总");
    var seg = el("div", "seg");
    [["week", "周报"], ["month", "月报"], ["all", "总览（近 12 周）"]].forEach(function (m) {
      var b = el("button", "seg-b" + (mode === m[0] ? " on" : ""), m[1]);
      b.onclick = function () { S.ST().reportMode = m[0]; S.save(); g.render(); };
      seg.appendChild(b);
    });
    head.appendChild(seg);
    root.appendChild(head);

    if (mode === "week" || mode === "month") {
      var isWeek = mode === "week";
      var len = isWeek ? 7 : 30;
      var from = S.shift(today, -(len - 1)), to = today;
      var st = S.rangeStats(from, to);
      var pFrom = S.shift(from, -len), pTo = S.shift(from, -1);
      var cmp = V.compare(from, to, pFrom, pTo);

      var kc = card(isWeek ? "本周（" + from.slice(5) + " ~ " + to.slice(5) + "）" : "本月（近 30 天）");
      kc.appendChild(el("div", "kpis", kpi("平均完成度", st.avgPct, "%") + kpi("记录天数", st.logged + "/" + st.days, "") +
        kpi("训练", st.trainCount, "次") + kpi("训练时长", Math.round(st.trainMin), "分") +
        kpi("蛋白达标", st.proteinDays, "天") + kpi("补剂坚持", st.supRate, "%")));
      kc.appendChild(el("div", "tiny", "体重：" + (st.weight.last || "—") + " kg（区间 " +
        (st.weight.min || "—") + "~" + (st.weight.max || "—") + "）· 与上一周期比 " + cmp.weight.txt +
        " · 完成度 " + cmp.avgPct.txt));
      root.appendChild(kc);

      var bc = card("各板块完成度");
      var hcv = el("canvas", "hbarcv"); hcv.width = 640; hcv.height = 130;
      bc.appendChild(hcv);
      root.appendChild(bc);
      setTimeout(function () {
        var items = Object.keys(st.bySection).map(function (k) {
          return { label: st.bySection[k].label, pct: st.bySection[k].pct };
        });
        if (items.length) C.hbar(hcv, items);
      }, 0);

      var dc = card(isWeek ? "每天完成度" : "每 5 天完成度");
      var dcv = el("canvas", "barcv"); dcv.width = 640; dcv.height = 170;
      dc.appendChild(dcv);
      root.appendChild(dc);
      setTimeout(function () {
        var arr = [];
        var cur = from;
        if (isWeek) {
          while (S.daysBetween(cur, to) >= 0) { arr.push({ label: cur.slice(8), v: S.dayScore(cur).pct }); cur = S.shift(cur, 1); }
        } else {
          for (var blk = 0; blk < 6; blk++) {
            var b0 = S.shift(from, blk * 5), b1 = S.shift(b0, 4);
            var s2 = S.rangeStats(b0, b1);
            arr.push({ label: b0.slice(5), v: s2.avgPct });
          }
        }
        g.FX.barsAnimated(dcv, arr, { unit: "%", max: 100, good: 1, xLabel: true, note: "完成度（%）" });
      }, 0);

      /* 环比表 */
      var cc = card("与上一周期对比");
      var t = el("table");
      t.innerHTML = "<thead><tr><th>指标</th><th>本周期</th><th>上周期</th><th>变化</th></tr></thead>";
      var tb = el("tbody");
      [["平均完成度", cmp.a.avgPct + "%", cmp.b.avgPct + "%", cmp.avgPct],
       ["训练次数", cmp.a.trainCount, cmp.b.trainCount, cmp.train],
       ["蛋白达标天数", cmp.a.proteinDays, cmp.b.proteinDays, cmp.protein],
       ["补剂坚持率", cmp.a.supRate + "%", cmp.b.supRate + "%", cmp.supRate],
       ["期末体重", (cmp.a.weight.last || "—") + " kg", (cmp.b.weight.last || "—") + " kg", cmp.weight]
      ].forEach(function (r) {
        var tr = el("tr");
        var col = r[3].dir > 0 ? "var(--ok)" : r[3].dir < 0 ? "var(--dangerText)" : "var(--ink2)";
        tr.innerHTML = "<td>" + r[0] + "</td><td><b>" + r[1] + "</b></td><td>" + r[2] +
          "</td><td style='color:" + col + ";font-weight:700'>" + r[3].txt + "</td>";
        tb.appendChild(tr);
      });
      t.appendChild(tb); cc.appendChild(t);
      root.appendChild(cc);

      /* 日均缺口（有体重记录时） */
      if (st.weight.n >= 2 && st.days > 0) {
        var dw = st.weight.first - st.weight.last;
        var gz = D.derived || {};
        var gapNeed = (gz.gap_per_day || 306);
        var actual = dw * 7700 / st.days;
        var oc = card("缺口校验", "用实际体重变化反推你的真实缺口");
        oc.appendChild(el("div", null,
          "<div class='tip'>这 " + st.days + " 天体重变化 <b>" + V.sgn(-dw) + " kg</b>（" + V.sgn(dw) + " 斤）</div>" +
          "<div class='tip'>折算日均缺口 <b>" + Math.round(actual) + " kcal/天</b>（按 1 kg 脂肪 = 7700 kcal）</div>" +
          "<div class='tip'>计划缺口 " + Math.round(gapNeed) + " kcal/天</div>" +
          "<div class='tiny'>实际明显低于计划 → 记录漏了或吃多了；明显高于计划 → 掉得快，注意别掉肌肉。</div>"));
        root.appendChild(oc);
      }
    } else {
      /* 总览：近 12 周 */
      var wks = [];
      for (var i = 11; i >= 0; i--) {
        var wEnd = S.shift(today, -i * 7), wStart = S.shift(wEnd, -6);
        var s3 = S.rangeStats(wStart, wEnd);
        wks.push({ label: wStart.slice(5), v: s3.avgPct, train: s3.trainCount, w: s3.weight });
      }
      var ac = card("近 12 周完成度");
      var acv = el("canvas", "barcv"); acv.width = 640; acv.height = 180;
      ac.appendChild(acv);
      root.appendChild(ac);
      setTimeout(function () {
        g.FX.barsAnimated(acv, wks.map(function (x) { return { label: x.label, v: x.v }; }),
          { unit: "%", max: 100, good: 1, xLabel: true, note: "每周平均完成度（%）" });
      }, 0);

      var wc = card("每周明细");
      var t2 = el("table");
      t2.innerHTML = "<thead><tr><th>周</th><th>完成度</th><th>训练</th><th>体重</th></tr></thead>";
      var tb2 = el("tbody");
      wks.slice().reverse().forEach(function (x) {
        var tr = el("tr");
        tr.innerHTML = "<td>" + x.label + "</td><td>" + x.v + "%</td><td>" + x.train + " 次</td><td>" +
          (x.w.last || "—") + "</td>";
        tb2.appendChild(tr);
      });
      t2.appendChild(tb2); wc.appendChild(t2);
      root.appendChild(wc);
    }
  }
  function kpi(k, v, u) {
    return "<div class='kpi'><div class='k'>" + k + "</div><div class='v'>" + v +
      (u ? " <small>" + u + "</small>" : "") + "</div></div>";
  }

  g.Views = { home: home, diet: diet, train: train, sup: sup, report: report };
  g.U = { el: el, esc: esc, card: card, tapRow: tapRow, grid: grid, kpi: kpi };
})(window);
