<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import WeatherWidget from '@/components/WeatherWidget.vue'
import RegionPicker from '@/components/RegionPicker.vue'
import AlertDetailModal from '@/components/AlertDetailModal.vue'
import CropDetailSheet from '@/components/CropDetailSheet.vue'
import CropSubmitSheet from '@/components/CropSubmitSheet.vue'
import UserMenu from '@/components/UserMenu.vue'
import { provinceOfRegion } from '@/data/regions'
import { CITY_SPECIALTY } from '@/data/cityCrops'
import api from '@/api'
import type { AlertResponse } from '@/types'

const router = useRouter()
const store = useAppStore()

const alert = ref<AlertResponse | null>(null)
const loadingAlert = ref(true)

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const alertTone = computed(() => {
  const l = alert.value?.level
  if (l === 'red') return { color: 'var(--c-danger)', bg: 'var(--c-danger-bg)', text: '紧急' }
  if (l === 'orange') return { color: 'var(--c-accent-500)', bg: 'var(--c-accent-100)', text: '重点' }
  if (l === 'yellow') return { color: '#b8860b', bg: '#fef9e7', text: '关注' }
  return { color: 'var(--c-primary-600)', bg: 'var(--c-primary-50)', text: '平稳' }
})

onMounted(async () => {
  bannerRestart()
  try {
    await store.loadCrops()
  } catch {
    /* 首页不阻断 */
  }
  try {
    // 6 秒超时兜底：后端未就绪/网络挂起时不再让骨架屏一直转
    alert.value = await Promise.race([
      api.alerts(14, store.region),
      new Promise<null>((r) => setTimeout(() => r(null), 6000)),
    ])
  } catch {
    /* 预警失败不阻断 */
  } finally {
    loadingAlert.value = false
  }
})

onBeforeUnmount(() => {
  if (bannerTimer) clearInterval(bannerTimer)
})

/** 地区切换后预警/风险也跟随刷新 */
watch(
  () => store.region,
  async () => {
    loadingAlert.value = true
    try {
      alert.value = await Promise.race([
        api.alerts(14, store.region),
        new Promise<null>((r) => setTimeout(() => r(null), 6000))
      ])
    } catch {
      /* 预警失败不阻断 */
    } finally {
      loadingAlert.value = false
    }
  }
)

const goDiagnose = (cropId?: string) => {
  if (cropId) store.setCrop(cropId)
  router.push('/diagnose')
}

const badges = ['多模态识图', 'RAG 检索增强', '双 Agent 协作', '流式输出', '天气工具联动']

// ===== Hero 图片轮播 =====
const banners = [
  { img: '/media/banners/b39452374.jpg', title: '云端梯田 · 山地作物的家园' },
  { img: '/media/banners/b35872964.jpg', title: '雾绕山间 · 云岭特色作物带' },
  { img: '/media/banners/b36813325.jpg', title: '梯田农舍 · 传统耕作的智慧' },
  { img: '/media/banners/b39686331.jpg', title: '晨雾群山 · 生态种植屏障' },
  { img: '/media/banners/b32742909.jpg', title: '高山云雾 · 天然病害防线' },
]
const bannerCur = ref(0)
let bannerTimer: ReturnType<typeof setInterval> | null = null
const bannerGo = (i: number) => {
  bannerCur.value = (i + banners.length) % banners.length
  bannerRestart()
}
const bannerNext = () => bannerGo(bannerCur.value + 1)
const bannerPrev = () => bannerGo(bannerCur.value - 1)
const bannerRestart = () => {
  if (bannerTimer) clearInterval(bannerTimer)
  bannerTimer = setInterval(() => {
    bannerCur.value = (bannerCur.value + 1) % banners.length
  }, 5000)
}

const showAlertDetail = ref(false)

// ===== 作物搜索 + 本地分组 =====
const cropKeyword = ref('')
const localProvince = computed(() => provinceOfRegion(store.region) || store.cropsProvince)

/** 地区筛选：全部 / 本地 / 知识库 / 共建 */
const cropTab = ref<'all' | 'local' | 'kb' | 'community'>('all')

/** 是否为当前地区作物（用 store 已算好的本地集合，避免省份识别失败） */
const isLocalCrop = (c: { id: string; regions?: string[] }) =>
  store.localCrops.some((x) => x.id === c.id)

/** 当前州市主推作物（如 文山市→三七、红河州→石榴），严格与所选地区对应 */
const cityFeaturedIds = computed(() => CITY_SPECIALTY[store.region] || [])
const isCityFeatured = (id: string) => cityFeaturedIds.value.includes(id)

/** 本地知识库作物（可诊断；州市主推置顶） */
const localKbCrops = computed(() => {
  const list = (store.crops as any[]).filter((c) => c.diagnosable && isLocalCrop(c))
  if (!cityFeaturedIds.value.length) return list
  return [
    ...list.filter((c) => isCityFeatured(c.id)),
    ...list.filter((c) => !isCityFeatured(c.id))
  ]
})

/** 本地百科作物（知识库未收录，地区图谱） */
const localAtlasCrops = computed(() =>
  (store.crops as any[]).filter((c) => !c.diagnosable && isLocalCrop(c))
)

