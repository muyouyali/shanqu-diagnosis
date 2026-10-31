/**
 * 专家列表与咨询的本地兜底
 * 线上静态托管（无 Node 后端）时，/api/experts 与 /api/consult 不可用，
 * 这里提供「内置专家种子 + 本机注册专家」合并列表，保证新注册的专家立即出现在专家列表里，
 * 且咨询单落到 localStorage 后专家端能看到。有后端时这些函数不会被调用。
 */
import type { Expert, Consult } from '@/types'

const KEY_EXPERTS = 'ylnz_local_experts'
const KEY_CONSULTS = 'ylnz_local_consults'

type LocalExpert = Expert & {
  local?: boolean
  intro?: string
  years?: number
  consultCount?: number
}

/** 内置专家种子：覆盖云南主要农技站与科研院所 */
export const SEED_EXPERTS: LocalExpert[] = [
  {
    id: 9001,
    account: 'expert_li',
    nickname: '李文山',
    role: 'expert',
    phone: '',
    email: '',
    wechatId: '',
    avatar: '',
    region: '文山市',
    title: '文山州农科院 · 三七研究所研究员',
    specialty: ['三七', '中药材', '根腐病'],
    intro: '从事三七连作障碍与病害防控研究 18 年，主持制定文山三七标准化种植规程。',
    years: 18,
    consultCount: 1264,
    createdAt: '2023-03-12T00:00:00.000Z',
    match: 0,
    hitCrop: false,
    hitRegion: false
  },
  {
    id: 9002,
    account: 'expert_yang',
    nickname: '杨春梅',
    role: 'expert',
    phone: '',
    email: '',
    wechatId: '',
    avatar: '',
    region: '普洱市',
    title: '云南省农科院茶叶研究所 · 副研究员',
    specialty: ['茶树', '茶叶', '小绿叶蝉'],
    intro: '普洱茶区绿色防控技术推广负责人，擅长茶园虫害生态调控。',
    years: 12,
    consultCount: 873,
    createdAt: '2023-06-08T00:00:00.000Z',
    match: 0,
    hitCrop: false,
    hitRegion: false
  },
  {
    id: 9003,
    account: 'expert_yan',
    nickname: '岩温罕',
    role: 'expert',
    phone: '',
    email: '',
    wechatId: '',
    avatar: '',
    region: '西双版纳州',
    title: '西双版纳州农业技术推广站 · 高级农艺师',
    specialty: ['咖啡', '橡胶', '热带作物'],
    intro: '长期驻点勐腊、勐海，主攻小粒咖啡锈病与炭疽病综合管理。',
    years: 15,
    consultCount: 642,
    createdAt: '2023-09-20T00:00:00.000Z',
    match: 0,
    hitCrop: false,
    hitRegion: false
  },
  {
    id: 9004,
    account: 'expert_zhang',
    nickname: '张红兵',
    role: 'expert',
    phone: '',
    email: '',
    wechatId: '',
    avatar: '',
    region: '昭通市',
    title: '昭通市苹果产业办 · 技术总监',
    specialty: ['苹果', '核桃', '腐烂病'],
    intro: '昭通高原苹果老果园改造与枝干病害防治专家。',
    years: 20,
    consultCount: 1105,
    createdAt: '2023-02-16T00:00:00.000Z',
    match: 0,
    hitCrop: false,
    hitRegion: false
  },
  {
    id: 9005,
    account: 'expert_ma',
    nickname: '马晓芸',
    role: 'expert',
    phone: '',
    email: '',
    wechatId: '',
    avatar: '',
    region: '红河州',
    title: '红河州植保植检站 · 农艺师',
    specialty: ['石榴', '柑橘', '实蝇'],
    intro: '蒙自石榴产区虫害监测与绿色防控技术负责人。',
    years: 9,
    consultCount: 428,
    createdAt: '2024-01-11T00:00:00.000Z',
    match: 0,
    hitCrop: false,
    hitRegion: false
  },
  {
    id: 9006,
    account: 'expert_zhao',
    nickname: '赵德明',
    role: 'expert',
    phone: '',
    email: '',
    wechatId: '',
    avatar: '',
    region: '昆明市',
    title: '云南农业大学植物保护学院 · 教授',
    specialty: ['马铃薯', '玉米', '晚疫病'],
    intro: '云南省马铃薯晚疫病预警系统主要建设者，常年服务滇东北产区。',
    years: 22,
    consultCount: 1533,
    createdAt: '2023-01-05T00:00:00.000Z',
    match: 0,
    hitCrop: false,
    hitRegion: false
  }
]

const read = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}

const write = (key: string, val: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch {
    /* 存储超限静默 */
  }
}

/** 本机注册/体验登录的专家账号 */
export const listLocalExperts = (): LocalExpert[] => read<LocalExpert[]>(KEY_EXPERTS, [])

/** 注册专家后调用，使其立即出现在专家列表 */
export const addLocalExpert = (u: any): LocalExpert => {
  const item: LocalExpert = {
    id: Number(u.id) || Date.now(),
    account: u.account || '',
    nickname: u.nickname || u.account || '农技专家',
    role: 'expert',
    phone: u.phone || '',
    email: u.email || '',
    wechatId: u.wechatId || '',
    avatar: u.avatar || '',
    region: u.region || '云南',
    title: u.title || '农技专家',
    specialty: u.specialty?.length ? u.specialty : ['综合农技'],
    createdAt: u.createdAt || new Date().toISOString(),
    match: 0,
    hitCrop: false,
    hitRegion: false,
    local: true,
    intro: u.intro || '',
    years: u.years || 1,
    consultCount: 0
  }
  const list = listLocalExperts().filter((e) => e.id !== item.id)
  list.unshift(item)
  write(KEY_EXPERTS, list)
  return item
}

/** 合并专家：本机注册专家优先置顶（新入驻要先被看到），再并内置种子 */
export const mergeExperts = (remote: LocalExpert[] = []): LocalExpert[] => {
  const local = listLocalExperts()
  const seen = new Set<string>()
  const all = [...local, ...remote, ...SEED_EXPERTS]
  return all.filter((e) => {
    const k = `${e.nickname}|${e.title || ''}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** 匹配度：与后端 /api/experts 同构（作物命中 +2，地区命中 +1） */
export const scoreExpert = (e: LocalExpert, cropName: string, region: string) => {
  let match = 0
  const hitCrop = !!cropName && (e.specialty || []).some((s) => cropName.includes(s) || s.includes(cropName))
  const hitRegion = !!region && !!e.region && (e.region.includes(region) || region.includes(e.region))
  if (hitCrop) match += 2
  if (hitRegion) match += 1
  return { ...e, match, hitCrop, hitRegion }
}

/* ---------- 咨询单 ---------- */

export const listLocalConsults = (): Consult[] => read<Consult[]>(KEY_CONSULTS, [])

export const addLocalConsult = (item: Partial<Consult>): Consult => {
  const full = {
    id: Date.now(),
    status: 'pending',
    reply: '',
    createdAt: new Date().toISOString(),
    ...item
  } as Consult
  const list = listLocalConsults()
  list.unshift(full)
  write(KEY_CONSULTS, list)
  return full
}
