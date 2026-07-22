# 24 — STEP1 組織照会・編集機能：既知の課題・デッドコード・未実装事項（構築者向け）

> [`23-org-view-edit-requirements.md`](./23-org-view-edit-requirements.md) の補足資料。
> 業務ユーザーとのデモ・優先度確認では使わない。構築者が移植計画を立てる際の技術メモ。
>
> **このドキュメントは「まだ検討・対応が残っているもの」だけを記載している。**
> 解消済みの項目（L1・L2・L3・L6・L7・L8・L9・L11・L13、1-2b、および削除済み/対応済みのデッドコード）は
> このドキュメントから削除済み。対応履歴が必要な場合は git 履歴（2026-07-21時点の版）を参照。
>
> **2026-07-21 追記**: 以下は「簡単なバグ」ではなく業務判断・設計判断が必要と判定し、**一旦保留**にした項目。
> コードは変更していない。

---

## 1. 保留中（業務判断・設計判断待ち）

| # | 内容 | 対応方針 | 関連ID（23番） |
|---|---|---|---|
| L4-② | ドラッグ異動時の「空席として残す」チェックボックスが、通常のドラッグ経路（`DragIntentPicker`）では表示されず、詳細フォーム経由でのみ機能する（`docs/05-operation-framework.md` の記載とも乖離） | **業務判断が必要**。通常のドラッグ経路にもチェックボックスを出すか、詳細フォーム限定のままでよしとするか | 5-9 |
| L5 | 複数行操作（`MultiRowOperationDef`）には排他ロックが一切適用されない（`operationRole` フィールド自体が型に無い）。出向2行セット等で片方の行が既にロック中でも制御がかからない | **業務判断が必要**。`MultiRowOperationDef` に `operationRole` を持たせる設計変更が必要（型定義追加＋`resolveAvailability`相当のロジック拡張、工数は中程度）。実運用でどれだけ問題になっているか次第 | 5-6, 5-7 |
| importMerge | マージの「追記のみ／担当者情報を保持」モード（`importMerge.ts`／`mergeExcelData`）が、UIから到達不能な理由を深掘りしたところ、**「ボタン1つ」では実装できないことが判明**。現在の実際のマージ機能（`ListIntegrationButton` → `MergeSession` 一式）は `importMerge.ts` とは別の、行レビュー・1段階承認・完全ロールバックを備えた新しいアーキテクチャで、`FIXED_IMPORT_MODE='replace-all'`／`FIXED_ASSIGNEE_MODE='overwrite'` に固定されている。`importMerge.ts` 側を活かすには、①新しいセッション型マージにモード選択UIを追加してセッション構築ロジック（`buildMergeSession`）自体を拡張する（新規機能開発に近い規模）か、②`mergeExcelData` を直接呼ぶ旧来の別導線を新設する（レビュー・ロールバック等の安全機構を迂回することになり非推奨）のいずれかになる。**どちらで進めるか、あるいはこの機能自体が本当に必要か、方針決定が必要** | 1-4a |

---

## 2. 削除前に要確認（そのまま保留・未着手）

| ID | 対象 | 状況 |
|---|---|---|
| 3-3i | `PatternFilterDropdown.tsx`（`apps/web/src/components/review/UnifiedReviewView/`） | 参照ゼロで機能的には死んでいるが、直近（2026-07-06〜08）に `PatternReferenceModal` 統合などの実質的な編集が入っている。同時期に `EditViewCore.tsx` 側にも同じモーダルが正規の経路で配線されており、開発者がこのファイルへの追記を移行し忘れている可能性がある。**削除前に直近の担当者へ確認が必要** |
| 5-13 | `groupPatternMatcher` 一式（`packages/domain/src/patterns/group/`）＋ `HRApplicationService` 内の `patterns`／`registerPatterns`／`rebuildPatternCache`／`patternCache` | 呼び出しゼロを確認済みで技術的には削除可能。ただし「自動グループパターン検出」という設計自体を放棄する意思決定でもあるため、**削除前に一言確認が必要** |

---

## 3. 未実装・新規提案（業務ニーズとして挙がったが未着手）

| ID（該当箇所） | 内容 | 背景 |
|---|---|---|
| 2-4c | 属性変更（職位・勤務地等）の種類別グループ化確認 | 「勤務地変更者だけ」等の切り口で比較モード内から確認したいという要望 |
| 2-5c | 新or旧いずれかしかない場合の自動フェールオーバー | 移行初期等で片側データが無い運用だとトグルが無意味に表示され続ける懸念への対応案 |
| 2-6c | 組織図側の選択→Navバー側のハイライト連動（逆方向） | Nav→組織図の連動は実装済みだが、逆方向は見当たらない（下記セクション4参照） |
| 6-9 / L7派生 | 自動導出値と手入力値の視覚的区別 | 検討済みで「対応不要」と判断されたが、業務ニーズが変わった場合の新規設計候補として記録 |
| 1-5c | 担当者割当ウィザードでの既存担当者の上書き確認ダイアログ | 現状は無条件上書きで確認ダイアログがない |
| L12 | 自動導出ロジックの呼び出し方式の統一 | `OperationFormView` が `resolveRow()` を使わず `deriveFieldUpdates` を直接1回だけ呼んでいる（`OperationFormView/index.tsx` L38, L92）。`QuickEditDialog` は既に `resolveRow()`（`packages/domain/src/resolver.ts`）を使用済み。ドメインルール自体に曖昧さはなく、アプリ層の呼び出し窓口を統一すれば解消する。**対応方針は決定済み・未着手**（`OperationFormView` を `resolveRow()` 経由に統合。既存の自前バリデーション・選択肢生成ロジックとの重複整理が必要） |
| L4-③ | 上司組織整合チェック(W3)の単行検証／バッチ検証の二重実装 | ロジックがずれると単行編集とバッチで結果が食い違うリスクがある。**対応方針は決定済み・未着手**（ロジックを1本化） |