/** 其他地区知识库作物（跨区可用） */
const otherCrops = computed(() =>
  (store.crops as any[]).filter((c) => c.diagnosable && !isLocalCrop(c))
)

const filteredCrops = computed(() => {
  const k = cropKeyword.value.trim()
  let list = store.crops as any[]
  if (k) {
    list = list.filter(
      (c) => c.name.includes(k) || (c.alias || '').includes(k) || (c.desc || c.tagline || '').includes(k)
    )
  }
  if (cropTab.value === 'local') list = list.filter(isLocalCrop)
  if (cropTab.value === 'kb') list = list.filter((c) => c.diagnosable)
  if (cropTab.value === 'community') list = list.filter((c) => c.source === 'community')
  return list
})

const tabCount = computed(() => ({
  all: store.crops.length,
  local: (store.crops as any[]).filter(isLocalCrop).length,
  kb: (store.crops as any[]).filter((c) => c.diagnosable).length,
  community: (store.crops as any[]).filter((c) => c.source === 'community').length
}))

const tabs = computed(() => [
  { key: 'all', label: '全部', n: tabCount.value.all },
  { key: 'local', label: '本地', n: tabCount.value.local },
  { key: 'kb', label: '可诊断', n: tabCount.value.kb },
  { key: 'community', label: '农户共建', n: tabCount.value.community }
])

// 作物详情 / 提交弹层
const detailCrop = ref<any>(null)
const submitOpen = ref(false)
const submitPreset = ref('')

const openCrop = (c: any) => {
  detailCrop.value = c
}

const goDiagnoseFromDetail = (id: string) => {
  detailCrop.value = null
  goDiagnose(id)
}

const openSubmit = (preset = '') => {
  submitPreset.value = preset
  detailCrop.value = null
  submitOpen.value = true
}

const onSubmitted = () => {
  store.loadCrops(true).catch(() => {})
}

/** 徽标配色（按作物名生成稳定色相，避免全部同色） */
const hueOf = (name: string) => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
}
</script>

