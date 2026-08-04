import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const executablePath = '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe'
const target = process.argv[2] ?? 'http://127.0.0.1:5173/'
const output = process.argv[3] ?? 'assets/reports/screenshot.png'
const port = 9222
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const child = spawn(executablePath, [`--remote-debugging-port=${port}`, '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=C:\\Users\\nonokoovo\\AppData\\Local\\Temp\\fumoe-cdp`, 'about:blank'], { stdio: 'ignore', detached: true })
child.unref()

let endpoint = ''
for (let attempt = 0; attempt < 40; attempt++) {
  await sleep(500)
  try {
    const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    endpoint = version.webSocketDebuggerUrl
    if (endpoint) break
  } catch { /* keep waiting for devtools */ }
}
if (!endpoint) { console.error('无法连接到浏览器调试端口'); process.exit(1) }

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`)
const context = browser.contexts()[0] ?? await browser.newContext()
const page = await context.newPage()
await page.setViewportSize({ width: 1440, height: 1600 })
await page.goto(target, { waitUntil: 'networkidle', timeout: 60_000 })
await page.waitForTimeout(1500)
await page.screenshot({ path: output, fullPage: true })
await browser.close()
try { process.kill(-child.pid) } catch { /* already gone */ }
console.log(`已截图 ${target} -> ${output}`)
