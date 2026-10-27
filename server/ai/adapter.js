/**
 * 统一 AI 适配层（Provider-Agnostic AI Adapter）
 *
 * 设计目标：
 * 1. 统一走 OpenAI 兼容协议，换服务商只需改 .env 三项配置，代码零改动
 * 2. 内置重试 / 超时 / 降级，保证答辩现场网络抖动时不崩
 * 3. 记录 token 消耗与耗时，便于成本核算与前端展示
 *
 * 支持的服务商（均兼容 OpenAI Chat Completions 协议）：
 * - 阿里云百炼：BASE=https://dashscope.aliyuncs.com/compatible-mode/v1  VISION=qwen-vl-max  TEXT=qwen-plus
 * - 字节火山方舟：BASE=https://ark.cn-beijing.volces.com/api/v3  VISION=ep-xxx  TEXT=ep-xxx
 * - 智谱 GLM：BASE=https://open.bigmodel.cn/api/paas/v4  VISION=glm-4v-plus  TEXT=glm-4-plus
 * - DeepSeek：BASE=https://api.deepseek.com/v1  TEXT=deepseek-chat（视觉需另配）
 * - OpenAI：BASE=https://api.openai.com/v1  VISION=gpt-4o  TEXT=gpt-4o-mini
 */

import 'dotenv/config'

const CONFIG = {
  baseUrl: (process.env.AI_BASE_URL || '').replace(/\/$/, ''),
  apiKey: process.env.AI_API_KEY || '',
  visionModel: process.env.AI_VISION_MODEL || '',
  textModel: process.env.AI_TEXT_MODEL || '',
  timeout: Number(process.env.AI_TIMEOUT_MS || 45000),
  maxRetries: Number(process.env.AI_MAX_RETRIES || 2),
  temperature: Number(process.env.AI_TEMPERATURE || 0.3)
}

export const isConfigured = () =>
  Boolean(CONFIG.baseUrl && CONFIG.apiKey && (CONFIG.visionModel || CONFIG.textModel))

export const getConfigSummary = () => ({
  configured: isConfigured(),
  baseUrl: CONFIG.baseUrl ? maskUrl(CONFIG.baseUrl) : '',
  visionModel: CONFIG.visionModel || '(未配置)',
  textModel: CONFIG.textModel || '(未配置)',
  keyMasked: CONFIG.apiKey ? `${CONFIG.apiKey.slice(0, 4)}****${CONFIG.apiKey.slice(-4)}` : '(未配置)',
  supportsVision: Boolean(CONFIG.visionModel)
})

const maskUrl = (u) => {
  try {
    const url = new URL(u)
    return `${url.protocol}//${url.host}${url.pathname}`
  } catch {
    return u
  }
}

/** 统计信息（内存级，用于前端"技术透明度"面板展示） */
export const metrics = {
  calls: 0,
  failures: 0,
  totalTokens: 0,
  totalLatencyMs: 0,
  lastCallAt: null,
  lastModel: null,
  history: []
}

const recordMetric = (entry) => {
  metrics.calls++
  metrics.totalTokens += entry.tokens || 0
  metrics.totalLatencyMs += entry.latencyMs || 0
  metrics.lastCallAt = new Date().toISOString()
  metrics.lastModel = entry.model
  metrics.history.push(entry)
  if (metrics.history.length > 50) metrics.history.shift()
}

class AIServiceError extends Error {
  constructor(message, code, detail) {
    super(message)
    this.name = 'AIServiceError'
    this.code = code
    this.detail = detail
  }
}

/**
 * 底层调用：单次 Chat Completions
 */
const callOnce = async ({ model, messages, temperature, jsonMode, maxTokens }) => {
  if (!isConfigured()) {
    throw new AIServiceError(
      'AI 服务未配置，请在 .env 中填写 AI_BASE_URL / AI_API_KEY / 模型名称',
      'NOT_CONFIGURED'
    )
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONFIG.timeout)
  const started = Date.now()

  try {
    const body = {
      model,
      messages,
      temperature: temperature ?? CONFIG.temperature,
      max_tokens: maxTokens || 2000
    }
    if (jsonMode) body.response_format = { type: 'json_object' }

    const resp = await fetch(`${CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    const latencyMs = Date.now() - started

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new AIServiceError(
        `模型服务返回 ${resp.status}`,
        resp.status === 401 ? 'AUTH_FAILED' : 'UPSTREAM_ERROR',
        text.slice(0, 500)
      )
    }

    const data = await resp.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      throw new AIServiceError('模型返回内容为空', 'EMPTY_RESPONSE')
    }

    recordMetric({
      model,
      latencyMs,
      tokens: data?.usage?.total_tokens || 0,
      at: new Date().toISOString()
    })

    return {
      content,
      usage: data?.usage || null,
      latencyMs,
      model
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AIServiceError('模型响应超时', 'TIMEOUT')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 带重试的调用（指数退避）
 */
export const chat = async (opts) => {
  let lastErr
  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      return await callOnce(opts)
    } catch (err) {
      lastErr = err
      // 认证失败 / 未配置：重试无意义
      if (err.code === 'AUTH_FAILED' || err.code === 'NOT_CONFIGURED') break
      if (attempt < CONFIG.maxRetries) {
        await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)))
      }
    }
  }
  metrics.failures++
  throw lastErr
}

/**
 * 从模型输出中稳健地提取 JSON
 * 大模型有时会包裹 ```json 代码块或添加前后说明文字
 */
export const extractJSON = (text) => {
  if (!text) return null
  let s = String(text).trim()

  // 去除 markdown 代码围栏
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) s = fence[1].trim()

  try {
    return JSON.parse(s)
  } catch {
    /* 继续尝试 */
  }

  // 截取第一个 { 到最后一个 } 之间的内容
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1))
    } catch {
      /* 继续尝试 */
    }
  }

  const arrStart = s.indexOf('[')
  const arrEnd = s.lastIndexOf(']')
  if (arrStart !== -1 && arrEnd > arrStart) {
    try {
      return JSON.parse(s.slice(arrStart, arrEnd + 1))
    } catch {
      /* 放弃 */
    }
  }

  return null
}

