<script setup lang="ts">
/**
 * 病害图谱速查 · 共建
 * - 按地区展示已收录作物（知识库 / 地区百科 / 农户共建）
 * - 支持搜索、分组筛选、查看详情
 * - 提供「提交本地作物」共建入口，并展示本人提交进度
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import PageHero from '@/components/PageHero.vue'
import RegionPicker from '@/components/RegionPicker.vue'
import CropDetailSheet from '@/components/CropDetailSheet.vue'
import CropEmoji from '@/components/CropEmoji.vue'
import CropSubmitSheet from '@/components/CropSubmitSheet.vue'
import { useAppStore } from '@/stores/app'
import { myLocalSubs } from '@/data/localSubs'
import type { Crop, CropSubmission } from '@/types'

const router = useRouter()
const store = useAppStore()

const keyword = ref('')
const tab = ref<'all' | 'kb' | 'atlas' | 'community'>('all')
const detailCrop = ref<Crop | null>(null)
const submitOpen = ref(false)
const aiBusy = ref('')
const submitPreset = ref('')

const mySubmissions = ref<CropSubmission[]>([])
const subLoading = ref(false)

const loadCrops = async () => {
  try {
    await store.loadCrops(true)
  } catch {
    store.showToast('作物图谱加载失败', 'error')
  }
}

const loadSubmissions = async () => {
  subLoading.value = true
  const who = store.user?.nickname || ''
  // 先立即展示本地暂存的提交，远端返回后再合并（线上远端慢时不阻塞）
  const local = myLocalSubs(who) as unknown as CropSubmission[]
  mySubmissions.value = [...local]
  try {
    if (store.user) {
      const res = await api.cropSubmissions({})
      const remote = (res.items || []).filter(
        (s) => s.submitter === who || s.submitter === store.user!.account
      )
      const existKeys = new Set(local.map((s) => `${s.name}|${s.createdAt}`))
      mySubmissions.value = [
        ...remote.filter((s) => !existKeys.has(`${s.name}|${s.createdAt}`)),
        ...local
      ]
    }
  } catch {
    /* 静态托管：仅本地数据 */
  } finally {
    mySubmissions.value.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    subLoading.value = false
  }
}

onMounted(async () => {
  // 恢复登录态不阻塞作物加载（线上 restoreUser 请求慢时会拖住首屏）
  store.restoreUser().catch(() => {})
  await loadCrops()
  loadSubmissions()
})

/** 本地作物（知识库 + 百科 + 共建） */
const localList = computed(() => store.localCrops)

/** 当前筛选结果 */
const filtered = computed(() => {
  const k = keyword.value.trim()
  let list = [...localList.value, ...store.otherCrops]
  if (tab.value === 'kb') list = list.filter((c) => c.diagnosable)
  if (tab.value === 'atlas') list = list.filter((c) => c.source === 'atlas')
  if (tab.value === 'community') list = list.filter((c) => c.source === 'community')
  if (k) {
    list = list.filter(
      (c) =>
        c.name.includes(k) ||
        (c.alias || '').includes(k) ||
        (c.desc || c.tagline || '').includes(k) ||
        (c.pests || '').includes(k)
    )
  }
  // 本地优先排序
  const localIds = new Set(localList.value.map((c) => c.id))
  return [...list.filter((c) => localIds.has(c.id)), ...list.filter((c) => !localIds.has(c.id))]
})

/** 统计 */
const counts = computed(() => {
  const all = [...localList.value, ...store.otherCrops]
  return {
    all: all.length,
    kb: all.filter((c) => c.diagnosable).length,
    atlas: all.filter((c) => c.source === 'atlas').length,
    community: all.filter((c) => c.source === 'community').length,
    local: localList.value.length,
    disease: all.reduce((n, c) => n + (c.diseaseCount || 0), 0)
  }
})

const tabs = computed(() => [
  { key: 'all' as const, label: '全部', n: counts.value.all },
  { key: 'kb' as const, label: '可诊断', n: counts.value.kb },
  { key: 'atlas' as const, label: '地区百科', n: counts.value.atlas },
  { key: 'community' as const, label: '农户共建', n: counts.value.community }
])

const openCrop = (c: Crop) => (detailCrop.value = c)

/** AI 补全病害知识（专家）：调大模型为知识库未收录作物生成常见病害条目并即时入库 */
const aiExpand = async (c: Crop) => {
  if (aiBusy.value) return
  aiBusy.value = c.id
  try {
    const r = await api.aiExpand(c.name)
    store.showToast(`「${c.name}」AI 补全完成，新增 ${r.count} 条病害知识并已入图谱`, 'success')
    await loadCrops()
  } catch (e: any) {
    store.showToast(e?.message || 'AI 补全失败，请稍后重试', 'error')
  } finally {
    aiBusy.value = ''
  }
}
const openSubmit = (name = '') => {
  submitPreset.value = name
  submitOpen.value = true
}
const onSubmitted = () => {
  submitPreset.value = ''
  loadCrops()
  loadSubmissions()
}

