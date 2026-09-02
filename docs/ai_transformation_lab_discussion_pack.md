# AI Transformation Lab
## 外部の仮説を、自分たちの実践知に変える

---

## 全体テーマ

> **AIで一人ひとりの生産性が上がったのに、会社全体の生産性・能力が上がらないとしたら、何が起きているのか？**

前回の共有では、以下のような仮説を共有した。

- AIによってExecutionの希少性が下がる
- 人の価値は一部でMeta-workへ移る
- Production SystemとLearning Systemが分離する
- 組織はBoxよりFlowが重要になる
- 自律性を高めるほどCoreの構造が必要になる

今回は、それらを「正しい」として学習するのではない。

> **外部Evidenceと、自分たちの実プロジェクトを使って、支持・反証・修正する。**

---

# Research Question 1
# AIで個人が速くなったとき、なぜ組織全体は速くならないことがあるのか？

## Main Question

> **AIで自分の仕事が2倍速くなったとして、それは組織の生産性が2倍になったことを意味するか？**

## 最初に考えてほしいケース

ある業務改革担当者がAIを使い始めた。

以前は、

要件整理  
→ 設計  
→ 開発依頼  
→ テスト  
→ 保守引継ぎ

と複数人で分担していた。

AIを使うと本人が、

- 要件整理
- 設計
- コーディング
- テスト
- ドキュメント

までかなり一人でできるようになった。

一見、生産性は大幅に向上した。

しかし実際には、

- 本人しか全体を理解していない
- 引継ぎ資料は大量にあるが受け手が理解しきれない
- 細かな保守依頼まで本人へ戻る
- 複数案件を並行して抱える
- Context Switchingが増える
- 「できるから」という理由で仕事が集まる

ようになった。

### 問い
> **この人の生産性は上がったのか、下がったのか？**

> **組織の生産性は上がったのか？**

## Core Case 1｜個人時間は減っても、Coordinationは減らない

ILOが2026年にまとめた実証研究レビューでは、GenAIによる生産性向上は確認されている一方、worker-reportedな時間節約が、企業レベルのOutput・賃金・雇用改善にはまだ十分つながっていないと整理されている。

特に、仕事のCoordinationやAutonomyなど、Work Organization側への影響が重要な論点になっている。

### 考えてほしいこと
> **Taskを速くすることと、Flowを速くすることは同じか？**

### 参照URL
https://www.ilo.org/publications/impact-genai-jobs-productivity-and-work-organization-review-empirical

## Core Case 2｜AIが作る量を増やすほど、熟練者側に仕事が移る

生成AIを使ったSoftware Developmentでは、

> Junior / Individual contributorの生成量が増える  
> ↓  
> Review・Integration・MaintenanceがSenior側へ移る

という現象が複数研究で指摘されている。

以前共有したSonarの事例でも、本質は単にGeneration速度が上がったことではなく、Verificationを含めたEnd-to-End Workflowを再設計した点にあった。

### 問い
> **AIである工程を高速化したとき、その“ツケ”はどこへ移ったか？**

## Optional Case A｜AIで速くなった分、期待値も上がる

2026年のFrontiers研究では、AI Relianceそのものが直接的に過剰競争を生むというより、

AI利用  
→ Performance expectation上昇  
→ Anxiety  
→ 過剰で非効率な競争

という経路が観察されている。

### 問い
> 以前8時間だった仕事をAIで2時間にしたら、残り6時間は本当に自由になるのか？

それとも、

> 「じゃあ4倍やれるよね」

になるのか？

### 参照URL
https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1842907/full

## Optional Case B｜「一気通貫できる人」は強い。でも組織としては危険？

AIによって個人の**Span of Capability**が拡大する。

以前なら5人必要だった仕事を、1人＋AIで理解・実行できる。

これは非常に大きな強み。

一方で、

Span of Capability ↑  
→ Span of Responsibility ↑  
→ Cognitive load ↑  
→ Bus factor ↓

になる可能性がある。

### 問い
> **できる人に任せることと、組織能力にすることは同じか？**

## Optional Case C｜Documentationは引継ぎ問題を解決するか？

AIによってDocumentを大量に作れる。

しかし、

> Documentation availability ≠ Cognitive transfer

である可能性がある。

10ページなら読める。

200ページのAI生成設計書があっても、

