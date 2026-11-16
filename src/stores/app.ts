import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'
import type { Crop, RecordItem, DiagnoseResponse, User, Message } from '@/types'
import { provinceOfRegion } from '@/data/regions'
import { sortByCity } from '@/data/cityCrops'
import { KB_STATIC, ATLAS_STATIC } from '@/data/crops-static'

/** 静态托管兜底：与后端 /api/crops 同构的作物列表构建 */
const buildStaticCrops = (province: string): Crop[] => {
  const localKb = province ? KB_STATIC.filter((c) => (c.regions || []).includes(province)) : []
  const otherKb = KB_STATIC.filter((c) => !localKb.includes(c))
  localKb.forEach((c) => { (c as any).local = true })
  const atlasRaw = ((ATLAS_STATIC as Record<string, any[]>)[province] || []).map((a: any) => ({
    ...a,
    source: 'atlas'
  }))
  const atlas = atlasRaw
    .filter((a: any) => !KB_STATIC.some((c) => c.name === a.name || (c.alias || '').includes(a.name)))
    .map((a: any, i: number) => ({
      id: `atlas-${province}-${i}`,
      name: a.name,
      alias: a.alias || '',
      emoji: a.emoji || '🌱',
      latin: '',
      tagline: a.desc || '',
      desc: a.desc || '',
      season: a.season || '',
      altitude: a.altitude || '',
      color: '#4f8f6b',
      intro: a.desc || '',
      keyPoints: [],
      pests: a.pests || '',
      regions: province ? [province] : [],
      diseaseCount: 0,
      diagnosable: false,
      local: true,
      source: 'atlas'
    }))
  return [...localKb, ...atlas, ...otherKb] as Crop[]
}

/**
 * 地区兜底：把地区映射到其所属省份（provinceOfRegion 未收录时也能正确归类）
 * 静态托管下 GPS 可能返回任意县市名，这里用省份关键词做二次匹配
 */
const provinceOf = (region: string): string => {
  const p = provinceOfRegion(region)
  if (p) return p
  const KEY = ['云南', '贵州', '四川', '重庆', '广西', '西藏', '湖南', '湖北', '广东', '福建',
    '浙江', '江西', '陕西', '甘肃', '海南', '安徽', '河南', '山西', '山东', '河北', '辽宁',
    '吉林', '黑龙江', '江苏', '内蒙古', '宁夏', '青海', '新疆', '北京', '天津', '上海', '台湾']
  return KEY.find((k) => region.includes(k)) || '云南'
}


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
  /** 是否处于静态兜底模式（后端不可用） */
  const offlineCrops = ref(false)
  const cropsLoaded = ref(false)
  const cropsProvince = ref('')
  const selectedCropId = ref<string>(localStorage.getItem('ylnz_crop') || 'sanqi')

  const selectedCrop = computed(() => crops.value.find((c) => c.id === selectedCropId.value) || null)

  /**
   * 加载作物（按当前地区返回：知识库本地作物 + 地区百科作物 + 其余知识库作物）
   * 地区变化时需重新拉取，保证「选哪个地方就显示哪个地方的作物」
   * 后端不可用（静态托管）时：用打包的静态数据集按省份本地构建，保证作物仍与定位地区匹配
   */
  const loadCrops = async (force = false) => {
    const province = provinceOf(region.value)
    if (cropsLoaded.value && !force && cropsProvince.value === province) return crops.value
    try {
      const res = await api.crops({ region: region.value })
      crops.value = res.items
      offlineCrops.value = false
    } catch {
      // 静态托管兜底：与后端 /api/crops 同构的本地构建
      crops.value = buildStaticCrops(province)
      offlineCrops.value = true
    }
    // 云南州市级特色作物置顶（与后端排序逻辑一致）
    crops.value = sortByCity(crops.value, region.value)
    cropsProvince.value = province
    cropsLoaded.value = true
    // 当前选中作物不在本地区主推列表中时，自动切到本地第一个可诊断作物
    if (localCrops.value.length && !localCrops.value.some((c) => c.id === selectedCropId.value)) {
      setCrop(localCrops.value[0].id)
    }
    return crops.value
  }

  /** 本地区主推作物（后端 local 标记优先；静态兜底按省份回退），顺序即展示顺序 */
  const localCrops = computed<Crop[]>(() => {
    const province = cropsProvince.value || provinceOf(region.value)
    return crops.value.filter(
      (c) =>
        c.local ??
        ((c.regions || []).includes(province) ||
          c.source === 'atlas' ||
          c.source === 'community')
    )
  })

  /** 跨区作物（知识库收录但本省非主产区），仅作参考展示 */
  const otherCrops = computed<Crop[]>(() =>
    crops.value.filter((c) => !localCrops.value.includes(c))
  )

  const setCrop = (id: string) => {
    selectedCropId.value = id
    localStorage.setItem('ylnz_crop', id)
  }

  // ---------- 用户登录态 ----------
  const user = ref<User | null>(null)
  const userLoaded = ref(false)
  const unread = ref(0)

  const isExpert = computed(() => user.value?.role === 'expert')

  /**
   * 诊断记录归属 id：登录后按账号隔离，未登录用设备 id。
   * 解决「农户做的诊断，换专家账号登录还能看到」的串档问题。
   */
  const recordsUserId = computed(() =>
    user.value ? String(user.value.id) : userId.value
  )

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
    recordsUserId,
    region,
    setRegion,
    crops,
    cropsLoaded,
    offlineCrops,
    cropsProvince,
    localCrops,
    otherCrops,
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
