<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import CropEmoji from '@/components/CropEmoji.vue'
import PageHero from '@/components/PageHero.vue'
import EmptyState from '@/components/EmptyState.vue'
import api from '@/api'
import type { RecordItem, ReviewResponse, ReviewRequest, QAHistoryItem, DiseaseSample } from '@/types'

const router = useRouter()
const route = useRoute()
const store = useAppStore()

const records = ref<RecordItem[]>([])
const loading = ref(true)
const review = ref<ReviewResponse | null>(null)
const reviewLoading = ref(false)
/* 复盘报告保存与回看 */
const savingReview = ref(false)
const savedReports = ref<any[]>([])
const savedLoading = ref(false)
const expandReport = ref<number | null>(null)
const loadSavedReports = async () => {
  if (savedLoading.value) return
  savedLoading.value = true
  try {
    savedReports.value = (await api.savedReviewReports()).items || []
  } catch { /* 静默 */ } finally {
    savedLoading.value = false
  }
}
const saveReview = async () => {
  if (!review.value || savingReview.value) return
  savingReview.value = true
  try {
    await api.saveReviewReport({
      cropId: filterCrop.value || '',
      cropName: review.value.stats?.cropName || '',
      report: review.value
    })
    store.showToast('复盘报告已保存到档案', 'success')
    await loadSavedReports()
  } catch (e) {
    store.showToast((e as Error).message, 'error')
  } finally {
    savingReview.value = false
  }
}
const removeReport = async (id: number) => {
  try {
    await api.deleteReviewReport(id)
    savedReports.value = savedReports.value.filter((r) => r.id !== id)
    if (expandReport.value === id) expandReport.value = null
    store.showToast('已删除复盘报告', 'success')
  } catch (e) {
    store.showToast((e as Error).message, 'error')
  }
}
const filterCrop = ref<string>('')
/** 📖 历史问答记录 */
const qaList = ref<QAHistoryItem[]>([])
const qaLoading = ref(false)
const qaLoaded = ref(false)
const qaExpanded = ref<number | null>(null)
const activeTab = ref<'records' | 'review' | 'expert' | 'qa' | 'samples'>('records')
/** 登录态下本机遗留的游客记录数（与账号记录互相隔离） */
const guestCount = ref(0)

/* ==================== 专家复核工单记录 ==================== */
const expertTickets = ref<ReviewRequest[]>([])
const ticketsLoading = ref(false)
const ticketsLoaded = ref(false)
const expandedTicket = ref<number | null>(null)

const pendingTickets = computed(() => expertTickets.value.filter((t) => t.status === 'pending'))

const loadTickets = async () => {
  if (ticketsLoading.value) return
  ticketsLoading.value = true
  try {
    const res = await api.myReviewRequests()
    expertTickets.value = res.items || []
    ticketsLoaded.value = true
  } catch (e: any) {
    store.showToast(e?.message || '复核记录加载失败', 'error')
  } finally {
    ticketsLoading.value = false
  }
}

const openTicketsTab = () => {
  activeTab.value = 'expert'
  // 每次进入都拉最新（专家刚处理完能立刻看到）
  loadTickets()
}

/** 📖 历史问答记录：每次进入都拉最新 */
const openQaTab = async () => {
  activeTab.value = 'qa'
  if (!store.user) return
  qaLoading.value = true
  try {
    const res = await api.qaHistoryMine()
    qaList.value = res.items || []
    qaLoaded.value = true
  } catch (e: any) {
    store.showToast(e?.message || '历史问答加载失败', 'error')
  } finally {
    qaLoading.value = false
  }
}

const qaTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const ticketStatusMeta = (t: ReviewRequest) =>
  t.status === 'pending'
    ? { label: '待专家复核', color: '#b45309', bg: '#fef3c7', icon: '⏳' }
    : t.outcome === 'rejected'
      ? { label: '已复核 · 已驳回', color: '#b91c1c', bg: '#fee2e2', icon: '⚠️' }
      : { label: '已复核完成', color: '#15803d', bg: '#dcfce7', icon: '✅' }

const filtered = computed(() =>
  filterCrop.value ? records.value.filter((r) => r.cropId === filterCrop.value) : records.value
)

const recoveryMeta: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  improved: { label: '已好转', color: '#15803d', bg: '#dcfce7', icon: 'trending-up' },
  stable: { label: '未见变化', color: '#a16207', bg: '#fef9c3', icon: 'clock' },
  worse: { label: '加重了', color: '#b91c1c', bg: '#fee2e2', icon: 'alert' }
}

const load = async () => {
  loading.value = true
  try {
    const res = await api.records({ userId: store.recordsUserId, region: store.region || undefined, limit: 60 })
    records.value = res.items
    // 登录态下若本机还有历史游客记录，给出提示（记录已按账号隔离，互不可见）
    if (store.user && store.recordsUserId !== store.userId) {
      try {
        const guest = await api.records({ userId: store.userId, limit: 1 })
        guestCount.value = Number(guest.total || 0)
      } catch {
        guestCount.value = 0
      }
    }
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  // 先恢复登录态再查询：否则 recordsUserId 会落在游客 id 上，登录用户看到 0 条
  await store.restoreUser().catch(() => {})
  await load()
  // 已保存的复盘报告（登录用户）
  if (store.user) loadSavedReports()
  // 共建样本表单下拉需要作物列表（进入页面即预加载）
  if (!store.crops.length) store.loadCrops().catch(() => {})
  // 消息通知直达：/archive?tab=expert → 自动切到专家复核记录
  if (route.query.tab === 'expert') {
    if (!store.user) {
      authOpenHint()
    } else {
      openTicketsTab()
    }
  }
})

// 切换地区后重新加载识别历史（按所选地区三级回退过滤）
watch(() => store.region, () => { load() })

/** 未登录点消息跳转 → 提示先登录 */
const authOpenHint = () => {
  store.showToast('请先登录后查看复核记录', 'info')
}

const runReview = async () => {
  if (reviewLoading.value) return
  reviewLoading.value = true
  try {
    review.value = await api.review({
      cropId: filterCrop.value || undefined,
      userId: store.recordsUserId
    })
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  } finally {
    reviewLoading.value = false
  }
}

const markRecovery = async (r: RecordItem, status: 'improved' | 'stable' | 'worse') => {
  try {
    await api.updateRecord(r.id, { recovery: r.recovery === status ? null : status })
    r.recovery = r.recovery === status ? null : status
    store.showToast('已记录恢复情况', 'success')
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  }
}

/** 删除单条诊断记录（带二次确认） */
const removeRecord = async (r: RecordItem) => {
  if (!window.confirm(`确定删除「${r.diagnosis?.results?.[0]?.name || '未知'}」这条诊断记录吗？删除后不可恢复。`)) return
  try {
    await api.deleteRecord(r.id)
    records.value = records.value.filter((x) => x.id !== r.id)
    store.showToast('已删除该记录', 'success')
  } catch (err) {
    store.showToast((err as Error).message || '删除失败', 'error')
  }
}

