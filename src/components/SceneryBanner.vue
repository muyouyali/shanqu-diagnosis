<script setup lang="ts">
import { computed } from 'vue'

/**
 * 地区风光插画横幅（纯 SVG，零资源加载）
 * 8 种山地农业地貌主题，按省份映射，层次感插画风格
 */
type Theme = 'terraced' | 'karst' | 'snow' | 'tea' | 'forest' | 'loess' | 'tropical' | 'plain'

const PROVINCE_THEME: Record<string, Theme> = {
  云南: 'terraced', 贵州: 'terraced', 广西: 'karst', 四川: 'snow', 重庆: 'karst',
  西藏: 'snow', 青海: 'snow', 新疆: 'snow', 甘肃: 'snow',
  福建: 'tea', 浙江: 'tea', 湖南: 'tea', 湖北: 'tea', 江西: 'tea', 安徽: 'tea', 台湾: 'tea',
  黑龙江: 'forest', 吉林: 'forest', 辽宁: 'forest', 内蒙古: 'forest',
  山西: 'loess', 陕西: 'loess', 河南: 'loess', 宁夏: 'loess', 山东: 'loess', 河北: 'loess',
  北京: 'loess', 天津: 'loess',
  海南: 'tropical', 广东: 'tropical',
  江苏: 'plain', 上海: 'plain'
}

const THEME_LABEL: Record<Theme, string> = {
  terraced: '云上梯田 · 山地农业核心区',
  karst: '喀斯特峰林 · 石山农业',
  snow: '雪域高原 · 高冷作物带',
  tea: '云雾茶山 · 湿润丘陵',
  forest: '莽莽林海 · 生态林区',
  loess: '黄土梯层 · 旱作农业',
  tropical: '热带果园 · 滨海丘陵',
  plain: '水乡田园 · 平原农区'
}

const props = defineProps<{ province: string; region?: string; compact?: boolean; height?: number }>()

const theme = computed<Theme>(() => PROVINCE_THEME[props.province] || 'terraced')
const label = computed(() => THEME_LABEL[theme.value])

const P: Record<Theme, { sky1: string; sky2: string; sun: string; m1: string; m2: string; m3: string; field1: string; field2: string; mist: string }> = {
  terraced: { sky1: '#a7d8c9', sky2: '#eafaf2', sun: '#ffd98a', m1: '#2f7a5c', m2: '#3f9a74', m3: '#57b48d', field1: '#7fcf9f', field2: '#b8e8cd', mist: 'rgba(255,255,255,0.45)' },
  karst: { sky1: '#9fc4e8', sky2: '#eef7ff', sun: '#ffd98a', m1: '#3a6e8f', m2: '#4f8aa8', m3: '#6ea8c2', field1: '#88c8a0', field2: '#c0e5cd', mist: 'rgba(255,255,255,0.5)' },
  snow: { sky1: '#8fb8e0', sky2: '#f0f7ff', sun: '#ffe2a8', m1: '#5d7ea6', m2: '#8aa8c6', m3: '#c4d6ea', field1: '#a9c8de', field2: '#e2eef8', mist: 'rgba(255,255,255,0.55)' },
  tea: { sky1: '#b5d99c', sky2: '#f3fbe8', sun: '#ffd98a', m1: '#3d7d3a', m2: '#52974a', m3: '#6fb35f', field1: '#8cc97a', field2: '#c4e8b4', mist: 'rgba(255,255,255,0.45)' },
  forest: { sky1: '#9cbcd4', sky2: '#eef6fb', sun: '#ffd98a', m1: '#2e5c48', m2: '#3f7a5e', m3: '#559675', field1: '#6fb090', field2: '#b0d8c4', mist: 'rgba(255,255,255,0.45)' },
  loess: { sky1: '#d4c49a', sky2: '#faf3e2', sun: '#ffcf7a', m1: '#a67c44', m2: '#bd9558', m3: '#d4af75', field1: '#dcc188', field2: '#eeddb2', mist: 'rgba(255,255,255,0.4)' },
  tropical: { sky1: '#9fd4e4', sky2: '#eefbfb', sun: '#ffd98a', m1: '#2f8a6a', m2: '#44a67f', m3: '#5fc096', field1: '#83d4a6', field2: '#c0eed4', mist: 'rgba(255,255,255,0.4)' },
  plain: { sky1: '#a8cfe0', sky2: '#f0f9fc', sun: '#ffd98a', m1: '#5d8f80', m2: '#74a896', m3: '#8ec2ae', field1: '#a4d4b6', field2: '#d8efe0', mist: 'rgba(255,255,255,0.5)' }
}
const p = computed(() => P[theme.value])
</script>

