<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'

interface Msg {
  id?: number
  role: 'user' | 'assistant'
  content: string
  sources?: { name: string; score: number; type: string; symptoms: string[] }[]
  usedFallback?: boolean
  pending?: boolean
  streaming?: boolean
}

const store = useAppStore()
const input = ref('')
const messages = ref<Msg[]>([])
const sending = ref(false)
const listRef = ref<HTMLElement | null>(null)

const quickQuestions = computed(() => {
  const map: Record<string, string[]> = {
    sanqi: ['三七根腐病怎么防？', '三七叶子发黄是缺素还是病了？', '雨季三七要注意什么？'],
    blueberry: ['蓝莓新叶发黄怎么办？', '蓝莓灰霉病用什么药？', '蓝莓土壤 pH 怎么调？'],
    citrus: ['柑橘黄龙病能治吗？', '柑橘红蜘蛛怎么防治？', '溃疡病和疮痂病怎么区分？'],
    tea: ['茶饼病什么时候预防最好？', '小绿叶蝉打什么药不伤茶？', '茶叶采摘前多久不能打药？'],
    tianma: ['天麻烂麻是什么原因？', '天麻窖里积水怎么处理？', '麻种下地前怎么消毒？'],
    walnut: ['核桃黑果是病还是虫？', '核桃枯枝是什么病？', '举肢蛾什么时候打药？']
  }
  return map[store.selectedCropId] || map.sanqi
})

const scrollToBottom = async () => {
  await nextTick()
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight
  }
}

onMounted(async () => {
  try {
    await store.loadCrops()
  } catch {
    /* ignore */
  }
  messages.value.push({
    role: 'assistant',
    content:
      '您好！我是云岭农诊的农技问答助手。\n\n关于三七、蓝莓、柑橘、茶叶、天麻、核桃的病虫害、用药、施肥问题，您都可以用大白话问我。我的回答都来自植保手册和技术资料，不会乱编，回答过程逐字流式呈现。'
  })
})

const send = async (text?: string) => {
  const q = (text ?? input.value).trim()
  if (!q || sending.value) return

  input.value = ''
  messages.value.push({ role: 'user', content: q })
  await scrollToBottom()

  sending.value = true
  const placeholder: Msg = { role: 'assistant', id: Date.now(), content: '', pending: true, streaming: true }
  messages.value.push(placeholder)
  await scrollToBottom()

  let full = ''
  const finalize = (patch: Partial<Msg>) => {
    const idx = messages.value.indexOf(placeholder)
    if (idx !== -1) messages.value[idx] = { id: placeholder.id, role: 'assistant', content: full, sources: placeholder.sources, ...patch }
  }

  try {
    await api.qaStream({ question: q, cropId: store.selectedCropId }, (type, data) => {
      if (type === 'sources') {
        placeholder.sources = data.sources
      } else if (type === 'delta') {
        full += data.delta
        placeholder.content = full
        scrollToBottom()
      } else if (type === 'done') {
        finalize({ usedFallback: data.usedFallback, streaming: false })
      }
    })
    // 兜底：若服务端未发 done（连接中断）
    if (messages.value.indexOf(placeholder) !== -1) {
      finalize({ streaming: false })
    }
  } catch (err) {
    finalize({
      content: full || `抱歉，回答失败了：${(err as Error).message}`,
      streaming: false
    })
  } finally {
    sending.value = false
    await scrollToBottom()
  }
}

/** 朗读状态：记录正在朗读的消息 id，再次点击停止 */
const speakingId = ref<number | null>(null)

const stopSpeak = () => {
  window.speechSynthesis?.cancel()
  speakingId.value = null
}

