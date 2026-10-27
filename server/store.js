/**
 * 轻量数据存储层
 *
 * 取舍说明：省赛演示场景下引入数据库会增加部署复杂度与故障面。
 * 采用 JSON 文件持久化 + 内存缓存，单文件即可运行，迁移到 SQLite/MySQL 时
 * 只需替换本文件实现，上层路由无需改动（仓储层抽象）。
 */

import fs from 'node:fs'
import path from 'node:path'
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
  return cache
}

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

export const resetDemoData = () => {
  cache = seedRecords()
  persist(true)
  return true
}
