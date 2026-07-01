import JSZip from 'jszip'

/**
 * xlsx バイト列から sharedStrings.xml の rPh 要素を読み取り、
 * 「漢字テキスト → 読みカナ」の Map を返す。
 *
 * ExcelJS は phonetics を Cell API に露出しないため、ZIP を直接パースする。
 * 同じ漢字に複数の読みが存在する場合（「大地」→「タイチ」/「ヒロチ」など）は
 * 衝突として除外し、確実に一意な読みのみを返す。
 */
export async function extractPhoneticMap(buffer: ArrayBuffer): Promise<Map<string, string>> {
  const map       = new Map<string, string>()
  const conflicts = new Set<string>()

  try {
    const zip    = await JSZip.loadAsync(buffer)
    const ssFile = zip.file('xl/sharedStrings.xml')
    if (!ssFile) return map

    const xml = await ssFile.async('string')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const sis = doc.getElementsByTagName('si')

    for (const si of Array.from(sis)) {
      // ベーステキスト: <t> または <r><t> の子要素から取得（<rPh> は除外）
      let baseText = ''
      for (const child of Array.from(si.childNodes)) {
        if (child.nodeName === 't') {
          baseText += child.textContent ?? ''
        } else if (child.nodeName === 'r') {
          const tEl = (child as Element).getElementsByTagName('t')[0]
          if (tEl) baseText += tEl.textContent ?? ''
        }
        // rPh など他の要素はスキップ
      }

      const text = baseText.trim()
      if (!text) continue

      // ふりがな: <rPh sb="..." eb="..."><t>...</t></rPh> を sb 順に連結
      const rPhs = si.getElementsByTagName('rPh')
      if (!rPhs.length) continue

      const phonetic = Array.from(rPhs)
        .sort((a, b) => parseInt(a.getAttribute('sb') ?? '0') - parseInt(b.getAttribute('sb') ?? '0'))
        .map(rPh => rPh.getElementsByTagName('t')[0]?.textContent ?? '')
        .join('')

      if (!phonetic) continue

      if (conflicts.has(text)) continue
      if (map.has(text) && map.get(text) !== phonetic) {
        conflicts.add(text)
        map.delete(text)
      } else {
        map.set(text, phonetic)
      }
    }
  } catch {
    // ふりがなはオプション。失敗しても無視して続行
  }

  return map
}
