// 新規 Position / Affiliation の ID 生成
// モジュールスコープのカウンターで一意性を保証する
let posCounter = 100
let affCounter = 100

export const newPosId = (): string => `pos_new_${posCounter++}`
export const newAffId = (): string => `aff_new_${affCounter++}`
