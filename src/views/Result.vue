<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import ConfidenceRing from '@/components/ConfidenceRing.vue'
import api from '@/api'
import type { RecordItem, DiagnoseResponse } from '@/types'

const route = useRoute()
const router = useRouter()
const store = useAppStore()

const record = ref<RecordItem | null>(null)
const result = ref<DiagnoseResponse | null>(null)
const loading = ref(true)
const error = ref('')
const activeTab = ref<'diagnosis' | 'treatment' | 'trace'>('diagnosis')
const expandedIdx = ref(0)
const speaking = ref(false)

const top = computed(() => result.value?.diagnosis?.results?.[0] || null)
const gate = computed(() => result.value?.gate || null)
const treatment = computed(() => result.value?.treatment || null)
const trace = computed(() => result.value?.trace || [])

const urgencyMap: Record<string, { text: string; color: string; bg: string }> = {
  immediate: { text: '需立即处置', color: 'var(--c-danger)', bg: 'var(--c-danger-bg)' },
  within3days: { text: '3 天内处理', color: 'var(--c-accent-600)', bg: 'var(--c-accent-100)' },
  observe: { text: '可继续观察', color: 'var(--c-primary-600)', bg: 'var(--c-primary-50)' }
}

const gateTone = computed(() => {
  if (!gate.value) return null
  if (gate.value.decision === 'escalate') return { color: 'var(--c-danger)', bg: 'var(--c-danger-bg)' }
  return { color: 'var(--c-primary-600)', bg: 'var(--c-primary-50)' }
})

/** 语音播报：Web Speech API，优先选中文语音 */
const speak = (text: string) => {
  if (!('speechSynthesis' in window)) {
    store.showToast('当前浏览器不支持语音播报', 'error')
    return
  }
  if (speaking.value) {
    window.speechSynthesis.cancel()
    speaking.value = false
    return
  }
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'
  u.rate = 0.92
  u.pitch = 1.02
  const voices = window.speechSynthesis.getVoices()
  const zh = voices.find((v) => v.lang.includes('zh'))
  if (zh) u.voice = zh
  u.onend = () => (speaking.value = false)
  u.onerror = () => (speaking.value = false)
  speaking.value = true
  window.speechSynthesis.speak(u)
}

const broadcastText = computed(() => {
  if (!result.value || !top.value) return ''
  const t = treatment.value
  const parts = [
    `诊断结果：${result.value.cropName}，最可能是${top.value.name}，把握程度百分之${Math.round(top.value.confidence * 100)}。`,
    `主要依据：${top.value.symptomMatch.slice(0, 2).join('，')}。`,
    t?.summary ? `处置建议：${t.summary}。` : '',
    t?.chemicalPlan?.length
      ? `可用药剂包括${t.chemicalPlan.map((c) => c.chemical).join('、')}。请注意安全间隔期，采收前按时停药。`
      : '本情况无需使用杀菌剂，请按营养调控方案处理。'
  ]
  return parts.filter(Boolean).join('')
})

onMounted(async () => {
  const id = route.params.id as string
  try {
    // 优先使用内存中的最新结果（刚诊断完）
    const cached = store.restoreLastResult()
    if (cached && String(cached.recordId) === id) {
      result.value = cached
      loading.value = false
      // 同时拉取记录以获取完整字段
      try {
        record.value = await api.record(id)
      } catch {
        /* 不影响展示 */
      }
      return
    }
    const r = await api.record(id)
    record.value = r
    result.value = {
      cropId: r.cropId,
      cropName: r.cropName,
      diagnosis: r.diagnosis,
      gate: r.gate,
      treatment: r.treatment,
      validationViolations: [],
      kbSources: [],
      trace: r.trace || [],
      meta: {
        totalMs: r.meta?.totalMs ?? 0,
        usedFallback: r.meta?.usedFallback ?? false,
        aiConfigured: r.meta?.aiConfigured ?? true
      },
      recordId: r.id
    }
  } catch (err) {
    error.value = (err as Error).message || '无法加载诊断结果'
  } finally {
    loading.value = false
  }
})
/** 申请人工复核：推送给全部专家，处理结果私信到消息中心 */
const showReview = ref(false)
const reviewQ = ref('')
const reviewSending = ref(false)
const reviewDone = ref(false)
const reviewRecordId = computed(() => String(result.value?.recordId || record.value?.id || ''))

const openReview = () => {
  if (!store.user) {
    store.showToast('请先登录后再申请人工复核', 'error')
    router.push('/')
    return
  }
  reviewQ.value = ''
  reviewDone.value = false
  showReview.value = true
}

