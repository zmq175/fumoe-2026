import { describe,expect,it } from 'vitest'
import { checkDeploymentConfig } from './preflight-lib'

const valid={
  name:'fumoe-2026',main:'src/worker/index.ts',compatibility_date:'2026-07-30',
  assets:{directory:'./dist',binding:'ASSETS'},
  d1_databases:[{binding:'DB',database_name:'fumoe-2026',database_id:'11111111-2222-4333-8444-555555555555'}],
  r2_buckets:[{binding:'MEDIA',bucket_name:'fumoe-assets'}],
  durable_objects:{bindings:[{name:'MATCH_ROOM',class_name:'MatchRoom'}]},
  triggers:{crons:['*/5 * * * *']},
  vars:{APP_ORIGIN:'https://vote.fumoe.cn',BREVO_SENDER:'府萌 <vote@mail.fumoe.cn>',ADMIN_EMAILS:'admin@fumoe.cn'}
}

describe('生产部署预检',()=>{
  it('接受完整的正式配置',()=>{
    expect(checkDeploymentConfig(valid,{turnstileSiteKey:'site-key'})).toEqual([])
  })

  it('拒绝占位资源和示例配置',()=>{
    const issues=checkDeploymentConfig({...valid,d1_databases:[{...valid.d1_databases[0],database_id:'REPLACE_WITH_D1_DATABASE_ID'}],vars:{APP_ORIGIN:'https://fumoe.example.com',BREVO_SENDER:'府萌 <vote@example.com>',ADMIN_EMAILS:''}},{turnstileSiteKey:''})
    expect(issues.map((issue)=>issue.code)).toEqual(['d1-placeholder','origin-placeholder','sender-placeholder','admin-empty','turnstile-site-key'])
  })

  it('拒绝缺失的核心绑定和非 HTTPS 正式地址',()=>{
    const issues=checkDeploymentConfig({...valid,assets:undefined,r2_buckets:[],durable_objects:{bindings:[]},triggers:{crons:[]},vars:{...valid.vars,APP_ORIGIN:'http://vote.fumoe.cn'}},{turnstileSiteKey:'site-key'})
    expect(issues.map((issue)=>issue.code)).toEqual(['assets-binding','r2-binding','durable-object-binding','cron-trigger','origin-https'])
  })
})