const toggleSpeak = (m: any) => {
  if (!('speechSynthesis' in window)) {
    store.showToast('当前浏览器不支持语音播报', 'error')
    return
  }
  // 正在朗读这条 → 停止
  if (speakingId.value !== null) return stopSpeak()
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(m.content.replace(/[*#]/g, ''))
  u.lang = 'zh-CN'
  u.rate = 0.94
  const zh = window.speechSynthesis.getVoices().find((v) => v.lang.includes('zh'))
  if (zh) u.voice = zh
  u.onend = () => (speakingId.value = null)
  u.onerror = () => (speakingId.value = null)
  speakingId.value = m.id ?? -1
  window.speechSynthesis.speak(u)
}

/** 「知识库直答」展开引用来源 */
const kbOpenId = ref<number | null>(null)
const toggleKb = (m: any) => {
  kbOpenId.value = kbOpenId.value === (m.id ?? -1) ? null : (m.id ?? -1)
  if (kbOpenId.value !== null) stopSpeak()
}
</script>

<template>
  <div class="qa">
    <header class="page-head">
      <div class="page-head__left">
        <div class="page-head__avatar">
          <AppIcon name="sparkle" :size="17" :stroke="2" />
        </div>
        <div>
          <h1 class="page-head__title">农技问答</h1>
          <p class="page-head__sub">基于植保知识库 · 有据可查</p>
        </div>
      </div>
    </header>

    <!-- 作物切换 -->
    <div class="crop-switch">
      <button
        v-for="c in store.crops.filter((c) => c.diagnosable !== false)"
        :key="c.id"
        class="crop-switch__item"
        :class="{ 'is-active': store.selectedCropId === c.id }"
        @click="store.setCrop(c.id)"
      >
        {{ c.emoji }} {{ c.name }}
      </button>
    </div>

    <!-- 消息列表 -->
    <div ref="listRef" class="msg-list">
      <div v-for="(m, i) in messages" :key="i" class="msg" :class="`msg--${m.role}`">
        <div v-if="m.role === 'assistant'" class="msg__avatar">
          <AppIcon name="sparkle" :size="14" :stroke="2.2" />
        </div>

        <div class="msg__content">
          <div v-if="m.pending && !m.content" class="msg__bubble msg__bubble--loading">
            <template v-if="!m.sources?.length">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </template>
            <p v-else class="msg__searching">
              <AppIcon name="database" :size="12" />
              正在检索知识库：{{ m.sources[0]?.name }} 等 {{ m.sources.length }} 条相关资料…
            </p>
          </div>

          <template v-else>
            <div class="msg__bubble" :class="{ 'typing-caret': m.streaming }">
              <p v-for="(line, j) in m.content.split('\n')" :key="j" :class="{ 'is-empty': !line.trim() }">
                {{ line }}
              </p>
            </div>

            <!-- 引用来源 -->
            <div v-if="m.sources?.length" class="msg__sources">
              <p class="msg__sources-label">
                <AppIcon name="database" :size="11" />
                参考知识库
              </p>
              <div class="msg__sources-list">
                <span v-for="s in m.sources" :key="s.name" class="src-chip">
                  {{ s.name }}
                  <i>{{ Math.round(s.score * 100) }}%</i>
                </span>
              </div>
            </div>

            <div v-if="m.role === 'assistant' && !m.pending" class="msg__tools">
              <button class="msg__tool" :class="{ 'is-speaking': speakingId === (m.id ?? -1) }" @click="toggleSpeak(m)">
                <AppIcon :name="speakingId === (m.id ?? -1) ? 'volume' : 'volume-off'" :size="12" />
                {{ speakingId === (m.id ?? -1) ? '停止' : '朗读' }}
              </button>
              <button
                v-if="m.usedFallback"
                class="msg__fallback"
                :class="{ 'is-open': kbOpenId === (m.id ?? -1) }"
                @click="toggleKb(m)"
              >
                {{ kbOpenId === (m.id ?? -1) ? '收起知识来源 ▴' : '知识库直答 ▾' }}
              </button>
            </div>

            <!-- 知识库来源详情 -->
            <div v-if="kbOpenId === (m.id ?? -1) && m.sources?.length" class="kb-panel">
              <p class="kb-panel__head">
                <AppIcon name="book" :size="13" />
                本回答引用了 {{ m.sources.length }} 条知识库资料
              </p>
              <div v-for="s in m.sources" :key="s.name" class="kb-panel__item">
                <div class="kb-panel__top">
                  <strong>{{ s.name }}</strong>
                  <span class="kb-panel__score">{{ Math.round(s.score * 100) }}% 匹配</span>
                </div>
                <p class="kb-panel__sym">{{ s.symptoms?.join('；') || '暂无症状描述' }}</p>
              </div>
              <p class="kb-panel__note">以上内容来自平台植保知识库，如需人工复核请在智能诊断后咨询专家。</p>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 快捷问题 -->
    <div v-if="messages.length <= 1" class="quick">
      <p class="quick__title">试试这样问</p>
      <div class="quick__list">
        <button v-for="q in quickQuestions" :key="q" class="quick__item" @click="send(q)">
          {{ q }}
          <AppIcon name="arrow-right" :size="13" />
        </button>
      </div>
    </div>

    <!-- 输入栏 -->
    <div class="composer">
      <div class="composer__box">
        <input
          v-model="input"
          class="composer__input"
          placeholder="用大白话描述您的问题…"
          maxlength="200"
          :disabled="sending"
          @keyup.enter="send()"
        />
        <button class="composer__send" :disabled="!input.trim() || sending" @click="send()">
          <AppIcon name="arrow-right" :size="17" :stroke="2.2" />
        </button>
      </div>
      <p class="composer__tip">AI 回答仅供参考，用药请以农药标签为准</p>
    </div>
  </div>
</template>

<style scoped>
.qa {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-page);
  height: 100dvh;
}

.page-head {
  padding: 14px 18px 12px;
  background: var(--c-bg-card);
  border-bottom: 1px solid var(--c-line-soft);
  flex-shrink: 0;
}

.page-head__left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-head__avatar {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(140deg, var(--c-primary-400), var(--c-primary-700));
  flex-shrink: 0;
}

.page-head__title {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}

.page-head__sub {
  font-size: 10.5px;
  color: var(--c-text-4);
}

/* 作物切换 */
.crop-switch {
  display: flex;
  gap: 6px;
  padding: 9px 16px;
  background: var(--c-bg-card);
  border-bottom: 1px solid var(--c-line-soft);
  overflow-x: auto;
  flex-shrink: 0;
  scrollbar-width: none;
}

.crop-switch::-webkit-scrollbar {
  display: none;
}

.crop-switch__item {
  padding: 5px 12px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
  font-size: 11.5px;
  color: var(--c-text-3);
  white-space: nowrap;
  transition: all var(--dur-fast);
}

.crop-switch__item.is-active {
  background: var(--c-primary-600);
  border-color: var(--c-primary-600);
  color: #fff;
  font-weight: 600;
}

/* 消息列表 */
.msg-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  -webkit-overflow-scrolling: touch;
}

.msg {
  display: flex;
  gap: 9px;
  max-width: 100%;
}

.msg--user {
  justify-content: flex-end;
}

.msg__avatar {
  width: 28px;
  height: 28px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: linear-gradient(140deg, var(--c-primary-100), var(--c-primary-200));
  color: var(--c-primary-700);
  flex-shrink: 0;
  margin-top: 2px;
}

.msg__content {
  display: flex;
  flex-direction: column;
  gap: 7px;
  max-width: 82%;
}

.msg--user .msg__content {
  align-items: flex-end;
}

.msg__bubble {
  padding: 11px 14px;
  border-radius: 16px;
  font-size: 13.5px;
  line-height: 1.75;
  word-break: break-word;
}

.msg--assistant .msg__bubble {
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  border-top-left-radius: 5px;
  color: var(--c-text-1);
  box-shadow: var(--sh-xs);
}

.msg--user .msg__bubble {
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  color: #fff;
  border-top-right-radius: 5px;
  box-shadow: 0 4px 14px rgba(47, 152, 104, 0.24);
}

.msg__bubble p.is-empty {
  height: 7px;
}

/* 加载点 */
.msg__bubble--loading {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 15px 16px;
}

.msg__searching {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--c-text-3);
  animation: pulse-soft 1.6s ease-in-out infinite;
}

