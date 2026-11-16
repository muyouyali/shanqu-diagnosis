<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import CropEmoji from '@/components/CropEmoji.vue'
import PageHero from '@/components/PageHero.vue'
import RegionPicker from '@/components/RegionPicker.vue'
import api from '@/api'

interface Msg {
  id?: number
  role: 'user' | 'assistant'
  content: string
  sources?: {
    name: string
    score: number
    type: string
    symptoms: string[]
    references?: string[]
    excerpt?: string
    cropName?: string
  }[]
  usedFallback?: boolean
  /** 空召回：知识库无资料，回答为固定兜底文案（非 AI 编造） */
  noHit?: boolean
  pending?: boolean
  streaming?: boolean
}

const store = useAppStore()
const input = ref('')
const messages = ref<Msg[]>([])
const sending = ref(false)
const listRef = ref<HTMLElement | null>(null)

/** 输入框自适应高度：单行起，最多 4 行，长文本输入更舒适 */
const inputEl = ref<HTMLTextAreaElement | null>(null)
const autoGrow = () => {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 112)}px`
}

/** 当前地区可问的作物：优先显示所选区域对应的本地作物，跨区作物折叠 */
const regionCrops = computed(() => store.localCrops.filter((c) => c.diagnosable !== false))
const remoteCrops = computed(() => store.otherCrops.filter((c) => c.diagnosable !== false))
const showRemote = ref(false)

/** 自定义作物：不在列表中的作物也能问答（AI 结合通用植保知识作答） */
const customCropMode = ref(false)
const customCropName = ref('')

const QUICK_MAP: Record<string, string[]> = {
  sanqi: ['三七根腐病怎么防？', '三七叶子发黄是缺素还是病了？', '雨季三七要注意什么？'],
  blueberry: ['蓝莓新叶发黄怎么办？', '蓝莓灰霉病用什么药？', '蓝莓土壤 pH 怎么调？'],
  citrus: ['柑橘黄龙病能治吗？', '柑橘红蜘蛛怎么防治？', '溃疡病和疮痂病怎么区分？'],
  tea: ['茶饼病什么时候预防最好？', '小绿叶蝉打什么药不伤茶？', '茶叶采摘前多久不能打药？'],
  tianma: ['天麻烂麻是什么原因？', '天麻窖里积水怎么处理？', '麻种下地前怎么消毒？'],
  walnut: ['核桃黑果是病还是虫？', '核桃枯枝是什么病？', '举肢蛾什么时候打药？'],
  huajiao: ['花椒锈病怎么防治？', '花椒蚜虫用什么药？', '椒树流胶是什么病？'],
  moyu: ['魔芋软腐病怎么防？', '魔芋叶枯是什么原因？', '魔芋种芋怎么消毒？'],
  shiliu: ['石榴干腐病怎么防治？', '石榴裂果是什么原因？', '石榴蚧壳虫怎么治？'],
  coffee: ['咖啡锈病怎么防治？', '咖啡天牛怎么防？', '咖啡豆壳变黑是什么病？']
}

const quickQuestions = computed(() => {
  // 自定义作物 → 通用植保建议，并把作物名带进去
  if (customCropMode.value) {
    const name = customCropName.value.trim()
    return [
      name ? `${name}常见病虫害有哪些？` : '常见作物病害怎么预防？',
      name ? `${name}叶子发黄是什么原因？` : '叶片发黄是缺素还是病了？',
      name ? `${name}打什么药，安全间隔期多久？` : '雨季病害防控要注意什么？'
    ]
  }
  const id = store.selectedCropId
  if (QUICK_MAP[id]) return QUICK_MAP[id]
  // 其他作物（图谱扩充/服务器新增）：按作物名生成对应推荐
  const crop = store.crops.find((c) => c.id === id)
  const name = crop?.name?.replace(/^(云南|高原|昭通|普洱|富源|蒙自)/, '') || '作物'
  return [`${name}常见病虫害有哪些？`, `${name}叶子发黄是什么原因？`, `雨季${name}要注意什么？`]
})

const scrollToBottom = async () => {
  await nextTick()
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight
  }
}

const welcomeText = computed(() => {
  const crop = store.crops.find((c) => c.id === store.selectedCropId)
  const name = crop?.name?.replace(/^(云南|高原|昭通|普洱|富源|蒙自)/, '') || '作物'
  return `您好！我是云岭农诊的农技问答助手。\n\n当前选中「${name}」，关于${name}的病虫害、用药、施肥问题，您都可以用大白话问我，也可以直接点下方推荐问题。其他作物也能问——点上方「✏️ 其他作物」填一下作物名即可。回答都来自植保手册和技术资料，不会乱编，回答过程逐字流式呈现。`
})

const HISTORY_KEY = 'ylnz_qa_history'
const saveHistory = () => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.value.filter((m) => !m.pending).slice(-30)))
  } catch { /* 忽略 */ }
}
const clearChat = () => {
  messages.value = [{ role: 'assistant', content: welcomeText.value }]
  localStorage.removeItem(HISTORY_KEY)
  store.showToast('会话已清空', 'success')
}
const copiedId = ref<number | null>(null)

/** 回答行渲染：转义 HTML 后把 **文本** 转为加粗，不让标记符暴露给农户 */
const fmtLine = (line: string): string =>
  line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
const copyAnswer = async (m: Msg) => {
  try {
    await navigator.clipboard.writeText(m.content.replace(/\*\*/g, ''))
    copiedId.value = m.id ?? -1
    setTimeout(() => (copiedId.value = null), 1500)
    store.showToast('回答已复制', 'success')
  } catch {
    store.showToast('复制失败', 'error')
  }
}

onMounted(async () => {
  try {
    await store.loadCrops()
  } catch {
    /* ignore */
  }
  // 恢复上次会话（最多 30 条），没有则显示欢迎语
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    if (Array.isArray(saved) && saved.length) {
      messages.value.push(...saved)
      await scrollToBottom()
      return
    }
  } catch { /* 损坏则重置 */ }
  messages.value.push({ role: 'assistant', content: welcomeText.value })
})

const send = async (text?: string) => {
  const q = (text ?? input.value).trim()
  if (!q || sending.value) return

  input.value = ''
  nextTick(autoGrow)
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
    await api.qaStream(
      {
        question: q,
        cropId: customCropMode.value ? undefined : store.selectedCropId,
        customCrop: customCropMode.value ? customCropName.value.trim() || '通用' : undefined
      },
      (type, data) => {
        if (type === 'sources') {
          placeholder.sources = data.sources
        } else if (type === 'delta') {
          full += data.delta
          placeholder.content = full
          scrollToBottom()
        } else if (type === 'done') {
          finalize({ usedFallback: data.usedFallback, noHit: !!data.noHit, streaming: false })
        }
      }
    )
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
    saveHistory()
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
  u.rate = 1.15
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

/** 引用溯源区块：每条 AI 回答底部的折叠"资料来源" */
const citeOpenId = ref<number | null>(null)
const toggleCite = (m: any) => {
  citeOpenId.value = citeOpenId.value === (m.id ?? -1) ? null : (m.id ?? -1)
}

/** 引用条目的出处文案：手册名 ・ 病害名（匹配度） */
const citeRef = (s: any) => {
  const book = s.references?.[0] || (s.cropName ? `${s.cropName}植保知识库` : '平台植保知识库')
  return `${book} ・ ${s.name}`
}

/** RAG 检索增强面板：徽章点击打开，实时演示知识库检索 */
interface RagHit {
  id: number | string
  name: string
  cropName: string
  score: number
  type: string
  symptoms: string[]
  treatment: string[]
}
const ragOpen = ref(false)
const ragQuery = ref('')
const ragHits = ref<RagHit[]>([])
const ragBusy = ref(false)
const ragDone = ref(false)
const ragTotal = ref({ docs: 0, diseases: 0, crops: 0 })
/** 面板一打开就展示真实知识库规模（不能等用户检索后才从 0 变成真实值） */
const loadRagTotal = async () => {
  try {
    const r = await api.kbStats()
    ragTotal.value = { docs: r.docs, diseases: r.diseases, crops: r.crops }
  } catch { /* 静默失败 */ }
}
loadRagTotal()
const ragDemo = async (q?: string) => {
  const text = (q ?? ragQuery.value).trim()
  if (!text || ragBusy.value) return
  ragQuery.value = text
  ragBusy.value = true
  ragDone.value = false
  try {
    const r = await api.kbSearch(text, store.selectedCropId || null)
    ragHits.value = r.hits as RagHit[]
    ragTotal.value = r.total
  } catch {
    store.showToast('检索失败，请重试', 'error')
  } finally {
    ragBusy.value = false
    ragDone.value = true
  }
}
const RAG_STEPS = [
  { icon: 'chat', title: '问题解析', desc: '识别作物、症状关键词，改写为检索-friendly 查询' },
  { icon: 'search', title: '知识检索', desc: '在本地植保知识库中按相关性召回 top-5 条目' },
  { icon: 'book', title: '提示词增强', desc: '命中资料注入系统提示词，限定模型只依据资料作答' },
  { icon: 'sparkle', title: '流式生成', desc: '大模型逐字生成回答，越库内容不掺入' },
  { icon: 'check-circle', title: '引用溯源', desc: '回答下方展示引用条目与匹配度，可展开核对' }
]
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

    <!-- 宽屏横幅 -->
    <PageHero
      wide-only
      emoji="💬"
      title="农技问答"
      desc="基于本地植保知识库，大白话提问 · 有据可查 · 流式呈现"
      badge="RAG 检索增强"
      badge-icon="book"
      badge-tip="基于本地植保知识库检索，回答可溯源"
      image="/media/banners/b36813325_wide.jpg"
      :tags="['引用来源可展开', '支持语音朗读', '一键转问专家']"
      @badge-click="ragOpen = true"
    />

    <!-- RAG 检索增强面板 -->
    <transition name="rag-slide">
      <section v-if="ragOpen" class="rag-panel">
        <div class="rag-panel__head">
          <h2 class="rag-panel__title">
            <AppIcon name="book" :size="16" />
            RAG 检索增强 · 工作原理
          </h2>
          <button class="rag-panel__close" @click="ragOpen = false"><AppIcon name="x" :size="15" /></button>
        </div>

        <p class="rag-panel__intro">
          大模型直接回答容易「一本正经地胡说」。RAG 的思路是：先到本地植保知识库里查出最相关的资料，
          再把资料连同问题一起交给大模型作答——回答的每一条建议都有知识库原文背书，可点开溯源。
        </p>

        <!-- 流水线 5 步 -->
        <div class="rag-steps">
          <div v-for="(s, i) in RAG_STEPS" :key="s.title" class="rag-step">
            <span class="rag-step__no">{{ i + 1 }}</span>
            <span class="rag-step__icon"><AppIcon :name="s.icon" :size="16" /></span>
            <strong>{{ s.title }}</strong>
            <small>{{ s.desc }}</small>
            <i v-if="i < RAG_STEPS.length - 1" class="rag-step__arrow">→</i>
          </div>
        </div>

        <!-- 实时检索演示 -->
        <div class="rag-demo">
          <div class="rag-demo__head">
            <strong>实时检索演示</strong>
            <small>知识库规模：{{ ragTotal.diseases }} 种病害 · {{ ragTotal.crops }} 种作物 · {{ ragTotal.docs }} 篇文档</small>
          </div>
          <div class="rag-demo__bar">
            <AppIcon name="search" :size="15" class="rag-demo__icon" />
            <input
              v-model="ragQuery"
              class="rag-demo__input"
              placeholder="输入问题检索，如：三七叶片有白霜状霉层怎么防治？"
              maxlength="40"
              @keyup.enter="ragDemo()"
            />
            <button class="rag-demo__btn" :disabled="ragBusy || !ragQuery.trim()" @click="ragDemo()">
              {{ ragBusy ? '检索中…' : '检索' }}
            </button>
          </div>

          <div v-if="ragDone" class="rag-demo__hits">
            <p v-if="!ragHits.length" class="rag-demo__empty">
              未检索到相关条目 —— 此时模型不会臆造，回答会明确提示资料不足
            </p>
            <div v-for="(h, i) in ragHits" :key="h.id" class="rag-hit">
              <span class="rag-hit__rank">TOP{{ i + 1 }}</span>
              <div class="rag-hit__main">
                <div class="rag-hit__name">
                  {{ h.name }}
                  <em v-if="h.cropName">{{ h.cropName }}</em>
                  <em v-if="h.type" class="rag-hit__type">{{ h.type }}</em>
                </div>
                <p class="rag-hit__sym">{{ h.symptoms.join('；') }}</p>
              </div>
              <div class="rag-hit__score">
                <span class="rag-hit__pct">{{ Math.round(h.score * 100) }}%</span>
                <span class="rag-hit__bar"><i :style="{ width: Math.round(h.score * 100) + '%' }"></i></span>
              </div>
            </div>
            <p class="rag-demo__note">
              <AppIcon name="check-circle" :size="12" />
              命中以上资料后注入提示词，模型只依据这些内容作答 —— 这就是「有据可查」
            </p>
          </div>
        </div>
      </section>
    </transition>

    <!-- 作物切换：跟随所选地区 -->
    <div class="crop-switch-bar">
      <div class="crop-switch">
        <RegionPicker class="qa-region" />
        <button
          v-for="c in regionCrops"
          :key="c.id"
          class="crop-switch__item"
          :class="{ 'is-active': store.selectedCropId === c.id }"
          @click="store.setCrop(c.id)"
        >
          <CropEmoji :emoji="c.emoji" :name="c.name" :size="18" class="qa-crop__emoji" />
          {{ c.name }}
        </button>
        <button
          v-if="remoteCrops.length"
          class="crop-switch__more"
          :class="{ 'is-open': showRemote }"
          @click="showRemote = !showRemote"
        >
          其他地区 {{ remoteCrops.length }}
          <AppIcon :name="showRemote ? 'chevron-up' : 'chevron-down'" :size="11" />
        </button>
        <button
          class="crop-switch__more"
          :class="{ 'is-open': customCropMode }"
          @click="customCropMode = !customCropMode"
        >
          ✏️ 其他作物
        </button>
      </div>
      <button v-if="messages.length > 1" class="crop-switch-bar__clear" @click="clearChat">
        <AppIcon name="x" :size="12" />
        清空会话
      </button>
    </div>

    <!-- 自定义作物输入 -->
    <div v-if="customCropMode" class="crop-switch crop-switch--remote">
      <input
        v-model="customCropName"
        class="input"
        style="flex: 1; min-width: 0"
        placeholder="输入作物名称（如：辣椒、玉米、百合），AI 可回答任意作物问题"
        maxlength="12"
      />
    </div>

    <div v-if="showRemote" class="crop-switch crop-switch--remote">
      <button
        v-for="c in remoteCrops"
        :key="c.id"
        class="crop-switch__item"
        :class="{ 'is-active': store.selectedCropId === c.id }"
        @click="store.setCrop(c.id)"
      >
        <CropEmoji :emoji="c.emoji" :name="c.name" :size="18" class="qa-crop__emoji" />
        {{ c.name }}
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
            <div class="msg__bubble" :class="{ 'typing-caret': m.streaming, 'msg__bubble--nohit': m.noHit }">
              <p
                v-for="(line, j) in m.content.split('\n')"
                :key="j"
                :class="{ 'is-empty': !line.trim() }"
                v-html="fmtLine(line)"
              />
            </div>

            <!-- 空召回兜底：知识库无资料时的行动引导（答案为固定文案，非模型生成） -->
            <div v-if="m.noHit && !m.pending" class="nohit-actions">
              <button class="nohit-actions__btn" @click="$router.push('/diagnose')">
                <AppIcon name="camera" :size="13" /> 去提交病害样本
              </button>
              <button class="nohit-actions__btn" @click="$router.push('/ask')">
                <AppIcon name="shield" :size="13" /> 申请专家复核咨询
              </button>
            </div>

            <!-- 📑 引用溯源区块（每条 AI 回答底部固定展示，点击展开原始片段） -->
            <div v-if="m.sources?.length" class="msg__cite">
              <button class="msg__cite-toggle" @click="toggleCite(m)">
                <AppIcon name="book" :size="12" />
                资料来源（{{ m.sources.length }} 条，点击{{ citeOpenId === (m.id ?? -1) ? '收起' : '展开' }}）
                <i class="msg__cite-arrow" :class="{ 'is-open': citeOpenId === (m.id ?? -1) }">▶</i>
              </button>
              <div v-if="citeOpenId === (m.id ?? -1)" class="msg__cite-body">
                <div v-for="s in m.sources" :key="s.name" class="cite-item">
                  <p class="cite-item__ref">▶ {{ citeRef(s) }}</p>
                  <pre class="cite-item__excerpt">{{ s.excerpt || s.symptoms?.join('；') || '（暂无原文片段）' }}</pre>
                  <p class="cite-item__score">
                    匹配度 {{ Math.round(s.score * 100) }}%<template v-if="s.cropName"> · {{ s.cropName }}</template>
                  </p>
                  <!-- 跳转外部检索：百度 / 百度文库 -->
                  <div class="cite-item__links">
                    <a
                      :href="`https://www.baidu.com/s?wd=${encodeURIComponent((s.cropName ? s.cropName + ' ' : '') + (s.name || citeRef(s)))}`"
                      target="_blank" rel="noopener" class="cite-link cite-link--baidu"
                    >🔍 百度搜索</a>
                    <a
                      :href="`https://wenku.baidu.com/search?word=${encodeURIComponent((s.name || citeRef(s)).replace(/[《》]/g, ''))}`"
                      target="_blank" rel="noopener" class="cite-link cite-link--wenku"
                    >📄 百度文库</a>
                  </div>
                </div>
                <p class="msg__cite-note">以上为知识库原文片段，回答内容均据此生成，可对照核查。点击「百度搜索 / 百度文库」可跳转外部资料延伸阅读。</p>
              </div>
            </div>

            <div v-if="m.role === 'assistant' && !m.pending" class="msg__tools">
              <button class="msg__tool" :class="{ 'is-speaking': copiedId === (m.id ?? -1) }" @click="copyAnswer(m)">
                <AppIcon :name="copiedId === (m.id ?? -1) ? 'check-circle' : 'list'" :size="12" />
                {{ copiedId === (m.id ?? -1) ? '已复制' : '复制' }}
              </button>
              <button class="msg__tool" :class="{ 'is-speaking': speakingId === (m.id ?? -1) }" @click="toggleSpeak(m)">
                <AppIcon :name="speakingId === (m.id ?? -1) ? 'volume' : 'volume-off'" :size="12" />
                {{ speakingId === (m.id ?? -1) ? '停止' : '朗读' }}
              </button>
              <button
                v-if="m.usedFallback && !m.noHit"
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
        <textarea
          ref="inputEl"
          v-model="input"
          class="composer__input"
          rows="1"
          placeholder="用大白话描述您的问题…（Enter 发送，Shift+Enter 换行）"
          maxlength="200"
          :disabled="sending"
          @input="autoGrow"
          @keydown.enter.exact.prevent="send()"
        ></textarea>
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

