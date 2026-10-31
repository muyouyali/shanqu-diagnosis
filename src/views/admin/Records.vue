<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'
import type { RecordItem } from '@/types'

const store = useAppStore()
const records = ref<RecordItem[]>([])
const total = ref(0)
const loading = ref(true)
const cropFilter = ref('')
const keyword = ref('')
const onlyEscalated = ref(false)
/** 隐私模式（默认开）：农户的常规诊断档案不下发到专家端，仅转人工复核的病例可见 */
const privacyMode = ref(true)
/** 提交来源筛选：区分农户端「我的档案」与本机游客记录 */
const sourceFilter = ref<'' | 'farmer' | 'guest'>('')
const page = ref(0)
const pageSize = 15
const selected = ref<RecordItem | null>(null)

const filtered = computed(() => {
  let list = records.value
  if (privacyMode.value) {
    // 农户常规记录不下发：仅转人工复核病例 + 游客演示记录可见
    list = list.filter((r) => r.gate?.needHumanReview || !r.userId || String(r.userId).startsWith('u_'))
  }
  if (keyword.value.trim()) {
    const k = keyword.value.trim()
    list = list.filter(
      (r) =>
        r.diagnosis?.results?.[0]?.name?.includes(k) ||
        r.region?.includes(k) ||
        (r.symptomsText || '').includes(k)
    )
  }
  if (onlyEscalated.value) list = list.filter((r) => r.gate?.needHumanReview)
  if (sourceFilter.value) {
    list = list.filter((r) => {
      const isGuest = !r.userId || String(r.userId).startsWith('u_')
      return sourceFilter.value === 'guest' ? isGuest : !isGuest
    })
  }
  return list
})

const load = async () => {
  loading.value = true
  try {
    const res = await api.records({
      cropId: cropFilter.value || undefined,
      limit: pageSize,
      offset: page.value * pageSize
    })
    records.value = res.items
    total.value = res.total
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await store.loadCrops()
  await load()
})

const fmt = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 记录提交来源：区分注册农户 / 游客体验，避免与农户端「我的档案」混淆 */
const isGuest = (r: any) => !r.userId || String(r.userId).startsWith('u_')

const sourceOf = (r: any) => {
  const uid = String(r.userId || '')
  if (!uid) return '游客'
  if (uid.startsWith('u_')) return `访客 ${uid.slice(-4)}`
  return `农户 #${uid}`
}

const confTone = (v: number) => (v >= 0.65 ? 'high' : v >= 0.4 ? 'medium' : 'low')

const removeRecord = async (r: RecordItem) => {
  if (!confirm(`确定删除「${r.diagnosis?.results?.[0]?.name}」这条记录吗？`)) return
  try {
    await api.deleteRecord(r.id)
    store.showToast('已删除', 'success')
    await load()
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  }
}

const changePage = async (delta: number) => {
  const next = page.value + delta
  if (next < 0 || next * pageSize >= total.value) return
  page.value = next
  await load()
}
</script>