> 「理解して責任を持ってください」

となれば、受け手の認知負荷はむしろ大きい。

### 問い
> **Knowledgeを残すことと、Capabilityを移すことの違いは何か？**

## Project Discussion

以下から興味のある3〜4問を選ぶ。

1. 自分たちのPJで、AIによって明確に速くなったTaskは？
2. そのTaskの前後で新しく増えた仕事は？
3. Review / Coordination / Maintenanceへ負荷が移った例は？
4. AIによって「できる人」に仕事が集中した例は？
5. Documentationを作ったのに引継げなかった例は？
6. Handoffをなくした方が良かった例は？
7. 逆にHandoffをなくしたことでQualityやSustainabilityが落ちた例は？
8. 「AIで削減した時間」は、本当に組織から消えたか？
9. Individual productivityとEnd-to-End productivityをどう測り分けるべきか？

## このテーマで到達したい仮説
> **AIによる生産性向上を組織成果へ変えるには、Task単位の＿＿＿＿ではなく、＿＿＿＿を見る必要がある。**

## 他テーマに投げたい問い候補

### → Theme 2
> 一人がEnd-to-Endでできるようになったとき、その人のRoleはどこまで広げるべき？

### → Theme 4
> Handoff削減と属人化防止はどう両立する？

### → Theme 5
> 一人＋AIが複数専門領域を横断するとき、誰がQualityをReviewできる？

---

# Research Question 2
# AIで「作る能力」が民主化したとき、人は何を担うと価値を生むのか？

## Main Question
> **AIがそれなりの分析・資料・コード・提案を誰にでも作れるようにしたら、Professionalの“専門性”は何になるのか？**

## 最初のケース

2つのチームが同じ経営課題を検討した。

### Team A
1. AIへ課題を入力
2. AIに論点・仮説・選択肢を生成させる
3. みんなでOutputをレビュー
4. 20分で方向性決定

### Team B
1. 各メンバーが自分の仮説を書く
2. 異なる見方をぶつける
3. 現場知見・直感を共有
4. AIに反証・不足Evidenceを探させる
5. 再度人間で統合
6. 45分で方向性決定

### 問い
> **どちらの方が「生産性が高い」？**

さらに、

> 3か月後に前提条件が変わったとき、どちらのチームが強い？

## Core Case 1｜AIへのConfidenceが高いほど、Critical Thinkingが減る可能性

Microsoft Researchが319人のKnowledge Workerから936件の実務利用例を分析した研究では、GenAIへのConfidenceが高いほどCritical Thinking effortが小さい傾向があった。

一方で、本人のTask expertiseへのConfidenceが高い場合は、よりCritical Thinkingを行う傾向があった。

さらにAI利用時には思考の重心が、

- Information gathering → Verification
- Problem solving → AI response integration
- Task execution → Task stewardship

へ移っていた。

### 問い
> **AIをレビューできることと、自分で問題を構造化できることは同じ能力か？**

### 参照URL
https://doi.org/10.1145/3706598.3713778

## Core Case 2｜AIはすべてのDecision Phaseで同じように有効ではない

2026年のSystematic Reviewでは15研究・計15,752人を統合し、GenAIの効果はDecision Phaseによって異なる可能性が示された。

情報探索などのIntelligence phaseではプラス、一方で最終的なChoice phaseでは負の効果も確認されている。

### 問い
> **AIが得意な「考える」と、人に残すべき「考える」を分解できるか？**

### 参照URL
https://www.sciencedirect.com/science/article/pii/S1877050926011956

## Optional Case A｜Strategyが「資料作成」からContinuous Decision Systemへ

Strategy Functionでは、

- External monitoring
- Internal monitoring
- Scenario generation
- Signal detection

をAIに任せることで、Strategistの役割が、

> 定期的に戦略資料を作る

から、

> **どのSignalでDecisionを発生させるか設計する**

方向へ変わる可能性がある。

### 問い
> Strategyの成果物はPowerPointなのか、それともDecision Systemなのか？

## Optional Case B｜営業で簡単な仕事をなくすと、本当に楽になるか？

AIが、

- Prospecting
- CRM
- Proposal draft
- Follow-up

を処理する。

人には、

- Relationship
- Negotiation
- Difficult judgment
- Deal shaping

が残る。

