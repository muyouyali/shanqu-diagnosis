<script setup lang="ts">
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'

const store = useAppStore()
</script>

<template>
  <router-view />

  <!-- 全局轻提示 -->
  <transition name="toast">
    <div v-if="store.toast.show" class="toast" :class="`toast--${store.toast.type}`">
      <AppIcon
        :name="store.toast.type === 'success' ? 'check-circle' : store.toast.type === 'error' ? 'alert' : 'info'"
        :size="17"
      />
      <span>{{ store.toast.text }}</span>
    </div>
  </transition>
</template>

<style scoped>
.toast {
  position: fixed;
  top: max(18px, env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: min(88vw, 420px);
  padding: 11px 18px;
  border-radius: var(--r-full);
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.4;
  color: #fff;
  background: rgba(22, 32, 27, 0.92);
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
}

.toast--success {
  background: linear-gradient(135deg, var(--c-primary-600), var(--c-primary-700));
}
.toast--error {
  background: linear-gradient(135deg, #e05252, #c23b3b);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 280ms var(--ease-spring);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -14px) scale(0.94);
}
</style>
