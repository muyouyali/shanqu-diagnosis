<script setup lang="ts">
/**
 * 统一空状态：插图（SVG 场景）+ 标题 + 说明 + 可选行动按钮
 * 用于：我的档案诊断记录、问答历史、专家复核工单、样本审核等列表空态
 */
import AppIcon from '@/components/AppIcon.vue'

withDefaults(
  defineProps<{
    /** 场景类型：record=诊断档案 / qa=问答 / review=复核完成 / sample=样本共建 / search=搜索无结果 */
    variant?: 'record' | 'qa' | 'review' | 'sample' | 'search'
    title: string
    desc?: string
    actionText?: string
    actionIcon?: string
  }>(),
  { variant: 'record', desc: '', actionText: '', actionIcon: 'arrow-right' }
)

defineEmits<{ (e: 'action'): void }>()
</script>

<template>
  <div class="empty-state">
    <!-- 插图区：柔和圆形底 + 主图标 + 装饰点，避免纯文字空洞感 -->
    <div class="empty-state__art" :class="`is-${variant}`">
      <span class="empty-state__halo"></span>
      <span class="empty-state__halo empty-state__halo--2"></span>

      <svg class="empty-state__scene" viewBox="0 0 120 96" fill="none" aria-hidden="true">
        <!-- 地面 -->
        <ellipse cx="60" cy="84" rx="42" ry="7" fill="currentColor" opacity="0.10" />

        <template v-if="variant === 'record'">
          <!-- 病历夹 -->
          <rect x="30" y="26" width="60" height="50" rx="6" fill="#fff" stroke="currentColor" stroke-width="2.4" />
          <rect x="44" y="18" width="32" height="12" rx="4" fill="#fff" stroke="currentColor" stroke-width="2.4" />
          <path d="M42 46h20M42 56h30M42 66h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity="0.55" />
          <circle cx="82" cy="32" r="10" fill="currentColor" opacity="0.16" />
          <path d="M78 32l3 3 5-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </template>

        <template v-else-if="variant === 'qa'">
          <!-- 对话气泡 -->
          <path d="M24 28h54a9 9 0 019 9v24a9 9 0 01-9 9H52l-13 11V70H24a9 9 0 01-9-9V37a9 9 0 019-9z" fill="#fff" stroke="currentColor" stroke-width="2.4" />
          <path d="M31 44h40M31 55h26" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity="0.5" />
          <circle cx="92" cy="26" r="8" fill="currentColor" opacity="0.18" />
        </template>

        <template v-else-if="variant === 'review'">
          <!-- 通过勾选 -->
          <circle cx="60" cy="50" r="24" fill="#fff" stroke="currentColor" stroke-width="2.4" />
          <path d="M50 50l7 7 14-15" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M30 34l4 4M90 34l-4 4M30 66l4-4M90 66l-4-4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" opacity="0.45" />
        </template>

        <template v-else-if="variant === 'sample'">
          <!-- 幼苗 + 采样袋 -->
          <path d="M60 70V46" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
          <path d="M60 52c-12 0-18-8-18-16 10 0 18 6 18 16z" fill="currentColor" opacity="0.2" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
          <path d="M60 58c12 0 18-8 18-16-10 0-18 6-18 16z" fill="currentColor" opacity="0.12" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
          <path d="M42 70h36l-4 12H46z" fill="#fff" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" />
        </template>

        <template v-else>
          <circle cx="54" cy="46" r="20" fill="#fff" stroke="currentColor" stroke-width="2.4" />
          <path d="M69 61l14 14" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
          <path d="M46 46h16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity="0.5" />
        </template>
      </svg>
    </div>

    <p class="empty-state__title">{{ title }}</p>
    <small v-if="desc" class="empty-state__desc">{{ desc }}</small>
    <button v-if="actionText" class="btn btn--primary empty-state__btn" @click="$emit('action')">
      <AppIcon v-if="actionIcon" :name="actionIcon" :size="16" />
      {{ actionText }}
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 44px 20px 40px;
  color: var(--c-primary-600);
}

.empty-state__art {
  position: relative;
  width: 132px;
  height: 104px;
  display: grid;
  place-items: center;
  margin-bottom: 14px;
  color: var(--c-primary-500);
}

.empty-state__halo {
  position: absolute;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(47, 152, 104, 0.13), rgba(47, 152, 104, 0));
}
.empty-state__halo--2 {
  width: 128px;
  height: 128px;
  background: radial-gradient(circle, rgba(47, 152, 104, 0.07), rgba(47, 152, 104, 0));
}

.empty-state__scene {
  position: relative;
  width: 120px;
  height: 96px;
  color: var(--c-primary-500);
}

.empty-state__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--c-text-1);
  line-height: 1.6;
}

.empty-state__desc {
  margin-top: 6px;
  max-width: 320px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--c-text-3);
}

.empty-state__btn {
  margin-top: 18px;
  height: 42px;
  padding: 0 20px;
  font-size: 14px;
}
</style>