### 問い
> **Routine Workが減るほど、人の1日は「難しい仕事だけ」にならないか？**

> Less routine ≠ Less cognitive load.

## Optional Case C｜AIに聞く方がHuman Expertより信頼される？

2026年のKnowledge Worker研究では、複雑Taskにおいて、ProgrammerがHuman ExpertよりGenAI adviceを高く評価するケースも確認されている。

### 問い
> AIの提案が“説得力がある”ほど、人間の専門家による違和感・直感を捨てやすくならないか？

### 参照URL
https://www.sciencedirect.com/science/article/pii/S0268401226000034

## Project Discussion

1. 自分たちの仕事で既にCommodity化し始めたSkillは？
2. 逆に希少になったSkillは？
3. AI Outputを起点にしたことで、議論が早くなったが浅くなった経験は？
4. 逆にAIによって議論が深くなった経験は？
5. その違いはAIの性能か、使い方か、参加者のExpertiseか？
6. 「答えを作る」より「良い問いを設定する」比率は増えたか？
7. Professionalの価値をOutput volume以外で説明するとしたら？
8. 人と人とのDialogueがないと出なかったInsightは何だったか？

## 到達したい仮説
> **AI時代のProfessionalの価値は、＿＿＿＿を作る能力より、＿＿＿＿を設計／引き出す能力に移る。**

ただし、

> 本当にすべての職種でそうなのか？

という反証も必ず残す。

## 他テーマへの問い

### → Theme 3
> Meta-workを担える人は、Execution経験なしに育てられる？

### → Theme 4
> Work Architect的な人材は、Functional組織とProject組織のどちらに置くべき？

### → Theme 5
> AIを使って一人で広い専門領域を扱えるとき、上司は何をManagementする？

---

# Research Question 3
# 成果・本人能力・組織能力が分離したとき、どう育て、何を評価するのか？

## Main Question
> **AIで高いOutputが出たとき、それは「本人が優秀」だということか？**

## 最初のケース｜6人を順位付けする

### Aさん
AIほぼ不使用。10時間。  
成果：80  
理解：100

### Bさん
AIを高度利用。1時間。  
成果：95  
理解：50

### Cさん
AIを高度利用。3時間。  
成果：120  
新しい分析・価値も追加

### Dさん
本人の成果：80  
AI Workflowを標準化し、10人全員の生産性を20%改善

### Eさん
成果：120  
本人独自のAI Workflowを持つが共有しない。本人にしか再現できない。

### Fさん
本人単独では90。  
社内Expertを巻き込み、AI Draftを叩き台に深い議論を作り、最終成果130。知見も再利用可能な形に残す。

### 問い
> **会社として最も高く評価すべき人は誰？**

まず順位をつける。

そのあと、

> その評価制度が続いたら、社員はどんな行動をするようになる？

と聞く。

## Core Case 1｜Performance with AI ≠ Capability without AI

Scientific Reportsの4実験、合計3,562人では、GenAIとの協働はその場のTask Performanceを向上させた。

しかし、その向上は次のHuman-only taskへ持続しなかった。

またAI協働後にはIntrinsic Motivation低下やBoredom増加も確認されている。

### 問い
> **AI込みのPerformanceと、その人自身のCapabilityを区別する必要はあるか？**

必要なら、何のために？

### 参照URL
https://www.nature.com/articles/s41598-025-98385-2

## Core Case 2｜Entry-levelなのにSenior Skillを要求する

PwCの2026 AI Jobs Barometerは10億件以上の求人を分析。

米国240万件のEntry-level求人では、AI曝露が高いRoleは従来Senior向けだったJudgment・Leadership等を要求する可能性が7倍。

Seniorised entry-level求人は2019年以来35%増、その他Entry-level求人は10%減。

### 問い
> **経験でしか得にくい能力を、経験する前から求め始めていないか？**

### 参照URL
https://www.pwc.com/gx/en/news-room/press-releases/2026/pwc-2026-ai-jobs-barometer.html

## Optional Case A｜AIは評価者として人間より一貫する場合もある

2026年のPersonnel Psychology研究では744件のKnowledge-work Outputを複数LLMと人間で評価。

Advanced LLMのExpert consensusとの相関は最大r=.62、Humanの集約評価はr=.50だった。

### 問い
> ならば人事評価をAIに任せればよい？

