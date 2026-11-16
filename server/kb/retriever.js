/**
 * 轻量 RAG 检索引擎
 *
 * 设计取舍（面向省赛演示环境的工程现实）：
 * 1. 不依赖外部向量数据库——避免现场网络/依赖故障导致演示崩盘
 * 2. 采用 BM25 排序 + 中文二元切分，无需引入重型分词词典
 * 3. 通过"领域同义词扩展 + 字段权重"弥补纯词频检索的语义短板
 *
 * 该实现可无缝替换为向量检索：只需实现相同的 retrieve() 接口，
 * 上层 Agent 无需改动（见 docs 中的"检索层可替换设计"说明）。
 */

import { DISEASES, PESTICIDE_SAFETY, getDiseaseById } from './diseases.js'

// ============ 中文分词：二元切分 + 单字兜底 ============
// 面向农业短查询，二元切分的召回率优于依赖词典的分词器，
// 且无需维护烟囱式的用户词典。
const STOP_CHARS = new Set([
  '的', '了', '是', '在', '和', '与', '或', '有', '我', '你', '他',
  '这', '那', '什', '么', '怎', '样', '如', '何', '为', '吗', '呢',
  '把', '被', '给', '对', '从', '到', '就', '都', '也', '还', '又'
])

const tokenize = (text) => {
  if (!text) return []
  const clean = String(text)
    .toLowerCase()
    .replace(/[\s\r\n\t，。！？、；：""''（）()\[\]【】《》〈〉\-—_,.;:!?"'`~@#$%^&*+=|\\/<>]+/g, '')
  const tokens = []
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    if (STOP_CHARS.has(ch)) continue
    // 二元组
    if (i < clean.length - 1) {
      tokens.push(clean.slice(i, i + 2))
    }
    // 单字（低权重由 BM25 的 IDF 自然调节）
    tokens.push(ch)
  }
  return tokens
}

// ============ 领域同义词扩展 ============
// 农户口语与专业术语之间存在鸿沟，扩展词表是提升召回的关键。
const SYNONYMS = {
  烂根: ['根腐', '腐烂', '根腐病'],
  黄叶: ['黄化', '失绿', '发黄', '缺素'],
  叶子黄: ['黄化', '失绿', '缺素'],
  叶子发黄: ['黄化', '失绿', '缺素'],
  斑点: ['病斑', '褐斑', '黑斑'],
  长斑: ['病斑', '褐斑'],
  霉: ['霉层', '灰霉', '霉菌'],
  长毛: ['霉层', '灰霉'],
  白色粉末: ['白粉', '霉层'],
  枯萎: ['萎蔫', '枯死', '凋萎'],
  蔫了: ['萎蔫', '下垂'],
  死苗: ['枯死', '死株', '根腐'],
  倒伏: ['茎基腐', '倒状'],
  虫子: ['虫害', '螨', '虫'],
  小虫: ['蚜虫', '螨', '木虱'],
  红点: ['红蜘蛛', '螨'],
  卷叶: ['卷曲', '潜叶'],
  洞: ['穿孔', '虫道'],
  青果: ['黄龙病', '不转色'],
  不转色: ['黄龙病', '着色异常'],
  红鼻子: ['黄龙病', '红鼻子果'],
  果子小: ['果实小', '畸形果'],
  水渍: ['水渍状', '软腐'],
  开水烫: ['疫病', '软腐'],
  发臭: ['腥臭', '腐烂'],
  农药: ['药剂', '用药'],
  用什么药: ['用药', '药剂', '防治'],
  怎么治: ['防治', '治疗'],
  预防: ['防治', '预防措施'],
  传染: ['传播', '侵染'],
  土: ['土壤', '地块'],
  海拔: ['山地', '高原'],
  雨季: ['多雨', '高湿'],
  大棚: ['荫棚', '设施']
}

const expandQuery = (query) => {
  const q = String(query)
  const extra = []
  for (const [key, words] of Object.entries(SYNONYMS)) {
    if (q.includes(key)) extra.push(...words)
  }
  return extra.join(' ')
}

// ============ 构建检索语料 ============
/**
 * 每条文档 = 一个病害条目，字段带权重（权重通过重复文本模拟）
 * 这种做法的优点是零依赖，且权重含义直观可调。
 */
const buildDocs = () => {
  return DISEASES.map((d) => {
    const fields = [
      // 名称权重最高
      { text: `${d.name} ${d.name} ${d.name} ${d.alias || ''} ${d.alias || ''}`, w: 1 },
      { text: `${d.type} ${d.pathogen}`, w: 1 },
      { text: (d.symptomKeywords || []).join(' ') + ' ' + (d.symptomKeywords || []).join(' '), w: 1 },
      { text: (d.symptoms || []).join(' '), w: 1 },
      { text: (d.causes || []).join(' '), w: 1 },
      { text: (d.treatment || []).join(' '), w: 1 },
      { text: (d.prevention || []).join(' '), w: 1 },
      { text: d.safetyNote || '', w: 1 }
    ]
    const fullText = fields.map((f) => f.text).join(' ')
    const tokens = tokenize(fullText)
    return {
      id: d.id,
      cropId: d.cropId,
      disease: d,
      tokens,
      len: tokens.length,
      fullText
    }
  })
}

const DOCS = buildDocs()

// ============ BM25 参数 ============
const K1 = 1.5
const B = 0.75

const buildStats = (docs) => {
  const df = new Map()
  let totalLen = 0
  for (const doc of docs) {
    const seen = new Set(doc.tokens)
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1)
    totalLen += doc.len
  }
  return {
    df,
    avgLen: docs.length ? totalLen / docs.length : 0,
    N: docs.length
  }
}

