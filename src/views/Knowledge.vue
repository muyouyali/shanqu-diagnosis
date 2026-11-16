<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import CropEmoji from '@/components/CropEmoji.vue'
import PageHero from '@/components/PageHero.vue'
import QuickLookup from '@/components/QuickLookup.vue'
import api from '@/api'
import type { Disease } from '@/types'

const router = useRouter()
const store = useAppStore()

const diseases = ref<Disease[]>([])
const loading = ref(true)
const keyword = ref('')
const lookupOpen = ref(false)
/** 🌱 社区共建样本（农户提交 → 专家审核通过 → 自动并入图谱） */
const community = ref<(Disease & { submitter?: string })[]>([])
/** 严重度筛选：'' 全部 / high 高发(含毁灭性) / medium 中等 / low 轻微 */
const severityFilter = ref('')
/** 跨区作物展开状态 */
const showRemote = ref(false)

/** 当前地区可查的作物（知识库本地作物），跨区作物单独折叠 */
const regionCrops = computed(() => store.localCrops.filter((c) => c.diagnosable !== false))
const remoteCrops = computed(() => store.otherCrops.filter((c) => c.diagnosable !== false))

const sevChips = [
  { key: '', label: '全部' },
  { key: 'high', label: '🔥 高发' },
  { key: 'medium', label: '⚠️ 中等' },
  { key: 'low', label: '✓ 轻微' }
]
const sevOf = (s: string) => (s === 'critical' ? 'high' : s)

const severityCount = (key: string) => {
  if (!key) return diseases.value.length
  return diseases.value.filter((d) => sevOf(d.severity) === key).length
}

const severityMeta: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: '毁灭性', color: '#b91c1c', bg: '#fee2e2' },
  high: { label: '高发', color: '#c2410c', bg: '#ffedd5' },
  medium: { label: '中等', color: '#a16207', bg: '#fef9c3' },
  low: { label: '轻微', color: '#15803d', bg: '#dcfce7' }
}

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  let list = diseases.value
  if (severityFilter.value) list = list.filter((d) => sevOf(d.severity) === severityFilter.value)
  if (!k) return list
  return list.filter(
    (d) =>
      d.name.toLowerCase().includes(k) ||
      (d.alias || '').toLowerCase().includes(k) ||
      d.symptomKeywords.some((s) => s.includes(k)) ||
      d.symptoms.some((s) => s.includes(k))
  )
})

/** 社区共建条目同样支持关键词过滤 */
const communityFiltered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  let list = community.value
  if (!k) return list
  return list.filter(
    (d) =>
      d.name.toLowerCase().includes(k) ||
      d.symptomKeywords.some((s) => s.includes(k)) ||
      d.symptoms.some((s) => s.includes(k))
  )
})

