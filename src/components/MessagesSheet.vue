<script setup lang="ts">
/**
 * 消息中心弹层：专家回复 + 平台公告
 * 未读高亮，点击标记已读
 */
import { ref, computed, watch } from 'vue'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import MessageDetailSheet from '@/components/MessageDetailSheet.vue'
import { useAppStore } from '@/stores/app'
import type { Message } from '@/types'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useAppStore()
const items = ref<Message[]>([])
const unread = ref(0)
const loading = ref(false)

/** 未读排最前，其余按时间倒序 */
const sorted = computed(() =>
  [...items.value].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
)

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

const readAll = async () => {
  try {
    await api.readAllMessages()
    items.value.forEach((m) => (m.read = true))
    store.unread = 0
    unread.value = 0
    store.showToast('已全部标记为已读', 'success')
  } catch (e: any) {
    store.showToast(e?.message || '操作失败', 'error')
  }
}

/* ---------- 选择清理模式 ---------- */
const selecting = ref(false)
const checked = ref<Set<number>>(new Set())
const confirmClearAll = ref(false)
let clearTimer: ReturnType<typeof setTimeout> | null = null

const enterSelect = () => {
  selecting.value = true
  checked.value = new Set()
  confirmClearAll.value = false
}
const exitSelect = () => {
  selecting.value = false
  checked.value = new Set()
  confirmClearAll.value = false
}
const toggleCheck = (id: number) => {
  const s = new Set(checked.value)
  s.has(id) ? s.delete(id) : s.add(id)
  checked.value = s
}
const allChecked = computed(
  () => items.value.length > 0 && checked.value.size === items.value.length
)
const toggleAll = () => {
  checked.value = allChecked.value ? new Set() : new Set(items.value.map((m) => m.id))
}

const removeChecked = async () => {
  const ids = [...checked.value]
  if (!ids.length) return
  try {
    const r = await api.clearMessages(ids)
    items.value = items.value.filter((m) => !checked.value.has(m.id))
    unread.value = r.unread
    store.unread = r.unread
    store.showToast(`已清理 ${r.removed} 条消息`, 'success')
    if (!items.value.length) exitSelect()
    else checked.value = new Set()
  } catch (e: any) {
    store.showToast(e?.message || '清理失败', 'error')
  }
}

const clearEverything = async () => {
  if (!confirmClearAll.value) {
    confirmClearAll.value = true
    if (clearTimer) clearTimeout(clearTimer)
    clearTimer = setTimeout(() => (confirmClearAll.value = false), 3000)
    return
  }
  try {
    const r = await api.clearMessages()
    items.value = []
    unread.value = r.unread
    store.unread = r.unread
    exitSelect()
    store.showToast(`已清理 ${r.removed} 条消息`, 'success')
  } catch (e: any) {
    store.showToast(e?.message || '清理失败', 'error')
  }
}

const openMsg = async (m: Message) => {
  if (selecting.value) return toggleCheck(m.id)
  detail.value = m
  if (!m.read) {
    m.read = true
    try {
      const r = await api.readMessage(m.id)
      store.unread = r.unread
      unread.value = r.unread
    } catch {
      /* 静默 */
    }
  }
}

