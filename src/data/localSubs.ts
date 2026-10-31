/**
 * 作物共建提交的本地兜底
 * 线上静态托管（无 Node 后端）时，提交/审核/列表全部降级到 localStorage，
 * 保证「农户提交 → 专家审核 → 农户查看进度」在演示环境完整闭环。
 * 有后端时这些函数不会被调用。
 */
import type { CropSubmission } from '@/types'

const KEY = 'ylnz_local_subs'

type LocalSub = CropSubmission & { local?: boolean }

export const listLocalSubs = (): LocalSub[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

const saveAll = (list: LocalSub[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* 存储超限静默 */
  }
}

export const addLocalSub = (item: Partial<CropSubmission>): LocalSub => {
  const full: LocalSub = {
    id: Date.now(),
    status: 'pending',
    note: '',
    reviewer: '',
    createdAt: new Date().toISOString(),
    reviewedAt: '',
    local: true,
    name: '',
    alias: '',
    province: '云南',
    altitude: '',
    season: '',
    emoji: '🌱',
    desc: '',
    pests: '',
    submitter: '',
    contact: '',
    ...item
  } as LocalSub
  const list = listLocalSubs()
  list.unshift(full)
  saveAll(list)
  return full
}

/** 专家审核本地提交（更新状态与备注） */
export const reviewLocalSub = (
  id: number,
  patch: { status: string; note?: string }
): LocalSub | null => {
  const list = listLocalSubs()
  const idx = list.findIndex((s) => s.id === id)
  if (idx === -1) return null
  list[idx] = {
    ...list[idx],
    status: patch.status as LocalSub['status'],
    note: patch.note || '',
    reviewer: '专家审核组',
    reviewedAt: new Date().toISOString()
  }
  saveAll(list)
  return list[idx]
}

/** 按状态过滤（与后端 listCropSubmissions 行为一致） */
export const listLocalSubsFiltered = ({ status, province }: { status?: string; province?: string } = {}) => {
  let list = listLocalSubs()
  if (status && status !== 'all') list = list.filter((s) => s.status === status)
  if (province) list = list.filter((s) => s.province === province)
  return { total: list.length, items: list }
}

/** 我的提交（按提交人昵称/账号匹配；未匹配到人时视为本机全部提交） */
export const myLocalSubs = (who: string) => {
  const list = listLocalSubs()
  if (!who) return list
  const mine = list.filter((s) => s.submitter === who)
  return mine.length ? mine : list
}