ここで分ける。

> Output qualityの評価  
> ≠ Potential / Judgment / Growth / Relationship / Accountabilityの評価

### 参照URL
https://doi.org/10.1111/peps.70020

## Optional Case B｜人間関係はAIと競合するのではなく、AIで強くなる場合もある

523人を3時点で調べた2026年研究では、強いMentor NetworkがTacit Knowledge acquisitionを介してCreativityに関連し、さらにEmployee-AI collaborationが強いほど、その効果も強まった。

### 問い
> **AIかMentorか、ではなく「AI × Mentor」が強いのでは？**

### 参照URL
https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1750869/full

## Optional Case C｜AIは仕事上の人間関係自体を変える

Technology企業561人の2時点調査では、AI利用が、

- Task-orientedなInstrumental tiesとは負に関連
- SocioemotionalなExpressive tiesとは正に関連

し、どちらのTieもKnowledge sharingと関連していた。

### 問い
> 「質問する必要」がなくなった結果、失っている人間関係はないか？

### 参照URL
https://doi.org/10.1016/j.actpsy.2026.106967

## Optional Case D｜Individual Output競争がAI Know-howの囲い込みを促す？

AI利用によってPerformance expectationが上がり、不安や過剰競争につながる経路を示す研究もある。

### 問い
> 「AIで成果を2倍にした人」を評価する制度は、社員にAI Know-howを共有させるか、隠させるか？

### 参照URL
https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1842907/full

## Project Discussion

1. Outputが高いが本人理解が浅い人をどう評価する？
2. AIなしでもできる能力を測る必要はある？
3. 逆に「AIなしでできること」に拘る意味は本当にある？
4. 個人成果とTeam leverageのどちらを重視すべき？
5. Relationship / Trustを評価すべきか？
6. 評価するなら「人脈の多さ」ではなく何を見る？
7. AIで消えたJunior Taskは何か？
8. そのTaskは単純作業だったか、それともTrainingだったか？
9. 意図的に人間だけでやらせる仕事は必要か？
10. 高度AI人材を囲い込むことと、能力を全体へ流通させることは矛盾しないか？

## ここで狙いたい再定義

Relationshipを単独の評価項目にするのではなく、

> **Organizational CapabilityへのContribution**

として考える。

候補：

- Knowledge Sharing
- Others Enabled
- Reusable Asset
- Collective Intelligence
- Mentoring
- Trust
- Cross-functional Mobilization

### 仮説
> **AI時代のPerformance Managementでは、Individual Outputだけでなく＿＿＿＿を評価しないと、組織として望ましくない行動を誘発する。**

## 他テーマへの問い

### → Theme 1
> LearningのためにHuman Executionを残すことは、Work Redesignの非効率になる？

### → Theme 2
> Meta-work能力をどうやって初学者に獲得させる？

### → Theme 4
> Project流動化と長期Mentoring・Communityをどう両立する？

---

# Research Question 4
# 個人のSpan of Capabilityが広がるほど、組織はどう仕事を分け直すべきか？

## Main Question
> **一人＋AIでEnd-to-Endにできるなら、組織の分業は減らすべきか？**

## 最初のケース

従来：

企画  
→ 業務設計  
→ IT  
→ 開発  
→ 保守

だった。

AIによって1人がかなり横断できる。

### パターンA
その人にEnd-to-End ownershipを与える。

### パターンB
従来通り専門部門へ引き渡す。

### パターンC
一気通貫で作るが、共通Platform / Architecture / Reviewだけ中央で持つ。

### 問い
> **どれが一番Scaleする？**

## Core Case 1｜成功するAI HubはDeliveryを手放していく

BCGは2026年、AI Hubが成熟するにつれて、初期は中央がAI Projectを直接Deliveryし、その後Business側にCapabilityが育つと、中央はCompany-wide coordination・Standards・Governanceへ比重を移すべきだと整理している。

### 問い
> **成功した中央組織ほど、自分で実行する仕事を減らすのはなぜか？**

### 参照URL
https://www.bcg.com/ja-jp/publications/2026/why-companies-need-centralized-ai-hub

## Core Case 2｜分散させるには共通基盤が必要

Syngentaでは各部門がAI Agentを作る中、

- 同じAgentの再開発
- Standard不統一
- Discovery困難
- Security / Privacy

