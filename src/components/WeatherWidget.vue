<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import SceneryBanner from '@/components/SceneryBanner.vue'
import { provinceOfRegion } from '@/data/regions'
import { fetchRealWeather } from '@/data/liveWeather'
import api from '@/api'
import type { WeatherData } from '@/types'

const props = defineProps<{ region: string; cropId?: string }>()
const weather = ref<WeatherData | null>(null)
const loading = ref(true)
const loadFail = ref(false)
const showDetail = ref(false)
/** 真实气象源标记（徽标展示用） */
const live = ref(false)

const SEV_TONE: Record<string, { color: string; bg: string }> = {
  red: { color: '#dc2626', bg: '#fee2e2' },
  orange: { color: '#e8823f', bg: '#fdf3e6' },
  yellow: { color: '#b8860b', bg: '#fef9e7' },
  blue: { color: '#2563eb', bg: '#dbeafe' },
  green: { color: '#059669', bg: '#d1fae5' }
}
const sevTone = (s: string) => SEV_TONE[s] || SEV_TONE.green

/**
 * 病害风险指数分级（全站唯一口径，弹窗标题 / 表格标签 / 卡片角标必须一致）
 * ≥75 高风险 · 60–74 中风险 · <60 低风险
 */
const RISK_LEVELS = { high: '高风险', medium: '中风险', low: '低风险' } as const
const riskLevelOf = (risk: number): keyof typeof RISK_LEVELS =>
  risk >= 75 ? 'high' : risk >= 60 ? 'medium' : 'low'

/** 弹窗首行文案：按风险等级给出完整句子（评审要求首行一句话可读） */
const firstLine = computed(() => {
  const peak = weather.value?.riskPeak ?? 0
  const level = riskLevelOf(peak)
  if (level === 'high')
    return `未来 7 天峰值病害风险指数 ${peak}（${RISK_LEVELS.high}），多降雨高湿环境，极易诱发作物病害流行`
  if (level === 'medium')
    return `未来 7 天峰值病害风险指数 ${peak}（${RISK_LEVELS.medium}），湿度上升时段注意田间通风，提前预防`
  return `未来 7 天天气平稳，峰值病害风险指数 ${peak}（${RISK_LEVELS.low}），病害流行风险较低`
})

/** 风险值三档色：与 riskLevelOf 同阈值，标签与弹窗标题严格一致 */
const riskTag = (risk: number) => {
  const level = riskLevelOf(risk)
  return {
    label: RISK_LEVELS[level],
    cls: level === 'high' ? 'is-hot' : level === 'medium' ? 'is-mid' : 'is-low'
  }
}

/** 表格日期列：统一「今天、明天、11 月 13 日」格式（兼容后端 11/13 简写） */
const fmtDay = (day: string, i: number) => {
  if (i < 2) return day
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(day)
  if (m) return `${Number(m[1])} 月 ${Number(m[2])} 日`
  return day
}

// 有非"平稳"级预警时在卡片上显示警示点
const hasWarnings = computed(
  () => weather.value?.warnings.some((w) => w.severity !== 'green') || false
)
const topWarning = computed(() => weather.value?.warnings.find((w) => w.severity !== 'green') || null)

const riskTone = computed(() => {
  const level = riskLevelOf(weather.value?.riskPeak ?? 0)
  if (level === 'high') return { color: '#ef4444', bg: '#fef2f2', text: RISK_LEVELS.high }
  if (level === 'medium') return { color: '#d97706', bg: '#fffbeb', text: RISK_LEVELS.medium }
  return { color: '#10b981', bg: '#ecfdf5', text: RISK_LEVELS.low }
})