.hero-tips {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.hero-tips span {
  font-size: 12.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.18);
  padding: 6px 13px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
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
  font-size: 11.5px;
  color: var(--c-text-4);
}

/* 作物切换 */
.crop-switch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
}

.crop-switch-bar__clear {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--r-full);
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-3);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  transition: all var(--dur-fast);
}

.crop-switch-bar__clear:hover {
  color: #d9534f;
  border-color: #f3c1c0;
  background: #fdf3f2;
}

.crop-switch {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-width: 0;
  flex: 1;
  gap: 8px;
  padding: 11px 20px;
  background: var(--c-bg-card);
  border-bottom: 1px solid var(--c-line-soft);
  scrollbar-width: none;
}

/* 地区选择按钮（白色条上的配色适配） */
.qa-region {
  flex-shrink: 0;
}

.qa-region :deep(.region-btn) {
  background: var(--c-primary-50, #eaf5ee);
  border: 1px solid var(--c-primary-100, #d6ecdf);
  color: var(--c-primary-700, #256b47);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.qa-region :deep(.region-btn:hover) {
  background: #dcf0e4;
  border-color: var(--c-primary-600);
}

.qa-region :deep(.region-btn__switch) {
  background: rgba(37, 107, 71, 0.12);
  border-color: rgba(37, 107, 71, 0.3);
}

.crop-switch__label {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--c-primary-50, #eaf5ee);
  color: var(--c-primary-700, #256b47);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.crop-switch--remote {
  flex: 0 0 auto;
  padding: 7px 20px;
  background: var(--c-bg-muted);
}

/* 自定义作物输入：紧凑单行 */
.crop-switch--remote .input {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border-radius: 18px;
  font-size: 13px;
}

.crop-switch__more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 6px 12px;
  border-radius: var(--r-full);
  border: 1px dashed var(--c-line);
  background: transparent;
  font-size: 13px;
  color: var(--c-text-4);
  white-space: nowrap;
  transition: all var(--dur-fast);
}

.crop-switch__more.is-open,
.crop-switch__more:hover {
  border-color: var(--c-primary-600);
  color: var(--c-primary-700);
}

.crop-switch::-webkit-scrollbar {
  display: none;
}

.crop-switch__item {
  padding: 7px 14px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
  font-size: 13px;
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
  padding: 20px 20px 10px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  -webkit-overflow-scrolling: touch;
}

.msg {
  display: flex;
  gap: 11px;
  max-width: 100%;
}

.msg--user {
  justify-content: flex-end;
}

.msg__avatar {
  width: 34px;
  height: 34px;
  border-radius: 10px;
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
  gap: 8px;
  max-width: 80%;
}

.msg--user .msg__content {
  align-items: flex-end;
}

.msg__bubble {
  padding: 14px 18px;
  border-radius: var(--r-lg);
  font-size: 15px;
  line-height: 1.8;
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
  padding: 17px 18px;
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
/* ===== 空召回兜底卡片 ===== */
.msg__bubble--nohit {
  background: #fffbeb;
  border: 1px solid #fcd34d;
}

.nohit-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.nohit-actions__btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px 10px;
  border-radius: var(--r-full);
  font-size: 11.5px;
  font-weight: 600;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  transition: all var(--dur-base) var(--ease-out);
}

.nohit-actions__btn:hover {
  background: #dbeafe;
}

/* ===== 📑 引用溯源区块（折叠可展开） ===== */
.msg__cite {
  margin-top: 10px;
}

.msg__cite-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1px dashed var(--c-line);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--c-text-2);
  transition: background var(--dur-base) var(--ease-out);
}

.msg__cite-toggle:hover {
  background: var(--c-accent-100);
}

.msg__cite-arrow {
  font-style: normal;
  font-size: 11.5px;
  color: var(--c-text-4);
  transition: transform var(--dur-base) var(--ease-out);
}

.msg__cite-arrow.is-open {
  transform: rotate(90deg);
}

.msg__cite-body {
  margin-top: 9px;
  padding: 13px 15px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
  animation: citeIn 0.22s var(--ease-out);
}

@keyframes citeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.cite-item + .cite-item {
  margin-top: 11px;
  padding-top: 11px;
  border-top: 1px dashed var(--c-line-soft);
}

.cite-item__ref {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-primary-700);
  line-height: 1.55;
}