const submitReview = async () => {
  if (reviewSending.value || !reviewRecordId.value) return
  reviewSending.value = true
  try {
    await api.createReviewRequest({
      recordId: Number(reviewRecordId.value),
      cropId: result.value?.cropId || null,
      region: store.user?.region || '',
      question: reviewQ.value.trim()
    })
    reviewDone.value = true
    store.showToast('已提交人工复核，专家处理结果将在「我的消息」通知您', 'success')
  } catch (e: any) {
    store.showToast(e?.message || '提交失败', 'error')
  } finally {
    reviewSending.value = false
  }
}
</script>

<template>
  <div class="result">
    <header class="page-head">
      <button class="page-head__back" @click="router.push('/')">
        <AppIcon name="arrow-left" :size="20" />
      </button>
      <h1 class="page-head__title">诊断结果</h1>
      <button class="page-head__reset" @click="speak(broadcastText)" :disabled="!result">
        <AppIcon :name="speaking ? 'volume-off' : 'volume'" :size="17" />
      </button>
    </header>

    <!-- 加载 -->
    <div v-if="loading" class="state">
      <div class="state__spinner"></div>
      <p>加载诊断结果…</p>
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="state">
      <AppIcon name="alert" :size="34" style="color: var(--c-danger)" />
      <p>{{ error }}</p>
      <button class="btn btn--ghost" @click="router.back()">返回上一页</button>
      <button class="btn btn--ghost" @click="router.push('/archive')">去我的档案</button>
    </div>

    <template v-else-if="result">
      <!-- ===== 结果摘要卡 ===== -->
      <section class="summary">
        <div class="summary__glow"></div>

        <div class="summary__head">
          <div class="summary__crop">
            <span class="summary__crop-emoji">{{ store.crops.find((c) => c.id === result!.cropId)?.emoji || '🌿' }}</span>
            <div>
              <span class="summary__crop-name">{{ result.cropName }}</span>
              <span class="summary__time">{{ new Date(record?.createdAt || Date.now()).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span>
            </div>
          </div>
          <span v-if="top" class="summary__urgency" :style="{ color: urgencyMap[top.urgency].color, background: urgencyMap[top.urgency].bg }">
            {{ urgencyMap[top.urgency].text }}
          </span>
        </div>

        <div class="summary__main">
          <div class="summary__info">
            <p class="summary__label">最可能的结果</p>
            <h2 class="summary__disease">{{ top?.name }}</h2>
            <p class="summary__obs">{{ result.diagnosis.observations }}</p>
          </div>
          <ConfidenceRing v-if="top" :model-value="top.confidence" :level="top.confidenceLevel" size="lg" />
        </div>

        <!-- 安全警示 -->
        <div v-if="gate && gate.flags.length" class="summary__flags">
          <div
            v-for="(f, i) in gate.flags"
            :key="i"
            class="flag"
            :class="`flag--${f.level}`"
          >
            <AppIcon :name="f.level === 'critical' ? 'alert-octagon' : f.level === 'warning' ? 'alert' : 'info'" :size="14" />
            <span>{{ f.message }}</span>
          </div>
        </div>
      </section>

      <!-- ===== 标签切换 ===== -->
      <nav class="tabs">
        <button
          v-for="t in [
            { k: 'diagnosis', label: '诊断依据', icon: 'search' },
            { k: 'treatment', label: '防治方案', icon: 'flask' },
            { k: 'trace', label: 'AI 过程', icon: 'cpu' }
          ]"
          :key="t.k"
          class="tabs__item"
          :class="{ 'is-active': activeTab === t.k }"
          @click="activeTab = t.k as any"
        >
          <AppIcon :name="t.icon" :size="15" />
          {{ t.label }}
        </button>
      </nav>

      <!-- ===== Tab: 诊断依据 ===== -->
      <div v-if="activeTab === 'diagnosis'" class="panel">
        <div v-for="(r, i) in result.diagnosis.results" :key="i" class="diag-item" :class="{ 'is-open': expandedIdx === i }">
          <button class="diag-item__head" @click="expandedIdx = expandedIdx === i ? -1 : i">
            <span class="diag-item__rank" :class="{ 'is-top': i === 0 }">{{ i + 1 }}</span>
            <div class="diag-item__title">
              <div class="diag-item__name-row">
                <strong>{{ r.name }}</strong>
                <span v-if="!r.inKnowledgeBase" class="diag-item__badge">知识库外</span>
              </div>
              <div class="diag-item__bar">
                <div class="diag-item__bar-fill" :class="`is-${r.confidenceLevel}`" :style="{ width: `${r.confidence * 100}%` }"></div>
              </div>
            </div>
            <span class="diag-item__pct" :class="`is-${r.confidenceLevel}`">{{ Math.round(r.confidence * 100) }}%</span>
            <AppIcon name="arrow-right" :size="15" class="diag-item__chevron" :class="{ 'is-open': expandedIdx === i }" />
          </button>

          <div v-show="expandedIdx === i" class="diag-item__body">
            <div v-if="r.symptomMatch.length" class="diag-block">
              <p class="diag-block__label"><AppIcon name="check-circle" :size="12" /> 与你描述吻合的症状</p>
              <ul class="diag-block__list">
                <li v-for="(s, j) in r.symptomMatch" :key="j">{{ s }}</li>
              </ul>
            </div>
            <div v-if="r.differential" class="diag-block">
              <p class="diag-block__label"><AppIcon name="info" :size="12" /> 与其他病害的区别</p>
              <p class="diag-block__text">{{ r.differential }}</p>
            </div>
          </div>
        </div>

        <!-- 观察到的其他细节 -->
        <div v-if="result.diagnosis.noticed.length" class="note-card">
          <p class="note-card__title"><AppIcon name="sparkle" :size="14" /> AI 还注意到</p>
          <ul>
            <li v-for="(n, i) in result.diagnosis.noticed" :key="i">{{ n }}</li>
          </ul>
        </div>

        <!-- 需要补充信息 -->
        <div v-if="result.diagnosis.needMoreInfo" class="note-card note-card--amber">
          <p class="note-card__title"><AppIcon name="alert" :size="14" /> 判断依据不足</p>
          <p class="note-card__text">{{ result.diagnosis.needMoreInfo }}</p>
        </div>

        <!-- 知识库来源 -->
        <div v-if="result.kbSources?.length" class="kb-source">
          <p class="kb-source__title"><AppIcon name="database" :size="13" /> 知识库检索来源</p>
          <div class="kb-source__list">
            <span v-for="s in result.kbSources" :key="s.name" class="kb-source__chip">
              {{ s.name }}
              <i>{{ Math.round(s.score * 100) }}%</i>
            </span>
          </div>
        </div>
      </div>

      <!-- ===== Tab: 防治方案 ===== -->
      <div v-if="activeTab === 'treatment'" class="panel">
        <!-- 策略摘要 -->
        <div class="treat-summary">
          <AppIcon name="leaf" :size="18" />
          <p>{{ treatment?.summary }}</p>
        </div>

        <!-- 立即行动 -->
        <div v-if="treatment?.immediateActions?.length" class="treat-section">
          <h3 class="treat-section__title">
            <span class="treat-section__num">1</span>
            立即要做的事
          </h3>
          <div class="action-list">
            <div v-for="a in treatment.immediateActions" :key="a.step" class="action">
              <span class="action__step">{{ a.step }}</span>
              <div class="action__body">
                <strong>{{ a.action }}</strong>
                <p>{{ a.detail }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 非化学措施 -->
        <div v-if="treatment?.nonChemical?.length" class="treat-section">
          <h3 class="treat-section__title">
            <span class="treat-section__num">2</span>
            农业与物理防治
            <span class="treat-section__hint">优先于化学药剂</span>
          </h3>
          <div class="measure-list">
            <div v-for="(m, i) in treatment.nonChemical" :key="i" class="measure">
              <span class="measure__tag">{{ m.type }}</span>
              <div class="measure__body">
                <strong>{{ m.measure }}</strong>
                <p>{{ m.detail }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 化学防治 -->
        <div v-if="treatment?.chemicalPlan?.length" class="treat-section">
          <h3 class="treat-section__title">
            <span class="treat-section__num">3</span>
            药剂使用方案
          </h3>
          <div class="chem-list">
            <div v-for="(c, i) in treatment.chemicalPlan" :key="i" class="chem">
              <div class="chem__head">
                <strong class="chem__name">{{ c.chemical }}</strong>
                <span class="chem__target">针对 {{ c.targetDisease }}</span>
              </div>
              <dl class="chem__grid">
                <div><dt>剂型/用量</dt><dd>{{ c.dosage }}</dd></div>
                <div><dt>施药方式</dt><dd>{{ c.method }}</dd></div>
                <div><dt>频次</dt><dd>{{ c.frequency }}</dd></div>
              </dl>
              <div class="chem__safe">
                <AppIcon name="clock" :size="13" />
                <span>{{ c.safeInterval }}</span>
              </div>
              <div v-if="c.avoidMix" class="chem__avoid">
                <AppIcon name="alert" :size="13" />
                <span>{{ c.avoidMix }}</span>
              </div>
              <p v-if="c.caution" class="chem__caution">{{ c.caution }}</p>
            </div>
          </div>
        </div>

        <!-- 生理性病害说明 -->
        <div v-if="result.diagnosis.isPhysiological" class="note-card note-card--amber">
          <p class="note-card__title"><AppIcon name="info" :size="14" /> 这是生理性病害</p>
          <p class="note-card__text">
            不需要打杀菌剂。请按上面的营养调控方案处理，避免无效用药和农药残留风险。
          </p>
        </div>

        <!-- 安全警示 -->
        <div v-if="treatment?.safetyWarnings?.length" class="safety">
          <h3 class="safety__title"><AppIcon name="shield" :size="15" /> 安全提醒</h3>
          <ul>
            <li v-for="(w, i) in treatment.safetyWarnings" :key="i">{{ w }}</li>
          </ul>
        </div>

        <!-- 复诊 -->
        <div v-if="treatment?.followUp" class="follow-up">
          <AppIcon name="clock" :size="15" />
          <div>
            <strong>何时复诊</strong>
            <p>{{ treatment.followUp }}</p>
          </div>
        </div>

        <!-- 建议找专家 -->
        <div v-if="treatment?.needExpert" class="expert">
          <AppIcon name="user" :size="17" />
          <div>
            <strong>建议联系当地农技站</strong>
            <p>本情况较为复杂或风险较高，专业人员的现场判断更可靠</p>
          </div>
        </div>
      </div>

      <!-- ===== Tab: AI 过程 ===== -->
      <div v-if="activeTab === 'trace'" class="panel">
        <div class="trace-head">
          <div class="trace-head__item">
            <span class="trace-head__num">{{ result.meta?.totalMs || 0 }}</span>
            <span class="trace-head__label">总耗时 ms</span>
          </div>
          <div class="trace-head__divider"></div>
          <div class="trace-head__item">
            <span class="trace-head__num">{{ trace.length - 1 }}</span>
            <span class="trace-head__label">处理环节</span>
          </div>
          <div class="trace-head__divider"></div>
          <div class="trace-head__item">
            <span class="trace-head__num" :class="{ 'is-warn': result.meta?.usedFallback }">
              {{ result.meta?.usedFallback ? '降级' : '正常' }}
            </span>
            <span class="trace-head__label">运行状态</span>
          </div>
        </div>

        <div class="timeline">
          <div v-for="(t, i) in trace" :key="i" class="tl-item" :class="`is-${t.status}`">
            <div class="tl-item__dot"></div>
            <div class="tl-item__content">
              <div class="tl-item__head">
                <strong>{{ t.agent }}</strong>
                <span class="tl-item__ms">{{ t.durationMs }}ms</span>
              </div>
              <p class="tl-item__detail">{{ t.detail }}</p>
              <span class="tl-item__status" :class="`is-${t.status}`">
                {{ t.status === 'success' ? '成功' : t.status === 'fallback' ? '降级运行' : t.status === 'escalate' ? '转人工' : t.status }}
              </span>
            </div>
          </div>
        </div>

        <div class="trace-note">
          <AppIcon name="info" :size="13" />
          <span>
            本系统采用「初诊 Agent → 安全闸门 → 用药指导 Agent」三级工作流。
            每一环节的结构化输出都会经过规则校验，低置信度结果自动转人工复核。
          </span>
        </div>
      </div>

      <!-- ===== 底部操作 ===== -->
      <div class="actions">
        <button class="btn btn--outline" @click="router.push('/diagnose')">
          <AppIcon name="camera" :size="17" /> 再诊断一次
        </button>
        <button class="btn btn--primary" style="flex: 1" @click="router.push('/qa')">
          <AppIcon name="chat" :size="17" /> 还有疑问？问 AI
        </button>
        <button class="btn btn--outline" style="flex: 1" @click="openReview">
          <AppIcon name="user" :size="17" /> 申请人工复核
        </button>
      </div>

      <!-- 人工复核弹层 -->
      <Teleport to="body">
        <Transition name="fade">
          <div v-if="showReview" class="review-mask" @click.self="showReview = false">
            <div class="review-dialog">
              <header class="review-dialog__head">
                <strong>{{ reviewDone ? '复核已提交' : '申请人工复核' }}</strong>
                <button class="review-dialog__close" @click="showReview = false"><AppIcon name="x" :size="14" /></button>
              </header>
              <template v-if="!reviewDone">
                <p class="review-dialog__sub">
                  诊断记录 #{{ reviewRecordId }} · {{ result?.cropName || '' }}<br />
                  专家将在人工复核后把结论私信到您的「我的消息」
                </p>
                <textarea
                  v-model="reviewQ"
                  rows="4"
                  maxlength="300"
                  class="review-dialog__input"
                  placeholder="补充说明：如发病面积、用药史、照片拍不清的细节…（选填）"
                />
                <button class="review-dialog__btn" :disabled="reviewSending" @click="submitReview">
                  {{ reviewSending ? '提交中…' : '提交复核请求' }}
                </button>
              </template>
              <div v-else class="review-dialog__done">
                <AppIcon name="check-circle" :size="32" />
                <p>已推送给全部驻点专家，请留意消息中心通知</p>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <p class="disclaimer">
        <AppIcon name="alert" :size="12" />
        AI 诊断仅供参考，不替代专业农技人员指导。用药请遵循农药标签与当地农技部门要求。
      </p>
    </template>
  </div>
</template>

<style scoped>
.result {
  min-height: 100dvh;
  background: var(--c-bg-page);
  padding-bottom: 24px;
}

.page-head {
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--c-line-soft);
  position: sticky;
  top: 0;
  z-index: 30;
}

.page-head__back,
.page-head__reset {
  width: 38px;
  height: 38px;
  border-radius: var(--r-sm);
  display: grid;
  place-items: center;
  color: var(--c-text-2);
}

.page-head__back:active,
.page-head__reset:active {
  background: var(--c-line-soft);
}

.page-head__reset:disabled {
  opacity: 0.35;
}

.page-head__title {
  font-size: 16.5px;
  font-weight: 700;
}

/* 状态 */
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 80px 30px;
  color: var(--c-text-3);
  font-size: 13.5px;
  text-align: center;
}

.state__spinner {
  width: 30px;
  height: 30px;
  border: 2.5px solid var(--c-primary-100);
  border-top-color: var(--c-primary-500);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ===== 摘要卡 ===== */
.summary {
  position: relative;
  margin: 14px 16px 0;
  padding: 16px 16px 15px;
  border-radius: var(--r-xl);
  background: linear-gradient(160deg, #ffffff 0%, #f8fcf9 100%);
  border: 1px solid var(--c-primary-100);
  box-shadow: 0 8px 30px rgba(47, 152, 104, 0.09);
  overflow: hidden;
}

.summary__glow {
  position: absolute;
  top: -50px;
  right: -40px;
  width: 150px;
  height: 150px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(85, 180, 133, 0.16), transparent 68%);
  pointer-events: none;
}

.summary__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
  position: relative;
}

.summary__crop {
  display: flex;
  align-items: center;
  gap: 9px;
}

.summary__crop-emoji {
  font-size: 22px;
  line-height: 1;
}

.summary__crop > div {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.summary__crop-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text-1);
}

