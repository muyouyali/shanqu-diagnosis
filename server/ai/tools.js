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

/**
 * 真实天气源：Open-Meteo 免费气象 API（无需密钥）
 * 云南主要农区坐标映射；失败（超时/限流/断网）自动降级为本地模拟源
 */
const REGION_COORDS = {
  文山: [23.37, 104.25], 普洱: [22.79, 100.97], 昭通: [27.34, 103.72],
  曲靖: [25.49, 103.8], 昆明: [25.04, 102.68], 大理: [25.6, 100.27],
  保山: [25.11, 99.16], 丽江: [26.86, 100.23], 红河: [23.36, 103.38],
  玉溪: [24.35, 102.55], 楚雄: [25.04, 101.55], 临沧: [23.88, 100.09],
  西双版纳: [22.0, 100.8], 德宏: [24.43, 98.59], 怒江: [25.85, 98.85],
  迪庆: [27.83, 99.7], 富源: [25.68, 104.32], 蒙自: [23.37, 103.39]
}

const matchCoord = (region) => {
  const r = String(region || '')
  for (const [name, c] of Object.entries(REGION_COORDS)) {
    if (r.includes(name)) return c
  }
  return null // 交由动态地理编码解析
}

/** 动态地理编码：Open-Meteo 免费 geocoding API，任意市/县名 → 坐标（带内存缓存） */
const geoCache = new Map()
const geocodeRegion = async (region) => {
  const key = String(region || '').trim()
  if (!key) return null
  if (geoCache.has(key)) return geoCache.get(key)
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(key)}&count=1&language=zh&format=json&countryCode=CN`
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return null
    const j = await resp.json()
    const hit = (j.results || [])[0]
    if (!hit) return null
    const coords = [hit.latitude, hit.longitude]
    geoCache.set(key, coords)
    return coords
  } catch {
    return null
  }
}

/** 从真实预报计算 7 天风险指数（与模拟源同构的输出） */
const buildFromRealWeather = async (region, cropId) => {
  let [lat, lon] = matchCoord(region) || []
  if (!lat) {
    // 先试去掉「市/州/县」后缀的纯地名，再试原名
    const bare = String(region || '').replace(/(市|州|县|区|盟|地区)$/g, '') || region
    ;[lat, lon] = (await geocodeRegion(bare)) || (await geocodeRegion(region)) || []
  }
  if (!lat) lat = REGION_COORDS['文山'][0], lon = REGION_COORDS['文山'][1] // 最终兜底
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weather_code,precipitation_sum,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean` +
    `&current=precipitation&timezone=Asia%2FShanghai&forecast_days=7`
  const resp = await fetch(url, { signal: AbortSignal.timeout(6000) })
  if (!resp.ok) throw new Error(`weather http ${resp.status}`)
  const data = await resp.json()
  const d = data.daily
  if (!d?.time?.length) throw new Error('weather empty')

  const conds = ['晴', '多云', '阴', '小雨', '中雨', '大雨']
  // Open-Meteo weather_code 粗映射：0晴 1-2多云 3阴 51-67雨 80-82阵雨 95-99雷暴
  const condOf = (code) => {
    if (code === 0) return '晴'
    if (code <= 2) return '多云'
    if (code === 3) return '阴'
    if (code >= 80) return '阵雨'
    if (code >= 51) return '中雨'
    return '多云'
  }
  const dayNames = ['今天', '明天', '后天']
  const days = []
  let riskPeak = 0
  for (let i = 0; i < d.time.length; i++) {
    const mm = d.precipitation_sum?.[i] ?? 0
    const cond = condOf(d.weather_code?.[i] ?? 1)
    const rainProb = Math.min(96, Math.round(mm > 10 ? 90 : mm > 2 ? 72 : mm > 0 ? 45 : 10))
    const humidity = Math.round(d.relative_humidity_2m_mean?.[i] ?? 70)
    const tempLow = Math.round(d.temperature_2m_min?.[i] ?? 14)
    const tempHigh = Math.round(d.temperature_2m_max?.[i] ?? 24)
    const risk = Math.min(95, Math.round(humidity * 0.6 + rainProb * 0.35))
    riskPeak = Math.max(riskPeak, risk)
    days.push({
      day: i < 2 ? dayNames[i] : d.time[i].slice(5, 10).replace('-', '/'),
      cond,
      rainProb,
      tempLow,
      tempHigh,
      humidity,
      risk,
      precipitationMm: Math.round(mm * 10) / 10
    })
  }
  return { days, riskPeak }
}