let stats = buildStats(DOCS)

const idf = (term) => {
  const df = stats.df.get(term) || 0
  return Math.log(1 + (stats.N - df + 0.5) / (df + 0.5))
}

/**
 * 主检索接口
 * @param {string} query 用户自然语言查询
 * @param {object} opts { cropId, topK, minScore }
 * @returns {Array} 命中结果，含 score 与 scoreNormalized
 */
export const retrieve = (query, opts = {}) => {
  const { cropId = null, topK = 5, minScore = 0.01 } = opts
  const expanded = expandQuery(query)
  const qTokens = tokenize(`${query} ${expanded}`)

  if (!qTokens.length) return []

  // 候选集：若指定作物则只在作物范围内检索（提升精确率）
  const candidates = cropId ? DOCS.filter((d) => d.cropId === cropId) : DOCS
  const candStats = cropId ? buildStats(candidates) : stats

  const scored = candidates.map((doc) => {
    let score = 0
    const tfMap = new Map()
    for (const t of doc.tokens) tfMap.set(t, (tfMap.get(t) || 0) + 1)

    for (const qt of new Set(qTokens)) {
      const tf = tfMap.get(qt) || 0
      if (!tf) continue
      const dfv = candStats.df.get(qt) || 0
      const idfVal = Math.log(1 + (candStats.N - dfv + 0.5) / (dfv + 0.5))
      const denom = tf + K1 * (1 - B + (B * doc.len) / (candStats.avgLen || 1))
      score += idfVal * ((tf * (K1 + 1)) / (denom || 1))
    }

    // 作物名直接命中加成（用户通常会说"三七的黄叶"）
    const cropHint = doc.disease.cropId
    const qLower = String(query).toLowerCase()
    if (
      (cropHint === 'sanqi' && /三七|田七/.test(qLower)) ||
      (cropHint === 'blueberry' && /蓝莓|越橘/.test(qLower)) ||
      (cropHint === 'citrus' && /柑橘|橘子|橙子|沃柑|蜜柑/.test(qLower))
    ) {
      score *= 1.35
    }

    // 病害名直接出现在查询中，强加成（用户已知道名字在问细节）
    if (String(query).includes(doc.disease.name)) score *= 2.2

    return { ...doc, score }
  })

  const maxScore = Math.max(...scored.map((s) => s.score), 0.0001)

  return scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => ({
      id: s.id,
      cropId: s.cropId,
      score: Number(s.score.toFixed(4)),
      scoreNormalized: Number((s.score / maxScore).toFixed(4)),
      disease: s.disease
    }))
}

/**
 * 组装 RAG 上下文（供 Prompt 注入）
 * 控制 token 预算：只注入 topK 的精华字段
 */
