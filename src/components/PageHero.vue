<script setup lang="ts">
/**
 * PageHero · 用户端页面统一横幅
 * 支持：真实背景图（压暗遮罩保证可读）/ 纯渐变 / 山脊剪影 / 光晕 / 玻璃质感徽章
 */
import AppIcon from '@/components/AppIcon.vue'

defineProps<{
  emoji?: string
  title: string
  desc?: string
  badge?: string
  badgeIcon?: string
  /** 徽章悬浮说明（如 RAG 的技术方案一句话解释） */
  badgeTip?: string
  /** 背景实拍图，不传则用渐变色 */
  image?: string
  /** 标签文案（如「多模态识图」等能力点） */
  tags?: string[]
  /** 仅宽屏（≥960px）显示，用于与移动端原有顶栏共存 */
  wideOnly?: boolean
}>()

const emit = defineEmits<{ badgeClick: [] }>()
</script>

<template>
  <header class="ph" :class="{ 'ph--wide-only': wideOnly, 'ph--has-img': !!image }">
    <img v-if="image" :src="image" :alt="title" class="ph__photo" />
    <!-- 渐变叠层：有图时压暗，无图时着色 -->
    <div class="ph__veil" />
    <!-- 山脊剪影 -->
    <svg class="ph__ridge" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true">
      <path
        d="M0 120 L70 68 L140 96 L215 46 L280 84 L350 58 L420 92 L500 52 L570 88 L650 62 L720 94 L800 56 L870 90 L950 64 L1030 96 L1110 58 L1200 88 L1200 120Z"
        fill="rgba(255,255,255,0.055)"
      />
      <path
        d="M0 120 L60 88 L130 104 L200 76 L270 100 L340 82 L410 104 L490 74 L560 100 L640 80 L710 104 L790 78 L860 102 L940 84 L1020 106 L1100 80 L1200 100 L1200 120Z"
        fill="rgba(255,255,255,0.075)"
      />
    </svg>
    <div class="ph__glow" />
    <div class="ph__deco ph__deco--1" />
    <div class="ph__deco ph__deco--2" />

    <div class="ph__inner">
      <div class="ph__text">
        <h1 class="ph__title">
          <span v-if="emoji" class="ph__emoji">{{ emoji }}</span>
          <span class="ph__title-txt">{{ title }}</span>
        </h1>
        <p v-if="desc" class="ph__desc">{{ desc }}</p>
        <div v-if="tags?.length" class="ph__tags">
          <span v-for="t in tags" :key="t" class="ph__tag">{{ t }}</span>
        </div>
        <div v-if="$slots.default" class="ph__extra"><slot /></div>
      </div>
      <button v-if="badge" class="ph__badge" @click="emit('badgeClick')">
        <AppIcon v-if="badgeIcon" :name="badgeIcon" :size="16" />
        <span>{{ badge }}</span>
        <i class="ph__badge-arrow">›</i>
        <span v-if="badgeTip" class="ph__badge-tip">{{ badgeTip }}</span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.ph {
  position: relative;
  overflow: hidden;
  margin-bottom: 20px;
  padding: 30px 32px 28px;
  border-radius: 0 0 24px 24px;
  color: #fff;
  background:
    radial-gradient(120% 180% at 100% 0%, rgba(255, 255, 255, 0.14), transparent 58%),
    linear-gradient(116deg, #0c3a20 0%, #14562f 42%, #1d7448 72%, #2f9e5f 100%);
  box-shadow: 0 6px 24px -12px rgba(12, 60, 34, 0.45);
}

.ph--has-img {
  background: #123a24;
}

/* 实拍图铺满 */
.ph__photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  transform: scale(1.02);
}

/* 遮罩：有图时绿色压暗，无图时加层次 */
.ph__veil {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(100deg, rgba(7, 34, 20, 0.9) 0%, rgba(9, 46, 27, 0.62) 48%, rgba(10, 52, 30, 0.5) 100%),
    linear-gradient(180deg, rgba(5, 24, 14, 0.3) 0%, transparent 42%, rgba(4, 20, 12, 0.55) 100%);
}
.ph:not(.ph--has-img) .ph__veil {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 55%);
}