const load = async () => {
  loading.value = true
  try {
    await store.loadCrops()
    diseases.value = await api.diseases(store.selectedCropId)
    // 社区共建条目独立拉取（不随作物切换变化，始终展示在页面底部区块）
    api
      .approvedDiseaseSamples()
      .then((r) => (community.value = r.items || []))
      .catch(() => (community.value = []))
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => store.selectedCropId, load)
</script>

<template>
  <div class="kb">
    <PageHero
      emoji="🌿"
      title="病害图谱"
      desc="云南特色作物常见病虫害 · 图文对照速查，选作物或直接搜索症状"
      badge="图文速查"
      badge-icon="book"
      image="/media/banners/b35872964_wide.jpg"
      @badge-click="lookupOpen = true"
    />

    <!-- 图文速查弹层 -->
    <QuickLookup :open="lookupOpen" :diseases="diseases" @close="lookupOpen = false" />

    <!-- 共建入口条 -->
    <button class="kb-join" @click="router.push('/atlas')">
      <span class="kb-join__icon"><AppIcon name="leaf" :size="17" /></span>
      <span class="kb-join__body">
        <strong>病害图谱速查 · 共建</strong>
        <small>按地区查阅全部作物，可补充家乡作物共建图谱</small>
      </span>
      <AppIcon name="arrow-right" :size="16" class="kb-join__arrow" />
    </button>

    <!-- 搜索 -->
    <div class="search">
      <AppIcon name="search" :size="18" class="search__icon" />
      <input v-model="keyword" class="search__input" placeholder="搜索病害名或症状，如「黄叶」「霉层」" />
      <button v-if="keyword" class="search__clear" @click="keyword = ''">
        <AppIcon name="x" :size="13" />
      </button>
    </div>

    <!-- 严重度筛选 -->
    <div class="sev-bar">
      <button
        v-for="s in sevChips"
        :key="s.key"
        class="sev-chip"
        :class="{ 'is-on': severityFilter === s.key }"
        @click="severityFilter = s.key"
      >
        {{ s.label }} <em>{{ severityCount(s.key) }}</em>
      </button>
    </div>

    <!-- 作物切换：跟随所处地区 -->
    <div class="crop-tabs-wrap">
      <div class="crop-tabs">
        <button
          v-for="c in regionCrops"
          :key="c.id"
          class="crop-tab"
          :class="{ 'is-active': store.selectedCropId === c.id }"
          @click="store.setCrop(c.id)"
        >
          <CropEmoji class="crop-tab__emoji" :emoji="c.emoji" :name="c.name" :size="20" />
          <span class="crop-tab__name">{{ c.name }}</span>
          <span class="crop-tab__count">{{ c.diseaseCount }}</span>
        </button>
        <button
          v-if="remoteCrops.length"
          class="crop-tab crop-tab--more"
          :class="{ 'is-active': remoteCrops.some((c) => c.id === store.selectedCropId) }"
          @click="showRemote = !showRemote"
        >
          <AppIcon name="grid" :size="14" />
          <span class="crop-tab__name">其他 {{ remoteCrops.length }}</span>
          <AppIcon :name="showRemote ? 'chevron-up' : 'chevron-down'" :size="12" />
        </button>
      </div>
      <div v-if="showRemote" class="crop-tabs crop-tabs--remote">
        <button
          v-for="c in remoteCrops"
          :key="c.id"
          class="crop-tab"
          :class="{ 'is-active': store.selectedCropId === c.id }"
          @click="store.setCrop(c.id)"
        >
          <CropEmoji class="crop-tab__emoji" :emoji="c.emoji" :name="c.name" :size="20" />
          <span class="crop-tab__name">{{ c.name }}</span>
          <span class="crop-tab__count">{{ c.diseaseCount }}</span>
        </button>
      </div>
    </div>

    <!-- 作物简介 -->
    <div v-if="!keyword && store.selectedCrop" class="crop-intro">
      <div class="crop-intro__head">
        <CropEmoji class="crop-intro__emoji" :emoji="store.selectedCrop.emoji" :name="store.selectedCrop.name" :size="38" />
        <div>
          <h2 class="crop-intro__name">{{ store.selectedCrop.name }}</h2>
          <p class="crop-intro__tag">{{ store.selectedCrop.tagline }}</p>
        </div>
      </div>
      <p class="crop-intro__text">{{ store.selectedCrop.intro }}</p>
      <div class="crop-intro__meta">
        <span><AppIcon name="mountain" :size="12" /> {{ store.selectedCrop.altitude }}</span>
        <span><AppIcon name="clock" :size="12" /> {{ store.selectedCrop.season }}</span>
      </div>
      <ul class="crop-intro__points">
        <li v-for="(p, i) in store.selectedCrop.keyPoints" :key="i">{{ p }}</li>
      </ul>
    </div>

    <!-- 列表 -->
    <div v-if="loading" class="skeleton-list">
      <div v-for="i in 4" :key="i" class="skeleton-item"></div>
    </div>

    <div v-else-if="!filtered.length" class="empty">
      <AppIcon name="search" :size="30" />
      <p>没有找到相关病害</p>
      <small>换个关键词试试，或切换作物</small>
      <button class="empty__ask" @click="router.push('/qa')">
        💬 去农技问答问其他作物（AI 支持任意作物）
      </button>
    </div>

    <div v-else class="disease-list">
      <button
        v-for="d in filtered"
        :key="d.id"
        class="disease-card"
        @click="router.push(`/knowledge/${d.id}`)"
      >
        <div class="disease-card__top">
          <div class="disease-card__name-row">
            <h3 class="disease-card__name">{{ d.name }}</h3>
            <span
              class="disease-card__severity"
              :style="{ color: severityMeta[d.severity].color, background: severityMeta[d.severity].bg }"
            >
              {{ severityMeta[d.severity].label }}
            </span>
          </div>
          <span class="disease-card__type">{{ d.type }}</span>
        </div>

        <p v-if="d.alias" class="disease-card__alias">俗称：{{ d.alias }}</p>

        <p class="disease-card__symptom text-clamp-2">{{ d.symptoms[0] }}</p>

        <div class="disease-card__tags">
          <span v-for="k in d.symptomKeywords.slice(0, 3)" :key="k">{{ k }}</span>
        </div>

        <span class="disease-card__arrow"><AppIcon name="arrow-right" :size="15" /></span>
      </button>
    </div>

    <!-- 🌱 社区共建样本（专家审核通过后自动并入） -->
    <div v-if="!loading && communityFiltered.length" class="community">
      <h2 class="community__title">
        <span class="community__icon">🌱</span> 社区共建样本
        <em>{{ communityFiltered.length }}</em>
      </h2>
      <div class="community__grid">
        <button
          v-for="d in communityFiltered"
          :key="d.id"
          class="community__card"
          @click="router.push(`/knowledge/${d.id}`)"
        >
          <div class="community__head">
            <h3>{{ d.name }}</h3>
            <span class="community__tag">共建收录</span>
          </div>
          <p class="community__symptom text-clamp-2">{{ d.symptoms[0] }}</p>
          <div class="community__meta">
            <span v-if="d.cropId && d.cropId !== 'community'">{{ store.crops.find((c) => c.id === d.cropId)?.name || '' }}</span>
            <span v-if="d.submitter">提交：{{ d.submitter }}</span>
          </div>
        </button>
      </div>
    </div>

    <p class="kb__foot">
      资料整理自全国农技推广服务中心、云南省植保植检站公开技术资料<br />
      仅供学习参考，实际防治请咨询当地农技部门
    </p>
  </div>
</template>

<style scoped>
.kb {
  min-height: 100dvh;
  padding: 0 0 24px;
  background: var(--c-bg-page);
}

.kb__head {
  padding: 22px 20px 14px;
}

.kb__title {
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.5px;
  margin-bottom: 3px;
}

.kb__sub {
  font-size: 12px;
  color: var(--c-text-4);
}

/* 共建入口条 */
.kb-join {
  display: flex;
  align-items: center;
  gap: 12px;
  width: calc(100% - 40px);
  margin: 0 20px 16px;
  padding: 14px 16px;
  border-radius: var(--r-md);
  text-align: left;
  background: linear-gradient(100deg, #f1f9f4, #fafdfb);
  border: 1px solid #d9eddf;
  transition: all var(--dur-fast);
}

.kb-join:active {
  transform: scale(0.99);
}

.kb-join__icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  box-shadow: 0 5px 12px rgba(var(--c-primary-rgb), 0.26);
  flex-shrink: 0;
}

.kb-join__body {
  flex: 1;
  min-width: 0;
}

.kb-join__body strong {
  display: block;
  font-size: 14.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.kb-join__body small {
  font-size: 13px;
  color: var(--c-text-4);
}

.kb-join__arrow {
  color: var(--c-primary-600);
}

/* 搜索 */
.search {
  position: relative;
  margin: 0 20px 16px;
  display: flex;
  align-items: center;
}

.search__icon {
  position: absolute;
  left: 15px;
  color: var(--c-text-4);
  pointer-events: none;
}

.search__input {
  width: 100%;
  height: 48px;
  padding: 0 36px 0 42px;
  border-radius: var(--r-full);
  background: var(--c-bg-card);
  border: 1.5px solid var(--c-line);
  font-size: 15px;
  transition: border-color var(--dur-fast);
}

.search__input:focus {
  border-color: var(--c-primary-300);
}

.search__input::placeholder {
  color: var(--c-text-4);
}

.search__clear {
  position: absolute;
  right: 11px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--c-line);
  color: var(--c-text-3);
}

/* 作物 tab */
/* 严重度筛选条 */
.sev-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 14px 20px 4px;
}

