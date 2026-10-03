/* ═══════════════════════════════════════════════════════════════
   06-fx.js · 视觉与交互动效层
   · easeOutCubic 缓动
   · 环形进度动画（数字滚动 + 弧线生长）
   · 柱状生长动画
   · 点击涟漪 + 触感（Capacitor Haptics，浏览器静默跳过）
   · 数字滚动
   ═══════════════════════════════════════════════════════════════ */
(function (g) {
  "use strict";

  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeOutBack(t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

  /* requestAnimationFrame 动画驱动；返回取消函数 */
  function animate(dur, onFrame, onDone) {
    var t0 = null, raf = null, stopped = false;
    function step(ts) {
      if (stopped) return;
      if (t0 === null) t0 = ts;
      var t = Math.min(1, (ts - t0) / dur);
      onFrame(t);
      if (t < 1) raf = requestAnimationFrame(step);
      else if (onDone) onDone();
    }
    raf = requestAnimationFrame(step);
    return function () { stopped = true; if (raf) cancelAnimationFrame(raf); };
  }

  /* 环形生长动画。
     ⚠️ 设计原则（实测教训）：**任何时刻显示的数字都必须是正确的**。
     早先写法是「先写终值 → 跳回 0 → 滚上来」，采样恰好落在跳回 0 的瞬间 → 看到 0%
     （Store 里明明是 69%）。所以现在**数字从头到尾都是终值**，只有圆环做 0→pct 生长。
     圆环即使一帧都没画，也只是少个装饰；数字不会错。 */
  function ringAnimated(cv, pct, label, sub, color, dur, opt) {
    var C = g.Charts;
    dur = dur || 720;
    pct = Math.max(0, Math.min(100, pct || 0));
    if (g.__noAnim) { C.ring(cv, pct, label, sub, color, opt); return; }
    return animate(dur, function (t) {
      C.ring(cv, Math.round(pct * easeOutCubic(t)), label, sub, color, opt);
    }, function () { C.ring(cv, pct, label, sub, color, opt); });
  }

  /* 柱状生长：同样先落最终态（保证数据正确），再动画 */
  function barsAnimated(cv, data, opt, dur) {
    var C = g.Charts;
    dur = dur || 620;
    opt = opt || {};
    C.bars(cv, data, opt);
    if (g.__noAnim) return;
    return animate(dur, function (t) {
      var e = easeOutCubic(t);
      var scaled = data.map(function (d) { return Object.assign({}, d, { v: d.v * e }); });
      C.bars(cv, scaled, opt);
    }, function () { C.bars(cv, data, opt); });
  }

  function lineAnimated(cv, pts, opt, dur) {
    var C = g.Charts;
    dur = dur || 700;
    opt = opt || {};
    C.line(cv, pts, opt);                              // ① 先落最终态
    if (pts.length < 2 || g.__noAnim) return;
    return animate(dur, function (t) {                 // ② 再逐段长出来
      var e = easeOutCubic(t);
      var n = Math.max(2, Math.ceil(pts.length * e));
      C.line(cv, pts.slice(0, n), opt);
    }, function () { C.line(cv, pts, opt); });
  }

  /* 数字滚动 —— 已停用起点为 0 的写法：那会让"正确值"短暂被 0 替换。
     现在直接把终值写进去；保留函数是为了调用方接口稳定。 */
  function countUp(node, to, dur, suffix) {
    to = +to || 0;
    node.textContent = to + (suffix || "");
  }

  /* 触感反馈：Capacitor Haptics 存在就震动，否则用 navigator.vibrate 兜底，再否则静默 */
  function haptic(style) {
    try {
      var H = g.Capacitor && g.Capacitor.Plugins && g.Capacitor.Plugins.Haptics;
      if (H) { (style === "heavy" ? H.impact({ style: "HEAVY" }) : H.impact({ style: "LIGHT" })).catch(function () { }); return; }
      if (navigator.vibrate) navigator.vibrate(style === "heavy" ? 18 : 8);
    } catch (e) { }
  }

  /* 全局：给所有按钮加涟漪 + 轻触感 */
  function installRipple() {
    if (document.__rippleInstalled) return;
    document.__rippleInstalled = true;
    document.addEventListener("pointerdown", function (e) {
      var b = e.target.closest(".tap, .seg-b, .btn, .ringbox, nav button");
      if (!b) return;
      haptic("light");
      /* 涟漪只给较大的按钮，避免网格里到处闪光 */
      if (!b.classList.contains("tap") && !b.classList.contains("btn")) return;
      var r = b.getBoundingClientRect();
      var s = document.createElement("span");
      s.className = "ripple";
      var size = Math.max(r.width, r.height) * 1.6;
      s.style.width = s.style.height = size + "px";
      s.style.left = (e.clientX - r.left - size / 2) + "px";
      s.style.top = (e.clientY - r.top - size / 2) + "px";
      if (getComputedStyle(b).position === "static") b.style.position = "relative";
      b.appendChild(s);
      setTimeout(function () { s.remove(); }, 520);
    }, { passive: true });
  }

  /* 页面切换时的淡入 */
  function fadeIn(node) {
    if (!node) return;
    node.style.opacity = "0";
    node.style.transform = "translateY(6px)";
    requestAnimationFrame(function () {
      node.style.transition = "opacity .22s ease, transform .22s ease";
      node.style.opacity = "1";
      node.style.transform = "none";
    });
  }

  /* 顶部进度条（切页时给个即时反馈） */
  function topProgress(on) {
    var bar = document.getElementById("topbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "topbar";
      document.body.appendChild(bar);
    }
    if (on) { bar.style.transition = "none"; bar.style.width = "18%"; bar.style.opacity = "1";
      requestAnimationFrame(function () { bar.style.transition = "width .5s ease"; bar.style.width = "78%"; }); }
    else { bar.style.width = "100%"; setTimeout(function () { bar.style.opacity = "0";
      setTimeout(function () { bar.style.width = "0"; }, 200); }, 160); }
  }

  g.FX = { easeOutCubic: easeOutCubic, easeOutBack: easeOutBack, animate: animate,
           ringAnimated: ringAnimated, barsAnimated: barsAnimated, lineAnimated: lineAnimated,
           countUp: countUp, haptic: haptic, installRipple: installRipple, fadeIn: fadeIn,
           topProgress: topProgress };
})(window);
