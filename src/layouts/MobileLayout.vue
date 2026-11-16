<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import UserMenu from '@/components/UserMenu.vue'
import DemoBanner from '@/components/DemoBanner.vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
/** 仅开发环境显示演示提示条（生产构建自动剔除，避免评委误读核心 AI 能力） */
const isDev = import.meta.env.DEV
onMounted(() => store.restoreUser())

const route = useRoute()
const router = useRouter()

/* ===== Backtop 回到顶部 ===== */
const showBacktop = ref(false)
const onScroll = () => (showBacktop.value = window.scrollY > 500)
const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', onScroll))

/* ===== Tour 首次访问漫游引导（localStorage 记忆，仅农户端出现一次） ===== */
const TOUR_KEY = 'ylnz_tour_done'
const tour = ref(false)
const tourStep = ref(0)
const tourSteps = [
  { title: '拍照诊断，30 秒出结果', desc: '点击「拍照诊断」上传病叶照片，AI 多 Agent 自动识别作物与病害，给出用药方案' },
  { title: '实时天气 + 病害预警', desc: '首页天气卡展示您所在州市的 7 天实况，连续降雨时会自动推送病害风险预警' },
  { title: '本地作物图谱随身查', desc: '收录您所在州市主栽作物的常见病害图文对照，可搜索症状快速定位' },
  { title: '问答与专家支持', desc: '大白话提问 AI 农技员，任何作物都能问；疑难问题可转对口专家一对一咨询' }
]
onMounted(() => {
  if (!localStorage.getItem(TOUR_KEY) && route.path === '/') {
    setTimeout(() => (tour.value = true), 1200)
  }
})
/* 引导不阻塞操作：用户跳转到其他页面时自动结束引导（遮罩不拦截任何点击） */
watch(
  () => route.path,
  (p) => {
    if (tour.value && p !== '/') finishTour()
  }
)
const finishTour = () => {
  tour.value = false
  localStorage.setItem(TOUR_KEY, '1')
}

const tabs = [
  { name: 'home', path: '/', label: '首页', icon: 'home' },
  { name: 'knowledge', path: '/knowledge', label: '病害图谱', icon: 'book' },
  { name: 'diagnose', path: '/diagnose', label: '诊断', icon: 'camera', center: true },
  { name: 'qa', path: '/qa', label: '农技问答', icon: 'chat' },
  { name: 'archive', path: '/archive', label: '我的档案', icon: 'archive' }
]

const active = computed(() => {
  const p = route.path
  if (p === '/') return 'home'
  if (p.startsWith('/diagnose') || p.startsWith('/result')) return 'diagnose'
  if (p.startsWith('/qa')) return 'qa'
  if (p.startsWith('/archive')) return 'archive'
  if (p.startsWith('/knowledge')) return 'knowledge'
  return ''
})

const go = (path: string) => {
  if (route.path !== path) router.push(path)
}
</script>