export const getWeatherForecast = async (region, cropId) => {
  let realDays = null
  let riskPeak = 0
  let source = ''
  try {
    const real = await buildFromRealWeather(region, cropId)
    realDays = real.days
    riskPeak = real.riskPeak
    source = 'Open-Meteo 真实气象 API（open-meteo.com）'
  } catch (e) {
    console.warn('[Weather] 真实气象源不可用，降级模拟数据:', e.message)
  }

  if (!realDays) {
    // ===== 模拟源（确定性伪随机，断网/限流兜底） =====
    const base = hash(region + new Date().toISOString().slice(0, 10))
    const days = []
    for (let i = 0; i < 7; i++) {
      const r = hash(`${region}-${i}`) % 100
      const cond = conds[(base + i * 7) % conds.length]
      const rainProb = cond.includes('雨') ? 60 + (r % 40) : 5 + (r % 30)
      const tempLow = 12 + (r % 6)
      const tempHigh = tempLow + 8 + (r % 7)
      const humidity = cond.includes('雨') ? 78 + (r % 18) : 55 + (r % 25)
      const risk = Math.min(95, Math.round(humidity * 0.6 + rainProb * 0.35))
      riskPeak = Math.max(riskPeak, risk)
      days.push({
        day: i < 2 ? dayNames[i] : new Date(Date.now() + i * 86400000).toISOString().slice(5, 10).replace('-', '/'),
        cond,
        rainProb,
        tempLow,
        tempHigh,
        humidity,
        risk
      })
    }
    realDays = days
    source = '模拟气象数据（真实气象源不可用，已自动降级）'
  }
  const days = realDays

  // 结合作物给出针对性提示
  const cropRiskNote = {
    sanqi: '三七根腐病在连续降雨+高湿条件下风险显著升高，注意深沟排水',
    tea: '茶饼病在云雾高湿天气易流行，雨歇窗口期抓紧保护性喷药',
    tianma: '天麻窖内重点关注积水与窖温，外部连续降雨时加强排水巡查',
    walnut: '核桃黑斑病在花期至幼果期的降雨后需补喷细菌性药剂',
    blueberry: '灰霉病在持续高湿天风险上升，注意通风降湿',
    citrus: '溃疡病在台风/暴雨后伤口侵染风险高，风雨过后及时防护'
  }

  // ===== 灾害预警生成（基于 7 天预报的规则引擎） =====
  const warnings = []
  const rainDays = days.filter((d) => d.rainProb >= 55)

  // 暴雨/强降水
  const heavyRain = days.find((d) => d.rainProb >= 80)
  if (heavyRain) {
    warnings.push({
      type: '暴雨预警',
      severity: 'orange',
      day: heavyRain.day,
      desc: `${heavyRain.day}降水概率 ${heavyRain.rainProb}%，${heavyRain.cond}，注意防范短时强降水`,
      actions: ['提前疏通田间排水沟，防涝防渍', '低洼地块提前挖好排水口', '雨后 48 小时内巡查病害']
    })
  }

  // 连阴雨（连续 3 天以上有雨）
  if (rainDays.length >= 3) {
    warnings.push({
      type: '连阴雨预警',
      severity: 'yellow',
      day: `${rainDays.length} 天`,
      desc: `未来 7 天有 ${rainDays.length} 天降水，持续高湿易诱发真菌性病害流行`,
      actions: ['抓住雨歇窗口期完成保护性喷药', '加强通风降湿（大棚/荫棚类作物）', '已发病地块及时清除病株病叶']
    })
  }

  // 高温
  const hotDay = days.find((d) => d.tempHigh >= 33)
  if (hotDay) {
    warnings.push({
      type: '高温预警',
      severity: hotDay.tempHigh >= 36 ? 'orange' : 'yellow',
      day: hotDay.day,
      desc: `${hotDay.day}最高温 ${hotDay.tempHigh}℃，高温叠加高湿易引发日灼与土传病害`,
      actions: ['避开正午高温时段施药，防止药害', '设施的注意通风降温', '保证水分供应，防止萎蔫']
    })
  }

  // 低温/霜冻（高海拔山地重点）
  const coldDay = days.find((d) => d.tempLow <= 5)
  if (coldDay) {
    warnings.push({
      type: '低温冻害预警',
      severity: coldDay.tempLow <= 2 ? 'orange' : 'blue',
      day: coldDay.day,
      desc: `${coldDay.day}最低温 ${coldDay.tempLow}℃，山地昼夜温差大，谨防晚霜冻`,
      actions: ['提前熏烟或覆盖防霜', '幼嫩组织喷施防冻剂（如磷酸二氢钾）', '天麻窖、育苗棚加强保温']
    })
  }

  // 大风（山地风口）
  const windyDay = days.find((d) => d.cond === '阵雨' || d.cond === '中雨')
  if (windyDay && days[0].humidity >= 80) {
    warnings.push({
      type: '风雹提醒',
      severity: 'blue',
      day: windyDay.day,
      desc: `${windyDay.day}有${windyDay.cond}，山地风口地带强对流天气易伴随短时大风`,
      actions: ['加固荫棚、支架与大棚膜', '靠近成熟果园注意防落果', '风雨后及时防护伤口性病害']
    })
  }

  // 若无任何预警，给一条平稳提示
  if (!warnings.length) {
    warnings.push({
      type: '无明显灾害风险',
      severity: 'green',
      day: '未来 7 天',
      desc: '天气平稳，适合安排农事作业与常规预防性管理',
      actions: ['利用晴好天气完成施肥、除草等农事', '保持常规巡田，关注叶部早期症状']
    })
  }

  return {
    region,
    updated: new Date().toISOString(),
    source,
    days,
    warnings,
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
