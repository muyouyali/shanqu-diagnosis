<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'
import type { StatsResponse, RecordItem } from '@/types'
import { useRouter } from 'vue-router'

const store = useAppStore()
const router = useRouter()
const stats = ref<StatsResponse | null>(null)
const loading = ref(true)

/* ---------- KPI 详情弹层 ---------- */
type DetailKey = 'total' | 'confidence' | 'escalated' | 'disease' | null
const detailKey = ref<DetailKey>(null)
const detailRecords = ref<RecordItem[]>([])
const detailLoading = ref(false)

const detailTitle = computed(
  () =>
    ({
      total: '累计诊断明细',
      confidence: '平均置信度详情',
      escalated: '转人工复核明细',
      disease: '涉及病害明细'
    })[detailKey.value as string] || ''
)

/** 与 KPI 同口径：服务端已按「近 N 天 + 作物」过滤，total 即累计诊断数 */
const detailServerTotal = ref(0)

const detailTotal = computed(() => detailServerTotal.value || detailRecords.value.length)

const escalatedRecords = computed(() => detailRecords.value.filter((r) => r.gate?.needHumanReview))

const topConf = (r: RecordItem) => r.diagnosis?.results?.[0]?.confidence || 0
const topLevel = (r: RecordItem) => r.diagnosis?.results?.[0]?.confidenceLevel || 'low'

const confSorted = computed(() =>
  [...detailRecords.value].sort((a, b) => topConf(b) - topConf(a))
)

const confLabel = (c: number) => (c >= 0.75 ? '高' : c >= 0.5 ? '中' : '低')

const openDetail = async (key: Exclude<DetailKey, null>) => {
  detailKey.value = key
  detailLoading.value = true
  try {
    // 与 /api/stats 完全相同的口径：近 days 天 + 当前作物筛选
    const res = await api.records({
      cropId: cropFilter.value || undefined,
      days: days.value,
      limit: 300
    })
    detailRecords.value = res.items || []
    detailServerTotal.value = res.total || 0
  } catch (e: any) {
    store.showToast(e?.message || '明细加载失败', 'error')
  } finally {
    detailLoading.value = false
  }
}

const gotoResult = (id: number) => router.push(`/result/${id}`)

const fmtTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const cropName = (id: string) => store.crops.find((c) => c.id === id)?.name || id
const days = ref(30)
const cropFilter = ref('')

