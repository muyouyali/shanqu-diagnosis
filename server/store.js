/**
 * 轻量数据存储层
 *
 * 取舍说明：省赛演示场景下引入数据库会增加部署复杂度与故障面。
 * 采用 JSON 文件持久化 + 内存缓存，单文件即可运行，迁移到 SQLite/MySQL 时
 * 只需替换本文件实现，上层路由无需改动（仓储层抽象）。
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { seedRecords } from './seed.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '../../.data')
const FILE = path.join(DATA_DIR, 'records.json')

let cache = null
let writeTimer = null

const ensureDir = () => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

const load = () => {
  if (cache) return cache
  ensureDir()
  if (fs.existsSync(FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
    } catch {
      cache = { records: [], consultations: [], nextId: 1 }
    }
  } else {
    // 首次启动注入演示数据（保证答辩现场即使零使用记录也有看板内容）
    cache = seedRecords()
    persist(true)
  }
  // 兼容旧数据文件：补齐新增集合，避免升级后写入报错
  if (!Array.isArray(cache.cropSubmissions)) cache.cropSubmissions = seedCropSubmissions()
  if (!Array.isArray(cache.records)) cache.records = []
  if (!Array.isArray(cache.consultations)) cache.consultations = []
  if (!Array.isArray(cache.users)) cache.users = seedUsers()
  if (!Array.isArray(cache.messages)) cache.messages = seedMessages()
  if (!cache.sessions) cache.sessions = {}
  if (typeof cache.nextId !== 'number') cache.nextId = 1
  return cache
}

// ==================== 用户与认证 ====================

export const hashPassword = (pwd, salt) =>
  crypto.scryptSync(String(pwd), salt, 32).toString('hex')

export const findUserByAccount = (account) => {
  const db = load()
  const a = String(account || '').trim().toLowerCase()
  if (!a) return null
  return (
    db.users.find(
      (u) =>
        u.phone === a ||
        u.email === a ||
        u.wechatId === a ||
        u.account === a
    ) || null
  )
}

export const findUserById = (id) => {
  const db = load()
  return db.users.find((u) => u.id === Number(id)) || null
}

export const createUser = ({ account, password, nickname, role = 'user', phone = '', email = '', wechatId = '' }) => {
  const db = load()
  if (findUserByAccount(account)) throw new Error('该账号已注册，请直接登录')
  const salt = crypto.randomBytes(8).toString('hex')
  const user = {
    id: nextId(),
    account: String(account).trim().toLowerCase(),
    salt,
    passwordHash: hashPassword(password, salt),
    nickname: String(nickname || '新农友').trim() || '新农友',
    role,
    phone: String(phone).trim(),
    email: String(email).trim(),
    wechatId: String(wechatId).trim(),
    avatar: '',
    region: '',
    createdAt: new Date().toISOString()
  }
  db.users.push(user)
  persist()
  return user
}

export const verifyPassword = (user, password) =>
  user && hashPassword(password, user.salt) === user.passwordHash

// ==================== 无状态签名令牌 ====================
/**
 * 采用 HMAC 签名令牌替代服务端会话表：
 * 线上托管可能运行多个服务实例，文件式会话仅存在于单实例，
 * 登录与后续请求落到不同实例会导致 401。
 * 无状态令牌任何实例均可本地验证，天然支持多实例/重启。
 */
const AUTH_SECRET =
  process.env.AUTH_SECRET || 'ylnz-auth-secret-2026-shanqu-demo-fixed-key'

const TOKEN_TTL = 90 * 24 * 3600 * 1000 // 90 天

const sign = (payload) =>
  crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex').slice(0, 32)

export const createSession = (userId) => {
  const exp = Date.now() + TOKEN_TTL
  const payload = `${Number(userId)}.${exp}`
  return `v1.${payload}.${sign(payload)}`
}

