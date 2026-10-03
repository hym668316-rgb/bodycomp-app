/* ═══════════════════════════════════════════════════════════════
   08-activity-db.js · 运动库 + 动态消耗
   ─────────────────────────────────────────────────────────────
   MET 取值依据：Compendium of Physical Activities（Ainsworth 等，2011）
   的常见条目。**我第一版把力量训练取成 5.0，比权威的 3.5 高 43%**，
   与本机既有周计划（240 kcal/50min）对不上，所以这里逐条按权威值重写。

   两个口径都要能算，且**界面必须标明用的是哪个**：
     总消耗 = MET × kg × 小时          （含静息，和"周计划里的 kcal"同口径）
     净消耗 = (MET − 1) × kg × 小时 × 1.05（额外多烧的，用于加当天额度）
   第一版只报净消耗却拿去和总消耗的计划值比，这是我犯的错。

   别名/迁移：旧数据里的运动名（"力量-推"、"羽毛球"…）必须能映射过来，
   否则查询返回 0 会**静默少算消耗** —— 实测踩到过（"快走（5.5km/h）"查不到→0）。
   ═══════════════════════════════════════════════════════════════ */
(function (g) {
  "use strict";

  /* [名称, MET, 分类, 备注] */
  var RAW = [
    /* ── 力量（抗阻训练 8–15 次/组多组 = 3.5；大重量/爆发 = 5.0；循环 = 6.0）── */
    ["力量 · 推（胸肩三头）", 3.5, "力量", "8–15 次/组，组间休息 60–90s"],
    ["力量 · 拉（背二头）", 3.5, "力量", "划船/引体为主"],
    ["力量 · 腿（深蹲/硬拉）", 5.0, "力量", "腿部动作用力最大，最耗体力"],
    ["力量 · 全身/循环组", 6.0, "力量", "循环训练、心率一直较高"],
    ["自重训练（俯卧撑/引体）", 3.8, "力量", "宿舍也能做"],

    /* ── 球类 ── */
    ["羽毛球 · 休闲对打", 5.5, "球类", "能边打边聊那种"],
    ["羽毛球 · 双打", 6.0, "球类", "介于休闲与单打之间"],
    ["羽毛球 · 单打/比赛", 7.0, "球类", "连续跑动、出汗明显"],
    ["篮球 · 半场", 6.5, "球类", ""],
    ["篮球 · 全场", 8.0, "球类", ""],
    ["乒乓球", 4.0, "球类", ""],
    ["足球", 7.0, "球类", ""],
    ["网球", 7.3, "球类", ""],

    /* ── 有氧 ── */
    ["走路 · 慢（4km/h）", 3.0, "有氧", "通勤/饭后散步"],
    ["快走（5.6km/h）", 4.3, "有氧", "能说话但唱不了歌"],
    ["快走 · 爬坡", 6.0, "有氧", "跑步机坡度 8–10%"],
    ["慢跑（8km/h）", 8.3, "有氧", ""],
    ["跑步（10km/h）", 9.8, "有氧", ""],
    ["跑步（12km/h）", 11.5, "有氧", ""],
    ["跳绳", 11.0, "有氧", "效率最高，对膝盖要求也高"],
    ["椭圆机", 5.0, "有氧", "膝友好"],
    ["动感单车 · 中强度", 7.0, "有氧", ""],
    ["划船机", 7.0, "有氧", "全身参与"],
    ["爬楼梯", 8.0, "有氧", ""],
    ["游泳 · 休闲", 6.0, "有氧", ""],
    ["游泳 · 自由泳连续", 8.3, "有氧", ""],
    ["HIIT / 波比跳", 8.5, "有氧", "时间短、后燃效应明显"],

    /* ── 日常 ── */
    ["骑车 · 通勤（<16km/h）", 4.0, "日常", ""],
    ["骑车 · 快（16–19km/h）", 6.8, "日常", ""],
    ["做家务 / 打扫", 3.3, "日常", ""],
    ["站立工作 / 实验操作", 2.3, "日常", "高于久坐，但远低于运动"],
    ["久坐（学习/写代码）", 1.3, "日常", "这是基线，不该当运动记"]
  ];

  var ITEMS = RAW.map(function (r, i) {
    return { id: i, name: r[0], met: r[1], cat: r[2], note: r[3] };
  });
  var CATS = ["力量", "球类", "有氧", "日常"];

  /* 旧数据名 -> 新库名（第一版界面用的是"力量-推""走/其他有氧"这类短名）
     ⚠️ 「羽毛球」故意映射到「休闲对打」以外：旧记录没写强度，
        休闲(5.5) 与单打(7.0) 对 75 分钟差约 100 kcal，一周两次就是 300 kcal/周 ——
        不能替他猜。这里映射到休闲值，但 UI 会把这条标成"待确认"提醒改。 */
  var ALIASES = {
    "力量-推": "力量 · 推（胸肩三头）",
    "力量-拉": "力量 · 拉（背二头）",
    "力量-腿": "力量 · 腿（深蹲/硬拉）",
    "羽毛球": "羽毛球 · 休闲对打",
    "走/其他有氧": "快走（5.6km/h）",
    "休息": null,
    "力量训练": "力量 · 推（胸肩三头）"
  };
  /* 这些旧名是"有歧义"的：迁移后要提示用户确认强度，否则可能少算/多算 */
  var NEEDS_CONFIRM = { "羽毛球": ["羽毛球 · 休闲对打", "羽毛球 · 双打", "羽毛球 · 单打/比赛"] };

  function byCat(c) { return ITEMS.filter(function (x) { return x.cat === c; }); }
  function byName(n) {
    if (!n) return null;
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].name === n) return ITEMS[i];
    var mapped = ALIASES[n];
    if (mapped) {
      for (var j = 0; j < ITEMS.length; j++) if (ITEMS[j].name === mapped) return ITEMS[j];
    }
    return null;
  }
  /* 明确的迁移函数，供 UI 把旧记录显示成新名 */
  function migrateName(n) {
    if (!n) return n;
    if (byName(n) && !ALIASES[n]) return n;
    return ALIASES[n] || n;
  }
  function isKnown(n) { return !!byName(n); }

  /* 总消耗（含静息）—— 与周计划同口径，界面主推这个 */
  function grossKcal(name, weightKg, minutes) {
    var it = byName(name);
    if (!it || !minutes || !weightKg) return 0;
    return Math.round(it.met * weightKg * (minutes / 60));
  }
  /* 两个"净"口径，**不能混用**（我第一版混了，验证者抓到）：
     ① netKcal     = (MET − 1) × kg × h × 1.05        比"躺着不动"多烧多少（仅展示）
     ② marginalKcal= max(0, MET − 1.5) × kg × h × 1.05 比"平时那样过日子"多烧多少
        ← **只有 ② 能加进"今天可吃额度"**

     为什么用 1.5 而不是 1：本机额度基线实测是 **PAL 1.5**
     （derived: tdee_maint 2588 = bmr 1725 × 1.5；我先前在注释里写成 1.2，是错的——
      PAL 1.2 只用在体测页的 maint_true 显示，与缺口额度无关）。
     用 ① 的后果不只是每次多算 (1.5−1)×kg×h×1.05 ≈ 32.5 kcal/50min，
     更严重的是**「久坐 16 小时」这种基线行为会被当成运动加额度**：
     用 ① 会 +375 kcal，而它对 PAL1.5 的真实边际是 −250 kcal（它还在基线之下）。
     所以基线类活动必须归零 —— 见 isBaseline()。

     物理依据：1 MET = 3.5 mL O₂/kg/min = 1.05 kcal/kg/h。 */
  var PAL_BASE = 1.5;
  var BASELINE_CATS = { "日常": true };

  function isBaseline(name) {
    var it = byName(name);
    return !it || !!BASELINE_CATS[it.cat] || it.met <= PAL_BASE;
  }
  function netKcal(name, weightKg, minutes) {
    var it = byName(name);
    if (!it || !minutes || !weightKg) return 0;
    return Math.round((it.met - 1) * weightKg * (minutes / 60) * 1.05);
  }
  function marginalKcal(name, weightKg, minutes) {
    var it = byName(name);
    if (!it || !minutes || !weightKg) return 0;
    if (isBaseline(name)) return 0;
    return Math.round(Math.max(0, it.met - PAL_BASE) * weightKg * (minutes / 60) * 1.05);
  }
  function totalGross(list, w) {
    return (list || []).reduce(function (a, x) { return a + grossKcal(x.name, w, x.min); }, 0);
  }
  function totalNet(list, w) {
    return (list || []).reduce(function (a, x) { return a + netKcal(x.name, w, x.min); }, 0);
  }
  function totalMarginal(list, w) {
    return (list || []).reduce(function (a, x) { return a + marginalKcal(x.name, w, x.min); }, 0);
  }

  g.ActDB = { items: ITEMS, cats: CATS, byCat: byCat, byName: byName, isKnown: isKnown,
              needsConfirm: NEEDS_CONFIRM, PAL_BASE: PAL_BASE, isBaseline: isBaseline,
              marginalKcal: marginalKcal, totalMarginal: totalMarginal,
              migrateName: migrateName, aliases: ALIASES,
              grossKcal: grossKcal, netKcal: netKcal,
              totalGross: totalGross, totalNet: totalNet };
})(window);
