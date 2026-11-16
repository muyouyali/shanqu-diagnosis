/**
 * API 服务入口
 * 单进程 Express 服务，同时承担 API 与生产环境下前端静态托管
 */

import 'dotenv/config'
import crypto from 'node:crypto'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { CROPS, DISEASES, PESTICIDE_SAFETY, getDiseasesByCrop } from './kb/diseases.js'
import { ATLAS, ATLAS_CITY } from './kb/crops-atlas.js'
import { CITY_CROPS, CITY_CROPS_PROVINCE } from './kb/city-crops.js'
import { provinceOf } from './kb/regions.js'
import { retrieve, buildContext, getDocCount, registerCommunityDiseases } from './kb/retriever.js'
import { isConfigured, getConfigSummary, metrics, chatText, chatStream, chatRaw, extractJSON } from './ai/adapter.js'
import { getWeatherForecast, executeTool, runWithTools, TOOL_DEFINITIONS } from './ai/tools.js'
import { buildQAPrompt, buildReviewPrompt, buildAlertPrompt, CROP_NAME } from './ai/prompts.js'
import { runDiagnosisWorkflow } from './agents/workflow.js'
import * as store from './store.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3001

/**
 * 检索纠偏：若限定了作物但检索结果与问题明显不符（如问"茶饼病"却选了三七），
 * 自动去掉作物过滤重新检索，取更优结果
 */
const resolveKbContext = (question, cropId, topK = 4) => {
  // 问题文本中明确提到其他作物名/别名时，忽略当前作物过滤
  const otherMentioned = CROPS.some((c) => {
    if (c.id === cropId) return false
    const names = [c.name, ...(c.alias || '').split('、')]
    return names.some((n) => n.length > 1 && question.includes(n))
  })
  if (otherMentioned) cropId = null

  const kb = buildContext(question, { cropId, topK })
  if (cropId) {
    // 与全库检索对比：若全库最优结果绝对分更高，说明问题指向别的作物
    const alt = buildContext(question, { cropId: null, topK })
    const a = kb.hits[0]?.score ?? 0
    const b = alt.hits[0]?.score ?? 0
    if (b > a * 1.5) return alt
  }
  return kb
}

/** 检索命中 → 前端溯源结构（含资料出处与知识库原文片段） */
const toCiteSources = (kb) =>
  kb.hits.map((h) => {
    const d = h.disease
    return {
      id: h.id,
      name: d.name,
      cropId: h.cropId,
      cropName: CROP_NAME[h.cropId] || '',
      score: h.scoreNormalized,
      type: d.type,
      symptoms: d.symptoms.slice(0, 2),
      // 溯源引用：植保手册/文献出处
      references: d.references || [],
      // 知识库原始文本片段（展开引用区块时展示，防模型幻觉可对照原文）
      excerpt: [
        `【${d.name} · ${d.type}】`,
        `典型症状：${d.symptoms.slice(0, 3).join('；')}`,
        d.causes?.length ? `发病原因：${d.causes.slice(0, 2).join('；')}` : '',
        `防治措施：${(d.treatment || []).slice(0, 3).join('；')}`,
        `安全提示：${d.safetyNote}`
      ]
        .filter(Boolean)
        .join('\n')
    }
  })

/** 空召回固定兜底文案（防止模型在无知识库依据时自由发挥编造植保知识） */
const NO_HIT_ANSWER = '当前本地知识库暂无该问题相关资料，你可以前往提交病害样本或者申请专家复核咨询。'

/**
 * 有效召回过滤：BM25 绝对分 < 10 的命中属于弱相关噪声
 * （实测分布：真实植保问题顶部命中 ≥14，无关问题 ≤8.4），
 * 不清除会把"榴莲什么时候熟"这类问题当成"有依据"，触发模型自由发挥。
 */
const MIN_VALID_SCORE = 10
const filterValidHits = (kb) => ({ ...kb, hits: kb.hits.filter((h) => h.score >= MIN_VALID_SCORE) })

app.use(cors())
app.use(express.json({ limit: '20mb' }))

// ==================== 基础信息 ====================

// 知识库检索演示（RAG 面板用）：返回 top-K 命中与匹配度
app.get('/api/kb/search', (req, res) => {
  const q = String(req.query.q || '').trim()
  if (!q) return res.json({ hits: [], total: { docs: getDocCount(), diseases: DISEASES.length, crops: CROPS.length } })
  const cropId = String(req.query.cropId || '').trim() || null
  const kb = resolveKbContext(q, cropId, 5)
  res.json({
    hits: kb.hits.map((h) => ({
      id: h.id,
      name: h.disease.name,
      cropId: h.cropId,
      cropName: CROP_NAME[h.cropId] || '',
      score: h.scoreNormalized,
      type: h.disease.type,
      symptoms: h.disease.symptoms.slice(0, 3),
      treatment: (h.disease.treatment || []).slice(0, 2),
      alias: h.disease.alias || ''
    })),
    total: { docs: getDocCount(), diseases: DISEASES.length, crops: CROPS.length }
  })
})

// 坐标 → 地名反查中转：服务端直连免费服务，绕过浏览器网络限制
app.get('/api/geo/reverse', async (req, res) => {
  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: '缺少经纬度' })
  }
  const providers = [
    {
      name: 'bigdatacloud',
      url: `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`,
      parse: (j) => [j.city, j.locality, j.principalSubdivision].filter(Boolean)
    },
    {
      name: 'nominatim',
      url: `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=zh-CN`,
      parse: (j) => {
        const a = j.address || {}
        return [a.county, a.city, a.district, a.state].filter(Boolean)
      }
    }
  ]
  for (const p of providers) {
    try {
      const r = await Promise.race([
        fetch(p.url, { headers: { Accept: 'application/json', 'User-Agent': 'yunling-nongzhen/1.0' }, signal: AbortSignal.timeout(5000) }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5500))
      ])
      if (!r.ok) continue
      const j = await r.json()
      const names = p.parse(j)
      if (names.length) return res.json({ ok: true, provider: p.name, names })
    } catch { /* 尝试下一个服务 */ }
  }
  res.status(502).json({ error: '反查服务均不可用' })
})

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    version: '1.0.0',
    ai: getConfigSummary(),
    kb: {
      crops: CROPS.length,
      diseases: DISEASES.length,
      docs: getDocCount(),
      pesticides: PESTICIDE_SAFETY.length
    },
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  })
})

app.get('/api/crops', (req, res) => {
  const region = req.query.region || ''
  const province = provinceOf(region) || ''
  const keyword = String(req.query.keyword || '').trim()

  // 本地知识库作物：带完整病害知识，可走诊断流程
  // 州市级白名单优先（确保当地真实种植），未配置州市回退省级 + 省级兜底过滤
  const isYunnan = province === '云南'
  const cityWhitelist = CITY_CROPS[region]
  const provinceFilter = CITY_CROPS_PROVINCE[province]
  const isInLocal = (c) => {
    if (cityWhitelist) return cityWhitelist.includes(c.id)
    if (provinceFilter == null) return true
    return provinceFilter.includes(c.id)
  }
  const kbCrops = CROPS.map((c) => ({
    id: c.id,
    name: c.name,
    alias: c.alias || '',
    emoji: c.emoji || '🌱',
    tagline: (isYunnan ? c.tagline : c.taglineGeneral || c.tagline) || '',
    desc: (isYunnan ? c.tagline : c.taglineGeneral || c.tagline) || '',
    season: c.season || '',
    altitude: c.altitude || '',
    regions: c.regions || [],
    diseaseCount: getDiseasesByCrop(c.id).length,
    diagnosable: true,
    local: false,
    source: 'kb'
  }))

  const localKb = province
    ? kbCrops.filter((c) => c.regions.includes(province) && isInLocal(c))
    : []
  localKb.forEach((c) => { c.local = true })
  const otherKb = kbCrops.filter((c) => !localKb.includes(c))

  // 地区百科作物：知识库未收录，仅作资料展示与问答参考（州市级条目优先于省级）
  // 具体州市只匹配本市条目，不回退省级——避免「文山市出现昭通苹果」类跨区串显；
  // 仅当未选具体地区（全省视图）时才使用省级百科
  const isProvinceView = !region || region === province
  const atlasRaw = [
    ...((ATLAS_CITY[region] || (isProvinceView ? ATLAS[province] : null)) || []).map((a) => ({ ...a, source: 'atlas' })),
    ...store.listApprovedCrops(province, region).map((s) => ({
      name: s.name,
      alias: s.alias || '',
      emoji: s.emoji || '🌱',
      desc: s.desc || '',
      season: s.season || '',
      altitude: s.altitude || '',
      pests: s.pests || '',
      source: 'community'
    }))
  ]
  const atlasCrops = atlasRaw
    .filter((a) => !kbCrops.some((c) => c.name === a.name || (c.alias || '').includes(a.name)))
    .map((a, i) => ({
      id: `atlas-${province}-${i}`,
      name: a.name,
      alias: a.alias || '',
      emoji: a.emoji,
      tagline: a.desc,
      desc: a.desc,
      season: a.season,
      altitude: a.altitude,
      pests: a.pests || '',
      regions: province ? [province] : [],
      diseaseCount: 0,
      diagnosable: false,
      local: true,
      source: a.source
    }))

  let items = [...localKb, ...atlasCrops, ...otherKb]
  // 州市级特色优先：所选州市的主导作物排到最前（id = 知识库作物；名称子串 = 地区百科作物）
  const CITY_SPECIALTY = {
    文山州: ['sanqi', 'pepper'],
    文山市: ['sanqi'],
    昭通市: ['tianma', 'walnut', '苹果'],
    普洱市: ['tea', 'coffee'],
    红河州: ['shiliu', '芒果'],
    曲靖市: ['moyu', '马铃薯'],
    昆明市: ['blueberry', 'citrus', '玫瑰'],
    丽江市: ['walnut', 'blueberry', '苹果'],
    大理白族自治州: ['walnut', '柑橘'],
    大理市: ['walnut', '柑橘'],
    保山市: ['coffee', 'tea', '柑橘'],
    临沧市: ['tea', '甘蔗'],
    西双版纳州: ['tea', 'coffee', '香蕉'],
    德宏州: ['coffee', 'tea', '甘蔗'],
    怒江州: ['walnut', '草果'],
    迪庆州: ['walnut', '葡萄'],
    楚雄州: ['walnut', 'moyu', '核桃'],
    玉溪市: ['citrus', 'blueberry', '柑橘'],
    // 四川
    成都市: ['citrus', '猕猴桃', 'moyu'],
    乐山市: ['tea', 'citrus', '柠檬'],
    凉山州: ['苹果', 'potato', '马铃薯', 'walnut'],
    宜宾市: ['tea', 'citrus', '竹'],
    泸州市: ['荔枝', '桂圆', 'citrus'],
    攀枝花市: ['芒果', '石榴', 'walnut'],
    雅安市: ['tea', '猕猴桃'],
    绵阳市: ['citrus', 'moyu'],
    达州市: ['citrus', '茶'],
    南充市: ['citrus', '蚕桑'],
    // 贵州
    贵阳市: ['猕猴桃', 'tea'],
    遵义市: ['tea', '辣椒', 'pepper'],
    毕节市: ['potato', '马铃薯', '荞麦', 'moyu'],
    六盘水市: ['猕猴桃', '茶', '马铃薯'],
    黔南州: ['tea', '柑橘'],
    黔东南州: ['tea', '杨梅'],
    兴义市: ['芒果', '香蕉'],
    安顺市: ['citrus', '山药'],
    // 重庆
    万州区: ['citrus', '柑橘'],
    重庆市: ['citrus', '柑橘'],
    涪陵区: ['青菜头', 'citrus'],
    奉节区: ['脐橙', 'citrus'],
    巫山县: ['脆李', 'citrus'],
    // 广西
    桂林市: ['砂糖橘', '柿子', 'citrus'],
    百色市: ['芒果', '香蕉'],
    河池市: ['核桃', 'citrus'],
    南宁市: ['茉莉花', '香蕉', '芒果'],
    // 其他省主要市
    赤峰市: ['maize', '玉米', 'potato', '马铃薯', 'tomato', '番茄'],
    延边州: ['rice', 'potato', 'tobacco', 'shiitake', 'maize', '玉米'],
    哈尔滨市: ['rice', 'maize', 'potato', 'tomato', 'cucumber', 'shiitake'],
    吉林市: ['maize', 'rice', 'potato', 'tomato', 'cucumber', 'shiitake'],
    丹东市: ['strawberry', 'rice', 'peach', 'grape'],
    盘锦市: ['rice', 'grape', 'strawberry'],
    昌都市: ['walnut', '核桃', 'maize', '玉米', 'potato', '马铃薯'],
    拉萨市: ['potato', '马铃薯'],
    日喀则市: ['potato', '马铃薯'],
    林芝市: ['tea', '茶树', 'walnut', '核桃'],
    山南市: ['walnut', '核桃'],
    攀枝花: ['芒果', '石榴'],
    安岳: ['柠檬'],
    林芝市: ['苹果', '松茸', 'peach'],
    恩施州: ['tea', '黑木耳', '马铃薯'],
    秭归县: ['脐橙', 'citrus']
  }
  const specialty = CITY_SPECIALTY[region] || []
  if (specialty.length) {
    const score = (c) => {
      let s = 0
      if (specialty.includes(c.id)) s += 100
      for (const k of specialty) {
        if (k.startsWith('atlas-')) continue
        if (c.name.includes(k) || (c.alias || '').includes(k) || (c.desc || c.tagline || '').includes(k)) s += 80
      }
      if (c.source === 'kb' || c.diagnosable) s += 10
      return s
    }
    items = [...items].sort((a, b) => score(b) - score(a))
    // 主栽（特色命中）作物的「本地」语义保持：不打乱 local/other 分组之外再无操作
  }
  // 传了 keyword 视为跨区搜索：本地结果置顶，其余保持知识库优先
  if (keyword) {
    const k = keyword
    const hit = items.filter(
      (c) => c.name.includes(k) || (c.alias || '').includes(k) || (c.desc || '').includes(k)
    )
    const isLocal = (c) => localKb.includes(c) || atlasCrops.includes(c)
    items = [...hit.filter(isLocal), ...hit.filter((c) => !isLocal(c))]
  }
  res.json({
    province,
    region,
    localCount: localKb.length + atlasCrops.length,
    items
  })
})