/** 详情弹层 */
const detail = ref<Message | null>(null)

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
              <p v-if="unread > 0" class="msg__unread-tip">
                <i class="msg__unread-dot" />{{ unread }} 条未读消息，点击查看详情
              </p>
              <p v-else class="msg__read-tip">全部消息已读</p>
            </div>
            <div class="msg__ops">
              <template v-if="items.length && !selecting">
                <button v-if="unread > 0" class="msg__op" @click="readAll">
                  <AppIcon name="check-circle" :size="12" /> 全部已读
                </button>
                <button class="msg__op msg__op--danger" @click="enterSelect">
                  <AppIcon name="trash" :size="12" /> 清理消息
                </button>
              </template>
              <template v-else-if="items.length && selecting">
                <button class="msg__op" @click="toggleAll">
                  <AppIcon :name="allChecked ? 'check-circle' : 'circle'" :size="12" />
                  {{ allChecked ? '取消全选' : '全选' }}
                </button>
                <button class="msg__op msg__op--danger" :disabled="!checked.size" @click="removeChecked">
                  <AppIcon name="trash" :size="12" /> 删除所选{{ checked.size ? `(${checked.size})` : '' }}
                </button>
                <button
                  class="msg__op msg__op--danger"
                  :class="{ 'is-confirming': confirmClearAll }"
                  @click="clearEverything"
                >
                  {{ confirmClearAll ? '再点确认清空' : '全部清空' }}
                </button>
                <button class="msg__op" @click="exitSelect">取消</button>
              </template>
              <button class="msg__close" @click="emit('close')"><AppIcon name="x" :size="15" /></button>
            </div>
          </header>

          <div class="msg__body">
            <div v-if="loading" class="msg__empty">正在加载…</div>

            <div v-else-if="!items.length" class="msg__empty">
              <AppIcon name="bell" :size="26" />
              <p>暂无消息<br />专家回复与平台公告会显示在这里</p>
            </div>

            <template v-else>
              <button
                v-for="m in sorted"
                :key="m.id"
                class="msg-item"
                :class="{
                  'is-unread': !m.read,
                  
                  'is-selected': selecting && checked.has(m.id)
                }"
                @click="openMsg(m)"
              >
                <span
                  v-if="selecting"
                  class="msg-item__check"
                  :class="{ 'is-on': checked.has(m.id) }"
                  @click.stop="toggleCheck(m.id)"
                >
                  <AppIcon v-if="checked.has(m.id)" name="check" :size="11" />
                </span>
                <span class="msg-item__avatar" :style="{ background: tone(m).bg, color: tone(m).color }">
                  <AppIcon :name="tone(m).icon" :size="16" />
                  <i v-if="!m.read" class="msg-item__dot" />
                </span>
                <span class="msg-item__body">
                  <span class="msg-item__top">
                    <i v-if="!m.read" class="msg-item__reddot" />
                    <strong class="msg-item__title">{{ m.title }}</strong>
                    <span class="msg-item__right">
                      <span class="msg-item__state" :class="m.read ? 'is-read' : 'is-unread-tag'">
                        {{ m.read ? '已读' : '未读' }}
                      </span>
                      <small class="msg-item__time">{{ fmt(m.createdAt) }}</small>
                    </span>
                  </span>
                  <span class="msg-item__from">{{ m.fromName }} · {{ tone(m).label }}</span>
                  <span class="msg-item__preview">{{ m.content }}</span>
                  <span class="msg-item__detail-btn">
                    查看详情
                    <AppIcon name="arrow-right" :size="11" />
                  </span>
                </span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 消息详情弹层（专家可在此直接回复农户提问） -->
    <MessageDetailSheet :open="!!detail" :message="detail" @close="detail = null" />
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
  font-size: 12.5px;
  color: var(--c-accent-600);
  margin-top: 2px;
}

.msg__unread-tip {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--c-danger);
}

.msg__unread-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--c-danger);
  animation: pulse 1.6s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.msg__read-tip {
  color: var(--c-text-4);
}

.msg__ops {
  display: flex;
  align-items: center;
  gap: 6px;
}

.msg__op {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--r-full);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
  white-space: nowrap;
  transition: all var(--dur-fast);
}

.msg__op:active {
  transform: scale(0.95);
}

.msg__op--danger {
  color: var(--c-danger);
  background: #fdeceb;
  border-color: #f8c9c6;
}

.msg__op--danger.is-confirming {
  background: var(--c-danger);
  color: #fff;
  border-color: var(--c-danger);
}

.msg__op:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 选择模式勾选框 */
.msg-item__check {
  align-self: center;
  width: 19px;
  height: 19px;
  border-radius: 50%;
  border: 1.5px solid var(--c-line);
  background: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #fff;
  transition: all var(--dur-fast);
}

.msg-item__check.is-on {
  background: var(--c-danger);
  border-color: var(--c-danger);
}

.msg-item.is-selected {
  border-color: #f3b3b0;
  background: #fff7f6;
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
  align-items: center;
  gap: 7px;
}

.msg-item__reddot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--c-danger);
  flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(224, 82, 82, 0.14);
}

.msg-item__title {
  font-size: 13px;
  font-weight: 800;
  color: var(--c-text-1);
  line-height: 1.35;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.msg-item__right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.msg-item__time {
  font-size: 11.5px;
  color: var(--c-text-4);
  min-width: 52px;
  text-align: right;
}

.msg-item__from {
  font-size: 11.5px;
  color: var(--c-text-4);
}

.msg-item__state {
  font-size: 11.5px;
  font-weight: 800;
  padding: 1.5px 7px;
  border-radius: var(--r-full);
  flex-shrink: 0;
  letter-spacing: 0.5px;
}

.msg-item__state.is-unread-tag {
  background: var(--c-danger);
  color: #fff;
}

.msg-item__state.is-read {
  background: var(--c-bg-muted);
  color: var(--c-text-4);
}

.msg-item__detail-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 5px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-primary-600);
}

.msg-item__preview {
  font-size: 12.5px;
  color: var(--c-text-3);
  line-height: 1.65;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
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
