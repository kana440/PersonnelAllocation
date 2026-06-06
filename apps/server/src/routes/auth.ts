import { Hono } from 'hono'
import { listUsers } from '../auth/stub.ts'

const app = new Hono()

// デモ用: ユーザー一覧を返す（フロント側のユーザー選択ドロップダウンで使う）
app.get('/users', (c) => {
  return c.json(listUsers())
})

export default app
