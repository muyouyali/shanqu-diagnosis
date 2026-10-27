<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'

const route = useRoute()
const router = useRouter()
const disease = ref<any>(null)
const loading = ref(true)
const speaking = ref(false)

const cropName = computed(() => {
  const map: Record<string, string> = { sanqi: '文山三七', blueberry: '高原蓝莓', citrus: '柑橘' }
  return map[disease.value?.cropId] || ''
})

const severityMeta: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: '毁灭性病害', color: '#b91c1c', bg: '#fee2e2' },
  high: { label: '高发病害', color: '#c2410c', bg: '#ffedd5' },
  medium: { label: '中等风险', color: '#a16207', bg: '#fef9c3' },
  low: { label: '低风险', color: '#15803d', bg: '#dcfce7' }
}

onMounted(async () => {
  const id = route.params.diseaseId as string
  // 从作物列表里定位（避免额外接口）
  const crops = await api.crops().catch(() => [])
  for (const c of crops as any[]) {
    const list = await api.diseases(c.id).catch(() => [])
    const found = (list as any[]).find((d) => d.id === id)
    if (found) {
      disease.value = found
      break
    }
  }
  loading.value = false
})

const broadcast = () => {
  if (!disease.value) return
  if (!('speechSynthesis' in window)) return
  if (speaking.value) {
    window.speechSynthesis.cancel()
    speaking.value = false
    return
  }
  const d = disease.value
  const text = `${d.name}，${d.type}。典型症状：${d.symptoms.slice(0, 3).join('。')}。防治措施：${d.treatment.slice(0, 3).join('。')}。安全提示：${d.safetyNote}`
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'
  u.rate = 0.92
  const zh = window.speechSynthesis.getVoices().find((v) => v.lang.includes('zh'))
  if (zh) u.voice = zh
  u.onend = () => (speaking.value = false)
  speaking.value = true
  window.speechSynthesis.speak(u)
}
</script>

<template>
  <div class="detail">
    <header class="page-head">
      <button class="page-head__back" @click="router.back()">
        <AppIcon name="arrow-left" :size="20" />
      </button>
      <h1 class="page-head__title">病害详情</h1>
      <button class="page-head__action" @click="broadcast" :disabled="!disease">
        <AppIcon :name="speaking ? 'volume-off' : 'volume'" :size="17" />
      </button>
    </header>

    <div v-if="loading" class="loading">
      <div class="loading__spinner"></div>
    </div>

    <template v-else-if="disease">
      <!-- 头部 -->
      <section class="hero">
        <div class="hero__row">
          <span
            class="hero__severity"
            :style="{ color: severityMeta[disease.severity].color, background: severityMeta[disease.severity].bg }"
          >
            {{ severityMeta[disease.severity].label }}
          </span>
          <span class="hero__crop">{{ cropName }}</span>
        </div>
        <h2 class="hero__name">{{ disease.name }}</h2>
        <p v-if="disease.alias" class="hero__alias">俗称：{{ disease.alias }}</p>
        <div class="hero__meta">
          <span class="hero__tag">{{ disease.type }}</span>
          <span class="hero__pathogen">{{ disease.pathogen }}</span>
        </div>
      </section>

      <!-- 症状关键词 -->
      <section class="block">
        <h3 class="block__title">
          <AppIcon name="search" :size="15" />
          快速识别要点
        </h3>
        <div class="keywords">
          <span v-for="k in disease.symptomKeywords" :key="k" class="keyword">{{ k }}</span>
        </div>
      </section>

      <!-- 典型症状 -->
      <section class="block">
        <h3 class="block__title">
          <AppIcon name="leaf" :size="15" />
          典型症状
        </h3>
        <ul class="num-list">
          <li v-for="(s, i) in disease.symptoms" :key="i">
            <span class="num-list__idx">{{ i + 1 }}</span>
            <p>{{ s }}</p>
          </li>
        </ul>
      </section>

      <!-- 发病原因 -->
      <section class="block">
        <h3 class="block__title">
          <AppIcon name="cloud" :size="15" />
          发病原因
        </h3>
        <ul class="dot-list">
          <li v-for="(c, i) in disease.causes" :key="i">{{ c }}</li>
        </ul>
      </section>

      <!-- 防治措施 -->
      <section class="block">
        <h3 class="block__title">
          <AppIcon name="flask" :size="15" />
          防治措施
        </h3>
        <ul class="step-list">
          <li v-for="(t, i) in disease.treatment" :key="i">
            <span class="step-list__idx">{{ i + 1 }}</span>
            <p>{{ t }}</p>
          </li>
        </ul>
      </section>

      <!-- 预防 -->
      <section class="block">
        <h3 class="block__title">
          <AppIcon name="shield" :size="15" />
          预防要点
        </h3>
        <ul class="dot-list dot-list--green">
          <li v-for="(p, i) in disease.prevention" :key="i">{{ p }}</li>
        </ul>
      </section>

      <!-- 安全提示 -->
      <div class="safety">
        <div class="safety__head">
          <AppIcon name="alert" :size="15" />
          <strong>安全提示</strong>
        </div>
        <p>{{ disease.safetyNote }}</p>
      </div>

      <!-- 参考文献 -->
      <section class="refs">
        <h4 class="refs__title">资料来源</h4>
        <ul>
          <li v-for="(r, i) in disease.references" :key="i">{{ r }}</li>
        </ul>
      </section>

      <!-- 行动按钮 -->
      <div class="cta">
        <button class="btn btn--primary btn--block" @click="router.push('/diagnose')">
          <AppIcon name="camera" :size="17" />
          我的作物有这些症状，去诊断
        </button>
      </div>

      <p class="disclaimer">
        以上内容整理自公开植保技术资料，仅供学习参考<br />
        实际用药请遵循农药标签登记范围与当地农技部门指导
      </p>
    </template>
  </div>