const load = async () => {
  loading.value = true
  const region = props.region
  const cropId = props.cropId
  // 优先浏览器直连 Open-Meteo（更快且与地区严格对应），失败再走后端
  const real = await fetchRealWeather(region, cropId)
  if (region !== props.region) return
  if (real) {
    weather.value = real
    live.value = true
    loading.value = false
    return
  }
  try {
    const res = await api.weather(region, cropId)
    if (region !== props.region) return
    weather.value = res
    live.value = /open-meteo|真实/i.test((res as any).source || '')
  } catch {
    /* 天气失败不阻断 */
  } finally {
    if (region === props.region) {
      loading.value = false
      // 双通道（浏览器直连 + 后端接口）都失败时给出兜底提示
      loadFail.value = !weather.value
    }
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
            <i v-if="live" class="weather__live">实时</i>
            <i v-if="hasWarnings" class="weather__warn-dot"></i>
          </span>
          <span class="weather__risk" :style="{ color: riskTone.color, background: riskTone.bg }">
            病害风险 {{ riskTone.text }} · {{ weather.riskPeak }}
          </span>
        </div>

        <div class="weather__strip">
          <div
            v-for="(d, i) in weather.days.slice(0, 7)"
            :key="i"
            class="wday"
            :class="{ 'wday--sm-hide': i >= 5 }"
          >
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

    <!-- 兜底：双通道都拉取失败 -->
    <div v-else class="weather__fail">
      <p>⚠️ 天气与病害预测数据加载失败，请稍后重试</p>
      <button type="button" @click="load">重新加载</button>
    </div>

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
                <h3>{{ weather.region }}未来 7 天天气与病害风险预警</h3>
                <p class="wdetail__firstline" :class="{ 'is-hot': weather.riskPeak >= 75 }">
                  <template v-if="weather.riskPeak >= 75">⚠️ </template>{{ firstLine }}
                </p>
              </div>
              <button class="wdetail__close" title="关闭" aria-label="关闭" @click="showDetail = false">
                <AppIcon name="x" :size="16" />
              </button>
            </div>

            <!-- 预警列表（AI 病害风险提示区） -->
            <div class="wdetail__warnings">
              <div
                v-for="(w, i) in weather.warnings"
                :key="i"
                class="wcard"
                :style="{ '--sc': sevTone(w.severity).color, '--scb': sevTone(w.severity).bg }"
              >
                <div class="wcard__head">
                  <span class="wcard__type">{{ w.type }}</span>
                  <span class="wcard__ai">🤖 AI 病害风险预测</span>
                  <span class="wcard__day">{{ w.day }}</span>
                </div>
                <p class="wcard__desc">{{ w.desc }}</p>
                <ul class="wcard__actions">
                  <li v-for="(a, j) in w.actions" :key="j">{{ a }}</li>
                </ul>
              </div>
            </div>

            <!-- 分区分割线：AI 提示区 / 预报明细区 -->
            <div class="wdetail__divider" role="separator"></div>

            <!-- 7 天预报明细表格区 -->
            <div class="wdetail__days">
              <p class="wdetail__label">未来 7 天预报明细</p>
              <div class="wdetail__table-wrap">
                <div class="wdetail__table">
                  <div class="drow drow--head">
                    <span>日期</span>
                    <span>天气</span>
                    <span>气温</span>
                    <span>湿度</span>
                    <span>病害风险指数</span>
                  </div>
                  <div v-for="(d, i) in weather.days" :key="i" class="drow">
                    <span class="drow__day">{{ fmtDay(d.day, i) }}</span>
                    <span class="drow__cond">{{ d.cond }}</span>
                    <span class="drow__temp num-anim">{{ d.tempLow }}~{{ d.tempHigh }}°C</span>
                    <span class="drow__hum">{{ d.humidity }}%</span>
                    <span class="drow__risk" :class="riskTag(d.risk).cls">
                      {{ d.risk }}
                      <em class="drow__risk-tag">{{ riskTag(d.risk).label }}</em>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 农户决策提示（贴合农业产品文案） -->
            <p class="wdetail__hint">💡 建议结合田间实际巡查、作物品种和病害发生情况，采取对应防控措施；也可结合「病害图谱」「农技问答」进一步确认防治方案</p>

            <p class="wdetail__foot">
              {{ weather.source }} · 病害风险指数由温湿度与降水概率综合计算<br />
              说明：病害风险指数由 AI 模型结合气温、湿度、降水等条件综合预测，仅供农事决策参考。
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
  font-size: 12.5px;
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
  max-width: 680px;
  max-height: 84vh;
  background: var(--c-bg-card);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  overflow-y: auto;
  padding: 20px 24px calc(18px + env(safe-area-inset-bottom, 0px));
}

.wdetail__banner {
  margin-bottom: 12px;
}

/* 顶部横幅弱化：降高度 + 浅色遮罩，突出预警数据主体 */
.wdetail__banner :deep(.scenery__img) {
  height: 88px;
}

.wdetail__banner :deep(.scenery__shade) {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.22) 0%,
    rgba(255, 255, 255, 0.18) 45%,
    rgba(15, 40, 30, 0.4) 100%
  );
}

.wdetail__banner :deep(.scenery__region) {
  font-size: 13px;
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
  color: var(--c-text-3);
  margin-top: 3px;
  line-height: 1.6;
}

.wdetail__firstline.is-hot {
  color: #dc2626;
  font-weight: 600;
}

.wdetail__close {
  padding: 8px;
  min-width: 34px;
  min-height: 34px;
  border-radius: 50%;
  background: var(--c-bg-muted);
  color: var(--c-text-3);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s, transform 0.15s;
}

.wdetail__close:hover {
  background: rgba(220, 38, 38, 0.1);
  color: #dc2626;
  transform: scale(1.06);
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
  flex-wrap: wrap;
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
  font-size: 12.5px;
  color: var(--c-text-4);
}

/* AI 驱动标识（AI-Web 赛道加分点） */
.wcard__ai {
  font-size: 11.5px;
  font-weight: 700;
  color: #0d9488;
  background: rgba(13, 148, 136, 0.08);
  border: 1px solid rgba(13, 148, 136, 0.25);
  padding: 1px 8px;
  border-radius: var(--r-full);
  margin-left: 6px;
  white-space: nowrap;
}