/** 清空全部诊断记录（带二次确认） */
const clearRecords = async () => {
  if (!records.value.length) return
  if (!window.confirm(`确定清空全部 ${records.value.length} 条诊断记录吗？删除后不可恢复。`)) return
  try {
    await Promise.all(records.value.map((r) => api.deleteRecord(r.id).catch(() => null)))
    records.value = []
    store.showToast('已清空全部记录', 'success')
  } catch (err) {
    store.showToast((err as Error).message || '删除失败', 'error')
  }
}

const riskMeta: Record<string, { label: string; color: string }> = {
  high: { label: '高风险', color: 'var(--c-danger)' },
  medium: { label: '中等风险', color: 'var(--c-accent-500)' },
  low: { label: '风险较低', color: 'var(--c-primary-600)' }
}

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* ==================== 🌱 病害样本共建（提交 → 专家审核 → 入库知识库） ==================== */
const showSampleForm = ref(false)
const sampleList = ref<DiseaseSample[]>([])
const sampleLoading = ref(false)
const sampleLoaded = ref(false)
const expandedSample = ref<number | null>(null)
const pendingSamples = computed(() => sampleList.value.filter((s) => s.status === 'pending'))

const openSampleTab = () => {
  activeTab.value = 'samples'
  loadSamples()
}

const loadSamples = async () => {
  if (!store.user) return
  sampleLoading.value = true
  try {
    const res = await api.myDiseaseSamples()
    sampleList.value = res.items || []
    sampleLoaded.value = true
  } catch (e: any) {
    store.showToast(e?.message || '共建样本加载失败', 'error')
  } finally {
    sampleLoading.value = false
  }
}

const sampleStatusMeta = (s: DiseaseSample) =>
  s.status === 'pending'
    ? { label: '待审核', color: '#b45309', bg: '#fef3c7', icon: '⏳' }
    : s.status === 'approved'
      ? { label: '审核通过 · 已入库', color: '#15803d', bg: '#dcfce7', icon: '✅' }
      : { label: '已驳回', color: '#b91c1c', bg: '#fee2e2', icon: '⚠️' }

/* ---- 提交表单 ---- */
const FORM_CROPS = computed(() => store.crops.filter((c) => c.diagnosable !== false))
const formCropId = ref('')          // 选中作物 id；'__custom__' 表示手动输入新作物
const formCustomCrop = ref('')
const formDesc = ref('')
const formImages = ref<string[]>([])
const formAltitude = ref('')
const formWeather = ref('')
const formSubmitting = ref(false)
const sampleInputRef = ref<HTMLInputElement | null>(null)

const openSampleForm = () => {
  if (!store.user) {
    store.showToast('请先登录后再提交共建样本', 'info')
    router.push('/login')
    return
  }
  showSampleForm.value = true
}

const closeSampleForm = () => {
  if (formSubmitting.value) return
  showSampleForm.value = false
}

const pickSampleImages = () => sampleInputRef.value?.click()

/** 图片压缩（与诊断页同一策略：最长边 1280、jpeg 0.86） */
const compressImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1280
        let { width, height } = img
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas 不可用'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.86))
      }
      img.onerror = () => reject(new Error('图片解析失败'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })

const handleSampleFiles = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const files = Array.from(target.files || [])
  target.value = ''
  if (!files.length) return
  if (formImages.value.length + files.length > 3) {
    store.showToast('样本图片最多 3 张', 'error')
    return
  }
  for (const file of files) {
    const okType =
      ['image/jpeg', 'image/png'].includes(file.type) || /\.(jpe?g|png)$/i.test(file.name || '')
    if (!okType) {
      store.showToast('仅支持jpg/png图片格式', 'error')
      continue
    }
    if (file.size > 10 * 1024 * 1024) {
      store.showToast('图片不能超过10MB，请压缩后重新上传', 'error')
      continue
    }
    try {
      formImages.value.push(await compressImage(file))
    } catch (err) {
      store.showToast((err as Error).message, 'error')
    }
  }
}

const removeSampleImage = (i: number) => {
  formImages.value.splice(i, 1)
}

const submitSample = async () => {
  if (formSubmitting.value) return
  const isCustom = formCropId.value === '__custom__'
  if (!formCropId.value) return store.showToast('请选择作物（或选择手动输入新作物）', 'error')
  if (isCustom && formCustomCrop.value.trim().length < 2)
    return store.showToast('请填写新作物名称（至少 2 个字）', 'error')
  if (formDesc.value.trim().length < 8)
    return store.showToast('请填写作物病害现象描述（至少 8 个字）', 'error')
  if (!formImages.value.length) return store.showToast('请至少上传 1 张样本图片', 'error')

  formSubmitting.value = true
  try {
    await api.createDiseaseSample({
      cropId: isCustom ? '' : formCropId.value,
      cropName: isCustom ? formCustomCrop.value.trim() : '',
      description: formDesc.value.trim(),
      images: formImages.value,
      altitude: formAltitude.value.trim(),
      weather: formWeather.value.trim(),
      region: store.user?.region || ''
    })
    store.showToast('样本已提交，等待专家审核', 'success')
    showSampleForm.value = false
    formCropId.value = ''
    formCustomCrop.value = ''
    formDesc.value = ''
    formImages.value = []
    formAltitude.value = ''
    formWeather.value = ''
    activeTab.value = 'samples'
    loadSamples()
  } catch (e: any) {
    store.showToast(e?.message || '提交失败，请稍后重试', 'error')
  } finally {
    formSubmitting.value = false
  }
}
</script>