.summary__time {
  font-size: 10.5px;
  color: var(--c-text-4);
  font-variant-numeric: tabular-nums;
}

.summary__urgency {
  padding: 4px 10px;
  border-radius: var(--r-full);
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.summary__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  position: relative;
}

.summary__info {
  flex: 1;
  min-width: 0;
}

.summary__label {
  font-size: 11px;
  color: var(--c-text-4);
  margin-bottom: 3px;
  letter-spacing: 0.3px;
}

.summary__disease {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.4px;
  color: var(--c-primary-800);
  margin-bottom: 7px;
  line-height: 1.25;
}

.summary__obs {
  font-size: 12px;
  line-height: 1.7;
  color: var(--c-text-3);
}

.summary__flags {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 14px;
  padding-top: 13px;
  border-top: 1px dashed var(--c-line);
}

.flag {
  display: flex;
  gap: 8px;
  padding: 9px 11px;
  border-radius: var(--r-sm);
  font-size: 11.5px;
  line-height: 1.6;
  align-items: flex-start;
}

.flag :deep(.icon) {
  flex-shrink: 0;
  margin-top: 1px;
}

.flag--critical {
  background: var(--c-danger-bg);
  color: #b91c1c;
  font-weight: 600;
}

.flag--warning {
  background: var(--c-warning-bg);
  color: #92400e;
}

