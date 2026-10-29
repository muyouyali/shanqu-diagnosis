<script setup lang="ts">
/**
 * PageHero · 用户端页面统一渐变横幅
 * 与首页主视觉同款配色，支持右侧徽章与装饰波纹
 */
import AppIcon from '@/components/AppIcon.vue'

defineProps<{
  emoji?: string
  title: string
  desc?: string
  badge?: string
  badgeIcon?: string
  /** 仅宽屏（≥960px）显示，用于与移动端原有顶栏共存 */
  wideOnly?: boolean
}>()
</script>

<template>
  <header class="ph" :class="{ 'ph--wide-only': wideOnly }">
    <div class="ph__deco ph__deco--1" />
    <div class="ph__deco ph__deco--2" />
    <div class="ph__inner">
      <div class="ph__text">
        <h1 class="ph__title">
          <span v-if="emoji" class="ph__emoji">{{ emoji }}</span>
          {{ title }}
        </h1>
        <p v-if="desc" class="ph__desc">{{ desc }}</p>
        <div v-if="$slots.default" class="ph__extra"><slot /></div>
      </div>
      <div v-if="badge" class="ph__badge">
        <AppIcon v-if="badgeIcon" :name="badgeIcon" :size="16" />
        <span>{{ badge }}</span>
      </div>
    </div>
  </header>
</template>

<style scoped>
.ph {
  position: relative;
  overflow: hidden;
  margin-bottom: 20px;
  padding: 30px 32px 28px;
  border-radius: 0 0 22px 22px;
  color: #fff;
  background:
    radial-gradient(130% 200% at 100% 0%, rgba(255, 255, 255, 0.13), transparent 55%),
    linear-gradient(118deg, #0f3d22, #17643a 58%, #2f9e5f);
}

/* 波浪装饰 */
.ph__deco {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}

.ph__deco--1 {
  right: -60px;
  top: -110px;
  width: 300px;
  height: 300px;
  background: rgba(255, 255, 255, 0.07);
}

.ph__deco--2 {
  right: 120px;
  bottom: -140px;
  width: 260px;
  height: 260px;
  background: rgba(255, 255, 255, 0.05);
}

.ph__inner {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.ph__title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
}

.ph__emoji {
  font-size: 26px;
  line-height: 1;
}

.ph__desc {
  font-size: 13.5px;
  opacity: 0.86;
  margin-top: 7px;
  line-height: 1.65;
  max-width: 640px;
}

.ph__extra {
  margin-top: 12px;
}

.ph__badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  font-size: 13px;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.18);
}

@media (max-width: 720px) {
  .ph {
    padding: 22px 18px 20px;
    border-radius: 0 0 18px 18px;
  }
  .ph__title {
    font-size: 20px;
  }
}

/* 宽屏专属：移动端隐藏 */
.ph--wide-only {
  display: none;
}

@media (min-width: 960px) {
  .ph--wide-only {
    display: block;
  }
}
</style>
