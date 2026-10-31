<script setup lang="ts">
/**
 * 顶部用户区：消息铃铛（未读角标）+ 头像按钮
 * 点击头像弹出 B 站风格下拉面板：头像/昵称/角色徽章 + 数据统计 + 菜单 + 退出登录
 */
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import AuthSheet from '@/components/AuthSheet.vue'
import MessagesSheet from '@/components/MessagesSheet.vue'
import { useAppStore } from '@/stores/app'
import api from '@/api'

const router = useRouter()
const store = useAppStore()

const authOpen = ref(false)
const msgsOpen = ref(false)
const menuOpen = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})

/** 面板数据 */
const myRecords = ref(0)
const roleText = ref('')
const roleIcon = ref('')
const loadStats = async () => {
  if (!store.user) return
  try {
    // 与诊断提交/档案页共用同一设备标识，避免登录后统计变 0
    const res = await api.records({ userId: store.recordsUserId, limit: 1 })
    myRecords.value = Number(res.total || 0)
  } catch {
    myRecords.value = 0
  }
  roleText.value = store.isExpert ? (store.user as any).title || '农技专家' : '认证农户'
  roleIcon.value = store.isExpert ? '🎓' : '🌾'
}

watch(menuOpen, (v) => {
  if (v) loadStats()
})

const closeMenu = () => (menuOpen.value = false)
const onDocClick = (e: MouseEvent) => {
  if (menuOpen.value && rootEl.value && !rootEl.value.contains(e.target as Node)) closeMenu()
}
onMounted(() => {
  store.restoreUser()
  document.addEventListener('click', onDocClick)
})
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))

const onBell = () => {
  if (!store.user) return (authOpen.value = true)
  msgsOpen.value = true
}

const onUser = () => {
  if (!store.user) return (authOpen.value = true)
  if (!menuOpen.value) {
    // 面板对齐到头像按钮下方右侧（B 站式锚定）
    const btn = rootEl.value?.querySelector('.um__user') as HTMLElement | null
    if (btn) {
      const r = btn.getBoundingClientRect()
      menuStyle.value = {
        top: `${r.bottom + 10}px`,
        left: `${Math.max(10, Math.min(r.right - 280, window.innerWidth - 290))}px`
      }
    }
  }
  menuOpen.value = !menuOpen.value
}

const go = (path: string) => {
  closeMenu()
  router.push(path)
}

const onLogout = async () => {
  closeMenu()
  await store.logout()
  store.showToast('已退出登录', 'success')
  router.push('/')
}
</script>

