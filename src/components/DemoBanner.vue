<script setup lang="ts">
/**
 * 演示提示条：登录后常驻显示在导航栏下方，可关闭（本次会话记住）
 * 说明本项目为竞赛演示作品，部分 AI 推理数据为模拟数据
 */
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'

const store = useAppStore()
const CLOSE_KEY = 'ylnz_demo_banner_closed'
const closed = ref(false)

onMounted(() => {
  closed.value = sessionStorage.getItem(CLOSE_KEY) === '1'
})

const visible = computed(() => !!store.user && !closed.value)

const close = () => {
  closed.value = true
  sessionStorage.setItem(CLOSE_KEY, '1')
}
</script>

<template>
  <transition name="demo-bar">
    <div v-if="visible" class="demo-bar" role="note">
      <span class="demo-bar__icon">⚠️</span>
      <p class="demo-bar__text">
        当前为<b>演示账号</b>，部分 AI 推理数据为模拟演示，用于作品展示
      </p>
      <button class="demo-bar__close" type="button" aria-label="关闭提示" title="关闭提示" @click="close">
        <AppIcon name="x" :size="14" />
      </button>
    </div>
  </transition>
</template>

<style scoped>
.demo-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px max(14px, calc((100vw - 1180px) / 2 + 20px)) 9px;
  background: #fdf6e3;
  border-bottom: 1px solid #f2e2bd;
  color: #8a6420;
}

.demo-bar__icon {
  font-size: 13px;
  line-height: 1;
  flex: 0 0 auto;
}

.demo-bar__text {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  letter-spacing: 0.1px;
}

.demo-bar__text b {
  font-weight: 700;
  color: #7a5518;
}

.demo-bar__close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: -4px -4px -4px 0;
  border-radius: 8px;
  color: #a98442;
  background: transparent;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}

.demo-bar__close:hover {
  background: rgba(160, 120, 40, 0.12);
  color: #7a5518;
}

.demo-bar-enter-active,
.demo-bar-leave-active {
  transition: opacity 220ms var(--ease-out), transform 220ms var(--ease-out);
}
.demo-bar-enter-from,
.demo-bar-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 720px) {
  .demo-bar {
    padding: 8px 12px;
  }
  .demo-bar__text {
    font-size: 12.5px;
  }
}
</style>
