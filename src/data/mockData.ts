import type { Company, Organization, Person, Position, Affiliation, Operation } from '../types/domain'

// ── Companies ─────────────────────────────────────────────────
export const companies: Company[] = [
  { id: 'comp_a', name: 'A社', hasSF: true },
  { id: 'comp_b', name: 'B社', hasSF: true },
  { id: 'comp_c', name: 'C社', hasSF: false },
]

// ── Organizations (3 roots + 15 displayed = 18 total) ─────────
export const organizations: Organization[] = [
  // A社 root
  { id: 'org_a',             name: 'A社',         companyId: 'comp_a', parentId: null,              level: 1 },
  // Level 2
  { id: 'org_a_keiei',       name: '経営企画本部', companyId: 'comp_a', parentId: 'org_a',           level: 2 },
  { id: 'org_a_eigyo',       name: '営業本部',     companyId: 'comp_a', parentId: 'org_a',           level: 2 },
  { id: 'org_a_shukko',      name: '出向管理部',   companyId: 'comp_a', parentId: 'org_a',           level: 2 },
  // Level 3 (under 経営企画本部)
  { id: 'org_a_kikaku',      name: '経営企画部',   companyId: 'comp_a', parentId: 'org_a_keiei',     level: 3 },
  { id: 'org_a_dx',          name: 'DX推進室',     companyId: 'comp_a', parentId: 'org_a_keiei',     level: 3 },
  // Level 3 (under 営業本部)
  { id: 'org_a_eigyo1',      name: '営業第一部',   companyId: 'comp_a', parentId: 'org_a_eigyo',     level: 3 },
  { id: 'org_a_eigyo2',      name: '営業第二部',   companyId: 'comp_a', parentId: 'org_a_eigyo',     level: 3 },
  { id: 'org_a_eigyo_kikaku',name: '営業企画部',   companyId: 'comp_a', parentId: 'org_a_eigyo',     level: 3 },
  // Level 4 (under 経営企画部)
  { id: 'org_a_senryaku',    name: '経営戦略室',   companyId: 'comp_a', parentId: 'org_a_kikaku',    level: 4 },
  { id: 'org_a_gyomu',       name: '業務推進課',   companyId: 'comp_a', parentId: 'org_a_kikaku',    level: 4 },
  // Level 4 (under 営業第一部)
  { id: 'org_a_ka1',         name: '営業一課',     companyId: 'comp_a', parentId: 'org_a_eigyo1',    level: 4 },
  { id: 'org_a_ka2',         name: '営業二課',     companyId: 'comp_a', parentId: 'org_a_eigyo1',    level: 4 },
  // B社 (root + 2)
  { id: 'org_b',             name: 'B社',         companyId: 'comp_b', parentId: null,              level: 1 },
  { id: 'org_b_eigyo',       name: '営業部',       companyId: 'comp_b', parentId: 'org_b',           level: 2 },
  { id: 'org_b_kaihatsu',    name: '開発部',       companyId: 'comp_b', parentId: 'org_b',           level: 2 },
  // C社 (root + 1)
  { id: 'org_c',             name: 'C社',         companyId: 'comp_c', parentId: null,              level: 1 },
  { id: 'org_c_jigyou',      name: '事業部',       companyId: 'comp_c', parentId: 'org_c',           level: 2 },
]