/** 作物可搜索下拉 */
const cropOpen = ref(false)
const cropKeyword = ref('')
const cropOptions = computed(() => {
  const k = cropKeyword.value.trim().toLowerCase()
  const all = store.crops
  if (!k) return all
  return all.filter((c) => c.name.toLowerCase().includes(k) || c.id.includes(k))
})
const pickCrop = (id: string) => {
  cropFilter.value = id
  cropOpen.value = false
  cropKeyword.value = ''
}
// 点击外部关闭
onMounted(() => {
  document.addEventListener('click', closeCropSelect)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', closeCropSelect)
})
const cropSelectRef = ref<HTMLElement | null>(null)
const closeCropSelect = (e: MouseEvent) => {
  if (cropOpen.value && cropSelectRef.value && !cropSelectRef.value.contains(e.target as Node)) {
    cropOpen.value = false
  }
}

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
      key: 'total' as const,
      label: '累计诊断',
      value: s.total,
      unit: '次',
      icon: 'camera',
      tone: 'green',
      hint: `近 ${s.days} 天`
    },
    {
      key: 'confidence' as const,
      label: '平均置信度',
      value: Math.round(s.avgConfidence * 100),
      unit: '%',
      icon: 'check-circle',
      tone: 'blue',
      hint: '诊断把握程度'
    },
    {
      key: 'escalated' as const,
      label: '转人工复核',
      value: s.escalated,
      unit: '例',
      icon: 'user',
      tone: 'amber',
      hint: `占比 ${s.escalatedRate}%`
    },
    {
      key: 'disease' as const,
      label: '涉及病害',
      value: s.topDiseases.length,
      unit: '类',
      icon: 'leaf',
      tone: 'purple',
      hint: `近 ${s.days} 天全部病害`
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
      <div class="crop-select" ref="cropSelectRef">
        <button class="seg crop-select__btn" :class="{ 'is-active': !!cropFilter }" @click.stop="cropOpen = !cropOpen">
          <AppIcon name="leaf" :size="13" />
          {{ cropFilter ? cropName(cropFilter) : '全部作物' }}
          <AppIcon name="chevron-down" :size="12" :class="{ 'rot-180': cropOpen }" />
        </button>
        <div v-if="cropOpen" class="crop-select__panel" @click.stop>
          <div class="crop-select__search">
            <AppIcon name="search" :size="13" />
            <input
              v-model="cropKeyword"
              placeholder="搜索作物…"
              maxlength="10"
              @keyup.enter="cropOptions.length && pickCrop(cropOptions[0].id)"
            />
          </div>
          <div class="crop-select__list">
            <button class="crop-select__item" :class="{ 'is-on': cropFilter === '' }" @click="pickCrop('')">
              全部作物 <em>{{ store.crops.length }}</em>
            </button>
            <button
              v-for="c in cropOptions"
              :key="c.id"
              class="crop-select__item"
              :class="{ 'is-on': cropFilter === c.id }"
              @click="pickCrop(c.id)"
            >
              {{ c.emoji }} {{ c.name }} <em>{{ c.diseaseCount }} 病</em>
            </button>
            <p v-if="!cropOptions.length" class="crop-select__empty">未找到匹配作物</p>
          </div>
        </div>
      </div>
      <button class="toolbar__refresh" @click="load" :disabled="loading">
        <AppIcon name="refresh" :size="16" />
      </button>
    </div>

    <!-- KPI -->
    <div class="kpi-grid">
      <div
        v-for="k in kpis"
        :key="k.label"
        class="kpi"
        :class="`kpi--${k.tone}`"
        :title="`点击查看${k.label}明细`"
        @click="openDetail(k.key)"
      >
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
          <span class="chart-card__sub">按出现次数排序（共 {{ stats?.topDiseases.length || 0 }} 类）</span>
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

    <!-- KPI 详情弹层 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="detailKey" class="kd-mask" @click.self="detailKey = null">
          <div class="kd">
            <header class="kd__head">
              <div>
                <h3>{{ detailTitle }}</h3>
                <p v-if="detailKey !== 'disease'">
                  统计口径：近 {{ days }} 天<template v-if="cropFilter"> · {{ cropName(cropFilter) }}</template>
                  · 共 {{ detailTotal }} 条{{ detailTotal > detailRecords.length ? `（列表显示最近 ${detailRecords.length} 条）` : '' }}
                </p>
                <p v-else>近 {{ days }} 天各类病害出现次数与占比</p>
                <p class="kd__tip">点击任意一条可打开完整诊断报告</p>
              </div>
              <button class="kd__close" @click="detailKey = null"><AppIcon name="x" :size="15" /></button>
            </header>

            <div class="kd__body">
              <div v-if="detailLoading" class="kd__empty">正在加载明细…</div>

              <!-- 累计诊断 -->
              <template v-else-if="detailKey === 'total'">
                <div v-if="!detailRecords.length" class="kd__empty">暂无诊断记录</div>
                <button v-for="r in detailRecords" :key="r.id" class="kd-item" @click="gotoResult(r.id)">
                  <span class="kd-item__crop">{{ r.cropName || r.cropId }}</span>
                  <span class="kd-item__disease">{{ r.diagnosis?.results?.[0]?.name || '—' }}</span>
                  <span class="kd-item__conf" :class="topLevel(r)">
                    {{ Math.round(topConf(r) * 100) }}%
                  </span>
                  <span v-if="r.gate?.needHumanReview" class="kd-item__esc">转人工</span>
                  <small class="kd-item__time">{{ fmtTime(r.createdAt) }}</small>
                  <AppIcon name="arrow-right" :size="13" class="kd-item__arrow" />
                </button>
              </template>

              <!-- 平均置信度 -->
              <template v-else-if="detailKey === 'confidence'">
                <div class="kd-buckets" v-if="stats">
                  <div class="kd-bucket">
                    <b>{{ stats.confBuckets.high }}</b>
                    <span>高置信 ≥75%</span>
                  </div>
                  <div class="kd-bucket">
                    <b>{{ stats.confBuckets.medium }}</b>
                    <span>中置信 50–75%</span>
                  </div>
                  <div class="kd-bucket">
                    <b>{{ stats.confBuckets.low }}</b>
                    <span>低置信 &lt;50%（自动转人工）</span>
                  </div>
                </div>
                <div v-if="!confSorted.length" class="kd__empty">暂无记录</div>
                <button v-for="r in confSorted" :key="r.id" class="kd-item" @click="gotoResult(r.id)">
                  <span class="kd-item__crop">{{ r.cropName || r.cropId }}</span>
                  <span class="kd-item__disease">{{ r.diagnosis?.results?.[0]?.name || '—' }}</span>
                  <span class="kd-item__conf" :class="topLevel(r)">
                    {{ Math.round(topConf(r) * 100) }}% {{ confLabel(topConf(r)) }}
                  </span>
                  <small class="kd-item__time">{{ fmtTime(r.createdAt) }}</small>
                  <AppIcon name="arrow-right" :size="13" class="kd-item__arrow" />
                </button>
              </template>

              <!-- 转人工 -->
              <template v-else-if="detailKey === 'escalated'">
                <div v-if="!escalatedRecords.length" class="kd__empty">
                  近 {{ stats?.days || days }} 天没有需要人工复核的病例，说明模型置信度整体健康
                </div>
                <button v-for="r in escalatedRecords" :key="r.id" class="kd-item" @click="gotoResult(r.id)">
                  <span class="kd-item__crop">{{ r.cropName || r.cropId }}</span>
                  <span class="kd-item__disease">{{ r.diagnosis?.results?.[0]?.name || '—' }}</span>
                  <span class="kd-item__conf is-low">
                    置信 {{ Math.round(topConf(r) * 100) }}%
                  </span>
                  <span class="kd-item__esc">转人工</span>
                  <small class="kd-item__time">{{ fmtTime(r.createdAt) }}</small>
                  <AppIcon name="arrow-right" :size="13" class="kd-item__arrow" />
                </button>
              </template>

              <!-- 涉及病害 -->
              <template v-else>
                <div v-if="!stats?.topDiseases.length" class="kd__empty">暂无病害数据</div>
                <div v-for="(d, i) in stats?.topDiseases || []" :key="d.name" class="kd-disease">
                  <span class="kd-disease__idx">{{ i + 1 }}</span>
                  <span class="kd-disease__name">{{ d.name }}</span>
                  <div class="kd-disease__bar">
                    <i
                      :style="{
                        width: `${(d.count / (stats?.topDiseases[0]?.count || 1)) * 100}%`
                      }"
                    />
                  </div>
                  <b class="kd-disease__count">{{ d.count }} 次</b>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
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