<template>
  <div class="records">
    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="search-box">
        <AppIcon name="search" :size="15" class="search-box__icon" />
        <input v-model="keyword" class="search-box__input" placeholder="搜索病害名、区域、症状…" />
      </div>

      <select v-model="cropFilter" class="select" @change="page = 0; load()">
        <option value="">全部作物</option>
        <option v-for="c in store.crops" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>

      <button class="toggle-btn" :class="{ 'is-active': onlyEscalated }" @click="onlyEscalated = !onlyEscalated">
        <AppIcon name="alert" :size="14" />
        仅看转人工
      </button>

      <button
        class="toggle-btn"
        :class="{ 'is-active': privacyMode }"
        @click="privacyMode = !privacyMode"
        title="开启时农户常规档案不下发，仅转人工复核病例可见"
      >
        <AppIcon name="shield" :size="14" />
        {{ privacyMode ? '隐私保护已开' : '显示农户档案' }}
      </button>

      <select v-model="sourceFilter" class="select">
        <option value="">全部来源</option>
        <option value="farmer">仅注册农户</option>
        <option value="guest">仅游客体验</option>
      </select>

      <span class="count-badge">显示 {{ filtered.length }} / {{ total }} 条</span>
    </div>

    <!-- 表格 -->
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th style="width: 60px">ID</th>
            <th style="width: 90px">作物</th>
            <th>诊断结论</th>
            <th style="width: 90px">置信度</th>
            <th style="width: 110px">区域</th>
            <th style="width: 110px">提交来源</th>
            <th style="width: 150px">时间</th>
            <th style="width: 100px">状态</th>
            <th style="width: 80px">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="9" class="empty-cell">加载中…</td>
          </tr>
          <tr v-else-if="!filtered.length">
            <td colspan="9" class="empty-cell">暂无数据</td>
          </tr>
          <tr v-for="r in filtered" :key="r.id" @click="selected = r">
            <td class="mono">{{ r.id }}</td>
            <td>
              <span class="crop-cell">
                {{ store.crops.find((c) => c.id === r.cropId)?.emoji || '🌿' }}
                {{ r.cropName }}
              </span>
            </td>
            <td>
              <div class="disease-cell">
                <strong>{{ r.diagnosis?.results?.[0]?.name }}</strong>
                <span v-if="r.diagnosis?.results?.length > 1" class="alt-count">
                  +{{ r.diagnosis.results.length - 1 }} 个可能
                </span>
              </div>
            </td>
            <td>
              <span class="conf-pill" :class="`is-${confTone(r.diagnosis?.results?.[0]?.confidence || 0)}`">
                {{ Math.round((r.diagnosis?.results?.[0]?.confidence || 0) * 100) }}%
              </span>
            </td>
            <td class="muted">{{ r.region || '—' }}</td>
            <td>
              <span class="src-tag" :class="isGuest(r) ? 'is-guest' : 'is-farmer'">{{ sourceOf(r) }}</span>
            </td>
            <td class="muted mono">{{ fmt(r.createdAt) }}</td>
            <td>
              <span v-if="r.gate?.needHumanReview" class="status status--warn">
                <AppIcon name="alert" :size="11" /> 待复核
              </span>
              <span v-else class="status status--ok">
                <AppIcon name="check" :size="11" /> 已完成
              </span>
            </td>
            <td>
              <button class="row-btn row-btn--danger" @click.stop="removeRecord(r)">
                <AppIcon name="x" :size="14" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 分页 -->
    <div class="pager">
      <button class="pager__btn" :disabled="page === 0" @click="changePage(-1)">
        <AppIcon name="arrow-left" :size="15" /> 上一页
      </button>
      <span class="pager__info">{{ page + 1 }} / {{ Math.max(1, Math.ceil(total / pageSize)) }}</span>
      <button class="pager__btn" :disabled="(page + 1) * pageSize >= total" @click="changePage(1)">
        下一页 <AppIcon name="arrow-right" :size="15" />
      </button>
    </div>

    <!-- 详情抽屉 -->
    <transition name="drawer">
      <div v-if="selected" class="drawer-mask" @click.self="selected = null">
        <aside class="drawer">
          <header class="drawer__head">
            <div>
              <h3 class="drawer__title">{{ selected.diagnosis?.results?.[0]?.name }}</h3>
              <p class="drawer__sub">
                {{ selected.cropName }} · {{ selected.region || '未标注' }} · {{ fmt(selected.createdAt) }}
              </p>
            </div>
            <button class="drawer__close" @click="selected = null">
              <AppIcon name="x" :size="18" />
            </button>
          </header>

          <div class="drawer__body">
            <section class="d-section">
              <h4 class="d-section__title">诊断结论</h4>
              <div v-for="(r, i) in selected.diagnosis?.results" :key="i" class="d-result">
                <div class="d-result__head">
                  <span class="d-result__rank">{{ i + 1 }}</span>
                  <strong>{{ r.name }}</strong>
                  <span class="conf-pill" :class="`is-${r.confidenceLevel}`">
                    {{ Math.round(r.confidence * 100) }}%
                  </span>
                </div>
                <ul v-if="r.symptomMatch?.length" class="d-result__list">
                  <li v-for="(s, j) in r.symptomMatch" :key="j">{{ s }}</li>
                </ul>
              </div>
            </section>

            <section class="d-section">
              <h4 class="d-section__title">AI 观察</h4>
              <p class="d-text">{{ selected.diagnosis?.observations }}</p>
            </section>

            <section v-if="selected.symptomsText" class="d-section">
              <h4 class="d-section__title">农户描述</h4>
              <p class="d-text">{{ selected.symptomsText }}</p>
            </section>

            <section class="d-section">
              <h4 class="d-section__title">环境信息</h4>
              <div class="d-grid">
                <div><span>海拔</span><strong>{{ selected.altitude || '—' }}</strong></div>
                <div><span>天气</span><strong>{{ selected.weather || '—' }}</strong></div>
                <div><span>生育期</span><strong>{{ selected.stage || '—' }}</strong></div>
                <div><span>面积</span><strong>{{ selected.area || '—' }}</strong></div>
              </div>
            </section>

            <section v-if="selected.treatment?.chemicalPlan?.length" class="d-section">
              <h4 class="d-section__title">推荐药剂</h4>
              <div v-for="(c, i) in selected.treatment.chemicalPlan" :key="i" class="d-chem">
                <strong>{{ c.chemical }}</strong>
                <p>{{ c.dosage }}</p>
                <span class="d-chem__safe">{{ c.safeInterval }}</span>
              </div>
            </section>

            <section v-if="selected.gate?.flags?.length" class="d-section">
              <h4 class="d-section__title">安全闸门</h4>
              <div v-for="(f, i) in selected.gate.flags" :key="i" class="d-flag" :class="`is-${f.level}`">
                {{ f.message }}
              </div>
            </section>

            <section v-if="selected.trace?.length" class="d-section">
              <h4 class="d-section__title">处理链路</h4>
              <div class="d-trace">
                <div v-for="(t, i) in selected.trace" :key="i" class="d-trace__item">
                  <span class="d-trace__agent">{{ t.agent }}</span>
                  <span class="d-trace__ms">{{ t.durationMs }}ms</span>
                </div>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.records {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 200px;
  max-width: 340px;
}

