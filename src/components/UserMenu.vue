<script setup lang="ts">
/**
 * 顶部用户区：消息铃铛（未读角标）+ 头像/登录按钮
 * 未登录 → 登录/注册弹层；已登录 → 个人中心；专家额外显示后台入口
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import AuthSheet from '@/components/AuthSheet.vue'
import MessagesSheet from '@/components/MessagesSheet.vue'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const store = useAppStore()

const authOpen = ref(false)
const msgsOpen = ref(false)

onMounted(() => store.restoreUser())

const onBell = () => {
  if (!store.user) return (authOpen.value = true)
  msgsOpen.value = true
}

const onUser = () => {
  if (!store.user) return (authOpen.value = true)
  router.push('/profile')
}

const onAdmin = () => {
  if (!store.user) return (authOpen.value = true)
  if (store.isExpert) router.push('/admin')
  else store.showToast('农技站后台仅限专家账号进入', 'info')
}
</script>

<template>
  <div class="um">
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
    <button class="um__user" @click="onUser">
      <template v-if="store.user">
        <img v-if="store.user.avatar" :src="store.user.avatar" alt="头像" class="um__avatar" />
        <span v-else class="um__avatar um__avatar--text">{{ store.user.nickname[0] }}</span>
        <span class="um__name">{{ store.user.nickname }}</span>
      </template>
      <template v-else>
        <span class="um__avatar um__avatar--guest"><AppIcon name="user" :size="14" /></span>
        <span class="um__name">登录</span>
      </template>
    </button>

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

.um__user:active {
  transform: scale(0.97);
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
  .um__name {
    display: none;
  }
  .um__user {
    padding-right: 4px;
  }
}
</style>
