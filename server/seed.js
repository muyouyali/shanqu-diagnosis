/**
 * 演示种子数据生成器
 *
 * 目的：答辩现场打开管理后台即刻有数据可视化效果，避免"空白看板"的尴尬。
 * 数据按真实病害分布规律构造：雨季集中、区域差异、作物交叉。
 * 明确标注 isDemo 字段，避免与真实数据混淆（数据真实性也是评审关注点）。
 */

import { DISEASES } from './kb/diseases.js'

const REGIONS = [
  '文山市', '砚山县', '丘北县', '广南县', '马关县',
  '蒙自市', '建水县', '石屏县', '泸西县', '弥勒市',
  '玉溪红塔区', '通海县', '华宁县'
]

const CROP_REGION_AFFINITY = {
  sanqi: ['文山市', '砚山县', '丘北县', '广南县', '马关县'],
  blueberry: ['蒙自市', '建水县', '石屏县', '玉溪红塔区', '通海县'],
  citrus: ['弥勒市', '泸西县', '华宁县', '建水县', '石屏县']
}

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)]
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

/**
 * 病害发生概率权重：模拟真实流行规律
 * 根腐病/疫病在雨季高发，缺素症全年均可发生
 */
const DISEASE_WEIGHT = {
  'sq-root-rot': 26,
  'sq-blught': 18,
  'sq-black-spot': 14,
  'sq-grey-mold': 8,
  'sq-nutrient': 12,
  'bb-grey-mold': 22,
  'bb-stem-blight': 12,
  'bb-mummy': 9,
  'bb-chlorosis': 18,
  'bb-leaf-spot': 7,
  'ct-hlb': 9,
  'ct-canker': 20,
  'ct-anthracnose': 16,
  'ct-mite': 21,
  'ct-leafminer': 14
}

const weightedPick = () => {
  const pool = []
  for (const d of DISEASES) {
    const w = DISEASE_WEIGHT[d.id] || 5
    for (let i = 0; i < w; i++) pool.push(d)
  }
  return rand(pool)
}

const buildOne = (daysAgo) => {
  const d = weightedPick()
  const cropId = d.cropId

  // 置信度按病害类型浮动：典型症状高、生理性/疑难病低
  let base = 0.78
  if (d.type.includes('生理性')) base = 0.66
  if (d.id === 'ct-hlb') base = 0.62
  if (d.severity === 'critical') base = 0.64
  const confidence = Number(Math.min(0.96, Math.max(0.35, base + (Math.random() - 0.5) * 0.28)).toFixed(2))
  const confidenceLevel = confidence >= 0.65 ? 'high' : confidence >= 0.4 ? 'medium' : 'low'

  const region = rand(CROP_REGION_AFFINITY[cropId])
  const createdAt = new Date(Date.now() - daysAgo * 86400000 - randInt(0, 86400) * 1000)

  const altRange = cropId === 'sanqi' ? [1400, 1900] : cropId === 'blueberry' ? [1600, 2100] : [900, 1500]

  return {
    id: 0,
    isDemo: true,
    userId: `demo-user-${randInt(1, 12)}`,
    cropId,
    cropName: { sanqi: '文山三七', blueberry: '高原蓝莓', citrus: '柑橘' }[cropId],
    region,
    altitude: `${randInt(altRange[0], altRange[1])}m`,
    weather: rand(['连续降雨', '晴转多云', '高温干旱', '阴雨连绵', '晴']),
    stage: rand(['苗期', '生长期', '开花期', '结果期', '采收期']),
    area: rand(['零星几株', '约 0.5 亩', '约 1-2 亩', '超过 3 亩']),
    diagnosis: {
      observations: `叶片出现${d.symptomKeywords[0]}、${d.symptomKeywords[1] || '异常'}等症状`,
      results: [
        {
          name: d.name,
          confidence,
          confidenceLevel,
          symptomMatch: d.symptomKeywords.slice(0, 3),
          differential: '',
          urgency: d.severity === 'critical' || d.severity === 'high' ? 'immediate' : 'within3days',
          inKnowledgeBase: true
        }
      ],
      noticed: [],
      needMoreInfo: '',
      isPhysiological: d.type.includes('生理性'),
      quarantineAlert: d.id === 'ct-hlb'
    },
    gate: {
      flags: confidence < 0.4 ? [{ type: 'low_confidence', level: 'warning' }] : [],
      needHumanReview: confidence < 0.4 || d.id === 'ct-hlb',
      decision: confidence < 0.4 || d.id === 'ct-hlb' ? 'escalate' : 'proceed'
    },
    treatment: {
      summary: '先清除病残体，再针对性用药',
      immediateActions: [],
      nonChemical: [],
      chemicalPlan: [],
      safetyWarnings: ['严格执行安全间隔期'],
      followUp: '',
      needExpert: d.severity === 'critical'
    },
    createdAt: createdAt.toISOString()
  }
}

export const seedRecords = () => {
  const records = []
  // 近 30 天，模拟每日 3-9 条，雨季（近期）略高
  for (let day = 29; day >= 0; day--) {
    const seasonalBoost = day < 12 ? 1.5 : 1
    const count = Math.round(randInt(3, 8) * seasonalBoost)
    for (let i = 0; i < count; i++) {
      records.push(buildOne(day))
    }
  }
  records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  records.forEach((r, i) => (r.id = records.length - i))

  return {
    records,
    consultations: [],
    nextId: records.length + 1
  }
}