// 用户提交新作物
app.post('/api/crops/submit', (req, res) => {
  const { name, alias, province, city, altitude, season, emoji, desc, pests, submitter, contact } =
    req.body || {}

  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: '请填写作物名称（至少 2 个字）' })
  }
  if (!province) return res.status(400).json({ error: '请选择所属省份' })
  if (!desc || String(desc).trim().length < 8) {
    return res.status(400).json({ error: '请补充至少 8 个字的作物简介' })
  }

  const dup =
    CROPS.some((c) => c.name === name) ||
    (ATLAS[province] || []).some((c) => c.name === name) ||
    store.listCropSubmissions().items.some((s) => s.name === name && s.status !== 'rejected')
  if (dup) return res.status(409).json({ error: '该作物已在库中或正在审核中' })

  const item = store.createCropSubmission({
    name: String(name).trim(),
    alias: String(alias || '').trim(),
    province,
    city: String(city || '').trim(),
    altitude: String(altitude || '').trim() || '待补充',
    season: String(season || '').trim() || '待补充',
    emoji: emoji || '🌱',
    desc: String(desc).trim(),
    pests: String(pests || '').trim(),
    submitter: String(submitter || '匿名用户').trim(),
    contact: String(contact || '').trim()
  })
  res.json({ ok: true, item })
})

// 提交列表（供后台审核）
app.get('/api/crops/submissions', (req, res) => {
  const { status, province } = req.query
  res.json(store.listCropSubmissions({ status, province }))
})

// 审核通过 / 驳回（专家权限）
app.patch('/api/crops/submissions/:id', (req, res) => {
  if (!requireExpert(req, res)) return
  const { status, note } = req.body || {}
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: '审核状态不合法' })
  }
  const item = store.reviewCropSubmission(req.params.id, { status, note })
  if (!item) return res.status(404).json({ error: '提交记录不存在' })
  res.json({ ok: true, item })
})

app.delete('/api/crops/submissions/:id', (req, res) => {
  const ok = store.deleteCropSubmission(req.params.id)
  if (!ok) return res.status(404).json({ error: '提交记录不存在' })
  res.json({ ok: true })
})

app.get('/api/crops/:cropId/diseases', (req, res) => {
  const list = getDiseasesByCrop(req.params.cropId)
  if (!list.length) return res.status(404).json({ error: '作物不存在' })
  // 并入已审核通过的社区共建条目（农户提交样本 → 专家审核 → 自动进病害图谱）
  const community = store
    .listApprovedDiseaseSamples()
    .map((s) => s.entry)
    .filter((e) => e && e.cropId === req.params.cropId)
  res.json({ items: [...list, ...community] })
})

// ==================== 核心：多 Agent 诊断 ====================

// ==================== 异步诊断任务（应对网关 60s 超时） ====================
/**
 * 托管网关对长请求 60s 即 504，而多 Agent 链路常超 60s。
 * 改为：POST /api/diagnose/submit 立即返回 taskId，后台继续执行，
 * 前端轮询 GET /api/diagnose/task/:id 取结果。
 */
const diagTasks = new Map() // id -> { status, result, error, createdAt }
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const [k, v] of diagTasks) if (v.createdAt < cutoff) diagTasks.delete(k)
}, 60 * 1000).unref()

app.post('/api/diagnose/submit', (req, res) => {
  const { cropId, image, symptomsText, region, userId, customCrop } = req.body || {}
  if (cropId !== 'auto' && !customCrop && (!cropId || !CROP_NAME[cropId])) {
    return res.status(400).json({ error: '请选择作物' })
  }
  if (!image && !symptomsText) {
    return res.status(400).json({ error: '请上传照片或描述症状' })
  }
  const id = 'dt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  diagTasks.set(id, { status: 'running', result: null, error: null, createdAt: Date.now() })

  // 后台异步执行，响应不被网关超时打断
  ;(async () => {
    try {
      const body = req.body || {}
      const result = await runDiagnosisWorkflow({
        cropId: body.cropId,
        imageBase64: body.image,
        symptomsText: body.symptomsText,
        altitude: body.altitude,
        weather: body.weather,
        stage: body.stage,
        area: body.area,
        customCrop: body.customCrop
      })
      const record = store.createRecord({
        userId: body.userId || 'guest',
        cropId: body.cropId,
        cropName: result.cropName,
        region: body.region || '未标注',
        altitude: body.altitude,
        weather: body.weather,
        stage: body.stage,
        area: body.area,
        symptomsText: body.symptomsText || '',
        hasImage: Boolean(body.image),
        diagnosis: result.diagnosis,
        gate: result.gate,
        treatment: result.treatment,
        trace: result.trace,
        meta: result.meta
      })
      const task = diagTasks.get(id)
      if (task) {
        task.status = 'done'
        task.result = { ...result, recordId: record.id }
      }
    } catch (err) {
      console.error('[diagTask]', err)
      const task = diagTasks.get(id)
      if (task) {
        task.status = 'error'
        task.error = err.message || '诊断服务异常'
        task.errorCode = err.code || 'INTERNAL_ERROR'
      }
    }
  })()

  res.json({ taskId: id })
})

app.get('/api/diagnose/task/:id', (req, res) => {
  const task = diagTasks.get(req.params.id)
  if (!task) return res.status(404).json({ error: '任务不存在或已过期' })
  if (task.status === 'running') return res.json({ status: 'running' })
  if (task.status === 'error') return res.status(503).json({ status: 'error', error: task.error, code: task.errorCode })
  res.json({ status: 'done', ...task.result })
})

app.post('/api/diagnose', async (req, res) => {
  const { cropId, image, symptomsText, altitude, weather, stage, area, region, userId, customCrop } = req.body || {}

  // cropId 可为 'auto'（AI 自由识别）或自定义作物（customCrop，知识库未必收录）
  if (cropId !== 'auto' && !customCrop && (!cropId || !CROP_NAME[cropId])) {
    return res.status(400).json({ error: '请选择作物' })
  }
  if (!image && !symptomsText) {
    return res.status(400).json({ error: '请上传照片或描述症状' })
  }

  try {
    const result = await runDiagnosisWorkflow({
      cropId,
      imageBase64: image,
      symptomsText,
      altitude,
      weather,
      stage,
      area,
      customCrop
    })

    // 落库（含图片会过大，故在记录中保留缩略图可选的逻辑：此处仅存元信息）
    const record = store.createRecord({
      userId: userId || 'guest',
      cropId,
      cropName: result.cropName,
      region: region || '未标注',
      altitude,
      weather,
      stage,
      area,
      symptomsText: symptomsText || '',
      hasImage: Boolean(image),
      diagnosis: result.diagnosis,
      gate: result.gate,
      treatment: result.treatment,
      trace: result.trace,
      meta: result.meta
    })

    res.json({ ...result, recordId: record.id })
  } catch (err) {
    console.error('[POST /api/diagnose]', err)
    const isImageRejection = err.code === 'IMAGE_NOT_PLANT' || err.code === 'IMAGE_NO_LESION'
    const status = err.code === 'DIAGNOSIS_UNAVAILABLE' ? 503 : isImageRejection ? 422 : 500
    res.status(status).json({
      error: err.message || '诊断服务异常',
      code: err.code || 'INTERNAL_ERROR',
      hint:
        err.code === 'DIAGNOSIS_UNAVAILABLE'
          ? '请检查 .env 中的 AI 配置，或补充更详细的症状描述'
          : undefined
    })
  }
})