<template>
  <div class="home">
    <!-- ===== 顶部 Hero ===== -->
    <header class="hero">
      <div class="hero__bg">
        <!-- 真实图片轮播 -->
        <img
          v-for="(b, i) in banners"
          :key="b.img"
          :src="b.img"
          :alt="b.title"
          class="hero__slide"
          :class="{ 'is-on': i === bannerCur }"
        />
        <div class="hero__mountain"></div>
        <div class="hero__glow"></div>
        <!-- 底部说明 + 圆点 + 箭头 -->
        <div class="hero__carousel">
          <span class="hero__cap">{{ banners[bannerCur].title }}</span>
          <div class="hero__dots">
            <button
              v-for="(b, i) in banners"
              :key="'d' + i"
              class="hero__dot"
              :class="{ 'is-on': i === bannerCur }"
              :aria-label="`第${i + 1}张`"
              @click="bannerGo(i)"
            />
          </div>
          <div class="hero__arrows">
            <button class="hero__arrow" aria-label="上一张" @click="bannerPrev">‹</button>
            <button class="hero__arrow" aria-label="下一张" @click="bannerNext">›</button>
          </div>
        </div>
      </div>

      <div class="hero__content">
        <div class="hero__top">
          <div class="hero__brand">
            <div class="hero__logo">
              <AppIcon name="leaf" :size="18" :stroke="2.2" />
            </div>
            <span class="hero__name">云岭农诊</span>
          </div>
          <RegionPicker />
          <!-- 移动端用户区（宽屏时隐藏：顶部导航已有同一组件，避免重复） -->
          <UserMenu class="hero__um" />
        </div>

        <h1 class="hero__title">
          {{ greeting }}，<br />
          <span class="hero__title-accent">给作物看看病吧</span>
        </h1>
        <p class="hero__desc">
          拍张照片，AI 农技员帮您判断病虫害<br />
          针对云南山地作物专门优化
        </p>

        <button class="hero__cta" @click="goDiagnose()">
          <span class="hero__cta-icon"><AppIcon name="camera" :size="22" :stroke="2" /></span>
          <span class="hero__cta-text">
            <strong>拍照诊断</strong>
            <small>上传病叶照片，30 秒出结果</small>
          </span>
          <AppIcon name="arrow-right" :size="18" />
        </button>

        <div class="hero__badges">
          <span v-for="b in badges" :key="b" class="hero__badge">{{ b }}</span>
        </div>
      </div>
    </header>

    <!-- ===== 天气与风险 ===== -->
    <section class="section weather-section">
      <!-- 天气提示跟随地区主推作物（如普洱市→茶树），未配置主推时回退到当前选中作物 -->
      <WeatherWidget
        :region="store.region"
        :crop-id="cityFeaturedIds[0] || store.selectedCropId || undefined"
      />
    </section>

    <!-- ===== 区域预警 ===== -->
    <section class="section">
      <div v-if="loadingAlert" class="skeleton-alert">
        <div class="sk-line" style="width: 40%"></div>
        <div class="sk-line" style="width: 80%"></div>
      </div>

      <button
        v-else-if="alert"
        class="alert-card"
        :style="{ '--tone': alertTone.color, '--tone-bg': alertTone.bg }"
        @click="showAlertDetail = true"
      >
        <div class="alert-card__head">
          <span class="alert-card__tag">
            <AppIcon name="alert" :size="12" />
            区域预警 · {{ alertTone.text }}
          </span>
          <span class="alert-card__days">近 {{ alert.stats.days }} 天</span>
        </div>
        <h3 class="alert-card__headline">{{ alert.headline }}</h3>
        <p class="alert-card__text">{{ alert.analysis }}</p>
        <ul class="alert-card__actions">
          <li v-for="(a, i) in alert.actions.slice(0, 2)" :key="i">
            <span class="alert-card__dot"></span>{{ a }}
          </li>
        </ul>
        <span class="alert-card__more">
          <AppIcon name="chart" :size="11" />
          查看高发病害排行与详情
          <AppIcon name="arrow-right" :size="11" />
        </span>
      </button>

      <div v-else class="alert-card alert-card--calm">
        <span class="alert-card__tag">
          <AppIcon name="check-circle" :size="12" />
          区域预警 · 平稳
        </span>
        <p class="alert-card__text">近 14 天本区域暂无高发病害预警，可按常规节奏进行田间管理。</p>
      </div>
    </section>

    <!-- ===== 地区作物百科 ===== -->
    <section class="section">
      <div class="section__head">
        <h2 class="section__title">
          <span class="section__title-cn">{{ localProvince }}·{{ store.region }} 作物图谱</span>
          <span class="section__title-en">CROP ATLAS<i></i></span>
          <span class="section__local">{{ tabCount.local }} 种在地作物</span>
        </h2>
        <span class="section__more" @click="router.push('/knowledge')">
          病害图谱 <i class="section__more-sq">›</i>
        </span>
      </div>

      <!-- 作物搜索 -->
      <div class="crop-search">
        <AppIcon name="search" :size="14" class="crop-search__icon" />
        <input
          v-model="cropKeyword"
          class="crop-search__input"
          placeholder="搜索作物，如：三七、咖啡、石榴、苹果…"
          maxlength="10"
        />
        <button v-if="cropKeyword" class="crop-search__clear" @click="cropKeyword = ''">
          <AppIcon name="x" :size="12" />
        </button>
      </div>

      <!-- 筛选胶囊 -->
      <div class="crop-tabs">
        <button
          v-for="t in tabs"
          :key="t.key"
          class="crop-tab"
          :class="{ 'is-on': cropTab === t.key }"
          @click="cropTab = t.key as any"
        >
          {{ t.label }}<em v-if="t.n">{{ t.n }}</em>
        </button>
      </div>

      <!-- 分支一：无搜索时按「本地可诊断 / 本地图谱 / 其他区域」分组 -->
      <template v-if="!cropKeyword && cropTab === 'all'">
        <div v-if="localKbCrops.length" class="crop-group" v-reveal="60">
          <div class="crop-group__head">
            <span class="crop-group__dot crop-group__dot--kb" />
            <h3>{{ store.region }}主栽 · 可 AI 诊断</h3>
            <span class="crop-group__hint">含{{ localProvince }}其他产区作物</span>
          </div>
          <div class="atlas-grid">
            <button
              v-for="c in localKbCrops"
              :key="c.id"
              class="atlas-card atlas-card--kb"
              :style="{ '--h': hueOf(c.name) }"
              @click="openCrop(c)"
            >
              <span class="atlas-card__glow" />
              <span class="atlas-card__top">
                <span class="atlas-card__emoji">{{ c.emoji }}</span>
                <span v-if="isCityFeatured(c.id)" class="atlas-card__badge atlas-card__badge--city">主推</span>
                <span class="atlas-card__badge">可诊断</span>
              </span>
              <span class="atlas-card__name">{{ c.name }}</span>
              <span class="atlas-card__desc">{{ c.tagline || c.desc }}</span>
              <span class="atlas-card__foot">
                <span class="atlas-card__chip">{{ c.diseaseCount }} 种病害</span>
                <span v-if="c.altitude" class="atlas-card__chip atlas-card__chip--ghost">{{ c.altitude }}</span>
              </span>
            </button>
          </div>
        </div>

        <div v-if="localAtlasCrops.length" class="crop-group" v-reveal="100">
          <div class="crop-group__head">
            <span class="crop-group__dot crop-group__dot--atlas" />
            <h3>本地特色 · 图谱收录</h3>
            <span class="crop-group__hint">地标农产品，病害资料持续共建</span>
          </div>
          <div class="atlas-grid">
            <button
              v-for="c in localAtlasCrops"
              :key="c.id"
              class="atlas-card atlas-card--atlas"
              :style="{ '--h': hueOf(c.name) }"
              @click="openCrop(c)"
            >
              <span class="atlas-card__glow" />
              <span class="atlas-card__top">
                <span class="atlas-card__emoji">{{ c.emoji }}</span>
                <span v-if="c.source === 'community'" class="atlas-card__badge atlas-card__badge--cm">共建</span>
                <span v-else class="atlas-card__badge atlas-card__badge--atlas">百科</span>
              </span>
              <span class="atlas-card__name">{{ c.name }}</span>
              <span class="atlas-card__desc">{{ c.desc }}</span>
              <span class="atlas-card__foot">
                <span v-if="c.season" class="atlas-card__chip">上市 {{ c.season }}</span>
                <span v-if="c.altitude" class="atlas-card__chip atlas-card__chip--ghost">{{ c.altitude }}</span>
              </span>
            </button>

            <!-- 提交入口卡 -->
            <button class="atlas-card atlas-card--add" @click="openSubmit()">
              <span class="atlas-card__plus"><AppIcon name="plus" :size="18" /></span>
              <span class="atlas-card__name">补充本地作物</span>
              <span class="atlas-card__desc">提交家乡作物，专家审核后并入图谱</span>
            </button>
          </div>
        </div>

        <div v-if="otherCrops.length" class="crop-group" v-reveal="140">
          <div class="crop-group__head">
            <span class="crop-group__dot crop-group__dot--other" />
            <h3>其他区域作物</h3>
            <span class="crop-group__hint">跨区查询同样支持诊断</span>
          </div>
          <div class="crop-mini-grid">
            <button v-for="c in otherCrops" :key="c.id" class="crop-mini" @click="openCrop(c)">
              <span class="crop-mini__emoji">{{ c.emoji }}</span>
              <span class="crop-mini__name">{{ c.name }}</span>
              <span class="crop-mini__meta">{{ c.diseaseCount }} 病</span>
            </button>
          </div>
        </div>
      </template>

      <!-- 分支二：搜索或筛选状态，平铺展示 -->
      <template v-else>
        <div class="atlas-grid" v-reveal="60">
          <button
            v-for="c in filteredCrops"
            :key="c.id"
            class="atlas-card"
            :class="c.diagnosable ? 'atlas-card--kb' : 'atlas-card--atlas'"
            :style="{ '--h': hueOf(c.name) }"
            @click="openCrop(c)"
          >
            <span class="atlas-card__glow" />
            <span class="atlas-card__top">
              <span class="atlas-card__emoji">{{ c.emoji }}</span>
              <span v-if="isLocalCrop(c)" class="atlas-card__badge">本地</span>
              <span v-else class="atlas-card__badge atlas-card__badge--atlas">
                {{ c.source === 'community' ? '共建' : c.diagnosable ? '可诊断' : '百科' }}
              </span>
            </span>
            <span class="atlas-card__name">{{ c.name }}</span>
            <span class="atlas-card__desc">{{ c.desc || c.tagline }}</span>
            <span class="atlas-card__foot">
              <span v-if="c.diagnosable" class="atlas-card__chip">{{ c.diseaseCount }} 种病害</span>
              <span v-else-if="c.season" class="atlas-card__chip">上市 {{ c.season }}</span>
              <span v-if="c.altitude" class="atlas-card__chip atlas-card__chip--ghost">{{ c.altitude }}</span>
            </span>
          </button>
        </div>

        <div v-if="!filteredCrops.length" class="crop-empty">
          没有找到「{{ cropKeyword }}」相关作物
          <button class="crop-empty__btn" @click="openSubmit(cropKeyword)">提交它到作物图谱</button>
        </div>
      </template>
    </section>

    <!-- 作物详情 & 提交 -->
    <CropDetailSheet
      :crop="detailCrop"
      @close="detailCrop = null"
      @diagnose="goDiagnoseFromDetail"
      @contribute="openSubmit(detailCrop?.name || '')"
    />
    <CropSubmitSheet
      :open="submitOpen"
      :preset-name="submitPreset"
      @close="submitOpen = false"
      @submitted="onSubmitted"
    />

    <!-- ===== 功能入口 ===== -->
    <section class="section">
      <h2 class="section__title">
        <span class="section__title-cn">常用功能</span>
        <span class="section__title-en">QUICK TOOLS<i></i></span>
      </h2>
      <div class="feature-list" v-reveal="100">
        <button class="feature" @click="router.push('/qa')">
          <span class="feature__icon feature__icon--blue">
            <AppIcon name="chat" :size="19" />
          </span>
          <span class="feature__body">
            <strong>农技问答</strong>
            <small>用大白话问，AI 从植保手册里找答案</small>
          </span>
          <AppIcon name="arrow-right" :size="16" class="feature__arrow" />
        </button>

        <button class="feature" @click="router.push('/archive')">
          <span class="feature__icon feature__icon--amber">
            <AppIcon name="archive" :size="19" />
          </span>
          <span class="feature__body">
            <strong>我的种植档案</strong>
            <small>记录每次诊断，AI 帮您复盘规律</small>
          </span>
          <AppIcon name="arrow-right" :size="16" class="feature__arrow" />
        </button>

        <button class="feature" @click="router.push('/knowledge')">
          <span class="feature__icon feature__icon--green">
            <AppIcon name="book" :size="19" />
          </span>
          <span class="feature__body">
            <strong>病害图谱</strong>
            <small>34 种特色作物病害，覆盖 10 种山地作物，图文对照</small>
          </span>
          <AppIcon name="arrow-right" :size="16" class="feature__arrow" />
        </button>

        <button class="feature" @click="router.push('/ask-expert')">
          <span class="feature__icon feature__icon--purple">
            <AppIcon name="user" :size="19" />
          </span>
          <span class="feature__body">
            <strong>向专家提问</strong>
            <small>按作物与地区推荐对口专家，一对一咨询</small>
          </span>
          <AppIcon name="arrow-right" :size="16" class="feature__arrow" />
        </button>
      </div>
    </section>

    <!-- ===== 底部说明 ===== -->
    <AlertDetailModal :show="showAlertDetail" :alert="alert" @close="showAlertDetail = false" />

    <footer class="foot">
      <div class="foot__inner">
        <div class="foot__brand">
          <span class="foot__logo">🌿</span>
          <div class="foot__brand-txt">
            <strong>云岭农诊</strong>
            <small>山地特色经济作物病虫害多 Agent 诊断系统</small>
          </div>
        </div>
        <nav class="foot__links">
          <span @click="router.push('/diagnose')">智能诊断</span>
          <i></i>
          <span @click="router.push('/knowledge')">病害图谱</span>
          <i></i>
          <span @click="router.push('/qa')">农技问答</span>
          <i></i>
          <span @click="router.push('/archive')">种植档案</span>
        </nav>
      </div>
      <div class="foot__badge">
        <AppIcon name="shield" :size="13" />
        AI 诊断仅供参考，不替代专业农技人员指导
      </div>
    </footer>
  </div>
