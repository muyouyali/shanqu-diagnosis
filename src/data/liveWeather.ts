/**
 * 前端实时天气兜底（与后端 server/ai/tools.js 同构）
 * 线上静态托管无 Node 后端时，直接浏览器端请求 Open-Meteo 免费气象 API，
 * 保证切换地区后天气立即跟着变，且为真实数据而非演示数据。
 */
import type { WeatherData, WeatherDay } from '@/types'
import { CITY_SPECIALTY } from '@/data/cityCrops'

/** 云南主要农区坐标（县市级，精度足够做天气展示） */
const CITY_COORDS: Record<string, [number, number]> = {
  昆明市: [25.04, 102.68],
  文山市: [23.37, 104.25],
  昭通市: [27.34, 103.72],
  曲靖市: [25.49, 103.8],
  玉溪市: [24.35, 102.55],
  保山市: [25.11, 99.16],
  丽江市: [26.86, 100.23],
  普洱市: [22.79, 100.97],
  临沧市: [23.88, 100.09],
  楚雄州: [25.04, 101.55],
  红河州: [23.36, 103.38],
  文山州: [23.37, 104.25],
  西双版纳州: [22.0, 100.8],
  大理州: [25.6, 100.27],
  德宏州: [24.43, 98.59],
  怒江州: [25.85, 98.85],
  迪庆州: [27.83, 99.7],
  蒙自市: [23.37, 103.39],
  大理市: [25.6, 100.27],
  楚雄市: [25.04, 101.55],
  景洪市: [22.01, 100.79],
  芒市: [24.43, 98.59],
  个旧市: [23.36, 103.15],
  开远市: [23.71, 103.26],
  宣威市: [26.22, 104.1],
  安宁市: [24.92, 102.48],
  弥勒市: [24.41, 103.44],
  瑞丽市: [24.01, 97.85],
  香格里拉: [27.83, 99.7],
  腾冲市: [25.02, 98.49]
}

/** 地名归一：去后缀取主干，便于宽松匹配 */
const bare = (s: string) => String(s || '').replace(/(市|州|县|区|盟|地区)$/g, '')

const LOCAL_COORDS: Record<string, [number, number]> = {}
for (const [k, v] of Object.entries(CITY_COORDS)) LOCAL_COORDS[bare(k)] = v

/** 静态坐标匹配 */
const staticCoord = (region: string): [number, number] | null => {
  if (CITY_COORDS[region]) return CITY_COORDS[region]
  const b = bare(region)
  if (LOCAL_COORDS[b]) return LOCAL_COORDS[b]
  for (const [k, v] of Object.entries(LOCAL_COORDS)) {
    if (b.includes(k) || k.includes(b)) return v
  }
  return null
}

const geoCache = new Map<string, { coord: [number, number]; name: string } | null>()