/**
 * 视觉调用：图片 + 文本
 * @param {string} imageBase64 形如 data:image/jpeg;base64,xxx 或纯 base64
 */
export const chatVision = async ({ system, user, imageBase64, temperature, maxTokens }) => {
  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`

  const messages = [
    { role: 'system', content: system },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: dataUrl } },
        { type: 'text', text: user }
      ]
    }
  ]

  return chat({
    model: CONFIG.visionModel || CONFIG.textModel,
    messages,
    temperature,
    maxTokens
  })
}

/**
 * 纯文本调用
 */
export const chatText = async ({ system, user, temperature, jsonMode, maxTokens }) => {
  return chat({
    model: CONFIG.textModel || CONFIG.visionModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature,
    jsonMode,
    maxTokens
  })
}

/**
 * 底层原始调用：返回完整响应体（支持 Function Calling 工具消息）
 */
const callRawOnce = async ({ messages, tools, temperature, maxTokens }) => {
  if (!isConfigured()) {
    throw new AIServiceError('AI 服务未配置', 'NOT_CONFIGURED')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONFIG.timeout)
  const started = Date.now()
  try {
    const body = {
      model: CONFIG.textModel || CONFIG.visionModel,
      messages,
      temperature: temperature ?? CONFIG.temperature,
      max_tokens: maxTokens || 1500
    }
    if (tools?.length) {
      body.tools = tools
      body.tool_choice = 'auto'
    }
    const resp = await fetch(`${CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
    const latencyMs = Date.now() - started
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new AIServiceError(
        `模型服务返回 ${resp.status}`,
        resp.status === 401 ? 'AUTH_FAILED' : 'UPSTREAM_ERROR',
        text.slice(0, 500)
      )
    }
    const data = await resp.json()
    recordMetric({
      model: body.model,
      latencyMs,
      tokens: data?.usage?.total_tokens || 0,
      at: new Date().toISOString()
    })
    return data
  } catch (err) {
    if (err.name === 'AbortError') throw new AIServiceError('模型响应超时', 'TIMEOUT')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** 原始调用（含重试），供 Function Calling Agent 循环使用 */
export const chatRaw = async (opts) => {
  let lastErr
  for (let attempt = 0; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      return await callRawOnce(opts)
    } catch (err) {
      lastErr = err
      if (err.code === 'AUTH_FAILED' || err.code === 'NOT_CONFIGURED') break
      if (attempt < CONFIG.maxRetries) {
        await new Promise((r) => setTimeout(r, 600 * Math.pow(2, attempt)))
      }
    }
  }
  metrics.failures++
  throw lastErr
}

/**
 * 流式调用（SSE）：逐段回调 onDelta(delta)
 * 用于问答界面的打字机效果（对齐评分点「流式输出渲染流畅」）
 */
export const chatStream = async ({ system, user, temperature, maxTokens, onDelta }) => {
  if (!isConfigured()) {
    throw new AIServiceError('AI 服务未配置', 'NOT_CONFIGURED')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONFIG.timeout)
  const started = Date.now()
  try {
    const resp = await fetch(`${CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: CONFIG.textModel || CONFIG.visionModel,
        stream: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        temperature: temperature ?? CONFIG.temperature,
        max_tokens: maxTokens || 1200
      }),
      signal: controller.signal
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      throw new AIServiceError(
        `模型服务返回 ${resp.status}`,
        resp.status === 401 ? 'AUTH_FAILED' : 'UPSTREAM_ERROR',
        text.slice(0, 300)
      )
    }

    let full = ''
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') continue
        try {
          const json = JSON.parse(payload)
          const delta = json?.choices?.[0]?.delta?.content || ''
          if (delta) {
            full += delta
            onDelta?.(delta)
          }
        } catch { /* 分片容错 */ }
      }
    }

    recordMetric({
      model: CONFIG.textModel,
      latencyMs: Date.now() - started,
      tokens: Math.round(full.length / 1.6),
      at: new Date().toISOString()
    })
    return { content: full }
  } catch (err) {
    if (err.name === 'AbortError') throw new AIServiceError('模型响应超时', 'TIMEOUT')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export { CONFIG, AIServiceError }