</template>

<style scoped>
.home {
  padding-bottom: 16px;
}

/* ===== Hero ===== */
.hero {
  position: relative;
  padding: 0 20px 28px;
  overflow: hidden;
}

.hero__bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: linear-gradient(165deg, #10362a 0%, #1a5a41 45%, #25795a 100%);
  border-radius: 0 0 32px 32px;
}

/* 轮播图层 */
.hero__slide {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.9s ease;
}
.hero__slide.is-on {
  opacity: 1;
}

/* 轮播之上压暗遮罩，保证文字可读 */
.hero__bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(7, 28, 19, 0.62) 0%, rgba(9, 36, 24, 0.42) 45%, rgba(5, 22, 14, 0.78) 100%),
    linear-gradient(90deg, rgba(7, 30, 20, 0.5), transparent 55%);
  border-radius: 0 0 32px 32px;
}

/* 轮播控制条 */
.hero__carousel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px 14px;
}
.hero__cap {
  flex: 1;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.88);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hero__dots {
  display: flex;
  gap: 6px;
  align-items: center;
}
.hero__dot {
  width: 7px;
  height: 7px;
  border-radius: 99px;
  border: none;
  padding: 0;
  background: rgba(255, 255, 255, 0.42);
  cursor: pointer;
  transition: all 0.3s;
}
.hero__dot.is-on {
  width: 20px;
  background: #fff;
}
.hero__arrows {
  display: flex;
  gap: 8px;
}
.hero__arrow {
  width: 28px;
  height: 28px;
  border-radius: 99px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background 0.25s;
}
.hero__arrow:hover {
  background: rgba(0, 0, 0, 0.5);
}