// ==================== AI 工具集成：气象 + Function Calling ====================

// 天气工具直查（前端天气卡片使用）
app.get('/api/weather', async (req, res) => {
  const { region, cropId } = req.query
  if (!region) return res.status(400).json({ error: '缺少 region 参数' })
  try {
    res.json(await getWeatherForecast(String(region), cropId || null))
  } catch (e) {
    res.status(500).json({ error: '天气查询失败' })
  }
})

// Function Calling 咨询：模型自主决定调用天气/农药工具后作答
app.post('/api/advisory', async (req, res) => {
  const { question, cropId, region } = req.body || {}
  if (!question || !String(question).trim()) return res.status(400).json({ error: '请输入问题' })

  const kb = resolveKbContext(String(question), cropId || null, 3)

  if (!isConfigured()) {
    // 降级：本地直接执行工具 + 知识库组装
    const weather = await getWeatherForecast(region || '文山', cropId)
    const d0 = weather.days[0]
    const answer = [
      `**${weather.region}天气与农事参考**`,
      ``,
      `今天${d0.cond}，${d0.tempLow}~${d0.tempHigh}℃，空气湿度 ${d0.humidity}%，降水概率 ${d0.rainProb}%。`,
      ``,
      `**病害风险**：${weather.riskLevel === 'high' ? '高风险' : weather.riskLevel === 'medium' ? '中风险' : '低风险'}（峰值指数 ${weather.riskPeak}）。`,
      `${weather.cropNote}`,
      ``,
      kb.hits.length
        ? `**知识库建议**：${kb.hits[0].disease.treatment.slice(0, 2).join('；')}`
        : `如需具体病害防治方案，请补充作物与症状描述。`,
        ``,
        `⚠️ 本回答由本地工具 + 知识库生成（AI 未配置时的降级模式）。`
    ].join('\n')
    return res.json({
      answer,
      toolTraces: [{ tool: 'get_weather_forecast', args: { region, cropId }, summary: `${weather.region}：${d0.cond} 风险${weather.riskLevel}` }],
      sources: kb.hits.slice(0, 3).map((h) => ({ name: h.disease.name, score: h.scoreNormalized })),
      usedFallback: true
    })
  }

  try {
    const system = [
      '你是云南山地农作物的农事咨询助手。你可以调用以下工具获取实时信息：',
      '- get_weather_forecast(region, cropId)：查询未来 7 天天气与病害风险',
      '- lookup_pesticide_safety(cropId, chemical)：查询农药安全间隔期与禁忌',
      '回答规则：涉及天气/打药时机的问题必须先调用工具获取数据，再结合数据回答；',
      '回答简洁实用，面向农户，使用 Markdown；结尾加一行免责提示。'
    ].join('\n')
    const { content, toolTraces, rounds } = await runWithTools({
      chatFn: ({ messages, tools }) =>
        chatRaw({ messages, tools }).then((data) => ({
          raw: data,
          content: data?.choices?.[0]?.message?.content || ''
        })),
      system,
      user: `作物：${cropId ? CROP_NAME[cropId] || cropId : '未指定'}；区域：${region || '云南文山'}\n问题：${question}\n\n相关知识库参考：\n${kb.context.slice(0, 1200)}`
    })
    res.json({ answer: content || '未能生成回答，请稍后重试', toolTraces, rounds, usedFallback: false })
  } catch (err) {
    console.warn('[POST /api/advisory]', err.message)
    res.status(503).json({ error: 'AI 服务暂不可用', code: err.code || 'AI_ERROR' })
  }
})

// ==================== 流式问答（SSE，打字机效果） ====================

app.post('/api/qa/stream', async (req, res) => {
  const { question, cropId, region, customCrop } = req.body || {}
  if (!question || !String(question).trim()) {
    return res.status(400).json({ error: '请输入问题' })
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const kb = filterValidHits(resolveKbContext(String(question), cropId || null))
  const sources = toCiteSources(kb)

  // 先推送检索来源，让用户在等待时就能看到"系统在做什么"
  send('sources', { sources })

  let answer = ''
  let usedFallback = false
  let noHit = false

  // 空召回兜底：知识库无有效片段时禁止交给大模型自由生成（防幻觉编造植保知识）
  if (!kb.hits.length) {
    noHit = true
    answer = NO_HIT_ANSWER
    for (let i = 0; i < answer.length; i += 3) {
      send('delta', { delta: answer.slice(i, i + 3) })
      await new Promise((r) => setTimeout(r, 18))
    }
    // 兜底问答同样归档（我的种植档案 - 历史问答记录可追溯）
    const askerNoHit = store.getUserByToken(extractToken(req))
    const savedNoHit = store.saveConsultation({
      question: String(question),
      answer,
      cropId: cropId || null,
      usedFallback: true,
      noHit: true,
      userId: askerNoHit?.id ?? null,
      userName: askerNoHit ? askerNoHit.nickname || askerNoHit.account : '游客',
      sources: []
    })
    send('done', { usedFallback: true, noHit: true, consultationId: savedNoHit.id, length: answer.length })
    res.end()
    return
  }

  if (isConfigured()) {
    try {
      // 支持自定义作物名：知识库未收录的作物也能咨询
      const cropName = customCrop || (cropId ? CROP_NAME[cropId] : '')
      const { system, user } = buildQAPrompt({
        question: String(question),
        context: kb.context,
        cropName,
        history: []
      })
      await chatStream({
        system,
        user,
        temperature: 0.4,
        maxTokens: 900,
        onDelta: (delta) => {
          answer += delta
          send('delta', { delta })
        }
      })
    } catch (err) {
      console.warn('[POST /api/qa/stream] 流式调用失败，降级知识库直出:', err.message)
    }
  }

  // 降级：模拟打字机输出知识库直出答案
  if (!answer) {
    usedFallback = true
    if (kb.hits.length) {
      const d = kb.hits[0].disease
      answer = [
        `根据知识库资料，最相近的是「${d.name}」。`,
        ``,
        `**典型症状**：${d.symptoms.slice(0, 2).join('；')}`,
        ``,
        `**防治建议**：${d.treatment.slice(0, 3).join('；')}`,
        ``,
        `⚠️ ${d.safetyNote}`
      ].join('\n')
    } else {
      answer =
        '抱歉，知识库中暂未检索到与您问题匹配的内容。建议补充作物名称与具体症状描述，或咨询当地农技站获取现场指导。'
    }
    // 以 30ms/段 的节奏模拟流式，保证降级时前端体验一致
    for (let i = 0; i < answer.length; i += 3) {
      send('delta', { delta: answer.slice(i, i + 3) })
      await new Promise((r) => setTimeout(r, 18))
    }
  }

  // 提问人（登录用户则问答记录归档到个人名下，供"历史问答记录"查询）
  const asker = store.getUserByToken(extractToken(req))

  const saved = store.saveConsultation({
    question: String(question),
    answer,
    cropId: cropId || null,
    usedFallback,
    noHit,
    userId: asker?.id ?? null,
    userName: asker ? asker.nickname || asker.account : '游客',
    sources: kb.hits.map((h) => ({ name: h.disease.name, score: h.scoreNormalized }))
  })

  // 农户登录状态下提问 → 实时推送到专家端消息中心
  try {
    if (asker) {
      store.notifyExpertsAsk({
        user: asker,
        question,
        cropName: cropId ? CROP_NAME[cropId] || '' : '',
        region: region || ''
      })
    }
  } catch (err) {
    console.warn('[qa/stream] 专家通知失败:', err.message)
  }

  send('done', { usedFallback, noHit, consultationId: saved.id, length: answer.length })
  res.end()
})

// ==================== RAG 知识库问答（非流式，兼容保留） ====================

app.post('/api/qa', async (req, res) => {
  const { question, cropId, history, customCrop } = req.body || {}
  if (!question || !String(question).trim()) {
    return res.status(400).json({ error: '请输入问题' })
  }

  const kb = filterValidHits(resolveKbContext(question, cropId || null))

  // 空召回兜底：不调用大模型，直接返回固定文案（防幻觉）
  if (!kb.hits.length) {
    const askerNoHit = store.getUserByToken(extractToken(req))
    const savedNoHit = store.saveConsultation({
      question,
      answer: NO_HIT_ANSWER,
      cropId: cropId || null,
      usedFallback: true,
      noHit: true,
      userId: askerNoHit?.id ?? null,
      userName: askerNoHit ? askerNoHit.nickname || askerNoHit.account : '游客',
      sources: []
    })
    return res.json({ answer: NO_HIT_ANSWER, sources: [], usedFallback: true, noHit: true, consultationId: savedNoHit.id })
  }

  // 支持自定义作物名（知识库未收录的作物也能咨询，AI 结合通用植保知识作答）
  const cropName = customCrop || (cropId ? CROP_NAME[cropId] : '')
  const { system, user } = buildQAPrompt({
    question,
    context: kb.context,
    cropName,
    history
  })

  let answer = ''
  let usedFallback = false

  if (isConfigured()) {
    try {
      const r = await chatText({ system, user, temperature: 0.4, maxTokens: 900 })
      answer = r.content.trim()
    } catch (err) {
      console.warn('[POST /api/qa] 模型调用失败，使用知识库直出:', err.message)
    }
  }

  // 降级：直接返回最相关知识库条目摘要
  if (!answer) {
    usedFallback = true
    if (kb.hits.length) {
      const d = kb.hits[0].disease
      answer = [
        `根据知识库资料，最相近的是「${d.name}」。`,
        ``,
        `**典型症状**：${d.symptoms.slice(0, 2).join('；')}`,
        ``,
        `**防治建议**：${d.treatment.slice(0, 3).join('；')}`,
        ``,
        `⚠️ ${d.safetyNote}`
      ].join('\n')
    } else {
      answer =
        '抱歉，知识库中暂未检索到与您问题匹配的内容。建议补充作物名称与具体症状描述，或咨询当地农技站获取现场指导。'
    }
  }

  const askerQa = store.getUserByToken(extractToken(req))

  const saved = store.saveConsultation({
    question,
    answer,
    cropId: cropId || null,
    usedFallback,
    userId: askerQa?.id ?? null,
    userName: askerQa ? askerQa.nickname || askerQa.account : '游客',
    sources: kb.hits.map((h) => ({ name: h.disease.name, score: h.scoreNormalized }))
  })

  // 非流式提问同样推送到专家端
  try {
    if (askerQa) {
      store.notifyExpertsAsk({
        user: askerQa,
        question,
        cropName: cropId ? CROP_NAME[cropId] || '' : '',
        region: ''
      })
    }
  } catch (err) {
    console.warn('[qa] 专家通知失败:', err.message)
  }

  res.json({
    answer,
    sources: toCiteSources(kb),
    usedFallback,
    consultationId: saved.id
  })
})

app.get('/api/qa/history', (req, res) => {
  res.json({ items: store.listConsultations(Number(req.query.limit) || 20) })
})

/** 当前登录用户的历史问答记录（我的种植档案 - 📖历史问答记录） */
app.get('/api/qa/history/mine', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  res.json({ items: store.listConsultationsByUser(user.id, 50) })
})