.sev-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 9px 16px;
  border-radius: var(--r-full);
  background: var(--c-bg-card);
  border: 1.5px solid var(--c-line-soft);
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text-3);
  transition: all var(--dur-fast) var(--ease-out);
}

.sev-chip em {
  font-style: normal;
  font-size: 12.5px;
  color: var(--c-text-4);
}

.sev-chip:hover {
  border-color: var(--c-primary-200);
  color: var(--c-primary-700);
}

.sev-chip.is-on {
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  border-color: transparent;
  color: #fff;
  box-shadow: 0 3px 10px rgba(47, 152, 104, 0.28);
}

.sev-chip.is-on em { color: rgba(255, 255, 255, 0.75); }

.crop-tabs-wrap {
  margin-bottom: 4px;
}

.crop-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 0 20px 16px;
}

.crop-tabs--remote {
  padding-top: 0;
  padding-bottom: 12px;
  margin: 0 20px 8px;
  padding: 12px;
  border-radius: var(--r-md);
  background: var(--c-bg-muted);
  border: 1px dashed var(--c-line);
}

.crop-tab--more {
  border-style: dashed;
  color: var(--c-text-3);
}

.crop-tab--more.is-active {
  border-style: solid;
}

.crop-tab {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 16px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1.5px solid var(--c-line);
  white-space: nowrap;
  transition: all var(--dur-fast) var(--ease-out);
}