が問題になり、Central Governance＋Business側開発のAgent Meshへ移行した。

### 問い
> **中央集権を弱めるために、中央を強くする必要がある？**

### 参照URL
https://aws.amazon.com/solutions/case-studies/syngenta-bedrock-case-study/

## Optional Case A｜Handoffは本当に悪か？

Handoffには2種類ある。

### Bad Handoff
- 組織都合
- 情報転記
- 承認待ち
- 責任回避

### Useful Handoff
- 専門家Review
- Separation of duties
- Learning
- Sustainability
- Cognitive load分散

### 問い
> **なくすべきHandoffと、残すべきHandoffを区別できるか？**

## Optional Case B｜流動化するとBelongingが壊れないか？

Project / Gig / Dynamic Teamを増やす。

すると、

- Opportunity
- Flexibility
- Resource utilization

は高まる。

一方、

- Community
- Mentor
- Functional expertise
- Identity
- Tacit knowledge

が弱くなる可能性。

Theme 3で見たように、Mentor networkとTacit knowledgeはAI時代でもCreativityに重要。

### 問い
> **Workを流動化するほど、逆に何を固定しないといけないか？**

### 参照URL
https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1750869/full

## Optional Case C｜仕事の引継ぎ先は「人」とは限らない

あるExpertがAIで高度なWorkflowを作った。

従来なら、

> Expert → 次の担当者

へ引き継ぐ。

でもAI時代には、

> Expert → Shared Agent / Platform / Knowledge asset  
> ＋ Human community

という引継ぎもあり得る。

### 問い
> **Capabilityを人から人へTransferするだけでなく、Organization Asset化するには何が必要か？**

## Project Discussion

1. AIで一人の担当範囲が広がった例は？
2. それは良いEnd-to-End ownershipか、危険な属人化か？
3. 判断基準は何か？
4. 引継ぎでDocumentationを増やしても解決しないケースは？
5. 専門部門へ戻すべき仕事と、Outcome teamで持つ仕事は？
6. 今のPJで「組織上の境界だから存在する」Handoffは？
7. AIがあればなくせそうな境界は？
8. Project終了後に誰もMaintenanceできないAssetは？
9. Reusable Capabilityとして中央に残すべきものは？
10. Functional Communityとして残すべきものは？

## 最後に作る2列

### 固定すべきもの
例：
- Architecture
- Standards
- Community
- Accountability
- Identity

### 流動化すべきもの
例：
- Work
- Project membership
- Capability access
- Agent usage
- Knowledge

### 仮説
> **AI時代の組織設計では、人をどう箱に入れるかより、＿＿＿＿を流しながら＿＿＿＿を固定することが重要になる。**

## 他テーマへの問い

### → Theme 1
> Handoffを減らしたことで逆に生産性が悪化する境界条件は？

### → Theme 3
> Dynamic TeamでもMentoringとExpertise育成を維持できる？

### → Theme 5
> Workが動的に流れるのにAuthorityが固定的なままでよい？

---

# Research Question 5
# 人とAIを速く動かしながら、思考・品質・責任をどう失わないか？

## Main Question
> **AIが危ないならHuman Reviewを増やせばよい？**

## 最初のケース

Agentが、

1. 資料を読む
2. Recommendationする
3. Draftする
4. 社内Systemを書き換える
5. 顧客へ送る
6. 契約条件を決める
7. 金銭を動かす

とする。

### 問い
> **どこからHuman Approvalが必要？**

さらに、

> 100円なら？  
> 100万円なら？  
> 過去100万件で99.999%正しかったら？

条件を変える。

## Core Case 1｜Full Access / Read-onlyの二択ではない

AWSは2026年、AI Agentの**Graduated Autonomy**を提案。

Agentは最初からFull Authorityを持つのではなく、

小さいPermission  
→ Reliabilityを蓄積  
→ Authority拡大  
→ Performance悪化  
→ Authority縮小

とする設計。

さらに、

- Visibility
- Decision provenance
- Reversibility

を重要要件としている。

### 問い
> **Agentにも「経験を積んだら昇格」があってよい？**

### 参照URL
https://aws.amazon.com/blogs/architecture/closing-the-ai-agent-trust-gap-with-graduated-autonomy/

## Core Case 2｜Governanceは一回の承認ではなくLifecycleになる

