<script setup lang="ts">
/**
 * 消息详情弹层：点「查看详情」打开的独立界面
 * - 农户：完整阅读消息（专家回复 / 系统公告 / 预警）
 * - 专家：收到农户提问时可在底部直接回复
 */
import { ref, computed, watch } from 'vue'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { useAppStore } from '@/stores/app'
import type { Message } from '@/types'

const props = defineProps<{ open: boolean; message: Message | null }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useAppStore()
const reply = ref('')
const sending = ref(false)
const replied = ref(false)

watch(
  () => [props.open, props.message?.id],
  ([o]) => {
    if (o) {
      reply.value = ''
      replied.value = false
    }
  }
)

const canReply = computed(
  () => store.isExpert && props.message?.from === 'user' && !!props.message?.fromId
)

const tone = computed(() => {
  const m = props.message
  if (!m) return { icon: 'bell', color: '#2563eb', bg: '#e8f2ff', label: '公告' }
  if (m.from === 'system') return { icon: 'volume', color: '#2563eb', bg: '#e8f2ff', label: '公告' }
  if (m.from === 'user') return { icon: 'user', color: '#b45309', bg: '#fdf3e0', label: '农户提问' }
  return { icon: 'user', color: '#1a7f45', bg: '#e8f7ee', label: '专家' }
})

const fmt = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const sendReply = async () => {
  const m = props.message
  if (!m || !reply.value.trim() || sending.value) return
  sending.value = true
  try {
    await api.sendMessage({
      userId: m.fromId,
      title: `回复：${m.title}`.slice(0, 60),
      content: reply.value.trim()
    })
    replied.value = true
    reply.value = ''
    store.showToast('回复已发送，农户将在消息中心收到', 'success')
  } catch (e: any) {
    store.showToast(e?.message || '发送失败', 'error')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="md-sheet">
      <div v-if="open && message" class="md-mask" @click.self="emit('close')">
        <div class="md">
          <header class="md__head">
            <button class="md__back" @click="emit('close')"><AppIcon name="arrow-left" :size="17" /></button>
            <h2>消息详情</h2>
            <button class="md__close" @click="emit('close')"><AppIcon name="x" :size="15" /></button>
          </header>

          <div class="md__body">
            <!-- 类型条 -->
            <div class="md__meta">
              <span class="md__avatar" :style="{ background: tone.bg, color: tone.color }">
                <AppIcon :name="tone.icon" :size="18" />
              </span>
              <div class="md__meta-main">
                <strong class="md__title">{{ message.title }}</strong>
                <span class="md__sub">{{ message.fromName }} · {{ tone.label }} · {{ fmt(message.createdAt) }}</span>
              </div>
              <span class="md__state" :class="message.read ? 'is-read' : 'is-unread'">
                {{ message.read ? '已读' : '未读' }}
              </span>
            </div>

            <!-- 正文 -->
            <div class="md__content">{{ message.content }}</div>

            <p v-if="message.from === 'system'" class="md__note">
              <AppIcon name="info" :size="13" />
              此条为平台公告，面向全体用户发布
            </p>

            <!-- 专家回复区 -->
            <div v-if="canReply" class="md__reply">
              <div class="md__reply-head">
                <AppIcon name="chat" :size="14" />
                回复该农户
              </div>
              <template v-if="!replied">
                <textarea
                  v-model="reply"
                  class="md__reply-input"
                  rows="4"
                  placeholder="填写防治建议、注意事项等，发送后农户将在其消息中心收到…"
                />
                <button class="md__reply-btn" :disabled="!reply.trim() || sending" @click="sendReply">
                  <AppIcon name="arrow-right" :size="14" />
                  {{ sending ? '发送中…' : '发送回复' }}
                </button>
              </template>
              <p v-else class="md__reply-done">
                <AppIcon name="check-circle" :size="15" />
                已回复该农户，可关闭详情继续处理其他消息
              </p>
            </div>
            <p v-else-if="store.isExpert && message.from === 'expert'" class="md__note">
              <AppIcon name="info" :size="13" />
              这是你发出给农户的回复，无需再次操作
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.md-mask {
  position: fixed;
  inset: 0;
  z-index: 140;
  background: rgba(14, 30, 22, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.md {
  width: min(560px, 100%);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-page);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  overflow: hidden;
}

.md__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 16px;
  background: var(--c-bg-card);
  border-bottom: 1px solid var(--c-line-soft);
}

.md__back,
.md__close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
  flex-shrink: 0;
}

.md__head h2 {
  font-size: 16px;
  font-weight: 800;
  color: var(--c-text-1);
  flex: 1;
}

.md__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.md__meta {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
}

.md__avatar {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.md__meta-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.md__title {
  font-size: 14.5px;
  font-weight: 800;
  color: var(--c-text-1);
  line-height: 1.4;
}

.md__sub {
  font-size: 11px;
  color: var(--c-text-4);
}

.md__state {
  font-size: 9px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--r-full);
  flex-shrink: 0;
  letter-spacing: 0.5px;
}

.md__state.is-unread {
  background: var(--c-danger);
  color: #fff;
}

.md__state.is-read {
  background: var(--c-bg-muted);
  color: var(--c-text-4);
}

.md__content {
  margin-top: 12px;
  padding: 16px;
  border-radius: 14px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  font-size: 13.5px;
  line-height: 1.85;
  color: var(--c-text-1);
  white-space: pre-wrap;
  word-break: break-word;
}

.md__note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 11px;
  color: var(--c-text-4);
}

/* 专家回复区 */
.md__reply {
  margin-top: 14px;
  padding: 14px;
  border-radius: 14px;
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
}

.md__reply-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 800;
  color: var(--c-primary-700);
  margin-bottom: 10px;
}

.md__reply-input {
  width: 100%;
  padding: 11px 12px;
  border-radius: 11px;
  border: 1px solid var(--c-primary-200);
  background: #fff;
  font-size: 13px;
  line-height: 1.7;
  color: var(--c-text-1);
  resize: vertical;
  font-family: inherit;
}

.md__reply-input:focus {
  outline: none;
  border-color: var(--c-primary-500);
}

.md__reply-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  height: 34px;
  padding: 0 18px;
  border-radius: var(--r-full);
  font-size: 12.5px;
  font-weight: 700;
  color: #fff;
  background: var(--c-primary-600);
  border: none;
  transition: all var(--dur-fast);
}

.md__reply-btn:hover {
  transform: translateY(-1px);
}

.md__reply-btn:disabled {
  opacity: 0.5;
}

.md__reply-done {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-primary-700);
}

/* 过渡 */
.md-sheet-enter-active,
.md-sheet-leave-active {
  transition: opacity 0.24s var(--ease-out);
}
.md-sheet-enter-from,
.md-sheet-leave-to {
  opacity: 0;
}
.md-sheet-enter-active .md,
.md-sheet-leave-active .md {
  transition: transform 0.3s var(--ease-out);
}
.md-sheet-enter-from .md,
.md-sheet-leave-to .md {
  transform: translateY(100%);
}

@media (min-width: 960px) {
  .md-mask {
    align-items: center;
  }
  .md {
    border-radius: var(--r-xl);
  }
}
</style>