<template>
  <div ref="rootEl" class="um">
    <!-- 消息铃铛 -->
    <button class="um__btn um__btn--bell" aria-label="消息" @click="onBell">
      <AppIcon name="bell" :size="16" />
      <i v-if="store.unread > 0 && store.user" class="um__badge">{{ store.unread > 9 ? '9+' : store.unread }}</i>
    </button>

    <!-- 专家后台入口 -->
    <button v-if="store.isExpert" class="um__btn um__btn--admin" @click="router.push('/admin')">
      <AppIcon name="dashboard" :size="14" />
      农技站
    </button>

    <!-- 头像 / 登录 -->
    <button class="um__user" :class="{ 'is-open': menuOpen }" @click="onUser">
      <template v-if="store.user">
        <img v-if="store.user.avatar" :src="store.user.avatar" alt="头像" class="um__avatar" />
        <span v-else class="um__avatar um__avatar--text">{{ store.user.nickname[0] }}</span>
        <span class="um__name">{{ store.user.nickname }}</span>
        <i class="um__caret" :class="{ 'is-open': menuOpen }">▾</i>
      </template>
      <template v-else>
        <span class="um__avatar um__avatar--guest"><AppIcon name="user" :size="14" /></span>
        <span class="um__name">登录</span>
      </template>
    </button>

    <!-- B 站风格下拉面板 -->
    <Teleport to="body">
      <Transition name="umdrop">
        <div v-if="menuOpen && store.user" class="u-menu" :style="menuStyle" @click.stop>
          <!-- 头部：大头像 + 昵称 + 角色徽章 -->
          <div class="u-menu__head">
            <img v-if="store.user.avatar" :src="store.user.avatar" alt="头像" class="u-menu__avatar" />
            <span v-else class="u-menu__avatar u-menu__avatar--text">{{ store.user.nickname[0] }}</span>
            <div class="u-menu__id">
              <b class="u-menu__nick">{{ store.user.nickname }}</b>
              <span class="u-menu__role">{{ roleIcon }} {{ roleText }}</span>
            </div>
          </div>

          <!-- 数据统计 -->
          <div class="u-menu__stats">
            <button class="u-stat" @click="go('/archive')">
              <b>{{ myRecords }}</b>
              <span>诊断记录</span>
            </button>
            <i class="u-stat__div" />
            <button class="u-stat" @click="go('/messages-page')">
              <b>{{ store.unread }}</b>
              <span>未读消息</span>
            </button>
            <i class="u-stat__div" />
            <button class="u-stat" @click="go(store.isExpert ? '/admin/review' : '/ask-expert')">
              <b>{{ store.isExpert ? '待复核' : '去提问' }}</b>
              <span>{{ store.isExpert ? '人工复核' : '问专家' }}</span>
            </button>
          </div>

          <!-- 菜单项 -->
          <nav class="u-menu__nav">
            <button class="u-item" @click="go('/profile')">
              <span class="u-item__ico">👤</span>
              <span class="u-item__txt">个人中心</span>
              <i class="u-item__arrow">›</i>
            </button>
            <button class="u-item" @click="go('/atlas')">
              <span class="u-item__ico">📚</span>
              <span class="u-item__txt">病害图谱速查</span>
              <i class="u-item__arrow">›</i>
            </button>
            <button v-if="!store.isExpert" class="u-item" @click="go('/ask-expert')">
              <span class="u-item__ico">🎓</span>
              <span class="u-item__txt">向专家提问</span>
              <i class="u-item__arrow">›</i>
            </button>
            <button v-if="store.isExpert" class="u-item u-item--hl" @click="go('/admin')">
              <span class="u-item__ico">🖥️</span>
              <span class="u-item__txt">农技站后台</span>
              <i class="u-item__arrow">›</i>
            </button>
          </nav>

          <!-- 退出 -->
          <div class="u-menu__foot">
            <button class="u-logout" @click="onLogout">
              <span>⏻</span> 退出登录
            </button>
          </div>

          <!-- 小箭头 -->
          <i class="u-menu__arrow" />
        </div>
      </Transition>
    </Teleport>

    <AuthSheet :open="authOpen" @close="authOpen = false" />
    <MessagesSheet :open="msgsOpen" @close="msgsOpen = false" />
  </div>
</template>

<style scoped>
.um {
  display: flex;
  align-items: center;
  gap: 8px;
}

.um__btn {
  position: relative;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--c-text-2);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  transition: all var(--dur-fast);
}

.um__btn:active {
  transform: scale(0.94);
}

.um__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--r-full);
  background: var(--c-danger);
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  display: grid;
  place-items: center;
  border: 2px solid #fff;
  font-style: normal;
}

.um__btn--admin {
  width: auto;
  border-radius: var(--r-full);
  padding: 0 12px;
  gap: 4px;
  display: flex;
  font-size: 12px;
  font-weight: 700;
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border-color: var(--c-primary-200);
}

.um__user {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 12px 0 4px;
  border-radius: var(--r-full);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  transition: all var(--dur-fast);
}

.um__user.is-open {
  border-color: var(--c-primary-300);
  box-shadow: 0 0 0 3px var(--c-primary-50);
}

.um__caret {
  font-size: 9px;
  color: var(--c-text-3);
  font-style: normal;
  transition: transform var(--dur-fast);
}