/* 山峦剪影 */
.hero__mountain {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 120px;
  background:
    radial-gradient(ellipse 60% 100% at 15% 100%, rgba(255, 255, 255, 0.07) 0%, transparent 70%),
    radial-gradient(ellipse 70% 100% at 85% 100%, rgba(255, 255, 255, 0.05) 0%, transparent 70%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 120' preserveAspectRatio='none'%3E%3Cpath d='M0 120 L60 52 L110 80 L165 28 L225 76 L285 40 L340 82 L400 48 L400 120Z' fill='rgba(255,255,255,0.05)'/%3E%3Cpath d='M0 120 L45 78 L100 98 L150 62 L210 96 L270 70 L330 100 L400 76 L400 120Z' fill='rgba(255,255,255,0.06)'/%3E%3C/svg%3E")
      bottom / 100% 100% no-repeat;
  opacity: 0.9;
}

.hero__glow {
  position: absolute;
  top: -60px;
  right: -40px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(139, 208, 172, 0.34), transparent 68%);
  filter: blur(6px);
}

.hero__content {
  position: relative;
  z-index: 1;
  padding-top: max(14px, env(safe-area-inset-top, 0px));
  color: #fff;
}

.hero__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 26px;
}

.hero__brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hero__logo {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.hero__name {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1.2px;
}

/* 宽屏隐藏 Hero 内用户区：顶栏已有同款，避免重复 */
.hero__um {
  display: flex;
}

@media (min-width: 960px) {
  .hero__um {
    display: none;
  }
}

.hero__region {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.13);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.94);
  font-size: 12px;
  font-weight: 500;
  backdrop-filter: blur(8px);
}

.hero__title {
  font-size: 27px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.3px;
  margin-bottom: 10px;
}

.hero__title-accent {
  background: linear-gradient(100deg, #a8e6c4, #6fd3a4 60%, #c5f0da);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero__desc {
  font-size: 13.5px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.68);
  margin-bottom: 22px;
}