Microsoftは2026年9月、Agentic AIではRiskがInteraction・Environment・他Systemとの接続によって変化するため、AI GovernanceをよりContinuous / Lifecycle-basedにする必要があるとしている。

### 問い
> Release時に一度承認したAIを、半年そのまま信用してよい？

### 参照URL
https://blogs.microsoft.com/on-the-issues/2026/09/01/responsible-ai-in-2026-how-we-are-adapting-for-whats-ahead/

## Optional Case A｜AIのDecisionには「自信満々に間違う」という問題がある

2026年のSystematic Reviewでは、AIがAccuracyにかかわらず一貫してConfident-lookingなOutputを出すことが、人間側のDelegation calibrationを狂わせる要因として整理されている。

### 問い
> **Confidence scoreだけでEscalationを決めてよい？**

### 参照URL
https://www.sciencedirect.com/science/article/pii/S1877050926011956

## Optional Case B｜GovernanceはSpeedを落とすものか？

Syngentaのように、

> Central guardrail  
> ＋ Distributed experimentation

を作れば、現場は中央承認を毎回待たずに済む。

### 問い
> **強いGovernanceはBrakeなのか、高速道路のGuardrailなのか？**

### 参照URL
https://aws.amazon.com/solutions/case-studies/syngenta-bedrock-case-study/

## Optional Case C｜Human Review自体も浅くなったら？

Theme 2で見たように、AIへのConfidenceが高いほどCritical Thinking effortが下がる場合がある。

つまり、

> Human in the loop

でも、

> Human rubber stamp in the loop

なら意味がない。

### 問い
> **Humanを置くことと、Human Judgmentを機能させることは同じか？**

### 参照URL
https://doi.org/10.1145/3706598.3713778

## Project Discussion

1. 自分のPJでAIに何を実行させている／させたい？
2. 「提案」と「実行」の境界はどこ？
3. Human Approvalを置いている理由は本当にRiskか、それとも不安か？
4. 条件付きでHuman Reviewを外せる箇所は？
5. Exception条件は設計できる？
6. Human Reviewerは実際に内容を理解している？
7. AIによる大量ExecutionにControlが追いつかなくなる可能性は？
8. Decision Log / Trace / Reversibilityは十分か？
9. 一人＋AIがEnd-to-Endで仕事をした際のAccountabilityは誰が持つ？
10. AIの信頼度に応じて権限を動的に変えることを受け入れられる？

## 仮説
> **AI時代のControlは、一件ずつ＿＿＿＿することから、＿＿＿＿を設計し例外だけ介入することへ移る。**

---

# 各Discussion Packの読み方

参加者には冒頭で、

> **全部のCaseを消化する必要はありません。**

と明言する。

## MUST
- Main Case
- Core Case 1
- Core Case 2

## PICK
Optional Caseから**1〜2件だけ選ぶ**

## APPLY
残り時間を**自社PJ Evidence**へ使う。

Optional Caseを全部読む時間を与えない。

「どれが気になる？」自体が、そのチームの問題意識を表す。

---

# Discussion時間35分の推奨配分

## 5分｜個人
Main Questionを読んで、議論前の直感を書く。

## 8分｜Evidence
Core Casesを読む。

## 5分｜Pick
Optional Casesから気になるものを選んで話す。

## 12分｜自社PJ
「自分たちで実際に見たこと」を出す。

## 5分｜結論
- 仮説
- 反例
- Cross-theme Question

を書く。

---

# Notion Meeting Recordテンプレート

## Research Question
※テーマごとに事前入力

## 1. 議論前の直感

各自1〜2行。

- Member A：
- Member B：
- Member C：
- Member D：
- Member E：

## 2. Discussion Packで最も気になったFact / Case

**Fact / Case：**

**なぜ気になったか：**

## 3. 自分たちのProject Evidence

### Evidence 1

**Project / 業務：**

**起きたこと：**

### 個人へのImpact
- Speed：
- Output：
- Cognitive Load：
- Learning：

### 周囲へのImpact
- Review：
- Coordination：
- Handoff：
- Knowledge Sharing：

### 組織へのImpact
- End-to-End lead time：
- Quality：
- Reusability：
- Dependency / 属人化：

### 局所最適か、全体最適か
- [ ] 両方改善
- [ ] 個人のみ改善
- [ ] 組織のみ改善
- [ ] 両方悪化
- [ ] 不明