<template>
  <div class="archive">
    <PageHero
      emoji="🗂️"
      title="我的种植档案"
      desc="记录每次诊断，AI 复盘帮您找出病害规律、给出下季种植建议"
      :badge="`${records.length} 条诊断记录`"
      badge-icon="camera"
      image="/media/banners/b39686331_wide.jpg"
    />

    <!-- 统计概览 -->
    <div class="overview">
      <div class="overview__item">
        <span class="overview__num">{{ records.length }}</span>
        <span class="overview__label">诊断次数</span>
      </div>
      <div class="overview__divider"></div>
      <div class="overview__item">
        <span class="overview__num">{{ new Set(records.map((r) => r.diagnosis?.results?.[0]?.name)).size }}</span>
        <span class="overview__label">涉及病害</span>
      </div>
      <div class="overview__divider"></div>
      <div class="overview__item">
        <span class="overview__num">{{ records.filter((r) => r.recovery === 'improved').length }}</span>
        <span class="overview__label">已好转</span>
      </div>
    </div>

    <!-- 🌱 知识库共建入口：提交病害样本（闭环源头） -->
    <button class="co-build" @click="openSampleForm">
      <span class="co-build__icon">🌱</span>
      <span class="co-build__body">
        <strong>提交病害样本共建本地知识库</strong>
        <small>拍照 + 描述病害现象，专家审核通过后自动并入病害图谱，帮助更多农户</small>
      </span>
      <span class="co-build__arrow"><AppIcon name="arrow-right" :size="15" /></span>
    </button>

    <!-- 标签 -->
    <nav class="tabs">
      <button
        class="tabs__item"
        :class="{ 'is-active': activeTab === 'records' }"
        @click="activeTab = 'records'"
      >
        <AppIcon name="list" :size="15" /> 诊断记录
      </button>
      <button
        class="tabs__item"
        :class="{ 'is-active': activeTab === 'review' }"
        @click="activeTab = 'review'; !review && runReview(); loadSavedReports()"
      >
        <AppIcon name="sparkle" :size="15" /> AI 复盘
      </button>
      <button class="tabs__item" :class="{ 'is-active': activeTab === 'expert' }" @click="openTicketsTab">
        <AppIcon name="shield" :size="15" /> 📝 复核记录
        <i v-if="pendingTickets.length" class="tabs__badge">{{ pendingTickets.length }}</i>
      </button>
      <button class="tabs__item" :class="{ 'is-active': activeTab === 'qa' }" @click="openQaTab">
        <AppIcon name="book" :size="15" /> 📖 历史问答
      </button>
      <button class="tabs__item" :class="{ 'is-active': activeTab === 'samples' }" @click="openSampleTab">
        <AppIcon name="leaf" :size="15" /> 🌱 共建样本
        <i v-if="pendingSamples.length" class="tabs__badge">{{ pendingSamples.length }}</i>
      </button>
      <button
        v-if="records.length"
        class="tabs__item tabs__item--danger"
        @click="clearRecords"
      >
        <AppIcon name="x" :size="15" /> 清空全部
      </button>
    </nav>

    <!-- ===== 记录列表 ===== -->
    <template v-if="activeTab === 'records'">
      <!-- 游客记录隔离提示 -->
      <div v-if="guestCount > 0 && !records.length" class="guest-hint">
        <AppIcon name="alert" :size="14" />
        本机还有 {{ guestCount }} 条<b>游客身份</b>的历史诊断（与当前账号互相隔离）。退出登录后可查看。
      </div>
      <!-- 作物筛选 -->
      <div class="filter-row">
        <button class="filter" :class="{ 'is-active': filterCrop === '' }" @click="filterCrop = ''">全部</button>
        <button
          v-for="c in store.crops"
          :key="c.id"
          class="filter"
          :class="{ 'is-active': filterCrop === c.id }"
          @click="filterCrop = c.id"
        >
          <CropEmoji class="ar-chip__emoji" :emoji="c.emoji" :name="c.name" :size="18" />
          {{ c.name }}
        </button>
      </div>

      <div v-if="loading" class="skeleton-list">
        <div v-for="i in 3" :key="i" class="skeleton-item"></div>
      </div>

      <div v-else-if="!filtered.length" class="empty">
        <EmptyState
          variant="record"
          title="你还没有诊断记录"
          desc="去智能诊断上传作物图片，30 秒生成诊断报告并自动归档到这里"
          action-text="去智能诊断"
          action-icon="camera"
          @action="router.push('/diagnose')"
        />
      </div>

      <div v-else class="record-list">
        <div v-for="r in filtered" :key="r.id" class="record">
          <button class="record__main" @click="router.push(`/result/${r.id}`)">
            <div class="record__left">
              <CropEmoji
                class="record__crop"
                :emoji="store.crops.find((c) => c.id === r.cropId)?.emoji || '🌿'"
                :name="r.cropName"
                :size="34"
              />
            </div>
            <div class="record__body">
              <div class="record__top">
                <strong class="record__disease">{{ r.diagnosis?.results?.[0]?.name || '未知' }}</strong>
                <span
                  class="record__conf"
                  :class="`is-${r.diagnosis?.results?.[0]?.confidenceLevel || 'medium'}`"
                >
                  {{ Math.round((r.diagnosis?.results?.[0]?.confidence || 0) * 100) }}%
                </span>
              </div>
              <p class="record__meta">
                {{ r.cropName }} · {{ fmtDate(r.createdAt) }}
                <template v-if="r.region && r.region !== '未标注'"> · {{ r.region }}</template>
              </p>
              <p v-if="r.symptomsText" class="record__symptom text-ellipsis">{{ r.symptomsText }}</p>
            </div>
            <AppIcon name="arrow-right" :size="15" class="record__arrow" />
          </button>

          <!-- 恢复情况标记 + 记录管理 -->
          <div class="record__foot">
            <span class="record__foot-label">现在怎么样了</span>
            <div class="record__recovery">
              <button
                v-for="(m, k) in recoveryMeta"
                :key="k"
                class="recovery-btn"
                :class="{ 'is-active': r.recovery === k }"
                :style="r.recovery === k ? { color: m.color, background: m.bg } : {}"
                @click="markRecovery(r, k as any)"
              >
                {{ m.label }}
              </button>
              <button class="recovery-btn recovery-btn--danger" @click="removeRecord(r)">🗑 删除</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== AI 复盘 ===== -->
    <template v-else-if="activeTab === 'review'">
      <div v-if="reviewLoading" class="review-loading">
        <div class="review-loading__spark"><AppIcon name="sparkle" :size="22" /></div>
        <p>AI 正在分析您的种植记录…</p>
      </div>

      <template v-else-if="review">
        <div class="review-card">
          <div class="review-card__head">
            <span class="review-card__tag" :style="{ color: riskMeta[review.riskLevel].color }">
              风险等级 · {{ riskMeta[review.riskLevel].label }}
            </span>
            <span class="review-card__count">{{ review.recordCount }} 条记录</span>
          </div>
          <p class="review-card__pattern">{{ review.pattern }}</p>
        </div>

        <!-- 历史病害统计 -->
        <div v-if="review.stats?.diseaseCounts?.length" class="rv-stat">
          <h3 class="rv-stat__title">历史病害统计</h3>
          <div class="rv-bar" v-for="d in review.stats.diseaseCounts.slice(0, 5)" :key="d.name">
            <span class="rv-bar__name">{{ d.name }}</span>
            <span class="rv-bar__track">
              <i class="rv-bar__fill" :style="{ width: Math.round(d.ratio * 100) + '%' }" />
            </span>
            <span class="rv-bar__num">{{ d.count }} 次</span>
          </div>
          <p class="rv-stat__foot">
            统计区间：近 {{ review.stats.spanDays || 0 }} 天 · 平均识别置信度
            {{ review.stats.avgConfidence ? Math.round(review.stats.avgConfidence * 100) + '%' : '—' }}
          </p>
        </div>

        <!-- 发病时间规律 -->
        <div v-if="review.stats?.monthly?.length" class="rv-stat">
          <h3 class="rv-stat__title">发病时间规律</h3>
          <div class="rv-months">
            <div v-for="m in review.stats.monthly" :key="m.month" class="rv-month">
              <span class="rv-month__bar" :style="{ height: Math.max(8, Math.min(56, m.count * 16)) + 'px' }" />
              <span class="rv-month__n">{{ m.count }}</span>
              <span class="rv-month__label">{{ m.month }}</span>
            </div>
          </div>
          <p class="rv-stat__foot">柱高为该月诊断次数，集中在雨季高湿月份时建议提前预防</p>
        </div>

        <div class="suggestions">
          <h3 class="suggestions__title">改进建议</h3>
          <div v-for="(s, i) in review.suggestions" :key="i" class="suggestion">
            <span class="suggestion__idx">{{ i + 1 }}</span>
            <div>
              <strong>{{ s.title }}</strong>
              <p>{{ s.detail }}</p>
            </div>
          </div>
        </div>

        <div class="focus-card">
          <AppIcon name="leaf" :size="17" />
          <div>
            <strong>下一季最该预防</strong>
            <p>{{ review.nextSeasonFocus }}</p>
          </div>
        </div>

        <div class="rv-actions">
          <button class="btn btn--primary" style="flex: 1" :disabled="savingReview" @click="saveReview">
            <AppIcon name="book" :size="16" /> {{ savingReview ? '保存中…' : '保存复盘报告' }}
          </button>
          <button class="btn btn--outline" style="flex: 1" @click="runReview">
            <AppIcon name="refresh" :size="16" /> 重新分析
          </button>
        </div>
      </template>

      <!-- 已保存的复盘报告（可点开回看） -->
      <div v-if="savedReports.length" class="saved-rv">
        <h3 class="saved-rv__title">已保存的复盘报告 · {{ savedReports.length }}</h3>
        <div v-for="r in savedReports" :key="r.id" class="saved-rv__item">
          <button class="saved-rv__head" @click="expandReport = expandReport === r.id ? null : r.id">
            <span class="saved-rv__icon"><AppIcon name="sparkle" :size="15" /></span>
            <span class="saved-rv__main">
              <strong>{{ r.cropName || '全部作物' }} · 复盘报告</strong>
              <small>{{ new Date(r.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }} · {{ r.report?.recordCount || 0 }} 条记录</small>
            </span>
            <AppIcon :name="expandReport === r.id ? 'chevron-up' : 'chevron-down'" :size="15" />
          </button>
          <div v-if="expandReport === r.id" class="saved-rv__body">
            <p class="saved-rv__pattern">{{ r.report?.pattern }}</p>
            <div v-for="(s, i) in (r.report?.suggestions || [])" :key="i" class="saved-rv__sug">
              <strong>{{ i + 1 }}. {{ s.title }}</strong>
              <p>{{ s.detail }}</p>
            </div>
            <p class="saved-rv__focus">下一季重点：{{ r.report?.nextSeasonFocus }}</p>
            <button class="saved-rv__del" @click="removeReport(r.id)">删除这份报告</button>
          </div>
        </div>
      </div>

      <div v-else class="empty">
        <AppIcon name="sparkle" :size="32" />
        <p>暂无复盘数据</p>
        <button class="btn btn--primary" @click="runReview">开始分析</button>
      </div>
    </template>

    <!-- ===== 专家复核工单记录 ===== -->
    <template v-if="activeTab === 'expert'">
      <div v-if="ticketsLoading" class="skeleton-list">
        <div v-for="i in 2" :key="i" class="skeleton-item"></div>
      </div>

      <div v-else-if="!expertTickets.length" class="empty">
        <AppIcon name="shield" :size="32" />
        <p>还没有复核工单</p>
        <small>AI 诊断置信度偏低（&lt;85%）时，可在诊断页一键提交专家人工复核，进度会显示在这里</small>
        <button class="btn btn--primary" style="margin-top: 16px" @click="router.push('/diagnose')">
          <AppIcon name="camera" :size="16" /> 去诊断
        </button>
      </div>

      <div v-else class="tk-list">
        <div
          v-for="t in expertTickets"
          :key="t.id"
          class="tk"
          :class="{ 'is-done': t.status === 'done' }"
        >
          <div class="tk__head">
            <span class="tk__badge" :style="ticketStatusMeta(t)">
              {{ ticketStatusMeta(t).icon }} {{ ticketStatusMeta(t).label }}
            </span>
            <small class="tk__time">提交时间 {{ fmtDate(t.createdAt) }}</small>
          </div>
          <div class="tk__body">
            <div v-if="t.image" class="tk__thumb" @click="expandedTicket = expandedTicket === t.id ? null : t.id">
              <img :src="t.image" alt="上报照片" />
            </div>
            <div class="tk__info">
              <p class="tk__row"><b>工单号</b>#TK{{ String(t.id).padStart(4, '0') }} · {{ store.crops.find((c) => c.id === t.cropId)?.name || t.cropId || '未指定作物' }}</p>
              <p class="tk__row"><b>AI 初步诊断</b>{{ t.aiDisease || '—' }}<i v-if="t.aiConfidence != null" class="tk__conf">置信度 {{ Math.round(t.aiConfidence * 100) }}%</i></p>
              <p v-if="t.region" class="tk__row"><b>地区</b>{{ t.region }}</p>
            </div>
          </div>

          <!-- 待复核：不可操作，仅展示状态 -->
          <p v-if="t.status === 'pending'" class="tk__pending">⏳ 等待专家处理中，完成后将通过消息通知您</p>

          <!-- 已复核完成：点开查看专家意见与最终结论 -->
          <template v-else>
            <button class="tk__expand" @click="expandedTicket = expandedTicket === t.id ? null : t.id">
              {{ expandedTicket === t.id ? '收起复核结果 ▴' : '查看复核结果 ▾' }}
            </button>
            <div v-if="expandedTicket === t.id" class="tk__result">
              <p class="tk__final" :class="{ 'is-reject': t.outcome === 'rejected' }">
                <b>最终诊断结论</b>{{ t.finalDisease || '—' }}
              </p>
              <p class="tk__opinion"><b>专家复核意见</b>{{ t.opinion }}</p>
              <p class="tk__meta">
                复核专家：{{ t.expertName || '农技专家' }} · 完成时间 {{ fmtDate(t.completedAt || '') }}
              </p>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- ===== 📖 历史问答记录 ===== -->
    <template v-if="activeTab === 'qa'">
      <div v-if="!store.user" class="qa-hint">
        <AppIcon name="alert" :size="15" />
        <p>登录后，您的每一轮农技问答会自动归档到这里。</p>
        <button class="btn btn--primary" @click="$router.push('/login')">去登录</button>
      </div>
      <template v-else>
        <div v-if="qaLoading" class="qa-loading">加载中…</div>
        <div v-else-if="!qaList.length" class="qa-hint qa-hint--empty">
          <EmptyState
            variant="qa"
            title="还没有咨询记录"
            desc="在上方输入框提问你的作物问题，每轮问答都会自动归档到这里"
            action-text="去农技问答"
            action-icon="chat"
            @action="$router.push('/qa')"
          />
        </div>
        <div v-else class="qa-list">
          <div
            v-for="q in qaList"
            :key="q.id"
            class="qa-item"
            :class="{ 'is-open': qaExpanded === q.id }"
            @click="qaExpanded = qaExpanded === q.id ? null : q.id"
          >
            <div class="qa-item__top">
              <span class="qa-item__time">{{ qaTime(q.createdAt) }}</span>
              <span
                v-if="q.noHit"
                class="qa-item__badge qa-item__badge--nohit"
              >知识库未命中 · 已兜底</span>
              <span v-else-if="q.sources?.length" class="qa-item__badge">{{ q.sources.length }} 条来源</span>
            </div>
            <p class="qa-item__q">{{ q.question }}</p>
            <p class="qa-item__a" :class="{ 'is-full': qaExpanded === q.id }">
              {{ qaExpanded === q.id ? q.answer : q.answer.slice(0, 80) + (q.answer.length > 80 ? '…' : '') }}
            </p>
            <div v-if="qaExpanded === q.id && q.sources?.length" class="qa-item__srcs">
              <span v-for="s in q.sources" :key="s.name" class="qa-item__src">📑 {{ s.name }} · {{ Math.round(s.score * 100) }}%</span>
            </div>
            <button class="qa-item__toggle">
              {{ qaExpanded === q.id ? '收起 ▴' : '展开完整回答 ▾' }}
            </button>
          </div>
        </div>
      </template>
    </template>

    <!-- ===== 🌱 我提交的共建样本 ===== -->
    <template v-if="activeTab === 'samples'">
      <div v-if="!store.user" class="qa-hint">
        <AppIcon name="alert" :size="15" />
        <p>登录后可提交病害样本，参与本地知识库共建。</p>
        <button class="btn btn--primary" @click="$router.push('/login')">去登录</button>
      </div>
      <template v-else>
        <div v-if="sampleLoading" class="qa-loading">加载中…</div>
        <div v-else-if="!sampleList.length" class="qa-hint">
          <span style="font-size: 30px">🌱</span>
          <p>还没有提交过共建样本，点击上方绿色卡片上传你遇到的病害照片</p>
          <button class="btn btn--primary" @click="openSampleForm">提交病害样本</button>
        </div>
        <div v-else class="sm-list">
          <div
            v-for="s in sampleList"
            :key="s.id"
            class="sm"
            :class="{ 'is-open': expandedSample === s.id }"
          >
            <div class="sm__head" @click="expandedSample = expandedSample === s.id ? null : s.id">
              <div class="sm__thumb">
                <img :src="s.images[0]" alt="样本图片" />
                <i v-if="s.images.length > 1" class="sm__thumb-n">{{ s.images.length }} 张</i>
              </div>
              <div class="sm__info">
                <p class="sm__crop">🌿 {{ s.cropName }}</p>
                <p class="sm__desc text-ellipsis">{{ s.description }}</p>
                <p class="sm__time">{{ fmtDate(s.createdAt) }}</p>
              </div>
              <span class="sm__badge" :style="{ color: sampleStatusMeta(s).color, background: sampleStatusMeta(s).bg }">
                {{ sampleStatusMeta(s).icon }} {{ sampleStatusMeta(s).label }}
              </span>
            </div>

            <div v-if="expandedSample === s.id" class="sm__body">
              <div class="sm__imgs">
                <img v-for="(img, i) in s.images" :key="i" :src="img" alt="样本图片" />
              </div>
              <p class="sm__row"><b>病害现象描述</b>{{ s.description }}</p>
              <p v-if="s.altitude || s.weather" class="sm__row">
                <b>发生环境</b>{{ [s.altitude && `海拔 ${s.altitude}`, s.weather].filter(Boolean).join(' · ') }}
              </p>
              <p v-if="s.status === 'approved'" class="sm__row sm__row--ok">
                <b>专家定名</b>{{ s.diseaseName || '—' }}<i class="sm__hint">已并入病害图谱知识库</i>
              </p>
              <p v-if="s.treatment" class="sm__row"><b>防治建议</b>{{ s.treatment }}</p>
              <p v-if="s.status === 'rejected'" class="sm__row sm__row--bad">
                <b>驳回理由</b>{{ s.note || '—' }}
              </p>
              <p v-if="s.status === 'pending'" class="sm__row sm__row--wait">
                <b>进度</b>专家审核中，结果将通过站内消息通知您
              </p>
              <p v-if="s.reviewer" class="sm__meta">审核专家：{{ s.reviewer }} · {{ fmtDate(s.reviewedAt) }}</p>
            </div>
          </div>
        </div>
      </template>
    </template>

    <p class="foot-note">
      AI 复盘基于您的历史诊断记录生成，仅供参考
    </p>

    <!-- ===== 🌱 提交病害样本表单弹窗 ===== -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showSampleForm" class="sf-mask" @click.self="closeSampleForm">
          <div class="sf">
            <header class="sf__head">
              <div>
                <h2>🌱 提交病害样本</h2>
                <p>专家审核通过后将自动并入本地病害图谱知识库</p>
              </div>
              <button class="sf__close" @click="closeSampleForm"><AppIcon name="x" :size="15" /></button>
            </header>

            <div class="sf__body">
              <label class="sf__label">作物名称 <i>必填</i></label>
              <select v-model="formCropId" class="sf__select">
                <option value="" disabled>请选择系统已有作物</option>
                <option v-for="c in FORM_CROPS" :key="c.id" :value="c.id">{{ c.emoji }} {{ c.name }}</option>
                <option value="__custom__">✍️ 其他作物（手动输入）</option>
              </select>
              <input
                v-if="formCropId === '__custom__'"
                v-model="formCustomCrop"
                class="sf__input"
                maxlength="12"
                placeholder="输入新作物名称，如：玛卡、黄精"
              />

              <label class="sf__label">病害现象描述 <i>必填 · 至少 8 个字</i></label>
              <textarea
                v-model="formDesc"
                class="sf__textarea"
                rows="3"
                maxlength="500"
                placeholder="描述作物表现，例如：叶片出现褐色斑点并逐步扩大、根部腐烂发臭…"
              />

              <label class="sf__label">样本图片 <i>必填 · 1–3 张（发病部位清晰照片）</i></label>
              <div class="sf__imgs">
                <div v-for="(img, i) in formImages" :key="i" class="sf__img">
                  <img :src="img" alt="样本预览" />
                  <button class="sf__img-del" @click="removeSampleImage(i)">×</button>
                </div>
                <button v-if="formImages.length < 3" class="sf__img-add" @click="pickSampleImages">
                  <AppIcon name="camera" :size="18" />
                  <span>{{ formImages.length ? '继续添加' : '上传图片' }}</span>
                </button>
              </div>
              <input ref="sampleInputRef" type="file" accept="image/jpeg,image/png" multiple hidden @change="handleSampleFiles" />

              <label class="sf__label">发生环境 <i>选填</i></label>
              <div class="sf__env">
                <input v-model="formAltitude" class="sf__input" maxlength="30" placeholder="海拔，如 1800m" />
                <input v-model="formWeather" class="sf__input" maxlength="30" placeholder="天气，如 连续阴雨 5 天" />
              </div>
            </div>

            <footer class="sf__foot">
              <button class="sf__btn sf__btn--cancel" :disabled="formSubmitting" @click="closeSampleForm">取消</button>
              <button class="sf__btn sf__btn--submit" :disabled="formSubmitting" @click="submitSample">
                {{ formSubmitting ? '提交中…' : '提交样本' }}
              </button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.archive {
  min-height: 100dvh;
  padding-bottom: 24px;
  background: var(--c-bg-page);
}

.head {
  padding: 22px 20px 14px;
}

.head__title {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.5px;
  margin-bottom: 3px;
}

.head__sub {
  font-size: 12px;
  color: var(--c-text-4);
}

/* 概览 */
.overview {
  display: flex;
  align-items: center;
  margin: 0 20px 16px;
  padding: 16px 8px;
  border-radius: var(--r-lg);
  background: linear-gradient(150deg, #fff, #f7fbf9);
  border: 1px solid var(--c-primary-100);
  box-shadow: var(--sh-xs);
}

.overview__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.overview__num {
  font-family: var(--font-num);
  font-size: 22px;
  font-weight: 700;
  color: var(--c-primary-700);
  line-height: 1.2;
}

.overview__label {
  font-size: 11.5px;
  color: var(--c-text-4);
}

.overview__divider {
  width: 1px;
  height: 24px;
  background: var(--c-line);
}

/* Tabs */
.tabs {
  display: flex;
  gap: 6px;
  margin: 0 20px 14px;
  padding: 4px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
}

.tabs__item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 36px;
  border-radius: var(--r-full);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--c-text-3);
  transition: all var(--dur-base) var(--ease-out);
}

