import axios from 'axios'
import type {
  Crop,
  CropSubmission,
  Disease,
  User,
  Message,
  DiagnoseResponse,
  QAResponse,
  RecordItem,
  StatsResponse,
  AlertResponse,
  ReviewResponse,
  HealthResponse,
  MetricsResponse
, Expert, Consult, ReviewRequest } from '@/types'

const http = axios.create({
  baseURL: '/api',
  timeout: 90000
})

http.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('ylnz_token')
  if (token) {
    // 双通道携带：部分托管网关会剥离 Authorization 头，自定义头兜底
    cfg.headers.Authorization = `Bearer ${token}`
    cfg.headers['X-Token'] = token
    // GET 请求再以查询参数兜底
    if ((cfg.method || 'get').toLowerCase() === 'get') {
      cfg.params = { ...(cfg.params || {}), token }
    }
  }
  return cfg
})

http.interceptors.response.use(
  (r) => r,
  (err) => {
    // 会话失效（token 过期 / 服务端重启清空会话）：清除本地登录态并通知全局
    // - auth/me 的 401 是启动时的登录态检查，永远静默清理，不打扰用户
    // - 页面刚加载 2 秒内的其他 401 也静默，避免开屏弹提示
    const url: string = err.config?.url || ''
    const isAuthReq = url.includes('auth/login') || url.includes('auth/register')
    const isAuthCheck = url.includes('auth/me')
    if (err.response?.status === 401 && !isAuthReq && !isAuthCheck) {
      localStorage.removeItem('ylnz_token')
      if (Date.now() - (window as any).__ylnz_booted > 2000) {
        window.dispatchEvent(new CustomEvent('ylnz:auth-expired'))
      }
    } else if (err.response?.status === 401 && isAuthCheck) {
      localStorage.removeItem('ylnz_token')
    }
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

  // ==================== 用户认证 ====================
  register: (payload: { account: string; password: string; nickname?: string; method?: string; role?: 'user' | 'expert'; title?: string; specialty?: string[]; region?: string }) =>
    http.post<{ ok: boolean; token: string; user: User }>('/auth/register', payload).then((r) => r.data),

  login: (payload: { account: string; password: string; method?: string }) =>
    http.post<{ ok: boolean; token: string; user: User }>('/auth/login', payload).then((r) => r.data),

  /** 获取验证码（演示环境直接回显 demoCode） */
  smsCode: (target: string) =>
    http.post<{ ok: boolean; channel: 'sms' | 'email'; demoCode: string; ttl: number }>('/auth/sms-code', { target }).then((r) => r.data),

  /** 验证码快捷登录 / 注册（手机号 / 邮箱） */
  quickAuth: (payload: {
    method: 'phone' | 'email'
    target: string
    code: string
    mode: 'login' | 'register'
    nickname?: string
    role?: 'user' | 'expert'
    title?: string
    specialty?: string[]
    region?: string
  }) => http.post<{ ok: boolean; token: string; user: User }>('/auth/quick', payload).then((r) => r.data),

  /** 跨设备真实扫码登录：生成二维码 */
  scanQr: () =>
    http.post<{ ok: boolean; ticket: string; qrDataUrl: string; url: string; ttl: number }>('/auth/scan/qr').then((r) => r.data),

  /** 轮询扫码状态 */
  scanPoll: (ticket: string) =>
    http.get<{ ok: boolean; status: 'pending' | 'scanned' | 'confirmed' | 'expired'; token?: string }>('/auth/scan/poll', { params: { ticket } }).then((r) => r.data),

  /** 手机确认页标记已扫码 */
  scanTouch: (ticket: string) =>
    http.post<{ ok: boolean }>('/auth/scan/touch', { ticket }).then((r) => r.data),

  /** 手机确认页：确认登录 */
  scanConfirm: (payload: { ticket: string; phone: string; nickname?: string }) =>
    http.post<{ ok: boolean; token: string; user: User }>('/auth/scan/confirm', payload).then((r) => r.data),

  /** 第三方授权登录（演示环境模拟扫码） */
  oauthAuth: (payload: { provider: 'wechat' | 'alipay'; openid?: string }) =>
    http.post<{ ok: boolean; token: string; user: User }>('/auth/oauth', payload).then((r) => r.data),

  /** 微信开放平台配置状态（是否启用真实扫码） */
  wechatConfig: () =>
    http.get<{ enabled: boolean; appId: string }>('/auth/wechat/config').then((r) => r.data),

  /** 获取微信扫码地址（真实接入） */
  wechatQr: () =>
    http.get<{ ok: boolean; url: string; state: string }>('/auth/wechat/qr').then((r) => r.data),

  /** 顶层 OAuth 回调场景：带 token 拉取当前用户（绕过 localStorage 拦截器） */
  meWithToken: async (token: string): Promise<User> => {
    const res = await fetch(`/api/auth/me?token=${encodeURIComponent(token)}`, {
      headers: { 'X-Token': token }
    })
    if (!res.ok) throw new Error('登录态校验失败')
    const data = await res.json()
    return data.user
  },

  me: () => http.get<{ user: User }>('/auth/me').then((r) => r.data.user),

  updateProfile: (payload: Partial<User> & { password?: string }) =>
    http.put<{ ok: boolean; user: User }>('/auth/profile', payload).then((r) => r.data.user),

  logout: () => http.post('/auth/logout').then((r) => r.data),

  deleteAccount: () => http.delete('/auth/account').then((r) => r.data),

  // ==================== 消息 ====================
  messages: () =>
    http
      .get<{ total: number; unread: number; items: Message[] }>('/messages')
      .then((r) => r.data),

  readAllMessages: () =>
    http.post<{ ok: boolean; marked: number }>('/messages/read-all').then((r) => r.data),

  clearMessages: (ids?: number[]) =>
    http
      .delete<{ ok: boolean; removed: number; unread: number }>('/messages', { data: { ids } })
      .then((r) => r.data),

  readMessage: (id: number) =>
    http.post<{ ok: boolean; unread: number }>(`/messages/${id}/read`).then((r) => r.data),

  sendMessage: (payload: { userId?: number | 'all'; title: string; content: string }) =>
    http.post<{ ok: boolean; item: Message }>('/messages', payload).then((r) => r.data),

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

  records: (params?: { cropId?: string; limit?: number; offset?: number; userId?: string; days?: number }) =>
    http.get<{ total: number; items: RecordItem[] }>('/records', { params }).then((r) => r.data),

  record: (id: number | string) => http.get<RecordItem>(`/records/${id}`).then((r) => r.data),

  updateRecord: (id: number | string, patch: Partial<RecordItem>) =>
    http.patch<RecordItem>(`/records/${id}`, patch).then((r) => r.data),

  deleteRecord: (id: number | string) => http.delete(`/records/${id}`).then((r) => r.data),

  stats: (params?: { days?: number; cropId?: string }) =>
    http.get<StatsResponse>('/stats', { params }).then((r) => r.data),

  alerts: (days = 14) => http.get<AlertResponse>('/alerts', { params: { days } }).then((r) => r.data),

  experts: (params: { cropId?: string; region?: string }) =>
    http.get<{ items: Expert[] }>('/experts', { params }).then((r) => r.data),

  sendConsult: (payload: { expertId: number; cropId?: string | null; region?: string; question: string }) =>
    http.post<{ ok: boolean; consultId: number }>('/consult', payload).then((r) => r.data),

  consults: () => http.get<{ items: Consult[] }>('/consults').then((r) => r.data),

  closeConsult: (id: number, reply: string) =>
    http.patch<{ ok: boolean }>(`/consults/${id}`, { reply }).then((r) => r.data),

  reviewRequests: () =>
    http.get<{ items: ReviewRequest[] }>('/review-requests').then((r) => r.data),

  createReviewRequest: (payload: { recordId: number; cropId?: string | null; region?: string; question?: string }) =>
    http.post<{ ok: boolean; requestId: number }>('/review-requests', payload).then((r) => r.data),

  resolveReviewRequest: (id: number, opinion: string) =>
    http.patch<{ ok: boolean; item: ReviewRequest }>(`/review-requests/${id}`, { opinion }).then((r) => r.data),

  publishAlert: (title: string, content: string) =>
    http
      .post<{ ok: boolean; messageId: number }>('/alerts/publish', { title, content })
      .then((r) => r.data),

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