// ── Persons (40) ──────────────────────────────────────────────
// A社 employed (30)
export const persons: Person[] = [
  // 経営企画本部 head
  { id: 'p_tanaka',    name: '田中 健一', sfPersonId: 'SF001' },
  // 経営企画部 (3)
  { id: 'p_ito',       name: '伊藤 大輝', sfPersonId: 'SF002' },
  { id: 'p_watanabe',  name: '渡辺 哲也', sfPersonId: 'SF003' },
  { id: 'p_nakamura',  name: '中村 恵',   sfPersonId: 'SF004' },
  // 経営戦略室 (3)
  { id: 'p_kobayashi', name: '小林 拓海', sfPersonId: 'SF005' },
  { id: 'p_kato',      name: '加藤 奈々', sfPersonId: 'SF006' },
  { id: 'p_yoshida',   name: '吉田 誠',   sfPersonId: 'SF007' },
  // 業務推進課 (2)
  { id: 'p_yamaguchi', name: '山口 陽菜', sfPersonId: 'SF008' },
  { id: 'p_matsumoto', name: '松本 翔',   sfPersonId: 'SF009' },
  // DX推進室 (4)
  { id: 'p_inoue',     name: '井上 さくら', sfPersonId: 'SF010' },
  { id: 'p_kimura',    name: '木村 大地', sfPersonId: 'SF011' },
  { id: 'p_hayashi',   name: '林 美穂',   sfPersonId: 'SF012' },
  { id: 'p_shimizu',   name: '清水 航',   sfPersonId: 'SF013' },
  // 営業本部 head
  { id: 'p_yamada',    name: '山田 太郎', sfPersonId: 'SF014' },
  // 営業第一部 head
  { id: 'p_sato',      name: '佐藤 美咲', sfPersonId: 'SF015' },
  // 営業一課 (4)
  { id: 'p_abe',       name: '阿部 直人', sfPersonId: 'SF016' },
  { id: 'p_ikeda',     name: '池田 麻衣', sfPersonId: 'SF017' },
  { id: 'p_hashimoto', name: '橋本 俊介', sfPersonId: 'SF018' },
  { id: 'p_ishikawa',  name: '石川 由香', sfPersonId: 'SF019' },
  // 営業二課 (4)
  { id: 'p_maeda',     name: '前田 雄太', sfPersonId: 'SF020' },
  { id: 'p_fujita',    name: '藤田 実咲', sfPersonId: 'SF021' },
  { id: 'p_goto',      name: '後藤 誠司', sfPersonId: 'SF022' },
  { id: 'p_kondo',     name: '近藤 千尋', sfPersonId: 'SF023' },
  // 営業第二部 (1)
  { id: 'p_murata',    name: '村田 剛',   sfPersonId: 'SF024' },
  // 営業企画部 (3)
  { id: 'p_hasegawa',  name: '長谷川 博', sfPersonId: 'SF025' },
  { id: 'p_nishida',   name: '西田 香織', sfPersonId: 'SF026' },
  { id: 'p_fujii',     name: '藤井 一郎', sfPersonId: 'SF027' },
  // 出向管理部 (3 currently on secondment to B社)
  { id: 'p_okada',     name: '岡田 杏奈', sfPersonId: 'SF028' },
  { id: 'p_nakajima',  name: '中島 千恵', sfPersonId: 'SF029' },
  { id: 'p_matsuda',   name: '松田 健',   sfPersonId: 'SF030' },
  // B社 native (7)
  { id: 'p_sakamoto',  name: '坂本 理恵', sfPersonId: 'SF031' },
  { id: 'p_uchida',    name: '内田 悠太', sfPersonId: 'SF032' },
  { id: 'p_harada',    name: '原田 博美', sfPersonId: 'SF033' },
  { id: 'p_masuda',    name: '増田 恵理', sfPersonId: 'SF034' },
  { id: 'p_ishida',    name: '石田 浩',   sfPersonId: 'SF035' },
  { id: 'p_yamazaki',  name: '山崎 彩香', sfPersonId: 'SF036' },
  { id: 'p_kawaguchi', name: '川口 竜也', sfPersonId: 'SF037' },
  // C社 employed (3, SF外)
  { id: 'p_suzuki',    name: '鈴木 次郎' },
  { id: 'p_takahashi', name: '高橋 幸子' },
  { id: 'p_okamoto',   name: '岡本 明' },
]

