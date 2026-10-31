<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import { provinceOfRegion } from '@/data/regions'

const route = useRoute()
const store = useAppStore()
const collapsed = ref(false)

const menu = [
  { name: 'admin-dashboard', path: '/admin', label: '数据看板', icon: 'chart' },
  { name: 'admin-records', path: '/admin/records', label: '诊断记录', icon: 'list' },
  { name: 'admin-crop', path: '/admin/crops', label: '作物审核', icon: 'leaf' },
  { name: 'admin-alert', path: '/admin/alert', label: '区域预警', icon: 'alert' },
  { name: 'admin-review', path: '/admin/review', label: '人工复核', icon: 'settings' },
    { name: 'admin-notify', path: '/admin/notify', label: '消息通知', icon: 'bell' },
  { name: 'admin-system', path: '/admin/system', label: '系统状态', icon: 'cpu' }
]

const activeName = computed(() => route.name as string)
const pageTitle = computed(() => (route.meta.title as string) || '管理后台')

onMounted(() => {
  const mq = window.matchMedia('(max-width: 1100px)')
  collapsed.value = mq.matches
})
</script>

<template>
  <div class="admin" :class="{ 'is-collapsed': collapsed }">
    <aside class="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__logo">
          <AppIcon name="leaf" :size="20" :stroke="2.2" />
        </div>
        <div v-if="!collapsed" class="sidebar__brand-text">
          <strong>云岭农诊</strong>
          <span>农技站管理后台</span>
        </div>
      </div>

      <nav class="sidebar__nav">
        <router-link
          v-for="m in menu"
          :key="m.name"
          :to="m.path"
          class="sidebar__item"
          :class="{ 'is-active': activeName === m.name }"
        >
          <AppIcon :name="m.icon" :size="19" />
          <span v-if="!collapsed">{{ m.label }}</span>
        </router-link>
      </nav>

      <div class="sidebar__foot">
        <router-link to="/" class="sidebar__back">
          <AppIcon name="home" :size="16" />
          <span v-if="!collapsed">返回农户首页</span>
        </router-link>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="topbar__left">
          <h1 class="topbar__title">{{ pageTitle }}</h1>
          <span class="topbar__sub">{{ provinceOfRegion(store.region) }} · {{ store.region }}</span>
        </div>
        <div class="topbar__right">
          <span class="topbar__badge">
            <AppIcon name="map-pin" :size="13" />
            {{ store.region }}
          </span>
          <button class="topbar__collapse" @click="collapsed = !collapsed" :title="collapsed ? '展开菜单' : '收起菜单'">
            <AppIcon name="list" :size="18" />
          </button>
        </div>
      </header>

      <section class="content">
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </section>
    </div>
  </div>
</template>

<style scoped>
.admin {
  display: flex;
  min-height: 100dvh;
  /* 与农户端一致的「云岭山地」氛围背景 */
  background:
    radial-gradient(120% 420px at 50% -60px, rgba(47, 152, 104, 0.10), transparent 70%),
    radial-gradient(60% 380px at 100% 120px, rgba(112, 196, 152, 0.07), transparent 70%),
    linear-gradient(180deg, #eef6f1 0%, #f3f8f5 320px, #f4f7f5 100%);
  background-attachment: fixed;
}

/* ===== 侧边栏 ===== */
.sidebar {
  width: 232px;
  flex-shrink: 0;
  background: linear-gradient(180deg, #14352a 0%, #0f2a22 100%);
  display: flex;
  flex-direction: column;
  padding: 20px 14px;
  position: sticky;
  top: 0;
  height: 100dvh;
  transition: width var(--dur-base) var(--ease-out);
}

.is-collapsed .sidebar {
  width: 72px;
}

.sidebar__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 6px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar__logo {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: linear-gradient(140deg, var(--c-primary-400), var(--c-primary-600));
  color: #fff;
  flex-shrink: 0;
}

.sidebar__brand-text {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  white-space: nowrap;
}

.sidebar__brand-text strong {
  font-size: 15px;
  color: #fff;
  letter-spacing: 0.5px;
}

.sidebar__brand-text span {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
}

.sidebar__nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 18px;
}

.sidebar__item {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 42px;
  padding: 0 12px;
  border-radius: var(--r-sm);
  color: rgba(255, 255, 255, 0.62);
  font-size: 14px;
  font-weight: 500;
  transition: all var(--dur-fast) var(--ease-out);
  white-space: nowrap;
  overflow: hidden;
}

.sidebar__item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
}

.sidebar__item.is-active {
  background: linear-gradient(90deg, rgba(47, 152, 104, 0.28), rgba(47, 152, 104, 0.06));
  color: #fff;
  font-weight: 600;
  box-shadow: inset 3px 0 0 var(--c-primary-400);
}

.sidebar__foot {
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar__back {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  transition: all var(--dur-fast);
  white-space: nowrap;
}

.sidebar__back:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
}

/* ===== 主区 ===== */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.topbar {
  height: 68px;
  padding: 0 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, rgba(240, 249, 244, 0.88), rgba(255, 255, 255, 0.78));
  backdrop-filter: saturate(170%) blur(18px);
  -webkit-backdrop-filter: saturate(170%) blur(18px);
  border-bottom: 1px solid rgba(47, 152, 104, 0.12);
  box-shadow: 0 2px 14px rgba(24, 68, 48, 0.04);
  position: sticky;
  top: 0;
  z-index: 20;
}

/* 顶栏底部品牌色渐变细线（与农户端导航一致） */
.topbar::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(47, 152, 104, 0.3) 18%, rgba(112, 196, 152, 0.45) 50%, rgba(47, 152, 104, 0.3) 82%, transparent);
  pointer-events: none;
}

.topbar__left {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.topbar__title {
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.2px;
}

.topbar__sub {
  font-size: 12.5px;
  color: var(--c-text-4);
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: var(--r-full);
  background: var(--c-primary-50);
  color: var(--c-primary-700);
  font-size: 12px;
  font-weight: 600;
}

.topbar__collapse {
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  display: grid;
  place-items: center;
  color: var(--c-text-3);
  transition: background var(--dur-fast);
}

.topbar__collapse:hover {
  background: var(--c-line-soft);
}

.content {
  flex: 1;
  padding: 24px 28px 40px;
  min-width: 0;
}

@media (max-width: 760px) {
  .sidebar {
    width: 64px;
    padding: 16px 8px;
  }
  .topbar {
    padding: 0 16px;
  }
  .content {
    padding: 16px 14px 32px;
  }
  .topbar__sub {
    display: none;
  }
}
</style>