.cite-item__excerpt {
  margin: 6px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--c-bg-card);
  border-left: 3px solid var(--c-primary-600);
  font-size: 13px;
  line-height: 1.75;
  color: var(--c-text-2);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
}

.cite-item__score {
  margin-top: 5px;
  font-size: 12.5px;
  color: var(--c-text-4);
}

.cite-item__links {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.cite-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 11px;
  border-radius: var(--r-full);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  border: 1px solid var(--c-line);
  background: var(--c-bg-card);
  color: var(--c-text-2);
  transition: all var(--dur-fast);
}

.cite-link:hover {
  border-color: var(--c-primary-600);
  color: var(--c-primary-700);
  background: var(--c-primary-50, #eaf5ee);
}

.cite-link--baidu:hover {
  border-color: #2b6bd6;
  color: #2b6bd6;
  background: #eef4fe;
}

.cite-link--wenku:hover {
  border-color: #c2802b;
  color: #c2802b;
  background: #fdf6ec;
}

.msg__cite-note {
  margin-top: 9px;
  font-size: 12.5px;
  color: var(--c-text-4);
  line-height: 1.65;
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
  gap: 4px;
  padding: 4px 11px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
  font-size: 12.5px;
  color: var(--c-text-3);
}

.msg__tool:active {
  background: var(--c-primary-50);
  color: var(--c-primary-700);
}

.msg__fallback {
  font-size: 11.5px;
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
  font-size: 12.5px;
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
  font-size: 13px;
  color: var(--c-text-1);
}

.kb-panel__score {
  font-size: 12.5px;
  font-weight: 700;
  color: #b45309;
  flex-shrink: 0;
}

.kb-panel__sym {
  margin-top: 4px;
  font-size: 13.5px;
  line-height: 1.65;
  color: var(--c-text-3);
}

.kb-panel__note {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--c-text-4);
}