// ==================== 向专家提问 / 人工复核 ====================

/** 专家团队列表：按作物与地区计算匹配度排序 */
app.get('/api/experts', (req, res) => {
  const { cropId, region } = req.query
  const experts = store.listExperts()
  const cropName = cropId ? CROPS.find((c) => c.id === cropId)?.name || CROP_NAME[cropId] || String(cropId) : ''
  const items = experts
    .map((e) => {
      let match = 0
      const hitCrop = cropName && (e.specialty || []).some((s) => cropName.includes(s) || s.includes(cropName))
      const hitRegion = region && e.region && (e.region.includes(region) || region.includes(e.region))
      if (hitCrop) match += 2
      if (hitRegion) match += 1
      return { ...store.publicUser(e), match, hitCrop, hitRegion }
    })
    .sort((a, b) => b.match - a.match)
  res.json({ items })
})

/** 农户向指定专家发起咨询（写入咨询单并推送专家端消息） */
app.post('/api/consult', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const { expertId, cropId, region, question } = req.body || {}
  if (!expertId || !question || !String(question).trim()) {
    return res.status(400).json({ error: '请选择专家并填写问题' })
  }
  const expert = store.findUserById(Number(expertId))
  if (!expert || expert.role !== 'expert') return res.status(404).json({ error: '专家不存在' })

  const c = store.saveConsult({
    userId: user.id,
    userName: user.nickname || user.account,
    expertId: expert.id,
    cropId: cropId || null,
    region: region || '',
    question: String(question).trim().slice(0, 500)
  })

  const cropName = cropId ? CROP_NAME[cropId] || '' : ''
  const prefix = [cropName, region].filter(Boolean).join(' · ')
  store.createMessage({
    userId: expert.id,
    from: 'user',
    fromId: user.id,
    fromName: user.nickname || user.account,
    title: `${user.nickname || user.account} 向您咨询`,
    content: `${prefix ? `【${prefix}】` : ''}${String(question).trim()}`
  })

  res.json({ ok: true, consultId: c.id, expert: store.publicUser(expert) })
})

/** 专家：收到的咨询列表 */
app.get('/api/consults', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  if (user.role !== 'expert') return res.status(403).json({ error: '仅专家可查看' })
  res.json({ items: store.listConsults({ expertId: user.id }) })
})

/** 专家：回复完成咨询（状态置 done） */
// 删除一条农户咨询（管理端清理）
app.delete('/api/consults/:id', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  if (user.role !== 'expert') return res.status(403).json({ error: '仅专家可操作' })
  const ok = store.deleteConsult(req.params.id)
  if (!ok) return res.status(404).json({ error: '咨询不存在' })
  res.json({ ok: true })
})

app.patch('/api/consults/:id', (req, res) => {  const user = requireUser(req, res)
  if (!user) return
  if (user.role !== 'expert') return res.status(403).json({ error: '仅专家可操作' })
  const c = store.updateConsult(req.params.id, {
    status: 'done',
    reply: String(req.body?.reply || '').slice(0, 600),
    expertId: user.id
  })
  if (!c) return res.status(404).json({ error: '咨询单不存在' })
  res.json({ ok: true, item: c })
})

/** 农户：对诊断记录发起人工复核（创建复核工单，推送给全部专家） */
app.post('/api/review-requests', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const { recordId, cropId, region, question, image, aiDisease, aiConfidence } = req.body || {}
  if (!recordId) return res.status(400).json({ error: '缺少诊断记录' })
  const r = store.saveReviewRequest({
    userId: user.id,
    userName: user.nickname || user.account,
    recordId: Number(recordId),
    cropId: cropId || null,
    region: region || '',
    question: String(question || '').trim().slice(0, 300),
    // 工单核心字段：上传图片（压缩 dataURL）、AI 初诊病害、AI 置信度
    image: typeof image === 'string' && image.length <= 900000 ? image : '',
    aiDisease: String(aiDisease || '').slice(0, 60),
    aiConfidence: Number.isFinite(Number(aiConfidence)) ? Number(aiConfidence) : null
  })

  const cropName = cropId ? CROP_NAME[cropId] || '作物' : '作物'
  store.listExpertIds().forEach((id) => {
    store.createMessage({
      userId: id,
      from: 'user',
      fromId: user.id,
      fromName: user.nickname || user.account,
      title: `人工复核请求：${cropName}诊断`,
      content: `农户 ${user.nickname || user.account} 对诊断记录 #${recordId} 申请人工复核。${r.question ? `补充说明：${r.question}` : ''}`
    })
  })
  res.json({ ok: true, requestId: r.id })
})

/** 农户：我的复核工单记录（种植档案-专家复核记录页使用） */
app.get('/api/review-requests/mine', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  res.json({ items: store.listReviewRequests({ userId: user.id }) })
})

/** 专家：复核请求队列（待复核的全部队列 + 本人已复核的记录） */
app.get('/api/review-requests', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  if (user.role !== 'expert') return res.status(403).json({ error: '仅专家可查看' })
  const items = store
    .listReviewRequests()
    .filter((r) => r.status === 'pending' || r.expertId === user.id)
  res.json({ items })
})

/** 专家：处理复核工单（确认诊断 / 驳回）→ 更新工单 + 写消息通知农户 */
app.patch('/api/review-requests/:id', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  if (user.role !== 'expert') return res.status(403).json({ error: '仅专家可操作' })
  const { opinion, decision, finalDisease } = req.body || {}
  if (!opinion || !String(opinion).trim()) return res.status(400).json({ error: '请填写复核意见' })
  const isReject = decision === 'reject'
  const finalText = isReject
    ? '样本质量差，建议重新拍照'
    : String(finalDisease || '').trim()
  if (!isReject && !finalText) return res.status(400).json({ error: '请选择最终确诊病害' })
  const r = store.updateReviewRequest(req.params.id, {
    status: 'done',
    outcome: isReject ? 'rejected' : 'confirmed',
    opinion: String(opinion).trim().slice(0, 600),
    finalDisease: finalText.slice(0, 60),
    expertId: user.id,
    expertName: user.nickname || '专家',
    completedAt: new Date().toISOString()
  })
  if (!r) return res.status(404).json({ error: '复核请求不存在' })

  store.createMessage({
    userId: r.userId,
    from: 'expert',
    fromId: user.id,
    fromName: user.nickname || '专家',
    title: '您提交的病害复核工单已处理完成',
    content: `复核专家已处理您的工单（AI 初诊：${r.aiDisease || '—'}）。\n复核意见：${String(opinion).trim()}\n最终诊断结论：${finalText}`
  })
  res.json({ ok: true, item: r })
})

/** 专家：删除复核工单（仅本人已处理的工单可删，队列清理用） */
app.delete('/api/review-requests/:id', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  if (user.role !== 'expert') return res.status(403).json({ error: '仅专家可操作' })
  const target = store.listReviewRequests().find((x) => x.id === Number(req.params.id))
  if (!target) return res.status(404).json({ error: '复核请求不存在' })
  if (target.status !== 'pending' && target.expertId !== user.id) {
    return res.status(403).json({ error: '只能删除自己已复核的工单' })
  }
  store.deleteReviewRequest(req.params.id)
  res.json({ ok: true })
})

// ==================== 病害样本共建（农户提交 → 专家审核 → 并入知识库） ====================

/**
 * 审核通过 → 由样本生成知识库社区条目：
 * 作物为系统已知作物时挂到该作物名下（图谱按作物可见），
 * 手动输入的新作物挂在 community 名下（图谱"社区共建"区块展示）。
 */
const buildCommunityEntry = (s) => {
  // 从农户描述中粗提症状关键词：按标点切分，保留 2–8 字短语
  const keywords = String(s.description || '')
    .split(/[，。；、,.;\s]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2 && x.length <= 8)
    .slice(0, 4)
  return {
    id: `cm-${s.id}`,
    cropId: s.cropId || 'community',
    name: s.diseaseName || `${s.cropName}疑似新病害`,
    alias: '',
    type: s.diseaseType || '社区共建样本',
    severity: 'medium',
    pathogen: '待专业鉴定',
    symptomKeywords: keywords.length ? keywords : [s.cropName || '共建样本'],
    symptoms: [String(s.description || '').slice(0, 400)],
    causes: [],
    treatment: s.treatment
      ? [String(s.treatment).slice(0, 300)]
      : ['防治方案待专家补充，可参考相近病害或咨询当地农技站'],
    prevention: [],
    safetyNote: '本条目由农户共建样本经专家审核后收录，防治措施仅供参考。',
    references: [`农户共建样本 #${s.id}（${s.userName} 提交 · ${s.reviewer || '专家'} 审核）`],
    community: true,
    sampleImages: (s.images || []).slice(0, 3)
  }
}

/** 服务器启动时把历史已通过的社区条目重新注册进检索器（重启不丢共建数据） */
let communityRegistered = 0
try {
  communityRegistered = registerCommunityDiseases([
    ...store.listApprovedDiseaseSamples().map((s) => s.entry),
    ...store.listAiKbEntries().flatMap((e) => e.diseases || [])
  ])
  if (communityRegistered) console.log(`[kb] 已并入 ${communityRegistered} 条社区共建/AI 补全病害条目`)
} catch (e) {
  console.warn('[kb] 社区条目注册失败:', e.message)
}

/** 农户提交病害样本（1–3 张图片 + 描述）→ 生成待审核记录并通知全部专家 */
app.post('/api/samples', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const { cropId, cropName, description, images, altitude, weather, region } = req.body || {}

  const crop = cropId ? CROPS.find((c) => c.id === cropId) : null
  const name = String(cropName || (crop ? crop.name : '')).trim()
  if (!name) return res.status(400).json({ error: '请选择或填写作物名称' })
  if (!description || String(description).trim().length < 8) {
    return res.status(400).json({ error: '请填写作物病害现象描述（至少 8 个字）' })
  }
  if (!Array.isArray(images) || images.length < 1 || images.length > 3) {
    return res.status(400).json({ error: '请上传 1–3 张病害样本图片' })
  }
  if (images.some((img) => typeof img !== 'string' || !img.startsWith('data:image/'))) {
    return res.status(400).json({ error: '图片格式不正确' })
  }
  if (images.some((img) => img.length > 1_200_000)) {
    return res.status(413).json({ error: '单张图片过大，请压缩后重新上传' })
  }

  const s = store.createDiseaseSample({
    userId: user.id,
    userName: user.nickname || user.account,
    cropId: crop ? crop.id : '',
    cropName: name,
    description: String(description).trim().slice(0, 500),
    images,
    altitude: String(altitude || '').trim().slice(0, 60),
    weather: String(weather || '').trim().slice(0, 60),
    region: String(region || '').trim().slice(0, 30)
  })

  // 通知全部专家进入审核待办
  try {
    store.listExpertIds().forEach((id) => {
      store.createMessage({
        userId: id,
        from: 'user',
        fromId: user.id,
        fromName: user.nickname || user.account,
        title: `共建样本待审核：${name}`,
        content: `农户 ${user.nickname || user.account} 提交了 ${name} 病害样本：${String(description).slice(0, 120)}。请前往【作物审核】进行核验。`
      })
    })
  } catch (e) {
    console.warn('[samples] 专家通知失败:', e.message)
  }

  res.json({ ok: true, sampleId: s.id })
})