export const getUserByToken = (token) => {
  if (!token || !token.startsWith('v1.')) return null
  const parts = token.split('.')
  if (parts.length !== 4) return null
  const [, uid, exp, sig] = parts
  const payload = `${uid}.${exp}`
  // 防篡改校验 + 过期校验
  if (sign(payload) !== sig) return null
  if (Number(exp) < Date.now()) return null
  const user = findUserById(uid)
  return user || null
}

// 兼容旧接口：无状态令牌无需服务端注销（前端删 token 即可）
export const destroySession = () => true

export const updateUser = (id, patch) => {
  const db = load()
  const idx = db.users.findIndex((u) => u.id === Number(id))
  if (idx === -1) return null
  // 密码与角色不允许通过资料修改接口变更
  const safe = { ...patch }
  delete safe.passwordHash
  delete safe.salt
  delete safe.role
  delete safe.account
  if (safe.password) {
    safe.salt = crypto.randomBytes(8).toString('hex')
    safe.passwordHash = hashPassword(safe.password, safe.salt)
    delete safe.password
  }
  db.users[idx] = { ...db.users[idx], ...safe, updatedAt: new Date().toISOString() }
  persist()
  return publicUser(db.users[idx])
}

export const deleteUser = (id) => {
  const db = load()
  const idx = db.users.findIndex((u) => u.id === Number(id))
  if (idx === -1) return false
  // 注销用户：保留记录审计字段，但抹去个人资料
  db.users.splice(idx, 1)
  // 同步清理其消息（无状态令牌随用户删除自然失效）
  db.messages = db.messages.filter((m) => m.userId !== Number(id))
  persist()
  return true
}

/** 对外暴露的用户信息（去除敏感字段） */
export const publicUser = (u) =>
  u && {
    id: u.id,
    account: u.account,
    nickname: u.nickname,
    role: u.role,
    phone: u.phone,
    email: u.email,
    wechatId: u.wechatId,
    avatar: u.avatar,
    region: u.region,
    createdAt: u.createdAt
  }

/** 演示账号：答辩时专家/农户双角色一键可演示 */
const seedUsers = () => {
  const mk = (id, account, password, nickname, role, extra = {}) => {
    const salt = crypto.randomBytes(8).toString('hex')
    return {
      id,
      account,
      salt,
      passwordHash: hashPassword(password, salt),
      nickname,
      role,
      phone: account,
      email: '',
      wechatId: '',
      avatar: '',
      region: '文山市',
      createdAt: '2026-10-01T08:00:00.000Z',
      ...extra
    }
  }
  return [
    mk(9001, '13800000001', 'demo123', '张专家', 'expert', { email: 'expert@shanqu.ai', region: '昭通市' }),
    mk(9002, '13800000002', 'demo123', '李农户', 'user')
  ]
}

// ==================== 站内消息 ====================
export const createMessage = (item) => {
  const db = load()
  const full = {
    id: nextId(),
    read: false,
    createdAt: new Date().toISOString(),
    ...item
  }
  db.messages.unshift(full)
  if (db.messages.length > 1000) db.messages.length = 1000
  persist()
  return full
}

export const listMessages = ({ userId, limit = 50 } = {}) => {
  const db = load()
  let list = db.messages
  if (userId) list = list.filter((m) => m.userId === Number(userId) || m.userId === 'all')
  return { total: list.length, items: list.slice(0, limit) }
}

export const markMessageRead = (id, userId) => {
  const db = load()
  const m = db.messages.find((x) => x.id === Number(id) && (x.userId === Number(userId) || x.userId === 'all'))
  if (!m) return null
  m.read = true
  persist()
  return m
}

export const markAllRead = (userId) => {
  const db = load()
  let n = 0
  for (const m of db.messages) {
    if (!m.read && (m.userId === Number(userId) || m.userId === 'all')) {
      m.read = true
      n++
    }
  }
  if (n) persist()
  return n
}

