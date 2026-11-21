// Chinese names of the spell mechanics used by this travelling witch.
export default {
  book: {
    charm:{name:'魔力弹',desc:'用杖尖射出一点明亮的魔力，按住左键可以连续施放。',small:'魔力弹',smallDesc:'朝准星射出一道追踪光弹。'},
    fire:{name:'火魔法',desc:'凝聚热量，点燃草木或融开冰层。',small:'火球',smallDesc:'火球在落点散开。',big:'爆炎',bigDesc:'蓄力后投出更大的火球，在落点留下火圈。'},
    water:{name:'水魔法',desc:'收拢空气中的水分。可以扑灭火焰，也能让干燥的表面变湿。',small:'水弹',smallDesc:'水珠打湿附近的物体，轻轻推开它们。',big:'雨云',bigDesc:'在指定位置聚起一朵雨云。'},
    ice:{name:'冰魔法',desc:'湿润的物体容易结冰。结实的冰层也可以用来落脚。',small:'冰枪',smallDesc:'射出冰晶，接触水面时凝出浮冰。',big:'冰台',bigDesc:'让寒气在目标处汇聚成一座冰台。'},
    wind:{name:'风魔法',desc:'林间风向常变。让杖尖对准目标，用一股短促的风拨动它。',small:'风刃',smallDesc:'向前送出一束风。在芙兰的空地可以用它碰响空中的练习星。',big:'上升气流',bigDesc:'在目标处卷起一阵能托起重物的旋风。'},
    thunder:{name:'雷魔法',desc:'水和金属能够传导电流。',small:'落雷',smallDesc:'一道闪电落向准星所在处。',big:'雷暴',bigDesc:'在一片区域内连续落下雷电。'},
    earth:{name:'岩石魔法',desc:'用魔力移动土石，改变脚下能够站立的位置。',small:'石柱',smallDesc:'从地面抬起一根石柱。',big:'落石',bigDesc:'一颗沉重的岩石从高处坠下。'},
    sun:{name:'光魔法',desc:'把明亮的魔力留在身边，也能为一小段夜路照明。',small:'光球',smallDesc:'让一团光在身边停留。',big:'光束',bigDesc:'持续将魔力集中在一个方向。'},
    moon:{name:'牵引魔法',desc:'牵住远处的物体，改变它的去向。',small:'悬浮',smallDesc:'将准星处的物体提到身前。再次施放可以掷出。',big:'缓速领域',bigDesc:'在目标位置放慢物体的移动。'},
    guard:{name:'防护魔法',desc:'按住 R 在身前撑起一道光盾。在法术撞上来的瞬间张开可以将它弹回。',small:'防护罩',smallDesc:'按住维持保护。'},
    shikigami:{name:'飞鸟使魔',desc:'让一对魔法飞鸟在身边盘旋。',small:'飞鸟',smallDesc:'召来一对飞鸟。'},
    kinkan:{name:'聚光',desc:'积蓄的魔力可以化成一道光柱。',small:'聚光',smallDesc:'魔力充满时施放。'},
  },
  msg:{noMana:'魔力不足',cooldown:'{name}还在恢复',unknown:'还没有学会这项魔法',gaugeEmpty:'魔力尚未聚满',gaugeFull:'魔力已经聚满',cranesOut:'飞鸟已在身边',learned:'学会了{name}',learnedBig:'学会了{name}的进阶术式「{big}」',perfect:'弹开了！',struggleWin:'挡住了光束',struggleLose:'光束突破了防护',nothingToGrab:'这里没有可牵引的物体'},
};