.tabs__badge {
  font-style: normal;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--r-full);
  background: var(--c-danger);
  color: #fff;
  font-size: 11.5px;
  font-weight: 800;
  display: grid;
  place-items: center;
}

/* ==================== 专家复核工单记录 ==================== */
.tk-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tk {
  padding: 13px 14px;
  border-radius: 14px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.tk__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.tk__badge {
  font-size: 11.5px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: var(--r-full);
  white-space: nowrap;
}

.tk__time {
  font-size: 11.5px;
  color: var(--c-text-4);
  flex-shrink: 0;
}

.tk__body {
  display: flex;
  gap: 11px;
}

.tk__thumb {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  cursor: zoom-in;
  border: 1px solid var(--c-line-soft);
}

.tk__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tk__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tk__row {
  font-size: 12px;
  line-height: 1.6;
  color: var(--c-text-2);
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.tk__row b {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-4);
  background: var(--c-bg-muted);
  border-radius: 5px;
  padding: 1px 7px;
  flex-shrink: 0;
}

.tk__conf {
  font-style: normal;
  font-size: 11.5px;
  font-weight: 700;
  color: #b45309;
  background: #fef3c7;
  border-radius: var(--r-full);
  padding: 1px 8px;
}

.tk__pending {
  margin-top: 10px;
  font-size: 11.5px;
  color: #92400e;
  background: #fffbeb;
  border: 1px dashed #fcd34d;
  border-radius: 9px;
  padding: 8px 11px;
  line-height: 1.6;
}

.tk__expand {
  width: 100%;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed var(--c-line-soft);
  font-size: 12px;
  font-weight: 700;
  color: var(--c-primary-700);
  text-align: left;
}

.tk__result {
  margin-top: 9px;
  padding: 11px 12px;
  border-radius: 10px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.tk__final {
  font-size: 13px;
  font-weight: 700;
  color: #14532d;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tk__final.is-reject {
  color: #b91c1c;
}

.tk__final b,
.tk__opinion b,
.tk__meta b {
  font-size: 11.5px;
  font-weight: 800;
  color: #15803d;
  background: rgba(21, 128, 61, 0.1);
  border-radius: 5px;
  padding: 1px 7px;
  flex-shrink: 0;
}

.tk__final.is-reject b {
  color: #b91c1c;
  background: rgba(185, 28, 28, 0.08);
}

.tk__opinion {
  font-size: 12px;
  line-height: 1.75;
  color: var(--c-text-2);
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.tk__meta {
  font-size: 11.5px;
  color: var(--c-text-4);
  display: flex;
  align-items: center;
  gap: 8px;
}

.tabs__item--danger {
  flex: 0 0 auto;
  padding: 0 12px;
  color: var(--c-danger);
}

.tabs__item.is-active {
  background: var(--c-bg-card);
  color: var(--c-primary-700);
  box-shadow: var(--sh-xs);
}

/* 筛选 */
.filter-row {
  display: flex;
  gap: 6px;
  padding: 0 20px 12px;
  overflow-x: auto;
  scrollbar-width: none;
}

.filter-row::-webkit-scrollbar {
  display: none;
}

.filter {
  padding: 5px 12px;
  border-radius: var(--r-full);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line);
  font-size: 11.5px;
  color: var(--c-text-3);
  white-space: nowrap;
  transition: all var(--dur-fast);
}

.filter.is-active {
  background: var(--c-primary-600);
  border-color: var(--c-primary-600);
  color: #fff;
  font-weight: 600;
}

/* 骨架 */
.skeleton-list {
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skeleton-item {
  height: 100px;
  border-radius: var(--r-md);
  background: linear-gradient(90deg, #eef2f0 25%, #f7faf8 50%, #eef2f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

/* 空态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 24px;
  text-align: center;
  color: var(--c-text-4);
}

.empty :deep(.icon) {
  margin-bottom: 12px;
  opacity: 0.45;
}

.empty p {
  font-size: 13.5px;
  color: var(--c-text-3);
  margin-bottom: 4px;
}

.empty small {
  font-size: 11.5px;
  line-height: 1.6;
}

/* 记录卡 */
.record-list {
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.record {
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  overflow: hidden;
}

.record__main {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 13px 14px;
  text-align: left;
}

.record__crop {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: var(--c-bg-muted);
  font-size: 19px;
  flex-shrink: 0;
}

.record__body {
  flex: 1;
  min-width: 0;
}

.record__top {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 3px;
}

.record__disease {
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.record__conf {
  padding: 1px 7px;
  border-radius: 5px;
  font-size: 11.5px;
  font-weight: 700;
  flex-shrink: 0;
}

.record__conf.is-high {
  background: var(--c-primary-50);
  color: var(--c-primary-700);
}
.record__conf.is-medium {
  background: var(--c-warning-bg);
  color: #92400e;
}
.record__conf.is-low {
  background: var(--c-danger-bg);
  color: #b91c1c;
}

.record__meta {
  font-size: 11.5px;
  color: var(--c-text-4);
  margin-bottom: 3px;
}

.record__symptom {
  font-size: 11.5px;
  color: var(--c-text-3);
}

.record__arrow {
  color: var(--c-text-4);
  flex-shrink: 0;
}

.record__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 14px;
  border-top: 1px dashed var(--c-line);
  background: var(--c-bg-muted);
}

.record__foot-label {
  font-size: 11.5px;
  color: var(--c-text-4);
  flex-shrink: 0;
}

.record__recovery {
  display: flex;
  gap: 5px;
}

.recovery-btn {
  padding: 3px 9px;
  border-radius: var(--r-full);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line);
  font-size: 11.5px;
  color: var(--c-text-3);
  transition: all var(--dur-fast);
}

.recovery-btn.is-active {
  border-color: currentColor;
  font-weight: 600;
}

.recovery-btn--danger {
  color: var(--c-danger);
}

/* 复盘 */
/* 复盘统计：病害频次条 + 月份柱状 */
.rv-stat {
  margin-top: 14px;
  padding: 16px 16px 14px;
  border-radius: var(--r-md);
  background: #fff;
  box-shadow: var(--sh-xs);
}
.rv-stat__title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--c-text);
}
.rv-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 9px;
}
.rv-bar__name {
  flex: 0 0 86px;
  font-size: 12.5px;
  color: var(--c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rv-bar__track {
  flex: 1;
  height: 9px;
  border-radius: 999px;
  background: #eef3f0;
  overflow: hidden;
}
.rv-bar__fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #6fbf95, #2e8b62);
  transition: width 0.5s ease;
}
.rv-bar__num {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  color: var(--c-primary-700, #1d6b4a);
}
.rv-stat__foot {
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--c-text-3);
  line-height: 1.6;
}
.rv-months {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  min-height: 86px;
  padding: 0 2px;
}
.rv-month {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}
.rv-month__bar {
  width: 22px;
  border-radius: 5px 5px 2px 2px;
  background: linear-gradient(180deg, #7fd0a6, #2e8b62);
}
.rv-month__n {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-primary-700, #1d6b4a);
}
.rv-month__label {
  font-size: 11px;
  color: var(--c-text-3);
}
.rv-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

/* 已保存复盘报告 */
.saved-rv {
  margin-top: 22px;
}
.saved-rv__title {
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 10px;
  color: var(--c-text);
}
.saved-rv__item {
  background: #fff;
  border-radius: var(--r-md);
  box-shadow: var(--sh-xs);
  margin-bottom: 10px;
  overflow: hidden;
}
.saved-rv__head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 14px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}
.saved-rv__icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: var(--c-primary-50, #eef8f2);
  color: var(--c-primary-600, #2e8b62);
  flex-shrink: 0;
}
.saved-rv__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.saved-rv__main strong {
  font-size: 13.5px;
  color: var(--c-text);
}
.saved-rv__main small {
  font-size: 11.5px;
  color: var(--c-text-3);
}
.saved-rv__body {
  padding: 0 14px 14px;
  border-top: 1px dashed var(--c-border, #e8eeea);
  padding-top: 12px;
}
.saved-rv__pattern {
  font-size: 13px;
  line-height: 1.7;
  color: var(--c-text-2);
}
.saved-rv__sug {
  margin-top: 10px;
}
.saved-rv__sug strong {
  font-size: 12.5px;
  color: var(--c-text);
}
.saved-rv__sug p {
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--c-text-2);
  margin-top: 2px;
}
.saved-rv__focus {
  margin-top: 12px;
  padding: 9px 11px;
  border-radius: 9px;
  background: var(--c-primary-50, #eef8f2);
  font-size: 12.5px;
  color: var(--c-primary-700, #1d6b4a);
  line-height: 1.6;
}
.saved-rv__del {
  margin-top: 12px;
  padding: 0;
  background: none;
  border: none;
  color: var(--c-danger, #e05252);
  font-size: 12px;
  cursor: pointer;
}

.review-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 70px 24px;
  color: var(--c-text-3);
  font-size: 12.5px;
}

.review-loading__spark {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(140deg, var(--c-primary-400), var(--c-primary-700));
  animation: pulse 1.8s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(47, 152, 104, 0.4);
  }
  70% {
    box-shadow: 0 0 0 16px rgba(47, 152, 104, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(47, 152, 104, 0);
  }
}

.review-card {
  margin: 0 20px 16px;
  padding: 16px;
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.review-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.review-card__tag {
  font-size: 12.5px;
  font-weight: 700;
}

.review-card__count {
  font-size: 11.5px;
  color: var(--c-text-4);
}

.review-card__pattern {
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--c-text-1);
  font-weight: 500;
}

.suggestions {
  margin: 0 20px 16px;
}

.suggestions__title {
  font-size: 13.5px;
  font-weight: 700;
  margin-bottom: 10px;
}

.suggestion {
  display: flex;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  margin-bottom: 8px;
}

.suggestion__idx {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: var(--c-primary-600);
  color: #fff;
  font-size: 11.5px;
  font-weight: 700;
  flex-shrink: 0;
}

.suggestion strong {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  margin-bottom: 3px;
}

.suggestion p {
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--c-text-3);
}

.focus-card {
  display: flex;
  gap: 11px;
  margin: 0 20px;
  padding: 14px 15px;
  border-radius: var(--r-md);
  background: linear-gradient(135deg, var(--c-primary-50), var(--c-primary-100));
  border: 1px solid var(--c-primary-200);
  align-items: flex-start;
}

.focus-card :deep(.icon) {
  color: var(--c-primary-600);
  flex-shrink: 0;
  margin-top: 1px;
}

.focus-card strong {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-primary-800);
  margin-bottom: 3px;
}

.focus-card p {
  font-size: 12px;
  line-height: 1.65;
  color: var(--c-primary-800);
}

.foot-note {
  padding: 22px 20px 8px;
  text-align: center;
  font-size: 11.5px;
  color: var(--c-text-4);
}
</style>

<style scoped>
@media (min-width: 960px) {
  .head {
    padding: 32px 32px 18px;
  }
  /* 桌面端统一内容宽度：所有区块同宽居中，避免有的宽有的窄 */
  .overview,
  .tabs,
  .filter-row,
  .record-list,
  .skeleton-list,
  .review-card,
  .suggestions,
  .focus-card,
  .co-build,
  .guest-hint,
  .qa-list,
  .qa-hint,
  .sm-list,
  .tk-list {
    max-width: 1020px;
    margin-left: auto;
    margin-right: auto;
    width: calc(100% - 64px);
  }
  /* 标签行：桌面端按钮自适应宽度、允许换行，清空按钮靠右 */
  .tabs {
    flex-wrap: wrap;
    padding: 5px;
  }
  .tabs__item {
    flex: 0 1 auto;
    padding: 0 20px;
  }
  .tabs__item--danger {
    margin-left: auto;
  }
  /* 作物筛选条：桌面端换行铺开，不再横向裁切 */
  .filter-row {
    flex-wrap: wrap;
    overflow-x: visible;
  }
  .record-list {
    width: calc(100% - 64px);
  }
}

/* 游客记录隔离提示 */
.guest-hint {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 13px;
  margin-bottom: 12px;
  border-radius: 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 11.5px;
  line-height: 1.5;
}

.guest-hint b {
  font-weight: 800;
}

/* ===== 📖 历史问答记录 ===== */
.qa-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 16px;
  border-radius: var(--r-md);
  background: var(--c-bg-muted);
  border: 1px dashed var(--c-line);
  color: var(--c-text-3);
  font-size: 12.5px;
  text-align: center;
}

.qa-loading {
  padding: 30px 0;
  text-align: center;
  font-size: 12px;
  color: var(--c-text-4);
}

.qa-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.qa-item {
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  cursor: pointer;
  transition: box-shadow var(--dur-base) var(--ease-out);
}

.qa-item:hover {
  box-shadow: var(--shadow-sm);
}

.qa-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}

.qa-item__time {
  font-size: 11.5px;
  color: var(--c-text-4);
}

.qa-item__badge {
  padding: 2px 8px;
  border-radius: var(--r-full);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-primary-700);
  background: var(--c-accent-100);
}

.qa-item__badge--nohit {
  color: #b45309;
  background: #fef3c7;
}

.qa-item__q {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text-1);
  line-height: 1.5;
}

