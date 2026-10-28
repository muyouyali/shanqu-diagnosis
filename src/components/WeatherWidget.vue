<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import SceneryBanner from '@/components/SceneryBanner.vue'
import { provinceOfRegion } from '@/data/regions'
import api from '@/api'

interface WeatherDay {
  day: string
  cond: string
  rainProb: number
  tempLow: number
  tempHigh: number
  humidity: number
  risk: number
}
interface WeatherWarning {
  type: string
  severity: 'green' | 'blue' | 'yellow' | 'orange' | 'red'
  day: string
  desc: string
  actions: string[]
}
interface WeatherData {
  region: string
  source?: string
  days: WeatherDay[]
  warnings: WeatherWarning[]
  riskPeak: number
  riskLevel: 'low' | 'medium' | 'high'
  cropNote: string
}

const props = defineProps<{ region: string; cropId?: string }>()
const weather = ref<WeatherData | null>(null)
const loading = ref(true)
const showDetail = ref(false)

const SEV_TONE: Record<string, { color: string; bg: string }> = {
  red: { color: '#dc2626', bg: '#fee2e2' },
  orange: { color: '#ea580c', bg: '#ffedd5' },
  yellow: { color: '#b8860b', bg: '#fef9e7' },
  blue: { color: '#2563eb', bg: '#dbeafe' },
  green: { color: '#059669', bg: '#d1fae5' }
}
const sevTone = (s: string) => SEV_TONE[s] || SEV_TONE.green

// 有非"平稳"级预警时在卡片上显示警示点
const hasWarnings = computed(
  () => weather.value?.warnings.some((w) => w.severity !== 'green') || false
)
const topWarning = computed(() => weather.value?.warnings.find((w) => w.severity !== 'green') || null)

const riskTone = computed(() => {
  const l = weather.value?.riskLevel
  if (l === 'high') return { color: '#ef4444', bg: '#fef2f2', text: '偏高' }
  if (l === 'medium') return { color: '#d97706', bg: '#fffbeb', text: '中等' }
  return { color: '#10b981', bg: '#ecfdf5', text: '较低' }
})

const load = async () => {
  loading.value = true
  try {
    weather.value = await api.weather(props.region, props.cropId)
  } catch {
    /* 天气失败不阻断 */
  } finally {
    loading.value = false
  }
}

// 区域或作物切换时自动刷新
watch(
  () => [props.region, props.cropId],
  () => load()
)

onMounted(load)
</script>

<template>
  <div class="weather glass" v-reveal="120">
    <div v-if="loading" class="weather__sk">
      <div class="sk" style="width: 50%"></div>
      <div class="sk" style="width: 88%"></div>
    </div>

    <template v-else-if="weather">
      <button class="weather__main" @click="showDetail = true">
        <div class="weather__head">
          <span class="weather__title">
            <AppIcon name="map-pin" :size="13" />
            {{ weather.region }} · 未来 7 天
            <i v-if="hasWarnings" class="weather__warn-dot"></i>
          </span>
          <span class="weather__risk" :style="{ color: riskTone.color, background: riskTone.bg }">
            病害风险 {{ riskTone.text }} · {{ weather.riskPeak }}
          </span>
        </div>

        <div class="weather__strip">
          <div v-for="(d, i) in weather.days.slice(0, 5)" :key="i" class="wday">
            <span class="wday__name">{{ d.day }}</span>
            <span class="wday__cond">{{ d.cond }}</span>
            <span class="wday__temp num-anim">{{ d.tempLow }}~{{ d.tempHigh }}°</span>
            <span class="wday__rain">💧{{ d.rainProb }}%</span>
          </div>
        </div>

        <p class="weather__note">{{ weather.cropNote }}</p>

        <span class="weather__more">
          <template v-if="topWarning">
            <AppIcon name="alert" :size="11" />
            {{ topWarning.type }} · 点击查看预警详情
          </template>
          <template v-else>查看 7 天详情与灾害预警</template>
          <AppIcon name="arrow-right" :size="11" />
        </span>
      </button>
    </template>

    <!-- ===== 详情弹层 ===== -->
    <Teleport to="body">
      <Transition name="sheet">
        <div v-if="showDetail && weather" class="wdetail__mask" @click.self="showDetail = false">
          <div class="wdetail">
            <SceneryBanner
              :province="provinceOfRegion(weather.region)"
              :region="weather.region"
              class="wdetail__banner"
            />
            <div class="wdetail__head">
              <div>
                <h3>{{ weather.region }} · 7 天天气与灾害预警</h3>
                <p>综合病害风险指数 {{ weather.riskPeak }}（{{ riskTone.text }}）</p>
              </div>
              <button class="wdetail__close" @click="showDetail = false">
                <AppIcon name="x" :size="16" />
              </button>
            </div>

            <!-- 预警列表 -->
            <div class="wdetail__warnings">
              <div
                v-for="(w, i) in weather.warnings"
                :key="i"
                class="wcard"
                :style="{ '--sc': sevTone(w.severity).color, '--scb': sevTone(w.severity).bg }"
              >
                <div class="wcard__head">
                  <span class="wcard__type">{{ w.type }}</span>
                  <span class="wcard__day">{{ w.day }}</span>
                </div>
                <p class="wcard__desc">{{ w.desc }}</p>
                <ul class="wcard__actions">
                  <li v-for="(a, j) in w.actions" :key="j">{{ a }}</li>
                </ul>
              </div>
            </div>

            <!-- 7 天明细 -->
            <div class="wdetail__days">
              <p class="wdetail__label">未来 7 天明细</p>
              <div class="wdetail__table">
                <div v-for="(d, i) in weather.days" :key="i" class="drow">
                  <span class="drow__day">{{ d.day }}</span>
                  <span class="drow__cond">{{ d.cond }}</span>
                  <span class="drow__temp num-anim">{{ d.tempLow }}~{{ d.tempHigh }}°C</span>
                  <span class="drow__hum">湿度 {{ d.humidity }}%</span>
                  <span class="drow__risk" :class="{ 'is-hot': d.risk >= 75 }">{{ d.risk }}</span>
                </div>
              </div>
            </div>

            <p class="wdetail__foot">
              {{ weather.source }} · 病害风险指数由温湿度与降水概率综合计算
            </p>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.weather {
  padding: 15px 16px 13px;
  border-radius: var(--r-lg);
  box-shadow: var(--sh-sm);
}

