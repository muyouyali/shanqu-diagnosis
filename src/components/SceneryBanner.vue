<script setup lang="ts">
import { computed } from 'vue'

/**
 * 地区风光横幅（真实照片版）
 * 8 种山地农业地貌主题，按省份映射；照片由 AI 参考实拍风格生成，
 * 底部渐变压暗保证文字可读（原扁平 SVG 插画已替换为照片）
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

/** 各主题的照片池（真实山地风光照片），每次横幅出现随机换一张，避免千篇一律 */
const THEME_PHOTO: Record<Theme, string[]> = {
  terraced: ['/media/banner-terrace.jpg', '/media/banner-cloudpeak.jpg', '/media/banner-valley.jpg', '/media/banner-meadow.jpg'],
  karst: ['/media/banner-mist.jpg', '/media/banner-cloudpeak.jpg', '/media/banner-pasture.jpg'],
  snow: ['/media/banner-snow.jpg', '/media/banner-alps.jpg', '/media/banner-holylake.jpg', '/media/banner-turquoise.jpg'],
  tea: ['/media/photo-tea.jpg', '/media/banner-valley.jpg', '/media/banner-pasture.jpg'],
  forest: ['/media/photo-forest.jpg', '/media/banner-valley.jpg', '/media/banner-pasture.jpg', '/media/banner-meadow.jpg'],
  loess: ['/media/photo-loess.jpg', '/media/banner-cloudpeak.jpg'],
  tropical: ['/media/photo-tropical.jpg'],
  plain: ['/media/photo-plain.jpg', '/media/banner-meadow.jpg']
}

const props = defineProps<{ province: string; region?: string; compact?: boolean; height?: number; align?: 'left' | 'right' }>()

const theme = computed<Theme>(() => PROVINCE_THEME[props.province] || 'terraced')
const label = computed(() => THEME_LABEL[theme.value])
// 组件每次挂载随机挑一张（弹窗/页面每次打开都是新实例 → 每次看到的背景都可能不同）
const photo = computed(() => {
  const pool = THEME_PHOTO[theme.value]
  return pool[Math.floor(Math.random() * pool.length)]
})
</script>

<template>
  <div class="scenery" :class="{ 'scenery--compact': compact, 'scenery--right': align === 'right' }">
    <img :src="photo" :alt="label" class="scenery__img" loading="lazy" />
    <div class="scenery__shade"></div>

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

.scenery__img {
  width: 100%;
  height: 120px;
  display: block;
  object-fit: cover;
}

.scenery--compact .scenery__img {
  height: 150px;
}

.scenery--compact {
  border-radius: 0;
  box-shadow: none;
}

/* 自底向上渐变压暗：白字在照片上始终清晰 */
.scenery__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(15, 40, 30, 0.1) 0%,
    rgba(15, 40, 30, 0.04) 40%,
    rgba(15, 40, 30, 0.46) 100%
  );
  pointer-events: none;
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

/* 文字靠右（供头像/内容占住左下角的页面使用，避免遮挡） */
.scenery--right .scenery__overlay {
  left: auto;
  right: 14px;
  bottom: 12px;
  align-items: flex-end;
  text-align: right;
}

.scenery__region {
  font-size: 15px;
  font-weight: 800;
  color: #fff;
  text-shadow: 0 1px 6px rgba(20, 50, 40, 0.55);
}

.scenery__label {
  font-size: 11.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  text-shadow: 0 1px 4px rgba(20, 50, 40, 0.5);
}
</style>
