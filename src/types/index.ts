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