.flag--info {
  background: var(--c-info-bg);
  color: #1e40af;
}

/* ===== Tabs ===== */
.tabs {
  display: flex;
  gap: 6px;
  margin: 16px 16px 0;
  padding: 4px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
}

.tabs__item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 36px;
  border-radius: var(--r-full);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--c-text-3);
  transition: all var(--dur-base) var(--ease-out);
}

.tabs__item.is-active {
  background: var(--c-bg-card);
  color: var(--c-primary-700);
  box-shadow: var(--sh-xs);
}

/* ===== Panel ===== */
.panel {
  padding: 14px 16px 0;
}

/* 诊断项 */
.diag-item {
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  margin-bottom: 9px;
  overflow: hidden;
  transition: box-shadow var(--dur-base);
}

.diag-item.is-open {
  box-shadow: var(--sh-sm);
  border-color: var(--c-primary-200);
}

.diag-item__head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 14px;
  text-align: left;
}

.diag-item__rank {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  background: var(--c-bg-muted);
  color: var(--c-text-3);
  font-size: 11.5px;
  font-weight: 700;
  flex-shrink: 0;
}

.diag-item__rank.is-top {
  background: linear-gradient(140deg, var(--c-primary-400), var(--c-primary-600));
  color: #fff;
}

.diag-item__title {
  flex: 1;
  min-width: 0;
}