/* 快捷问题 */
.quick {
  padding: 4px 16px 12px;
  flex-shrink: 0;
}

.quick__title {
  font-size: 13px;
  color: var(--c-text-4);
  margin-bottom: 8px;
}

.quick__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 13px 16px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  font-size: 13.5px;
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
  align-items: flex-end;
  gap: 8px;
  padding: 6px 6px 6px 15px;
  border-radius: var(--r-lg);
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
  min-height: 44px;
  max-height: 112px;
  padding: 11px 0;
  font-size: 15px;
  line-height: 1.5;
  min-width: 0;
  resize: none;
  overflow-y: auto;
  background: transparent;
  border: none;
  outline: none;
  font-family: inherit;
  color: var(--c-text-1);
}

.composer__input::placeholder {
  color: var(--c-text-4);
}

.composer__send {
  width: 40px;
  height: 40px;
  margin-bottom: 2px;
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
  font-size: 12.5px;
  color: var(--c-text-4);
}
</style>

<style scoped>
@media (min-width: 960px) {
  .msg-list {
    max-width: 1020px;
    margin: 0 auto;
    width: 100%;
  }
  .crop-switch {
    justify-content: flex-start;
    max-width: 1020px;
    margin: 0 auto;
    width: 100%;
    border-radius: var(--r-lg);
    border: 1px solid var(--c-line-soft);
  }
  .quick {
    max-width: 1020px;
    margin: 0 auto;
    width: 100%;
  }
  .composer__box {
    max-width: 1020px;
    margin: 0 auto;
  }
  .msg--assistant .msg__bubble {
    font-size: 15.5px;
  }
}

