<script setup lang="ts">
/**
 * OAuth 回调中转页
 * - 微信扫码回调后服务端 302 到本页并携带 token
 * - 顶层打开：直接写入登录态并回首页
 * - 嵌在登录页 iframe 内：postMessage 通知父页面写入登录态
 */
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import api from '@/api'

const router = useRouter()
const route = useRoute()
const store = useAppStore()

onMounted(() => {
  const token = (route.query.token as string) || ''
  const error = (route.query.oauth_error as string) || ''

  if (window.parent && window.parent !== window) {
    // iframe 内：通知登录页
    window.parent.postMessage({ type: 'ylnz-oauth', token, error }, window.location.origin)
    return
  }
  if (token) {
    finish(token)
  } else {
    router.replace({ path: '/login', query: error ? { oauth_error: error } : {} })
  }
})

const finish = async (token: string) => {
  try {
    const user = await api.meWithToken(token)
    store.setAuth(token, user)
    store.showToast('微信登录成功', 'success')
  } catch {
    store.showToast('登录态获取失败，请重试', 'error')
  }
  router.replace('/')
}

</script>

<template>
  <div class="ocb">
    <span class="ocb__spin">⏳</span>
    <p>微信授权处理中，请稍候…</p>
  </div>
</template>

<style scoped>
.ocb {
  position: fixed;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  background: var(--c-bg-page, #f4f7f4);
  color: var(--c-text-3, #5a6d5f);
  font-size: 14px;
}

.ocb__spin {
  font-size: 30px;
  animation: ocb-spin 1.2s linear infinite;
}

@keyframes ocb-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