/** 农户：我提交的共建样本（档案页状态展示） */
app.get('/api/samples/mine', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  res.json(store.listDiseaseSamples({ userId: user.id }))
})

/** 公开：已审核通过的社区共建条目（病害图谱"社区共建"区块） */
app.get('/api/samples/approved', (req, res) => {
  res.json({
    items: store
      .listApprovedDiseaseSamples()
      .map((s) => ({ ...s.entry, approvedAt: s.reviewedAt, submitter: s.userName }))
  })
})

/** 专家：样本审核队列 */
app.get('/api/samples', (req, res) => {
  const user = requireExpert(req, res)
  if (!user) return
  res.json(store.listDiseaseSamples({ status: req.query.status, limit: 200 }))
})

/** 专家审核：通过（必填确诊病害名 → 入库） / 驳回（必填理由 → 通知农户修改） */
app.patch('/api/samples/:id', (req, res) => {
  const user = requireExpert(req, res)
  if (!user) return
  const { status, note, diseaseName, diseaseType, treatment } = req.body || {}
  const s = store.getDiseaseSample(req.params.id)
  if (!s) return res.status(404).json({ error: '样本不存在' })
  if (s.status !== 'pending') return res.status(409).json({ error: '该样本已审核过' })

  if (status === 'approved') {
    const dName = String(diseaseName || '').trim()
    if (!dName) return res.status(400).json({ error: '请填写确诊病害名称' })
    const patch = {
      status: 'approved',
      note: String(note || '').trim().slice(0, 300),
      reviewer: user.nickname || '专家',
      reviewedAt: new Date().toISOString(),
      diseaseName: dName.slice(0, 40),
      diseaseType: String(diseaseType || '').trim().slice(0, 20) || '社区共建样本',
      treatment: String(treatment || '').trim().slice(0, 300)
    }
    patch.entry = buildCommunityEntry({ ...s, ...patch })
    const updated = store.updateDiseaseSample(s.id, patch)
    // 即时并入检索语料：RAG 问答与 /api/kb/search 立即可检索到
    registerCommunityDiseases([updated.entry])
    store.createMessage({
      userId: s.userId,
      from: 'expert',
      fromId: user.id,
      fromName: user.nickname || '专家',
      title: '共建样本审核通过 🎉',
      content: `您提交的「${s.cropName}」病害样本已通过审核，确诊为「${dName}」，已收录进本地病害图谱知识库。感谢共建！`
    })
    return res.json({ ok: true, item: updated, entryId: updated.entry.id })
  }

  if (status === 'rejected') {
    const reason = String(note || '').trim()
    if (!reason) return res.status(400).json({ error: '请填写驳回理由' })
    const updated = store.updateDiseaseSample(s.id, {
      status: 'rejected',
      note: reason.slice(0, 300),
      reviewer: user.nickname || '专家',
      reviewedAt: new Date().toISOString()
    })
    // 驳回 → 按固定模板推送消息通知农户
    store.createMessage({
      userId: s.userId,
      from: 'expert',
      fromId: user.id,
      fromName: user.nickname || '专家',
      title: '共建样本审核结果通知',
      content: `你提交的共建样本已被驳回，原因：${reason.slice(0, 200)}，请修改后重新提交`
    })
    return res.json({ ok: true, item: updated })
  }

  res.status(400).json({ error: '审核状态不合法' })
})

// ==================== 用户认证 ====================

/**
 * 从请求解析登录令牌
 * 优先级：x-token 自定义头 > 查询参数 token > Authorization 头
 * 注意：托管平台网关会向 Authorization 注入平台自身的 JWT，
 * 因此必须优先使用自有通道，Authorization 仅作最后兼容
 */
const extractToken = (req) => {
  return (
    req.headers['x-token'] ||
    req.query.token ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    ''
  )
}

const currentUser = (req) => store.getUserByToken(extractToken(req))

const requireUser = (req, res) => {
  const user = currentUser(req)
  if (!user) {
    res.status(401).json({ error: '请先登录' })
    return null
  }
  return user
}

/** 专家专属接口守卫 */
const requireExpert = (req, res) => {
  const user = requireUser(req, res)
  if (!user) return null
  if (user.role !== 'expert') {
    res.status(403).json({ error: '该操作需要专家权限' })
    return null
  }
  return user
}

// 注册（支持手机号 / 邮箱 / 微信号注册）
app.post('/api/auth/register', (req, res) => {
  const { account, password, nickname, method, role, title, specialty, region } = req.body || {}
  if (!account || String(account).trim().length < 5) {
    return res.status(400).json({ error: '账号格式不正确（至少 5 位）' })
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' })
  }
  const a = String(account).trim().toLowerCase()
  const extra = {}
  if (method === 'email' || a.includes('@')) extra.email = a
  else if (method === 'wechat') extra.wechatId = a
  else extra.phone = a
  try {
    const isExpert = role === 'expert'
    const user = store.createUser({
      account: a,
      password,
      nickname,
      role: isExpert ? 'expert' : 'user',
      title: isExpert ? title : '',
      specialty: isExpert ? specialty : [],
      region: isExpert ? region : '',
      ...extra
    })
    const token = store.createSession(user.id)
    res.json({ ok: true, token, user: store.publicUser(user) })
  } catch (e) {
    res.status(409).json({ error: e.message })
  }
})

// 登录：统一账号（手机号 / 邮箱 / 微信号）+ 密码
app.post('/api/auth/login', (req, res) => {
  const { account, password, method } = req.body || {}
  if (!account || !password) return res.status(400).json({ error: '请输入账号与密码' })
  const user = store.findUserByAccount(account)
  if (!user || !store.verifyPassword(user, password)) {
    return res.status(401).json({ error: '账号或密码错误' })
  }
  const token = store.createSession(user.id)
  res.json({ ok: true, token, user: store.publicUser(user) })
})

// 知识库统计（登录页动态渲染用；请求失败时前端展示兜底文案）
app.get('/api/kb/stats', (req, res) => {
  res.json({ ok: true, crops: CROPS.length, diseases: DISEASES.length, docs: getDocCount() })
})

// ==================== AI 动态补全：知识库没有的作物由大模型生成病害知识并入库 ====================

/** 专家：AI 生成指定作物的常见病害知识（2–3 条），生成后即时并入检索语料与图谱 */
app.post('/api/kb/ai-expand', async (req, res) => {
  const expert = requireExpert(req, res)
  if (!expert) return
  const { cropName } = req.body || {}
  const name = String(cropName || '').trim()
  if (!name || name.length < 2) return res.status(400).json({ error: '请填写作物名称' })
  if (!isConfigured()) return res.status(503).json({ error: 'AI 服务未配置' })
  // 已有同名知识库作物（含别名）时拒绝重复生成
  const exists = CROPS.some((c) => c.name === name || (c.alias || '').includes(name) || name.includes(c.name))
  if (exists) return res.status(409).json({ error: '该作物已在知识库中，无需补全' })

  const system =
    '你是资深植物病理学专家。为山地农业病虫害诊断知识库生成指定作物的常见病害条目。' +
    '只输出 JSON，不要任何解释。结构：{"crop":{"emoji":"(单个emoji)","tagline":"一句话定位(20字内)","altitude":"适宜海拔区间","season":"种植/采收期","regions":["适合的省名"],"intro":"作物简介(60字内)","keyPoints":["栽培要点3条"]},"diseases":[{"name":"病害名","alias":"别名","type":"真菌病害|细菌病害|病毒病害|生理性病害","severity":"high|medium|low","pathogen":"病原或成因","symptomKeywords":["检索关键词5个"],"symptoms":["症状4条"],"causes":["诱因3条"],"treatment":["防治3条"],"prevention":["预防3条"],"safetyNote":"一句话安全提示"}]}。' +
    '生成 2 条该作物最常见、最有诊断价值的病害，内容专业准确、可操作。'
  const user = `作物名称：${name}。请生成 JSON。`

  try {
    const r = await chatText({ system, user, temperature: 0.3, jsonMode: true, maxTokens: 2500 })
    const data = extractJSON(r.content)
    if (!data || !Array.isArray(data.diseases) || !data.diseases.length) {
      return res.status(502).json({ error: 'AI 返回内容无法解析，请重试' })
    }
    const ts = Date.now()
    const crop = data.crop || {}
    const diseases = data.diseases.slice(0, 4).map((d, i) => ({
      id: `ai-${ts}-${i + 1}`,
      cropId: 'community',
      cropNameAI: name,
      name: String(d.name || `${name}病害${i + 1}`).slice(0, 40),
      alias: String(d.alias || '').slice(0, 40),
      type: String(d.type || '真菌病害').slice(0, 20),
      severity: ['high', 'medium', 'low'].includes(d.severity) ? d.severity : 'medium',
      pathogen: String(d.pathogen || '待专业鉴定').slice(0, 80),
      symptomKeywords: (d.symptomKeywords || []).map((s) => String(s).slice(0, 20)).slice(0, 8),
      symptoms: (d.symptoms || []).map((s) => String(s).slice(0, 200)).slice(0, 6),
      causes: (d.causes || []).map((s) => String(s).slice(0, 200)).slice(0, 5),
      treatment: (d.treatment || []).map((s) => String(s).slice(0, 200)).slice(0, 5),
      prevention: (d.prevention || []).map((s) => String(s).slice(0, 200)).slice(0, 5),
      safetyNote: String(d.safetyNote || '').slice(0, 200),
      references: [`AI 大模型生成（${expert.nickname || '专家'} 发起）· 建议经专家复核后使用`],
      community: true,
      aiGenerated: true
    }))
    const saved = store.saveAiKbEntry({
      cropName: name,
      crop: {
        emoji: String(crop.emoji || '🌱').slice(0, 4),
        tagline: String(crop.tagline || '').slice(0, 40),
        altitude: String(crop.altitude || '').slice(0, 30),
        season: String(crop.season || '').slice(0, 40),
        regions: Array.isArray(crop.regions) ? crop.regions.slice(0, 10) : [],
        intro: String(crop.intro || '').slice(0, 120),
        keyPoints: (crop.keyPoints || []).map((s) => String(s).slice(0, 80)).slice(0, 4)
      },
      diseases
    })
    // 即时并入检索语料：图谱社区区块、RAG 问答与 /api/kb/search 立即可见
    registerCommunityDiseases(diseases)
    res.json({ ok: true, item: saved, count: diseases.length })
  } catch (e) {
    console.error('[kb/ai-expand] 生成失败:', e.message)
    res.status(502).json({ error: 'AI 生成失败：' + (e.message || '请稍后重试') })
  }
})

