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

/** 历史消息里筛出本专家发出的 */
const load = async () => {
  loading.value = true
  try {
    const res = await api.messages()
    sent.value = res.items.filter((m) => m.from === 'expert')
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
</script>

<template>
  <div class="nt">
    <header class="nt__head">
      <div>
        <h1>消息通知</h1>
        <p>以专家身份回复农户问诊，或向全体用户发布农事公告</p>
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
        <article v-for="m in sent" v-else :key="m.id" class="nt-msg">
          <div class="nt-msg__top">
            <span class="nt-msg__to" :class="{ 'is-all': m.userId === 'all' }">
              {{ m.userId === 'all' ? '全体公告' : `用户 #${m.userId}` }}
            </span>
            <small>{{ fmt(m.createdAt) }}</small>
          </div>
          <h4>{{ m.title }}</h4>
          <p>{{ m.content }}</p>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
.nt {
  padding: 24px 28px 60px;
  max-width: 1080px;
}

.nt__head h1 {
  font-size: 21px;
  font-weight: 800;
  color: var(--c-text-1);
}

.nt__head p {
  font-size: 12.5px;
  color: var(--c-text-4);
  margin-top: 5px;
  margin-bottom: 20px;
}

.nt__grid {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  gap: 16px;
  align-items: start;
}

.nt-card {
  padding: 18px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.nt-card__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 800;
  color: var(--c-text-1);
  margin-bottom: 14px;
}

.nt-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 12px;
  position: relative;
}

.nt-field span {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-3);
}

.nt-select,
.nt-field input,
.nt-field textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-subtle);
  font-size: 13px;
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
}

.nt-count {
  position: absolute;
  right: 10px;
  bottom: 10px;
  font-size: 10px;
  font-style: normal;
  color: var(--c-text-4);
}

.nt-send {
  width: 100%;
  height: 42px;
  border-radius: var(--r-full);
  font-size: 13.5px;
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
  padding: 34px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--c-text-4);
}

.nt-msg {
  padding: 12px 0;
  border-bottom: 1px solid var(--c-line-soft);
}

.nt-msg:last-child {
  border-bottom: none;
}

.nt-msg__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 5px;
}

.nt-msg__to {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--r-full);
  background: #e8f2ff;
  color: #2563eb;
}

.nt-msg__to.is-all {
  background: var(--c-accent-100);
  color: var(--c-accent-600);
}

.nt-msg__top small {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.nt-msg h4 {
  font-size: 13px;
  font-weight: 800;
  color: var(--c-text-1);
}

.nt-msg p {
  font-size: 12px;
  line-height: 1.7;
  color: var(--c-text-3);
  margin-top: 3px;
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
}
</style>
