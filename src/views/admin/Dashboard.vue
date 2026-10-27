<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'
import type { StatsResponse } from '@/types'

const store = useAppStore()
const stats = ref<StatsResponse | null>(null)
const loading = ref(true)
const days = ref(30)
const cropFilter = ref('')

const trendRef = ref<HTMLElement | null>(null)
const diseaseRef = ref<HTMLElement | null>(null)
const cropRef = ref<HTMLElement | null>(null)
const regionRef = ref<HTMLElement | null>(null)

let charts: echarts.ECharts[] = []

const kpis = computed(() => {
  if (!stats.value) return []
  const s = stats.value
  return [
    {
      label: '累计诊断',
      value: s.total,
      unit: '次',
      icon: 'camera',
      tone: 'green',
      hint: `近 ${s.days} 天`
    },
    {
      label: '平均置信度',
      value: Math.round(s.avgConfidence * 100),
      unit: '%',
      icon: 'check-circle',
      tone: 'blue',
      hint: '诊断把握程度'
    },
    {
      label: '转人工复核',
      value: s.escalated,
      unit: '例',
      icon: 'user',
      tone: 'amber',
      hint: `占比 ${s.escalatedRate}%`
    },
    {
      label: '涉及病害',
      value: s.topDiseases.length,
      unit: '类',
      icon: 'leaf',
      tone: 'purple',
      hint: '高发病害统计'
    }
  ]
})

const initCharts = () => {
  if (!stats.value) return
  charts.forEach((c) => c.dispose())
  charts = []

  const s = stats.value

  // ---- 趋势折线 ----
  if (trendRef.value) {
    const chart = echarts.init(trendRef.value)
    chart.setOption({
      grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(22,32,27,0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        axisPointer: { type: 'line', lineStyle: { color: '#2f9868', type: 'dashed' } }
      },
      xAxis: {
        type: 'category',
        data: s.trend.map((t) => t.date.slice(5).replace('-', '/')),
        boundaryGap: false,
        axisLine: { lineStyle: { color: '#e6ebe8' } },
        axisTick: { show: false },
        axisLabel: { color: '#9aa5a0', fontSize: 10, interval: Math.ceil(s.trend.length / 8) }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#f0f4f2' } },
        axisLabel: { color: '#9aa5a0', fontSize: 10 }
      },
      series: [
        {
          type: 'line',
          data: s.trend.map((t) => t.count),
          smooth: 0.4,
          symbol: 'circle',
          symbolSize: 5,
          showSymbol: false,
          lineStyle: { width: 2.5, color: '#2f9868' },
          itemStyle: { color: '#2f9868' },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(47,152,104,0.26)' },
              { offset: 1, color: 'rgba(47,152,104,0.01)' }
            ])
          }
        }
      ]
    })
    charts.push(chart)
  }

  // ---- 病害排行横向柱 ----
  if (diseaseRef.value) {
    const chart = echarts.init(diseaseRef.value)
    const data = [...s.topDiseases].reverse()
    chart.setOption({
      grid: { left: 8, right: 44, top: 10, bottom: 6, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(22,32,27,0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 }
      },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: '#f0f4f2' } }, axisLabel: { color: '#9aa5a0', fontSize: 10 } },
      yAxis: {
        type: 'category',
        data: data.map((d) => d.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#3d4a43', fontSize: 11 }
      },
      series: [
        {
          type: 'bar',
          data: data.map((d) => d.count),
          barWidth: 12,
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
              { offset: 0, color: '#8bd0ac' },
              { offset: 1, color: '#2f9868' }
            ])
          },
          label: {
            show: true,
            position: 'right',
            color: '#6b7873',
            fontSize: 11,
            fontWeight: 600
          }
        }
      ]
    })
    charts.push(chart)
  }

  // ---- 作物分布环形 ----
  if (cropRef.value) {
    const chart = echarts.init(cropRef.value)
    const colorMap: Record<string, string> = {
      sanqi: '#2f9868',
      blueberry: '#4f6bd8',
      citrus: '#e08a2e'
    }
    chart.setOption({
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(22,32,27,0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: '{b}<br/>{c} 次 ({d}%)'
      },
      legend: {
        bottom: 0,
        icon: 'circle',
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: '#6b7873', fontSize: 11 }
      },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 3 },
          label: { show: false },
          data: s.cropDist.map((c) => ({
            name: s.cropNames[c.cropId] || c.cropId,
            value: c.count,
            itemStyle: { color: colorMap[c.cropId] || '#8bd0ac' }
          }))
        }
      ]
    })
    charts.push(chart)
  }

  // ---- 区域分布 ----
  if (regionRef.value) {
    const chart = echarts.init(regionRef.value)
    const top = s.regions.slice(0, 8)
    chart.setOption({
      grid: { left: 8, right: 12, top: 20, bottom: 30, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(22,32,27,0.92)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 12 }
      },
      xAxis: {
        type: 'category',
        data: top.map((r) => r.name),
        axisLine: { lineStyle: { color: '#e6ebe8' } },
        axisTick: { show: false },
        axisLabel: { color: '#6b7873', fontSize: 10, interval: 0, rotate: 30 }
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#f0f4f2' } },
        axisLabel: { color: '#9aa5a0', fontSize: 10 }
      },
      series: [
        {
          type: 'bar',
          data: top.map((r) => r.count),
          barWidth: '46%',
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#55b485' },
              { offset: 1, color: '#bbe5cd' }
            ])
          }
        }
      ]
    })
    charts.push(chart)
  }
}

