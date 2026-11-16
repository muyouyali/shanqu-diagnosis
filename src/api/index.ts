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
  KbSearchResponse,
  ReviewResponse,
  HealthResponse,
  MetricsResponse
, Expert, Consult, ReviewRequest, QAHistoryItem, DiseaseSample } from '@/types'

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
      err.response?.status === 429
        ? 'AI服务访问频次超限，请稍后再试。'
        : err.response?.data?.error ||
          (err.code === 'ECONNABORTED'
            ? url.includes('/diagnose')
              ? 'AI推理请求超时，请检查网络后重试。'
              : '请求超时，请检查网络或稍后重试'
            : '网络异常，请稍后重试')
    const hint = err.response?.data?.hint
    const wrapped = new Error(hint ? `${msg}（${hint}）` : msg) as Error & { httpStatus?: number }
    wrapped.httpStatus = err.response?.status
    return Promise.reject(wrapped)
  }
)

export const api = {
  health: () => http.get<HealthResponse>('/health').then((r) => r.data),

  crops: (params?: { region?: string; keyword?: string }) =>
    http
      .get<{ items: Crop[]; province: string; localCount: number }>('/crops', { params })
      .then((r) => r.data),

  /** 提交新作物（进入专家审核队列） */
  submitCrop: (payload: Partial<CropSubmission> & { name: string; province: string; desc: string; city?: string; region?: string }) =>
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

  // ==================== 病害样本共建 ====================

  /** 农户提交病害样本（1–3 张图片）→ 专家审核待办 */
  createDiseaseSample: (payload: {
    cropId?: string
    cropName?: string
    description: string
    images: string[]
    altitude?: string
    weather?: string
    region?: string
  }) => http.post<{ ok: boolean; sampleId: number }>('/samples', payload).then((r) => r.data),

  /** 农户：我提交的共建样本（状态跟踪） */
  myDiseaseSamples: () =>
    http.get<{ total: number; items: DiseaseSample[] }>('/samples/mine').then((r) => r.data),

  /** 专家：样本审核队列 */
  diseaseSamples: (status?: string) =>
    http
      .get<{ total: number; items: DiseaseSample[] }>('/samples', { params: { status } })
      .then((r) => r.data),

  /** 专家审核：通过（必填确诊病害名，入库知识库）/ 驳回（必填理由） */
  reviewDiseaseSample: (
    id: number,
    payload: { status: 'approved' | 'rejected'; note?: string; diseaseName?: string; diseaseType?: string; treatment?: string }
  ) => http.patch<{ ok: boolean; item: DiseaseSample; entryId?: string }>(`/samples/${id}`, payload).then((r) => r.data),

  /** 公开：已收录的社区共建病害条目（图谱展示） */
  approvedDiseaseSamples: () =>
    http.get<{ items: Disease[] & { submitter?: string }[] }>('/samples/approved').then((r) => r.data),

  // ==================== 用户认证 ====================
  register: (payload: { account: string; password: string; nickname?: string; method?: string; role?: 'user' | 'expert'; title?: string; specialty?: string[]; region?: string }) =>
    http.post<{ ok: boolean; token: string; user: User }>('/auth/register', payload).then((r) => r.data),

  login: (payload: { account: string; password: string; method?: string }) =>
    http.post<{ ok: boolean; token: string; user: User }>('/auth/login', payload).then((r) => r.data),

  /** 演示账号一键登录（体验账号校验在后端，前端不硬编码账号密码） */
  demoLogin: (role: 'user' | 'expert') =>
    http.post<{ ok: boolean; token: string; user: User }>('/auth/demo', { role }).then((r) => r.data),

  /** 知识库统计（登录页动态渲染；失败时展示兜底文案） */
  kbStats: () =>
    http.get<{ ok: boolean; crops: number; diseases: number; docs: number }>('/kb/stats').then((r) => r.data),

  /** 获取验证码（配置 SMTP 后真实发邮件；未注册邮箱自动建档） */
  smsCode: (target: string) =>
    http
      .post<{ ok: boolean; channel: 'sms' | 'email'; sent?: boolean; demoCode?: string; ttl: number }>(
        '/auth/sms-code',
        { target },
      )
      .then((r) => r.data),

  /** 验证码快捷登录 / 注册（手机号 / 邮箱；mode=auto 时未注册自动创建） */
  quickAuth: (payload: {
    method: 'phone' | 'email'
    target: string
    code: string
    mode: 'login' | 'register' | 'auto'
    nickname?: string
    role?: 'user' | 'expert'
    title?: string
    specialty?: string[]
    region?: string
  }) => http.post<{ ok: boolean; token: string; user: User }>('/auth/quick', payload).then((r) => r.data),

  /** 忘记密码：验证码校验通过后重置密码 */
  resetPassword: (payload: { target: string; code: string; password: string }) =>
    http.post<{ ok: boolean }>('/auth/reset-password', payload).then((r) => r.data),

  /** 专家：AI 补全指定作物的病害知识（大模型生成并即时入库） */
  aiExpand: (cropName: string) =>
    http
      .post<{ ok: boolean; count: number; item: { id: number; cropName: string } }>('/kb/ai-expand', { cropName })
      .then((r) => r.data),

  /** 专家：AI 已补全的病害知识条目 */
  aiKbEntries: () =>
    http.get<{ items: { id: number; cropName: string; diseases: unknown[] }[] }>('/kb/ai-entries').then((r) => r.data),

  /** 专家：删除 AI 补全条目 */
  deleteAiKbEntry: (id: number) =>
    http.delete<{ ok: boolean }>(`/kb/ai-entries/${id}`).then((r) => r.data),

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
    http
      .get<{ enabled: boolean; appId: string; redirectUri?: string; missing?: string[] }>('/auth/wechat/config')
      .then((r) => r.data),

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

  sentMessages: () =>
    http.get<{ total: number; items: Message[] }>('/messages/sent').then((r) => r.data),

  deleteSentMessage: (id: number) =>
    http.delete<{ ok: boolean }>(`/messages/sent/${id}`).then((r) => r.data),

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
  }) =>
    // 多 Agent 链路（视觉识别 + 用药指导串行）实测可能超过 90s，单独放宽超时
    http.post<DiagnoseResponse>('/diagnose', payload, { timeout: 300000 }).then((r) => r.data),

  /** 异步提交诊断：立即返回 taskId（托管网关 60s 会掐断长请求，必须走任务模式） */
  submitDiagnose: (payload: {
    cropId: string
    image?: string
    symptomsText?: string
    region?: string
    userId?: string
  }) => http.post<{ taskId: string }>('/diagnose/submit', payload, { timeout: 25000 }).then((r) => r.data),

  /** 轮询异步诊断任务结果 */
  pollDiagnoseTask: (taskId: string) =>
    http.get<Partial<DiagnoseResponse> & { status: string; error?: string }>(
      `/diagnose/task/${taskId}`
    ).then((r) => r.data),

  qa: (payload: { question: string; cropId?: string; history?: { role: string; content: string }[] }) =>
    http.post<QAResponse>('/qa', payload).then((r) => r.data),

  /** 当前登录用户的历史问答记录（我的种植档案 - 历史问答记录） */
  qaHistoryMine: () => http.get<{ items: QAHistoryItem[] }>('/qa/history/mine').then((r) => r.data),

  records: (params?: { cropId?: string; limit?: number; offset?: number; userId?: string; days?: number; region?: string }) =>
    http.get<{ total: number; items: RecordItem[] }>('/records', { params }).then((r) => r.data),

  record: (id: number | string) => http.get<RecordItem>(`/records/${id}`).then((r) => r.data),

  updateRecord: (id: number | string, patch: Partial<RecordItem>) =>
    http.patch<RecordItem>(`/records/${id}`, patch).then((r) => r.data),

  deleteRecord: (id: number | string) => http.delete(`/records/${id}`).then((r) => r.data),

  clearRecords: () => http.delete<{ ok: boolean; removed: number }>('/records').then((r) => r.data),

  stats: (params?: { days?: number; cropId?: string; region?: string }) =>
    http.get<StatsResponse>('/stats', { params }).then((r) => r.data),

  alerts: (days = 14, region?: string) =>
    http.get<AlertResponse>('/alerts', { params: { days, region } }).then((r) => r.data),

  kbSearch: (q: string, cropId?: string | null) =>
    http.get<KbSearchResponse>('/kb/search', { params: { q, cropId: cropId || '' } }).then((r) => r.data),

  geoReverse: (lat: number, lon: number) =>
    http.get<{ ok: boolean; provider: string; names: string[] }>('/geo/reverse', {
      params: { lat, lon },
      timeout: 8000
    }).then((r) => r.data),

  experts: (params: { cropId?: string; region?: string }) =>
    http.get<{ items: Expert[] }>('/experts', { params }).then((r) => r.data),

  sendConsult: (payload: { expertId: number; cropId?: string | null; region?: string; question: string }) =>
    http.post<{ ok: boolean; consultId: number }>('/consult', payload).then((r) => r.data),

  consults: () => http.get<{ items: Consult[] }>('/consults').then((r) => r.data),

  closeConsult: (id: number, reply: string) =>
    http.patch<{ ok: boolean }>(`/consults/${id}`, { reply }).then((r) => r.data),

  deleteConsult: (id: number) =>
    http.delete<{ ok: boolean }>(`/consults/${id}`).then((r) => r.data),

  reviewRequests: () =>
    http.get<{ items: ReviewRequest[] }>('/review-requests').then((r) => r.data),

  createReviewRequest: (payload: {
    recordId: number
    cropId?: string | null
    region?: string
    question?: string
    image?: string
    aiDisease?: string
    aiConfidence?: number | null
  }) =>
    http.post<{ ok: boolean; requestId: number }>('/review-requests', payload).then((r) => r.data),

  /** 农户：我的复核工单（种植档案-专家复核记录） */
  myReviewRequests: () =>
    http.get<{ items: ReviewRequest[] }>('/review-requests/mine').then((r) => r.data),

  resolveReviewRequest: (
    id: number,
    payload: { opinion: string; decision: 'confirm' | 'reject'; finalDisease?: string }
  ) =>
    http
      .patch<{ ok: boolean; item: ReviewRequest }>(`/review-requests/${id}`, payload)
      .then((r) => r.data),

  /** 专家：删除复核工单（队列清理） */
  deleteReviewRequest: (id: number) =>
    http.delete<{ ok: boolean }>(`/review-requests/${id}`).then((r) => r.data),

  publishAlert: (title: string, content: string) =>
    http
      .post<{ ok: boolean; messageId: number }>('/alerts/publish', { title, content })
      .then((r) => r.data),

  review: (payload: { cropId?: string; userId?: string }) =>
    http.post<ReviewResponse>('/review', payload).then((r) => r.data),

  /** AI 复盘报告：保存 / 列表 / 删除 */
  saveReviewReport: (payload: { cropId?: string; cropName?: string; report: unknown }) =>
    http.post<{ ok: boolean; item: unknown }>('/review/save', payload).then((r) => r.data),
  savedReviewReports: () => http.get<{ items: any[] }>('/review/saved').then((r) => r.data),
  deleteReviewReport: (id: number) => http.delete(`/review/saved/${id}`).then((r) => r.data),

  metrics: () => http.get<MetricsResponse>('/metrics').then((r) => r.data),

  resetDemo: () => http.post('/demo/reset').then((r) => r.data),

  // ===== v2 新增 =====

  weather: (region: string, cropId?: string) =>
    http.get('/weather', { params: { region, cropId } }).then((r) => r.data),

  advisory: (payload: { question: string; cropId?: string; region?: string }) =>
    http.post('/advisory', payload).then((r) => r.data),

  /** 流式问答（SSE）：onEvent 回调 { sources, delta, done } */
  qaStream: async (
    payload: { question: string; cropId?: string; customCrop?: string },
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