.crop-tab.is-active {
  border-color: var(--c-primary-500);
  background: var(--c-primary-50);
}

.crop-tab__emoji {
  font-size: 18px;
  line-height: 1;
  flex: none;
}

.crop-tab__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text-2);
}

.crop-tab.is-active .crop-tab__name {
  color: var(--c-primary-700);
}

.crop-tab__count {
  font-size: 12.5px;
  padding: 1px 7px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  color: var(--c-text-4);
  font-weight: 700;
}

.crop-tab.is-active .crop-tab__count {
  background: var(--c-primary-200);
  color: var(--c-primary-800);
}

/* 作物简介 */
.crop-intro {
  margin: 0 20px 18px;
  padding: 20px 22px;
  border-radius: var(--r-lg);
  background: linear-gradient(160deg, #ffffff, #f7fbf9);
  border: 1px solid var(--c-primary-100);
  box-shadow: var(--sh-xs);
}

.crop-intro__head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.crop-intro__emoji {
  font-size: 34px;
  line-height: 1;
  flex: none;
}

.crop-intro__name {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: -0.2px;
}

.crop-intro__tag {
  font-size: 13px;
  color: var(--c-text-4);
}

.crop-intro__text {
  font-size: 14px;
  line-height: 1.75;
  color: var(--c-text-2);
  margin-bottom: 12px;
}

.crop-intro__meta {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.crop-intro__meta span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 14px;
  color: var(--c-primary-700);
  font-weight: 600;
}

.crop-intro__points {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 13px;
  border-top: 1px dashed var(--c-line);
}

.crop-intro__points li {
  position: relative;
  padding-left: 14px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--c-text-3);
}

.crop-intro__points li::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 7px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--c-primary-400);
}