/** 清理我的消息：不传 ids 清空全部（本人私信 + 公告对本人不可见），传 ids 只删指定消息 */
export const clearMessages = (userId, ids) => {
  const db = load()
  const uid = Number(userId)
  const before = db.messages.length
  const idSet = Array.isArray(ids) && ids.length ? new Set(ids.map(Number)) : null
  db.messages = db.messages.filter((m) => {
    // 只考虑「属于我的」消息：本人私信或全员公告
    const mine = m.userId === uid || m.userId === 'all'
    if (!mine) return true
    if (idSet) return !idSet.has(Number(m.id))
    return m.userId !== uid
  })
  persist()
  return before - db.messages.length
}

export const unreadCount = (userId) => {
  const db = load()
  return db.messages.filter((m) => !m.read && (m.userId === Number(userId) || m.userId === 'all')).length
}

/** 所有专家账号 id（用于把农户提问推送到专家端） */
export const listExpertIds = () => {
  const db = load()
  return db.users.filter((u) => u.role === 'expert').map((u) => u.id)
}

/** 农户提问 → 推送给所有专家（专家端消息中心可见） */
export const notifyExpertsAsk = ({ user, question, cropName, region }) => {
  const ids = listExpertIds()
  const who = user ? user.nickname || user.account : '游客农户'
  const prefix = [cropName, region].filter(Boolean).join(' · ')
  const title = `${who} 向您提问`
  const content = `${prefix ? `【${prefix}】` : ''}${String(question).slice(0, 300)}`
  return ids.map((id) =>
    createMessage({ userId: id, from: 'user', fromName: who, title, content })
  )
}

/** 灾害预警公告 → 推送给全员（专家端与农户端都收到） */
export const broadcastAlert = ({ title, content }) => {
  return createMessage({ userId: 'all', from: 'system', fromName: '平台公告', title, content })
}

const seedMessages = () => [
  {
    id: 9101,
    userId: 9002,
    from: 'expert',
    fromName: '张专家',
    title: '关于您提交的三七根腐病问诊',
    content:
      '您上周上传的病株照片我已复核：根部分泌物呈褐色、须根腐烂程度判断准确。补充两点：① 高温高湿期建议增施枯草芽孢杆菌进行生物防治；② 若雨季持续，雨后 48 小时内再补喷一次氢氧化铜。如有新症状随时拍照给我。',
    read: false,
    createdAt: '2026-10-24T09:30:00.000Z'
  },
  {
    id: 9102,
    userId: 9002,
    from: 'expert',
    fromName: '张专家',
    title: '审核结果：鲁甸青花椒已收录',
    content: '您所在合作社提交的「鲁甸青花椒」已通过资料核验，正式并入云南地区作物图谱，感谢共建！',
    read: true,
    createdAt: '2026-10-13T10:06:00.000Z'
  },
  {
    id: 9103,
    userId: 'all',
    from: 'system',
    fromName: '平台公告',
    title: '寒潮预警：未来一周注意防冻',
    content: '气象台发布寒潮蓝色预警，滇东北高海拔茶区、苹果园需提前熏烟防霜、培土护根。',
    read: false,
    createdAt: '2026-10-26T18:00:00.000Z'
  }
]
const persist = (immediate = false) => {
  if (writeTimer) clearTimeout(writeTimer)
  const write = () => {
    ensureDir()
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2), 'utf-8')
  }
  if (immediate) write()
  else writeTimer = setTimeout(write, 300)
}

const nextId = () => {
  const db = load()
  const id = db.nextId++
  persist()
  return id
}

/**
 * 首次启动注入的作物提交演示数据
 * 目的：答辩时审核后台一进去就有内容可展示，避免「空白列表说服力弱」
 */
