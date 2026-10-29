<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import PageHero from '@/components/PageHero.vue'
import api from '@/api'
import type { RecordItem, ReviewResponse } from '@/types'

const router = useRouter()
const store = useAppStore()

const records = ref<RecordItem[]>([])
const loading = ref(true)
const review = ref<ReviewResponse | null>(null)
const reviewLoading = ref(false)
const filterCrop = ref<string>('')
const activeTab = ref<'records' | 'review'>('records')

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
    const res = await api.records({ userId: store.userId, limit: 60 })
    records.value = res.items
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)

const runReview = async () => {
  if (reviewLoading.value) return
  reviewLoading.value = true
  try {
    review.value = await api.review({
      cropId: filterCrop.value || undefined,
      userId: store.userId
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

const riskMeta: Record<string, { label: string; color: string }> = {
  high: { label: '高风险', color: 'var(--c-danger)' },
  medium: { label: '中等风险', color: 'var(--c-accent-500)' },
  low: { label: '风险较低', color: 'var(--c-primary-600)' }
}

const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
        @click="activeTab = 'review'; !review && runReview()"
      >
        <AppIcon name="sparkle" :size="15" /> AI 复盘
      </button>
    </nav>

    <!-- ===== 记录列表 ===== -->
    <template v-if="activeTab === 'records'">
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
          {{ c.emoji }} {{ c.name }}
        </button>
      </div>

      <div v-if="loading" class="skeleton-list">
        <div v-for="i in 3" :key="i" class="skeleton-item"></div>
      </div>

      <div v-else-if="!filtered.length" class="empty">
        <AppIcon name="archive" :size="32" />
        <p>还没有诊断记录</p>
        <small>拍张照片做第一次诊断，记录会自动保存在这里</small>
        <button class="btn btn--primary" style="margin-top: 16px" @click="router.push('/diagnose')">
          <AppIcon name="camera" :size="16" /> 去诊断
        </button>
      </div>

      <div v-else class="record-list">
        <div v-for="r in filtered" :key="r.id" class="record">
          <button class="record__main" @click="router.push(`/result/${r.id}`)">
            <div class="record__left">
              <span class="record__crop">
                {{ store.crops.find((c) => c.id === r.cropId)?.emoji || '🌿' }}
              </span>
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

          <!-- 恢复情况标记 -->
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
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== AI 复盘 ===== -->
    <template v-else>
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

        <button class="btn btn--outline btn--block" style="margin-top: 16px" @click="runReview">
          <AppIcon name="refresh" :size="16" /> 重新分析
        </button>
      </template>

      <div v-else class="empty">
        <AppIcon name="sparkle" :size="32" />
        <p>暂无复盘数据</p>
        <button class="btn btn--primary" @click="runReview">开始分析</button>
      </div>
    </template>

    <p class="foot-note">
      AI 复盘基于您的历史诊断记录生成，仅供参考
    </p>
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
  font-size: 10px;
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
  font-size: 10px;
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
  font-size: 10.5px;
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
  font-size: 10.5px;
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
  font-size: 10.5px;
  color: var(--c-text-3);
  transition: all var(--dur-fast);
}

.recovery-btn.is-active {
  border-color: currentColor;
  font-weight: 600;
}

/* 复盘 */
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
  font-size: 11px;
  font-weight: 700;
}

.review-card__count {
  font-size: 10px;
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
  font-size: 10.5px;
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
  font-size: 10px;
  color: var(--c-text-4);
}
</style>

<style scoped>
@media (min-width: 960px) {
  .head {
    padding: 32px 32px 18px;
  }
  .overview,
  .tabs,
  .filter-row,
  .record-list,
  .skeleton-list,
  .review-card,
  .suggestions,
  .focus-card {
    max-width: 860px;
    margin-left: auto;
    margin-right: auto;
    width: calc(100% - 64px);
  }
  .record-list {
    width: calc(100% - 64px);
  }
}
</style>