/* 骨架 */
.skeleton-list {
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.skeleton-item {
  height: 110px;
  border-radius: var(--r-md);
  background: linear-gradient(90deg, #eef2f0 25%, #f7faf8 50%, #eef2f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

/* 空态 */
.empty {
  padding: 60px 20px;
  text-align: center;
  color: var(--c-text-4);
}

.empty__ask {
  margin-top: 14px;
  padding: 8px 16px;
  border-radius: var(--r-full);
  background: var(--c-primary-50, #eef7f0);
  border: 1px solid var(--c-primary-200, #bfe0c8);
  color: var(--c-primary-700);
  font-size: 12.5px;
  font-weight: 600;
}

.empty :deep(.icon) {
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty p {
  font-size: 13.5px;
  color: var(--c-text-3);
  margin-bottom: 4px;
}

.empty small {
  font-size: 11.5px;
}

/* 病害卡 */
.disease-list {
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.disease-card {
  position: relative;
  padding: 18px 44px 18px 20px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  text-align: left;
  transition: all var(--dur-base) var(--ease-out);
}

.disease-card:active {
  transform: scale(0.985);
  box-shadow: var(--sh-sm);
}

.disease-card__top {
  margin-bottom: 7px;
}

.disease-card__name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.disease-card__name {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.1px;
}

.disease-card__severity {
  padding: 2px 9px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 700;
}

.disease-card__type {
  font-size: 12.5px;
  color: var(--c-text-4);
}

.disease-card__alias {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--c-accent-600);
  margin-bottom: 7px;
}

.disease-card__symptom {
  font-size: 14.5px;
  line-height: 1.7;
  color: var(--c-text-3);
  margin-bottom: 11px;
}

.disease-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.disease-card__tags span {
  padding: 4px 11px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--c-text-3);
}

.disease-card__arrow {
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--c-text-4);
}

.kb__foot {
  padding: 26px 20px 10px;
  text-align: center;
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--c-text-4);
}

/* 🌱 社区共建样本区块 */
.community {
  padding: 0 20px;
  margin-top: 26px;
}

.community__title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15.5px;
  font-weight: 800;
  color: #14532d;
  margin-bottom: 12px;
}

.community__icon {
  font-size: 18px;
  line-height: 1;
}

.community__title em {
  font-style: normal;
  font-size: 12px;
  font-weight: 800;
  padding: 2px 9px;
  border-radius: var(--r-full);
  background: #dcfce7;
  color: #15803d;
}

.community__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.community__card {
  text-align: left;
  padding: 16px 18px;
  border-radius: var(--r-md);
  background: linear-gradient(150deg, #f4fbf7, #fdfefd);
  border: 1px solid #cfe9d8;
  transition: all var(--dur-fast);
}

.community__card:active {
  transform: scale(0.99);
}

.community__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}

.community__head h3 {
  font-size: 15.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.community__tag {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 800;
  padding: 2px 9px;
  border-radius: var(--r-full);
  background: #dcfce7;
  color: #15803d;
}

.community__symptom {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--c-text-3);
}

.community__meta {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--c-text-4);
}
</style>

<style scoped>
@media (min-width: 960px) {
  .search,
  .crop-tabs,
  .crop-intro {
    max-width: var(--max-w-mobile);
    margin-left: auto;
    margin-right: auto;
    width: calc(100% - 64px);
  }
  .sev-bar {
    max-width: var(--max-w-mobile);
    margin-left: auto;
    margin-right: auto;
    width: calc(100% - 64px);
  }
  .crop-intro {
    margin-top: 0;
  }
  .disease-list {
    max-width: var(--max-w-mobile);
    margin: 0 auto;
    padding: 0;
    width: calc(100% - 64px);
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .skeleton-list {
    max-width: var(--max-w-mobile);
    margin: 0 auto;
    padding: 0;
    width: calc(100% - 64px);
  }

  /* 桌面端字号与间距放大 */
  .search__input {
    font-size: 15.5px;
    height: 52px;
  }
  .crop-tab {
    font-size: 14.5px;
    height: 40px;
  }
  .disease-card__name {
    font-size: 18.5px;
  }
  .disease-card__symptom {
    font-size: 15px;
    line-height: 1.75;
  }
  .disease-card__alias {
    font-size: 13.5px;
  }
  .disease-card__tags :deep(.tag),
  .disease-card__tags .tag {
    font-size: 13px;
  }
  .crop-intro {
    padding: 18px 22px;
  }
  .crop-intro__name {
    font-size: 20px;
  }
  .crop-intro__text {
    font-size: 14px;
    line-height: 1.75;
  }
}
</style>
