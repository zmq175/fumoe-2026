export type Game = '原神' | '崩坏：星穹铁道' | '绝区零' | '鸣潮' | '碧蓝航线' | '蔚蓝档案' | 'Fate/Grand Order' | '胜利女神：妮姬' | '战双帕弥什' | '明日方舟：终末地' | '异环'

export type Character = {
  id: string
  name: string
  game: Game
  group: string
  seed: number
  officialArtworkKey: string
  galleryArtworkKey?: string | null
  matchArtworkKey?: string | null
  avatarArtworkKey?: string | null
  summary: string
  color: string
}

type Entry = readonly [name: string, game: Game, summary: string]

// Pre-filled editorial roster. Artwork is deliberately absent until an operator verifies
// an official source in assets/characters.manifest.json and uploads approved derivatives.
const entries: Entry[] = [
  ['芙宁娜', '原神', '枫丹的水神，以戏剧感与正义之名守护众人。'], ['雷电将军', '原神', '稻妻的永恒执政者，雷霆与意志的化身。'], ['胡桃', '原神', '往生堂第七十七代堂主，古灵精怪。'], ['纳西妲', '原神', '须弥的草神，以智慧聆听人心。'], ['夜兰', '原神', '璃月总务司神秘情报官。'], ['神里绫华', '原神', '白鹭公主，稻妻社奉行神里家的大小姐。'], ['妮露', '原神', '祖拜尔剧场舞者，舞姿如莲。'], ['申鹤', '原神', '仙家弟子，以红绳锁住尘缘。'], ['宵宫', '原神', '长野原烟花店店主，点亮夏夜的烟火。'], ['克洛琳德', '原神', '枫丹决斗代理人，以剑维护秩序。'], ['阿蕾奇诺', '原神', '愚人众执行官，壁炉之家的家长。'], ['闲云', '原神', '云游尘世的仙人，洞悉众生。'], ['千织', '原神', '来自枫丹的稻妻服装设计师。'], ['希格雯', '原神', '梅洛彼得堡的美露莘护士长。'], ['玛拉妮', '原神', '纳塔的逐浪客，开朗而自由。'], ['茜特菈莉', '原神', '纳塔烟谜主的大萨满。'],
  ['卡芙卡', '崩坏：星穹铁道', '星核猎手，以言语和乐曲编织命运。'], ['黄泉', '崩坏：星穹铁道', '独自行走于虚无命途的巡海游侠。'], ['流萤', '崩坏：星穹铁道', '怀抱微小愿望的少女，也是萨姆的驾驶者。'], ['镜流', '崩坏：星穹铁道', '前代罗浮剑首，剑光如月。'], ['三月七', '崩坏：星穹铁道', '星穹列车开朗的摄影担当。'], ['符玄', '崩坏：星穹铁道', '太卜司太卜，以法眼洞察命途。'], ['黑天鹅', '崩坏：星穹铁道', '流光忆庭的忆者，收藏记忆碎片。'], ['银狼', '崩坏：星穹铁道', '天才骇客，视现实为大型游戏。'], ['阮·梅', '崩坏：星穹铁道', '生命科学领域的天才俱乐部成员。'], ['花火', '崩坏：星穹铁道', '假面愚者，擅长将舞台化为现实。'], ['知更鸟', '崩坏：星穹铁道', '匹诺康尼的银河歌者。'], ['翡翠', '崩坏：星穹铁道', '战略投资部的冷静谈判者。'], ['飞霄', '崩坏：星穹铁道', '仙舟曜青的天击将军。'], ['灵砂', '崩坏：星穹铁道', '丹鼎司新任司鼎，善于调香。'], ['大黑塔', '崩坏：星穹铁道', '天才俱乐部会员，以傀儡游历宇宙。'], ['遐蝶', '崩坏：星穹铁道', '翁法罗斯的冥河引路人。'],
  ['艾莲', '绝区零', '维多利亚家政成员，安静的鲨鱼少女。'], ['朱鸢', '绝区零', '新艾利都治安局刑侦特勤组长。'], ['简', '绝区零', '神秘又危险的特别行动组成员。'], ['耀嘉音', '绝区零', '新艾利都最耀眼的偶像。'], ['伊芙琳', '绝区零', '与耀嘉音并肩的贴身护卫。'], ['格莉丝', '绝区零', '白祇重工的机械天才。'], ['妮可', '绝区零', '狡兔屋创始人，精于生意之道。'], ['雅', '绝区零', '对空六课课长，以太刀守护新艾利都。'], ['青衣', '绝区零', '治安局的老资格人工智能。'], ['露西', '绝区零', '卡吕冬之子的火爆策士。'], ['派派', '绝区零', '卡吕冬之子的可靠驾驶员。'], ['可琳', '绝区零', '维多利亚家政的女仆，挥舞电锯。'], ['苍角', '绝区零', '对空六课成员，热爱美食。'], ['柏妮思', '绝区零', '卡吕冬之子的燃油调酒师。'], ['扳机', '绝区零', '新艾利都防卫军的狙击手。'], ['仪玄', '绝区零', '云岿山观主，深藏不露的宗师。'],
  ['长离', '鸣潮', '今州令尹参事，筹谋于无形之间。'], ['椿', '鸣潮', '黑海岸的巡尉，寻觅真实与归处。'], ['守岸人', '鸣潮', '黑海岸的核心终端，静候长久的约定。'], ['今汐', '鸣潮', '今州令尹，承载岁主之力。'], ['卡提希娅', '鸣潮', '与风同行的骑士，纯粹而坚定。'], ['珂莱塔', '鸣潮', '翡萨烈家族二小姐，优雅而锋利。'], ['吟霖', '鸣潮', '前巡尉，擅长审问与追踪。'], ['秧秧', '鸣潮', '夜归成员，声音可感知风的痕迹。'], ['鉴心', '鸣潮', '今州的拳师，以心观万象。'], ['散华', '鸣潮', '今州令尹近侍，冷静而忠诚。'], ['白芷', '鸣潮', '华胥研究院的研究员。'], ['丹瑾', '鸣潮', '漂泊各地的流浪者，以血刃惩恶。'], ['桃祈', '鸣潮', '今州边防军的工事专家。'], ['菲比', '鸣潮', '隐海修会的颂诗者。'], ['赞妮', '鸣潮', '黎那汐塔的高效雇员。'], ['露帕', '鸣潮', '在竞技场中追逐荣耀的斗士。'],
  ['企业', '碧蓝航线', '白鹰阵营航母，沉稳可靠的传奇舰船。'], ['能代', '碧蓝航线', '重樱轻巡，认真且温柔。'], ['大凤', '碧蓝航线', '重樱航母，炽热又执着。'], ['圣路易斯', '碧蓝航线', '优雅强大的白鹰重巡。'], ['信浓', '碧蓝航线', '重樱大和级航母，常在梦境中低语。'], ['可畏', '碧蓝航线', '皇家装甲航母，傲娇而高贵。'], ['花园', '碧蓝航线', '白鹰战列舰，充满活力的王牌。'], ['武藏', '碧蓝航线', '重樱大和级战列舰，威严而从容。'], ['阿尔萨斯', '碧蓝航线', '自由鸢尾战列舰，执着于正义。'], ['贝尔法斯特', '碧蓝航线', '皇家女仆长，完美而沉着。'],
  ['阿罗娜', '蔚蓝档案', '什亭之箱的引导者，陪伴老师的少女。'], ['圣园未花', '蔚蓝档案', '茶会的天真领袖，笑容明亮。'], ['天雨亚子', '蔚蓝档案', '风纪委员会行政官，严谨而可靠。'], ['砂狼白子', '蔚蓝档案', '阿比多斯对策委员会成员。'], ['陆八魔爱露', '蔚蓝档案', '便利屋68社长，想成为帅气反派。'], ['空崎日奈', '蔚蓝档案', '风纪委员会会长，冷酷又怕麻烦。'], ['天童爱丽丝', '蔚蓝档案', '游戏开发部的公主，向往冒险。'], ['伊落玛丽', '蔚蓝档案', '三一综合学园的正义实现委员。'], ['一之濑明日奈', '蔚蓝档案', 'C&C特工，开朗而善解人意。'], ['早濑优香', '蔚蓝档案', '千年学园研讨会会计，精于计算。'],
  ['阿尔托莉雅·潘德拉贡', 'Fate/Grand Order', '拔出石中剑的骑士王。'], ['玛修·基列莱特', 'Fate/Grand Order', '迦勒底的后辈，以盾守护未来。'], ['斯卡哈', 'Fate/Grand Order', '影之国女王，传授枪术的导师。'], ['伊什塔尔', 'Fate/Grand Order', '来自天际的女神，华丽且任性。'], ['摩根', 'Fate/Grand Order', '不列颠异闻带的女王。'], ['尼禄·克劳狄乌斯', 'Fate/Grand Order', '自称艺术之花的罗马皇帝。'], ['贞德', 'Fate/Grand Order', '响应祈祷而来的圣女。'], ['梅林', 'Fate/Grand Order', '花之魔术师，善于讲述梦境。'], ['BB', 'Fate/Grand Order', '月之背面的后辈型人工智能。'], ['两仪式', 'Fate/Grand Order', '直死之魔眼的持有者。'],
  ['阿妮斯', '胜利女神：妮姬', '反击部队成员，直率且重情。'], ['红莲', '胜利女神：妮姬', '朝圣者之一，以剑守护人类。'], ['桃乐丝', '胜利女神：妮姬', '伊甸的领袖，背负旧日伤痕。'], ['拉毗', '胜利女神：妮姬', '反击部队的冷静核心。'], ['爱丽丝', '胜利女神：妮姬', '以童话和勇气面对战斗的少女。'], ['神罚', '胜利女神：妮姬', '朝圣者，承载旧日的奇迹。'], ['海伦', '胜利女神：妮姬', '绝对部队成员，自信而耀眼。'], ['诺伊斯', '胜利女神：妮姬', '绝对部队成员，舞台上的歌手。'], ['樱花', '胜利女神：妮姬', '牡丹会首领，温婉又果断。'], ['伊莎贝尔', '胜利女神：妮姬', '朝圣者，带着执着的温柔。'],
  ['露西亚', '战双帕弥什', '灰鸦小队队长，始终守望人类。'], ['丽芙', '战双帕弥什', '温柔坚韧的支援型构造体。'], ['薇拉', '战双帕弥什', '渡边小队成员，野性而果决。'], ['曲', '战双帕弥什', '九龙众的首领，理性且优雅。'], ['赛琳娜', '战双帕弥什', '被遗忘的舞者，以歌声守望。'], ['罗塞塔', '战双帕弥什', '遗忘者的骑士，守护绿洲。'], ['含英', '战双帕弥什', '九龙商会成员，擅长布局。'], ['21号', '战双帕弥什', '专精改造的实验型构造体。'],
  ['陈千语', '明日方舟：终末地', '终末地工业体系中的年轻领航者。'], ['管理员', '明日方舟：终末地', '深入塔卫二的终末地管理者。'], ['赛希', '明日方舟：终末地', '擅长在荒野间探索与战斗。'], ['佩丽卡', '明日方舟：终末地', '活跃于终末地前线的干员。'], ['安洁莉娜', '明日方舟：终末地', '终末地世界中的探索者。'], ['黎风', '明日方舟：终末地', '在塔卫二前线执行任务的干员。'], ['艾维文娜', '明日方舟：终末地', '擅长处理异常生态的终末地成员。'], ['余烬', '明日方舟：终末地', '参与荒野开拓的年轻干员。'],
  ['安魂曲', '异环', '海特洛市中神秘的异象处理者。'], ['娜娜莉', '异环', '异象猎人事务所的活力成员。'], ['薄荷', '异环', '与都市异象共处的年轻调查员。'], ['早雾', '异环', '穿梭在城市霓虹间的灵异专家。'], ['白藏', '异环', '异象管理局 E.T.D 四队队长，以言灵掌控战局。'], ['法帝娅', '异环', '以生命与痛苦为力量、守护队友的异能者。'], ['哈索尔', '异环', '斯特利速递的精英快递员，严格执行每项计划。'], ['九原', '异环', '斯特利速递代理店长，擅长情报与玫瑰契约。']
]