.search-box__icon {
  position: absolute;
  left: 12px;
  color: var(--c-text-4);
}

.search-box__input {
  width: 100%;
  height: 36px;
  padding: 0 12px 0 34px;
  border-radius: var(--r-sm);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line);
  font-size: 12.5px;
}

.search-box__input:focus {
  border-color: var(--c-primary-300);
}

.select {
  height: 36px;
  padding: 0 30px 0 12px;
  border-radius: var(--r-sm);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line);
  font-size: 12.5px;
  color: var(--c-text-2);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7873' stroke-width='2.4'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 36px;
  padding: 0 13px;
  border-radius: var(--r-sm);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line);
  font-size: 12.5px;
  color: var(--c-text-3);
  transition: all var(--dur-fast);
}

.toggle-btn.is-active {
  background: var(--c-danger-bg);
  border-color: #fecaca;
  color: #b91c1c;
  font-weight: 600;
}

.count-badge {
  font-size: 12px;
  color: var(--c-text-4);
  margin-left: auto;
}

/* 表格 */
.table-wrap {
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  overflow: hidden;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.table thead th {
  text-align: left;
  padding: 12px 14px;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-text-4);
  background: var(--c-bg-muted);
  border-bottom: 1px solid var(--c-line-soft);
  white-space: nowrap;
}

.table tbody tr {
  border-bottom: 1px solid var(--c-line-soft);
  cursor: pointer;
  transition: background var(--dur-fast);
}

.table tbody tr:last-child {
  border-bottom: none;
}

.table tbody tr:hover {
  background: var(--c-primary-50);
}

.table tbody td {
  padding: 12px 14px;
  vertical-align: middle;
}

.mono {
  font-variant-numeric: tabular-nums;
  color: var(--c-text-4);
  font-size: 11.5px;
}

.muted {
  color: var(--c-text-3);
}

.crop-cell {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  font-size: 12px;
}

.disease-cell {
  display: flex;
  align-items: center;
  gap: 7px;
}

.disease-cell strong {
  font-weight: 600;
  font-size: 12.5px;
}

.alt-count {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--c-bg-muted);
  color: var(--c-text-4);
}

