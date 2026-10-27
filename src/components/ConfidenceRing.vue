<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  modelValue: number
  level?: 'high' | 'medium' | 'low'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}>()

const pct = computed(() => Math.round(props.modelValue * 100))

const tone = computed(() => {
  const v = props.modelValue
  if (props.level === 'high' || v >= 0.65) return 'high'
  if (props.level === 'medium' || v >= 0.4) return 'medium'
  return 'low'
})

const label = computed(() => ({ high: '较高把握', medium: '一般', low: '偏低' })[tone.value])

const radius = computed(() => (props.size === 'lg' ? 30 : props.size === 'sm' ? 18 : 24))
const strokeWidth = computed(() => (props.size === 'lg' ? 5 : props.size === 'sm' ? 3.5 : 4))
const boxSize = computed(() => radius.value * 2 + strokeWidth.value * 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const offset = computed(() => circumference.value * (1 - props.modelValue))
</script>

<template>
  <div class="conf" :class="[`conf--${tone}`, `conf--${size || 'md'}`]">
    <div class="conf__ring" :style="{ width: boxSize + 'px', height: boxSize + 'px' }">
      <svg :width="boxSize" :height="boxSize" :viewBox="`0 0 ${boxSize} ${boxSize}`">
        <circle
          :cx="boxSize / 2"
          :cy="boxSize / 2"
          :r="radius"
          class="conf__track"
          :stroke-width="strokeWidth"
          fill="none"
        />
        <circle
          :cx="boxSize / 2"
          :cy="boxSize / 2"
          :r="radius"
          class="conf__bar"
          :stroke-width="strokeWidth"
          fill="none"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="offset"
          :transform="`rotate(-90 ${boxSize / 2} ${boxSize / 2})`"
        />
      </svg>
      <span class="conf__num">{{ pct }}<i>%</i></span>
    </div>
    <span v-if="showLabel" class="conf__label">
      <AppIcon :name="tone === 'high' ? 'check-circle' : tone === 'medium' ? 'info' : 'alert'" :size="12" />
      {{ label }}
    </span>
  </div>
</template>

<style scoped>
.conf {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.conf__ring {
  position: relative;
  display: grid;
  place-items: center;
}

.conf__track {
  stroke: var(--c-line-soft);
}

.conf__bar {
  transition: stroke-dashoffset 900ms var(--ease-out);
}

.conf--high .conf__bar {
  stroke: var(--c-primary-500);
}
.conf--medium .conf__bar {
  stroke: var(--c-warning);
}
.conf--low .conf__bar {
  stroke: var(--c-danger);
}

.conf__num {
  position: absolute;
  font-family: var(--font-num);
  font-weight: 700;
  font-size: 17px;
  letter-spacing: -0.5px;
  color: var(--c-text-1);
  line-height: 1;
}

.conf__num i {
  font-style: normal;
  font-size: 10px;
  font-weight: 600;
  color: var(--c-text-3);
  margin-left: 1px;
}

.conf--lg .conf__num {
  font-size: 22px;
}

.conf--sm .conf__num {
  font-size: 13px;
}

.conf__label {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-text-3);
}

.conf--high .conf__label {
  color: var(--c-primary-600);
}
.conf--medium .conf__label {
  color: var(--c-accent-600);
}
.conf--low .conf__label {
  color: var(--c-danger);
}
</style>
