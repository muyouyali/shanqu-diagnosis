<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import * as echarts from 'echarts'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'
import type { AlertResponse, StatsResponse } from '@/types'

const store = useAppStore()
const alert = ref<AlertResponse | null>(null)
const stats = ref<StatsResponse | null>(null)
const loading = ref(true)
const days = ref(14)
const mapRef = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

const levelMeta: Record<string, { label: string; color: string; bg: string; grad: string }> = {
  red: { label: '红色预警', color: '#b91c1c', bg: '#fee2e2', grad: 'linear-gradient(135deg,#fee2e2,#fff5f5)' },
  orange: { label: '橙色预警', color: '#c2410c', bg: '#ffedd5', grad: 'linear-gradient(135deg,#ffedd5,#fffaf5)' },
  yellow: { label: '黄色预警', color: '#a16207', bg: '#fef9c3', grad: 'linear-gradient(135deg,#fef9c3,#fffef5)' },
  green: { label: '状态平稳', color: '#15803d', bg: '#dcfce7', grad: 'linear-gradient(135deg,#dcfce7,#f7fdf9)' }
}

const level = computed(() => levelMeta[alert.value?.level || 'green'])

const renderMap = () => {
  if (!mapRef.value || !stats.value) return
  if (chart) chart.dispose()
  chart = echarts.init(mapRef.value)

  const top = stats.value.regions.slice(0, 10)
  const max = Math.max(...top.map((r) => r.count), 1)

  chart.setOption({
    grid: { left: 10, right: 60, top: 10, bottom: 10, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(22,32,27,0.92)',
      borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 12 },
      formatter: (p: any) => `${p[0].name}<br/>诊断量：${p[0].value} 次`
    },
    xAxis: { type: 'value', show: false, max: max * 1.15 },
    yAxis: {
      type: 'category',
      data: top.map((r) => r.name).reverse(),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#3d4a43', fontSize: 12 }
    },
    series: [
      {
        type: 'bar',
        data: top.map((r) => r.count).reverse(),
        barWidth: 14,
        itemStyle: {
          borderRadius: [0, 8, 8, 0],
          color: (params: any) => {
            const ratio = params.value / max
            if (ratio > 0.75) return '#dc2626'
            if (ratio > 0.5) return '#f59e0b'
            if (ratio > 0.25) return '#55b485'
            return '#bbe5cd'
          }
        },
        label: {
          show: true,
          position: 'right',
          color: '#6b7873',
          fontSize: 11.5,
          fontWeight: 600,
          formatter: '{c} 次'
        }
      }
    ]
  })
  chart.resize()
}

const load = async () => {
  loading.value = true
  try {
    const [a, s] = await Promise.all([api.alerts(days.value), api.stats({ days: days.value })])
    alert.value = a
    stats.value = s
    setTimeout(renderMap, 60)
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

const handleResize = () => chart?.resize()

onMounted(() => {
  load()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
})
</script>

<template>
  <div class="alert-page">
    <!-- 时间切换 -->
    <div class="toolbar">
      <div class="seg-group">
        <button
          v-for="d in [7, 14, 30]"
          :key="d"
          class="seg"
          :class="{ 'is-active': days === d }"
          @click="days = d; load()"
        >
          近 {{ d }} 天
        </button>
      </div>
      <span class="toolbar__hint">基于区域诊断数据自动生成 · AI 分析 + 规则兜底</span>
    </div>

    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>正在分析区域数据…</p>
    </div>

    <template v-else-if="alert">
      <!-- 主预警卡 -->
      <div class="alert-hero" :style="{ background: level.grad, '--tone': level.color }">
        <div class="alert-hero__left">
          <span class="alert-hero__badge">
            <AppIcon name="alert" :size="13" />
            {{ level.label }}
          </span>
          <h2 class="alert-hero__headline">{{ alert.headline }}</h2>
          <p class="alert-hero__analysis">{{ alert.analysis }}</p>
        </div>
        <div class="alert-hero__right">
          <div class="alert-hero__stat">
            <span class="alert-hero__num">{{ alert.stats.total }}</span>
            <span class="alert-hero__label">诊断总量</span>
          </div>
          <div class="alert-hero__stat">
            <span class="alert-hero__num">{{ alert.stats.escalatedRate }}%</span>
            <span class="alert-hero__label">转人工率</span>
          </div>
        </div>
      </div>

      <!-- 防控建议 -->
      <div class="panel">
        <div class="panel__head">
          <h3 class="panel__title">
            <AppIcon name="shield" :size="16" />
            防控建议
          </h3>
          <span class="panel__sub">用于指导基层防控资源投放</span>
        </div>
        <div class="advice-list">
          <div v-for="(a, i) in alert.actions" :key="i" class="advice">
            <span class="advice__idx">{{ i + 1 }}</span>
            <p>{{ a }}</p>
          </div>
        </div>
      </div>

      <div class="two-col">
        <!-- 区域分布 -->
        <div class="panel">
          <div class="panel__head">
            <h3 class="panel__title">
              <AppIcon name="map-pin" :size="16" />
              区域发病热力
            </h3>
            <span class="panel__sub">颜色越深表示诊断量越高</span>
          </div>
          <div ref="mapRef" style="height: 300px; width: 100%"></div>
          <div class="legend">
            <span><i style="background:#bbe5cd"></i>低</span>
            <span><i style="background:#55b485"></i>中</span>
            <span><i style="background:#f59e0b"></i>较高</span>
            <span><i style="background:#dc2626"></i>高</span>
          </div>
        </div>

        <!-- 高发病害 -->
        <div class="panel">
          <div class="panel__head">
            <h3 class="panel__title">
              <AppIcon name="trending-up" :size="16" />
              高发病害
            </h3>
            <span class="panel__sub">Top 6</span>
          </div>
          <div class="rank-list">
            <div v-for="(d, i) in stats?.topDiseases.slice(0, 6)" :key="d.name" class="rank-item">
              <span class="rank-item__no" :class="{ 'is-top': i < 3 }">{{ i + 1 }}</span>
              <span class="rank-item__name">{{ d.name }}</span>
              <div class="rank-item__bar">
                <div
                  class="rank-item__fill"
                  :style="{
                    width: `${(d.count / (stats?.topDiseases[0]?.count || 1)) * 100}%`
                  }"
                ></div>
              </div>
              <span class="rank-item__count">{{ d.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 预警说明 -->
      <div class="notice-panel">
        <AppIcon name="info" :size="15" />
        <div>
          <strong>预警等级说明</strong>
          <p>
            红色：疫情爆发需紧急处置 · 橙色：快速上升需重点防控 · 黄色：需持续关注 · 绿色：发生平稳。
            预警结论由 AI 基于诊断量、病害集中度、转人工率等指标综合判断，并结合规则引擎兜底校验。
          </p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.alert-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.seg-group {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--r-sm);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
}

.seg {
  padding: 5px 13px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--c-text-3);
  transition: all var(--dur-fast);
}

.seg.is-active {
  background: var(--c-primary-600);
  color: #fff;
  font-weight: 600;
}

.toolbar__hint {
  font-size: 11.5px;
  color: var(--c-text-4);
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 80px 0;
  color: var(--c-text-3);
  font-size: 12.5px;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 2.5px solid var(--c-primary-100);
  border-top-color: var(--c-primary-500);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 主预警 */
.alert-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 26px;
  border-radius: var(--r-lg);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.alert-hero__left {
  flex: 1;
  min-width: 0;
}

.alert-hero__badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 11px;
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.72);
  color: var(--tone);
  font-size: 11.5px;
  font-weight: 700;
  margin-bottom: 11px;
}