/* 山脊剪影 */
.ph__ridge {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  width: 100%;
  height: 74px;
  pointer-events: none;
  opacity: 0.95;
}

/* 右上光晕 */
.ph__glow {
  position: absolute;
  right: -50px;
  top: -80px;
  z-index: 2;
  width: 260px;
  height: 260px;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(circle, rgba(146, 214, 176, 0.3), transparent 68%);
  filter: blur(4px);
}

/* 侧光条 */
.ph__deco {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  z-index: 2;
}
.ph__deco--1 {
  right: -70px;
  top: -120px;
  width: 300px;
  height: 300px;
  background: rgba(255, 255, 255, 0.06);
}
.ph__deco--2 {
  right: 130px;
  bottom: -150px;
  width: 270px;
  height: 270px;
  background: rgba(255, 255, 255, 0.045);
}

.ph__inner {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.ph__title {
  display: flex;
  align-items: center;
  gap: 11px;
  font-size: 25px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.28);
}

.ph__title-txt {
  background: linear-gradient(180deg, #ffffff, #e8f7ee);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.ph__emoji {
  font-size: 27px;
  line-height: 1;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.25));
}

.ph__desc {
  font-size: 13.5px;
  color: rgba(255, 255, 255, 0.88);
  margin-top: 8px;
  line-height: 1.7;
  max-width: 620px;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.3);
}

.ph__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.ph__tag {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: #eafaf1;
  background: rgba(255, 255, 255, 0.13);
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.13);
}

.ph__tag::before {
  content: '✓';
  margin-right: 5px;
  font-size: 12.5px;
  color: #a9e9c4;
}

.ph__extra {
  margin-top: 13px;
}

.ph__badge {
  flex-shrink: 0;
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 11px 19px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.17);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  font-size: 13px;
  font-weight: 700;
  border: 1px solid rgba(255, 255, 255, 0.26);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 4px 14px -6px rgba(0, 0, 0, 0.4);
  transition:
    background 0.2s,
    transform 0.2s,
    box-shadow 0.2s;
  cursor: pointer;
}

.ph__badge:hover {
  background: rgba(255, 255, 255, 0.29);
  transform: translateY(-1.5px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    0 8px 20px -8px rgba(0, 0, 0, 0.45);
}

.ph__badge:active {
  transform: translateY(0);
}

.ph__badge-arrow {
  font-style: normal;
  font-size: 15px;
  line-height: 1;
  opacity: 0.85;
  transition: transform 0.2s;
}

.ph__badge:hover .ph__badge-arrow {
  transform: translateX(2px);
}

/* 悬浮说明：向上弹出（横幅 overflow:hidden，下方会被裁切） */
.ph__badge-tip {
  position: absolute;
  bottom: calc(100% + 10px);
  right: 0;
  width: max-content;
  max-width: 260px;
  padding: 9px 13px;
  border-radius: 10px;
  background: rgba(12, 32, 22, 0.94);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.5;
  text-align: left;
  white-space: normal;
  box-shadow: 0 8px 22px -8px rgba(0, 0, 0, 0.6);
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition:
    opacity 0.18s,
    transform 0.18s;
  z-index: 5;
}

.ph__badge-tip::after {
  content: '';
  position: absolute;
  top: 100%;
  right: 26px;
  border: 5px solid transparent;
  border-top-color: rgba(12, 32, 22, 0.94);
}

.ph__badge:hover .ph__badge-tip {
  opacity: 1;
  transform: translateY(0);
}

@media (max-width: 720px) {
  .ph {
    padding: 22px 18px 20px;
    border-radius: 0 0 18px 18px;
  }
  .ph__title {
    font-size: 20px;
  }
  .ph__emoji {
    font-size: 22px;
  }
  .ph__ridge {
    height: 52px;
  }
  .ph__badge {
    padding: 9px 15px;
    font-size: 12px;
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