/** 动态地理编码：任意县市名 → 坐标 + 实际解析地名 */
const geocode = async (
  region: string
): Promise<{ coord: [number, number]; name: string } | null> => {
  const key = bare(region)
  if (!key) return null
  if (geoCache.has(key)) return geoCache.get(key)!
  try {
    const url =
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(key)}` +
      `&count=1&language=zh&format=json&countryCode=CN`
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error('geo http')
    const j = await r.json()
    const hit = (j.results || [])[0]
    const c = hit ? { coord: [hit.latitude, hit.longitude] as [number, number], name: hit.name || key } : null
    geoCache.set(key, c)
    return c
  } catch {
    return null
  }
}

const condOf = (code: number) => {
  if (code === 0) return '晴'
  if (code <= 2) return '多云'
  if (code === 3) return '阴'
  if (code >= 95) return '雷阵雨'
  if (code >= 80) return '阵雨'
  if (code >= 51) return '中雨'
  return '多云'
}

const CROP_NOTE: Record<string, string> = {
  sanqi: '三七根腐病在连续降雨 + 高湿条件下风险显著升高，注意深沟排水、避免积水',
  tea: '茶园高湿易发炭疽病与小绿叶蝉，建议清晨巡园、及时采摘通风',
  coffee: '咖啡锈病随湿度上升传播加快，雨后注意叶背病斑检查',
  apple: '苹果腐烂病在低温高湿时扩展，注意刮治与伤口保护',
  potato: '马铃薯晚疫病预警期，连续阴雨前预防性喷药',
  pomegranate: '石榴干腐病与实蝇需同步防控，雨后及时清理落果',
  walnut: '核桃炭疽病在雨季多发，注意果园通风与排水',
  citrus: '柑橘溃疡病借风雨传播，大风降雨后重点喷施保护剂'
}

/** 风险说明：把峰值指数翻译成农事建议 */
const riskText = (peak: number) =>
  peak >= 75 ? '高湿多雨，病害流行风险偏高' : peak >= 55 ? '湿度中等，注意田间通风' : '天气平稳，病害风险较低'

/**
 * 拉取真实天气（失败返回 null，交由调用方走原逻辑）
 * 输出结构与后端 /api/weather 兼容
 */
export const fetchRealWeather = async (
  region: string,
  cropId?: string
): Promise<WeatherData | null> => {
  if (!region) return null
  const hit = staticCoord(region)
    ? { coord: staticCoord(region)!, name: region }
    : await geocode(region)
  if (!hit) return null
  const [lat, lon] = hit.coord
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&daily=weather_code,precipitation_sum,temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean` +
      `&timezone=Asia%2FShanghai&forecast_days=7`
    const r = await fetch(url, { signal: AbortSignal.timeout(7000) })
    if (!r.ok) throw new Error('weather http')
    const j = await r.json()
    const d = j.daily
    if (!d?.time?.length) throw new Error('weather empty')

    const dayNames = ['今天', '明天', '后天']
    const fmtDate = (iso: string) => {
      const [, m, day] = iso.split('-')
      return `${Number(m)}/${Number(day)}`
    }
    let riskPeak = 0
    const days: WeatherDay[] = d.time.map((iso: string, i: number): WeatherDay => {
      const mm = d.precipitation_sum?.[i] ?? 0
      const cond = condOf(d.weather_code?.[i] ?? 1)
      const rainProb = Math.min(96, Math.round(mm > 10 ? 90 : mm > 2 ? 72 : mm > 0 ? 45 : 10))
      const humidity = Math.round(d.relative_humidity_2m_mean?.[i] ?? 70)
      const tempLow = Math.round(d.temperature_2m_min?.[i] ?? 14)
      const tempHigh = Math.round(d.temperature_2m_max?.[i] ?? 24)
      const risk = Math.min(95, Math.round(humidity * 0.6 + rainProb * 0.35))
      riskPeak = Math.max(riskPeak, risk)
      return {
        day: i < 2 ? dayNames[i] : fmtDate(iso),
        cond,
        rainProb,
        tempLow,
        tempHigh,
        humidity,
        risk,
        precipitationMm: Math.round(mm * 10) / 10
      }
    })

    const level = riskPeak >= 75 ? 'high' : riskPeak >= 55 ? 'medium' : 'low'
    // 病害气象预警：按作物 + 未来天气给出具体预防动作（字段与详情弹窗渲染对齐）
    const rainyDays = days.filter((d) => d.rainProb >= 45).length
    const humidDays = days.filter((d) => d.humidity >= 75).length
    // 未选作物时，跟随地区主推作物生成提示（如普洱市 → 茶树）
  const effectiveCrop = cropId || CITY_SPECIALTY[region]?.[0]
  const cropTip = CROP_NOTE[effectiveCrop || ''] || ''
    const baseActions = [
      rainyDays >= 3 ? '未来一周有多个降雨日，雨前喷施保护性杀菌剂' : '降雨较少，按常规 schedule 巡园即可',
      '雨后 24 小时内重点巡查低洼积水处，及时清沟排水',
      humidDays >= 3 ? '连续高湿天气，加大株行间通风（修剪过密枝叶）' : '保持田间通风，避免过度密植'
    ]
    if (cropTip) baseActions.unshift(cropTip)

    const warnings = [
      {
        type: riskPeak >= 55 ? '病害气象预警' : '天气平稳',
        severity: (riskPeak >= 75 ? 'orange' : riskPeak >= 55 ? 'yellow' : 'green') as
          | 'orange'
          | 'yellow'
          | 'green',
        day: days.findIndex((d) => d.risk === riskPeak) >= 0
          ? days[days.findIndex((d) => d.risk === riskPeak)].day
          : '未来 7 天',
        desc:
          riskPeak >= 75
            ? `${region}未来 7 天峰值病害风险指数 ${riskPeak}（偏高）：${rainyDays} 个降雨日、最高湿度 ${Math.max(...days.map((d) => d.humidity))}%，高湿多雨极易诱发病害流行`
            : riskPeak >= 55
              ? `${region}未来 7 天峰值病害风险指数 ${riskPeak}（中等）：${riskText(riskPeak)}，注意提前预防`
              : `${region}未来 7 天天气平稳，峰值风险指数 ${riskPeak}，病害流行风险较低`,
        content: undefined,
        actions: baseActions
      }
    ]

    return {
      region: hit.name,
      resolvedCoord: `${lat.toFixed(2)},${lon.toFixed(2)}`,
      days,
      riskLevel: level,
      riskPeak,
      cropNote:
        CROP_NOTE[effectiveCrop || ''] || '关注持续降雨与高湿天气，提前清沟排水、减少病害侵染机会',
      warnings,
      source: 'Open-Meteo 实时气象（open-meteo.com）'
    } as WeatherData
  } catch {
    return null
  }
}