.diag-item__name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.diag-item__name-row strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--c-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diag-item__badge {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--c-warning-bg);
  color: #92400e;
  font-size: 9.5px;
  font-weight: 700;
  flex-shrink: 0;
}

.diag-item__bar {
  height: 4px;
  border-radius: 2px;
  background: var(--c-line-soft);
  overflow: hidden;
}

.diag-item__bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 800ms var(--ease-out);
}

.diag-item__bar-fill.is-high {
  background: linear-gradient(90deg, var(--c-primary-400), var(--c-primary-600));
}
.diag-item__bar-fill.is-medium {
  background: linear-gradient(90deg, #fbbf24, #f59e0b);
}
.diag-item__bar-fill.is-low {
  background: linear-gradient(90deg, #f87171, #ef4444);
}

.diag-item__pct {
  font-family: var(--font-num);
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
  min-width: 38px;
  text-align: right;
}

.diag-item__pct.is-high {
  color: var(--c-primary-600);
}
.diag-item__pct.is-medium {
  color: var(--c-accent-500);
}
.diag-item__pct.is-low {
  color: var(--c-danger);
}

.diag-item__chevron {
  color: var(--c-text-4);
  transition: transform var(--dur-base) var(--ease-out);
  flex-shrink: 0;
}

.diag-item__chevron.is-open {
  transform: rotate(90deg);
}

.diag-item__body {
  padding: 0 14px 14px 46px;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.diag-block__label {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-primary-700);
  margin-bottom: 6px;
}

.diag-block__list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.diag-block__list li {
  position: relative;
  padding-left: 12px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--c-text-2);
}

.diag-block__list li::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 8px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--c-primary-400);
}