---

## 4. 未確認・要追加調査（コード調査だけでは判断できなかった）

| ID | 内容 | 何を確認すべきか |
|---|---|---|
| 1-3c | `orgHierarchy.ts`（`resolveOrgHierarchy`）がインポート処理から呼ばれているか | 呼び出し元の有無を再調査（`allocationList/orgHierarchy.ts` は削除対象からは除外済み） |
| 8-6 | OrgPersonNavに組織単位のissue/変更件数バッジがあるか | `OrgSection.tsx` 本体の未読部分を確認 |
| 11-6 | 連絡票の依頼者が回答値を実データへ適用するUI導線があるか（`resolve()`） | `ThreadView.tsx` 全体、および他コンポーネントでの `resolve()` 呼び出し箇所を確認 |

---

## 5. 実装済みだが見た目通りではない主な注記（参考情報）

23番のデモ対象項目のうち、実際の制約を知らずに移植すると期待とズレるもの。

| ID（23番） | 見出し上の機能 | 実際の制約・注意点 |
|---|---|---|
| 1-1d | ふりがな自動取得 | VBAマクロ付きファイルのみ対応。マクロなしファイルは一切取得できない |
| 1-4f | マージレビュー（承認/却下/差し戻し） | 承認は1段階方式（承認した瞬間に実データへ反映）。Gitのステージングのような中間状態はない |
| 3-1b | canvas→表の選択同期 | **表に切り替えた瞬間のみ**反映される。表示中に組織図側の選択が変わっても表側は追随しない |
| 3-4d | Excel形式（side-by-side）表示 | エラー・警告が一切表示されない（比較形式のみ対応） |
| 3-5a | セルの直接編集 | 対象は「異動事由」列のみ。他フィールドは編集不可 |
| 3-7f | 昇格・降格の一括操作 | 単一行のみ対応。2件以上選択するとボタンがグレーアウトする |
| 3-9a | 3万行対応の一覧表示 | 行の高さは固定値の前提（可変高さ・折り返しテキストには非対応） |
| 4-1a | Excel出力の書式保持 | 元ファイルが無い場合（URL取込等）は書式温存の恩恵がなく簡易生成になる |
| 5-6 | 2行以上をまとめて操作するフォーム | L5参照。排他ロックが一切効かない |
| 5-9 | ドラッグ異動時の「空席として残す」チェックボックス | L4-②参照。通常のドラッグ経路では表示されず、詳細フォーム経由のみ機能する |
| 9-5 | 推奨修正値のワンクリック適用 | 一意に定まる場合のみ表示される（大半のエラーには推奨値がなく手動選択が必要） |
| 10-1 | Undo/Redo | 上限50件到達時の警告表示は対応済み（2026-07-21）。ただし「初回インポート」「リセット」はUndo履歴ごとクリアされるが「追加マージ」はUndo対象になる非対称設計は未対応（保留中、業務判断待ち） |
| 11-12 | Excelファイルへの直接読み書き | Chrome/Edge専用のAPIに依存（Safari/Firefox非対応） |
| 12-6 | ポジションコード一括割当 | 上司ポジションコードの連動更新対象がどの行かを提示するUIはない（履歴パネルで確認する以外に手段がない） |

---

## 付録A. 編集機能の全リスト（参照用）

### 単行操作（40種、`packages/domain/src/commands/defs/`）

- **昇格・降格・役職**: Promotion／Demotion／TitleChange／MpTrackSwitch
- **職務・雇用形態**: JobTypeChange／EmploymentExtension／EmploymentTypeChange／EmploymentExtensionCancel
- **組織異動**: OrgTransfer／OrgRestructure
- **兼務**: ConcurrentAdd／ConcurrentAddNew／ConcurrentAddCancel／ConcurrentRelease
- **本務出向**: SecondmentOutSF／SecondmentOutNonSF／SecondmentInNew／SecondmentOutReleaseSF／SecondmentOutReleaseNonSF／SecondmentInReleaseSF／SecondmentInReleaseNonSF／SecondmentInCancel
- **兼務出向**: ConcurrentSecondmentOutNonSF／ConcurrentSecondmentInNew／ConcurrentSecondmentOutReleaseSF／ConcurrentSecondmentOutReleaseNonSF／ConcurrentSecondmentInReleaseSF／ConcurrentSecondmentInReleaseNonSF／ConcurrentSecondmentInCancel
- **在籍・退職**: LeaveOfAbsence／LeaveOfAbsenceCancel／ReturnFromLeave／ReturnFromLeaveCancel／Resignation／ResignationCancel／EmploymentTransfer／EmploymentTransferCancel／NoChange／NoChangeCancel／ResetToBefore
- **上司・ポジション**: ManagerChange／AddEmptyPosition／AddEmptyPositionCancel／SubordinateHandoff／MoveToVacantPosition

### 複数行操作（3種、`packages/domain/src/commands/defs/multiRowDefs.ts`）

- NonSFSecondmentOut／NonSFSecondmentCancel／NonSFSecondmentRelease

### 変更パターン分類（30種、`packages/domain/src/patterns/defs/`）

職務情報系（11）・ポジション系（7）・出向系本務（4）・出向系兼務（4）・人操作系（6）— 表示・集計・メニュー制御用のラベル体系。