@keyframes pulse-soft {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

.msg__bubble.typing-caret p:last-child {
  display: inline;
}

.msg__bubble.typing-caret p:last-child.is-empty {
  display: block;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-primary-300);
  animation: bounce 1.3s infinite;
}

.dot:nth-child(2) {
  animation-delay: 0.16s;
}
.dot:nth-child(3) {
  animation-delay: 0.32s;
}

@keyframes bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.5;
  }
  30% {
    transform: translateY(-5px);
    opacity: 1;
  }
}

/* 来源 */
.msg__sources {
  padding: 9px 11px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
  border: 1px dashed var(--c-line);
}

.msg__sources-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--c-text-4);
  margin-bottom: 6px;
}

.msg__sources-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.src-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: var(--r-full);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line);
  font-size: 10.5px;
  color: var(--c-text-2);
}

.src-chip i {
  font-style: normal;
  font-size: 9px;
  color: var(--c-primary-600);
  font-weight: 700;
}

/* 工具栏 */
.msg__tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.msg__tool {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 9px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
  font-size: 10.5px;
  color: var(--c-text-3);
}

.msg__tool:active {
  background: var(--c-primary-50);
  color: var(--c-primary-700);
}

.msg__fallback {
  font-size: 9.5px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--c-warning-bg);
  color: #92400e;
  font-weight: 600;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--dur-fast);
}