/* 宽屏隐藏移动端顶栏（由横幅替代） */
@media (min-width: 960px) {
  .page-head.page-head {
    display: none;
  }
}

/* ===== RAG 检索增强面板 ===== */
.rag-panel {
  margin: 14px 16px 0;
  padding: 18px 18px 16px;
  border-radius: var(--r-lg);
  background: linear-gradient(160deg, #ffffff, #f2faf5 70%);
  border: 1px solid var(--c-primary-100);
  box-shadow: var(--sh-sm);
}

.rag-panel__intro {
  margin: 12px 16px 0;
  padding: 11px 13px;
  border-radius: 12px;
  background: var(--c-primary-50);
  font-size: 13px;
  line-height: 1.8;
  color: var(--c-primary-800);
}

.rag-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.rag-panel__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 15px;
  font-weight: 700;
  color: var(--c-primary-800);
}

.rag-panel__close {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
  transition: all var(--dur-fast);
}

.rag-panel__close:hover {
  color: var(--c-text-1);
  background: var(--c-bg-card);
}

/* 流水线 5 步 */
.rag-steps {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.rag-step {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 13px 8px 11px;
  text-align: center;
  border-radius: var(--r-md);
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid var(--c-line-soft);
  transition: all var(--dur-fast) var(--ease-out);
}

.rag-step:hover {
  transform: translateY(-2px);
  border-color: var(--c-primary-200);
  box-shadow: var(--sh-xs);
}

.rag-step__no {
  position: absolute;
  top: 7px;
  left: 8px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-primary-300);
}