const palettes = ['#3ccfff', '#7948ea', '#ff8d1a', '#43cf7c', '#ef5b7e', '#2a82e4', '#cf5bdd', '#d43030']
export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
export const GROUP_SIZE = 16

export const characters: Character[] = entries.map(([name, game, summary], index) => ({
  id: `c${String(index + 1).padStart(3, '0')}`,
  name,
  game,
  summary,
  group: GROUPS[index % GROUPS.length],
  seed: index + 1,
  officialArtworkKey: `characters/c${String(index + 1).padStart(3, '0')}/gallery.webp`,
  color: palettes[index % palettes.length]
}))

export type Match = {
  id: string
  group: string
  round: number
  left: Character
  right: Character
  leftVotes: number
  rightVotes: number
  startsAt: string
  endsAt: string
  status: 'upcoming' | 'live' | 'closed'
}

export type SwissRecord = { character: Character; points: number; voteDifference: number; opponentPoints: number; opponents: string[] }

export function createSwissRound(records: SwissRecord[], _round: number): Array<[SwissRecord, SwissRecord]> {
  void _round
  const pool = [...records].sort((a, b) => b.points - a.points || b.opponentPoints - a.opponentPoints || b.voteDifference - a.voteDifference || a.character.seed - b.character.seed)
  const pairs: Array<[SwissRecord, SwissRecord]> = []
  while (pool.length) {
    const left = pool.shift()!
    const index = pool.findIndex((candidate) => !left.opponents.includes(candidate.character.id) && candidate.character.game !== left.character.game)
    const fallback = pool.findIndex((candidate) => !left.opponents.includes(candidate.character.id))
    const right = pool.splice(index >= 0 ? index : fallback >= 0 ? fallback : 0, 1)[0]
    pairs.push([left, right])
  }
  return pairs
}

const byId = (id: string) => characters.find((character) => character.id === id)!
const today = new Date()
const end = new Date(today.getTime() + 1000 * 60 * 60 * 18)
const samplePairings = [['c001', 'c018'], ['c033', 'c052'], ['c067', 'c078'], ['c089', 'c105'], ['c005', 'c045'], ['c021', 'c084'], ['c058', 'c072'], ['c111', 'c126']]
export const matches: Match[] = samplePairings.map(([left, right], index) => ({
  id: `demo-m${String(index + 1).padStart(2, '0')}`,
  group: GROUPS[index],
  round: 1,
  left: byId(left), right: byId(right),
  leftVotes: index < 4 ? 1824 + index * 241 : 0,
  rightVotes: index < 4 ? 1759 + index * 153 : 0,
  startsAt: today.toISOString(), endsAt: end.toISOString(), status: index < 4 ? 'live' : 'upcoming'
}))

export const games = [...new Set(characters.map((character) => character.game))]
export const gameQuotas = Object.fromEntries(games.map((game) => [game, characters.filter((character) => character.game === game).length])) as Record<Game, number>
