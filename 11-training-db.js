/* ═══════════════════════════════════════════════════════════════
   11-training-db.js · 训练计划库（新手 / 进阶 / 高手 三档）
   ─────────────────────────────────────────────────────────────
   用户要求：动作与组次分多档，且**不同档位用不同的训练分化**。
   设计依据（不是随便分）：
     新手（<6 个月系统训练）：全身 3 练。每个肌群每周练 3 次，
       神经适应快、恢复需求低，且动作学习需要高频重复。
     进阶（6 个月–2 年）：推/拉/腿 3 练。可以承受更高单肌群容量，
       分化后每次训练更聚焦。
     高手（>2 年）：上/下 4 练 + 更高容量与强度技巧（递减组/停顿/离心控制）。

   每个动作都给：组×次、组间休息、要点、**做不动时的替换动作**。
   休息时间是很多人忽略的变量 —— 减脂期缩短休息会明显抬高心率与消耗，
   但它同时降低力量表现，所以两档都给，让用户自己权衡。
   ═══════════════════════════════════════════════════════════════ */
(function (g) {
  "use strict";

  var LEVELS = [
    {
      key: "beginner", label: "新手", sub: "系统训练 < 6 个月",
      split: "全身 3 练", perWeek: 3, min: 45,
      why: "全身三分化：每个肌群每周练到 3 次。新手神经适应最快、恢复需求最低，" +
           "动作学习也需要高频重复 —— 这个阶段「练得勤」比「练得重」重要。",
      rest: "60–90 秒",
      days: [
        { d: "第 1 练 · 全身 A", focus: "蹲 + 推", items: [
          { name: "高脚杯深蹲", sets: "3 组 × 10", cue: "脚尖略外八，膝跟脚尖同向，蹲到大腿平行", alt: "腿举 / 自重深蹲" },
          { name: "哑铃卧推", sets: "3 组 × 10", cue: "肩胛后收下沉，落点在乳头连线，别弹胸", alt: "俯卧撑 / 器械推胸" },
          { name: "坐姿划船", sets: "3 组 × 10", cue: "躯干别晃，肩胛骨主动夹紧", alt: "弹力带划船" },
          { name: "平板支撑", sets: "3 组 × 40 秒", cue: "屁股别翘，肋骨往下收", alt: "死虫式" }
        ]},
        { d: "第 2 练 · 全身 B", focus: "髋 + 拉", items: [
          { name: "罗马尼亚硬拉（哑铃）", sets: "3 组 × 10", cue: "背挺直，靠屈髋不是弯腰；腘绳肌有拉伸感就对了", alt: "腿弯举" },
          { name: "高位下拉", sets: "3 组 × 10", cue: "先沉肩再拉，想「肘往下走」而不是「手往下拉」", alt: "引体（做不了就做这个）" },
          { name: "坐姿肩推", sets: "3 组 × 10", cue: "腰别过度反弓，核心收紧", alt: "哑铃侧平举" },
          { name: "站姿提踵", sets: "3 组 × 15", cue: "顶住 1 秒再下", alt: "—" }
        ]},
        { d: "第 3 练 · 全身 C", focus: "补弱项 + 核心", items: [
          { name: "哑铃弓步蹲", sets: "3 组 × 10/腿", cue: "前膝别内扣，后膝轻触地", alt: "分腿蹲" },
          { name: "绳索下压（三头）", sets: "3 组 × 12", cue: "肘固定在体侧，只有小臂动", alt: "窄距俯卧撑" },
          { name: "哑铃弯举", sets: "3 组 × 12", cue: "肘不前后移动", alt: "锤式弯举" },
          { name: "侧平举", sets: "3 组 × 12–15", cue: "小重量，想象「倒水」而不是「举起来」", alt: "弹力带侧平举" }
        ]}
      ]
    },
    {
      key: "intermediate", label: "进阶", sub: "系统训练 6 个月 – 2 年",
      split: "推 / 拉 / 腿 3 练", perWeek: 3, min: 55,
      why: "分化后每次只练 1–2 个肌群，单肌群容量可以拉高，动作质量更好。" +
           "此时「渐进超负荷」是唯一主线：重量或次数每周要有一样在涨。",
      rest: "90–120 秒（复合动作）",
      days: [
        { d: "推（胸 · 肩 · 三头）", focus: "水平推 + 垂直推", items: [
          { name: "杠铃/哑铃卧推", sets: "4 组 × 6–8", cue: "大重量优先，留 1–2 次余力", alt: "器械推胸" },
          { name: "上斜哑铃卧推", sets: "3 组 × 8–10", cue: "30° 上斜，练上胸", alt: "上斜器械推" },
          { name: "坐姿肩推", sets: "4 组 × 8", cue: "肘略前于身体，别完全打开", alt: "史密斯肩推" },
          { name: "侧平举", sets: "3 组 × 12–15", cue: "小重量多次数，顶峰停 1 秒", alt: "绳索侧平举" },
          { name: "绳索下压 / 窄距卧推", sets: "3 组 × 10–12", cue: "三头收尾", alt: "—" }
        ]},
        { d: "拉（背 · 二头）", focus: "垂直拉 + 水平拉", items: [
          { name: "引体向上 / 高位下拉", sets: "4 组 × 6–10", cue: "做不动引体就用下拉，别用甩的", alt: "辅助引体机" },
          { name: "杠铃/哑铃划船", sets: "4 组 × 8–10", cue: "躯干保持 45°，拉向下腹", alt: "坐姿器械划船" },
          { name: "单臂哑铃划船", sets: "3 组 × 10/侧", cue: "别转体，肘贴身走", alt: "—" },
          { name: "面拉（Face Pull）", sets: "3 组 × 15", cue: "专治圆肩，久坐族必做，重量要轻", alt: "反向飞鸟" },
          { name: "哑铃弯举", sets: "3 组 × 10", cue: "二头收尾，肘别晃", alt: "锤式弯举" }
        ]},
        { d: "腿（股四 · 腘绳 · 臀 · 小腿）", focus: "蹲 + 硬拉", items: [
          { name: "深蹲（杠铃/史密斯）", sets: "4 组 × 6–8", cue: "核心绷紧，蹲到平行或略低", alt: "腿举" },
          { name: "罗马尼亚硬拉", sets: "4 组 × 8", cue: "靠屈髋，背别圆", alt: "腿弯举" },
          { name: "腿举", sets: "3 组 × 10–12", cue: "膝别锁死，下放到 90°", alt: "箭步蹲" },
          { name: "腿弯举", sets: "3 组 × 12", cue: "顶峰夹一下", alt: "臀桥" },
          { name: "站姿提踵", sets: "4 组 × 15", cue: "全幅度，顶住 1 秒", alt: "坐姿提踵" }
        ]}
      ]
    },
    {
      key: "advanced", label: "高手", sub: "系统训练 > 2 年",
      split: "上 / 下 4 练", perWeek: 4, min: 65,
      why: "上下肢分化 × 每周 4 次，每个肌群每周练到 2 次且容量更高。" +
           "这个阶段常规线性增重已经推不动，需要**强度技巧**（递减组、停顿、离心控制、超级组）来制造新刺激。",
      rest: "复合 2–3 分钟 / 孤立 60–90 秒",
      days: [
        { d: "上肢 A（推为主）", focus: "力量优先", items: [
          { name: "卧推（主项）", sets: "5 组 × 4–6", cue: "留 1 次余力，组间 2–3 分钟", alt: "哑铃卧推" },
          { name: "站姿推举（主项）", sets: "4 组 × 6", cue: "核心顶住，别塌腰", alt: "坐姿肩推" },
          { name: "上斜哑铃卧推", sets: "3 组 × 8–10", cue: "最后一组做递减组", alt: "—" },
          { name: "侧平举（超级组）", sets: "4 组 × 15 + 15", cue: "接后束飞鸟，不休息", alt: "绳索侧平举" },
          { name: "三头绳索下压", sets: "3 组 × 12", cue: "离心 3 秒下放", alt: "窄距卧推" }
        ]},
        { d: "下肢 A（股四为主）", focus: "深蹲力量", items: [
          { name: "深蹲（主项）", sets: "5 组 × 4–6", cue: "留 1 次余力，深度到位", alt: "前蹲" },
          { name: "腿举", sets: "4 组 × 10", cue: "最后一组递减", alt: "哈克深蹲" },
          { name: "腿屈伸", sets: "3 组 × 12–15", cue: "顶峰停 2 秒", alt: "—" },
          { name: "罗马尼亚硬拉", sets: "3 组 × 8", cue: "控制离心", alt: "腿弯举" },
          { name: "站姿提踵", sets: "5 组 × 12", cue: "停顿 + 全幅度", alt: "坐姿提踵" }
        ]},
        { d: "上肢 B（拉为主）", focus: "背部厚度与宽度", items: [
          { name: "引体向上（负重）", sets: "5 组 × 5–8", cue: "做不了就加助力，别甩", alt: "高位下拉" },
          { name: "杠铃划船（主项）", sets: "4 组 × 6–8", cue: "背别圆，拉向下腹", alt: "T 杠划船" },
          { name: "宽握高位下拉", sets: "3 组 × 10–12", cue: "控制离心 3 秒", alt: "—" },
          { name: "单臂哑铃划船", sets: "3 组 × 10/侧", cue: "顶峰挤一下", alt: "—" },
          { name: "面拉 + 弯举（超级组）", sets: "4 组 × 15 + 10", cue: "不休息连着做", alt: "—" }
        ]},
        { d: "下肢 B（腘绳 · 臀为主）", focus: "髋铰链", items: [
          { name: "硬拉（主项）", sets: "4 组 × 4–5", cue: "传统/相扑二选一，注意腰背中立", alt: "罗马尼亚硬拉" },
          { name: "臀桥 / 臀推", sets: "4 组 × 8–10", cue: "顶峰夹臀 1 秒", alt: "—" },
          { name: "腿弯举", sets: "4 组 × 10–12", cue: "离心 3 秒", alt: "北欧腿弯举" },
          { name: "分腿蹲", sets: "3 组 × 10/腿", cue: "躯干略前倾练臀", alt: "箭步蹲" },
          { name: "坐姿提踵", sets: "4 组 × 15", cue: "停顿 + 全幅度", alt: "站姿提踵" }
        ]}
      ]
    }
  ];

  /* 通用纪律（三档共用，但措辞按档位微调） */
  var RULES = [
    "**渐进超负荷是唯一主线**：每周让「重量」或「次数」或「组数」有一样在涨。三样都不涨，就等于没练。",
    "**留 1–2 次余力**：每组练到「还能再做 1–2 次」就停。练到力竭会明显拖慢恢复，减脂期尤其不划算。",
    "**减脂期守强度、不守容量**：保持重量不掉，组数可以减。掉重量 = 掉肌肉的信号。",
    "**动作做不动就换替换动作**，不要为了完成计划而甩、弹、借力。",
    "**热身**：主项前 2 组递增重量热身（空杆 → 50% → 75%），不计入正式组。",
    "**疼痛≠酸痛**：关节刺痛立刻停。延迟性酸痛（DOMS）1–3 天属正常。"
  ];

  function byKey(k) {
    for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i].key === k) return LEVELS[i];
    return LEVELS[0];
  }
  function dayOf(levelKey, dayIdx) {
    var L = byKey(levelKey);
    return L.days[dayIdx % L.days.length];
  }
  /* 建议：按训练年限推默认档位 */
  function suggest(trainingMonths) {
    var m = Number(trainingMonths) || 0;
    if (m < 6) return "beginner";
    if (m < 24) return "intermediate";
    return "advanced";
  }
  /* 换档时把当前档位的"分化说明"给出来，便于用户理解差别 */
  function summary() {
    return LEVELS.map(function (L) {
      return { key: L.key, label: L.label, sub: L.sub, split: L.split,
               perWeek: L.perWeek, min: L.min, days: L.days.length, why: L.why };
    });
  }

  /* 跨模块一致性自检（可被构建/验收脚本调用）：
     PAL_BASE 若在两个模块里不一致，「维持热量」与「运动边际额度」会各用一套基线，
     同一份运动被算两次。这种错很隐蔽，所以做成机器可检查的。 */
  function selfCheck() {
    var out = [];
    var a = (g.ActDB && g.ActDB.PAL_BASE), b = (g.Goal && g.Goal.PAL_BASE);
    if (a !== b) out.push("PAL_BASE 不一致: ActDB=" + a + " Goal=" + b);
    if (!g.ActDB || !g.ActDB.items || g.ActDB.items.length < 20) out.push("ActDB 运动项过少");
    if (!g.TrainDB || g.TrainDB.levels.length !== 3) out.push("训练档位不是 3 档");
    g.TrainDB.levels.forEach(function (L) {
      if (!L.days || !L.days.length) out.push(L.label + " 档没有训练日");
      L.days.forEach(function (d) {
        if (!d.items || !d.items.length) out.push(L.label + " 的「" + d.d + "」没有动作");
      });
    });
    return out;
  }

  g.TrainDB = { levels: LEVELS, rules: RULES, byKey: byKey, dayOf: dayOf,
                suggest: suggest, summary: summary, selfCheck: selfCheck };
})(window);
