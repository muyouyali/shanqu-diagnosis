import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '@/api'
import type { Crop, RecordItem, DiagnoseResponse } from '@/types'

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
  }

  // ---------- 作物 ----------
  const crops = ref<Crop[]>([])
  const cropsLoaded = ref(false)
  const selectedCropId = ref<string>(localStorage.getItem('ylnz_crop') || 'sanqi')

  const selectedCrop = computed(() => crops.value.find((c) => c.id === selectedCropId.value) || null)

  const loadCrops = async () => {
    if (cropsLoaded.value) return crops.value
    crops.value = await api.crops()
    cropsLoaded.value = true
    return crops.value
  }

  const setCrop = (id: string) => {
    selectedCropId.value = id
    localStorage.setItem('ylnz_crop', id)
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