const handleResize = () => charts.forEach((c) => c.resize())

const load = async () => {
  loading.value = true
  try {
    stats.value = await api.stats({ days: days.value, cropId: cropFilter.value || undefined })
    await nextTick()
    initCharts()
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await store.loadCrops()
  await load()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  charts.forEach((c) => c.dispose())
})

watch([days, cropFilter], load)
</script>

<template>
  <div class="dash">
    <!-- 筛选 -->
    <div class="toolbar">
      <div class="toolbar__group">
        <button
          v-for="d in [7, 14, 30]"
          :key="d"
          class="seg"
          :class="{ 'is-active': days === d }"
          @click="days = d"
        >
          近 {{ d }} 天
        </button>
      </div>
      <div class="toolbar__group">
        <button class="seg" :class="{ 'is-active': cropFilter === '' }" @click="cropFilter = ''">全部作物</button>
        <button
          v-for="c in store.crops"
          :key="c.id"
          class="seg"
          :class="{ 'is-active': cropFilter === c.id }"
          @click="cropFilter = c.id"
        >
          {{ c.name }}
        </button>
      </div>
      <button class="toolbar__refresh" @click="load" :disabled="loading">
        <AppIcon name="refresh" :size="16" />
      </button>
    </div>

    <!-- KPI -->
    <div class="kpi-grid">
      <div v-for="k in kpis" :key="k.label" class="kpi" :class="`kpi--${k.tone}`">
        <div class="kpi__icon">
          <AppIcon :name="k.icon" :size="19" />
        </div>
        <div class="kpi__body">
          <span class="kpi__label">{{ k.label }}</span>
          <div class="kpi__value-row">
            <span class="kpi__value">{{ k.value }}</span>
            <span class="kpi__unit">{{ k.unit }}</span>
          </div>
          <span class="kpi__hint">{{ k.hint }}</span>
        </div>
      </div>
    </div>

    <!-- 图表区 -->
    <div class="chart-grid">
      <div class="chart-card chart-card--wide">
        <div class="chart-card__head">
          <h3 class="chart-card__title">诊断量趋势</h3>
          <span class="chart-card__sub">近 {{ stats?.days || days }} 天每日诊断次数</span>
        </div>
        <div ref="trendRef" class="chart-card__body" style="height: 240px"></div>
      </div>

      <div class="chart-card">
        <div class="chart-card__head">
          <h3 class="chart-card__title">高发病害排行</h3>
          <span class="chart-card__sub">Top {{ stats?.topDiseases.length || 0 }}</span>
        </div>
        <div ref="diseaseRef" class="chart-card__body" style="height: 240px"></div>
      </div>

      <div class="chart-card">
        <div class="chart-card__head">
          <h3 class="chart-card__title">作物诊断分布</h3>
          <span class="chart-card__sub">按作物类型</span>
        </div>
        <div ref="cropRef" class="chart-card__body" style="height: 240px"></div>
      </div>

      <div class="chart-card chart-card--wide">
        <div class="chart-card__head">
          <h3 class="chart-card__title">区域发病分布</h3>
          <span class="chart-card__sub">按县市统计，用于指导防控资源投放</span>
        </div>
        <div ref="regionRef" class="chart-card__body" style="height: 230px"></div>
      </div>
    </div>

    <!-- 置信度分布 -->
    <div class="conf-card">
      <div class="conf-card__head">
        <h3 class="chart-card__title">诊断置信度分布</h3>
        <span class="chart-card__sub">低置信度病例自动转人工复核</span>
      </div>
      <div class="conf-bars">
        <div class="conf-bar">
          <div class="conf-bar__top">
            <span class="conf-bar__label"><i class="dot dot--high"></i>高把握（≥65%）</span>
            <span class="conf-bar__num">{{ stats?.confBuckets.high || 0 }}</span>
          </div>
          <div class="conf-bar__track">
            <div
              class="conf-bar__fill conf-bar__fill--high"
              :style="{ width: `${((stats?.confBuckets.high || 0) / (stats?.total || 1)) * 100}%` }"
            ></div>
          </div>
        </div>
        <div class="conf-bar">
          <div class="conf-bar__top">
            <span class="conf-bar__label"><i class="dot dot--medium"></i>一般（40–65%）</span>
            <span class="conf-bar__num">{{ stats?.confBuckets.medium || 0 }}</span>
          </div>
          <div class="conf-bar__track">
            <div
              class="conf-bar__fill conf-bar__fill--medium"
              :style="{ width: `${((stats?.confBuckets.medium || 0) / (stats?.total || 1)) * 100}%` }"
            ></div>
          </div>
        </div>
        <div class="conf-bar">
          <div class="conf-bar__top">
            <span class="conf-bar__label"><i class="dot dot--low"></i>偏低（&lt;40%）</span>
            <span class="conf-bar__num">{{ stats?.confBuckets.low || 0 }}</span>
          </div>
          <div class="conf-bar__track">
            <div
              class="conf-bar__fill conf-bar__fill--low"
              :style="{ width: `${((stats?.confBuckets.low || 0) / (stats?.total || 1)) * 100}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar__group {
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
  white-space: nowrap;
}

