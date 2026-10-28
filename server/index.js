/**
 * API 服务入口
 * 单进程 Express 服务，同时承担 API 与生产环境下前端静态托管
 */

import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { CROPS, DISEASES, PESTICIDE_SAFETY, getDiseasesByCrop } from './kb/diseases.js'
import { ATLAS } from './kb/crops-atlas.js'
import { provinceOf } from './kb/regions.js'
import { retrieve, buildContext, getDocCount } from './kb/retriever.js'
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

app.use(cors())
app.use(express.json({ limit: '20mb' }))

// ==================== 基础信息 ====================

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
  const kbCrops = CROPS.map((c) => ({
    id: c.id,
    name: c.name,
    alias: c.alias || '',
    emoji: c.emoji || '🌱',
    tagline: c.tagline || '',
    desc: c.desc || c.tagline || '',
    season: c.season || '',
    altitude: c.altitude || '',
    regions: c.regions || [],
    diseaseCount: getDiseasesByCrop(c.id).length,
    diagnosable: true,
    source: 'kb'
  }))

  const localKb = province ? kbCrops.filter((c) => c.regions.includes(province)) : []
  const otherKb = kbCrops.filter((c) => !localKb.includes(c))

  // 地区百科作物：知识库未收录，仅作资料展示与问答参考
  const atlasRaw = [
    ...(ATLAS[province] || []).map((a) => ({ ...a, source: 'atlas' })),
    ...store.listApprovedCrops(province).map((s) => ({
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
      source: a.source
    }))

  let items = [...localKb, ...atlasCrops, ...otherKb]
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
  const { name, alias, province, altitude, season, emoji, desc, pests, submitter, contact } =
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

// 审核通过 / 驳回
app.patch('/api/crops/submissions/:id', (req, res) => {
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
  res.json({ items: list })
})

// ==================== 核心：多 Agent 诊断 ====================

app.post('/api/diagnose', async (req, res) => {
  const { cropId, image, symptomsText, altitude, weather, stage, area, region, userId } = req.body || {}

  if (!cropId || !CROP_NAME[cropId]) {
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
      area
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
    const status = err.code === 'DIAGNOSIS_UNAVAILABLE' ? 503 : 500
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
app.get('/api/weather', (req, res) => {
  const { region, cropId } = req.query
  if (!region) return res.status(400).json({ error: '缺少 region 参数' })
  res.json(getWeatherForecast(String(region), cropId || null))
})

// Function Calling 咨询：模型自主决定调用天气/农药工具后作答
app.post('/api/advisory', async (req, res) => {
  const { question, cropId, region } = req.body || {}
  if (!question || !String(question).trim()) return res.status(400).json({ error: '请输入问题' })

  const kb = resolveKbContext(String(question), cropId || null, 3)

  if (!isConfigured()) {
    // 降级：本地直接执行工具 + 知识库组装
    const weather = getWeatherForecast(region || '文山', cropId)
    const d0 = weather.days[0]
    const answer = [
      `**${weather.region}天气与农事参考**`,
      ``,
      `今天${d0.cond}，${d0.tempLow}~${d0.tempHigh}℃，空气湿度 ${d0.humidity}%，降水概率 ${d0.rainProb}%。`,
      ``,
      `**病害风险**：${weather.riskLevel === 'high' ? '偏高' : weather.riskLevel === 'medium' ? '中等' : '较低'}（峰值指数 ${weather.riskPeak}）。`,
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
  const { question, cropId, region } = req.body || {}
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

  const kb = resolveKbContext(String(question), cropId || null)
  const sources = kb.hits.map((h) => ({
    id: h.id,
    name: h.disease.name,
    cropId: h.cropId,
    score: h.scoreNormalized,
    type: h.disease.type,
    symptoms: h.disease.symptoms.slice(0, 2)
  }))

  // 先推送检索来源，让用户在等待时就能看到"系统在做什么"
  send('sources', { sources })

  let answer = ''
  let usedFallback = false

  if (isConfigured()) {
    try {
      const cropName = cropId ? CROP_NAME[cropId] : ''
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

  const saved = store.saveConsultation({
    question: String(question),
    answer,
    cropId: cropId || null,
    usedFallback,
    sources: kb.hits.map((h) => ({ name: h.disease.name, score: h.scoreNormalized }))
  })

  send('done', { usedFallback, consultationId: saved.id, length: answer.length })
  res.end()
})

// ==================== RAG 知识库问答（非流式，兼容保留） ====================

app.post('/api/qa', async (req, res) => {
  const { question, cropId, history } = req.body || {}
  if (!question || !String(question).trim()) {
    return res.status(400).json({ error: '请输入问题' })
  }

  const kb = resolveKbContext(question, cropId || null)
  const cropName = cropId ? CROP_NAME[cropId] : ''
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

  const saved = store.saveConsultation({
    question,
    answer,
    cropId: cropId || null,
    usedFallback,
    sources: kb.hits.map((h) => ({ name: h.disease.name, score: h.scoreNormalized }))
  })

  res.json({
    answer,
    sources: kb.hits.map((h) => ({
      id: h.id,
      name: h.disease.name,
      cropId: h.cropId,
      score: h.scoreNormalized,
      type: h.disease.type,
      symptoms: h.disease.symptoms.slice(0, 2)
    })),
    usedFallback,
    consultationId: saved.id
  })
})

app.get('/api/qa/history', (req, res) => {
  res.json({ items: store.listConsultations(Number(req.query.limit) || 20) })
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
  const { cropId, limit, offset, userId } = req.query
  res.json(
    store.listRecords({
      cropId: cropId || undefined,
      limit: Number(limit) || 30,
      offset: Number(offset) || 0,
      userId: userId || undefined
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

// ==================== 统计与预警 ====================

app.get('/api/stats', (req, res) => {
  const days = Number(req.query.days) || 30
  const cropId = req.query.cropId || undefined
  const stats = store.getStats({ days, cropId })
  res.json({ ...stats, cropNames: CROP_NAME })
})

app.get('/api/alerts', async (req, res) => {
  const days = Number(req.query.days) || 14
  const stats = store.getStats({ days })

  const statsText = [
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
      const r = await chatText({ system, user, temperature: 0.3, jsonMode: true, maxTokens: 600 })
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
      analysis: `近 ${days} 天累计诊断 ${stats.total} 次，其中 ${top ? `「${top.name}」出现 ${top.count} 次，占比 ${((top.count / (stats.total || 1)) * 100).toFixed(1)}%` : '无集中病害'}。需人工复核比例 ${rate}%，${rate > 15 ? '说明疑难病例偏多，建议加强基层技术力量' : '整体可控'}。`,
      actions: [
        top ? `针对「${top.name}」发布专项防控提示，重点覆盖${stats.regions[0]?.name || '高发区域'}` : '保持常规监测',
        '雨季前完成田间排水沟疏通，降低根腐类病害风险',
        '对置信度低、已转人工的病例进行回访，验证诊断准确性'
      ]
    }
  }

  res.json({ ...result, stats: { total: stats.total, days, escalatedRate: stats.escalatedRate } })
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

  res.json({ ...result, recordCount: items.length })
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
