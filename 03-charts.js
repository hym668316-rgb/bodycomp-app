/* ═══════════════════════════════════════════════════════════════
   03-charts.js · 可视化层（纯 canvas，无第三方库）
   ring 完成度环 / bars 柱状 / line 折线 / heat 热力图
   ═══════════════════════════════════════════════════════════════ */
(function (g) {
  "use strict";
  var COLOR = {
    accent: "#0B7A6C", accentL: "#12A594", ok: "#1F7A5C", warn: "#B87A0A",
    danger: "#C4402A", line: "#EEF4F6", ink: "#12303A", ink2: "#4A6B75", bg: "#FFFFFF"
  };
  var FONT = '"Microsoft YaHei","PingFang SC",system-ui,sans-serif';

  /* 高清屏适配 */
  function setup(cv) {
    var dpr = window.devicePixelRatio || 1;
    var w = cv.clientWidth || cv.width, h = cv.clientHeight || cv.height;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  /* ── 完成度环 ── */
  function ring(cv, pct, label, sub, color, opt) {
    opt = opt || {};
    var s = setup(cv), ctx = s.ctx, w = s.w, h = s.h;
    var cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - (opt.lw ? opt.lw / 2 + 2 : 5);
    ctx.lineWidth = opt.lw || 8;
    /* 底轨：实心圆 + 轨道弧。实心圆让浅色背景上的弧线更清楚 */
    if (opt.fill) { ctx.fillStyle = opt.fill; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = opt.track || COLOR.line;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    var p = Math.max(0, Math.min(100, pct || 0));
    ctx.strokeStyle = color || (p >= 80 ? COLOR.ok : p >= 40 ? COLOR.accent : COLOR.warn);
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p / 100); ctx.stroke();
    ctx.fillStyle = opt.ink || COLOR.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "700 " + Math.round(r * 0.62) + "px " + FONT;
    ctx.fillText(p + "%", cx, cy - (sub ? r * 0.12 : 0));
    ctx.font = "600 " + Math.round(r * 0.30) + "px " + FONT;
    ctx.fillStyle = opt.ink2 || COLOR.ink2;
    if (label) ctx.fillText(label, cx, cy + r * 0.48);
    if (sub) { ctx.font = Math.round(r * 0.26) + "px " + FONT; ctx.fillText(sub, cx, cy + r * 0.78); }
    ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  }

  /* ── 柱状（日/周/月通用） ── */
  function bars(cv, data, opt) {
    opt = opt || {};
    var s = setup(cv), ctx = s.ctx, w = s.w, h = s.h;
    var PAD = { l: 34, r: 8, t: opt.note ? 18 : 8, b: 20 };
    if (!data.length) { ctx.fillStyle = COLOR.ink2; ctx.font = "13px " + FONT; ctx.fillText("暂无数据", PAD.l, 30); return; }
    var maxV = Math.max.apply(null, data.map(function (d) { return d.v; }).concat([opt.max || 0, 1]));
    var iw = (w - PAD.l - PAD.r) / data.length;
    var bw = Math.max(3, Math.min(opt.barWidth || 22, iw * 0.66));
    var Y = function (v) { return h - PAD.b - v / maxV * (h - PAD.t - PAD.b); };
    /* 网格 */
    ctx.strokeStyle = COLOR.line; ctx.fillStyle = COLOR.ink2; ctx.font = "10px " + FONT;
    for (var i = 0; i <= 2; i++) {
      var v = maxV * i / 2, y = Y(v);
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke();
      ctx.fillText(Math.round(v) + (opt.unit || ""), 2, y + 3);
    }
    data.forEach(function (d, i) {
      var x = PAD.l + iw * i + (iw - bw) / 2;
      var y = Y(d.v), hh = h - PAD.b - y;
      var c = d.color || (d.v >= (opt.good || 0.8) * maxV ? COLOR.ok : d.v > 0 ? COLOR.accentL : "#E3EBEE");
      ctx.fillStyle = c;
      var rr = Math.min(4, bw / 2);
      ctx.beginPath();
      ctx.moveTo(x, h - PAD.b); ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.lineTo(x + bw - rr, y); ctx.quadraticCurveTo(x + bw, y, x + bw, y + rr);
      ctx.lineTo(x + bw, h - PAD.b); ctx.closePath(); ctx.fill();
      if (opt.xLabel && (data.length <= 12 || i % Math.ceil(data.length / 10) === 0)) {
        ctx.fillStyle = COLOR.ink2; ctx.font = "10px " + FONT;
        ctx.save(); ctx.translate(x + bw / 2, h - PAD.b + 12);
        if (data.length > 10) { ctx.rotate(-Math.PI / 5); }
        ctx.textAlign = "center"; ctx.fillText(d.label || "", 0, 0); ctx.restore();
      }
    });
    if (opt.note) { ctx.fillStyle = COLOR.ink2; ctx.font = "10px " + FONT; ctx.fillText(opt.note, PAD.l, 12); }
  }

  /* ── 折线（体重/体脂趋势，带目标线） ── */
  function line(cv, pts, opt) {
    opt = opt || {};
    var s = setup(cv), ctx = s.ctx, w = s.w, h = s.h;
    var PAD = { l: 42, r: 12, t: 18, b: 26 };
    pts = (pts || []).filter(function (p) { return p.v !== null && p.v !== undefined && !isNaN(p.v); });
    if (!pts.length) { ctx.fillStyle = COLOR.ink2; ctx.font = "13px " + FONT; ctx.fillText("暂无数据", PAD.l, 40); return; }
    var vals = pts.map(function (p) { return +p.v; });
    if (opt.goal !== undefined && opt.goal !== null) vals.push(opt.goal);
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var pad = Math.max((hi - lo) * 0.22, opt.minPad || 0.6);
    lo -= pad; hi += pad;
    var X = function (i) { return PAD.l + (pts.length === 1 ? (w - PAD.l - PAD.r) / 2 : i / (pts.length - 1) * (w - PAD.l - PAD.r)); };
    var Y = function (v) { return h - PAD.b - (v - lo) / (hi - lo) * (h - PAD.t - PAD.b); };
    ctx.strokeStyle = COLOR.line; ctx.fillStyle = COLOR.ink2; ctx.font = "10px " + FONT;
    for (var i = 0; i <= 3; i++) {
      var v = lo + (hi - lo) * i / 3, y = Y(v);
      ctx.beginPath(); ctx.moveTo(PAD.l, y); ctx.lineTo(w - PAD.r, y); ctx.stroke();
      ctx.fillText((Math.round(v * 10) / 10) + (opt.unit || ""), 2, y + 3);
    }
    if (opt.goal !== undefined && opt.goal !== null) {
      ctx.strokeStyle = COLOR.ok; ctx.setLineDash([6, 5]);
      ctx.beginPath(); ctx.moveTo(PAD.l, Y(opt.goal)); ctx.lineTo(w - PAD.r, Y(opt.goal)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = COLOR.ok; ctx.font = "10px " + FONT;
      ctx.fillText("目标 " + (Math.round(opt.goal * 10) / 10), PAD.l + 3, Y(opt.goal) - 4);
    }
    ctx.strokeStyle = COLOR.accentL; ctx.lineWidth = 2.5;
    ctx.beginPath();
    pts.forEach(function (p, i) { var x = X(i), y = Y(p.v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.fillStyle = COLOR.accent;
    pts.forEach(function (p, i) { ctx.beginPath(); ctx.arc(X(i), Y(p.v), 3.2, 0, 6.3); ctx.fill(); });
    ctx.fillStyle = COLOR.ink; ctx.font = "700 11px " + FONT;
    ctx.fillText(String(pts[0].v), X(0) - 3, Y(pts[0].v) - 8);
    ctx.fillText(String(pts[pts.length - 1].v), X(pts.length - 1) - 16, Y(pts[pts.length - 1].v) - 8);
    ctx.fillStyle = COLOR.ink2; ctx.font = "10px " + FONT;
    ctx.fillText((pts[0].d || "").slice(5), PAD.l, h - 8);
    ctx.fillText((pts[pts.length - 1].d || "").slice(5), w - PAD.r - 30, h - 8);
  }

  /* ── 热力图（近 N 天打卡强度） ── */
  function heat(cv, days, opt) {
    opt = opt || {};
    var s = setup(cv), ctx = s.ctx, w = s.w, h = s.h;
    var cols = opt.cols || 14;
    var rows = Math.ceil(days.length / cols);
    var gap = 3;
    var cw = (w - gap * (cols - 1)) / cols;
    var ch = Math.min(cw, (h - gap * (rows - 1)) / Math.max(rows, 1));
    days.forEach(function (d, i) {
      var c = i % cols, r = Math.floor(i / cols);
      var x = c * (cw + gap), y = r * (ch + gap);
      var pct = d.pct || 0;
      var col = pct === 0 ? "#EDF3F4"
        : pct < 34 ? "#CFE7E3" : pct < 67 ? "#7FCBC0" : pct < 90 ? COLOR.accentL : COLOR.accent;
      ctx.fillStyle = col;
      var rr = Math.min(3, cw / 3);
      ctx.beginPath();
      ctx.moveTo(x + rr, y); ctx.lineTo(x + cw - rr, y);
      ctx.quadraticCurveTo(x + cw, y, x + cw, y + rr);
      ctx.lineTo(x + cw, y + ch - rr); ctx.quadraticCurveTo(x + cw, y + ch, x + cw - rr, y + ch);
      ctx.lineTo(x + rr, y + ch); ctx.quadraticCurveTo(x, y + ch, x, y + ch - rr);
      ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath(); ctx.fill();
    });
    return { rows: rows, cell: cw };
  }

  /* ── 迷你双色条（板块对比） ── */
  function hbar(cv, items) {
    var s = setup(cv), ctx = s.ctx, w = s.w, h = s.h;
    var n = items.length || 1;
    var rowH = h / n;
    var labelW = 46;
    items.forEach(function (it, i) {
      var y = i * rowH + rowH * 0.28, bh = rowH * 0.44;
      ctx.fillStyle = COLOR.ink2; ctx.font = "11px " + FONT;
      ctx.fillText(it.label, 2, y + bh * 0.78);
      var x0 = labelW, bw = w - labelW - 40;
      ctx.fillStyle = COLOR.line;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y, bw, bh, bh / 2) : ctx.rect(x0, y, bw, bh); ctx.fill();
      var pct = Math.max(0, Math.min(100, it.pct || 0));
      ctx.fillStyle = pct >= 80 ? COLOR.ok : pct >= 40 ? COLOR.accentL : COLOR.warn;
      var ww = Math.max(2, bw * pct / 100);
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y, ww, bh, bh / 2) : ctx.rect(x0, y, ww, bh); ctx.fill();
      ctx.fillStyle = COLOR.ink; ctx.font = "700 11px " + FONT;
      ctx.fillText(pct + "%", x0 + bw + 6, y + bh * 0.82);
    });
  }

  g.Charts = { COLOR: COLOR, ring: ring, bars: bars, line: line, heat: heat, hbar: hbar, setup: setup };
})(window);