.conf-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.conf-pill.is-high {
  background: var(--c-primary-50);
  color: var(--c-primary-700);
}
.conf-pill.is-medium {
  background: var(--c-warning-bg);
  color: #92400e;
}
.conf-pill.is-low {
  background: var(--c-danger-bg);
  color: #b91c1c;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: var(--r-full);
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
}

.status--ok {
  background: var(--c-success-bg);
  color: #047857;
}

.status--warn {
  background: var(--c-warning-bg);
  color: #92400e;
}

.row-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  color: var(--c-text-4);
  transition: all var(--dur-fast);
}

.row-btn--danger:hover {
  background: var(--c-danger-bg);
  color: var(--c-danger);
}

.empty-cell {
  text-align: center;
  padding: 40px 0 !important;
  color: var(--c-text-4);
  font-size: 12.5px;
}

/* 分页 */
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.pager__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 13px;
  border-radius: var(--r-sm);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line);
  font-size: 12px;
  color: var(--c-text-2);
}

.pager__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pager__info {
  font-size: 12px;
  color: var(--c-text-3);
  font-variant-numeric: tabular-nums;
}

/* 抽屉 */
.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(12, 22, 18, 0.32);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: flex-end;
}

.drawer {
  width: min(480px, 92vw);
  height: 100%;
  background: var(--c-bg-card);
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.16);
  display: flex;
  flex-direction: column;
}

.drawer__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--c-line-soft);
}

.drawer__title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 3px;
}

.drawer__sub {
  font-size: 11px;
  color: var(--c-text-4);
}

.drawer__close {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: var(--c-text-3);
  flex-shrink: 0;
}

.drawer__close:hover {
  background: var(--c-line-soft);
}

.drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 20px 30px;
}

.d-section {
  margin-bottom: 20px;
}

.d-section__title {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-4);
  letter-spacing: 0.4px;
  text-transform: uppercase;
  margin-bottom: 9px;
}

.d-result {
  padding: 11px 13px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
  margin-bottom: 7px;
}

.d-result__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.d-result__rank {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  display: grid;
  place-items: center;
  background: var(--c-primary-600);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.d-result__head strong {
  flex: 1;
  font-size: 13px;
}

.d-result__list {
  margin-top: 7px;
  padding-left: 26px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.d-result__list li {
  position: relative;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--c-text-3);
}

.d-result__list li::before {
  content: '·';
  position: absolute;
  left: -9px;
  color: var(--c-primary-400);
  font-weight: 700;
}

.d-text {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--c-text-2);
}

.d-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}

.d-grid > div {
  padding: 9px 11px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.d-grid span {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.d-grid strong {
  font-size: 12.5px;
  font-weight: 600;
}

.d-chem {
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
  margin-bottom: 6px;
}

.d-chem strong {
  font-size: 12.5px;
}

.d-chem p {
  font-size: 11.5px;
  color: var(--c-text-3);
  margin: 2px 0 4px;
}

.d-chem__safe {
  font-size: 10.5px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--c-primary-50);
  color: var(--c-primary-700);
  font-weight: 600;
}

.d-flag {
  padding: 8px 11px;
  border-radius: var(--r-sm);
  font-size: 11.5px;
  line-height: 1.6;
  margin-bottom: 6px;
}

.d-flag.is-critical {
  background: var(--c-danger-bg);
  color: #b91c1c;
  font-weight: 600;
}

.d-flag.is-warning {
  background: var(--c-warning-bg);
  color: #92400e;
}

.d-flag.is-info {
  background: var(--c-info-bg);
  color: #1e40af;
}

.d-trace {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.d-trace__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 11px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
}

.d-trace__agent {
  font-size: 11.5px;
  color: var(--c-text-2);
}

.d-trace__ms {
  font-size: 10.5px;
  color: var(--c-text-4);
  font-variant-numeric: tabular-nums;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity var(--dur-base) var(--ease-out);
}

.drawer-enter-active .drawer,
.drawer-leave-active .drawer {
  transition: transform var(--dur-base) var(--ease-out);
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .drawer,
.drawer-leave-to .drawer {
  transform: translateX(100%);
}

/* 提交来源标签 */
.src-tag {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--r-full);
  white-space: nowrap;
}

.src-tag.is-farmer {
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
}

.src-tag.is-guest {
  color: var(--c-text-3);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
}
</style>
