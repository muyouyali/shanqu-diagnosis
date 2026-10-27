<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'

const route = useRoute()
const router = useRouter()

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
          <span class="topnav__logo"><AppIcon name="leaf" :size="17" :stroke="2.2" /></span>
          <strong>云岭农诊</strong>
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
        <router-link to="/admin" class="topnav__cta">
          <AppIcon name="chart" :size="15" /> 农技站后台
        </router-link>
      </div>
    </header>

    <main class="mobile-shell__main">
      <router-view v-slot="{ Component }">
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

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
  background: var(--c-bg-page);
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
  font-size: 10.5px;
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
    background: rgba(255, 255, 255, 0.88);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-bottom: 1px solid var(--c-line-soft);
  }

  .topnav__inner {
    max-width: 1200px;
    margin: 0 auto;
    height: 62px;
    padding: 0 32px;
    display: flex;
    align-items: center;
    gap: 28px;
  }

  .topnav__brand {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-shrink: 0;
  }

  .topnav__logo {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    color: #fff;
    background: linear-gradient(140deg, var(--c-primary-400), var(--c-primary-700));
  }

  .topnav__brand strong {
    font-size: 17px;
    letter-spacing: 1px;
    color: var(--c-primary-800);
  }

  .topnav__links {
    display: flex;
    gap: 4px;
    flex: 1;
  }

  .topnav__link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 38px;
    padding: 0 15px;
    border-radius: var(--r-full);
    font-size: 14px;
    font-weight: 500;
    color: var(--c-text-3);
    transition: all var(--dur-fast) var(--ease-out);
  }

  .topnav__link:hover {
    background: var(--c-primary-50);
    color: var(--c-primary-700);
  }

  .topnav__link.is-active {
    background: var(--c-primary-600);
    color: #fff;
    font-weight: 600;
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
    max-width: 1200px;
    padding-bottom: 40px;
  }

  .tabbar {
    display: none;
  }
}
</style>