/** 专家：查看 AI 已补全条目 / 删除单条 */
app.get('/api/kb/ai-entries', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  if (user.role !== 'expert') return res.status(403).json({ error: '仅专家可查看' })
  res.json({ items: store.listAiKbEntries() })
})

app.delete('/api/kb/ai-entries/:id', (req, res) => {
  const expert = requireExpert(req, res)
  if (!expert) return
  const ok = store.deleteAiKbEntry(req.params.id)
  if (!ok) return res.status(404).json({ error: '条目不存在' })
  res.json({ ok: true })
})

// 演示账号一键登录：体验账号校验在服务端完成，前端不硬编码任何体验账号
app.post('/api/auth/demo', (req, res) => {
  const role = req.body?.role === 'expert' ? 'expert' : 'user'
  const account = role === 'expert' ? (process.env.DEMO_EXPERT_ACCOUNT || '13800000001') : (process.env.DEMO_USER_ACCOUNT || '13800000002')
  const password = process.env.DEMO_PASSWORD || 'demo123'
  const user = store.findUserByAccount(account)
  if (!user || !store.verifyPassword(user, password)) {
    return res.status(403).json({ error: '演示账号未初始化，请先运行数据初始化' })
  }
  const token = store.createSession(user.id)
  res.json({ ok: true, token, user: store.publicUser(user) })
})

// ==================== 多方式登录：验证码 / 快捷登录注册 / 模拟 OAuth ====================
const codeStore = new Map() // target -> { code, exp }

// ---- 邮件发送（SMTP）：配置 SMTP_HOST/USER/PASS 后自动启用真实发信 ----
let mailTransporter = null
;(async () => {
  try {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const nodemailer = await import('nodemailer')
      mailTransporter = nodemailer.default.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        // 连接池 + 复用，缩短后续发信耗时
        pool: true,
        maxConnections: 2,
        maxMessages: 50,
        connectionTimeout: 15000,
        greetingTimeout: 12000,
        socketTimeout: 20000,
      })
      await mailTransporter.verify()
      console.log('[mail] SMTP 已配置并连接成功，验证码将通过邮件真实发送')
    } else {
      console.log('[mail] SMTP 未配置，验证码走演示回显模式')
    }
  } catch (e) {
    console.warn('[mail] SMTP 初始化失败，回退演示模式:', e.message)
    mailTransporter = null
  }
})()

async function sendMailCode(to, code) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER
  await mailTransporter.sendMail({
    from: `"云岭农诊" <${from}>`,
    to,
    subject: `【云岭农诊】登录验证码 ${code}`,
    text: `您的登录验证码为：${code}（5 分钟内有效）。如非本人操作，请忽略本邮件。—— 云岭农诊 · 山地特色经济作物病虫害多 Agent 诊断系统`,
    html: `<div style="max-width:520px;margin:0 auto;font-family:'PingFang SC','Microsoft YaHei',sans-serif;background:#f4f8f5;border-radius:12px;padding:28px 32px;">
      <h2 style="color:#1f7a4d;margin:0 0 6px;">🌱 云岭农诊</h2>
      <p style="color:#555;font-size:14px;margin:0 0 18px;">山地特色经济作物病虫害多 Agent 智能诊断系统</p>
      <p style="color:#333;font-size:15px;">您的登录验证码为：</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1f7a4d;background:#fff;border:1px dashed #9fd4b4;border-radius:10px;padding:14px 0;text-align:center;margin:0 0 14px;">${code}</div>
      <p style="color:#888;font-size:13px;">验证码 5 分钟内有效。如非本人操作，请忽略本邮件。</p>
    </div>`,
  })
}

// 发送验证码（邮箱走真实 SMTP；未配置 SMTP 或手机号短信时降级演示回显）
app.post('/api/auth/sms-code', async (req, res) => {
  const { target } = req.body || {}
  const t = String(target || '').trim().toLowerCase()
  const isPhone = /^1\d{10}$/.test(t)
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
  if (!isPhone && !isEmail) {
    return res.status(400).json({ error: '请输入正确的手机号或邮箱' })
  }
  const code = String(Math.floor(100000 + Math.random() * 900000))
  codeStore.set(t, { code, exp: Date.now() + 5 * 60 * 1000 })

  // 邮箱 + 已配置 SMTP → 真实发送
  if (isEmail && mailTransporter) {
    try {
      await sendMailCode(t, code)
      return res.json({ ok: true, channel: 'email', sent: true, ttl: 300 })
    } catch (e) {
      console.error('[mail] 发送失败，降级演示回显:', e.message)
      return res.json({ ok: true, channel: 'email', sent: false, demoCode: code, ttl: 300 })
    }
  }

  // 手机号短信或未配置 SMTP：演示回显（接入短信服务商后替换）
  res.json({ ok: true, channel: isPhone ? 'sms' : 'email', sent: false, demoCode: code, ttl: 300 })
})