.diag-block__text {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--c-text-2);
}

/* 备注卡 */
.note-card {
  padding: 13px 14px;
  border-radius: var(--r-md);
  background: var(--c-info-bg);
  margin-bottom: 10px;
}

.note-card--amber {
  background: var(--c-warning-bg);
}

.note-card__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 700;
  color: #1e40af;
  margin-bottom: 7px;
}

.note-card--amber .note-card__title {
  color: #92400e;
}

.note-card ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.note-card li {
  position: relative;
  padding-left: 12px;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--c-text-2);
}

.note-card li::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 8px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--c-info);
}

.note-card__text {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--c-text-2);
}

/* 知识库来源 */
.kb-source {
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-muted);
  border: 1px dashed var(--c-line);
}

.kb-source__title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-text-3);
  margin-bottom: 8px;
}

.kb-source__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.kb-source__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: var(--r-full);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line);
  font-size: 11px;
  color: var(--c-text-2);
}

.kb-source__chip i {
  font-style: normal;
  font-size: 10px;
  color: var(--c-primary-600);
  font-weight: 700;
}

/* ===== 防治方案 ===== */
.treat-summary {
  display: flex;
  gap: 10px;
  padding: 14px;
  border-radius: var(--r-md);
  background: linear-gradient(135deg, var(--c-primary-50), var(--c-primary-100));
  border: 1px solid var(--c-primary-200);
  margin-bottom: 18px;
  align-items: flex-start;
}

.treat-summary :deep(.icon) {
  color: var(--c-primary-600);
  flex-shrink: 0;
  margin-top: 1px;
}

.treat-summary p {
  font-size: 13px;
  line-height: 1.7;
  font-weight: 600;
  color: var(--c-primary-800);
}