.hero__cta {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 15px 17px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  text-align: left;
  transition: transform var(--dur-base) var(--ease-spring), box-shadow var(--dur-base);
}

.hero__cta:active {
  transform: scale(0.985);
}

.hero__cta-icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #fff;
  background: linear-gradient(140deg, var(--c-primary-400), var(--c-primary-700));
  box-shadow: 0 4px 14px rgba(47, 152, 104, 0.35);
}

.hero__cta-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  color: var(--c-primary-800);
}

.hero__cta-text strong {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.hero__cta-text small {
  font-size: 11.5px;
  color: var(--c-text-3);
}

.hero__cta > :deep(.icon:last-child) {
  color: var(--c-primary-500);
}

/* AI 能力徽标 */
.hero__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 14px;
}

.hero__badge {
  padding: 4px 11px;
  border-radius: var(--r-full);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: rgba(255, 255, 255, 0.88);
  background: rgba(255, 255, 255, 0.10);
  border: 1px solid rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(6px);
}

/* 天气区块 */
.weather-section {
  margin-top: 18px;
}

/* ===== 区块 ===== */
.section {
  padding: 0 20px;
  margin-top: 22px;
}

.section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section__title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.1px;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* 中文主标 + 英文小标：门户式栏目排版 */
.section__title-cn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.section__title-cn::before {
  content: '';
  width: 4px;
  height: 15px;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--c-primary-400), var(--c-primary-700));
}

.section__title-en {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 2.5px;
  color: var(--c-text-4);
  text-transform: uppercase;
  padding-left: 12px;
}

.section__title-en i {
  width: 46px;
  height: 1px;
  background: linear-gradient(90deg, var(--c-line), transparent);
}

.section__head .section__title {
  margin-bottom: 0;
}

.section__more {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 11px;
  border-radius: var(--r-full);
  font-size: 12.5px;
  color: var(--c-primary-700);
  font-weight: 600;
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-100);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}

.section__more:hover {
  background: var(--c-primary-600);
  border-color: var(--c-primary-600);
  color: #fff;
}

.section__more:hover .section__more-sq {
  transform: translateX(2px);
}

/* MORE 小方块箭头（门户风格） */
.section__more-sq {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  display: grid;
  place-items: center;
  font-style: normal;
  font-size: 13px;
  line-height: 1;
  background: var(--c-primary-600);
  color: #fff;
  transition: transform var(--dur-fast) var(--ease-out);
}

/* ===== 预警卡 ===== */
.skeleton-alert {
  padding: 18px;
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  box-shadow: var(--sh-sm);
}

.sk-line {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(90deg, #eef2f0 25%, #f6f9f7 50%, #eef2f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  margin-bottom: 9px;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.alert-card {
  width: 100%;
  display: block;
  text-align: left;
  padding: 16px 17px 15px;
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  border-left: 3px solid var(--tone);
  box-shadow: var(--sh-sm);
  transition: transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
}

.alert-card--calm {
  border-left-color: var(--c-primary-500);
  background: linear-gradient(135deg, var(--c-primary-50), var(--c-bg-card) 55%);
  cursor: default;
}

.alert-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--sh-md);
}

.alert-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 9px;
}

.alert-card__tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: var(--r-full);
  background: var(--tone-bg);
  color: var(--tone);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.alert-card__days {
  font-size: 11px;
  color: var(--c-text-4);
}

.alert-card__headline {
  font-size: 15.5px;
  font-weight: 700;
  line-height: 1.45;
  margin-bottom: 7px;
  color: var(--c-text-1);
}

.alert-card__text {
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--c-text-3);
  margin-bottom: 10px;
}

.alert-card__actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 10px;
  border-top: 1px dashed var(--c-line);
}

.alert-card__actions li {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--c-text-2);
}

.alert-card__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--tone);
  flex-shrink: 0;
  margin-top: 6px;
}

.alert-card__more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  padding-top: 9px;
  border-top: 1px dashed var(--c-line);
  width: 100%;
  font-size: 11px;
  font-weight: 700;
  color: var(--tone);
}

/* 作物搜索 */
.crop-search {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 0 14px;
  height: 42px;
  border-radius: var(--r-full);
  background: var(--c-bg-card);
  border: 1.5px solid var(--c-line);
  transition: border-color var(--dur-fast);
  box-shadow: var(--sh-xs);
}

.crop-search:focus-within {
  border-color: var(--c-primary-300);
}

.crop-search__icon {
  color: var(--c-text-4);
  flex-shrink: 0;
}

.crop-search__input {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
}

.crop-search__clear {
  color: var(--c-text-4);
  display: grid;
  place-items: center;
  padding: 4px;
}

.section__local {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--c-primary-600);
  background: var(--c-primary-50);
  border-radius: var(--r-full);
  padding: 2px 9px;
  margin-left: 7px;
  vertical-align: 2px;
}

/* ===== 筛选胶囊 ===== */
.crop-tabs {
  display: flex;
  gap: 7px;
  margin-bottom: 14px;
  overflow-x: auto;
  scrollbar-width: none;
}