.seg.is-active {
  background: var(--c-primary-600);
  color: #fff;
  font-weight: 600;
}

.toolbar__refresh {
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  display: grid;
  place-items: center;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  color: var(--c-text-3);
  margin-left: auto;
  transition: all var(--dur-fast);
}

.toolbar__refresh:hover {
  color: var(--c-primary-600);
}

.toolbar__refresh:disabled {
  opacity: 0.4;
}

/* KPI */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}

.kpi {
  display: flex;
  gap: 13px;
  padding: 17px;
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  transition: box-shadow var(--dur-base), transform var(--dur-base);
}

.kpi:hover {
  box-shadow: var(--sh-sm);
  transform: translateY(-1px);
}

.kpi__icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.kpi--green .kpi__icon {
  background: var(--c-primary-50);
  color: var(--c-primary-600);
}
.kpi--blue .kpi__icon {
  background: #eef2ff;
  color: #5566d8;
}
.kpi--amber .kpi__icon {
  background: var(--c-accent-100);
  color: var(--c-accent-600);
}
.kpi--purple .kpi__icon {
  background: #f5f0ff;
  color: #7c5bd8;
}

.kpi__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.kpi__label {
  font-size: 11.5px;
  color: var(--c-text-4);
}

.kpi__value-row {
  display: flex;
  align-items: baseline;
  gap: 3px;
}

.kpi__value {
  font-family: var(--font-num);
  font-size: 25px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.6px;
  color: var(--c-text-1);
}

.kpi__unit {
  font-size: 11px;
  color: var(--c-text-4);
}

.kpi__hint {
  font-size: 10px;
  color: var(--c-text-4);
}

/* 图表 */
.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

.chart-card {
  padding: 16px;
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  min-width: 0;
}

.chart-card--wide {
  grid-column: span 2;
}

.chart-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}

.chart-card__title {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.1px;
}

.chart-card__sub {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.chart-card__body {
  width: 100%;
}

/* 置信度 */
.conf-card {
  padding: 16px;
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.conf-card__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
}

.conf-bars {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.conf-bar__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
}

.conf-bar__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--c-text-3);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}

.dot--high {
  background: var(--c-primary-500);
}
.dot--medium {
  background: var(--c-warning);
}
.dot--low {
  background: var(--c-danger);
}

.conf-bar__num {
  font-family: var(--font-num);
  font-size: 14px;
  font-weight: 700;
  color: var(--c-text-1);
}

.conf-bar__track {
  height: 7px;
  border-radius: 4px;
  background: var(--c-line-soft);
  overflow: hidden;
}

.conf-bar__fill {
  height: 100%;
  border-radius: 4px;
  transition: width 800ms var(--ease-out);
}

.conf-bar__fill--high {
  background: linear-gradient(90deg, var(--c-primary-400), var(--c-primary-600));
}
.conf-bar__fill--medium {
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
}
.conf-bar__fill--low {
  background: linear-gradient(90deg, #f87171, #ef4444);
}

@media (max-width: 1200px) {
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 900px) {
  .chart-grid {
    grid-template-columns: 1fr;
  }
  .chart-card--wide {
    grid-column: span 1;
  }
  .conf-bars {
    grid-template-columns: 1fr;
    gap: 14px;
  }
}
</style>