.treat-section {
  margin-bottom: 20px;
}

.treat-section__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 11px;
  color: var(--c-text-1);
}

.treat-section__num {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: var(--c-primary-600);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.treat-section__hint {
  font-size: 10.5px;
  font-weight: 400;
  color: var(--c-primary-600);
  background: var(--c-primary-50);
  padding: 2px 7px;
  border-radius: 4px;
}

/* 行动项 */
.action-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action {
  display: flex;
  gap: 11px;
  padding: 13px 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
}

.action__step {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--c-danger-bg);
  color: var(--c-danger);
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.action__body strong {
  display: block;
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 3px;
}

.action__body p {
  font-size: 12px;
  line-height: 1.65;
  color: var(--c-text-3);
}

/* 措施 */
.measure-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.measure {
  display: flex;
  gap: 10px;
  padding: 12px 13px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
}

.measure__tag {
  padding: 2px 8px;
  height: fit-content;
  border-radius: 5px;
  background: var(--c-primary-50);
  color: var(--c-primary-700);
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
  flex-shrink: 0;
}

.measure__body strong {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  margin-bottom: 2px;
}

.measure__body p {
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--c-text-3);
}

/* 化学方案 */
.chem-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chem {
  padding: 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line);
  box-shadow: var(--sh-xs);
}

.chem__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 11px;
}

.chem__name {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--c-text-1);
}

.chem__target {
  font-size: 10.5px;
  padding: 2px 8px;
  border-radius: var(--r-full);
  background: var(--c-accent-100);
  color: var(--c-accent-600);
  font-weight: 600;
  white-space: nowrap;
}

.chem__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  margin-bottom: 10px;
}

.chem__grid > div:last-child {
  grid-column: span 2;
}

.chem__grid dt {
  font-size: 10.5px;
  color: var(--c-text-4);
  margin-bottom: 1px;
}

.chem__grid dd {
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-1);
  line-height: 1.5;
}

.chem__safe,
.chem__avoid {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--r-xs);
  font-size: 11.5px;
  line-height: 1.55;
  margin-bottom: 6px;
}

.chem__safe {
  background: var(--c-primary-50);
  color: var(--c-primary-800);
}

.chem__safe :deep(.icon) {
  color: var(--c-primary-600);
  flex-shrink: 0;
  margin-top: 1px;
}

.chem__avoid {
  background: var(--c-warning-bg);
  color: #92400e;
  margin-bottom: 0;
}

.chem__avoid :deep(.icon) {
  flex-shrink: 0;
  margin-top: 1px;
}

.chem__caution {
  margin-top: 7px;
  padding-top: 7px;
  border-top: 1px dashed var(--c-line);
  font-size: 11px;
  line-height: 1.6;
  color: var(--c-text-3);
}

/* 安全警示 */
.safety {
  padding: 14px;
  border-radius: var(--r-md);
  background: var(--c-warning-bg);
  border: 1px solid #fde68a;
  margin-bottom: 14px;
}

.safety__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #92400e;
  margin-bottom: 9px;
}

.safety ul {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.safety li {
  position: relative;
  padding-left: 13px;
  font-size: 12px;
  line-height: 1.65;
  color: #78350f;
}

.safety li::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 7px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--c-warning);
}

/* 复诊 */
.follow-up {
  display: flex;
  gap: 10px;
  padding: 13px 14px;
  border-radius: var(--r-md);
  background: var(--c-info-bg);
  margin-bottom: 12px;
  align-items: flex-start;
}

.follow-up :deep(.icon) {
  color: var(--c-info);
  flex-shrink: 0;
  margin-top: 2px;
}

.follow-up strong {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  color: #1e40af;
  margin-bottom: 3px;
}

.follow-up p {
  font-size: 12px;
  line-height: 1.65;
  color: #1e3a8a;
}