.qa-item__a {
  margin-top: 5px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--c-text-3);
  white-space: pre-wrap;
  word-break: break-word;
}

.qa-item__srcs {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 7px;
}

.qa-item__src {
  padding: 2px 8px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
  font-size: 11.5px;
  color: var(--c-text-2);
}

.qa-item__toggle {
  margin-top: 7px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--c-primary-600);
}

/* ===== 🌱 知识库共建入口卡片 ===== */
.co-build {
  display: flex;
  align-items: center;
  gap: 11px;
  width: calc(100% - 40px);
  margin: 0 20px 14px;
  padding: 13px 15px;
  border-radius: var(--r-md);
  text-align: left;
  background: linear-gradient(115deg, #e8f7ee, #f4fbf7 65%, #eef9f1);
  border: 1px solid #bfe5cc;
  box-shadow: var(--sh-xs);
  transition: transform var(--dur-fast), box-shadow var(--dur-fast);
}

.co-build:hover {
  transform: translateY(-1px);
  box-shadow: var(--sh-sm);
}

.co-build__icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: 21px;
  line-height: 1;
  /* emoji 字形自带下沉基线，微调 1px 与右侧两行文字视觉居中对齐 */
  transform: translateY(-1px);
}

.co-build__body {
  flex: 1;
  min-width: 0;
}