const seedCropSubmissions = () => [
  {
    id: 1,
    name: '鲁甸青花椒',
    alias: '九叶青、顶坛花椒',
    province: '云南',
    altitude: '1400–1900m',
    season: '7–9月',
    emoji: '🌿',
    desc: '昭通鲁甸江边河谷地带特色香料，颗粒饱满、麻味浓烈、香气持久，国家地理标志产品。',
    pests: '蚜虫、花椒锈病、流胶病',
    submitter: '鲁甸县花椒种植合作社',
    contact: 'demo@shanqu.ai',
    status: 'approved',
    note: '资料完整，符合云南高原特色经济作物收录标准。',
    reviewer: '专家审核组',
    createdAt: '2026-10-12T09:20:00.000Z',
    reviewedAt: '2026-10-13T10:05:00.000Z'
  },
  {
    id: 2,
    name: '元江芦荟',
    alias: '库拉索芦荟',
    province: '云南',
    altitude: '400–900m',
    season: '全年可采',
    emoji: '🪴',
    desc: '元江干热河谷规模化种植，叶肉厚、多糖含量高，主要用于日化与食品原料。',
    pests: '根腐病、黑斑病、介壳虫',
    submitter: '元江热区农业服务中心',
    contact: 'demo2@shanqu.ai',
    status: 'pending',
    note: '',
    reviewer: '',
    createdAt: '2026-10-20T14:32:00.000Z',
    reviewedAt: ''
  },
  {
    id: 3,
    name: '景谷芒果',
    alias: '三年芒',
    province: '云南',
    altitude: '600–1200m',
    season: '5–8月',
    emoji: '🥭',
    desc: '普洱景谷河谷芒果，早熟、香气足，但信息待补充。',
    pests: '炭疽病',
    submitter: '个人农户',
    contact: '',
    status: 'rejected',
    note: '缺少适宜海拔与病虫害资料，建议补充后重新提交。',
    reviewer: '专家审核组',
    createdAt: '2026-10-08T08:00:00.000Z',
    reviewedAt: '2026-10-09T16:40:00.000Z'
  }
]

// ==================== 诊断记录 ====================
export const createRecord = (record) => {
  const db = load()
  const full = {
    id: nextId(),
    createdAt: new Date().toISOString(),
    ...record
  }
  db.records.unshift(full)
  if (db.records.length > 2000) db.records.length = 2000
  persist()
  return full
}

export const listRecords = ({ cropId, limit = 50, offset = 0, userId } = {}) => {
  const db = load()
  let list = db.records
  if (cropId) list = list.filter((r) => r.cropId === cropId)
  if (userId) list = list.filter((r) => r.userId === userId)
  return {
    total: list.length,
    items: list.slice(offset, offset + limit)
  }
}

export const getRecord = (id) => {
  const db = load()
  return db.records.find((r) => r.id === Number(id)) || null
}

export const updateRecord = (id, patch) => {
  const db = load()
  const idx = db.records.findIndex((r) => r.id === Number(id))
  if (idx === -1) return null
  db.records[idx] = { ...db.records[idx], ...patch, updatedAt: new Date().toISOString() }
  persist()
  return db.records[idx]
}

export const deleteRecord = (id) => {
  const db = load()
  const idx = db.records.findIndex((r) => r.id === Number(id))
  if (idx === -1) return false
  db.records.splice(idx, 1)
  persist()
  return true
}