// 验证码快捷登录 / 注册（手机号 / 邮箱）
app.post('/api/auth/quick', (req, res) => {
  const { method, target, code, mode, nickname, role, title, specialty, region } = req.body || {}
  const t = String(target || '').trim().toLowerCase()
  const m = String(method || '')
  if (m !== 'phone' && m !== 'email') return res.status(400).json({ error: '登录方式不正确' })
  const rec = codeStore.get(t)
  if (!rec || rec.exp < Date.now()) return res.status(401).json({ error: '验证码已过期，请重新获取' })
  if (String(code || '').trim() !== rec.code) return res.status(401).json({ error: '验证码错误' })
  codeStore.delete(t)

  let user = store.findUserByAccount(t)
  const wantRegister = mode === 'register'
  // 邮箱验证码：未注册时自动建档（业界通行做法，降低注册门槛）
  const autoRegisterEmail = m === 'email'
  if (!user && wantRegister === false && !autoRegisterEmail) {
    return res.status(404).json({ error: '该账号尚未注册，请先注册' })
  }
  if (!user) {
    const isExpert = role === 'expert'
    try {
      user = store.createUser({
        account: t,
        password: `qc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        nickname:
          nickname ||
          (m === 'phone' ? `机友${t.slice(-4)}` : t.split('@')[0].slice(0, 12) || '新用户'),
        role: isExpert ? 'expert' : 'user',
        title: isExpert ? title : '',
        specialty: isExpert ? specialty : [],
        region: isExpert ? region : '',
        ...(m === 'email' ? { email: t } : { phone: t })
      })
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }
  }
  const token = store.createSession(user.id)
  res.json({ ok: true, token, user: store.publicUser(user) })
})

// 忘记密码：验证码校验通过后重置密码（手机号 / 邮箱均可）
app.post('/api/auth/reset-password', (req, res) => {
  const { target, code, password } = req.body || {}
  const t = String(target || '').trim().toLowerCase()
  if (!t) return res.status(400).json({ error: '请输入注册时使用的手机号或邮箱' })
  const rec = codeStore.get(t)
  if (!rec || rec.exp < Date.now()) return res.status(401).json({ error: '验证码已过期，请重新获取' })
  if (String(code || '').trim() !== rec.code) return res.status(401).json({ error: '验证码错误' })
  const pwd = String(password || '')
  if (pwd.length < 6) return res.status(400).json({ error: '新密码至少 6 位' })
  const user = store.findUserByAccount(t)
  if (!user) return res.status(404).json({ error: '该账号尚未注册，请先注册' })
  codeStore.delete(t)
  store.updateUser(user.id, { password: pwd })
  res.json({ ok: true })
})

// 第三方授权登录（演示环境模拟扫码成功；接入真实开放平台后用 code 换 openid）
// ==================== 微信开放平台真实扫码登录（网站应用 snsapi_login） ====================
// 配置 .env：WECHAT_APP_ID / WECHAT_APP_SECRET / PUBLIC_BASE_URL 后自动启用；
// 未配置时 /api/auth/wechat/config 返回 enabled:false，前端降级为演示模拟。
// 每次请求时读取 process.env：支持运行时改 .env 后无需重启（也便于演示前临时填入）
const wxAppId = () => (process.env.WECHAT_APP_ID || '').trim()
const wxSecret = () => (process.env.WECHAT_APP_SECRET || '').trim()
const wxBase = () => (process.env.PUBLIC_BASE_URL || '').trim()
const wxReady = () => !!(wxAppId() && wxSecret() && wxBase())
const wechatStates = new Map() // state -> { exp }

app.get('/api/auth/wechat/config', (req, res) => {
  res.json({
    enabled: wxReady(),
    appId: wxAppId(),
    redirectUri: wxBase() ? `${wxBase().replace(/\/$/, '')}/api/auth/wechat/callback` : '',
    // 缺哪一项，前端提示里能精确告诉使用者
    missing: [
      !wxAppId() && 'WECHAT_APP_ID',
      !wxSecret() && 'WECHAT_APP_SECRET',
      !wxBase() && 'PUBLIC_BASE_URL'
    ].filter(Boolean)
  })
})

// 生成微信扫码地址（前端整页跳转或 iframe 嵌入均可）
app.get('/api/auth/wechat/qr', (req, res) => {
  const appId = wxAppId()
  const base = wxBase()
  if (!appId || !base) {
    return res.status(400).json({ error: '微信登录未配置（需 WECHAT_APP_ID / PUBLIC_BASE_URL）' })
  }
  const state = crypto.randomBytes(10).toString('hex')
  wechatStates.set(state, { exp: Date.now() + 5 * 60 * 1000 })
  const redirectUri = encodeURIComponent(`${base.replace(/\/$/, '')}/api/auth/wechat/callback`)
  const url =
    `https://open.weixin.qq.com/connect/qrconnect?appid=${appId}` +
    `&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`
  res.json({ ok: true, url, state })
})

// 微信回调：code 换 access_token → 拉取用户信息 → 按openid绑定/建号 → 带token回前端
app.get('/api/auth/wechat/callback', async (req, res) => {
  const { code, state } = req.query
  const frontBase = (process.env.FRONT_BASE_URL || wxBase() || '').replace(/\/$/, '')
  const back = (err, token) => {
    if (!frontBase) return res.status(200).json({ err, token })
    const q = err ? `?oauth_error=${encodeURIComponent(err)}` : `?token=${token}`
    res.redirect(302, `${frontBase}/oauth/callback${q}`)
  }
  const appId = wxAppId()
  const secret = wxSecret()
  if (!appId || !secret) return back('未配置微信开放平台')
  if (!state || !wechatStates.has(state)) return back('state 已失效，请重新扫码')
  wechatStates.delete(state)
  if (!code) return back('微信授权未完成')
  try {
    // 1. code 换 token
    const tokRes = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${secret}&code=${code}&grant_type=authorization_code`
    )
    const tok = await tokRes.json()
    if (tok.errcode) return back(`微信授权失败：${tok.errmsg || tok.errcode}`)
    // 2. 拉取用户信息（snsapi_login scope）
    const uiRes = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${tok.access_token}&openid=${tok.openid}`
    )
    const ui = await uiRes.json()
    if (ui.errcode) return back(`获取微信用户信息失败：${ui.errmsg || ui.errcode}`)
    // 3. 按 unionid/openid 绑定账号
    const openid = ui.unionid || ui.openid
    const account = `wx_${openid}`
    let user = store.findUserByAccount(account)
    if (!user) {
      user = store.createUser({
        account,
        password: `wechat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        nickname: ui.nickname || '微信用户',
        role: 'user',
        wechatId: account
      })
    }
    const token = store.createSession(user.id)
    back(null, token)
  } catch (e) {
    back(`微信登录异常：${e.message}`)
  }
})

// ==================== 跨设备真实扫码登录（无需第三方平台，手机扫码确认即登录） ====================
import QRCode from 'qrcode'

const scanSessions = new Map() // ticket -> { status: pending|scanned|confirmed, token, exp, phone }

// 生成登录二维码（内容为站点 /scan-login?ticket=xxx，手机扫码打开确认页）
app.post('/api/auth/scan/qr', async (req, res) => {
  const ticket = crypto.randomBytes(12).toString('hex')
  scanSessions.set(ticket, { status: 'pending', token: null, exp: Date.now() + 5 * 60 * 1000, phone: '' })
  const base = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')
  const url = `${base}/scan-login?ticket=${ticket}`
  try {
    const dataUrl = await QRCode.toDataURL(url, { width: 360, margin: 1, color: { dark: '#12331f' } })
    res.json({ ok: true, ticket, qrDataUrl: dataUrl, url, ttl: 300 })
  } catch (e) {
    res.status(500).json({ error: '二维码生成失败' })
  }
})

// 电脑端轮询扫码状态
app.get('/api/auth/scan/poll', (req, res) => {
  const s = scanSessions.get(String(req.query.ticket || ''))
  if (!s || s.exp < Date.now()) return res.json({ ok: true, status: 'expired' })
  res.json({ ok: true, status: s.status, token: s.token || undefined })
})

// 手机确认页：确认登录（绑定手机号，未注册自动建号）
app.post('/api/auth/scan/confirm', (req, res) => {
  const { ticket, phone, nickname } = req.body || {}
  const s = scanSessions.get(String(ticket || ''))
  if (!s || s.exp < Date.now()) return res.status(410).json({ error: '二维码已过期，请在电脑端刷新' })
  if (s.status === 'confirmed') return res.json({ ok: true, token: s.token })
  const p = String(phone || '').trim()
  if (!/^1\d{10}$/.test(p)) return res.status(400).json({ error: '请输入正确的手机号' })
  let user = store.findUserByAccount(p)
  if (!user) {
    try {
      user = store.createUser({
        account: p,
        password: `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        nickname: String(nickname || '').trim() || `机友${p.slice(-4)}`,
        role: 'user',
        phone: p
      })
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }
  }
  s.status = 'confirmed'
  s.token = store.createSession(user.id)
  s.phone = p
  res.json({ ok: true, token: s.token, user: store.publicUser(user) })
})

// 手机端打开确认页时标记「已扫码」
app.post('/api/auth/scan/touch', (req, res) => {
  const s = scanSessions.get(String(req.body?.ticket || ''))
  if (s && s.status === 'pending' && s.exp > Date.now()) s.status = 'scanned'
  res.json({ ok: true })
})

app.post('/api/auth/oauth', (req, res) => {
  const { provider, openid } = req.body || {}
  if (provider !== 'wechat' && provider !== 'alipay') {
    return res.status(400).json({ error: '不支持的登录方式' })
  }
  const oid = String(openid || '').trim() || `demo_${provider}_${Math.random().toString(36).slice(2, 10)}`
  const account = `${provider === 'wechat' ? 'wx' : 'ali'}_${oid}`
  let user = store.findUserByAccount(account)
  if (!user) {
    try {
      user = store.createUser({
        account,
        password: `oauth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        nickname: provider === 'wechat' ? '微信用户' : '支付宝用户',
        role: 'user',
        ...(provider === 'wechat' ? { wechatId: account } : {})
      })
    } catch (e) {
      return res.status(400).json({ error: e.message })
    }
  }
  const token = store.createSession(user.id)
  res.json({ ok: true, token, user: store.publicUser(user) })
})

// 当前用户信息
app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req)
  if (!user) return res.status(401).json({ error: '未登录' })
  res.json({ user: store.publicUser(user) })
})

// 修改个人资料（含头像 base64 / 可选改密）
app.put('/api/auth/profile', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const { nickname, avatar, region, phone, email, wechatId, password, title, specialty } = req.body || {}
  if (avatar && String(avatar).length > 1_600_000) {
    return res.status(413).json({ error: '头像过大，请更换图片后重试' })
  }
  const updated = store.updateUser(user.id, {
    ...(nickname !== undefined && { nickname: String(nickname).trim().slice(0, 20) || user.nickname }),
    ...(avatar !== undefined && { avatar }),
    ...(region !== undefined && { region }),
    ...(phone !== undefined && { phone: String(phone).trim() }),
    ...(email !== undefined && { email: String(email).trim() }),
    ...(title !== undefined && { title: String(title).trim().slice(0, 20) }),
    ...(specialty !== undefined && {
      specialty: Array.isArray(specialty)
        ? specialty.map((x) => String(x).trim().slice(0, 12)).filter(Boolean).slice(0, 8)
        : []
    }),
    ...(wechatId !== undefined && { wechatId: String(wechatId).trim() }),
    ...(password && { password: String(password) })
  })
  res.json({ ok: true, user: updated })
})

// 退出登录
app.post('/api/auth/logout', (req, res) => {
  store.destroySession(extractToken(req))
  res.json({ ok: true })
})

// 注销账号（危险操作：同步删除其消息与会话）
app.delete('/api/auth/account', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const ok = store.deleteUser(user.id)
  res.json({ ok, message: '账号已注销，相关数据已删除' })
})

// ==================== 站内消息 ====================

// 我的消息（含全员公告）
app.get('/api/messages', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  res.json({
    ...store.listMessages({ userId: user.id }),
    unread: store.unreadCount(user.id)
  })
})

// 全部已读
app.post('/api/messages/read-all', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const n = store.markAllRead(user.id)
  res.json({ ok: true, marked: n, unread: 0 })
})

// 清理消息：可带 { ids: [...] } 只删所选，不带则全部清空
app.delete('/api/messages', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const n = store.clearMessages(user.id, req.body?.ids)
  res.json({ ok: true, removed: n, unread: store.unreadCount(user.id) })
})

app.post('/api/messages/:id/read', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  store.markMessageRead(req.params.id, user.id)
  res.json({ ok: true, unread: store.unreadCount(user.id) })
})

// 专家已发送消息列表（管理后台「消息通知」）
app.get('/api/messages/sent', (req, res) => {
  const expert = requireExpert(req, res)
  if (!expert) return
  res.json(store.listSentMessages())
})

// 删除一条已发送消息
app.delete('/api/messages/sent/:id', (req, res) => {
  const expert = requireExpert(req, res)
  if (!expert) return
  const ok = store.deleteSentMessage(req.params.id)
  if (!ok) return res.status(404).json({ error: '消息不存在' })
  res.json({ ok: true })
})

// 专家发送消息（可指定用户或全员公告）
app.post('/api/messages', (req, res) => {
  const expert = requireExpert(req, res)
  if (!expert) return
  const { userId, title, content } = req.body || {}
  if (!title || !content) return res.status(400).json({ error: '请填写标题与内容' })
  const item = store.createMessage({
    userId: userId === 'all' || !userId ? 'all' : Number(userId),
    from: expert.role,
    fromName: expert.nickname,
    title: String(title).slice(0, 40),
    content: String(content).slice(0, 500)
  })
  res.json({ ok: true, item })
})

// ==================== 检索调试接口（体现 RAG 可观测性） ====================
app.get('/api/retrieve', (req, res) => {
  const { q, cropId, topK } = req.query
  if (!q) return res.status(400).json({ error: '缺少 q 参数' })
  const hits = retrieve(q, { cropId: cropId || null, topK: Number(topK) || 5 })
  res.json({
    query: q,
    hits: hits.map((h) => ({
      id: h.id,
      name: h.disease.name,
      crop: CROP_NAME[h.cropId],
      score: h.score,
      normalized: h.scoreNormalized,
      keywords: h.disease.symptomKeywords
    }))
  })
})

// ==================== 诊断记录 ====================

app.get('/api/records', (req, res) => {
  const { cropId, limit, offset, userId, days, region } = req.query
  res.json(
    store.listRecords({
      cropId: cropId || undefined,
      limit: Number(limit) || 30,
      offset: Number(offset) || 0,
      userId: userId || undefined,
      days: Number(days) || undefined,
      region: region || undefined
    })
  )
})

app.get('/api/records/:id', (req, res) => {
  const r = store.getRecord(req.params.id)
  if (!r) return res.status(404).json({ error: '记录不存在' })
  res.json(r)
})

app.patch('/api/records/:id', (req, res) => {
  const r = store.updateRecord(req.params.id, req.body || {})
  if (!r) return res.status(404).json({ error: '记录不存在' })
  res.json(r)
})

app.delete('/api/records/:id', (req, res) => {
  const ok = store.deleteRecord(req.params.id)
  if (!ok) return res.status(404).json({ error: '记录不存在' })
  res.json({ ok: true })
})

// 一键清空全部诊断记录（管理后台）
app.delete('/api/records', (req, res) => {
  const user = requireExpert(req, res)
  if (!user) return
  const removed = store.clearRecords()
  res.json({ ok: true, removed })
})

// ==================== 统计与预警 ====================

app.get('/api/stats', (req, res) => {
  const days = Number(req.query.days) || 30
  const cropId = req.query.cropId || undefined
  const region = req.query.region || undefined
  const stats = store.getStats({ days, cropId, region })
  res.json({ ...stats, cropNames: CROP_NAME })
})

// 预警结果内存缓存：10 分钟内直接复用，AI 刷新放后台；缓存按地区区分
let alertCache = { at: 0, region: '', data: null, refreshing: false }

app.get('/api/alerts', async (req, res) => {
  const days = Number(req.query.days) || 14
  const region = req.query.region || ''
  const stats = store.getStats({ days, region })

  // 缓存按地区区分，切地区后预警立即对应
  if (alertCache.data && alertCache.region === region && Date.now() - alertCache.at < 10 * 60 * 1000) {
    return res.json(alertCache.data)
  }

  // 有旧缓存但已过期：立即返回旧值，后台静默刷新（stale-while-revalidate）
  if (alertCache.data && alertCache.region === region && !alertCache.refreshing) {
    alertCache.refreshing = (async () => {
      try {
        const statsText2 = [
          `近 ${days} 天共 ${stats.total} 次诊断`,
          `需人工复核 ${stats.escalated} 次（${stats.escalatedRate}%）`,
          `平均置信度 ${stats.avgConfidence}`,
          `高发病害：${stats.topDiseases.slice(0, 5).map((d) => `${d.name}(${d.count}次)`).join('、')}`,
          `区域分布：${stats.regions.slice(0, 5).map((r) => `${r.name}(${r.count})`).join('、')}`
        ].join('\n')
        if (isConfigured()) {
          const { system, user } = buildAlertPrompt({ stats: statsText2 })
          const rr = await Promise.race([
            chatText({ system, user, temperature: 0.3, jsonMode: true, maxTokens: 600 }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('alerts ai timeout')), 6000))
          ])
          const jr = extractJSON(rr.content)
          if (jr) {
            alertCache = {
              at: Date.now(),
              region,
              data: { ...jr, stats: { total: stats.total, days, escalatedRate: stats.escalatedRate, region } }
            }
          }
        }
      } catch { /* 后台刷新失败则保留旧值 */ } finally {
        alertCache.refreshing = null
      }
    })()
    return res.json(alertCache.data)
  }

  const scopeLabel = region ? `地区「${region}」` : '全平台'
  const statsText = [
    `统计范围：${scopeLabel}`,
    `近 ${days} 天共 ${stats.total} 次诊断`,
    `需人工复核 ${stats.escalated} 次（${stats.escalatedRate}%）`,
    `平均置信度 ${stats.avgConfidence}`,
    `高发病害：${stats.topDiseases
      .slice(0, 5)
      .map((d) => `${d.name}(${d.count}次)`)
      .join('、')}`,
    `区域分布：${stats.regions
      .slice(0, 5)
      .map((r) => `${r.name}(${r.count})`)
      .join('、')}`
  ].join('\n')

  let result = null
  if (isConfigured()) {
    try {
      const { system, user } = buildAlertPrompt({ stats: statsText })
      // 首页预警不做长等待：6 秒内未返回就降级规则兜底，避免骨架屏久转
      const r = await Promise.race([
        chatText({ system, user, temperature: 0.3, jsonMode: true, maxTokens: 600 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('alerts ai timeout')), 6000))
      ])
      result = extractJSON(r.content)
    } catch (err) {
      console.warn('[GET /api/alerts] 模型分析失败:', err.message)
    }
  }

  // 规则兜底：基于数据阈值生成预警
  if (!result) {
    const top = stats.topDiseases[0]
    const rate = stats.escalatedRate
    let level = 'green'
    let headline = '当前区域病虫害发生平稳'
    if (rate > 30 || (top && top.count > stats.total * 0.35)) level = 'red'
    else if (rate > 15 || (top && top.count > stats.total * 0.22)) level = 'orange'
    else if (top) level = 'yellow'

    if (top) {
      headline =
        level === 'green'
          ? '当前区域病虫害发生平稳'
          : `${top.name}占比偏高，需重点关注`
    }

    result = {
      headline,
      level,
      scope: region,
      analysis: `近 ${days} 天累计诊断 ${stats.total} 次，其中 ${top ? `「${top.name}」出现 ${top.count} 次，占比 ${((top.count / (stats.total || 1)) * 100).toFixed(1)}%` : '无集中病害'}。需人工复核比例 ${rate}%，${rate > 15 ? '说明疑难病例偏多，建议加强基层技术力量' : '整体可控'}。`,
      actions: [
        top ? `针对「${top.name}」发布专项防控提示，重点覆盖${stats.regions[0]?.name || '高发区域'}` : '保持常规监测',
        '雨季前完成田间排水沟疏通，降低根腐类病害风险',
        '对置信度低、已转人工的病例进行回访，验证诊断准确性'
      ]
    }
  }

  const payload = { ...result, stats: { total: stats.total, days, escalatedRate: stats.escalatedRate } }
  alertCache = { at: Date.now(), data: payload }
  res.json(payload)
})

// 一键推送灾害预警公告：专家端与农户端消息中心同时收到
app.post('/api/alerts/publish', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  if (user.role !== 'expert') return res.status(403).json({ error: '仅专家可发布预警公告' })
  const { title, content } = req.body || {}
  if (!title || !String(title).trim()) return res.status(400).json({ error: '请填写预警标题' })
  const msg = store.broadcastAlert({
    title: `⚠️ 灾害预警：${String(title).slice(0, 60)}`,
    content: String(content || '').slice(0, 500)
  })
  res.json({ ok: true, messageId: msg.id })
})

// ==================== 种植档案复盘 ====================

app.post('/api/review', async (req, res) => {
  const { cropId, userId } = req.body || {}
  const { items } = store.listRecords({ cropId, userId, limit: 30 })

  if (items.length < 2) {
    return res.json({
      pattern: '记录数量较少，暂无法分析规律',
      riskLevel: 'low',
      suggestions: [{ title: '继续积累记录', detail: '累计 3 次以上诊断后即可生成针对性复盘建议' }],
      nextSeasonFocus: '建议每次发现异常都记录诊断结果，便于发现规律'
    })
  }

  const cropName = CROP_NAME[cropId] || '作物'
  let result = null

  if (isConfigured()) {
    try {
      const { system, user } = buildReviewPrompt({
        cropName,
        records: items.map((r) => ({
          date: new Date(r.createdAt).toLocaleDateString('zh-CN'),
          diseaseName: r.diagnosis?.results?.[0]?.name || '未知',
          confidence: r.diagnosis?.results?.[0]?.confidence || 0.5,
          area: r.area
        }))
      })
      const r = await chatText({ system, user, temperature: 0.4, jsonMode: true, maxTokens: 800 })
      result = extractJSON(r.content)
    } catch (err) {
      console.warn('[POST /api/review] 模型调用失败:', err.message)
    }
  }

  if (!result) {
    const countMap = new Map()
    for (const r of items) {
      const n = r.diagnosis?.results?.[0]?.name
      if (n) countMap.set(n, (countMap.get(n) || 0) + 1)
    }
    const sorted = [...countMap.entries()].sort((a, b) => b[1] - a[1])
    const main = sorted[0]
    result = {
      pattern: main
        ? `共 ${items.length} 条记录中，「${main[0]}」出现 ${main[1]} 次，为最主要问题`
        : '记录中未见明显重复病害',
      riskLevel: main && main[1] / items.length > 0.5 ? 'high' : 'medium',
      suggestions: [
        {
          title: `重点防控${main ? main[0] : '常发病害'}`,
          detail: '在下一季种植前做好土壤消毒与排水改造，从源头降低发病基础'
        },
        { title: '建立用药台账', detail: '记录每次用药的药剂、浓度、日期，避免重复使用同一机制药剂' }
      ],
      nextSeasonFocus: '提前做好田间排水，雨季前完成预防性用药'
    }
  }

  // 统计维度：历史病害频次 / 时间规律 / 平均置信度（供前端图表化展示，也是 AI 复盘的数据基础）
  const countMap = new Map()
  for (const r of items) {
    const n = r.diagnosis?.results?.[0]?.name
    if (n) countMap.set(n, (countMap.get(n) || 0) + 1)
  }
  const diseaseCounts = [...countMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count, ratio: Number((count / items.length).toFixed(2)) }))

  const monthMap = new Map()
  for (const r of items) {
    const d = new Date(r.createdAt)
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getMonth() + 1} 月`
    monthMap.set(key, (monthMap.get(key) || 0) + 1)
  }
  const monthly = [...monthMap.entries()].map(([month, count]) => ({ month, count }))

  const confs = items
    .map((r) => r.diagnosis?.results?.[0]?.confidence)
    .filter((c) => typeof c === 'number')
  const avgConfidence = confs.length
    ? Number((confs.reduce((s, c) => s + c, 0) / confs.length).toFixed(2))
    : null

  res.json({
    ...result,
    recordCount: items.length,
    stats: {
      diseaseCounts,
      monthly,
      avgConfidence,
      cropName,
      spanDays: (() => {
        const ts = items.map((r) => new Date(r.createdAt).getTime()).filter(Number.isFinite)
        if (ts.length < 2) return 0
        return Math.max(1, Math.round((Math.max(...ts) - Math.min(...ts)) / 86400000))
      })()
    }
  })
})

// ==================== AI 复盘报告：保存 / 列表 / 删除 ====================

app.post('/api/review/save', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const { cropId, cropName, report } = req.body || {}
  if (!report || typeof report !== 'object') return res.status(400).json({ error: '复盘内容不能为空' })
  const item = store.saveReviewReport({
    userId: user.id,
    cropId: cropId || '',
    cropName: cropName || report?.stats?.cropName || '',
    report
  })
  res.json({ ok: true, item })
})

app.get('/api/review/saved', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  res.json({ items: store.listReviewReports(user.id) })
})

app.delete('/api/review/saved/:id', (req, res) => {
  const user = requireUser(req, res)
  if (!user) return
  const target = store.listReviewReports(user.id).find((x) => x.id === Number(req.params.id))
  if (!target) return res.status(404).json({ error: '复盘报告不存在' })
  store.deleteReviewReport(target.id)
  res.json({ ok: true })
})

// ==================== AI 运行指标（技术透明度） ====================

app.get('/api/metrics', (req, res) => {
  res.json({
    ...metrics,
    avgLatencyMs: metrics.calls ? Math.round(metrics.totalLatencyMs / metrics.calls) : 0,
    config: getConfigSummary()
  })
})

// ==================== 演示数据重置 ====================

app.post('/api/demo/reset', (req, res) => {
  store.resetDemoData()
  res.json({ ok: true, message: '演示数据已重置' })
})

// ==================== 生产环境静态托管 ====================

const distDir = path.join(__dirname, '../dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.use((err, req, res, next) => {
  console.error('[Unhandled]', err)
  res.status(500).json({ error: '服务内部错误', detail: err.message })
})

app.listen(PORT, () => {
  const ai = isConfigured()
  console.log(`\n  🌿 云岭农诊 · 山地特色作物病虫害多Agent诊断系统`)
  console.log(`  ─────────────────────────────────────────────`)
  console.log(`  API:    http://localhost:${PORT}/api`)
  console.log(`  AI:     ${ai ? '✅ 已配置 ' + (getConfigSummary().visionModel || '') : '⚠️  未配置（将使用知识库降级模式）'}`)
  console.log(`  知识库: ${DISEASES.length} 种病害 / ${CROPS.length} 种作物`)
  console.log(`  ─────────────────────────────────────────────\n`)
})
