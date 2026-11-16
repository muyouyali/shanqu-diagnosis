<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import SceneryBanner from '@/components/SceneryBanner.vue'
import { provinceOfRegion } from '@/data/regions'
import api from '@/api'
import { useAppStore } from '@/stores/app'

/**
 * 区域预警详情弹层
 * 展示：预警全文 + 高发病害排行（条形图）+ 区域分布 + 处置建议
 */
const props = defineProps<{
  show: boolean
  alert: {
    headline: string
    level: string
    analysis: string
    actions: string[]
    stats?: { total: number; days: number; escalatedRate: number }
  } | null
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const store = useAppStore()
const stats = ref<{
  topDiseases: { name: string; count: number }[]
  regions: { name: string; count: number }[]
  total: number
  avgConfidence: number
  escalatedRate: number
} | null>(null)

const LEVEL_TONE: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  red: { color: '#dc2626', bg: '#fee2e2', label: '紧急预警', icon: 'alert-octagon' },
  orange: { color: '#ea580c', bg: '#ffedd5', label: '重点预警', icon: 'alert' },
  yellow: { color: '#b8860b', bg: '#fef9e7', label: '值得关注', icon: 'alert' },
  green: { color: '#059669', bg: '#d1fae5', label: '平稳运行', icon: 'check-circle' }
}
const tone = (l?: string) => LEVEL_TONE[l || 'green'] || LEVEL_TONE.green

watch(
  () => props.show,
  async (v) => {
    if (!v) return
    stats.value = null
    try {
      stats.value = await api.stats({ days: props.alert?.stats?.days || 14 })
    } catch {
      /* 详情数据失败不阻断 */
    }
  }
)

const maxCount = () => Math.max(1, ...(stats.value?.topDiseases || []).map((d) => d.count))
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="show && alert" class="amask" @click.self="emit('close')">
        <div class="amodal">
          <SceneryBanner
            :province="provinceOfRegion(store.region)"
            :region="store.region"
            class="amodal__banner"
          />

          <div class="amodal__head">
            <div class="amodal__head-left">
              <span
                class="amodal__badge"
                :style="{ color: tone(alert.level).color, background: tone(alert.level).bg }"
              >
                <AppIcon :name="tone(alert.level).icon" :size="11" />
                {{ tone(alert.level).label }}
              </span>
              <p class="amodal__meta">
                {{ store.region }} · 近 {{ alert.stats?.days || 14 }} 天 · 共
                {{ alert.stats?.total || stats?.total || 0 }} 次诊断
              </p>
            </div>
            <button class="amodal__close" @click="emit('close')">
              <AppIcon name="x" :size="16" />
            </button>
          </div>

          <h3 class="amodal__title">{{ alert.headline }}</h3>
          <p class="amodal__analysis">{{ alert.analysis }}</p>

          <!-- 高发病害排行 -->
          <div v-if="stats?.topDiseases?.length" class="amodal__section">
            <p class="amodal__label">
              <AppIcon name="trending-up" :size="13" />
              高发病害排行
            </p>
            <div class="rank">
              <div v-for="(d, i) in stats.topDiseases.slice(0, 5)" :key="d.name" class="rank__row">
                <span class="rank__idx" :class="{ 'is-top': i === 0 }">{{ i + 1 }}</span>
                <span class="rank__name">{{ d.name }}</span>
                <div class="rank__bar-wrap">
                  <div
                    class="rank__bar"
                    :style="{ width: (d.count / maxCount()) * 100 + '%' }"
                  ></div>
                </div>
                <span class="rank__count num-anim">{{ d.count }} 次</span>
              </div>
            </div>
          </div>

          <!-- 区域分布 -->
          <div v-if="stats?.regions?.length" class="amodal__section">
            <p class="amodal__label">
              <AppIcon name="map-pin" :size="13" />
              区域分布 TOP5
            </p>
            <div class="chips">
              <span v-for="r in stats.regions.slice(0, 5)" :key="r.name" class="chip">
                {{ r.name }}
                <b>{{ r.count }}</b>
              </span>
            </div>
          </div>

          <!-- 处置建议 -->
          <div class="amodal__section">
            <p class="amodal__label">
              <AppIcon name="check-circle" :size="13" />
              处置建议
            </p>
            <ul class="acts">
              <li v-for="(a, i) in alert.actions" :key="i">
                <span class="acts__dot"></span>{{ a }}
              </li>
            </ul>
          </div>

          <!-- 质量指标 -->
          <div v-if="stats" class="amodal__kpis">
            <div class="kpi">
              <span class="kpi__v num-anim">{{ stats.avgConfidence || '--' }}%</span>
              <span class="kpi__k">平均置信度</span>
            </div>
            <div class="kpi">
              <span class="kpi__v num-anim">{{ stats.escalatedRate ?? 0 }}%</span>
              <span class="kpi__k">转人工比例</span>
            </div>
            <div class="kpi">
              <span class="kpi__v num-anim">{{ stats.total }}</span>
              <span class="kpi__k">诊断总量</span>
            </div>
          </div>

          <p class="amodal__foot">
            预警由多 Agent 诊断数据聚合分析生成，AI 模式下包含模型研判结论
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.amask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(10, 20, 15, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.amodal {
  width: 100%;
  max-width: 620px;
  max-height: 84vh;
  background: var(--c-bg-card);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  overflow-y: auto;
  padding: 16px 20px calc(16px + env(safe-area-inset-bottom, 0px));
}

.amodal__banner {
  margin-bottom: 12px;
}

.amodal__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.amodal__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 11px;
  border-radius: var(--r-full);
  font-size: 11.5px;
  font-weight: 700;
}