.co-build__body strong {
  display: block;
  font-size: 13.5px;
  font-weight: 800;
  color: #14532d;
}

.co-build__body small {
  display: block;
  margin-top: 3px;
  font-size: 11.5px;
  line-height: 1.5;
  color: #3d7a54;
}

.co-build__arrow {
  color: #2f9868;
  flex-shrink: 0;
}

/* ===== 🌱 共建样本列表 ===== */
.sm-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sm {
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  overflow: hidden;
}

.sm__head {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px 14px;
  cursor: pointer;
}

.sm__thumb {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 10px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid var(--c-line-soft);
}

.sm__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sm__thumb-n {
  position: absolute;
  right: 0;
  bottom: 0;
  font-style: normal;
  font-size: 11.5px;
  font-weight: 800;
  padding: 1px 5px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border-top-left-radius: 7px;
}

.sm__info {
  flex: 1;
  min-width: 0;
}

.sm__crop {
  font-size: 13px;
  font-weight: 800;
  color: var(--c-text-1);
}

.sm__desc {
  font-size: 11.5px;
  color: var(--c-text-3);
  margin-top: 2px;
}

.sm__time {
  font-size: 11.5px;
  color: var(--c-text-4);
  margin-top: 2px;
}

.sm__badge {
  font-size: 11.5px;
  font-weight: 800;
  padding: 3px 9px;
  border-radius: var(--r-full);
  white-space: nowrap;
  flex-shrink: 0;
}