// ==================== 统计聚合 ====================
export const getStats = ({ days = 30, cropId } = {}) => {
  const db = load()
  const since = Date.now() - days * 24 * 3600 * 1000
  let records = db.records.filter((r) => new Date(r.createdAt).getTime() >= since)
  if (cropId) records = records.filter((r) => r.cropId === cropId)

  // 病害排行
  const diseaseCount = new Map()
  for (const r of records) {
    const name = r.diagnosis?.results?.[0]?.name
    if (name) diseaseCount.set(name, (diseaseCount.get(name) || 0) + 1)
  }
  const topDiseases = [...diseaseCount.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // 按天趋势
  const dayMap = new Map()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const key = d.toISOString().slice(0, 10)
    dayMap.set(key, 0)
  }
  for (const r of records) {
    const key = new Date(r.createdAt).toISOString().slice(0, 10)
    if (dayMap.has(key)) dayMap.set(key, dayMap.get(key) + 1)
  }
  const trend = [...dayMap.entries()].map(([date, count]) => ({ date, count }))

  // 作物分布
  const cropMap = new Map()
  for (const r of records) {
    cropMap.set(r.cropId, (cropMap.get(r.cropId) || 0) + 1)
  }
  const cropDist = [...cropMap.entries()].map(([id, count]) => ({ cropId: id, count }))

  // 区域分布（按县）
  const regionMap = new Map()
  for (const r of records) {
    const region = r.region || '未标注'
    regionMap.set(region, (regionMap.get(region) || 0) + 1)
  }
  const regions = [...regionMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  // 置信度分布
  const confBuckets = { high: 0, medium: 0, low: 0 }
  for (const r of records) {
    const lvl = r.diagnosis?.results?.[0]?.confidenceLevel
    if (lvl && confBuckets[lvl] !== undefined) confBuckets[lvl]++
  }

  // 需人工复核占比
  const escalated = records.filter((r) => r.gate?.needHumanReview).length

  return {
    total: records.length,
    days,
    topDiseases,
    trend,
    cropDist,
    regions,
    confBuckets,
    escalated,
    escalatedRate: records.length ? Number((escalated / records.length * 100).toFixed(1)) : 0,
    avgConfidence: records.length
      ? Number(
          (
            records.reduce((s, r) => s + (r.diagnosis?.results?.[0]?.confidence || 0), 0) /
            records.length
          ).toFixed(2)
        )
      : 0
  }
}

// ==================== 问答历史 ====================
export const saveConsultation = (item) => {
  const db = load()
  db.consultations.unshift({ id: nextId(), createdAt: new Date().toISOString(), ...item })
  if (db.consultations.length > 500) db.consultations.length = 500
  persist()
  return db.consultations[0]
}

export const listConsultations = (limit = 20) => {
  const db = load()
  return db.consultations.slice(0, limit)
}

// ==================== 作物百科：用户提交与专家审核 ====================
export const createCropSubmission = (item) => {
  const db = load()
  const full = {
    id: nextId(),
    status: 'pending',
    note: '',
    reviewer: '',
    createdAt: new Date().toISOString(),
    reviewedAt: '',
    ...item
  }
  db.cropSubmissions.unshift(full)
  persist()
  return full
}

export const listCropSubmissions = ({ status, province, limit = 100 } = {}) => {
  const db = load()
  let list = db.cropSubmissions
  if (status && status !== 'all') list = list.filter((r) => r.status === status)
  if (province) list = list.filter((r) => r.province === province)
  return {
    total: list.length,
    items: list.slice(0, limit)
  }
}

export const getCropSubmission = (id) => {
  const db = load()
  return db.cropSubmissions.find((r) => r.id === Number(id)) || null
}

export const reviewCropSubmission = (id, { status, note = '', reviewer = '专家审核组' } = {}) => {
  const db = load()
  const idx = db.cropSubmissions.findIndex((r) => r.id === Number(id))
  if (idx === -1) return null
  db.cropSubmissions[idx] = {
    ...db.cropSubmissions[idx],
    status,
    note,
    reviewer,
    reviewedAt: new Date().toISOString()
  }
  persist()
  return db.cropSubmissions[idx]
}

export const deleteCropSubmission = (id) => {
  const db = load()
  const idx = db.cropSubmissions.findIndex((r) => r.id === Number(id))
  if (idx === -1) return false
  db.cropSubmissions.splice(idx, 1)
  persist()
  return true
}

/** 已通过审核的作物（进入地区作物百科） */
export const listApprovedCrops = (province) => {
  const db = load()
  return db.cropSubmissions.filter(
    (r) => r.status === 'approved' && (!province || r.province === province)
  )
}

export const resetDemoData = () => {
  cache = seedRecords()
  cache.cropSubmissions = seedCropSubmissions()
  cache.users = seedUsers()
  cache.messages = seedMessages()
  persist(true)
  return true
}