<template>
  <div class="mobile-shell">
    <!-- 宽屏顶部导航（网页版） -->
    <header class="topnav">
      <div class="topnav__inner">
        <router-link to="/" class="topnav__brand">
          <span class="topnav__logo"><AppIcon name="leaf" :size="19" :stroke="2.2" /></span>
          <strong>云岭农诊</strong>
          <span class="topnav__brand-tag">AI 植保</span>
        </router-link>
        <nav class="topnav__links">
          <router-link to="/" class="topnav__link" :class="{ 'is-active': active === 'home' }">
            <AppIcon name="home" :size="16" /> 首页
          </router-link>
          <router-link to="/diagnose" class="topnav__link" :class="{ 'is-active': active === 'diagnose' }">
            <AppIcon name="camera" :size="16" /> 智能诊断
          </router-link>
          <router-link to="/knowledge" class="topnav__link" :class="{ 'is-active': active === 'knowledge' }">
            <AppIcon name="book" :size="16" /> 病害图谱
          </router-link>
          <router-link to="/qa" class="topnav__link" :class="{ 'is-active': active === 'qa' }">
            <AppIcon name="chat" :size="16" /> 农技问答
          </router-link>
          <router-link to="/archive" class="topnav__link" :class="{ 'is-active': active === 'archive' }">
            <AppIcon name="archive" :size="16" /> 我的档案
          </router-link>
        </nav>
        <!-- 用户区：消息 + 头像/登录（专家才显示后台入口） -->
        <UserMenu />
      </div>
    </header>

    <!-- 演示提示条：仅本地开发环境显示，参赛部署版本不渲染 -->
    <DemoBanner v-if="isDev" />

    <main class="mobile-shell__main">
      <router-view v-slot="{ Component }">
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <!-- 回到顶部（参考 Element Plus Backtop）：滚动超过一屏出现 -->
    <transition name="fade">
      <button v-show="showBacktop" class="backtop" @click="scrollTop" aria-label="回到顶部">
        <AppIcon name="chevron-up" :size="18" />
      </button>
    </transition>

    <!-- 首次访问漫游引导（参考 Element Plus Tour）：逐步介绍核心功能区 -->
    <Teleport to="body">
      <div v-if="tour" class="tour-mask">
        <div class="tour-card">
          <div class="tour-card__step">第 {{ tourStep + 1 }} 步 / 共 {{ tourSteps.length }} 步</div>
          <h3 class="tour-card__title">{{ tourSteps[tourStep].title }}</h3>
          <p class="tour-card__desc">{{ tourSteps[tourStep].desc }}</p>
          <div class="tour-card__dots">
            <span
              v-for="(s, i) in tourSteps"
              :key="i"
              class="tour-card__dot"
              :class="{ 'is-on': i === tourStep }"
            ></span>
          </div>
          <div class="tour-card__actions">
            <button class="tour-card__skip" @click="finishTour">跳过</button>
            <button v-if="tourStep > 0" class="tour-card__prev" @click="tourStep--">上一步</button>
            <button class="tour-card__next" @click="tourStep < tourSteps.length - 1 ? tourStep++ : finishTour()">
              {{ tourStep < tourSteps.length - 1 ? '下一步' : '开始使用' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <nav class="tabbar">
      <button
        v-for="t in tabs"
        :key="t.name"
        class="tabbar__item"
        :class="{ 'is-active': active === t.name, 'is-center': t.center }"
        @click="go(t.path)"
      >
        <span v-if="t.center" class="tabbar__center">
          <AppIcon :name="t.icon" :size="24" :stroke="2" />
        </span>
        <AppIcon v-else :name="t.icon" :size="21" />
        <span class="tabbar__label">{{ t.label }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.mobile-shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  /* 不再铺不透明底色，让全局「云岭山地」背景装饰（body::before）透出 */
  background: transparent;
}

.mobile-shell__main {
  flex: 1;
  padding-bottom: calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 8px);
  max-width: var(--max-w-mobile);
  width: 100%;
  margin: 0 auto;
  position: relative;
}

/* ===== 宽屏顶部导航（默认隐藏，≥960px 显示） ===== */
.topnav {
  display: none;
}

/* ===== 底部导航 ===== */
.tabbar {
  position: fixed;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 100%;
  max-width: var(--max-w-mobile);
  height: calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px));
  padding-bottom: env(safe-area-inset-bottom, 0px);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  align-items: center;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-top: 1px solid var(--c-line-soft);
  z-index: 100;
}

.tabbar__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--c-text-4);
  transition: color var(--dur-fast) var(--ease-out);
  position: relative;
  padding: 0;
  height: 100%;
  justify-content: center;
}

.tabbar__item.is-active {
  color: var(--c-primary-600);
}

.tabbar__label {
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.2px;
}

.tabbar__item.is-active .tabbar__label {
  font-weight: 700;
}

/* 中间凸起的诊断按钮 */
.tabbar__item.is-center {
  justify-content: flex-start;
  padding-top: 0;
}

.tabbar__center {
  position: absolute;
  top: -18px;
  left: 50%;
  transform: translateX(-50%);
  width: 54px;
  height: 54px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(140deg, var(--c-primary-400), var(--c-primary-700));
  box-shadow: 0 6px 20px rgba(47, 152, 104, 0.42), 0 0 0 5px var(--c-bg-page);
  transition: transform var(--dur-base) var(--ease-spring),
    box-shadow var(--dur-base) var(--ease-out);
}

.tabbar__item.is-center:active .tabbar__center {
  transform: translateX(-50%) scale(0.93);
}

.tabbar__item.is-center .tabbar__label {
  margin-top: 38px;
}

.tabbar__item.is-center.is-active .tabbar__center {
  box-shadow: 0 8px 26px rgba(47, 152, 104, 0.55), 0 0 0 5px var(--c-bg-page);
}
</style>