/* 专家 */
.expert {
  display: flex;
  gap: 11px;
  padding: 14px;
  border-radius: var(--r-md);
  background: linear-gradient(135deg, #fef2f2, #fff5f5);
  border: 1px solid #fecaca;
  align-items: flex-start;
}

.expert :deep(.icon) {
  color: var(--c-danger);
  flex-shrink: 0;
  margin-top: 2px;
}

.expert strong {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: #991b1b;
  margin-bottom: 3px;
}

.expert p {
  font-size: 11.5px;
  line-height: 1.65;
  color: #b91c1c;
}

/* ===== AI 过程 ===== */
.trace-head {
  display: flex;
  align-items: center;
  padding: 15px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  margin-bottom: 16px;
}

.trace-head__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.trace-head__num {
  font-family: var(--font-num);
  font-size: 19px;
  font-weight: 700;
  color: var(--c-primary-700);
}

.trace-head__num.is-warn {
  color: var(--c-accent-500);
  font-size: 16px;
}

.trace-head__label {
  font-size: 10px;
  color: var(--c-text-4);
}

.trace-head__divider {
  width: 1px;
  height: 26px;
  background: var(--c-line);
}

.timeline {
  position: relative;
  padding-left: 20px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: linear-gradient(var(--c-primary-200), var(--c-line-soft));
}

.tl-item {
  position: relative;
  margin-bottom: 12px;
}

.tl-item__dot {
  position: absolute;
  left: -20px;
  top: 6px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--c-bg-card);
  border: 2.5px solid var(--c-primary-400);
}

.tl-item.is-fallback .tl-item__dot {
  border-color: var(--c-accent-500);
}
.tl-item.is-escalate .tl-item__dot {
  border-color: var(--c-danger);
}
.tl-item.is-success:last-child .tl-item__dot {
  border-color: var(--c-primary-600);
  background: var(--c-primary-600);
}

.tl-item__content {
  padding: 11px 13px;
  border-radius: var(--r-sm);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
}

.tl-item__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 3px;
}

.tl-item__head strong {
  font-size: 12.5px;
  font-weight: 700;
}

.tl-item__ms {
  font-family: var(--font-num);
  font-size: 11px;
  color: var(--c-text-4);
}

.tl-item__detail {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--c-text-3);
  margin-bottom: 6px;
}

.tl-item__status {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 9.5px;
  font-weight: 700;
  background: var(--c-primary-50);
  color: var(--c-primary-700);
}

.tl-item__status.is-fallback {
  background: var(--c-warning-bg);
  color: #92400e;
}

.tl-item__status.is-escalate {
  background: var(--c-danger-bg);
  color: #b91c1c;
}

.trace-note {
  display: flex;
  gap: 8px;
  padding: 11px 13px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
  border: 1px dashed var(--c-line);
  font-size: 11px;
  line-height: 1.7;
  color: var(--c-text-3);
  margin-top: 6px;
}

.trace-note :deep(.icon) {
  flex-shrink: 0;
  margin-top: 2px;
}

/* 底部 */
.actions {
  display: flex;
  gap: 10px;
  padding: 20px 16px 0;
}

.disclaimer {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 5px;
  padding: 14px 24px 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--c-text-4);
  text-align: center;
}

.disclaimer :deep(.icon) {
  flex-shrink: 0;
  margin-top: 2px;
}
</style>

<style scoped>
@media (min-width: 960px) {
  .summary {
    max-width: 820px;
    margin-left: auto;
    margin-right: auto;
    width: calc(100% - 64px);
  }
  .tabs {
    max-width: 820px;
    margin: 18px auto 0;
    width: calc(100% - 64px);
  }
  .panel {
    max-width: 820px;
    margin: 0 auto;
    padding-left: 0;
    padding-right: 0;
    width: calc(100% - 64px);
  }
  .actions {
    max-width: 820px;
    margin: 0 auto;
    padding: 22px 0 0;
    width: calc(100% - 64px);
  }
}
</style>

<style scoped>
/* 人工复核弹层 */
.review-mask {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(14, 30, 22, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.review-dialog {
  width: min(480px, 100%);
  background: var(--c-bg-page);
  border-radius: var(--r-xl);
  padding: 18px;
}

.review-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.review-dialog__head strong {
  font-size: 15.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.review-dialog__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--c-bg-muted);
  color: var(--c-text-3);
}

.review-dialog__sub {
  font-size: 12px;
  line-height: 1.8;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.review-dialog__input {
  width: 100%;
  padding: 11px 13px;
  border-radius: 12px;
  border: 1px solid var(--c-line);
  background: var(--c-bg-card);
  font-size: 13px;
  line-height: 1.7;
  color: var(--c-text-1);
  resize: vertical;
  font-family: inherit;
}

.review-dialog__input:focus {
  outline: none;
  border-color: var(--c-primary-500);
}

.review-dialog__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 40px;
  margin-top: 12px;
  border-radius: var(--r-full);
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: var(--c-primary-600);
  border: none;
}

.review-dialog__btn:disabled {
  opacity: 0.5;
}

.review-dialog__done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 18px 0 6px;
  color: var(--c-primary-600);
  font-size: 13.5px;
  font-weight: 700;
  text-align: center;
}
</style>
