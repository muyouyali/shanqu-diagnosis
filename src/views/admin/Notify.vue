<script setup lang="ts">
/**
 * 消息通知（专家后台）
 * 专家向全体用户发公告，或回复指定用户；同时回溯历史消息
 */
import { ref, onMounted } from 'vue'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { useAppStore } from '@/stores/app'
import type { Message } from '@/types'

const store = useAppStore()

const form = ref({ userId: 'all', title: '', content: '' })
const sending = ref(false)
const sent = ref<Message[]>([])
const loading = ref(true)
const active = ref<Message | null>(null)

/** 已发送列表走专属接口：本专家发出的全部消息（私信 + 公告） */
const load = async () => {
  loading.value = true
  try {
    const res = await api.sentMessages()
    sent.value = res.items
  } catch (e: any) {
    store.showToast(e?.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)

const send = async () => {
  if (!form.value.title.trim() || !form.value.content.trim() || sending.value) return
  sending.value = true
  try {
    await api.sendMessage({
      userId: form.value.userId === 'all' ? 'all' : Number(form.value.userId),
      title: form.value.title,
      content: form.value.content
    })
    store.showToast(form.value.userId === 'all' ? '公告已发布' : '回复已发送', 'success')
    form.value.title = ''
    form.value.content = ''
    await load()
  } catch (e: any) {
    store.showToast(e?.message || '发送失败', 'error')
  } finally {
    sending.value = false
  }
}

const fmt = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 删除一条已发送消息 */
const removeSent = async (m: Message) => {
  if (!confirm(`确定删除「${m.title}」吗？用户端将同步移除。`)) return
  try {
    await api.deleteSentMessage(m.id)
    store.showToast('已删除', 'success')
    if (active.value?.id === m.id) active.value = null
    await load()
  } catch (e: any) {
    store.showToast(e?.message || '删除失败', 'error')
  }
}
</script>

<template>
  <div class="nt">
    <header class="nt__hero">
      <div class="nt__hero-text">
        <h1>消息通知</h1>
        <p>以专家身份回复农户问诊，或向全体用户发布农事公告</p>
      </div>
      <div class="nt__hero-badge">
        <AppIcon name="bell" :size="18" />
        <span>已发送 {{ sent.length }} 条</span>
      </div>
    </header>

    <div class="nt__grid">
      <!-- 撰写 -->
      <section class="nt-card">
        <h3 class="nt-card__title"><AppIcon name="edit" :size="14" /> 撰写消息</h3>

        <label class="nt-field">
          <span>接收对象</span>
          <select v-model="form.userId" class="nt-select">
            <option value="all">📢 全体用户（公告）</option>
            <option :value="9002">李农户（演示用户）</option>
          </select>
        </label>

        <label class="nt-field">
          <span>标题</span>
          <input v-model="form.title" maxlength="40" placeholder="如：关于您提交的三七问诊" />
        </label>

        <label class="nt-field">
          <span>内容</span>
          <textarea v-model="form.content" rows="5" maxlength="500" placeholder="填写回复内容或公告正文…" />
          <em class="nt-count">{{ form.content.length }}/500</em>
        </label>

        <button class="nt-send" :disabled="!form.title.trim() || !form.content.trim() || sending" @click="send">
          <AppIcon v-if="sending" name="loader" :size="14" class="spin" />
          {{ sending ? '发送中…' : form.userId === 'all' ? '发布公告' : '发送回复' }}
        </button>
      </section>

      <!-- 历史 -->
      <section class="nt-card">
        <h3 class="nt-card__title"><AppIcon name="list" :size="14" /> 已发送（{{ sent.length }}）</h3>
        <div v-if="loading" class="nt-empty">加载中…</div>
        <div v-else-if="!sent.length" class="nt-empty">还没有发送过消息</div>
        <article v-for="m in sent" v-else :key="m.id" class="nt-msg" role="button" @click="active = m">
          <div class="nt-msg__top">
            <span class="nt-msg__to" :class="{ 'is-all': m.userId === 'all' }">
              {{ m.userId === 'all' ? '全体公告' : `用户 #${m.userId}` }}
            </span>
            <small>{{ fmt(m.createdAt) }}</small>
          </div>
          <h4>{{ m.title }}<AppIcon name="arrow-right" :size="13" class="nt-msg__arrow" /></h4>
          <p>{{ m.content }}</p>
          <button
            class="nt-msg__del"
            title="删除这条消息"
            @click.stop="removeSent(m)"
          >
            <AppIcon name="trash" :size="13" /> 删除
          </button>
        </article>
      </section>
    </div>

    <!-- 消息详情弹层 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="active" class="nd-mask" @click.self="active = null">
          <div class="nd">
            <header class="nd__head">
              <div>
                <span class="nd__to" :class="{ 'is-all': active.userId === 'all' }">
                  {{ active.userId === 'all' ? '📢 全体公告' : `发送给用户 #${active.userId}` }}
                </span>
                <h3>{{ active.title }}</h3>
                <small>{{ fmt(active.createdAt) }}</small>
              </div>
              <button class="nd__close" @click="active = null"><AppIcon name="x" :size="15" /></button>
            </header>
            <div class="nd__body">{{ active.content }}</div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.nt {
  padding: 26px 34px 64px;
}

/* 页头横幅 */
.nt__hero {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 30px 32px;
  border-radius: var(--r-lg);
  background:
    radial-gradient(120% 180% at 100% 0%, rgba(255, 255, 255, 0.14), transparent 55%),
    linear-gradient(120deg, #14532d, #1a7f45 70%, #2f9e5f);
  color: #fff;
  margin-bottom: 18px;
}

.nt__hero::after {
  content: '';
  position: absolute;
  right: -40px;
  bottom: -70px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

.nt__hero h1 {
  font-size: 25px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.nt__hero p {
  font-size: 14px;
  opacity: 0.85;
  margin-top: 7px;
  line-height: 1.65;
}

.nt__hero-badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 20px;
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(4px);
  font-size: 14px;
  font-weight: 700;
}

.nt__grid {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  gap: 18px;
  align-items: start;
}

.nt-card {
  padding: 22px 24px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.nt-card__title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 15.5px;
  font-weight: 800;
  color: var(--c-text-1);
  margin-bottom: 16px;
}

.nt-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  position: relative;
}

.nt-field span {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text-3);
}

.nt-select,
.nt-field input,
.nt-field textarea {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--r-sm);
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-subtle);
  font-size: 14px;
  color: var(--c-text-1);
  transition: border-color var(--dur-fast);
}