.crop-tabs::-webkit-scrollbar {
  display: none;
}

.crop-tab {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  height: 31px;
  padding: 0 13px;
  border-radius: var(--r-full);
  font-size: 12px;
  font-weight: 700;
  color: var(--c-text-3);
  background: var(--c-bg-card);
  border: 1.5px solid var(--c-line-soft);
  transition: all var(--dur-fast) var(--ease-out);
}

.crop-tab em {
  font-style: normal;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  color: var(--c-text-4);
}

.crop-tab.is-on {
  background: var(--c-primary-600);
  border-color: var(--c-primary-600);
  color: #fff;
  box-shadow: 0 5px 14px rgba(var(--c-primary-rgb), 0.24);
}

.crop-tab.is-on em {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}

/* ===== 作物分组 ===== */
.crop-group {
  margin-bottom: 18px;
}

.crop-group__head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 9px;
}

.crop-group__head h3 {
  font-size: 13px;
  font-weight: 800;
  color: var(--c-text-1);
}

.crop-group__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.crop-group__dot--kb {
  background: var(--c-primary-500);
  box-shadow: 0 0 0 3px var(--c-primary-50);
}

.crop-group__dot--atlas {
  background: var(--c-accent-500);
  box-shadow: 0 0 0 3px var(--c-accent-100);
}

.crop-group__dot--other {
  background: var(--c-text-4);
  box-shadow: 0 0 0 3px var(--c-bg-muted);
}

.crop-group__hint {
  font-size: 10.5px;
  color: var(--c-text-4);
  margin-left: auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 百科式作物卡 ===== */
.atlas-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.atlas-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 13px 13px 12px;
  border-radius: 16px;
  text-align: left;
  overflow: hidden;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  transition: transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out),
    border-color var(--dur-base);
}

.atlas-card__glow {
  position: absolute;
  inset: auto -30% 40% auto;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: hsl(var(--h, 150) 58% 62%);
  opacity: 0.1;
  filter: blur(2px);
  pointer-events: none;
}

.atlas-card--kb {
  border-color: hsl(var(--h, 150) 45% 86%);
  background: linear-gradient(158deg, hsl(var(--h, 150) 52% 97%), #fff 58%);
}

.atlas-card--atlas {
  border-style: dashed;
  border-color: var(--c-line);
}

.atlas-card:active {
  transform: scale(0.975);
}

.atlas-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--sh-md);
}

.atlas-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 2px;
}

.atlas-card__emoji {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-size: 20px;
  background: hsl(var(--h, 150) 55% 95%);
  box-shadow: inset 0 0 0 1px hsl(var(--h, 150) 45% 90%);
}

.atlas-card__badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.3px;
  padding: 2px 7px;
  border-radius: var(--r-full);
  background: var(--c-primary-600);
  color: #fff;
  white-space: nowrap;
}

.atlas-card__badge--atlas {
  background: var(--c-accent-100);
  color: var(--c-accent-600);
}

.atlas-card__badge--cm {
  background: #e8f2ff;
  color: #2563eb;
}

