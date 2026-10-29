<script setup lang="ts">
/** 消息页：复用 MessagesSheet 的列表逻辑，以整页形式呈现 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { useAppStore } from '@/stores/app'
import type { Message } from '@/types'

const router = useRouter()
const store = useAppStore()
const items = ref<Message[]>([])
const loading = ref(true)
const expanded = ref<number | null>(null)

onMounted(async () => {
  await store.restoreUser()
  if (!store.user) return router.replace('/')
  try {
    items.value = (await api.messages()).items
  } catch (e: any) {
    store.showToast(e?.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
})

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
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="mp">
    <header class="mp__head">
      <button class="mp__back" @click="router.back()"><AppIcon name="arrow-left" :size="17" /></button>
      <h1>我的消息</h1>
    </header>

    <div v-if="loading" class="mp__empty">正在加载…</div>
    <div v-else-if="!items.length" class="mp__empty">
      <AppIcon name="bell" :size="28" />
      <p>暂无消息<br />专家回复与平台公告会显示在这里</p>
    </div>

    <template v-else>
      <button
        v-for="m in items"
        :key="m.id"
        class="mp-item"
        :class="{ 'is-unread': !m.read, 'is-open': expanded === m.id }"
        @click="openMsg(m)"
      >
        <span class="mp-item__avatar" :style="{ background: tone(m).bg, color: tone(m).color }">
          <AppIcon :name="tone(m).icon" :size="17" />
          <i v-if="!m.read" class="mp-item__dot" />
        </span>
        <span class="mp-item__body">
          <span class="mp-item__top">
            <strong>{{ m.title }}</strong>
            <span class="mp-item__state" :class="m.read ? 'is-read' : 'is-unread-tag'">
              {{ m.read ? '已读' : '未读' }}
            </span>
            <small>{{ fmt(m.createdAt) }}</small>
          </span>
          <span class="mp-item__from">{{ m.fromName }} · {{ tone(m).label }}</span>
          <span class="mp-item__preview" v-if="expanded !== m.id">{{ m.content.slice(0, 48) }}…</span>
          <span class="mp-item__content" v-else>{{ m.content }}</span>
          <span class="mp-item__detail-btn">
            {{ expanded === m.id ? '收起详情' : '查看详情' }}
            <AppIcon :name="expanded === m.id ? 'chevron-down' : 'arrow-right'" :size="11" />
          </span>
        </span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.mp {
  padding: 14px 16px 40px;
}

.mp__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.mp__back {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  color: var(--c-text-2);
}

.mp__head h1 {
  font-size: 17px;
  font-weight: 800;
  color: var(--c-text-1);
}

.mp__empty {
  padding: 60px 20px;
  text-align: center;
  color: var(--c-text-4);
  font-size: 12.5px;
  line-height: 1.8;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.mp-item {
  display: flex;
  gap: 12px;
  width: 100%;
  padding: 14px 15px;
  margin-bottom: 9px;
  border-radius: 16px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  text-align: left;
  transition: all var(--dur-fast);
}

.mp-item.is-unread {
  border-color: var(--c-primary-200);
  background: linear-gradient(150deg, var(--c-primary-50), #fff 55%);
}

.mp-item.is-open {
  box-shadow: var(--sh-sm);
}

.mp-item__avatar {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.mp-item__dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--c-danger);
  border: 2px solid #fff;
}

.mp-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mp-item__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.mp-item__top strong {
  font-size: 13.5px;
  font-weight: 800;
  color: var(--c-text-1);
  line-height: 1.35;
}

.mp-item__top small {
  font-size: 10px;
  color: var(--c-text-4);
  flex-shrink: 0;
}

.mp-item__from {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.mp-item__state {
  font-size: 9px;
  font-weight: 800;
  padding: 1.5px 7px;
  border-radius: var(--r-full);
  flex-shrink: 0;
  letter-spacing: 0.5px;
}

.mp-item__state.is-unread-tag {
  background: var(--c-danger);
  color: #fff;
}

.mp-item__state.is-read {
  background: var(--c-bg-muted);
  color: var(--c-text-4);
}

.mp-item__detail-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 5px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--c-primary-600);
}

.mp-item__preview {
  font-size: 12.5px;
  color: var(--c-text-3);
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mp-item__content {
  font-size: 13px;
  color: var(--c-text-2);
  line-height: 1.75;
}
</style>