.nt-select:focus,
.nt-field input:focus,
.nt-field textarea:focus {
  border-color: var(--c-primary-400);
  background: #fff;
}

.nt-field textarea {
  resize: none;
  line-height: 1.65;
  min-height: 140px;
}

.nt-count {
  position: absolute;
  right: 12px;
  bottom: 12px;
  font-size: 12.5px;
  font-style: normal;
  color: var(--c-text-4);
}

.nt-send {
  width: 100%;
  height: 48px;
  border-radius: var(--r-full);
  font-size: 15px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.nt-send:disabled {
  opacity: 0.45;
}

.nt-empty {
  padding: 48px 12px;
  text-align: center;
  font-size: 13.5px;
  color: var(--c-text-4);
}

.nt-msg {
  padding: 14px 0;
  border-bottom: 1px solid var(--c-line-soft);
  cursor: pointer;
  border-radius: 8px;
  transition: background var(--dur-fast);
}

.nt-msg:hover {
  background: var(--c-bg-subtle);
}

.nt-msg__del {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: var(--r-full);
  border: 1px solid #f3c1c0;
  background: transparent;
  font-size: 12px;
  color: #d9534f;
  opacity: 0;
  transition: all var(--dur-fast);
}

.nt-msg:hover .nt-msg__del {
  opacity: 1;
}

.nt-msg__del:hover {
  background: #fdf3f2;
}

.nt-msg:hover h4 {
  color: var(--c-primary-700);
}

.nt-msg__arrow {
  margin-left: 5px;
  opacity: 0;
  transition: opacity var(--dur-fast);
  vertical-align: -2px;
}

.nt-msg:hover .nt-msg__arrow {
  opacity: 1;
}

.nt-msg:last-child {
  border-bottom: none;
}

.nt-msg__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.nt-msg__to {
  font-size: 11.5px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: var(--r-full);
  background: #e8f2ff;
  color: #2563eb;
}

.nt-msg__to.is-all {
  background: var(--c-accent-100);
  color: var(--c-accent-600);
}

.nt-msg__top small {
  font-size: 12px;
  color: var(--c-text-4);
}

.nt-msg h4 {
  font-size: 15px;
  font-weight: 800;
  color: var(--c-text-1);
}

.nt-msg p {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--c-text-3);
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 860px) {
  .nt__grid {
    grid-template-columns: 1fr;
  }
  .nt {
    padding: 16px 14px 50px;
  }
  .nt__hero {
    flex-direction: column;
    align-items: flex-start;
    padding: 20px 18px;
  }
}

/* 消息详情弹层 */
.nd-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(16, 30, 22, 0.44);
  backdrop-filter: blur(3px);
  display: grid;
  place-items: center;
  padding: 20px;
}

.nd {
  width: min(560px, 100%);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.24);
  overflow: hidden;
}

.nd__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 22px 14px;
  border-bottom: 1px solid var(--c-line-soft);
}

.nd__to {
  display: inline-block;
  font-size: 11.5px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: var(--r-full);
  background: #e8f2ff;
  color: #2563eb;
  margin-bottom: 8px;
}

.nd__to.is-all {
  background: var(--c-accent-100);
  color: var(--c-accent-600);
}

.nd__head h3 {
  font-size: 18px;
  font-weight: 800;
  color: var(--c-text-1);
  line-height: 1.4;
}

.nd__head small {
  display: block;
  font-size: 12px;
  color: var(--c-text-4);
  margin-top: 5px;
}

.nd__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
  flex-shrink: 0;
}

.nd__body {
  padding: 18px 22px 24px;
  font-size: 14.5px;
  line-height: 1.85;
  color: var(--c-text-2);
  white-space: pre-wrap;
  overflow-y: auto;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s var(--ease-out);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
