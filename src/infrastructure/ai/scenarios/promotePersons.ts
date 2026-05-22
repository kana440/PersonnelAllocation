import { delay } from './delay'
import type { PersonMatch } from '../../../components/ai/types'

export const promotePersonsScenario = {
  async promptMessage(): Promise<string> {
    await delay(600)
    return '昇進する方の名前を入力してください。複数の場合はカンマ（,）区切りで入力できます。'
  },

  async confirmMessage(
    persons: PersonMatch[],
  ): Promise<{ text: string; persons: PersonMatch[] } | { text: string }> {
    await delay(1000)
    if (persons.length === 0) {
      return { text: '該当する方が見つかりませんでした。氏名を確認して再度入力してください。' }
    }
    return {
      text: `${persons.length} 名の昇格内容を確認してください。`,
      persons,
    }
  },

  async applyMessage(count: number): Promise<string> {
    await delay(1200)
    return `${count} 名の昇格を適用しました。`
  },
}