</template>

<style scoped>
.detail {
  min-height: 100dvh;
  padding-bottom: 28px;
  background: var(--c-bg-page);
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
.page-head__action {
  width: 38px;
  height: 38px;
  border-radius: var(--r-sm);
  display: grid;
  place-items: center;
  color: var(--c-text-2);
}

.page-head__action:disabled {
  opacity: 0.35;
}

.page-head__title {
  font-size: 16px;
  font-weight: 700;
}

.loading {
  display: grid;
  place-items: center;
  padding: 100px 0;
}

.loading__spinner {
  width: 28px;
  height: 28px;
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

/* Hero */
.hero {
  margin: 14px 16px 0;
  padding: 18px 16px;
  border-radius: var(--r-xl);
  background: linear-gradient(160deg, #ffffff, #f8fcfa);
  border: 1px solid var(--c-primary-100);
  box-shadow: 0 6px 24px rgba(47, 152, 104, 0.07);
}

.hero__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
}

.hero__severity {
  padding: 3px 9px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 700;
}

.hero__crop {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.hero__name {
  font-size: 23px;
  font-weight: 800;
  letter-spacing: -0.4px;
  line-height: 1.3;
  margin-bottom: 4px;
  color: var(--c-primary-900);
}

.hero__alias {
  font-size: 12px;
  color: var(--c-accent-600);
  margin-bottom: 10px;
}

.hero__meta {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.hero__tag {
  display: inline-block;
  width: fit-content;
  padding: 2px 9px;
  border-radius: var(--r-full);
  background: var(--c-primary-50);
  color: var(--c-primary-700);
  font-size: 10.5px;
  font-weight: 600;
}

.hero__pathogen {
  font-size: 10.5px;
  color: var(--c-text-4);
  font-style: italic;
  line-height: 1.5;
}

/* 区块 */
.block {
  margin: 16px 16px 0;
  padding: 15px 16px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.block__title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 700;
  margin-bottom: 12px;
  color: var(--c-text-1);
}

.block__title :deep(.icon) {
  color: var(--c-primary-500);
}

/* 关键词 */
.keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.keyword {
  padding: 4px 11px;
  border-radius: var(--r-full);
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-100);
  color: var(--c-primary-800);
  font-size: 11.5px;
  font-weight: 500;
}

/* 编号列表 */
.num-list,
.step-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.num-list li,
.step-list li {
  display: flex;
  gap: 9px;
  align-items: flex-start;
}

.num-list__idx,
.step-list__idx {
  width: 19px;
  height: 19px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 700;
  margin-top: 1px;
}

.num-list__idx {
  background: var(--c-danger-bg);
  color: var(--c-danger);
}

.step-list__idx {
  background: var(--c-primary-600);
  color: #fff;
}

.num-list p,
.step-list p {
  flex: 1;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--c-text-2);
}

/* 圆点列表 */
.dot-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.dot-list li {
  position: relative;
  padding-left: 14px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--c-text-2);
}

.dot-list li::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 8px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--c-accent-300);
}

.dot-list--green li::before {
  background: var(--c-primary-400);
}

/* 安全提示 */
.safety {
  margin: 16px 16px 0;
  padding: 14px 16px;
  border-radius: var(--r-md);
  background: var(--c-warning-bg);
  border: 1px solid #fde68a;
}

.safety__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
  color: #92400e;
}

.safety__head strong {
  font-size: 13px;
  font-weight: 700;
}

.safety p {
  font-size: 12px;
  line-height: 1.7;
  color: #78350f;
}

/* 参考 */
.refs {
  margin: 16px 16px 0;
  padding: 13px 16px;
  border-radius: var(--r-md);
  background: var(--c-bg-muted);
  border: 1px dashed var(--c-line);
}

.refs__title {
  font-size: 11px;
  font-weight: 700;
  color: var(--c-text-3);
  margin-bottom: 7px;
}

.refs ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.refs li {
  position: relative;
  padding-left: 11px;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--c-text-4);
}

.refs li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--c-text-4);
}

.cta {
  padding: 22px 16px 0;
}

.disclaimer {
  padding: 14px 24px 0;
  text-align: center;
  font-size: 10px;
  line-height: 1.7;
  color: var(--c-text-4);
}
</style>

<style scoped>
@media (min-width: 960px) {
  .hero,
  .block,
  .safety,
  .refs {
    max-width: 780px;
    margin-left: auto;
    margin-right: auto;
    width: calc(100% - 64px);
  }
  .cta {
    max-width: 780px;
    margin: 22px auto 0;
    width: calc(100% - 64px);
  }
}
</style>