const goDiagnose = (id: string) => {
  store.setCrop(id)
  detailCrop.value = null
  router.push('/diagnose')
}

const fmt = (iso: string) => (iso ? iso.slice(5, 10).replace('-', '/') : '—')

/** 审核中数量（仅用于轻提示文案） */
const pendingCount = computed(() => mySubmissions.value.filter((s) => s.status === 'pending').length)

const hueOf = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360
  return h
}
</script>

<template>
  <div class="kl">
    <PageHero
      wide-only
      emoji="🌿"
      title="病害图谱速查"
      desc="按地区查阅已收录作物与对应病害，可补充家乡作物共建图谱"
      badge="共建共享"
      badge-icon="leaf"
      image="/media/banners/b39452374_wide.jpg"
      :tags="['知识库 + 地区百科', '农户提交 · 专家核验', '一键跳转病害详情']"
      @badge-click="openSubmit()"
    />

    <!-- 顶部信息条 -->
    <section class="kl__top">
      <div class="kl__top-left">
        <div class="kl__loc">
          <RegionPicker />
        </div>
        <p class="kl__loc-tip">
          <AppIcon name="map-pin" :size="11" />
          当前查看 <b>{{ store.cropsProvince }}</b> · {{ store.region }} 的作物图谱
        </p>
      </div>
    </section>

    <!-- 统计卡 -->
    <section class="kl__stats">
      <div class="kl-stat">
        <strong>{{ counts.local }}</strong>
        <span>本地产区作物</span>
      </div>
      <div class="kl-stat">
        <strong>{{ counts.disease }}</strong>
        <span>收录病害</span>
      </div>
      <div class="kl-stat">
        <strong>{{ counts.community }}</strong>
        <span>农户共建</span>
      </div>
      <button class="kl-stat kl-stat--btn" @click="openSubmit()">
        <strong><AppIcon name="plus" :size="15" /></strong>
        <span>补充作物</span>
      </button>
    </section>

    <!-- 搜索 -->
    <div class="kl__search">
      <AppIcon name="search" :size="15" class="kl__search-icon" />
      <input
        v-model="keyword"
        class="kl__search-input"
        placeholder="搜索作物 / 别名 / 病虫害，如：三七、锈病、花椒…"
        maxlength="16"
      />
      <button v-if="keyword" class="kl__search-clear" @click="keyword = ''">
        <AppIcon name="x" :size="12" />
      </button>
    </div>

    <!-- 筛选 -->
    <div class="kl__tabs">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="kl__tab"
        :class="{ 'is-on': tab === t.key }"
        @click="tab = t.key"
      >
        {{ t.label }}<em>{{ t.n }}</em>
      </button>
      <span class="kl__tabs-gap" />
      <button class="kl__tabs-add" @click="openSubmit(keyword)">
        <AppIcon name="plus" :size="12" /> 补充作物
      </button>
    </div>

    <!-- 作物网格 -->
    <div v-if="filtered.length" class="kl__grid">
      <button
        v-for="c in filtered"
        :key="c.id"
        class="kl-card"
        :style="{ '--h': hueOf(c.name) }"
        @click="openCrop(c)"
      >
        <span class="kl-card__top">
          <CropEmoji class="kl-card__emoji" :emoji="c.emoji" :name="c.name" :size="24" />
          <span
            class="kl-card__badge"
            :class="{
              'is-kb': c.diagnosable,
              'is-cm': c.source === 'community',
              'is-at': c.source === 'atlas'
            }"
          >
            {{ c.source === 'community' ? '共建' : c.diagnosable ? '可诊断' : '百科' }}
          </span>
        </span>
        <span class="kl-card__name">{{ c.name }}</span>
        <span class="kl-card__desc">{{ c.desc || c.tagline || c.alias }}</span>
        <span class="kl-card__foot">
          <span v-if="c.diseaseCount" class="kl-card__chip">{{ c.diseaseCount }} 种病害</span>
          <span v-else-if="c.season" class="kl-card__chip">上市 {{ c.season }}</span>
          <span v-if="c.altitude" class="kl-card__chip kl-card__chip--ghost">{{ c.altitude }}</span>
        </span>
        <span
          v-if="store.isExpert && !c.diagnosable"
          class="kl-card__ai"
          role="button"
          :title="`用 AI 为「${c.name}」生成常见病害知识并入库`"
          @click.stop="aiExpand(c)"
        >
          {{ aiBusy === c.id ? '🤖 生成中…' : '🤖 AI 补全病害' }}
        </span>
      </button>

      <!-- 补充卡 -->
      <button class="kl-card kl-card--add" @click="openSubmit(keyword)">
        <span class="kl-card__plus"><AppIcon name="plus" :size="20" /></span>
        <span class="kl-card__name">{{ keyword ? `提交「${keyword}」` : '补充本地作物' }}</span>
        <span class="kl-card__desc">提交家乡作物资料，专家核验后并入图谱</span>
      </button>
    </div>

    <div v-else class="kl__empty">
      <AppIcon name="search" :size="30" />
      <p>没有找到相关作物</p>
      <button class="kl__empty-btn" @click="openSubmit(keyword)">把它提交到共建图谱</button>
    </div>

    <!-- 我的共建进度：完整列表统一在个人中心「我的作物共建」查看，此处只做轻提示 -->
    <button v-if="store.user" class="kl__mine-link" @click="router.push('/profile#contrib')">
      <span class="kl__mine-link__ico"><AppIcon name="edit" :size="14" /></span>
      <span class="kl__mine-link__txt">
        <strong>我的作物共建</strong>
        <small>
          <template v-if="mySubmissions.length">
            已提交 {{ mySubmissions.length }} 个作物 · {{ pendingCount }} 个审核中，去个人中心查看进度
          </template>
          <template v-else>还没有提交记录，补充一个家乡作物帮助同乡农户</template>
        </small>
      </span>
      <AppIcon name="arrow-right" :size="14" class="kl__mine-link__arrow" />
    </button>

    <!-- 共建流程说明 -->
    <section class="kl__flow">
      <h3>共建流程</h3>
      <div class="kl-flow">
        <div class="kl-flow__item">
          <span class="kl-flow__n">1</span>
          <strong>农户提交</strong>
          <small>填写作物名称、产地、病虫害</small>
        </div>
        <span class="kl-flow__arrow"><AppIcon name="arrow-right" :size="14" /></span>
        <div class="kl-flow__item">
          <span class="kl-flow__n">2</span>
          <strong>专家核验</strong>
          <small>农技站核对资料准确性</small>
        </div>
        <span class="kl-flow__arrow"><AppIcon name="arrow-right" :size="14" /></span>
        <div class="kl-flow__item">
          <span class="kl-flow__n">3</span>
          <strong>并入图谱</strong>
          <small>全站同产区用户可见</small>
        </div>
      </div>
    </section>

    <CropDetailSheet
      :crop="detailCrop"
      @close="detailCrop = null"
      @diagnose="goDiagnose"
      @contribute="openSubmit(detailCrop?.name || '')"
    />
    <CropSubmitSheet
      :open="submitOpen"
      :preset-name="submitPreset"
      @close="submitOpen = false"
      @submitted="onSubmitted"
    />
  </div>
