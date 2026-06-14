const CORRECTION_PATTERNS = [
  /それは違[うい]/,
  /実際には/,
  /正しくは/,
  /そうではなく/,
  /もしかして.*間違/,
  /違います/,
  /誤りです/,
  /間違っています/,
  /違う方法/,
  /そうじゃなく/,
  /〜の場合は/,
  /ルール的には/,
  /本来は/,
  /べきではない/,
]

export function detectCorrection(userMessage: string): boolean {
  return CORRECTION_PATTERNS.some(p => p.test(userMessage))
}