.amodal__meta {
  font-size: 11.5px;
  color: var(--c-text-4);
  margin-top: 5px;
}

.amodal__close {
  padding: 6px;
  border-radius: 50%;
  background: var(--c-bg-muted);
  color: var(--c-text-3);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.amodal__title {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.4;
  margin: 10px 0 6px;
  letter-spacing: -0.2px;
}

.amodal__analysis {
  font-size: 13px;
  line-height: 1.8;
  color: var(--c-text-3);
  margin-bottom: 16px;
}

.amodal__section {
  margin-bottom: 16px;
}

.amodal__label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-text-2);
  margin-bottom: 9px;
}

/* 排行条形图 */
.rank {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.rank__row {
  display: flex;
  align-items: center;
  gap: 9px;
}

.rank__idx {
  width: 20px;
  height: 20px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  font-size: 12.5px;
  font-weight: 700;
  background: var(--c-bg-muted);
  color: var(--c-text-4);
  flex-shrink: 0;
}

.rank__idx.is-top {
  background: linear-gradient(135deg, var(--c-accent-300), var(--c-accent-500));
  color: #fff;
}

.rank__name {
  width: 88px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.rank__bar-wrap {
  flex: 1;
  height: 8px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  overflow: hidden;
}

.rank__bar {
  height: 100%;
  border-radius: var(--r-full);
  background: linear-gradient(90deg, var(--c-primary-400), var(--c-primary-600));
  transition: width 0.6s var(--ease-out);
}

.rank__count {
  width: 46px;
  text-align: right;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-3);
  flex-shrink: 0;
}

/* 区域 chips */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
  font-size: 12px;
  color: var(--c-text-2);
}

.chip b {
  color: var(--c-primary-600);
  font-weight: 700;
}

/* 建议列表 */
.acts {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.acts li {
  display: flex;
  gap: 9px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--c-text-2);
}

.acts__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--c-primary-500);
  flex-shrink: 0;
  margin-top: 8px;
}

/* KPI */
.amodal__kpis {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
  margin-bottom: 12px;
}

.kpi {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 6px;
  border-radius: var(--r-md);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
}

.kpi__v {
  font-size: 19px;
  font-weight: 800;
  color: var(--c-primary-700);
}

.kpi__k {
  font-size: 11.5px;
  color: var(--c-text-4);
}

.amodal__foot {
  font-size: 11.5px;
  color: var(--c-text-4);
  text-align: center;
  line-height: 1.6;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity var(--dur-base);
}
.sheet-enter-active .amodal,
.sheet-leave-active .amodal {
  transition: transform var(--dur-base) var(--ease-out);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .amodal,
.sheet-leave-to .amodal {
  transform: translateY(40%);
}

@media (min-width: 960px) {
  .amask {
    align-items: center;
  }
  .amodal {
    border-radius: var(--r-xl);
  }
}
</style>