### 定量値があれば

## 4. 外部仮説と自社Evidenceの関係

- [ ] 強く一致
- [ ] 一部一致
- [ ] 反例あり
- [ ] 判断不能

### 理由

## 5. 現時点での仮説

> **私たちは現時点で、○○だと考える。**

1〜3文。

## 6. 反証・例外

> **この仮説が成立しない可能性があるケースは？**

## 7. まだ必要なFact

何が分かれば、この仮説をより強く支持／否定できるか。

## 8. Next Experiment

1〜4週間で試せること。

- 対象：
- 実施：
- 何を測る：
- 何が分かったら仮説支持／反証：

## 9. Before → After

**議論前：**

↓

**議論後：**

## 10. 他テーマのチームに聞きたいこと

**対象Theme：**

**Question：**

**なぜそのテーマに答えてほしいか：**

---

# AI統合時の分析テンプレート

10チームのAI Transformation Discussionを横断分析する。

単なる要約はせず、以下を分けて整理する。

1. 各Research Themeで複数チームから支持された暫定仮説
2. 同一Theme内で意見が分かれた点
3. 自社Projectで複数回観察されたEvidence
4. External evidenceだけで、自社Evidenceがまだない仮説
5. 仮説への反例
6. 5テーマを横断して繰り返し現れるPrinciple
7. Theme間で矛盾・緊張関係にある結論
8. 一方のThemeでは解決できず、他Themeの設計を必要とする問題
9. すぐ試せるExperiment
10. 部門レベル・全社レベルで検討すべきAction

加えて、各Evidenceについて、

> **Local OptimizationとSystem Optimizationを区別する。**

以下のような「負荷移動」を抽出する。

- Execution → Verification
- Junior → Senior
- Individual → Team
- Build → Maintenance
- Human → AI
- AI → Human review
- Central → Business
- Short-term productivity → Long-term learning cost

Fact、参加者の解釈、AIによる新しい推論を明確に区別する。

AI自身の推論には必ず、

> **AI仮説**

と表示する。

---

# 他テーマへの問いを使ったCross-theme Discussion

## Theme 1 → Theme 3
> Executionを消した方が効率的なら、それでどうやってJudgmentを育成する？

## Theme 3 → Theme 1
> Learningのために意図的にHuman Executionを残すなら、Work Redesignの最適解とは矛盾しない？

## Theme 2 → Theme 4
> ProfessionalがWork Architectになるなら、それはどの組織に所属すべき？

## Theme 4 → Theme 2
> Outcome型Teamが増えたとき、Functional Expertiseは誰が育てる？

## Theme 4 → Theme 5
> Decisionが部門横断になったら、Accountabilityはどこへ置く？

## Theme 5 → Theme 4
> DynamicなWork Flowに固定的な承認権限表で対応できる？

## Theme 1 → Theme 4
> Handoff削減と属人化防止はどう両立する？

## Theme 2 → Theme 3
> Meta-workはExecution経験なしに育てられる？

## Theme 3 → Theme 4
> 人を流動化しながら、長期のTrust・Community・Mentoringをどう維持する？

## Theme 2 → Theme 5
> 人のSpan of Capabilityが組織のSpan of Controlを超えたらどうする？

---

# 最終統合アウトプット

ワークショップ終了時には、「テーマ別まとめ」だけで終わらせない。

## We Believe
かなり確からしいPrinciples

## We Observed
自社PJで見つかったEvidence

## We Don't Know Yet
重要だがEvidence不足の問い

## We Will Try
次に検証するExperiment

---

# 最後に全体へ出す問い

> # **AIによって、何が減ったか？**
>
> だけではなく、
>
> # **その負荷は、本当に消えたのか。**
> # **それとも別の人・別の工程・未来へ移っただけなのか？**

そしてもう一つ。

> # **AIによって生まれた個人の能力を、**
> # **どうすれば組織の能力に変換できるのか？**

今回のワークショップの裏テーマは、この2問。

前回の共有会が、

> **自由にするために、構造を強くする**

という企業設計の発見だったとすると、今回の実践編では、

> **「速くなったか」ではなく、「どこへ負荷と能力が移ったか」を見る。**

という観察眼を部門全体で持つことを目指す。