.atlas-card__badge--city {
  background: linear-gradient(135deg, #d97706, #b45309);
  color: #fff;
}

.atlas-card__name {
  font-size: 14px;
  font-weight: 800;
  color: var(--c-text-1);
  letter-spacing: 0.2px;
  line-height: 1.3;
}

.atlas-card__desc {
  font-size: 11px;
  line-height: 1.55;
  color: var(--c-text-3);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 34px;
}

.atlas-card__foot {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: auto;
  padding-top: 4px;
}

.atlas-card__chip {
  font-size: 9.5px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: var(--r-full);
  background: hsl(var(--h, 150) 55% 94%);
  color: hsl(var(--h, 150) 42% 32%);
  white-space: nowrap;
}

.atlas-card__chip--ghost {
  background: var(--c-bg-muted);
  color: var(--c-text-4);
  font-weight: 600;
}

/* 提交入口卡 */
.atlas-card--add {
  align-items: center;
  justify-content: center;
  text-align: center;
  border: 1.5px dashed var(--c-primary-300);
  background: repeating-linear-gradient(
    135deg,
    var(--c-primary-50),
    var(--c-primary-50) 8px,
    #fff 8px,
    #fff 16px
  );
  gap: 6px;
}

.atlas-card--add .atlas-card__name {
  color: var(--c-primary-700);
  font-size: 13px;
}

.atlas-card--add .atlas-card__desc {
  font-size: 10.5px;
  color: var(--c-primary-600);
  opacity: 0.75;
  min-height: 0;
  -webkit-line-clamp: 2;
}

.atlas-card__plus {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #fff;
  color: var(--c-primary-600);
  box-shadow: 0 4px 12px rgba(var(--c-primary-rgb), 0.16);
}

/* 其他区域：紧凑胶囊 */
.crop-mini-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.crop-mini {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 11px;
  border-radius: 12px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  text-align: left;
  transition: all var(--dur-fast);
}

.crop-mini:active {
  transform: scale(0.98);
  background: var(--c-bg-muted);
}

.crop-mini__emoji {
  font-size: 16px;
  line-height: 1;
}

.crop-mini__name {
  font-size: 12px;
  font-weight: 700;
  color: var(--c-text-1);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.crop-mini__meta {
  font-size: 9.5px;
  color: var(--c-text-4);
  flex-shrink: 0;
}

.crop-empty {
  grid-column: 1 / -1;
  padding: 26px 16px;
  text-align: center;
  font-size: 12.5px;
  color: var(--c-text-4);
  background: var(--c-bg-muted);
  border-radius: var(--r-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.crop-empty__btn {
  padding: 7px 16px;
  border-radius: var(--r-full);
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: var(--c-primary-600);
}

/* ===== 功能列表 ===== */
.feature-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.feature {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 15px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  text-align: left;
  transition: all var(--dur-fast) var(--ease-out);
}

.feature:active {
  transform: scale(0.985);
  background: var(--c-bg-muted);
}

.feature__icon {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.feature__icon--blue {
  background: linear-gradient(135deg, #6b8cff, #4f6ef2);
  box-shadow: 0 4px 12px rgba(79, 110, 242, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.feature__icon--amber {
  background: linear-gradient(135deg, #ffb257, #f59221);
  box-shadow: 0 4px 12px rgba(245, 146, 33, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.feature__icon--green {
  background: linear-gradient(135deg, var(--c-primary-400), var(--c-primary-700));
  box-shadow: 0 4px 12px rgba(47, 152, 104, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.feature__icon--purple {
  background: linear-gradient(135deg, #b57bff, #8b46e8);
  box-shadow: 0 4px 12px rgba(139, 70, 232, 0.32), inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.feature__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.feature__body strong {
  font-size: 14px;
  font-weight: 600;
}

.feature__body small {
  font-size: 11.5px;
  color: var(--c-text-4);
  line-height: 1.5;
}

.feature__arrow {
  color: var(--c-text-4);
  flex-shrink: 0;
}

/* ===== 页脚 ===== */
.foot {
  padding: 36px 20px 12px;
  text-align: center;
}

.foot__inner {
  max-width: 1080px;
  margin: 0 auto 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--c-line-soft);
  text-align: left;
}

.foot__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.foot__logo {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-size: 19px;
  background: linear-gradient(135deg, var(--c-primary-50), #eaf7ef);
  border: 1px solid var(--c-primary-100);
}

.foot__brand-txt {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.foot__brand-txt strong {
  font-size: 14px;
  font-weight: 700;
  color: var(--c-text-1);
}

.foot__brand-txt small {
  font-size: 11px;
  color: var(--c-text-3);
}

.foot__links {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--c-text-3);
}

.foot__links span {
  cursor: pointer;
  transition: color var(--dur-fast);
}

.foot__links span:hover {
  color: var(--c-primary-600);
}

.foot__links i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--c-line);
}

.foot__badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 13px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
  color: var(--c-text-3);
  font-size: 11px;
  line-height: 1.5;
  margin-bottom: 12px;
}

.foot__text {
  font-size: 10.5px;
  color: var(--c-text-4);
  letter-spacing: 0.3px;
}
</style>

<style scoped>
@media (min-width: 960px) {
  .hero {
    padding: 0 32px 36px;
  }
  .hero__bg {
    border-radius: 0 0 40px 40px;
  }
  .hero__title {
    font-size: 36px;
  }
  .hero__content {
    padding-top: 32px;
  }
  .hero__cta {
    max-width: 480px;
  }
  .section {
    padding: 0 32px;
    margin-top: 30px;
  }
  .atlas-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .crop-mini-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .atlas-card {
    padding: 18px 16px 16px;
  }
  .feature-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  .feature {
    padding: 16px 18px;
  }
  .feature:hover {
    transform: translateY(-2px);
    box-shadow: var(--sh-sm);
    border-color: var(--c-primary-200);
  }
  .feature__arrow {
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .feature:hover .feature__arrow {
    transform: translateX(3px);
    color: var(--c-primary-600);
  }
  .foot {
    padding-top: 44px;
  }
}

/* ===== 大屏微调：≥1200px 适度放大，避免卡片被拉扁 ===== */
@media (min-width: 1200px) {
  .hero {
    padding: 0 36px 38px;
  }
  .hero__content {
    padding-top: 44px;
  }
  .hero__title {
    font-size: 40px;
    margin-bottom: 12px;
  }
  .hero__desc {
    font-size: 14.5px;
    margin-bottom: 24px;
  }
  .hero__cta {
    max-width: 520px;
    padding: 16px 19px;
  }
  .hero__cta-icon {
    width: 48px;
    height: 48px;
    border-radius: 15px;
  }
  .hero__top {
    margin-bottom: 30px;
  }
  .section {
    padding: 0 36px;
    margin-top: 32px;
  }
  .section__title {
    font-size: 17px;
  }
  .atlas-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 15px;
  }
  .crop-mini-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 9px;
  }
  .crop-mini {
    padding: 10px 12px;
  }
  .feature-list {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 15px;
  }
  .foot__inner {
    max-width: 100%;
  }
}
</style>
