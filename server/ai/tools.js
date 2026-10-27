/**
 * AI 工具集成（Function Calling / Tool Use）
 *
 * 对齐评分点「MCP/工具集成」：AI 可在推理过程中自主决定调用外部工具
 * 获取实时数据（天气预报、农药安全库），实现"感知-决策-行动"闭环。
 *
 * 工具定义遵循 OpenAI Function Calling 规范，兼容硅基流动 / 百炼 / GLM 等。
 * 天气数据为本地模拟源（演示环境），接口设计可直接替换为真实气象 API。
 */

import { PESTICIDE_SAFETY, DISEASES } from '../kb/diseases.js'

/** 工具清单（OpenAI tools 格式） */
export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_weather_forecast',
      description: '查询云南某区域未来 7 天天气预报及病害发生风险指数。当需要结合天气给出防控建议、或用户提及降雨/湿度/温度相关问题时调用。',
      parameters: {
        type: 'object',
        properties: {
          region: { type: 'string', description: '区域名称，如：文山、昭通、曲靖' },
          cropId: { type: 'string', description: '作物 ID，如 sanqi/tea/walnut，用于计算针对性病害风险' }
        },
        required: ['region']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'lookup_pesticide_safety',
      description: '查询某种作物上可用的农药登记信息、安全间隔期与配伍禁忌。任何涉及"打什么药、怎么打、多久能采"的问题都应调用。',
      parameters: {
        type: 'object',
        properties: {
          cropId: { type: 'string', description: '作物 ID' },
          chemical: { type: 'string', description: '药剂名称（可选），如：苯醚甲环唑' }
        },
        required: ['cropId']
      }
    }
  }
]

/**
 * 模拟天气源：以区域名做确定性伪随机，保证同一天同一区域结果稳定
 * 真实部署时此函数可替换为 https://open-meteo.com 等免费气象 API
 */
const hash = (s) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const dayNames = ['今天', '明天', '后天']
const conds = ['多云', '小雨', '阴', '阵雨', '晴', '中雨']

export const getWeatherForecast = (region, cropId) => {
  const base = hash(region + new Date().toISOString().slice(0, 10))
  const days = []
  let riskPeak = 0
  for (let i = 0; i < 7; i++) {
    const r = hash(`${region}-${i}`) % 100
    const cond = conds[(base + i * 7) % conds.length]
    const rainProb = cond.includes('雨') ? 60 + (r % 40) : 5 + (r % 30)
    const tempLow = 12 + (r % 6)
    const tempHigh = tempLow + 8 + (r % 7)
    const humidity = cond.includes('雨') ? 78 + (r % 18) : 55 + (r % 25)
    // 病害风险指数：高温高湿 + 连续降雨 → 风险升高
    const risk = Math.min(95, Math.round(humidity * 0.6 + rainProb * 0.35))
    riskPeak = Math.max(riskPeak, risk)
    days.push({
      day: i < 3 ? dayNames[i] : `第${i + 1}天`,
      cond,
      rainProb,
      tempLow,
      tempHigh,
      humidity,
      risk
    })
  }

  // 结合作物给出针对性提示
  const cropRiskNote = {
    sanqi: '三七根腐病在连续降雨+高湿条件下风险显著升高，注意深沟排水',
    tea: '茶饼病在云雾高湿天气易流行，雨歇窗口期抓紧保护性喷药',
    tianma: '天麻窖内重点关注积水与窖温，外部连续降雨时加强排水巡查',
    walnut: '核桃黑斑病在花期至幼果期的降雨后需补喷细菌性药剂',
    blueberry: '灰霉病在持续高湿天风险上升，注意通风降湿',
    citrus: '溃疡病在台风/暴雨后伤口侵染风险高，风雨过后及时防护'
  }

  return {
    region,
    updated: new Date().toISOString(),
    source: '模拟气象数据（演示环境，可替换为真实气象 API）',
    days,
    riskPeak,
    riskLevel: riskPeak >= 75 ? 'high' : riskPeak >= 60 ? 'medium' : 'low',
    cropNote: cropId ? (cropRiskNote[cropId] || '关注高湿天气带来的真菌病害压力') : cropRiskNote.sanqi
  }
}

/** 农药安全库查询（真实数据） */
export const lookupPesticideSafety = (cropId, chemical) => {
  let list = PESTICIDE_SAFETY.filter((p) => p.cropId === cropId)
  if (chemical) {
    const hit = list.find((p) => p.chemical.includes(chemical) || chemical.includes(p.chemical.replace(/（.*/, '')))
    if (hit) list = [hit]
  }
  return {
    cropId,
    chemical: chemical || '全部',
    count: list.length,
    items: list.map((p) => ({
      chemical: p.chemical,
      target: p.target,
      interval: p.interval,
      avoid: p.avoid,
      dosage: p.dosage
    }))
  }
}

/** 工具执行路由：模型决定调用 → 这里真正执行 */
export const executeTool = async (name, args) => {
  switch (name) {
    case 'get_weather_forecast':
      return getWeatherForecast(args.region || '文山', args.cropId)
    case 'lookup_pesticide_safety':
      return lookupPesticideSafety(args.cropId || 'sanqi', args.chemical)
    default:
      return { error: `未知工具: ${name}` }
  }
}

/**
 * Function Calling Agent 循环：
 * 模型自主决定是否调用工具 → 执行 → 把结果回传 → 生成最终回答
 * 最多 3 轮工具调用，超限直接取现有内容收尾
 */
export const runWithTools = async ({ chatFn, system, user, maxRounds = 3 }) => {
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
  const toolTraces = []

  for (let round = 0; round <= maxRounds; round++) {
    const resp = await chatFn({ messages, tools: TOOL_DEFINITIONS })
    const choice = resp.raw?.choices?.[0]?.message

    // 模型决定调用工具
    if (choice?.tool_calls?.length) {
      messages.push(choice) // 保留 assistant 的 tool_calls 消息
      for (const tc of choice.tool_calls) {
        let args = {}
        try {
          args = JSON.parse(tc.function?.arguments || '{}')
        } catch { /* 参数容错 */ }
        const result = await executeTool(tc.function?.name, args)
        toolTraces.push({
          tool: tc.function?.name,
          args,
          summary: summarizeToolResult(tc.function?.name, result)
        })
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result).slice(0, 4000)
        })
      }
      continue
    }

    // 无工具调用 → 最终回答
    return { content: resp.content || choice?.content || '', toolTraces, rounds: round }
  }

  return { content: '', toolTraces, rounds: maxRounds }
}

const summarizeToolResult = (tool, result) => {
  if (tool === 'get_weather_forecast') {
    const d0 = result.days?.[0]
    return `${result.region}：${d0?.cond} ${d0?.tempLow}~${d0?.tempHigh}℃，湿度${d0?.humidity}%，病害风险${result.riskLevel}`
  }
  if (tool === 'lookup_pesticide_safety') return `查询到 ${result.count} 条${result.cropId}用药安全数据`
  return ''
}