// ── Before Positions ──────────────────────────────────────────
export const beforePositions: Position[] = [
  // 経営企画本部
  { id: 'pos_tanaka',     orgId: 'org_a_keiei',       companyId: 'comp_a', title: '本部長', band: 'B6', isVacant: false, sfPositionId: 'P001' },
  // 経営企画部
  { id: 'pos_ito',        orgId: 'org_a_kikaku',      companyId: 'comp_a', title: '部長',   band: 'B5', isVacant: false, sfPositionId: 'P002' },
  { id: 'pos_watanabe',   orgId: 'org_a_kikaku',      companyId: 'comp_a', title: '課長',   band: 'B4', isVacant: false, sfPositionId: 'P003' },
  { id: 'pos_nakamura',   orgId: 'org_a_kikaku',      companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P004' },
  // 経営戦略室
  { id: 'pos_kobayashi',  orgId: 'org_a_senryaku',    companyId: 'comp_a', title: '室長',   band: 'B5', isVacant: false, sfPositionId: 'P005' },
  { id: 'pos_kato',       orgId: 'org_a_senryaku',    companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P006' },
  { id: 'pos_yoshida',    orgId: 'org_a_senryaku',    companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P007' },
  // 業務推進課
  { id: 'pos_yamaguchi',  orgId: 'org_a_gyomu',       companyId: 'comp_a', title: '課長',   band: 'B4', isVacant: false, sfPositionId: 'P008' },
  { id: 'pos_matsumoto',  orgId: 'org_a_gyomu',       companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P009' },
  // DX推進室
  { id: 'pos_inoue',      orgId: 'org_a_dx',          companyId: 'comp_a', title: '室長',   band: 'B5', isVacant: false, sfPositionId: 'P010' },
  { id: 'pos_kimura',     orgId: 'org_a_dx',          companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P011' },
  { id: 'pos_hayashi',    orgId: 'org_a_dx',          companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P012' },
  { id: 'pos_shimizu',    orgId: 'org_a_dx',          companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P013' },
  // 営業本部
  { id: 'pos_yamada',     orgId: 'org_a_eigyo',       companyId: 'comp_a', title: '本部長', band: 'B6', isVacant: false, sfPositionId: 'P014' },
  // 営業第一部
  { id: 'pos_sato',       orgId: 'org_a_eigyo1',      companyId: 'comp_a', title: '部長',   band: 'B5', isVacant: false, sfPositionId: 'P015' },
  // 営業一課
  { id: 'pos_abe',        orgId: 'org_a_ka1',         companyId: 'comp_a', title: '課長',   band: 'B4', isVacant: false, sfPositionId: 'P016' },
  { id: 'pos_ikeda',      orgId: 'org_a_ka1',         companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P017' },
  { id: 'pos_hashimoto',  orgId: 'org_a_ka1',         companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P018' },
  { id: 'pos_ishikawa',   orgId: 'org_a_ka1',         companyId: 'comp_a', title: '担当',   band: 'B2', isVacant: false, sfPositionId: 'P019' },
  // 営業二課
  { id: 'pos_maeda',      orgId: 'org_a_ka2',         companyId: 'comp_a', title: '課長',   band: 'B4', isVacant: false, sfPositionId: 'P020' },
  { id: 'pos_fujita',     orgId: 'org_a_ka2',         companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P021' },
  { id: 'pos_goto',       orgId: 'org_a_ka2',         companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P022' },
  { id: 'pos_kondo',      orgId: 'org_a_ka2',         companyId: 'comp_a', title: '担当',   band: 'B2', isVacant: false, sfPositionId: 'P023' },
  // 営業第二部
  { id: 'pos_murata',     orgId: 'org_a_eigyo2',      companyId: 'comp_a', title: '部長',   band: 'B5', isVacant: false, sfPositionId: 'P024' },
  // 営業企画部
  { id: 'pos_hasegawa',   orgId: 'org_a_eigyo_kikaku',companyId: 'comp_a', title: '部長',   band: 'B5', isVacant: false, sfPositionId: 'P025' },
  { id: 'pos_nishida',    orgId: 'org_a_eigyo_kikaku',companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P026' },
  { id: 'pos_fujii',      orgId: 'org_a_eigyo_kikaku',companyId: 'comp_a', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P027' },
  // 出向管理部 (A社 side, tracking current secondments)
  { id: 'pos_okada_a',    orgId: 'org_a_shukko',      companyId: 'comp_a', title: '出向中', band: 'B4', isVacant: false, sfPositionId: 'P028' },
  { id: 'pos_nakajima_a', orgId: 'org_a_shukko',      companyId: 'comp_a', title: '出向中', band: 'B3', isVacant: false, sfPositionId: 'P029' },
  { id: 'pos_matsuda_a',  orgId: 'org_a_shukko',      companyId: 'comp_a', title: '出向中', band: 'B3', isVacant: false, sfPositionId: 'P030' },
  // B社 (A社 secondees)
  { id: 'pos_okada_b',    orgId: 'org_b_eigyo',       companyId: 'comp_b', title: '担当',   band: 'B4', isVacant: false, sfPositionId: 'P031' },
  { id: 'pos_nakajima_b', orgId: 'org_b_kaihatsu',    companyId: 'comp_b', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P032' },
  { id: 'pos_matsuda_b',  orgId: 'org_b_kaihatsu',    companyId: 'comp_b', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P033' },
  // B社 native
  { id: 'pos_sakamoto',   orgId: 'org_b_eigyo',       companyId: 'comp_b', title: '部長',   band: 'B5', isVacant: false, sfPositionId: 'P034' },
  { id: 'pos_uchida',     orgId: 'org_b_eigyo',       companyId: 'comp_b', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P035' },
  { id: 'pos_harada',     orgId: 'org_b_eigyo',       companyId: 'comp_b', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P036' },
  { id: 'pos_masuda',     orgId: 'org_b_kaihatsu',    companyId: 'comp_b', title: '部長',   band: 'B5', isVacant: false, sfPositionId: 'P037' },
  { id: 'pos_ishida',     orgId: 'org_b_kaihatsu',    companyId: 'comp_b', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P038' },
  { id: 'pos_yamazaki',   orgId: 'org_b_kaihatsu',    companyId: 'comp_b', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P039' },
  { id: 'pos_kawaguchi',  orgId: 'org_b_kaihatsu',    companyId: 'comp_b', title: '担当',   band: 'B3', isVacant: false, sfPositionId: 'P040' },
  // C社 (SF外)
  { id: 'pos_suzuki_c',   orgId: 'org_c_jigyou',      companyId: 'comp_c', title: '担当',   band: 'B3', isVacant: false },
  { id: 'pos_takahashi_c',orgId: 'org_c_jigyou',      companyId: 'comp_c', title: '担当',   band: 'B3', isVacant: false },
  { id: 'pos_okamoto_c',  orgId: 'org_c_jigyou',      companyId: 'comp_c', title: '担当',   band: 'B3', isVacant: false },
]

// ── Before Affiliations ───────────────────────────────────────
export const beforeAffiliations: Affiliation[] = [
  // 経営企画本部
  { id: 'aff_tanaka',    personId: 'p_tanaka',    positionId: 'pos_tanaka',    type: 'primary', status: 'active', startDate: '2018-04-01' },
  // 経営企画部
  { id: 'aff_ito',       personId: 'p_ito',       positionId: 'pos_ito',       type: 'primary', managerId: 'p_tanaka',   status: 'active', startDate: '2020-04-01' },
  { id: 'aff_watanabe',  personId: 'p_watanabe',  positionId: 'pos_watanabe',  type: 'primary', managerId: 'p_ito',      status: 'active', startDate: '2022-04-01' },
  { id: 'aff_nakamura',  personId: 'p_nakamura',  positionId: 'pos_nakamura',  type: 'primary', managerId: 'p_ito',      status: 'active', startDate: '2023-04-01' },
  // 経営戦略室
  { id: 'aff_kobayashi', personId: 'p_kobayashi', positionId: 'pos_kobayashi', type: 'primary', managerId: 'p_ito',      status: 'active', startDate: '2021-04-01' },
  { id: 'aff_kato',      personId: 'p_kato',      positionId: 'pos_kato',      type: 'primary', managerId: 'p_kobayashi',status: 'active', startDate: '2022-04-01' },
  { id: 'aff_yoshida',   personId: 'p_yoshida',   positionId: 'pos_yoshida',   type: 'primary', managerId: 'p_kobayashi',status: 'active', startDate: '2023-04-01' },
  // 業務推進課
  { id: 'aff_yamaguchi', personId: 'p_yamaguchi', positionId: 'pos_yamaguchi', type: 'primary', managerId: 'p_ito',      status: 'active', startDate: '2021-10-01' },
  { id: 'aff_matsumoto', personId: 'p_matsumoto', positionId: 'pos_matsumoto', type: 'primary', managerId: 'p_yamaguchi',status: 'active', startDate: '2022-04-01' },
  // DX推進室
  { id: 'aff_inoue',     personId: 'p_inoue',     positionId: 'pos_inoue',     type: 'primary', managerId: 'p_tanaka',   status: 'active', startDate: '2021-04-01' },
  { id: 'aff_kimura',    personId: 'p_kimura',    positionId: 'pos_kimura',    type: 'primary', managerId: 'p_inoue',    status: 'active', startDate: '2022-04-01' },
  { id: 'aff_hayashi',   personId: 'p_hayashi',   positionId: 'pos_hayashi',   type: 'primary', managerId: 'p_inoue',    status: 'active', startDate: '2023-04-01' },
  { id: 'aff_shimizu',   personId: 'p_shimizu',   positionId: 'pos_shimizu',   type: 'primary', managerId: 'p_inoue',    status: 'active', startDate: '2024-04-01' },
  // 営業本部
  { id: 'aff_yamada',    personId: 'p_yamada',    positionId: 'pos_yamada',    type: 'primary', status: 'active', startDate: '2019-04-01' },
  // 営業第一部
  { id: 'aff_sato',      personId: 'p_sato',      positionId: 'pos_sato',      type: 'primary', managerId: 'p_yamada',   status: 'active', startDate: '2021-04-01' },
  // 営業一課
  { id: 'aff_abe',       personId: 'p_abe',       positionId: 'pos_abe',       type: 'primary', managerId: 'p_sato',     status: 'active', startDate: '2022-04-01' },
  { id: 'aff_ikeda',     personId: 'p_ikeda',     positionId: 'pos_ikeda',     type: 'primary', managerId: 'p_abe',      status: 'active', startDate: '2023-04-01' },
  { id: 'aff_hashimoto', personId: 'p_hashimoto', positionId: 'pos_hashimoto', type: 'primary', managerId: 'p_abe',      status: 'active', startDate: '2022-10-01' },
  { id: 'aff_ishikawa',  personId: 'p_ishikawa',  positionId: 'pos_ishikawa',  type: 'primary', managerId: 'p_abe',      status: 'active', startDate: '2024-04-01' },
  // 営業二課
  { id: 'aff_maeda',     personId: 'p_maeda',     positionId: 'pos_maeda',     type: 'primary', managerId: 'p_sato',     status: 'active', startDate: '2020-04-01' },
  { id: 'aff_fujita',    personId: 'p_fujita',    positionId: 'pos_fujita',    type: 'primary', managerId: 'p_maeda',    status: 'active', startDate: '2022-04-01' },
  { id: 'aff_goto',      personId: 'p_goto',      positionId: 'pos_goto',      type: 'primary', managerId: 'p_maeda',    status: 'active', startDate: '2023-04-01' },
  { id: 'aff_kondo',     personId: 'p_kondo',     positionId: 'pos_kondo',     type: 'primary', managerId: 'p_maeda',    status: 'active', startDate: '2024-04-01' },
  // 営業第二部
  { id: 'aff_murata',    personId: 'p_murata',    positionId: 'pos_murata',    type: 'primary', managerId: 'p_yamada',   status: 'active', startDate: '2020-04-01' },
  // 営業企画部
  { id: 'aff_hasegawa',  personId: 'p_hasegawa',  positionId: 'pos_hasegawa',  type: 'primary', managerId: 'p_yamada',   status: 'active', startDate: '2022-04-01' },
  { id: 'aff_nishida',   personId: 'p_nishida',   positionId: 'pos_nishida',   type: 'primary', managerId: 'p_hasegawa', status: 'active', startDate: '2023-04-01' },
  { id: 'aff_fujii',     personId: 'p_fujii',     positionId: 'pos_fujii',     type: 'primary', managerId: 'p_hasegawa', status: 'active', startDate: '2022-10-01' },
  // 出向管理部 (A社 side tracking)
  { id: 'aff_okada_a',   personId: 'p_okada',     positionId: 'pos_okada_a',   type: 'primary', managerId: 'p_tanaka',   status: 'active', startDate: '2023-04-01' },
  { id: 'aff_nakajima_a',personId: 'p_nakajima',  positionId: 'pos_nakajima_a',type: 'primary', managerId: 'p_yamada',   status: 'active', startDate: '2022-04-01' },
  { id: 'aff_matsuda_a', personId: 'p_matsuda',   positionId: 'pos_matsuda_a', type: 'primary', managerId: 'p_yamada',   status: 'active', startDate: '2022-04-01' },
  // B社 side (A社 secondees)
  { id: 'aff_okada_b',   personId: 'p_okada',     positionId: 'pos_okada_b',   type: 'primary', managerId: 'p_sakamoto', status: 'active', startDate: '2023-04-01' },
  { id: 'aff_nakajima_b',personId: 'p_nakajima',  positionId: 'pos_nakajima_b',type: 'primary', managerId: 'p_masuda',   status: 'active', startDate: '2022-04-01' },
  { id: 'aff_matsuda_b', personId: 'p_matsuda',   positionId: 'pos_matsuda_b', type: 'primary', managerId: 'p_masuda',   status: 'active', startDate: '2022-04-01' },
  // B社 native
  { id: 'aff_sakamoto',  personId: 'p_sakamoto',  positionId: 'pos_sakamoto',  type: 'primary', status: 'active', startDate: '2018-04-01' },
  { id: 'aff_uchida',    personId: 'p_uchida',    positionId: 'pos_uchida',    type: 'primary', managerId: 'p_sakamoto', status: 'active', startDate: '2022-04-01' },
  { id: 'aff_harada',    personId: 'p_harada',    positionId: 'pos_harada',    type: 'primary', managerId: 'p_sakamoto', status: 'active', startDate: '2023-04-01' },
  { id: 'aff_masuda',    personId: 'p_masuda',    positionId: 'pos_masuda',    type: 'primary', status: 'active', startDate: '2020-04-01' },
  { id: 'aff_ishida',    personId: 'p_ishida',    positionId: 'pos_ishida',    type: 'primary', managerId: 'p_masuda',   status: 'active', startDate: '2022-04-01' },
  { id: 'aff_yamazaki',  personId: 'p_yamazaki',  positionId: 'pos_yamazaki',  type: 'primary', managerId: 'p_masuda',   status: 'active', startDate: '2023-04-01' },
  { id: 'aff_kawaguchi', personId: 'p_kawaguchi', positionId: 'pos_kawaguchi', type: 'primary', managerId: 'p_masuda',   status: 'active', startDate: '2024-04-01' },
  // C社
  { id: 'aff_suzuki_c',    personId: 'p_suzuki',    positionId: 'pos_suzuki_c',    type: 'primary', status: 'active', startDate: '2020-04-01' },
  { id: 'aff_takahashi_c', personId: 'p_takahashi', positionId: 'pos_takahashi_c', type: 'primary', status: 'active', startDate: '2021-04-01' },
  { id: 'aff_okamoto_c',   personId: 'p_okamoto',   positionId: 'pos_okamoto_c',   type: 'primary', status: 'active', startDate: '2022-04-01' },
]

// ── Initial Operations ─────────────────────────────────────────
// Scenario: 岡田(出向中 B社)をC社へ転換、石川を昇格、近藤を営業企画部へ異動
export const initialOperations: Operation[] = [
  {
    id: 'op1', kind: 'RecallFromSecondment',
    label: '出向解除：B社 (岡田)',
    params: { personId: 'p_okada', companyId: 'comp_b' },
    effectiveDate: '2025-04-01', order: 1,
  },
  {
    id: 'op2', kind: 'SendOnSecondment',
    label: '出向：C社/事業部 (岡田)',
    params: { personId: 'p_okada', toCompanyId: 'comp_c', orgId: 'org_c_jigyou', band: 'B4', title: '担当' },
    effectiveDate: '2025-04-01', order: 2,
  },
  {
    id: 'op3', kind: 'Promote',
    label: '昇格：B2→B3 (石川)',
    params: { personId: 'p_ishikawa', companyId: 'comp_a', band: 'B3' },
    effectiveDate: '2025-04-01', order: 3,
  },
  {
    id: 'op4', kind: 'MoveToOrg',
    label: '組織異動：営業企画部 (近藤)',
    params: { personId: 'p_kondo', toOrgId: 'org_a_eigyo_kikaku', companyId: 'comp_a', band: 'B2', title: '担当' },
    effectiveDate: '2025-04-01', order: 4,
  },
]
