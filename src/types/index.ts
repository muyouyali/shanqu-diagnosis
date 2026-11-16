export interface Crop {
  id: string
  name: string
  alias: string
  emoji: string
  latin: string
  tagline: string
  color: string
  altitude: string
  season: string
  intro: string
  keyPoints: string[]
  diseaseCount?: number
  /** 适种省份（用于本地作物识别） */
  regions?: string[]
  /** 是否可走完整诊断流程（知识库作物为 true） */
  diagnosable?: boolean
  /** 是否属于当前所选地区主栽（后端按州市白名单判定） */
  local?: boolean
  /** 数据来源：知识库 / 地区百科 / 用户共建 */
  source?: 'kb' | 'atlas' | 'community'
  /** 百科作物的简介 */
  desc?: string
  /** 百科作物的主要病虫害（文字描述） */
  pests?: string
}

/** 登录用户 */
export interface User {
  id: number
  account: string
  nickname: string
  role: 'user' | 'expert'
  phone: string
  email: string
  wechatId: string
  avatar: string
  region: string
  title?: string
  specialty?: string[]
  createdAt: string
}

/** 专家（含擅长领域与推荐匹配度） */
export interface Expert extends User {
  match: number
  hitCrop: boolean
  hitRegion: boolean
}

/** 农户 → 专家咨询单 */
export interface Consult {
  id: number
  userId: number
  userName: string
  expertId: number
  cropId: string | null
  region: string
  question: string
  status: 'pending' | 'done'
  reply: string
  createdAt: string
}

/** 人工复核请求 */
export interface ReviewRequest {
  id: number
  userId: number
  userName: string
  recordId: number
  cropId: string | null
  region: string
  question: string
  /** 工单扩展字段（步骤 B：复核工单表） */
  image?: string
  aiDisease?: string
  aiConfidence?: number | null
  status: 'pending' | 'done'
  /** 复核结论：confirmed 确诊 / rejected 驳回（样本质量差） */
  outcome?: 'confirmed' | 'rejected' | null
  opinion: string
  finalDisease?: string
  expertId: number | null
  expertName?: string
  createdAt: string
  completedAt?: string | null
}

/** 站内消息（专家回复 / 系统公告 / 农户提问） */
export interface Message {
  id: number
  userId: number | 'all'
  from: 'expert' | 'system' | 'user'
  fromName: string
  /** 发送者用户 id（农户提问时携带，专家可直接回复） */
  fromId?: number
  title: string
  content: string
  read: boolean
  createdAt: string
}

/** 用户提交的新作物（专家审核流） */
export interface CropSubmission {
  id: number
  name: string
  alias: string
  province: string
  /** 所属州市 / 县区（可选） */
  city?: string
  altitude: string
  season: string
  emoji: string
  desc: string
  pests: string
  submitter: string
  contact: string
  status: 'pending' | 'approved' | 'rejected'
  note: string
  reviewer: string
  createdAt: string
  reviewedAt: string
}

/** 病害样本共建（农户提交 → 专家审核 → 并入知识库） */
export interface DiseaseSample {
  id: number
  userId: number
  userName: string
  /** 系统已知作物 id；手动输入的新作物为空字符串 */
  cropId: string
  cropName: string
  description: string
  /** 压缩 dataURL，1–3 张 */
  images: string[]
  altitude: string
  weather: string
  region: string
  status: 'pending' | 'approved' | 'rejected'
  note: string
  reviewer: string
  reviewedAt: string
  /** 专家确认的病害定名（通过后） */
  diseaseName?: string
  diseaseType?: string
  treatment?: string
  /** 通过后生成的知识库条目快照 */
  entry?: Record<string, any> | null
  createdAt: string
}

export interface Disease {
  id: string
  cropId: string
  name: string
  alias?: string
  type: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  pathogen: string
  symptomKeywords: string[]
  symptoms: string[]
  causes: string[]
  treatment: string[]
  prevention: string[]
  safetyNote: string
  references: string[]
}

export interface DiagnosisResultItem {
  name: string
  confidence: number
  confidenceLevel: 'high' | 'medium' | 'low'
  symptomMatch: string[]
  differential: string
  urgency: 'immediate' | 'within3days' | 'observe'
  inKnowledgeBase: boolean
}

export interface Diagnosis {
  observations: string
  results: DiagnosisResultItem[]
  noticed: string[]
  needMoreInfo: string
  isPhysiological: boolean
  quarantineAlert: boolean
}

export interface GateFlag {
  type: string
  level: 'critical' | 'warning' | 'info'
  message: string
}

export interface Gate {
  flags: GateFlag[]
  needHumanReview: boolean
  decision: 'proceed' | 'escalate'
}

export interface ChemicalItem {
  targetDisease: string
  chemical: string
  formulation: string
  dosage: string
  method: string
  frequency: string
  safeInterval: string
  avoidMix: string
  caution: string
}

export interface Treatment {
  summary: string
  immediateActions: { step: number; action: string; detail: string }[]
  nonChemical: { type: string; measure: string; detail: string }[]
  chemicalPlan: ChemicalItem[]
  safetyWarnings: string[]
  followUp: string
  needExpert: boolean
}