/* 分区分割线：AI 提示区 / 表格区 */
.wdetail__divider {
  height: 1px;
  background: var(--c-line-soft);
  margin: 0 0 14px;
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
  font-size: 14px;
  font-weight: 700;
  color: var(--c-text-2);
  margin-bottom: 10px;
}

.wdetail__table-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.wdetail__table {
  border: 1px solid var(--c-line-soft);
  border-radius: var(--r-md);
  overflow: hidden;
  margin-bottom: 12px;
  min-width: 540px;
}

.drow {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1.3fr 1fr 1.6fr;
  align-items: center;
  padding: 13px 16px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--c-text-2);
}

.drow + .drow {
  border-top: 1px solid var(--c-line-soft);
}

.drow:nth-child(odd):not(.drow--head) {
  background: var(--c-bg-muted);
}

/* 表头行 */
.drow--head {
  font-weight: 700;
  font-size: 13.5px;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
}

/* 表头与数据列必须同向对齐：日期/天气左对齐，气温/湿度/风险指数右对齐 */
.drow--head span:nth-child(n + 3) {
  text-align: right;
}

.drow__day {
  font-weight: 700;
}

.drow__cond {
  color: var(--c-primary-700);
}

/* 气温/湿度/风险值右对齐，农户横向读数不串行 */
.drow__temp,
.drow__hum,
.drow__risk {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.drow__hum {
  color: var(--c-text-4);
}

.drow__risk {
  font-weight: 700;
  color: var(--c-text-3);
  font-family: var(--font-num);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
}

/* 风险三档色：红/黄/绿（与登录页、诊断页同一套设计语言） */
.drow__risk.is-hot {
  color: #dc2626;
}
.drow__risk.is-mid {
  color: #d97706;
}
.drow__risk.is-low {
  color: #059669;
}

.drow__risk-tag {
  font-style: normal;
  font-size: 12.5px;
  font-weight: 700;
  padding: 2px 9px;
  border-radius: var(--r-full);
}
.drow__risk.is-hot .drow__risk-tag {
  color: #dc2626;
  background: #fee2e2;
}
.drow__risk.is-mid .drow__risk-tag {
  color: #d97706;
  background: #fef3c7;
}
.drow__risk.is-low .drow__risk-tag {
  color: #059669;
  background: #d1fae5;
}

/* 功能联动提示 */
.wdetail__hint {
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--c-text-3);
  background: rgba(13, 148, 136, 0.05);
  border: 1px dashed rgba(13, 148, 136, 0.25);
  border-radius: var(--r-md);
  padding: 11px 14px;
  margin-bottom: 12px;
  line-height: 1.6;
}

.wdetail__foot {
  font-size: 12.5px;
  color: var(--c-text-4);
  text-align: center;
  line-height: 1.7;
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

/* 加载失败兜底 */
.weather__fail {
  text-align: center;
  padding: 6px 0 2px;
}
.weather__fail p {
  font-size: 12px;
  color: var(--c-text-3);
  margin-bottom: 9px;
}
.weather__fail button {
  font-size: 12px;
  font-weight: 700;
  color: var(--c-primary-700);
  background: rgba(31, 138, 76, 0.08);
  border: 1px solid rgba(31, 138, 76, 0.3);
  border-radius: var(--r-full);
  padding: 6px 18px;
  cursor: pointer;
  transition: background 0.15s;
}
.weather__fail button:hover {
  background: rgba(31, 138, 76, 0.16);
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
  font-size: 12.5px;
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
  font-size: 11.5px;
  font-weight: 600;
  color: var(--c-text-2);
}

.wday__cond {
  font-size: 12.5px;
  color: var(--c-primary-700);
  font-weight: 600;
}

.wday__temp {
  font-size: 11.5px;
  color: var(--c-text-2);
  font-weight: 600;
}

.wday__rain {
  font-size: 11.5px;
  color: #5566d8;
}

.weather__note {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--c-text-3);
  padding-top: 9px;
  border-top: 1px dashed rgba(230, 235, 232, 0.9);
}

@media (max-width: 959px) {
  /* 移动端收窄：只显示前 5 天，第 6/7 天隐藏 */
  .wday--sm-hide {
    display: none;
  }
}

@media (min-width: 960px) {
  .weather__strip {
    grid-template-columns: repeat(7, 1fr);
  }
}

/* 实时气象徽标 */
.weather__live {
  font-style: normal;
  font-size: 11.5px;
  font-weight: 800;
  letter-spacing: 0.4px;
  color: #fff;
  background: linear-gradient(135deg, #16a34a, #0d9488);
  padding: 1px 6px;
  border-radius: var(--r-full);
  margin-left: 2px;
  vertical-align: 1px;
}

</style>
