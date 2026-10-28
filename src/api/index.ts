import axios from 'axios'
import type {
  Crop,
  CropSubmission,
  Disease,
  DiagnoseResponse,
  QAResponse,
  RecordItem,
  StatsResponse,
  AlertResponse,
  ReviewResponse,
  HealthResponse,
  MetricsResponse
} from '@/types'

const http = axios.create({
  baseURL: '/api',
  timeout: 90000
})

http.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg =
      err.response?.data?.error ||
      (err.code === 'ECONNABORTED' ? '请求超时，请检查网络或稍后重试' : '网络异常，请稍后重试')
    const hint = err.response?.data?.hint
    return Promise.reject(new Error(hint ? `${msg}（${hint}）` : msg))
  }
)

export const api = {
  health: () => http.get<HealthResponse>('/health').then((r) => r.data),

  crops: (params?: { region?: string; keyword?: string }) =>
    http
      .get<{ items: Crop[]; province: string; localCount: number }>('/crops', { params })
      .then((r) => r.data),

  /** 提交新作物（进入专家审核队列） */
  submitCrop: (payload: Partial<CropSubmission> & { name: string; province: string; desc: string }) =>
    http.post<{ ok: boolean; item: CropSubmission }>('/crops/submit', payload).then((r) => r.data),

  /** 作物提交列表（后台审核用） */
  cropSubmissions: (params?: { status?: string; province?: string }) =>
    http
      .get<{ total: number; items: CropSubmission[] }>('/crops/submissions', { params })
      .then((r) => r.data),

  /** 审核作物提交 */
  reviewCropSubmission: (id: number, payload: { status: string; note?: string }) =>
    http
      .patch<{ ok: boolean; item: CropSubmission }>(`/crops/submissions/${id}`, payload)
      .then((r) => r.data),

  deleteCropSubmission: (id: number) =>
    http.delete(`/crops/submissions/${id}`).then((r) => r.data),

  diseases: (cropId: string) =>
    http.get<{ items: Disease[] }>(`/crops/${cropId}/diseases`).then((r) => r.data.items),

  diagnose: (payload: {
    cropId: string
    image?: string
    symptomsText?: string
    altitude?: string
    weather?: string
    stage?: string
    area?: string
    region?: string
    userId?: string
  }) => http.post<DiagnoseResponse>('/diagnose', payload).then((r) => r.data),

  qa: (payload: { question: string; cropId?: string; history?: { role: string; content: string }[] }) =>
    http.post<QAResponse>('/qa', payload).then((r) => r.data),

  records: (params?: { cropId?: string; limit?: number; offset?: number; userId?: string }) =>
    http.get<{ total: number; items: RecordItem[] }>('/records', { params }).then((r) => r.data),

  record: (id: number | string) => http.get<RecordItem>(`/records/${id}`).then((r) => r.data),

  updateRecord: (id: number | string, patch: Partial<RecordItem>) =>
    http.patch<RecordItem>(`/records/${id}`, patch).then((r) => r.data),

  deleteRecord: (id: number | string) => http.delete(`/records/${id}`).then((r) => r.data),

  stats: (params?: { days?: number; cropId?: string }) =>
    http.get<StatsResponse>('/stats', { params }).then((r) => r.data),

  alerts: (days = 14) => http.get<AlertResponse>('/alerts', { params: { days } }).then((r) => r.data),

  review: (payload: { cropId?: string; userId?: string }) =>
    http.post<ReviewResponse>('/review', payload).then((r) => r.data),

  metrics: () => http.get<MetricsResponse>('/metrics').then((r) => r.data),

  resetDemo: () => http.post('/demo/reset').then((r) => r.data),

  // ===== v2 新增 =====

  weather: (region: string, cropId?: string) =>
    http.get('/weather', { params: { region, cropId } }).then((r) => r.data),

  advisory: (payload: { question: string; cropId?: string; region?: string }) =>
    http.post('/advisory', payload).then((r) => r.data),

  /** 流式问答（SSE）：onEvent 回调 { sources, delta, done } */
  qaStream: async (
    payload: { question: string; cropId?: string },
    onEvent: (type: 'sources' | 'delta' | 'done', data: any) => void
  ) => {
    const resp = await fetch('/api/qa/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!resp.ok || !resp.body) throw new Error('流式服务不可用')
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''
      for (const part of parts) {
        const evLine = part.split('\n').find((l) => l.startsWith('event:'))
        const dataLine = part.split('\n').find((l) => l.startsWith('data:'))
        if (!evLine || !dataLine) continue
        const event = evLine.slice(6).trim() as 'sources' | 'delta' | 'done'
        try {
          onEvent(event, JSON.parse(dataLine.slice(5).trim()))
        } catch { /* 分片容错 */ }
      }
    }
  }
}

export default api
