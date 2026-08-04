import {describe,expect,it} from 'vitest'
import {apiErrorMessage} from './api'

describe('接口错误文案',()=>{
  it('将服务端校验错误对象转换为可读提示',()=>{
    expect(apiErrorMessage({name:'ZodError',message:'validation details'})).toBe('请求格式不正确，请刷新页面后重试')
  })

  it('保留服务端字符串错误并为未知值使用兜底文案',()=>{
    expect(apiErrorMessage('当前对局不可投票')).toBe('当前对局不可投票')
    expect(apiErrorMessage({})).toBe('请求暂时失败，请稍后重试')
  })
})
