export type VoteChoice={matchId:string;characterId:string}
export type ExistingVote=VoteChoice&{riskStatus:'approved'|'pending'|'rejected'|'revoked';createdAt:string}
export type VoteMatch={id:string;leftCharacterId:string;rightCharacterId:string;status:string;startsAt:string;endsAt:string;seasonStatus:string;isCurrent:number}
type BatchVoteRequest={choices:VoteChoice[];deviceFingerprint?:string}
type LegacyVoteRequest=VoteChoice&{deviceFingerprint?:string;turnstileToken?:string}

export function normalizeVoteRequest(input:BatchVoteRequest|LegacyVoteRequest) {
  return 'choices' in input
    ? {choices:input.choices,deviceFingerprint:input.deviceFingerprint,legacy:false as const}
    : {choices:[{matchId:input.matchId,characterId:input.characterId}],deviceFingerprint:input.deviceFingerprint,legacy:true as const}
}

export function scheduleScorePublications(tasks:Promise<unknown>[],waitUntil:(task:Promise<unknown>)=>void) {
  waitUntil(Promise.allSettled(tasks))
}

export function planBatchVotes(choices:VoteChoice[],matches:VoteMatch[],existingVotes:ExistingVote[],now:string):{ok:true;newVotes:VoteChoice[];existingVotes:ExistingVote[]}|{ok:false;error:string} {
  if(new Set(choices.map((choice)=>choice.matchId)).size!==choices.length)return{ok:false,error:'同一场次不能重复选择'}
  const matchesById=new Map(matches.map((match)=>[match.id,match]))
  const existingByMatch=new Map(existingVotes.map((vote)=>[vote.matchId,vote]))
  const currentTime=new Date(now).getTime()
  const newVotes:VoteChoice[]=[]
  const existing:ExistingVote[]=[]
  for(const choice of choices){
    const prior=existingByMatch.get(choice.matchId)
    if(prior){existing.push(prior);continue}
    const match=matchesById.get(choice.matchId)
    if(!match||match.status!=='live'||match.seasonStatus!=='live'||!match.isCurrent||currentTime<new Date(match.startsAt).getTime()||currentTime>=new Date(match.endsAt).getTime())return{ok:false,error:'所选场次当前不可投票'}
    if(![match.leftCharacterId,match.rightCharacterId].includes(choice.characterId))return{ok:false,error:'所选角色不属于对应场次'}
    newVotes.push(choice)
  }
  return{ok:true,newVotes,existingVotes:existing}
}
