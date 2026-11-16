<script setup lang="ts">
/**
 * 作物图标：优先渲染真实作物照片（public/crops/img/），
 * 其次是 base64 自定义图片（dataURL），最后回退 emoji 文本
 */
import { computed } from 'vue'
import { cropImageOf } from '../data/cropImages'

const props = defineProps<{ emoji?: string; name?: string; size?: number }>()

const img = computed(() => {
  if (props.emoji && props.emoji.startsWith('data:')) return props.emoji
  return cropImageOf(props.emoji, props.name)
})
const px = computed(() => `${props.size || 22}px`)
</script>

<template>
  <img v-if="img" class="crop-emoji crop-emoji--img" :src="img" alt="" loading="lazy" />
  <span v-else class="crop-emoji">{{ emoji || '🌱' }}</span>
</template>

<style scoped>
.crop-emoji {
  font-size: v-bind(px);
  line-height: 1;
}

.crop-emoji--img {
  width: v-bind(px);
  height: v-bind(px);
  object-fit: cover;
  border-radius: 8px;
  display: block;
  box-shadow: 0 1px 3px rgba(31, 61, 46, 0.16);
  background: #f2f6f3;
}
</style>
