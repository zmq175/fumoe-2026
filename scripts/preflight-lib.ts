type Issue={code:string;message:string}
type DeploymentConfig={
  assets?:{directory?:string;binding?:string}
  d1_databases?:Array<{binding?:string;database_id?:string}>
  r2_buckets?:Array<{binding?:string}>
  durable_objects?:{bindings?:Array<{name?:string;class_name?:string}>}
  triggers?:{crons?:string[]}
  vars?:{APP_ORIGIN?:string;BREVO_SENDER?:string;ADMIN_EMAILS?:string}
}

const issue=(code:string,message:string):Issue=>({code,message})

export function checkDeploymentConfig(config:DeploymentConfig,environment:{turnstileSiteKey?:string}) {
  const issues:Issue[]=[]
  const d1=config.d1_databases?.find((binding)=>binding.binding==='DB')
  if(!d1)issues.push(issue('d1-binding','缺少 DB D1 绑定'))
  else if(!d1.database_id||d1.database_id.includes('REPLACE_'))issues.push(issue('d1-placeholder','D1 database_id 仍是占位值'))
  if(!config.assets?.directory||config.assets.binding!=='ASSETS')issues.push(issue('assets-binding','缺少 ASSETS 静态资源绑定'))
  if(!config.r2_buckets?.some((binding)=>binding.binding==='MEDIA'))issues.push(issue('r2-binding','缺少 MEDIA R2 绑定'))
  if(!config.durable_objects?.bindings?.some((binding)=>binding.name==='MATCH_ROOM'&&binding.class_name==='MatchRoom'))issues.push(issue('durable-object-binding','缺少 MATCH_ROOM Durable Object 绑定'))
  if(!config.triggers?.crons?.length)issues.push(issue('cron-trigger','未配置自动赛程 cron'))
  const origin=config.vars?.APP_ORIGIN??''
  if(origin.includes('example.com'))issues.push(issue('origin-placeholder','APP_ORIGIN 仍是示例域名'))
  else if(!origin.startsWith('https://'))issues.push(issue('origin-https','APP_ORIGIN 必须使用 HTTPS'))
  const sender=config.vars?.BREVO_SENDER??''
  if(sender.includes('@example.com'))issues.push(issue('sender-placeholder','BREVO_SENDER 仍是示例地址'))
  if(!(config.vars?.ADMIN_EMAILS??'').trim())issues.push(issue('admin-empty','ADMIN_EMAILS 不能为空'))
  if(!environment.turnstileSiteKey?.trim())issues.push(issue('turnstile-site-key','构建环境缺少 VITE_TURNSTILE_SITE_KEY'))
  return issues
}