<style scoped>
/* KPI 可点击 */
.kpi {
  cursor: pointer;
  transition: transform var(--dur-fast), box-shadow var(--dur-fast);
}

.kpi:hover {
  transform: translateY(-2px);
  box-shadow: var(--sh-md, 0 8px 20px rgba(0, 0, 0, 0.08));
}

/* KPI 详情弹层 */
.kd-mask {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(14, 30, 22, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.kd {
  width: min(680px, 100%);
  max-height: 84vh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-page);
  border-radius: var(--r-xl);
  overflow: hidden;
}

.kd__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 18px;
  background: var(--c-bg-card);
  border-bottom: 1px solid var(--c-line-soft);
}

.kd__head h3 {
  font-size: 16px;
  font-weight: 800;
  color: var(--c-text-1);
}

.kd__head p {
  margin-top: 3px;
  font-size: 11px;
  color: var(--c-text-4);
}

.kd__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--c-bg-muted);
  color: var(--c-text-3);
  flex-shrink: 0;
}

.kd__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px 18px;
}

.kd__empty {
  padding: 44px 16px;
  text-align: center;
  color: var(--c-text-4);
  font-size: 12.5px;
  line-height: 1.8;
}

.kd__tip {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--c-text-4);
}

/* 记录行 */
.kd-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 11px 13px;
  margin-bottom: 7px;
  border-radius: 11px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  text-align: left;
  transition: all var(--dur-fast);
}

