import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'
import type { Crop, RecordItem, DiagnoseResponse, User, Message } from '@/types'
import { provinceOfRegion } from '@/data/regions'

const USER_KEY = 'ylnz_user_id'

const genUserId = () => {
  const existing = localStorage.getItem(USER_KEY)
  if (existing) return existing
  const id = `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  localStorage.setItem(USER_KEY, id)
  return id
}

export const useAppStore = defineStore('app', () => {
  // ---------- 用户 ----------
  const userId = ref(genUserId())
  const region = ref(localStorage.getItem('ylnz_region') || '文山市')

  const setRegion = (r: string) => {
    region.value = r
    localStorage.setItem('ylnz_region', r)
    // 地区变更后作物列表也要跟着换（不同地区不同作物）
    loadCrops(true).catch(() => {})
  }

  // ---------- 作物 ----------
  const crops = ref<Crop[]>([])
  const cropsLoaded = ref(false)
  const cropsProvince = ref('')
  const selectedCropId = ref<string>(localStorage.getItem('ylnz_crop') || 'sanqi')

  const selectedCrop = computed(() => crops.value.find((c) => c.id === selectedCropId.value) || null)

  /**
   * 加载作物（按当前地区返回：知识库本地作物 + 地区百科作物 + 其余知识库作物）
   * 地区变化时需重新拉取，保证「选哪个地方就显示哪个地方的作物」
   */
  const loadCrops = async (force = false) => {
    const province = provinceOfRegion(region.value)
    if (cropsLoaded.value && !force && cropsProvince.value === province) return crops.value
    const res = await api.crops({ region: region.value })
    crops.value = res.items
    cropsProvince.value = province
    cropsLoaded.value = true
    return crops.value
  }

  const setCrop = (id: string) => {
    selectedCropId.value = id
    localStorage.setItem('ylnz_crop', id)
  }

  // ---------- 用户登录态 ----------
  const user = ref<User | null>(null)
  const userLoaded = ref(false)
  const unread = ref(0)

  const isExpert = computed(() => user.value?.role === 'expert')

  /** 应用启动时恢复登录态（token 失效则静默清掉）；并发调用共享同一次请求 */
  let restorePromise: Promise<void> | null = null
  const restoreUser = async () => {
    if (restorePromise) return restorePromise
    userLoaded.value = true
    restorePromise = (async () => {
      if (!localStorage.getItem('ylnz_token')) return
      try {
        user.value = await api.me()
        await loadUnread()
      } catch {
        localStorage.removeItem('ylnz_token')
        user.value = null
      }
    })()
    return restorePromise
  }

  const setAuth = (token: string, u: User) => {
    localStorage.setItem('ylnz_token', token)
    user.value = u
    loadUnread().catch(() => {})
  }

  const updateUser = (u: User) => {
    user.value = u
  }

  const logout = async () => {
    try {
      await api.logout()
    } catch {
      /* 忽略登出接口异常 */
    }
    localStorage.removeItem('ylnz_token')
    user.value = null
    unread.value = 0
  }

  const loadUnread = async () => {
    if (!user.value) return
    try {
      unread.value = (await api.messages()).unread
    } catch {
      /* 静默 */
    }
  }

  // ---------- 最近一次诊断结果（避免刷新丢失） ----------
  const lastResult = ref<DiagnoseResponse | null>(null)
  const lastImage = ref<string>('')

  const setLastResult = (r: DiagnoseResponse, img: string) => {
    lastResult.value = r
    lastImage.value = img
    try {
      sessionStorage.setItem('ylnz_last_result', JSON.stringify(r))
      if (img.length < 2_500_000) sessionStorage.setItem('ylnz_last_image', img)
    } catch {
      /* 存储超限时静默失败，不影响主流程 */
    }
  }

  const restoreLastResult = () => {
    if (lastResult.value) return lastResult.value
    try {
      const raw = sessionStorage.getItem('ylnz_last_result')
      if (raw) lastResult.value = JSON.parse(raw)
      const img = sessionStorage.getItem('ylnz_last_image')
      if (img) lastImage.value = img
    } catch {
      /* ignore */
    }
    return lastResult.value
  }

  // ---------- 诊断历史（本地缓存，提升离线体验） ----------
  const myRecords = ref<RecordItem[]>([])

  const loadMyRecords = async (cropId?: string) => {
    const res = await api.records({ userId: userId.value, cropId, limit: 60 })
    myRecords.value = res.items
    return res
  }

  // ---------- 全局提示 ----------
  const toast = ref<{ show: boolean; text: string; type: 'success' | 'error' | 'info' }>({
    show: false,
    text: '',
    type: 'info'
  })
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    toast.value = { show: true, text, type }
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast.value.show = false), 2600)
  }

  return {
    userId,
    region,
    setRegion,
    crops,
    cropsLoaded,
    loadCrops,
    selectedCropId,
    selectedCrop,
    setCrop,
    user,
    isExpert,
    unread,
    restoreUser,
    setAuth,
    updateUser,
    logout,
    loadUnread,
    lastResult,
    lastImage,
    setLastResult,
    restoreLastResult,
    myRecords,
    loadMyRecords,
    toast,
    showToast
  }
})
