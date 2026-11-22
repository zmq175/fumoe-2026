import { useRef, useState } from 'react'
import { X } from 'lucide-react'

import { version } from '../../package.json'
import { publishedReleases } from '../data/release-history'

const releases = [
  { version, date: undefined, changes: ['新增投票页白屏、可交互、首屏与整页图片耗时统计，以及页脚更新日志。'] },
  ...[...publishedReleases].sort((a,b) => b.version.localeCompare(a.version, 'en', { numeric: true })),
]

export function FooterVersion({ email }: { email?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [opened, setOpened] = useState(false)
  return <>
    <p>{email && <>{email} 已登录 · </>}
      <button type="button" className="footer-version" aria-haspopup="dialog" onClick={() => { setOpened(true); dialog.current?.showModal() }}>
        v{version} · 更新日志
      </button>
    </p>
    <dialog ref={dialog} className="release-notes" aria-labelledby="release-notes-title">
      <button type="button" className="dialog-close" aria-label="关闭更新日志" onClick={() => dialog.current?.close()}><X /></button>
      <h2 id="release-notes-title">更新日志</h2>
      {opened && releases.map(release => <section key={release.version}>
        <h3>v{release.version}</h3>
        <small>{release.date ? <time dateTime={release.date}>{release.date}</time> : '候选版本 · 待上线'}</small>
        <ul>{release.changes.map(change => <li key={change}>{change}</li>)}</ul>
      </section>)}
    </dialog>
  </>
}