.kd-item:hover {
  border-color: var(--c-primary-300);
  background: var(--c-primary-50);
}

.kd-item__crop {
  font-size: 12px;
  font-weight: 700;
  color: var(--c-text-1);
  flex-shrink: 0;
  min-width: 56px;
}

.kd-item__disease {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: var(--c-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kd-item__conf {
  font-size: 10.5px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--r-full);
  flex-shrink: 0;
}

.kd-item__conf.high {
  background: #e6f6ec;
  color: #15803d;
}

.kd-item__conf.medium {
  background: #fef9c3;
  color: #a16207;
}

.kd-item__conf.low,
.kd-item__conf.is-low {
  background: #fee2e2;
  color: #b91c1c;
}

.kd-item__esc {
  font-size: 9px;
  font-weight: 800;
  color: #fff;
  background: var(--c-danger);
  padding: 2px 7px;
  border-radius: var(--r-full);
  flex-shrink: 0;
}

.kd-item__time {
  font-size: 10px;
  color: var(--c-text-4);
  flex-shrink: 0;
}

.kd-item__arrow {
  color: var(--c-text-4);
  flex-shrink: 0;
}

/* 置信度分桶 */
.kd-buckets {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
  margin-bottom: 12px;
}

.kd-bucket {
  padding: 13px;
  border-radius: 12px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: center;
}

.kd-bucket b {
  font-size: 20px;
  color: var(--c-text-1);
}

.kd-bucket span {
  font-size: 10.5px;
  color: var(--c-text-4);
}

/* 病害明细 */
.kd-disease {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 13px;
  margin-bottom: 7px;
  border-radius: 11px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
}

.kd-disease__idx {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 800;
  background: var(--c-primary-50);
  color: var(--c-primary-700);
  flex-shrink: 0;
}

.kd-disease__name {
  width: 150px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-text-1);
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.kd-disease__bar {
  flex: 1;
  height: 8px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  overflow: hidden;
}

.kd-disease__bar i {
  display: block;
  height: 100%;
  border-radius: var(--r-full);
  background: linear-gradient(90deg, var(--c-primary-500), var(--c-primary-600));
}

.kd-disease__count {
  font-size: 12px;
  color: var(--c-text-1);
  flex-shrink: 0;
}

/* 作物可搜索下拉 */
.crop-select { position: relative; }
.crop-select__btn { display: inline-flex; align-items: center; gap: 6px; }
.rot-180 { transform: rotate(180deg); transition: transform var(--dur-fast); }

.crop-select__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  width: 260px;
  background: #fff;
  border: 1px solid var(--c-line-soft);
  border-radius: 12px;
  box-shadow: 0 12px 36px rgba(12, 40, 26, 0.16);
  overflow: hidden;
  animation: cropdrop 0.18s var(--ease-out);
}

@keyframes cropdrop {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

.crop-select__search {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  height: 38px;
  border-bottom: 1px solid var(--c-line-soft);
  color: var(--c-text-4);
}

.crop-select__search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  font-size: 12.5px;
  color: var(--c-text-1);
  background: transparent;
}

.crop-select__list {
  max-height: 260px;
  overflow-y: auto;
  padding: 6px;
}

.crop-select__item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 12.5px;
  color: var(--c-text-2);
  text-align: left;
  transition: background var(--dur-fast), color var(--dur-fast);
}

.crop-select__item:hover { background: var(--c-primary-50); color: var(--c-primary-700); }

.crop-select__item.is-on {
  background: var(--c-primary-50);
  color: var(--c-primary-700);
  font-weight: 700;
}

.crop-select__item em {
  margin-left: auto;
  font-style: normal;
  font-size: 10.5px;
  color: var(--c-text-4);
  font-weight: 500;
}

.crop-select__empty {
  padding: 14px;
  text-align: center;
  font-size: 12px;
  color: var(--c-text-4);
}
</style>