.alert-hero__headline {
  font-size: 21px;
  font-weight: 800;
  letter-spacing: -0.4px;
  color: var(--c-text-1);
  margin-bottom: 8px;
  line-height: 1.35;
}

.alert-hero__analysis {
  font-size: 13px;
  line-height: 1.75;
  color: var(--c-text-2);
}

.alert-hero__right {
  display: flex;
  gap: 28px;
  flex-shrink: 0;
}

.alert-hero__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.alert-hero__num {
  font-family: var(--font-num);
  font-size: 26px;
  font-weight: 700;
  color: var(--tone);
  line-height: 1.2;
}

.alert-hero__label {
  font-size: 10.5px;
  color: var(--c-text-3);
}

/* 面板 */
.panel {
  padding: 18px;
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.panel__title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14.5px;
  font-weight: 700;
}

.panel__title :deep(.icon) {
  color: var(--c-primary-600);
}

.panel__sub {
  font-size: 10.5px;
  color: var(--c-text-4);
}

/* 建议 */
.advice-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.advice {
  display: flex;
  gap: 11px;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-muted);
  align-items: flex-start;
}

.advice__idx {
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

.advice p {
  flex: 1;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--c-text-2);
}

.two-col {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 16px;
}

/* 图例 */
.legend {
  display: flex;
  justify-content: center;
  gap: 18px;
  padding-top: 10px;
  margin-top: 6px;
  border-top: 1px dashed var(--c-line);
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--c-text-4);
}

.legend i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}

/* 排行 */
.rank-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rank-item__no {
  width: 19px;
  height: 19px;
  border-radius: 5px;
  display: grid;
  place-items: center;
  background: var(--c-bg-muted);
  color: var(--c-text-4);
  font-size: 10.5px;
  font-weight: 700;
  flex-shrink: 0;
}

.rank-item__no.is-top {
  background: linear-gradient(140deg, var(--c-primary-400), var(--c-primary-600));
  color: #fff;
}

.rank-item__name {
  width: 105px;
  font-size: 12px;
  color: var(--c-text-2);
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-item__bar {
  flex: 1;
  height: 7px;
  border-radius: 4px;
  background: var(--c-line-soft);
  overflow: hidden;
}

.rank-item__fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #8bd0ac, #2f9868);
  transition: width 700ms var(--ease-out);
}

.rank-item__count {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-3);
  font-variant-numeric: tabular-nums;
  width: 26px;
  text-align: right;
  flex-shrink: 0;
}

/* 说明 */
.notice-panel {
  display: flex;
  gap: 11px;
  padding: 15px 17px;
  border-radius: var(--r-md);
  background: var(--c-bg-muted);
  border: 1px dashed var(--c-line);
  align-items: flex-start;
}

.notice-panel :deep(.icon) {
  color: var(--c-text-4);
  flex-shrink: 0;
  margin-top: 2px;
}

.notice-panel strong {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--c-text-2);
  margin-bottom: 4px;
}

.notice-panel p {
  font-size: 11.5px;
  line-height: 1.75;
  color: var(--c-text-3);
}

@media (max-width: 1000px) {
  .two-col {
    grid-template-columns: 1fr;
  }
  .alert-hero {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
