import { delay } from './delay'

export const excelHelpScenario = {
  async message(): Promise<string> {
    await delay(600)
    return '対応しているExcelファイルの形式は以下の通りです。'
  },
}