.rag-step__icon {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(140deg, var(--c-primary-400), var(--c-primary-700));
  box-shadow: 0 3px 10px rgba(47, 152, 104, 0.28);
}

.rag-step strong {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-text-1);
}

.rag-step small {
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--c-text-3);
}

.rag-step__arrow {
  position: absolute;
  right: -10px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
  font-style: normal;
  font-size: 13px;
  color: var(--c-primary-400);
  font-weight: 700;
}

/* 实时检索演示 */
.rag-demo {
  padding: 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
}

.rag-demo__head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 10px;
}

.rag-demo__head strong { font-size: 13.5px; }
.rag-demo__head small { font-size: 12.5px; color: var(--c-text-4); }

.rag-demo__bar {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 6px 0 12px;
  height: 42px;
  border-radius: 12px;
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line);
  transition: border-color var(--dur-fast);
}

.rag-demo__bar:focus-within {
  border-color: var(--c-primary-400);
  background: #fff;
}

.rag-demo__icon { color: var(--c-text-4); flex-shrink: 0; }

.rag-demo__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--c-text-1);
}

.rag-demo__btn {
  height: 32px;
  padding: 0 18px;
  border-radius: 10px;
  font-size: 12.5px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  transition: opacity var(--dur-fast), transform var(--dur-fast);
}

