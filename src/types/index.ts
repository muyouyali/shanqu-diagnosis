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
  createdAt: string
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
  }[]
  usedFallback: boolean
  consultationId: number
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

export interface ReviewResponse {
  pattern: string
  riskLevel: 'high' | 'medium' | 'low'
  suggestions: { title: string; detail: string }[]
  nextSeasonFocus: string
  recordCount?: number
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
