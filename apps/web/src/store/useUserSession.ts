import { useMemo } from 'react'
import { useStore } from './useStore'
import { deriveCapabilities } from '../application/userSession'
import type { UserSession, UserCapabilities } from '../application/userSession'

export type { UserSession, UserCapabilities }

/**
 * 現在のユーザーセッションとケイパビリティを返すフック。
 *
 * コンポーネントは appMode を直接参照せずこのフックを使うこと。
 * DB認証移行後は useStore の userSession が外部から注入されるだけで
 * このフックの呼び出し側は変更不要になる。
 */
export function useUserSession(): { session: UserSession; capabilities: UserCapabilities } {
  const { userSession } = useStore()
  const capabilities = useMemo(() => deriveCapabilities(userSession), [userSession])
  return { session: userSession, capabilities }
}