<style scoped>
/* ===== 网页版响应式：≥960px 顶部导航 + 全宽 ===== */
@media (min-width: 960px) {
  .topnav {
    display: block;
    position: sticky;
    top: 0;
    z-index: 200;
    /* 中性暖白半透明：与山景背景、白色卡片同融，避免薄荷绿突兀 */
    background: linear-gradient(180deg, rgba(253, 254, 253, 0.9), rgba(248, 251, 249, 0.82));
    backdrop-filter: saturate(160%) blur(20px);
    -webkit-backdrop-filter: saturate(160%) blur(20px);
    border-bottom: 1px solid rgba(47, 152, 104, 0.1);
    box-shadow: 0 2px 14px rgba(24, 68, 48, 0.04);
  }

  /* 底部品牌色渐变细线（减淡，仅作点缀） */
  .topnav::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -1px;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(47, 152, 104, 0.22) 18%, rgba(112, 196, 152, 0.34) 50%, rgba(47, 152, 104, 0.22) 82%, transparent);
    pointer-events: none;
  }

  .topnav__inner {
    max-width: 1280px;
    margin: 0 auto;
    height: 66px;
    padding: 0 40px;
    display: flex;
    align-items: center;
    gap: 28px;
  }

  .topnav__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .topnav__logo {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    color: #fff;
    background: linear-gradient(140deg, var(--c-primary-400), var(--c-primary-700));
    box-shadow: 0 4px 12px rgba(47, 152, 104, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.28);
    transition: transform var(--dur-base) var(--ease-spring);
  }

  .topnav__brand:hover .topnav__logo {
    transform: rotate(-8deg) scale(1.06);
  }

  .topnav__brand strong {
    font-size: 18px;
    letter-spacing: 1px;
    background: linear-gradient(120deg, var(--c-primary-800), var(--c-primary-600));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  /* 品牌副标：AI 植保小徽 */
  .topnav__brand-tag {
    margin-left: 2px;
    padding: 2.5px 8px;
    border-radius: var(--r-full);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 1px;
    color: var(--c-primary-700);
    background: var(--c-primary-50);
    border: 1px solid var(--c-primary-100);
    flex-shrink: 0;
  }

  .topnav__links {
    display: flex;
    gap: 6px;
    flex: 1;
  }

  .topnav__link {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 40px;
    padding: 0 17px;
    border-radius: var(--r-full);
    font-size: 14.5px;
    font-weight: 500;
    color: var(--c-text-2);
    transition: all var(--dur-fast) var(--ease-out);
  }

  .topnav__link:hover {
    background: var(--c-primary-50);
    color: var(--c-primary-700);
    transform: translateY(-1px);
  }

  .topnav__link.is-active {
    background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
    color: #fff;
    font-weight: 600;
    box-shadow: 0 4px 14px rgba(47, 152, 104, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.22);
  }

  .topnav__link.is-active:hover {
    transform: none;
  }

  .topnav__cta {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 38px;
    padding: 0 16px;
    border-radius: var(--r-full);
    background: var(--c-bg-muted);
    border: 1px solid var(--c-line);
    font-size: 13px;
    font-weight: 600;
    color: var(--c-text-2);
    flex-shrink: 0;
    transition: all var(--dur-fast);
  }

  .topnav__cta:hover {
    border-color: var(--c-primary-300);
    color: var(--c-primary-700);
  }

  /* 主区放开宽度限制，隐藏底部 tabbar */
  .mobile-shell__main {
    max-width: 1280px;
    padding-bottom: 40px;
  }

  .tabbar {
    display: none;
  }
}

/* ===== Backtop 回到顶部 ===== */
.backtop {
  position: fixed;
  right: 22px;
  bottom: 96px;
  z-index: 180;
  width: 42px;
  height: 42px;
  border-radius: var(--r-full);
  display: grid;
  place-items: center;
  color: var(--c-primary-700);
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--c-primary-100);
  box-shadow: var(--sh-md);
  backdrop-filter: blur(8px);
  transition: transform var(--dur-fast) var(--ease-spring), box-shadow var(--dur-fast);
}
.backtop:hover {
  transform: translateY(-3px);
  box-shadow: var(--sh-lg);
}

/* ===== Tour 漫游引导 ===== */
.tour-mask {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: grid;
  place-items: center;
  background: rgba(14, 30, 23, 0.55);
  backdrop-filter: blur(4px);
  /* 引导不阻塞操作：遮罩不拦截点击，页面照常可用 */
  pointer-events: none;
}

.tour-card {
  width: min(92vw, 420px);
  padding: 26px 26px 20px;
  border-radius: var(--r-xl);
  background: #fff;
  box-shadow: var(--sh-lg);
  text-align: center;
  pointer-events: auto;
}
.tour-card__step {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--c-primary-500);
  letter-spacing: 0.5px;
  margin-bottom: 10px;
}
.tour-card__title {
  font-size: 19px;
  color: var(--c-text-1);
  margin-bottom: 8px;
}
.tour-card__desc {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--c-text-3);
  margin-bottom: 16px;
  min-height: 46px;
}
.tour-card__dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-bottom: 18px;
}
.tour-card__dot {
  width: 7px;
  height: 7px;
  border-radius: var(--r-full);
  background: var(--c-line);
  transition: all var(--dur-fast);
}
.tour-card__dot.is-on {
  width: 20px;
  background: var(--c-primary-500);
}
.tour-card__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tour-card__skip {
  margin-right: auto;
  font-size: 12.5px;
  color: var(--c-text-4);
}
.tour-card__prev {
  padding: 8px 16px;
  border-radius: var(--r-full);
  border: 1px solid var(--c-line);
  font-size: 13px;
  color: var(--c-text-2);
}
.tour-card__next {
  padding: 8px 22px;
  border-radius: var(--r-full);
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(140deg, var(--c-primary-400), var(--c-primary-600));
  box-shadow: 0 4px 14px rgba(47, 152, 104, 0.3);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--dur-base);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