.um__caret.is-open {
  transform: rotate(180deg);
}

.um__avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.um__avatar--text {
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
}

.um__avatar--guest {
  display: grid;
  place-items: center;
  color: var(--c-text-4);
  background: var(--c-bg-muted);
}

.um__name {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-text-1);
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 移动端：隐藏名字，只留头像 */
@media (max-width: 560px) {
  .um__name,
  .um__caret {
    display: none;
  }
  .um__user {
    padding-right: 4px;
  }
}
</style>

<!-- 下拉面板（全局样式，Teleport 到 body） -->
<style>
.u-menu {
  position: fixed;
  z-index: 400;
  width: 280px;
  background: #fff;
  border-radius: 16px;
  border: 1px solid var(--c-line-soft);
  box-shadow:
    0 18px 50px rgba(20, 60, 35, 0.16),
    0 4px 12px rgba(20, 60, 35, 0.08);
  animation: umdrop-in 0.18s ease;
  overflow: visible;
}

/* 定位由 JS 动态计算（menuStyle），此处仅兜底 */

@keyframes umdrop-in {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* 头部 */
.u-menu__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 18px 14px;
}

.u-menu__avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--c-primary-100);
  box-shadow: 0 4px 12px rgba(30, 120, 70, 0.18);
}

.u-menu__avatar--text {
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
}

.u-menu__id {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.u-menu__nick {
  font-size: 16px;
  color: var(--c-text-1);
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.u-menu__role {
  align-self: flex-start;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
  padding: 2px 8px;
  border-radius: 999px;
}

/* 数据统计 */
.u-menu__stats {
  display: flex;
  align-items: center;
  margin: 0 14px;
  padding: 10px 0;
  border-top: 1px solid var(--c-line-soft);
  border-bottom: 1px solid var(--c-line-soft);
}

.u-stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.u-stat b {
  font-size: 16px;
  color: var(--c-text-1);
  font-weight: 800;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.u-stat span {
  font-size: 10.5px;
  color: var(--c-text-3);
}

.u-stat__div {
  width: 1px;
  height: 24px;
  background: var(--c-line-soft);
}

/* 菜单 */
.u-menu__nav {
  padding: 6px 8px;
}

.u-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 10px;
  font-size: 13.5px;
  color: var(--c-text-1);
  transition: background 0.15s;
  text-align: left;
}

.u-item:hover {
  background: var(--c-primary-50);
}

.u-item__ico {
  font-size: 15px;
  width: 20px;
  text-align: center;
}

.u-item__txt {
  flex: 1;
  font-weight: 600;
}

.u-item__arrow {
  font-style: normal;
  color: var(--c-text-4);
  font-size: 15px;
}

.u-item__dot {
  font-style: normal;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--c-danger);
  color: #fff;
  font-size: 9.5px;
  font-weight: 800;
  display: grid;
  place-items: center;
}

.u-item--hl {
  color: var(--c-primary-700);
}

.u-item--hl .u-item__txt {
  font-weight: 800;
}

/* 退出 */
.u-menu__foot {
  border-top: 1px solid var(--c-line-soft);
  padding: 8px;
}

.u-logout {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--c-danger);
  transition: background 0.15s;
}

.u-logout:hover {
  background: rgba(200, 50, 45, 0.06);
}

.u-logout span {
  width: 20px;
  text-align: center;
}

/* 小箭头 */
.u-menu__arrow {
  position: absolute;
  top: -6px;
  right: 26px;
  width: 12px;
  height: 12px;
  background: #fff;
  border-left: 1px solid var(--c-line-soft);
  border-top: 1px solid var(--c-line-soft);
  transform: rotate(45deg);
  border-radius: 2px 0 0 0;
}

.umdrop-enter-active,
.umdrop-leave-active {
  transition: opacity 0.18s, transform 0.18s;
}

.umdrop-enter-from,
.umdrop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}
</style>