.msg__fallback:hover {
  border-color: #f0d9a8;
}

.msg__fallback.is-open {
  border-color: #f0d9a8;
}

/* 朗读中状态 */
.msg__tool.is-speaking {
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border-color: var(--c-primary-200);
}

/* 知识库来源面板 */
.kb-panel {
  margin-top: 8px;
  padding: 12px 13px;
  border-radius: 11px;
  background: #fffdf5;
  border: 1px dashed #ecd9a0;
}

.kb-panel__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 800;
  color: #92400e;
  margin-bottom: 9px;
}

.kb-panel__item {
  padding: 8px 0;
  border-top: 1px solid #f3e8c8;
}

.kb-panel__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--c-text-1);
}

.kb-panel__score {
  font-size: 10px;
  font-weight: 700;
  color: #b45309;
  flex-shrink: 0;
}

.kb-panel__sym {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.6;
  color: var(--c-text-3);
}

.kb-panel__note {
  margin-top: 8px;
  font-size: 10px;
  color: var(--c-text-4);
}

/* 快捷问题 */
.quick {
  padding: 4px 16px 12px;
  flex-shrink: 0;
}

.quick__title {
  font-size: 11px;
  color: var(--c-text-4);
  margin-bottom: 8px;
}

.quick__list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.quick__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  font-size: 12.5px;
  color: var(--c-text-2);
  text-align: left;
  transition: all var(--dur-fast);
}

.quick__item:active {
  background: var(--c-primary-50);
  border-color: var(--c-primary-200);
}

.quick__item :deep(.icon) {
  color: var(--c-primary-400);
  flex-shrink: 0;
}

/* 输入栏 */
.composer {
  flex-shrink: 0;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px));
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--c-line-soft);
}

.composer__box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 5px 5px 15px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1.5px solid var(--c-line);
  transition: border-color var(--dur-fast);
}

.composer__box:focus-within {
  border-color: var(--c-primary-300);
  background: #fff;
}

.composer__input {
  flex: 1;
  height: 36px;
  font-size: 13.5px;
  min-width: 0;
}

.composer__input::placeholder {
  color: var(--c-text-4);
}

.composer__send {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  color: #fff;
  flex-shrink: 0;
  transition: all var(--dur-fast);
}

.composer__send:disabled {
  background: var(--c-line);
  color: var(--c-text-4);
}

.composer__tip {
  margin-top: 7px;
  text-align: center;
  font-size: 9.5px;
  color: var(--c-text-4);
}
</style>

<style scoped>
@media (min-width: 960px) {
  .msg-list {
    max-width: 820px;
    margin: 0 auto;
    width: 100%;
  }
  .crop-switch {
    justify-content: center;
  }
  .quick {
    max-width: 820px;
    margin: 0 auto;
    width: 100%;
  }
  .composer__box {
    max-width: 820px;
    margin: 0 auto;
  }
  .msg--assistant .msg__bubble {
    font-size: 14.5px;
  }
}
</style>