.rag-demo__btn:disabled { opacity: 0.55; }
.rag-demo__btn:not(:disabled):hover { transform: translateY(-1px); }

.rag-demo__hits { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }

.rag-demo__empty {
  padding: 14px;
  text-align: center;
  font-size: 12.5px;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
  border-radius: var(--r-sm);
}

.rag-hit {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
}

.rag-hit__rank {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 7px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-100);
}

.rag-hit__main { flex: 1; min-width: 0; }

.rag-hit__name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text-1);
}

.rag-hit__name em {
  font-style: normal;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--c-text-3);
  padding: 1px 6px;
  border-radius: 6px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
}

.rag-hit__type { color: var(--c-primary-700) !important; }

.rag-hit__sym {
  margin-top: 2px;
  font-size: 11.5px;
  color: var(--c-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rag-hit__score {
  flex-shrink: 0;
  width: 96px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.rag-hit__pct { font-size: 12px; font-weight: 700; color: var(--c-primary-600); }

.rag-hit__bar {
  width: 100%;
  height: 5px;
  border-radius: 4px;
  background: var(--c-line-soft);
  overflow: hidden;
}

.rag-hit__bar i {
  display: block;
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--c-primary-300), var(--c-primary-600));
  transition: width 0.5s var(--ease-out);
}

.rag-demo__note {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
  font-size: 12.5px;
  color: var(--c-primary-700);
}

/* 面板出入场 */
.rag-slide-enter-active { transition: all 0.35s var(--ease-out); }
.rag-slide-leave-active { transition: all 0.25s var(--ease-out); }
.rag-slide-enter-from,
.rag-slide-leave-to { opacity: 0; transform: translateY(-10px); }

@media (max-width: 900px) {
  .rag-steps { grid-template-columns: repeat(2, 1fr); }
  .rag-step__arrow { display: none; }
}
</style>