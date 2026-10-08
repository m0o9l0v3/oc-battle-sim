// 親機サーバーの起動。使い方: docs/01-experience/event-host.md
//   npm run build && npm run host
//   npm run host -- --port 8080 --dist dist --state .host/progress.json
import { networkInterfaces } from 'node:os'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createHostServer } from './app.ts'
import { createFileStore } from './store.ts'

/** 親機PCの LAN のアドレス（IPv4）。参加者PCは、このアドレスを開く */
export function lanAddresses(): string[] {
  const found: string[] = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const e of entries ?? []) {
      if (e.family === 'IPv4' && !e.internal) found.push(e.address)
    }
  }
  return found
}

function main() {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: process.env.PORT ?? '8080' },
      dist: { type: 'string', default: 'dist' },
      state: { type: 'string', default: '.host/progress.json' },
    },
  })
  const port = Number(values.port)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`ポート番号が正しくありません: ${values.port}`)
    process.exit(1)
  }
  const addresses = lanAddresses()
  const participantUrls = addresses.map((a) => `http://${a}:${port}/`)
  const { server, adminToken } = createHostServer({
    distDir: resolve(values.dist),
    store: createFileStore(resolve(values.state)),
    participantUrls,
  })

  server.on('error', (e: NodeJS.ErrnoException) => {
    console.error(
      e.code === 'EADDRINUSE'
        ? `ポート ${port} は、ほかのプログラムが使っています。--port で別の番号を指定してください。`
        : `サーバーを起動できませんでした: ${e.message}`,
    )
    process.exit(1)
  })

  server.listen(port, '0.0.0.0', () => {
    const lines = [
      '',
      '親機サーバーを起動しました（止めるときは Ctrl+C）',
      '',
      '参加者PCで開く URL:',
      ...(participantUrls.length > 0
        ? participantUrls.map((u) => `  ${u}`)
        : [`  http://<このPCのLANのアドレス>:${port}/  （LAN に接続されていません）`]),
      '',
      '個別リセット用のブックマーク（参加者PCに登録する）:',
      ...(participantUrls.length > 0
        ? participantUrls.map((u) => `  ${u}?reset`)
        : [`  http://<このPCのLANのアドレス>:${port}/?reset`]),
      '',
      '管理画面（このPCでだけ開けます。起動のたびに変わります）:',
      `  http://localhost:${port}/admin?token=${adminToken}`,
      '',
    ]
    console.log(lines.join('\n'))
  })

  const stop = () => {
    // 進行状態は、操作のたびに保存済み
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 1000).unref()
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

main()
