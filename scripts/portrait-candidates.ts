export type PortraitCandidate = {
  title: string
  width: number
  height: number
  bytes?: number
  url?: string
  mime?: string
}

const preferredPattern = /无背景[-_－—\s]*角色|角色[-_－—\s]*(?:头像|图标)|(?:头像|图标)[-_－—\s]*角色|角色头图|小头像|头像|character[-_\s]*(?:icon|avatar)|(?:icon|avatar)[-_\s]*character/i
const rejectedPattern = /立绘|全身|原画|卡牌|技能|命座|天赋|武器|敌人|多人|合照|皮肤|换装|时装|海报|壁纸|logo|徽章|表情|剧情|宣传|抽卡/i

export function normalizePortraitName(value: string) {
  return value.toLowerCase().normalize('NFKC').replace(/[·・：:／/\s_\-—–.'’"“”()（）\[\]【】]/g, '')
}

export function portraitCandidateDecision(candidate: PortraitCandidate, name: string, aliases: string[] = []) {
  const title = decodeURIComponent(candidate.title)
  const normalizedTitle = normalizePortraitName(title)
  const names = [name, ...aliases].map(normalizePortraitName).filter(Boolean)
  const ratio = candidate.width / Math.max(1, candidate.height)
  let score = 0

  if (!names.some((value) => normalizedTitle.includes(value))) {
    return { status: 'rejected' as const, reason: '文件名未命中角色名或别名', score: -1_000 }
  }
  score += 400
  if (!preferredPattern.test(title)) {
    return { status: 'rejected' as const, reason: '文件名不是角色头像或游戏图标', score }
  }
  score += 500
  if (rejectedPattern.test(title)) {
    return { status: 'rejected' as const, reason: '文件名包含非头像素材关键词', score: score - 1_000 }
  }
  if (candidate.width < 64 || candidate.height < 64) {
    return { status: 'rejected' as const, reason: '头像分辨率低于 64×64', score: score - 500 }
  }
  if (ratio < 0.8 || ratio > 1.25) {
    return { status: 'rejected' as const, reason: '头像不是近似方形', score: score - 500 }
  }
  score += 200
  if (candidate.width >= 128 && candidate.height >= 128) score += 100
  if (candidate.mime === 'image/png' || candidate.mime === 'image/webp') score += 50
  return { status: 'recommended' as const, reason: '角色名、头像类型和方形构图均通过', score }
}

export function selectPortraitCandidate(candidates: PortraitCandidate[], name: string, aliases: string[] = []) {
  return candidates
    .map((candidate) => ({ ...candidate, decision: portraitCandidateDecision(candidate, name, aliases) }))
    .filter((candidate) => candidate.decision.status === 'recommended')
    .sort((left, right) => right.decision.score - left.decision.score || right.width * right.height - left.width * left.height)[0] ?? null
}