<template>
  <div class="scenery" :class="{ 'scenery--compact': compact }">
    <svg viewBox="0 0 600 180" preserveAspectRatio="xMidYMid slice" class="scenery__svg">
      <!-- 天空 -->
      <defs>
        <linearGradient :id="`sky-${theme}`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" :stop-color="p.sky1" />
          <stop offset="1" :stop-color="p.sky2" />
        </linearGradient>
      </defs>
      <rect width="600" height="180" :fill="`url(#sky-${theme})`" />

      <!-- 太阳与云 -->
      <circle cx="480" cy="46" r="22" :fill="p.sun" opacity="0.9" />
      <ellipse cx="120" cy="40" rx="52" ry="11" fill="#fff" opacity="0.55" />
      <ellipse cx="200" cy="58" rx="38" ry="8" fill="#fff" opacity="0.4" />

      <!-- 雪山（snow 主题加雪顶） -->
      <g v-if="theme === 'snow'">
        <path d="M0 130 L70 60 L130 118 L200 44 L280 128 L340 76 L420 132 L520 66 L600 122 L600 180 L0 180Z" :fill="p.m2" />
        <path d="M200 44 L232 78 L214 78 L226 96 L200 84 L178 98 L172 78 L160 80Z" fill="#fff" opacity="0.92" />
        <path d="M520 66 L546 96 L530 94 L544 112 L516 100 L498 114 L494 94Z" fill="#fff" opacity="0.85" />
      </g>

      <!-- 喀斯特峰林 -->
      <g v-else-if="theme === 'karst'">
        <path d="M60 180 Q84 70 108 180Z" :fill="p.m2" />
        <path d="M130 180 Q160 40 196 180Z" :fill="p.m1" />
        <path d="M230 180 Q252 84 276 180Z" :fill="p.m3" />
        <path d="M330 180 Q362 30 400 180Z" :fill="p.m2" />
        <path d="M430 180 Q452 92 476 180Z" :fill="p.m3" />
        <path d="M510 180 Q540 58 574 180Z" :fill="p.m1" opacity="0.9" />
      </g>

      <!-- 常规连山 -->
      <g v-else>
        <path d="M0 118 L90 62 L180 116 L280 54 L390 120 L480 68 L600 118 L600 180 L0 180Z" :fill="p.m1" />
        <path d="M0 138 L110 92 L230 140 L360 88 L480 142 L600 96 L600 180 L0 180Z" :fill="p.m2" />
      </g>

      <!-- 雾带 -->
      <ellipse cx="300" cy="132" rx="340" ry="16" :fill="p.mist" />
      <ellipse cx="120" cy="146" rx="200" ry="10" :fill="p.mist" />

      <!-- 近景田地 -->
      <path d="M0 152 Q150 140 300 152 T600 152 L600 180 L0 180Z" :fill="p.field1" />
      <path d="M0 166 Q200 156 400 166 T600 164 L600 180 L0 180Z" :fill="p.field2" />

      <!-- 梯田弧线（terraced） -->
      <g v-if="theme === 'terraced'" stroke="#fff" stroke-width="1.6" fill="none" opacity="0.55">
        <path d="M10 158 Q300 148 590 158" />
        <path d="M0 166 Q300 156 600 166" />
        <path d="M20 174 Q300 164 580 174" />
      </g>

      <!-- 茶垄弧线（tea） -->
      <g v-else-if="theme === 'tea'" :stroke="p.m1" stroke-width="2.4" fill="none" opacity="0.5">
        <path d="M0 158 Q150 148 300 158 T600 156" />
        <path d="M0 166 Q200 156 400 166 T600 164" />
        <path d="M0 174 Q150 164 300 174 T600 172" />
      </g>

      <!-- 椰树（tropical） -->
      <g v-else-if="theme === 'tropical'">
        <g transform="translate(70 152)">
          <path d="M0 0 Q-4 -28 -8 -44" stroke="#7a5a3a" stroke-width="5" fill="none" stroke-linecap="round" />
          <g fill="#2f8a5a">
            <ellipse cx="-16" cy="-48" rx="16" ry="6" transform="rotate(-24 -16 -48)" />
            <ellipse cx="10" cy="-50" rx="16" ry="6" transform="rotate(18 10 -50)" />
            <ellipse cx="-4" cy="-56" rx="15" ry="5" transform="rotate(-4 -4 -56)" />
          </g>
        </g>
        <g transform="translate(545 154) scale(0.85)">
          <path d="M0 0 Q4 -26 8 -42" stroke="#7a5a3a" stroke-width="5" fill="none" stroke-linecap="round" />
          <g fill="#2f8a5a">
            <ellipse cx="-14" cy="-46" rx="15" ry="6" transform="rotate(-20 -14 -46)" />
            <ellipse cx="10" cy="-48" rx="15" ry="6" transform="rotate(16 10 -48)" />
          </g>
        </g>
      </g>

      <!-- 林海松树（forest） -->
      <g v-else-if="theme === 'forest'" fill="#2e5c48">
        <path d="M60 152 l8 -18 l8 18Z" opacity="0.8" />
        <path d="M92 154 l7 -14 l7 14Z" opacity="0.65" />
        <path d="M500 152 l9 -20 l9 20Z" opacity="0.8" />
        <path d="M536 154 l7 -14 l7 14Z" opacity="0.7" />
        <path d="M470 156 l6 -12 l6 12Z" opacity="0.6" />
      </g>

      <!-- 水面反光（plain） -->
      <g v-else-if="theme === 'plain'" stroke="#fff" opacity="0.5" stroke-width="2" stroke-linecap="round">
        <path d="M80 172 h50" />
        <path d="M420 168 h40" />
        <path d="M260 175 h60" />
      </g>
    </svg>

    <div class="scenery__overlay">
      <span class="scenery__region">{{ region }}</span>
      <span class="scenery__label">{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
.scenery {
  position: relative;
  border-radius: var(--r-md);
  overflow: hidden;
  line-height: 0;
  box-shadow: var(--sh-xs);
}

.scenery__svg {
  width: 100%;
  height: 120px;
  display: block;
}

.scenery--compact .scenery__svg {
  height: 150px;
}

.scenery--compact {
  border-radius: 0;
  box-shadow: none;
}

.scenery__overlay {
  position: absolute;
  left: 12px;
  bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.4;
}

.scenery__region {
  font-size: 15px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 6px rgba(20, 50, 40, 0.45);
}

.scenery__label {
  font-size: 10.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 4px rgba(20, 50, 40, 0.4);
}
</style>
