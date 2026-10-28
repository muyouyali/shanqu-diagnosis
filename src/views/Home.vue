<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import WeatherWidget from '@/components/WeatherWidget.vue'
import RegionPicker from '@/components/RegionPicker.vue'
import AlertDetailModal from '@/components/AlertDetailModal.vue'
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
  try {
    await store.loadCrops()
  } catch {
    /* 首页不阻断 */
  }
  try {
    alert.value = await api.alerts(14)
  } catch {
    /* 预警失败不阻断 */
  } finally {
    loadingAlert.value = false
  }
})

const goDiagnose = (cropId?: string) => {
  if (cropId) store.setCrop(cropId)
  router.push('/diagnose')
}

const badges = ['多模态识图', 'RAG 检索增强', '双 Agent 协作', '流式输出', '天气工具联动']

const showAlertDetail = ref(false)
</script>

<template>
  <div class="home">
    <!-- ===== 顶部 Hero ===== -->
    <header class="hero">
      <div class="hero__bg">
        <div class="hero__mountain"></div>
        <div class="hero__glow"></div>
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
          <button class="hero__region" @click="router.push('/admin')">
            <AppIcon name="dashboard" :size="13" />
            农技站
          </button>
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
      <WeatherWidget :region="store.region" :crop-id="store.selectedCropId || undefined" />
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
    </section>

    <!-- ===== 作物快捷入口 ===== -->
    <section class="section">
      <div class="section__head">
        <h2 class="section__title">选择作物开始诊断</h2>
        <span class="section__more" @click="router.push('/knowledge')">
          病害图谱 <AppIcon name="arrow-right" :size="13" />
        </span>
      </div>

      <div class="crop-grid" v-reveal="100">
        <button
          v-for="c in store.crops"
          :key="c.id"
          class="crop-card"
          :style="{ '--crop-color': c.color }"
          @click="goDiagnose(c.id)"
        >
          <span class="crop-card__emoji">{{ c.emoji }}</span>
          <span class="crop-card__name">{{ c.name }}</span>
          <span class="crop-card__meta">{{ c.diseaseCount }} 种病害</span>
          <span class="crop-card__arrow"><AppIcon name="arrow-right" :size="14" /></span>
        </button>
      </div>
    </section>

    <!-- ===== 功能入口 ===== -->
    <section class="section">
      <h2 class="section__title">常用功能</h2>
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
            <small>26 种云南特色作物病害，图文对照</small>
          </span>
          <AppIcon name="arrow-right" :size="16" class="feature__arrow" />
        </button>
      </div>
    </section>

    <!-- ===== 底部说明 ===== -->
    <AlertDetailModal :show="showAlertDetail" :alert="alert" @close="showAlertDetail = false" />

    <footer class="foot">
      <div class="foot__badge">
        <AppIcon name="shield" :size="13" />
        AI 诊断仅供参考，不替代专业农技人员指导
      </div>
      <p class="foot__text">全国高校 AI Web 开发挑战赛 · 云南赛区</p>
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
}

.section__head .section__title {
  margin-bottom: 0;
}

.section__more {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 12.5px;
  color: var(--c-primary-600);
  font-weight: 600;
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

/* ===== 作物卡 ===== */
.crop-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.crop-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 15px 14px 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  transition: all var(--dur-base) var(--ease-out);
  overflow: hidden;
  text-align: left;
}

.crop-card::before {
  content: '';
  position: absolute;
  right: -24px;
  top: -24px;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--crop-color);
  opacity: 0.07;
}

.crop-card:active {
  transform: scale(0.975);
}

.crop-card__emoji {
  font-size: 25px;
  line-height: 1;
  margin-bottom: 6px;
}

.crop-card__name {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--c-text-1);
}

.crop-card__meta {
  font-size: 11px;
  color: var(--c-text-4);
}

.crop-card__arrow {
  position: absolute;
  right: 12px;
  bottom: 14px;
  color: var(--crop-color);
  opacity: 0.55;
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
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.feature__icon--blue {
  background: #eef2ff;
  color: #5566d8;
}
.feature__icon--amber {
  background: var(--c-accent-100);
  color: var(--c-accent-600);
}
.feature__icon--green {
  background: var(--c-primary-50);
  color: var(--c-primary-600);
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
  padding: 30px 20px 12px;
  text-align: center;
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
  .crop-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
  .crop-card {
    padding: 20px 18px 18px;
  }
  .feature-list {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 14px;
  }
  .foot {
    padding-top: 44px;
  }
}
</style>
