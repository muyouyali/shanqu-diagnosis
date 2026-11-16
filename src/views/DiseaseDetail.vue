<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'
import { cropImageOf } from '@/data/cropImages'
import { diseaseImageOf } from '@/data/diseaseImages'
import { diseaseVideosOf } from '@/data/diseaseVideos'

const route = useRoute()
const router = useRouter()
const disease = ref<any>(null)
const loading = ref(true)
const speaking = ref(false)

const cropLabel = ref('')
const cropEmoji = ref('')
const cropName = computed(() => cropLabel.value)
/** 病害症状实拍图（优先），回退到作物实拍图 */
const symptomPhoto = computed(() => diseaseImageOf(route.params.diseaseId as string) || '')
const cropPhoto = computed(() => cropImageOf(cropEmoji.value, cropLabel.value) || '')
const heroPhoto = computed(() => symptomPhoto.value || cropPhoto.value)
/** 相关视频（B 站，人工筛选植物病害讲解） */
const videos = computed(() => diseaseVideosOf(route.params.diseaseId as string))
const mainVideo = computed(() => videos.value[0] || null)
/** 视频搜索跳转链接 */
const searchName = computed(() => `${cropName.value}${disease.value?.name || ''}`.replace(/^(.{2,4}?)\1/, '$1'))
const bilibiliSearch = computed(() => `https://search.bilibili.com/all?keyword=${encodeURIComponent(searchName.value + ' 防治')}`)
const douyinSearch = computed(() => `https://www.douyin.com/search/${encodeURIComponent(searchName.value + ' 防治')}`)
const fmtPlay = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)}万` : String(n))
/** 症状要点（图上标注 2 条，便于对照拍摄） */
const symptomHints = computed(() => (disease.value?.symptomKeywords || []).slice(0, 3))

const severityMeta: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: '毁灭性病害', color: '#b91c1c', bg: '#fee2e2' },
  high: { label: '高发病害', color: '#c2410c', bg: '#ffedd5' },
  medium: { label: '中等风险', color: '#a16207', bg: '#fef9c3' },
  low: { label: '低风险', color: '#15803d', bg: '#dcfce7' }
}

/** 并行拉取所有作物的病害列表定位目标病害（串行会随作物增多越来越慢） */
const load = async () => {
  const id = route.params.diseaseId as string
  disease.value = null
  loading.value = true
  try {
    const res: any = await api.crops()
    const crops: any[] = Array.isArray(res) ? res : res?.items || []
    const lists = await Promise.all(crops.map((c) => api.diseases(c.id).catch(() => [])))
    lists.forEach((list, i) => {
      const found = (list as any[]).find((d) => d.id === id)
      if (found && !disease.value) {
        disease.value = found
        cropLabel.value = crops[i]?.name || ''
        cropEmoji.value = crops[i]?.emoji || ''
      }
    })
  } catch { /* 兜底继续 */ }

  // 兜底：社区共建条目（cm- 前缀，手动输入新作物的样本不入具体作物图谱）
  if (!disease.value) {
    try {
      const res = await api.approvedDiseaseSamples()
      disease.value = (res.items || []).find((d: any) => d.id === id) || null
    } catch { /* 忽略 */ }
  }
  loading.value = false
}

onMounted(load)
// 同组件路由复用（如 /knowledge/a → /knowledge/b）时重新加载
watch(() => route.params.diseaseId, (nv, ov) => { if (nv && nv !== ov && route.path.startsWith('/knowledge/')) load() })

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
  u.rate = 1.15
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

    <div v-else-if="!disease" class="missing">
      <div class="missing__icon">🌱</div>
      <p class="missing__title">未找到该病害</p>
      <p class="missing__hint">条目可能尚未收录或已下架，去病害图谱看看其他病害吧</p>
      <button class="missing__btn" @click="router.replace('/knowledge')">返回病害图谱</button>
    </div>

    <template v-else>
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

      <!-- 相关视频 / 症状实拍 -->
      <section class="block photo-block">
        <div v-if="mainVideo" class="video-card">
          <!-- 封面 + 播放按钮：点击新窗口跳转哔哩哔哩视频页播放 -->
          <a
            :key="mainVideo.bvid"
            :href="mainVideo.url"
            target="_blank"
            rel="noopener"
            class="video-card__cover"
            :aria-label="`跳转哔哩哔哩播放：${mainVideo.title}`"
          >
            <img :src="heroPhoto || cropPhoto" :alt="mainVideo.title" class="video-card__cover-img" />
            <span class="video-card__play">▶</span>
            <span class="video-card__site">哔哩哔哩</span>
          </a>
          <div class="video-card__meta">
            <strong>{{ mainVideo.title }}</strong>
            <span>UP 主 {{ mainVideo.author }} · {{ fmtPlay(mainVideo.play) }} 播放 · 来源：哔哩哔哩</span>
          </div>
          <div class="video-card__links">
            <a :href="mainVideo.url" target="_blank" rel="noopener" class="video-card__link video-card__link--primary">▶ 在哔哩哔哩观看</a>
            <span class="video-card__links-label">更多视频：</span>
            <a :href="bilibiliSearch" target="_blank" rel="noopener" class="video-card__link">哔哩哔哩搜索</a>
            <a :href="douyinSearch" target="_blank" rel="noopener" class="video-card__link video-card__link--dy">抖音搜索</a>
            <span class="video-card__hint">点击视频封面即跳转原网页播放</span>
          </div>
        </div>
        <div v-else-if="heroPhoto" class="photo-card">
          <div class="photo-card__frame">
            <img :src="heroPhoto" :alt="disease.name" class="photo-card__img" />
          </div>
          <div class="photo-card__shade" />
          <div class="photo-card__caption">
            <strong>{{ disease.name }} · 症状实拍参考</strong>
            <span>拍摄时重点对焦：{{ symptomHints.join(' / ') || '叶片正反面病斑' }}</span>
          </div>
        </div>
        <div v-if="!mainVideo" class="video-card__links video-card__links--solo">
          <span class="video-card__links-label">视频学习：</span>
          <a :href="bilibiliSearch" target="_blank" rel="noopener" class="video-card__link">▶ 哔哩哔哩看病害讲解</a>
          <a :href="douyinSearch" target="_blank" rel="noopener" class="video-card__link video-card__link--dy">♪ 抖音搜索</a>
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

      <!-- 参考文献与扩展学习 -->
      <section class="refs">
        <h4 class="refs__title">资料来源</h4>
        <ul>
          <li v-for="(r, i) in disease.references" :key="i">{{ r }}</li>
        </ul>
        <div class="refs__links">
          <button class="refs__link" @click="router.push('/knowledge')">
            📚 本站病害图谱 · {{ cropName }}全部病害
          </button>
          <a class="refs__link" :href="bilibiliSearch" target="_blank" rel="noopener">
            ▶ 哔哩哔哩 · {{ disease.name }}防治视频
          </a>
          <a class="refs__link" :href="douyinSearch" target="_blank" rel="noopener">
            ♪ 抖音 · {{ disease.name }}防治视频
          </a>
        </div>
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

/* 症状实拍图：完整显示不裁切 */
.photo-block {
  margin-top: 4px;
}

/* 相关视频卡 */
.video-card {
  background: #10231b;
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: var(--sh-xs);
}

/* 视频封面：点击整卡跳转 B 站原视频页 */
.video-card__cover {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  text-decoration: none;
  cursor: pointer;
}

.video-card__cover-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.video-card__cover::after {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.12);
  transition: background 0.2s;
}

.video-card__cover:hover::after {
  background: rgba(0, 0, 0, 0.3);
}

.video-card__play {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.62);
  border: 2px solid rgba(255, 255, 255, 0.85);
  color: #fff;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding-left: 4px;
  z-index: 1;
  transition: transform 0.2s, background 0.2s;
  pointer-events: none;
}

.video-card__cover:hover .video-card__play {
  transform: translate(-50%, -50%) scale(1.08);
  background: rgba(251, 114, 153, 0.88);
}

.video-card__site {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 1;
  padding: 3px 10px;
  border-radius: var(--r-full);
  background: rgba(251, 114, 153, 0.92);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  pointer-events: none;
}

.video-card__meta {
  padding: 12px 14px 4px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.video-card__meta strong {
  font-size: 13.5px;
  font-weight: 600;
  color: #fff;
  line-height: 1.5;
}

.video-card__meta span {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.62);
}

.video-card__links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px 14px;
}

.video-card__links--solo {
  padding: 12px 0 0;
  margin-top: 10px;
}

.video-card__links-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}

.video-card__links--solo .video-card__links-label {
  color: var(--c-text-3);
}

.video-card__link {
  padding: 6px 13px;
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.1);
  color: #7fd4ab;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  border: none;
  cursor: pointer;
}

.video-card__links--solo .video-card__link {
  background: var(--c-primary-50);
}

.video-card__link:active {
  opacity: 0.8;
}

.video-card__link--primary {
  background: #fb7299;
  color: #fff;
}

.video-card__link--dy {
  color: #f56c6c;
}

.video-card__hint {
  flex-basis: 100%;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.5;
}

.photo-card {
  position: relative;
  border-radius: var(--r-md);
  overflow: hidden;
  box-shadow: var(--sh-xs);
  background: #10231b;
}

.photo-card__frame {
  display: grid;
  place-items: center;
  min-height: 230px;
}

.photo-card__img {
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  display: block;
}

.photo-card__shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(10, 30, 20, 0) 45%, rgba(10, 30, 20, 0.68) 100%);
}

.photo-card__caption {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #fff;
}

.photo-card__caption strong {
  font-size: 14px;
  font-weight: 700;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);
}

.photo-card__caption span {
  font-size: 11.5px;
  opacity: 0.92;
  line-height: 1.5;
}

/* 未找到 */
.missing {
  padding: 72px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.missing__icon { font-size: 40px; }
.missing__title { font-size: 16px; font-weight: 700; color: var(--c-text, #233); }
.missing__hint { font-size: 13px; color: var(--c-text-2, #677); }
.missing__btn {
  margin-top: 14px;
  padding: 10px 26px;
  border: none;
  border-radius: 999px;
  background: var(--c-primary-500, #2e7d5b);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
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
  font-size: 11.5px;
  font-weight: 700;
}

.hero__crop {
  font-size: 11.5px;
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
  font-size: 11.5px;
  font-weight: 600;
}

.hero__pathogen {
  font-size: 11.5px;
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
  font-size: 11.5px;
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
  font-size: 12.5px;
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
  font-size: 11.5px;
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

.refs__links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--c-line);
}

.refs__link {
  padding: 7px 14px;
  border-radius: var(--r-full);
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-100);
  color: var(--c-primary-700);
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.refs__link:hover {
  background: var(--c-primary-100);
}

.cta {
  padding: 22px 16px 0;
}

.disclaimer {
  padding: 14px 24px 0;
  text-align: center;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--c-text-4);
}
</style>

<style scoped>
/* 桌面端：与全站统一 1200px 限宽，字号间距同步放大 */
@media (min-width: 960px) {
  .page-head {
    height: 62px;
  }

  .page-head__title {
    font-size: 19px;
  }

  .hero,
  .block,
  .safety,
  .refs,
  .cta {
    max-width: var(--max-w-mobile);
    margin-left: auto;
    margin-right: auto;
    width: calc(100% - 72px);
  }

  .cta {
    margin-top: 26px;
  }

  .hero {
    margin-top: 22px;
    padding: 30px 36px;
    border-radius: 22px;
  }

  .hero__name {
    font-size: 31px;
    margin-bottom: 8px;
  }

  .hero__severity {
    padding: 5px 14px;
    font-size: 14px;
    border-radius: 8px;
  }

  .hero__crop {
    font-size: 14.5px;
  }

  .hero__alias {
    font-size: 15px;
    margin-bottom: 14px;
  }

  .hero__tag {
    padding: 4px 14px;
    font-size: 14.5px;
  }

  .hero__pathogen {
    font-size: 14.5px;
  }

  .block {
    margin-top: 22px;
    padding: 24px 30px;
    border-radius: 18px;
  }

  .block__title {
    font-size: 17px;
    gap: 9px;
    margin-bottom: 16px;
  }

  .block__title :deep(.icon) {
    width: 18px;
    height: 18px;
  }

  .photo-card__img {
    aspect-ratio: 3 / 2;
  }

  .photo-card__caption {
    left: 26px;
    right: 26px;
    bottom: 20px;
    gap: 5px;
  }

  .photo-card__caption strong {
    font-size: 19px;
  }

  .photo-card__caption span {
    font-size: 15px;
  }

  .keywords {
    gap: 10px;
  }

  .keyword {
    padding: 7px 17px;
    font-size: 15px;
  }

  .num-list,
  .step-list {
    gap: 15px;
  }

  .num-list__idx,
  .step-list__idx {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    font-size: 14.5px;
  }

  .num-list p,
  .step-list p {
    font-size: 16px;
    line-height: 1.85;
  }

  .dot-list {
    gap: 11px;
  }

  .dot-list li {
    padding-left: 18px;
    font-size: 16px;
    line-height: 1.8;
  }

  .dot-list li::before {
    left: 3px;
    top: 10px;
    width: 6px;
    height: 6px;
  }

  .safety {
    margin-top: 22px;
    padding: 20px 30px;
    border-radius: 18px;
  }

  .safety__head strong {
    font-size: 16.5px;
  }

  .safety p {
    font-size: 15px;
    line-height: 1.8;
  }

  .refs {
    margin-top: 22px;
    padding: 18px 30px;
    border-radius: 16px;
  }

  .refs__title {
    font-size: 15px;
  }

  .refs li {
    font-size: 14px;
    line-height: 1.8;
  }

  .cta .btn {
    height: 56px;
    font-size: 17px;
  }

  .disclaimer {
    font-size: 13.5px;
    padding-top: 20px;
  }

  .missing__title {
    font-size: 19px;
  }

  .missing__hint {
    font-size: 15px;
  }

  .missing__btn {
    padding: 13px 34px;
    font-size: 16px;
  }
}
</style>
