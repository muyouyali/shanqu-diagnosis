<script setup lang="ts">
/**
 * 消息中心弹层：专家回复 + 平台公告
 * 未读高亮，点击标记已读
 */
import { ref, watch } from 'vue'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { useAppStore } from '@/stores/app'
import type { Message } from '@/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useAppStore()
const items = ref<Message[]>([])
const unread = ref(0)
const loading = ref(false)
const expanded = ref<number | null>(null)

watch(
  () => props.open,
  async (v) => {
    if (v) await load()
  }
)

const load = async () => {
  loading.value = true
  try {
    const res = await api.messages()
    items.value = res.items
    unread.value = res.unread
    store.unread = res.unread
  } catch (e: any) {
    // 登录态失效由全局统一提示并清理，这里仅在其余错误时提示
    if (localStorage.getItem('ylnz_token')) {
      store.showToast(e?.message || '消息加载失败', 'error')
    }
  } finally {
    loading.value = false
  }
}

const openMsg = async (m: Message) => {
  expanded.value = expanded.value === m.id ? null : m.id
  if (!m.read) {
    m.read = true
    try {
      const r = await api.readMessage(m.id)
      store.unread = r.unread
    } catch {
      /* 静默 */
    }
  }
}

const tone = (m: Message) =>
  m.from === 'system'
    ? { icon: 'volume', color: '#2563eb', bg: '#e8f2ff', label: '公告' }
    : { icon: 'user', color: '#1a7f45', bg: '#e8f7ee', label: '专家' }

const fmt = (iso: string) => {
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay) return `今天 ${hm}`
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="msg-mask" @click.self="emit('close')">
        <div class="msg">
          <header class="msg__head">
            <div>
              <h2>消息中心</h2>
              <p v-if="unread > 0">{{ unread }} 条未读</p>
              <p v-else>全部消息已读</p>
            </div>
            <button class="msg__close" @click="emit('close')"><AppIcon name="x" :size="15" /></button>
          </header>

          <div class="msg__body">
            <div v-if="loading" class="msg__empty">正在加载…</div>

            <div v-else-if="!items.length" class="msg__empty">
              <AppIcon name="bell" :size="26" />
              <p>暂无消息<br />专家回复与平台公告会显示在这里</p>
            </div>

            <template v-else>
              <button
                v-for="m in items"
                :key="m.id"
                class="msg-item"
                :class="{ 'is-unread': !m.read, 'is-open': expanded === m.id }"
                @click="openMsg(m)"
              >
                <span class="msg-item__avatar" :style="{ background: tone(m).bg, color: tone(m).color }">
                  <AppIcon :name="tone(m).icon" :size="16" />
                  <i v-if="!m.read" class="msg-item__dot" />
                </span>
                <span class="msg-item__body">
                  <span class="msg-item__top">
                    <strong>{{ m.title }}</strong>
                    <small>{{ fmt(m.createdAt) }}</small>
                  </span>
                  <span class="msg-item__from">{{ m.fromName }} · {{ tone(m).label }}</span>
                  <span class="msg-item__preview" v-if="expanded !== m.id">{{ m.content.slice(0, 44) }}…</span>
                  <span class="msg-item__content" v-else>{{ m.content }}</span>
                </span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.msg-mask {
  position: fixed;
  inset: 0;
  z-index: 135;
  background: rgba(14, 30, 22, 0.44);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.msg {
  width: min(520px, 100%);
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-page);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  overflow: hidden;
}

.msg__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 18px 13px;
  background: var(--c-bg-card);
  border-bottom: 1px solid var(--c-line-soft);
}

.msg__head h2 {
  font-size: 17px;
  font-weight: 800;
  color: var(--c-text-1);
}

.msg__head p {
  font-size: 11px;
  color: var(--c-accent-600);
  margin-top: 2px;
}

.msg__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
}

.msg__body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px calc(16px + env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.msg__empty {
  padding: 48px 20px;
  text-align: center;
  color: var(--c-text-4);
  font-size: 12.5px;
  line-height: 1.8;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.msg-item {
  display: flex;
  gap: 11px;
  padding: 13px 14px;
  border-radius: 14px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  text-align: left;
  transition: all var(--dur-fast);
}

.msg-item.is-unread {
  border-color: var(--c-primary-200);
  background: linear-gradient(150deg, var(--c-primary-50), #fff 55%);
}

.msg-item.is-open {
  box-shadow: var(--sh-sm);
}

.msg-item__avatar {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.msg-item__dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--c-danger);
  border: 2px solid #fff;
}

.msg-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.msg-item__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.msg-item__top strong {
  font-size: 13px;
  font-weight: 800;
  color: var(--c-text-1);
  line-height: 1.35;
}

.msg-item__top small {
  font-size: 10px;
  color: var(--c-text-4);
  flex-shrink: 0;
}

.msg-item__from {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.msg-item__preview {
  font-size: 12px;
  color: var(--c-text-3);
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg-item__content {
  font-size: 12.5px;
  color: var(--c-text-2);
  line-height: 1.75;
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.24s var(--ease-out);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-active .msg,
.sheet-leave-active .msg {
  transition: transform 0.3s var(--ease-out);
}
.sheet-enter-from .msg,
.sheet-leave-to .msg {
  transform: translateY(100%);
}

@media (min-width: 960px) {
  .msg-mask {
    align-items: center;
  }
  .msg {
    border-radius: var(--r-xl);
  }
}
</style>
