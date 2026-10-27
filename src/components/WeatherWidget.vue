<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
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
interface WeatherData {
  region: string
  days: WeatherDay[]
  riskPeak: number
  riskLevel: 'low' | 'medium' | 'high'
  cropNote: string
}

const props = defineProps<{ region: string; cropId?: string }>()
const weather = ref<WeatherData | null>(null)
const loading = ref(true)

const riskTone = computed(() => {
  const l = weather.value?.riskLevel
  if (l === 'high') return { color: '#ef4444', bg: '#fef2f2', text: '偏高' }
  if (l === 'medium') return { color: '#d97706', bg: '#fffbeb', text: '中等' }
  return { color: '#10b981', bg: '#ecfdf5', text: '较低' }
})

onMounted(async () => {
  try {
    weather.value = await api.weather(props.region, props.cropId)
  } catch {
    /* 天气失败不阻断 */
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="weather glass" v-reveal="120">
    <div v-if="loading" class="weather__sk">
      <div class="sk" style="width: 50%"></div>
      <div class="sk" style="width: 88%"></div>
    </div>

    <template v-else-if="weather">
      <div class="weather__head">
        <span class="weather__title">
          <AppIcon name="map-pin" :size="13" />
          {{ weather.region }} · 未来 7 天
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
    </template>
  </div>
</template>

<style scoped>
.weather {
  padding: 15px 16px 13px;
  border-radius: var(--r-lg);
  box-shadow: var(--sh-sm);
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
