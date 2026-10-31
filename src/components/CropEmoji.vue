<script setup lang="ts">
/**
 * 作物图标：兼容 emoji 文本与 base64 自定义图片（dataURL）
 */
import { computed } from 'vue'

const props = defineProps<{ emoji?: string; size?: number }>()

const isImage = computed(() => !!props.emoji && props.emoji.startsWith('data:'))
const px = computed(() => `${props.size || 22}px`)
</script>

<template>
  <img v-if="isImage" class="crop-emoji crop-emoji--img" :src="emoji" alt="" />
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
  border-radius: 6px;
  display: block;
}
</style>