</template>

<style scoped>
.kl {
  padding: 0 16px 40px;
}

/* 顶部信息条 */
.kl__top {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: var(--r-lg);
  background: linear-gradient(100deg, #f2f9f5, #fbfdfb);
  border: 1px solid #dcece2;
}

.kl__top-left {
  flex: 1;
  min-width: 0;
}

.kl__loc-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--c-text-4);
}

.kl__loc-tip b {
  color: var(--c-primary-700);
}


/* 统计 */
.kl__stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.kl-stat {
  padding: 12px 6px 10px;
  border-radius: 14px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  text-align: center;
  box-shadow: var(--sh-xs);
}

.kl-stat strong {
  display: block;
  font-size: 20px;
  font-weight: 800;
  color: var(--c-primary-700);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.kl-stat span {
  font-size: 11.5px;
  color: var(--c-text-4);
}

/* 统计卡中的「补充作物」按钮 */
.kl-stat--btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 1px dashed var(--c-primary-300, var(--c-primary-200));
  background: var(--c-primary-50);
  color: var(--c-primary-700);
}

.kl-stat--btn strong {
  display: grid;
  place-items: center;
  height: 22px;
  color: var(--c-primary-600);
}

.kl-stat--btn span {
  color: var(--c-primary-700);
  font-weight: 700;
}

/* 搜索 */
.kl__search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  background: var(--c-bg-card);
  border: 1.5px solid var(--c-line);
  transition: border-color var(--dur-fast), box-shadow var(--dur-fast);
}

.kl__search:focus-within {
  border-color: var(--c-primary-400);
  box-shadow: 0 0 0 3px rgba(var(--c-primary-rgb), 0.1);
}

.kl__search-icon {
  color: var(--c-text-4);
  flex-shrink: 0;
}

.kl__search-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  color: var(--c-text-1);
}

.kl__search-clear {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--c-bg-muted);
  color: var(--c-text-3);
}

/* 筛选 */
.kl__tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

/* 补充作物：筛选行右侧主动作（唯一新建入口） */
.kl__tabs-gap {
  flex: 1;
}

