import { useRef } from 'react'
import { X } from 'lucide-react'

const releases = [
  {
    version: '0.1.0',
    changes: [
      '首页和对局中心优先显示已取得的赛事数据，慢速网络下可以重试。',
      '新增页面加载、图片和投票反馈的耗时统计。',
    ],
  },
  {
    version: '0.2.0',
    changes: [
      '投票页现在分别统计白屏、可以选人、首屏图片与整页图片加载完成的耗时。',
      '点击页脚版本号，可以查看历次更新。',
    ],
  },
].sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }))

export function FooterVersion({ email }: { email?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  return <>
    <p>{email && <>{email} 已登录 · </>}
      <button type="button" className="footer-version" aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
        v{releases[0].version} · 更新日志
      </button>
    </p>
    <dialog ref={dialog} className="release-notes" aria-labelledby="release-notes-title">
      <button type="button" className="dialog-close" aria-label="关闭更新日志" onClick={() => dialog.current?.close()}><X /></button>
      <h2 id="release-notes-title">更新日志</h2>
      {releases.map(release => <section key={release.version}>
        <h3>v{release.version}</h3>
        <ul>{release.changes.map(change => <li key={change}>{change}</li>)}</ul>
      </section>)}
    </dialog>
  </>
}