export interface TraceItem {
  stage: string
  agent: string
  durationMs: number
  status: string
  detail: string
  /** RAG 环节召回的知识库片段（可展开溯源） */
  sources?: {
    id: string
    name: string
    cropName: string
    score: number
    type: string
    snippet: string
  }[]
}

export interface DiagnoseResponse {
  cropId: string
  cropName: string
  diagnosis: Diagnosis
  gate: Gate
  treatment: Treatment
  validationViolations: string[]
  kbSources: { name: string; score: number }[]
  trace: TraceItem[]
  meta: {
    totalMs: number
    usedFallback: boolean
    aiConfigured: boolean
  }
  recordId: number
}

export interface QAResponse {
  answer: string
  sources: {
    id: string
    name: string
    cropId: string
    score: number
    type: string
    symptoms: string[]
    /** 溯源引用：植保手册/文献出处 */
    references?: string[]
    /** 知识库原始文本片段（展开引用区块时展示） */
    excerpt?: string
    cropName?: string
  }[]
  usedFallback: boolean
  /** 空召回：知识库无有效片段，回答为固定兜底文案（非模型生成） */
  noHit?: boolean
  consultationId: number
}

/** 历史问答记录（我的种植档案 - 历史问答记录） */
export interface QAHistoryItem {
  id: number
  question: string
  answer: string
  cropId: string | null
  usedFallback: boolean
  noHit?: boolean
  userName: string
  createdAt: string
  sources: { name: string; score: number }[]
}

export interface RecordItem {
  id: number
  createdAt: string
  userId?: string
  cropId: string
  cropName: string
  region?: string
  altitude?: string
  weather?: string
  stage?: string
  area?: string
  symptomsText?: string
  hasImage?: boolean
  /** 真实病害实拍图（管理后台缩略图/详情用） */
  imageUrl?: string
  image?: string
  isDemo?: boolean
  diagnosis: Diagnosis
  gate: Gate
  treatment: Treatment
  trace?: TraceItem[]
  meta?: { totalMs: number; usedFallback: boolean; aiConfigured?: boolean }
  recovery?: 'improved' | 'stable' | 'worse' | null
  note?: string
}

export interface StatsResponse {
  total: number
  days: number
  topDiseases: { name: string; count: number }[]
  trend: { date: string; count: number }[]
  cropDist: { cropId: string; count: number }[]
  regions: { name: string; count: number }[]
  confBuckets: { high: number; medium: number; low: number }
  escalated: number
  escalatedRate: number
  avgConfidence: number
  cropNames: Record<string, string>
}

export interface AlertResponse {
  headline: string
  level: 'red' | 'orange' | 'yellow' | 'green'
  analysis: string
  actions: string[]
  stats: { total: number; days: number; escalatedRate: number }
}

export interface KbHit {
  id: number | string
  name: string
  cropId: string
  cropName: string
  score: number
  type: string
  symptoms: string[]
  treatment: string[]
  alias?: string
}

export interface KbSearchResponse {
  hits: KbHit[]
  total: { docs: number; diseases: number; crops: number }
}

export interface ReviewResponse {
  pattern: string
  riskLevel: 'high' | 'medium' | 'low'
  suggestions: { title: string; detail: string }[]
  nextSeasonFocus: string
  recordCount?: number
  /** 统计维度：历史病害频次 / 月份分布 / 平均置信度（AI 复盘可视化用） */
  stats?: {
    diseaseCounts: { name: string; count: number; ratio: number }[]
    monthly: { month: string; count: number }[]
    avgConfidence: number | null
    cropName: string
    spanDays: number
  }
}

export interface HealthResponse {
  ok: boolean
  version: string
  ai: {
    configured: boolean
    baseUrl: string
    visionModel: string
    textModel: string
    keyMasked: string
    supportsVision: boolean
  }
  kb: { crops: number; diseases: number; docs: number; pesticides: number }
  uptime: number
  timestamp: string
}

export interface MetricsResponse {
  calls: number
  failures: number
  totalTokens: number
  totalLatencyMs: number
  avgLatencyMs: number
  lastCallAt: string | null
  lastModel: string | null
  history: { model: string; latencyMs: number; tokens: number; at: string }[]
  config: HealthResponse['ai']
}

/** 7 天天气与病害风险（后端 /api/weather 与前端实时兜底共用） */
export interface WeatherDay {
  day: string
  cond: string
  rainProb: number
  tempLow: number
  tempHigh: number
  humidity: number
  risk: number
  precipitationMm?: number
}

export interface WeatherWarning {
  type: string
  severity: 'green' | 'blue' | 'yellow' | 'orange' | 'red'
  day?: string
  desc?: string
  content?: string
  actions?: string[]
}

export interface WeatherData {
  region: string
  source?: string
  /** 实际解析到的坐标（便于核对地区对应） */
  resolvedCoord?: string
  days: WeatherDay[]
  warnings: WeatherWarning[]
  riskPeak: number
  riskLevel: 'low' | 'medium' | 'high'
  cropNote: string
}
