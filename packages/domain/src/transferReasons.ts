// 異動事由 — 処理パターンに連携するドメイン定数
// Excel外部マスタ（各種TBL F列）からの取り込みではなく、ここで一元管理する
// TODO: 現在は取り込みのみ（TransferReasonEntry）。ロジック整理後にここへ移行する

export type TransferReasonKey = string  // 将来 union 型に絞る