export const buildContext = (query, opts = {}) => {
  const hits = retrieve(query, opts)
  if (!hits.length) return { context: '', hits: [], hasEvidence: false }

  const context = hits
    .map((h, i) => {
      const d = h.disease
      return [
        `【资料${i + 1}】${d.name}（${d.type}）`,
        `典型症状：${d.symptoms.slice(0, 3).join('；')}`,
        `发病原因：${d.causes.slice(0, 2).join('；')}`,
        `防治措施：${d.treatment.slice(0, 3).join('；')}`,
        `安全提示：${d.safetyNote}`,
        `资料来源：${(d.references || []).join('、')}`
      ].join('\n')
    })
    .join('\n\n')

  return { context, hits, hasEvidence: true }
}

/**
 * 农药安全数据检索（用于用药 Agent 的硬约束校验）
 */
export const retrievePesticide = (query, cropId) => {
  const q = String(query)
  const pool = cropId ? PESTICIDE_SAFETY.filter((p) => p.cropId === cropId) : PESTICIDE_SAFETY
  const tokens = new Set(tokenize(q))

  const scored = pool.map((p) => {
    let score = 0
    const text = `${p.chemical} ${p.target.join(' ')} ${p.note}`
    const ptokens = tokenize(text)
    for (const t of ptokens) if (tokens.has(t)) score += 1
    // 靶标病害直接命中
    for (const t of p.target) if (q.includes(t)) score += 5
    if (q.includes(p.chemical)) score += 8
    return { ...p, score }
  })

  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)
}

/**
 * 低置信度兑底：按症状关键词的规则匹配，作为大模型不可用时的降级路径
 * 这让系统在 API 故障时依然能给出方向性判断，符合"演示不崩"的工程要求。
 */
export const ruleBasedDiagnose = (cropId, textFeatures) => {
  // auto/空：不限单一作物，规则引擎遍历全库
  const pool = cropId && cropId !== 'auto' ? DISEASES.filter((d) => d.cropId === cropId) : DISEASES
  const tokens = new Set(tokenize(textFeatures || ''))

  const scored = pool.map((d) => {
    let hit = 0
    let total = 0
    for (const kw of d.symptomKeywords || []) {
      total++
      const kws = tokenize(kw)
      if (kws.some((k) => tokens.has(k))) hit++
    }
    const ratio = total ? hit / total : 0
    return { disease: d, matched: hit, ratio }
  })

  return scored
    .filter((s) => s.ratio > 0)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 3)
    .map((s) => ({
      diseaseId: s.disease.id,
      name: s.disease.name,
      confidence: Number((0.35 + s.ratio * 0.4).toFixed(2)),
      basis: `症状关键词命中 ${s.matched} 项：${(s.disease.symptomKeywords || []).slice(0, 4).join('、')}`
    }))
}

export const getDocCount = () => DOCS.length
export const getById = (id) => getDiseaseById(id)
export { tokenize, expandQuery }

/**
 * 社区共建条目动态注册：
 * 农户提交的病害样本经专家审核通过后，以知识库条目形式并入检索语料，
 * 让 RAG 问答 / 病害图谱即时可见（闭环：提交 → 审核 → 入库 → 可检索）。
 * 服务器重启后由 index.js 启动钩子按持久化的样本重新注册。
 */
export const registerCommunityDiseases = (entries) => {
  let added = 0
  for (const d of entries || []) {
    if (!d || !d.id || !d.name) continue
    if (DOCS.some((doc) => doc.id === d.id)) continue // 幂等：重复注册跳过
    const fields = [
      { text: `${d.name} ${d.name} ${d.name} ${d.alias || ''} ${d.alias || ''}`, w: 1 },
      { text: `${d.type || ''} ${d.pathogen || ''}`, w: 1 },
      { text: (d.symptomKeywords || []).join(' ') + ' ' + (d.symptomKeywords || []).join(' '), w: 1 },
      { text: (d.symptoms || []).join(' '), w: 1 },
      { text: (d.causes || []).join(' '), w: 1 },
      { text: (d.treatment || []).join(' '), w: 1 },
      { text: (d.prevention || []).join(' '), w: 1 },
      { text: d.safetyNote || '', w: 1 }
    ]
    const fullText = fields.map((f) => f.text).join(' ')
    const tokens = tokenize(fullText)
    DOCS.push({ id: d.id, cropId: d.cropId, disease: d, tokens, len: tokens.length, fullText })
    added++
  }
  if (added) stats = buildStats(DOCS)
  return added
}
