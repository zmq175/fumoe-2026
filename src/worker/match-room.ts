import type { Env } from './types'

export class MatchRoom implements DurableObject {
  private sockets = new Set<WebSocket>()
  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request) {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/connect') && request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair)
      server.accept()
      this.sockets.add(server)
      server.addEventListener('close', () => this.sockets.delete(server))
      server.send(JSON.stringify({ type: 'connected' }))
      return new Response(null, { status: 101, webSocket: client })
    }
    if (url.pathname.endsWith('/publish') && request.method === 'POST') {
      const body = await request.text()
      for (const socket of this.sockets) {
        try { socket.send(body) } catch { this.sockets.delete(socket) }
      }
      return new Response(null, { status: 204 })
    }
    return new Response('Not found', { status: 404 })
  }
}