.sm__body {
  padding: 11px 14px 13px;
  border-top: 1px dashed var(--c-line-soft);
}

.sm__imgs {
  display: flex;
  gap: 7px;
  margin-bottom: 10px;
}

.sm__imgs img {
  width: 86px;
  height: 86px;
  object-fit: cover;
  border-radius: 9px;
  border: 1px solid var(--c-line-soft);
}

.sm__row {
  font-size: 12px;
  line-height: 1.7;
  color: var(--c-text-2);
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 5px;
}

.sm__row b {
  font-size: 11.5px;
  font-weight: 800;
  color: var(--c-text-4);
  background: var(--c-bg-muted);
  border-radius: 5px;
  padding: 1px 7px;
  flex-shrink: 0;
  margin-top: 2px;
  white-space: nowrap;
}

.sm__row--ok b { color: #15803d; background: #dcfce7; }
.sm__row--bad b { color: #b91c1c; background: #fee2e2; }
.sm__row--wait b { color: #92400e; background: #fef3c7; }

.sm__hint {
  font-style: normal;
  font-size: 11.5px;
  font-weight: 700;
  color: #15803d;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: var(--r-full);
  padding: 1px 7px;
  white-space: nowrap;
}

.sm__meta {
  margin-top: 7px;
  font-size: 11.5px;
  color: var(--c-text-4);
}

/* ===== 🌱 提交样本表单弹窗 ===== */
.sf-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(16, 30, 22, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sf {
  width: min(520px, 100%);
  max-height: 88dvh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-card);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.2);
}

.sf__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--c-line-soft);
}