.weather__main {
  width: 100%;
  text-align: left;
  display: block;
}

.weather__warn-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef4444;
  margin-left: 3px;
  vertical-align: 2px;
  animation: wd-pulse 1.6s ease-in-out infinite;
}

@keyframes wd-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.weather__more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 9px;
  font-size: 11px;
  font-weight: 700;
  color: #ea580c;
}

/* ===== 详情弹层 ===== */
.wdetail__mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(10, 20, 15, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.wdetail {
  width: 100%;
  max-width: 620px;
  max-height: 82vh;
  background: var(--c-bg-card);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  overflow-y: auto;
  padding: 18px 20px calc(16px + env(safe-area-inset-bottom, 0px));
}

.wdetail__banner {
  margin-bottom: 12px;
}

.wdetail__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.wdetail__head h3 {
  font-size: 16px;
  font-weight: 700;
}

.wdetail__head p {
  font-size: 11.5px;
  color: var(--c-text-4);
  margin-top: 2px;
}

.wdetail__close {
  padding: 6px;
  border-radius: 50%;
  background: var(--c-bg-muted);
  color: var(--c-text-3);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

/* 预警卡 */
.wdetail__warnings {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-bottom: 16px;
}

.wcard {
  border: 1px solid var(--c-line-soft);
  border-left: 3px solid var(--sc);
  border-radius: var(--r-md);
  padding: 12px 14px;
  background: #fff;
  box-shadow: var(--sh-xs);
}

.wcard__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.wcard__type {
  padding: 2px 9px;
  border-radius: var(--r-full);
  background: var(--scb);
  color: var(--sc);
  font-size: 11.5px;
  font-weight: 700;
}

.wcard__day {
  font-size: 11px;
  color: var(--c-text-4);
}

.wcard__desc {
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--c-text-2);
  margin-bottom: 8px;
}

.wcard__actions {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 8px;
  border-top: 1px dashed var(--c-line);
}

.wcard__actions li {
  display: flex;
  gap: 7px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--c-text-3);
}

.wcard__actions li::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--sc);
  flex-shrink: 0;
  margin-top: 7px;
}

/* 7 天明细 */
.wdetail__label {
  font-size: 12px;
  font-weight: 700;
  color: var(--c-text-2);
  margin-bottom: 8px;
}

.wdetail__table {
  border: 1px solid var(--c-line-soft);
  border-radius: var(--r-md);
  overflow: hidden;
  margin-bottom: 12px;
}

.drow {
  display: grid;
  grid-template-columns: 1.1fr 1fr 1.4fr 1.2fr 0.7fr;
  align-items: center;
  padding: 9px 12px;
  font-size: 11.5px;
  color: var(--c-text-2);
}

.drow + .drow {
  border-top: 1px solid var(--c-line-soft);
}

.drow:nth-child(odd) {
  background: var(--c-bg-muted);
}

.drow__day {
  font-weight: 700;
}

.drow__cond {
  color: var(--c-primary-700);
}

.drow__hum {
  color: var(--c-text-4);
}

.drow__risk {
  text-align: center;
  font-weight: 700;
  color: var(--c-text-3);
  font-family: var(--font-num);
}

.drow__risk.is-hot {
  color: #dc2626;
}

.wdetail__foot {
  font-size: 10.5px;
  color: var(--c-text-4);
  text-align: center;
  line-height: 1.6;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity var(--dur-base);
}
.sheet-enter-active .wdetail,
.sheet-leave-active .wdetail {
  transition: transform var(--dur-base) var(--ease-out);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .wdetail,
.sheet-leave-to .wdetail {
  transform: translateY(40%);
}

@media (min-width: 960px) {
  .wdetail__mask {
    align-items: center;
  }
  .wdetail {
    border-radius: var(--r-xl);
  }
}

.weather__sk .sk {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, #eef2f0 25%, #f7faf8 50%, #eef2f0 75%);
  background-size: 200% 100%;
  animation: wshimmer 1.4s infinite;
  margin-bottom: 9px;
}
@keyframes wshimmer {
  to {
    background-position: -200% 0;
  }
}

.weather__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 11px;
}

.weather__title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text-1);
}

.weather__risk {
  padding: 3px 9px;
  border-radius: var(--r-full);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.weather__strip {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  margin-bottom: 10px;
}

.wday {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 9px 2px;
  border-radius: var(--r-sm);
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.7);
}

.wday__name {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--c-text-2);
}

.wday__cond {
  font-size: 11px;
  color: var(--c-primary-700);
  font-weight: 600;
}

.wday__temp {
  font-size: 10.5px;
  color: var(--c-text-2);
  font-weight: 600;
}

.wday__rain {
  font-size: 10px;
  color: #5566d8;
}

.weather__note {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--c-text-3);
  padding-top: 9px;
  border-top: 1px dashed rgba(230, 235, 232, 0.9);
}

@media (min-width: 960px) {
  .weather__strip {
    grid-template-columns: repeat(7, 1fr);
  }
}
</style>