.kl__tabs-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 13px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  border: none;
  box-shadow: 0 5px 14px rgba(var(--c-primary-rgb), 0.26);
}

.kl__tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-3);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  transition: all var(--dur-fast);
}

.kl__tab em {
  font-style: normal;
  font-size: 11.5px;
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--c-bg-muted);
  color: var(--c-text-4);
}

.kl__tab.is-on {
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  border-color: transparent;
  box-shadow: 0 5px 14px rgba(var(--c-primary-rgb), 0.26);
}

.kl__tab.is-on em {
  background: rgba(255, 255, 255, 0.24);
  color: #fff;
}

/* 网格 */
.kl__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 14px;
}

.kl-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 13px 13px 12px;
  border-radius: var(--r-lg);
  text-align: left;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  overflow: hidden;
  transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast);
}

.kl-card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: hsl(var(--h) 55% 62%);
  opacity: 0.75;
}

.kl-card:active {
  transform: scale(0.985);
}

.kl-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.kl-card__emoji {
  font-size: 24px;
  line-height: 1;
}

.kl-card__badge {
  font-size: 11.5px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--c-bg-muted);
  color: var(--c-text-4);
}

.kl-card__badge.is-kb {
  background: #e8f7ee;
  color: #1a7f45;
}

.kl-card__badge.is-at {
  background: #eef0ff;
  color: #4a53b8;
}

.kl-card__badge.is-cm {
  background: #fff2dd;
  color: #a8650a;
}

.kl-card__name {
  font-size: 14px;
  font-weight: 800;
  color: var(--c-text-1);
}

.kl-card__desc {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--c-text-4);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 34px;
}

.kl-card__foot {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
}

.kl-card__chip {
  font-size: 11.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--c-primary-50);
  color: var(--c-primary-700);
}

.kl-card__chip--ghost {
  background: var(--c-bg-muted);
  color: var(--c-text-4);
}

/* AI 补全按钮（专家可见，覆盖在卡片右下） */
.kl-card__ai {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 5px 11px;
  border-radius: var(--r-full);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
  cursor: pointer;
  transition: all var(--dur-fast);
  z-index: 1;
}

.kl-card__ai:hover {
  background: var(--c-primary-600);
  color: #fff;
  border-color: var(--c-primary-600);
}

.kl-card--add {
  align-items: center;
  justify-content: center;
  text-align: center;
  border-style: dashed;
  border-color: var(--c-primary-300, #a9d8bd);
  background: linear-gradient(160deg, #f3faf6, #fff);
  min-height: 130px;
}

.kl-card--add::before {
  display: none;
}

.kl-card__plus {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  margin-bottom: 2px;
}

/* 空态 */
.kl__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 20px;
  color: var(--c-text-4);
}

.kl__empty p {
  font-size: 13px;
}

.kl__empty-btn {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-primary-700);
  padding: 8px 18px;
  border-radius: 999px;
  background: var(--c-primary-50);
}

/* 我的共建：轻量跳转条，完整列表在个人中心 */
.kl__mine-link {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  margin-top: 16px;
  padding: 13px 14px;
  border-radius: 15px;
  background: linear-gradient(135deg, var(--c-primary-50), var(--c-bg-card) 70%);
  border: 1px solid var(--c-primary-200);
  text-align: left;
  transition: all var(--dur-fast);
}

.kl__mine-link:active {
  transform: scale(0.985);
}

.kl__mine-link__ico {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: var(--c-primary-600);
  color: #fff;
  flex-shrink: 0;
}

.kl__mine-link__txt {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kl__mine-link__txt strong {
  font-size: 12.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.kl__mine-link__txt small {
  font-size: 11.5px;
  color: var(--c-text-3);
  line-height: 1.4;
}

.kl__mine-link__arrow {
  color: var(--c-primary-600);
  flex-shrink: 0;
}

/* 流程 */
.kl__flow {
  margin-top: 16px;
  padding: 15px;
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
}

.kl__flow h3 {
  font-size: 13px;
  font-weight: 800;
  color: var(--c-text-1);
  margin-bottom: 12px;
}

.kl-flow {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kl-flow__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 3px;
}

.kl-flow__n {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 12.5px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-400), var(--c-primary-700));
  margin-bottom: 2px;
}

.kl-flow__item strong {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-1);
}

.kl-flow__item small {
  font-size: 11.5px;
  color: var(--c-text-4);
  line-height: 1.5;
}

.kl-flow__arrow {
  flex-shrink: 0;
  color: var(--c-line);
  margin-bottom: 14px;
}

@media (min-width: 960px) {
  .kl {
    max-width: var(--max-w-mobile);
    margin: 0 auto;
    padding: 0 24px 48px;
  }

  .kl__grid {
    grid-template-columns: repeat(4, 1fr);
    gap: 18px;
  }
}
</style>