.sf__head h2 {
  font-size: 16.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.sf__head p {
  font-size: 11.5px;
  color: var(--c-text-4);
  margin-top: 3px;
}

.sf__close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
}

.sf__body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 18px;
}

.sf__label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: var(--c-text-2);
  margin: 12px 0 6px;
}

.sf__label:first-child { margin-top: 0; }

.sf__label i {
  font-style: normal;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--c-text-4);
  margin-left: 6px;
}

.sf__select,
.sf__input,
.sf__textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-subtle);
  font-size: 13px;
  transition: border-color var(--dur-fast);
}

.sf__select:focus,
.sf__input:focus,
.sf__textarea:focus {
  border-color: var(--c-primary-400);
  background: #fff;
  outline: none;
}

.sf__input { margin-top: 8px; }

.sf__textarea {
  line-height: 1.6;
  resize: none;
}

.sf__imgs {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
}

.sf__img {
  position: relative;
  width: 84px;
  height: 84px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--c-line-soft);
}

.sf__img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.sf__img-del {
  position: absolute;
  right: 3px;
  top: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 13px;
  line-height: 1;
  display: grid;
  place-items: center;
}

.sf__img-add {
  width: 84px;
  height: 84px;
  border-radius: 10px;
  border: 1.5px dashed var(--c-line);
  background: var(--c-bg-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--c-text-4);
  font-size: 11.5px;
}

.sf__env {
  display: flex;
  gap: 8px;
}

.sf__env .sf__input { margin-top: 0; }

.sf__foot {
  display: flex;
  gap: 10px;
  padding: 12px 18px 16px;
  border-top: 1px solid var(--c-line-soft);
}

.sf__btn {
  flex: 1;
  height: 44px;
  border-radius: var(--r-full);
  font-size: 13.5px;
  font-weight: 700;
}

.sf__btn--cancel {
  flex: 0 0 110px;
  background: var(--c-bg-muted);
  color: var(--c-text-3);
}

.sf__btn--submit {
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  color: #fff;
}

.sf__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s var(--ease-out);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<style scoped>
/* 桌面端统一内容宽度（置于文件末尾确保覆盖前面的基础定义） */
@media (min-width: 960px) {
  .co-build,
  .guest-hint,
  .qa-list,
  .qa-hint,
  .sm-list,
  .tk-list {
    max-width: 1020px;
    margin-left: auto;
    margin-right: auto;
    width: calc(100% - 64px);
  }
}
</style>
