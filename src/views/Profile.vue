<script setup lang="ts">
/**
 * 个人中心：头像上传、资料修改、退出登录、注销账号
 */
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import SceneryBanner from '@/components/SceneryBanner.vue'
import AuthSheet from '@/components/AuthSheet.vue'
import { useAppStore } from '@/stores/app'
import { provinceOfRegion } from '@/data/regions'
import { myLocalSubs } from '@/data/localSubs'
import CropEmoji from '@/components/CropEmoji.vue'
import type { RecordItem, Consult, CropSubmission } from '@/types'

const router = useRouter()
const store = useAppStore()

const authOpen = ref(false)

const form = ref({
  nickname: '',
  phone: '',
  email: '',
  wechatId: '',
  region: '',
  title: '',
  password: ''
})
/** 专家可编辑擅长领域 */
const expertTags = ref<string[]>([])
const EXPERT_FIELDS = ['三七', '重楼', '黄精', '蓝莓', '柑橘', '茶叶', '核桃', '花椒', '芒果', '咖啡', '食用玫瑰', '草果']
const toggleTag = (f: string) => {
  const i = expertTags.value.indexOf(f)
  if (i === -1) expertTags.value = [...expertTags.value, f].slice(0, 8)
  else expertTags.value = expertTags.value.filter((x) => x !== f)
}
const avatarFile = ref('')
const saving = ref(false)
const dangerOpen = ref(false)
const dangerText = ref('')

const defaults: Record<string, string> = {
  昭通市: '苹果、天麻核心产区',
  文山市: '三七之乡',
  普洱市: '茶山与咖啡谷'
}

onMounted(async () => {
  await store.restoreUser()
  if (store.user) {
    fillForm()
    loadStats()
  }
})

const fillForm = () => {
  const u = store.user!
  form.value = {
    nickname: u.nickname,
    phone: u.phone,
    email: u.email,
    wechatId: u.wechatId,
    region: u.region || store.region,
    title: (u as any).title || '',
    password: ''
  }
  expertTags.value = (u as any).specialty || []
  avatarFile.value = u.avatar
}

/** 选择头像并压缩为 base64（最长边 320px，足够清晰且体积极小） */
const pickAvatar = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) return store.showToast('请选择图片文件', 'error')
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 320 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      avatarFile.value = canvas.toDataURL('image/jpeg', 0.82)
    }
    img.src = reader.result as string
  }
  reader.readAsDataURL(file)
  input.value = ''
}

const dirty = computed(
  () =>
    store.user &&
    (avatarFile.value !== store.user.avatar || JSON.stringify(pick()) !== JSON.stringify(pickOf(store.user)))
)

const pick = () => ({
  nickname: form.value.nickname.trim(),
  phone: form.value.phone.trim(),
  email: form.value.email.trim(),
  wechatId: form.value.wechatId.trim(),
  region: form.value.region,
  ...(store.isExpert && { title: form.value.title, specialty: expertTags.value }),
  ...(form.value.password ? { password: form.value.password } : {})
})

const pickOf = (u: { nickname: string; phone: string; email: string; wechatId: string; region: string; title?: string; specialty?: string[] }) => ({
  ...(store.isExpert && { title: u.title || '', specialty: u.specialty || [] }),
  nickname: u.nickname,
  phone: u.phone,
  email: u.email,
  wechatId: u.wechatId,
  region: u.region
})

const save = async () => {
  if (!store.user || saving.value) return
  if (form.value.password && form.value.password.length < 6) {
    return store.showToast('新密码至少 6 位', 'error')
  }
  saving.value = true
  try {
    const u = await api.updateProfile({ ...pick(), avatar: avatarFile.value })
    store.updateUser(u)
    form.value.password = ''
    store.showToast('资料已更新', 'success')
  } catch (e: any) {
    store.showToast(e?.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

const doLogout = async () => {
  await store.logout()
  dangerText.value = ''
  store.showToast('已退出登录', 'success')
  router.push('/')
}

const doDelete = async () => {
  try {
    await api.deleteAccount()
    await store.logout()
    dangerText.value = ''
    store.showToast('账号已注销', 'success')
    router.push('/')
  } catch (e: any) {
    store.showToast(e?.message || '注销失败', 'error')
  }
}

const logoutOnly = async () => {
  await store.logout()
  store.showToast('已退出登录', 'success')
  router.push('/')
}

const avatarInitial = computed(() => (store.user?.nickname || '农')[0])

// ===== 数据概览 =====
const records = ref<RecordItem[]>([])
const consults = ref<Consult[]>([])
const statsLoading = ref(true)

const loadStats = async () => {
  statsLoading.value = true
  try {
    const [r, c] = await Promise.all([
      api.records({ userId: store.recordsUserId, limit: 60 }).catch(() => ({ items: [] as RecordItem[], total: 0 })),
      api.consults().catch(() => ({ items: [] as Consult[] }))
    ])
    records.value = r.items || []
    consults.value = c.items || []
  } finally {
    statsLoading.value = false
  }
}

/** 待处理事项：专家看未回复咨询，农户看未读消息 + 待复核结果 */
const pendingCount = computed(() =>
  store.isExpert
    ? consults.value.filter((c) => c.status === 'pending').length
    : store.unread
)

/** 概览四项指标 */
const overview = computed(() => {
  const total = records.value.length
  const days = new Set(records.value.map((r) => r.createdAt.slice(0, 10))).size
  const crops = new Set(records.value.map((r) => r.cropId)).size
  const high = records.value.filter((r) => r.gate?.needHumanReview).length
  return [
    { key: 'total', label: '累计诊断', value: total, unit: '次', icon: 'camera', tone: 'green' },
    { key: 'crops', label: '涉及作物', value: crops, unit: '种', icon: 'leaf', tone: 'amber' },
    { key: 'days', label: '记录天数', value: days, unit: '天', icon: 'clock', tone: 'blue' },
    { key: 'review', label: '转人工复核', value: high, unit: '次', icon: 'shield', tone: 'purple' }
  ]
})

/** 最近一次诊断（用于「继续跟进」卡片） */
const latestRecord = computed(() => records.value[0] || null)

/** 复诊恢复情况统计 */
const recoveryStat = computed(() => {
  const marked = records.value.filter((r) => r.recovery)
  if (!marked.length) return null
  const better = marked.filter((r) => r.recovery === 'improved').length
  return { total: marked.length, better, rate: Math.round((better / marked.length) * 100) }
})

const fmtDate = (s: string) => (s || '').slice(5, 16).replace('T', ' ')

// ===== 我的作物共建（提交记录 / 审核进度 / 审核结果） =====
const mySubs = ref<CropSubmission[]>([])
const subsLoading = ref(true)

const loadMySubs = async () => {
  subsLoading.value = true
  const who = store.user?.nickname || ''
  // 先渲染本地暂存，远端返回后合并，避免线上无后端时列表空白
  mySubs.value = [...(myLocalSubs(who) as unknown as CropSubmission[])]
  try {
    if (store.user) {
      const res = await api.cropSubmissions({})
      const remote = (res.items || []).filter(
        (s) => s.submitter === who || s.submitter === store.user!.account
      )
      const keys = new Set(mySubs.value.map((s) => `${s.name}|${s.createdAt}`))
      mySubs.value = [
        ...remote.filter((s) => !keys.has(`${s.name}|${s.createdAt}`)),
        ...mySubs.value
      ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    }
  } catch {
    /* 静态托管：仅本地数据 */
  } finally {
    subsLoading.value = false
  }
}

const SUB_STATUS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: '专家核验中', color: '#9a6a1e', bg: '#fdf3e7', icon: 'clock' },
  approved: { label: '已并入图谱', color: '#1a7f45', bg: '#e8f7ee', icon: 'check-circle' },
  rejected: { label: '未通过', color: '#b4342f', bg: '#fdeceb', icon: 'alert' }
}

const subProgress = computed(() => {
  const total = mySubs.value.length
  const approved = mySubs.value.filter((s) => s.status === 'approved').length
  return { total, approved, pending: total - approved }
})

onMounted(async () => {
  await store.restoreUser()
  if (store.user) {
    fillForm()
    loadStats()
    loadMySubs()
    // 从图谱速查「我的作物共建」跳转过来时，滚动到共建模块
    if (window.location.hash === '#contrib') {
      setTimeout(() => document.getElementById('contrib')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 260)
    }
  }
})
</script>

<template>
  <div class="profile">
    <!-- 未登录：引导登录 -->
    <template v-if="!store.user">
      <div class="pf-login">
        <div class="pf-login__card">
          <span class="pf-login__icon"><AppIcon name="user" :size="30" /></span>
          <h2>登录云岭农诊</h2>
          <p>登录后可查看专家回复消息、<br />保存诊断档案并同步个人资料</p>
          <button class="pf-login__btn" @click="authOpen = true">
            <AppIcon name="arrow-right" :size="16" /> 立即登录 / 注册
          </button>
        </div>
      </div>
      <AuthSheet :open="authOpen" @close="authOpen = false" @success="fillForm" />
    </template>

    <!-- 已登录 -->
    <template v-else>
      <!-- 头部横幅 -->
      <div class="pf-hero">
        <SceneryBanner :province="provinceOfRegion(store.user.region || store.region)" :region="store.user.region || store.region" compact />
        <div class="pf-hero__row">
          <label class="pf-avatar">
            <img v-if="avatarFile" :src="avatarFile" alt="头像" />
            <span v-else class="pf-avatar__fallback">{{ avatarInitial }}</span>
            <span class="pf-avatar__edit"><AppIcon name="camera" :size="13" /></span>
            <input type="file" accept="image/*" hidden @change="pickAvatar" />
          </label>
          <div class="pf-hero__info">
            <h1>
              {{ store.user.nickname }}
              <span v-if="store.isExpert" class="pf-role pf-role--expert">🎓 专家</span>
              <span v-else class="pf-role">🌾 农户</span>
            </h1>
            <p><AppIcon name="map-pin" :size="11" /> {{ store.user.region || store.region }} · {{ defaults[store.user.region] || '山地种植户' }}</p>
            <p><AppIcon name="clock" :size="11" /> 加入于 {{ store.user.createdAt.slice(0, 10) }}</p>
          </div>
        </div>
        <button v-if="pendingCount > 0" class="pf-hero__notice" @click="router.push('/messages-page')">
          <AppIcon name="bell" :size="13" />
          {{ store.isExpert ? `${pendingCount} 条咨询待回复` : `${pendingCount} 条未读消息` }}
          <AppIcon name="arrow-right" :size="12" />
        </button>
      </div>

      <!-- 数据概览 -->
      <section class="pf-overview">
        <div class="pf-overview__head">
          <span class="pf-overview__title">我的种植档案</span>
          <button class="pf-overview__more" @click="router.push('/archive')">
            全部记录 <AppIcon name="arrow-right" :size="11" />
          </button>
        </div>
        <div class="pf-overview__grid">
          <div v-for="o in overview" :key="o.key" class="pf-stat" :class="`pf-stat--${o.tone}`">
            <span class="pf-stat__icon"><AppIcon :name="o.icon" :size="15" /></span>
            <strong class="pf-stat__value">
              {{ statsLoading ? '—' : o.value }}<em>{{ o.unit }}</em>
            </strong>
            <span class="pf-stat__label">{{ o.label }}</span>
          </div>
        </div>

        <!-- 最近一次诊断跟进 -->
        <button v-if="latestRecord" class="pf-latest" @click="router.push(`/result/${latestRecord.id}`)">
          <span class="pf-latest__emoji">{{ store.crops.find((c) => c.id === latestRecord!.cropId)?.emoji || '🌿' }}</span>
          <span class="pf-latest__body">
            <span class="pf-latest__top">
              <strong>{{ latestRecord.cropName }}</strong>
              <em v-if="latestRecord.diagnosis?.results?.[0]">
                {{ latestRecord.diagnosis.results[0].name }}
                · {{ Math.round((latestRecord.diagnosis.results[0].confidence || 0) * 100) }}%
              </em>
            </span>
            <small>{{ fmtDate(latestRecord.createdAt) }} · 点击查看用药方案</small>
          </span>
          <AppIcon name="arrow-right" :size="14" class="pf-row__arrow" />
        </button>
        <p v-else-if="!statsLoading" class="pf-overview__empty">
          还没有诊断记录，拍一张病株照片就能留下第一份档案
        </p>

        <!-- 恢复情况 -->
        <div v-if="recoveryStat" class="pf-recover">
          <span class="pf-recover__label">病情好转率</span>
          <div class="pf-recover__bar">
            <i :style="{ width: recoveryStat.rate + '%' }"></i>
          </div>
          <b>{{ recoveryStat.rate }}%</b>
          <small>{{ recoveryStat.better }}/{{ recoveryStat.total }} 例复诊好转</small>
        </div>
      </section>

      <!-- 快捷功能 -->
      <section class="pf-quick">
        <button class="pf-quick__item" @click="router.push('/diagnose')">
          <span class="pf-quick__icon pf-quick__icon--green"><AppIcon name="camera" :size="17" /></span>
          <span>智能诊断</span>
        </button>
        <button class="pf-quick__item" @click="router.push('/archive')">
          <span class="pf-quick__icon pf-quick__icon--blue"><AppIcon name="archive" :size="17" /></span>
          <span>诊断档案</span>
        </button>
        <button class="pf-quick__item" @click="router.push('/knowledge')">
          <span class="pf-quick__icon pf-quick__icon--amber"><AppIcon name="book" :size="17" /></span>
          <span>病害图谱</span>
        </button>
        <button class="pf-quick__item" @click="router.push(store.isExpert ? '/admin/review' : '/ask-expert')">
          <span class="pf-quick__icon pf-quick__icon--purple"><AppIcon name="user" :size="17" /></span>
          <span>{{ store.isExpert ? '咨询工单' : '找专家' }}</span>
        </button>
      </section>

      <!-- 我的作物共建：提交记录 / 审核进度 / 审核结果（唯一完整入口） -->
      <section id="contrib" class="pf-card pf-contrib">
        <div class="pf-contrib__head">
          <h3 class="pf-card__title"><AppIcon name="leaf" :size="14" /> 我的作物共建</h3>
          <button class="pf-contrib__more" @click="router.push('/atlas')">
            去共建图谱 <AppIcon name="arrow-right" :size="11" />
          </button>
        </div>

        <p v-if="subsLoading" class="pf-contrib__loading">正在同步提交记录…</p>

        <template v-else-if="mySubs.length">
          <div class="pf-contrib__sum">
            <span>共提交 <b>{{ subProgress.total }}</b> 个作物</span>
            <span class="pf-contrib__sum-ok">{{ subProgress.approved }} 个已并入图谱</span>
            <span v-if="subProgress.pending" class="pf-contrib__sum-wait">{{ subProgress.pending }} 个核验中</span>
          </div>

          <div class="pf-contrib__list">
            <div v-for="s in mySubs" :key="s.id" class="pf-sub">
              <CropEmoji class="pf-sub__emoji" :emoji="s.emoji" :size="22" />
              <div class="pf-sub__body">
                <strong>
                  {{ s.name }}
                  <em>{{ s.province }}{{ s.city ? ' · ' + s.city : '' }}</em>
                </strong>
                <small>
                  {{ fmtDate(s.createdAt) }} 提交
                  <template v-if="s.note"> · 专家批注：{{ s.note }}</template>
                  <template v-else-if="s.status === 'pending'"> · 已推送至专家端作物审核队列</template>
                </small>
                <!-- 进度条：提交 → 核验 → 并入 -->
                <div class="pf-sub__steps">
                  <i class="is-done"></i>
                  <i :class="{ 'is-done': s.status !== 'pending', 'is-bad': s.status === 'rejected' }"></i>
                  <i :class="{ 'is-done': s.status === 'approved' }"></i>
                </div>
              </div>
              <span
                class="pf-sub__status"
                :style="{ color: SUB_STATUS[s.status].color, background: SUB_STATUS[s.status].bg }"
              >
                {{ SUB_STATUS[s.status].label }}
              </span>
            </div>
          </div>
        </template>

        <div v-else class="pf-contrib__empty">
          <p>你还没有提交过作物</p>
          <button class="pf-contrib__btn" @click="router.push('/atlas')">
            <AppIcon name="plus" :size="13" /> 补充一个家乡作物
          </button>
          <small>审核通过后，同产区农户就能在图谱里查到它</small>
        </div>
      </section>

      <!-- 资料表单 -->
      <section class="pf-card">
        <h3 class="pf-card__title"><AppIcon name="edit" :size="14" /> 基本信息</h3>

        <label class="pf-field">
          <span>昵称</span>
          <input v-model="form.nickname" maxlength="16" placeholder="昵称" />
        </label>

        <div class="pf-grid">
          <label class="pf-field">
            <span>手机号</span>
            <input v-model="form.phone" maxlength="15" placeholder="手机号" />
          </label>
          <label class="pf-field">
            <span>邮箱</span>
            <input v-model="form.email" maxlength="40" placeholder="邮箱" />
          </label>
          <label class="pf-field">
            <span>微信号</span>
            <input v-model="form.wechatId" maxlength="30" placeholder="微信号" />
          </label>
          <label class="pf-field">
            <span>常驻地区</span>
            <input v-model="form.region" maxlength="12" placeholder="如：文山市" />
          </label>
        </div>

        <!-- 专家专属：职称与擅长领域 -->
        <template v-if="store.isExpert">
          <label class="pf-field">
            <span>职称</span>
            <input v-model="form.title" maxlength="12" placeholder="如：高级农艺师" />
          </label>
          <div class="pf-field">
            <span>擅长领域（点选，农户将据此找到您）</span>
            <div class="pf-tags">
              <button
                v-for="f in EXPERT_FIELDS"
                :key="f"
                type="button"
                class="pf-tag"
                :class="{ 'is-on': expertTags.includes(f) }"
                @click="toggleTag(f)"
              >
                {{ f }}
              </button>
            </div>
          </div>
        </template>

        <label class="pf-field">
          <span>新密码（留空则不修改）</span>
          <input v-model="form.password" type="password" maxlength="32" placeholder="••••••" />
        </label>

        <button class="pf-save" :disabled="!dirty || saving" @click="save">
          <AppIcon v-if="saving" name="loader" :size="14" class="spin" />
          {{ saving ? '保存中…' : '保存修改' }}
        </button>
      </section>

      <!-- 账号操作 -->
      <section class="pf-card">
        <h3 class="pf-card__title"><AppIcon name="shield" :size="14" /> 账号与安全</h3>

        <button class="pf-row" @click="router.push('/messages-page')">
          <span class="pf-row__icon pf-row__icon--green"><AppIcon name="bell" :size="16" /></span>
          <span class="pf-row__body">
            <strong>我的消息</strong>
            <small>专家回复与平台公告</small>
          </span>
          <em v-if="store.unread > 0" class="pf-row__badge">{{ store.unread }}</em>
          <AppIcon name="arrow-right" :size="15" class="pf-row__arrow" />
        </button>

        <button class="pf-row" @click="logoutOnly">
          <span class="pf-row__icon pf-row__icon--blue"><AppIcon name="logout" :size="16" /></span>
          <span class="pf-row__body">
            <strong>退出登录</strong>
            <small>下次仍可用本账号登录</small>
          </span>
          <AppIcon name="arrow-right" :size="15" class="pf-row__arrow" />
        </button>

        <button class="pf-row pf-row--danger" @click="dangerOpen = true">
          <span class="pf-row__icon pf-row__icon--red"><AppIcon name="alert" :size="16" /></span>
          <span class="pf-row__body">
            <strong>注销账号</strong>
            <small>删除账号与全部个人数据，不可恢复</small>
          </span>
          <AppIcon name="arrow-right" :size="15" class="pf-row__arrow" />
        </button>
      </section>

      <!-- 注销确认 -->
      <Teleport to="body">
        <Transition name="fade">
          <div v-if="dangerOpen" class="pf-danger-mask" @click.self="dangerOpen = false">
            <div class="pf-danger">
              <span class="pf-danger__icon"><AppIcon name="alert-octagon" :size="26" /></span>
              <h3>确认注销账号？</h3>
              <p>注销后将删除您的个人资料、消息记录，且无法恢复。诊断档案将保留用于科研统计（已匿名化）。</p>
              <label class="pf-danger__confirm">
                <input v-model="dangerText" placeholder="请输入「注销」以确认" maxlength="4" />
              </label>
              <div class="pf-danger__ops">
                <button class="pf-danger__btn pf-danger__btn--ghost" @click="dangerOpen = false">再想想</button>
                <button
                  class="pf-danger__btn pf-danger__btn--red"
                  :disabled="dangerText !== '注销'"
                  @click="doDelete"
                >
                  确认注销
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
    </template>
  </div>
</template>

<style scoped>
.profile {
  padding: 0 0 40px;
}

/* 未登录 */
.pf-login {
  padding: 60px 22px;
  display: grid;
  place-items: center;
}

.pf-login__card {
  text-align: center;
  padding: 40px 34px;
  border-radius: 22px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-md);
}

.pf-login__icon {
  display: inline-grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: var(--c-primary-50);
  color: var(--c-primary-600);
  margin-bottom: 14px;
}

.pf-login__card h2 {
  font-size: 18px;
  font-weight: 800;
  color: var(--c-text-1);
}

.pf-login__card p {
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--c-text-4);
  margin: 8px 0 20px;
}

.pf-login__btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 46px;
  padding: 0 34px;
  border-radius: var(--r-full);
  font-size: 14px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  box-shadow: 0 8px 20px rgba(var(--c-primary-rgb), 0.28);
}

/* 头部 */
.pf-hero {
  position: relative;
  padding-bottom: 0;
}

.pf-hero__row {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  padding: 0 20px;
  margin-top: -34px;
  position: relative;
  z-index: 1;
}

.pf-avatar {
  position: relative;
  width: 84px;
  height: 84px;
  border-radius: 26px;
  overflow: visible;
  cursor: pointer;
  flex-shrink: 0;
  background: #fff;
  border: 3px solid #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}

.pf-avatar img,
.pf-avatar__fallback {
  width: 100%;
  height: 100%;
  border-radius: 23px;
  object-fit: cover;
  display: block;
}

.pf-avatar__fallback {
  display: grid;
  place-items: center;
  font-size: 30px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
}

.pf-avatar__edit {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--c-primary-600);
  border: 2.5px solid #fff;
}

.pf-hero__info h1 {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 19px;
  font-weight: 800;
  color: var(--c-text-1);
  padding-bottom: 6px;
}

.pf-role {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 9px;
  border-radius: var(--r-full);
  background: var(--c-primary-50);
  color: var(--c-primary-700);
}

.pf-role--expert {
  background: var(--c-accent-100);
  color: var(--c-accent-600);
}

.pf-hero__info p {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--c-text-4);
  margin-top: 3px;
}

/* 待办提示条 */
.pf-hero__notice {
  display: flex;
  align-items: center;
  gap: 6px;
  width: calc(100% - 40px);
  margin: 12px 20px 0;
  padding: 9px 13px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
  color: #8a4b06;
  background: linear-gradient(100deg, #fff5e3, #fffaf1);
  border: 1px solid #f7dcae;
  text-align: left;
}

.pf-hero__notice > :last-child {
  margin-left: auto;
}

/* 数据概览 */
.pf-overview {
  margin: 16px 16px 0;
  padding: 15px 15px 14px;
  border-radius: 18px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.pf-overview__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.pf-overview__title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.pf-overview__title::before {
  content: '';
  width: 4px;
  height: 14px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--c-primary-400), var(--c-primary-700));
}

.pf-overview__more {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-primary-700);
}

.pf-overview__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.pf-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 11px 4px 9px;
  border-radius: 13px;
  background: var(--c-bg-subtle);
  border: 1px solid var(--c-line-soft);
}

.pf-stat__icon {
  width: 26px;
  height: 26px;
  border-radius: 9px;
  display: grid;
  place-items: center;
  margin-bottom: 2px;
}

.pf-stat--green .pf-stat__icon { background: #e6f6ec; color: #1a7f45; }
.pf-stat--amber .pf-stat__icon { background: #fff2dd; color: #b5700c; }
.pf-stat--blue .pf-stat__icon { background: #e8f0ff; color: #2b5fd9; }
.pf-stat--purple .pf-stat__icon { background: #f2e9ff; color: #6d34c9; }

.pf-stat__value {
  font-size: 19px;
  font-weight: 800;
  line-height: 1;
  color: var(--c-text-1);
  font-variant-numeric: tabular-nums;
}

.pf-stat__value em {
  font-style: normal;
  font-size: 10px;
  font-weight: 600;
  color: var(--c-text-4);
  margin-left: 2px;
}

.pf-stat__label {
  font-size: 10.5px;
  color: var(--c-text-4);
}

/* 最近诊断 */
.pf-latest {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  margin-top: 12px;
  padding: 11px 12px;
  border-radius: 14px;
  background: linear-gradient(100deg, #f1f9f4, #f8fcf9);
  border: 1px solid #d9eddf;
  text-align: left;
}

.pf-latest__emoji {
  font-size: 22px;
  line-height: 1;
  flex-shrink: 0;
}

.pf-latest__body {
  flex: 1;
  min-width: 0;
}

.pf-latest__top {
  display: flex;
  align-items: baseline;
  gap: 7px;
  flex-wrap: wrap;
}

.pf-latest__top strong {
  font-size: 12.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.pf-latest__top em {
  font-style: normal;
  font-size: 11px;
  font-weight: 600;
  color: var(--c-primary-700);
}

.pf-latest__body small {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.pf-overview__empty {
  margin-top: 12px;
  font-size: 11.5px;
  color: var(--c-text-4);
  text-align: center;
  padding: 12px;
  border-radius: 12px;
  background: var(--c-bg-subtle);
}

/* 恢复率 */
.pf-recover {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 11px;
  color: var(--c-text-3);
}

.pf-recover__label {
  flex-shrink: 0;
  font-weight: 700;
}

.pf-recover__bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--c-bg-muted);
  overflow: hidden;
}

.pf-recover__bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--c-primary-400), var(--c-primary-700));
  transition: width 0.5s var(--ease-out);
}

.pf-recover b {
  font-size: 12px;
  color: var(--c-primary-700);
}

.pf-recover small {
  font-size: 10px;
  color: var(--c-text-4);
}

/* 快捷功能 */
.pf-quick {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 12px 16px 0;
}

.pf-quick__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 4px 10px;
  border-radius: 15px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-2);
  box-shadow: var(--sh-xs);
  transition: transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast);
}

.pf-quick__item:active {
  transform: scale(0.96);
}

.pf-quick__icon {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #fff;
}

.pf-quick__icon--green { background: linear-gradient(135deg, #55c184, #2f9868); box-shadow: 0 5px 12px rgba(47,152,104,0.26); }
.pf-quick__icon--blue { background: linear-gradient(135deg, #6b8cff, #4f6ef2); box-shadow: 0 5px 12px rgba(79,110,242,0.24); }
.pf-quick__icon--amber { background: linear-gradient(135deg, #ffb257, #f59221); box-shadow: 0 5px 12px rgba(245,146,33,0.24); }
.pf-quick__icon--purple { background: linear-gradient(135deg, #b57bff, #8b46e8); box-shadow: 0 5px 12px rgba(139,70,232,0.24); }

/* 卡片 */
.pf-card {  margin: 16px 16px 0;
  padding: 16px 16px 18px;
  border-radius: 18px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.pf-card__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 800;
  color: var(--c-text-1);
  margin-bottom: 13px;
}

.pf-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 11px;
}

.pf-field span {
  font-size: 11px;
  font-weight: 700;
  color: var(--c-text-3);
}

.pf-field input {
  height: 42px;
  padding: 0 12px;
  border-radius: 11px;
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-subtle);
  font-size: 13px;
  color: var(--c-text-1);
  transition: border-color var(--dur-fast), background var(--dur-fast);
}

.pf-field input:focus {
  border-color: var(--c-primary-400);
  background: #fff;
}

.pf-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}

.pf-save {
  width: 100%;
  height: 44px;
  border-radius: var(--r-full);
  font-size: 13.5px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  box-shadow: 0 6px 16px rgba(var(--c-primary-rgb), 0.26);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 4px;
}

.pf-save:disabled {
  opacity: 0.45;
  box-shadow: none;
}

/* 操作行 */
.pf-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 4px;
  border-bottom: 1px solid var(--c-line-soft);
  text-align: left;
}

.pf-row:last-child {
  border-bottom: none;
  padding-bottom: 4px;
}

.pf-row__icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.pf-row__icon--green {
  background: #e8f7ee;
  color: #1a7f45;
}

.pf-row__icon--blue {
  background: #e8f2ff;
  color: #2563eb;
}

.pf-row__icon--red {
  background: #fdeceb;
  color: #b4342f;
}

.pf-row__body {
  flex: 1;
  min-width: 0;
}

.pf-row__body strong {
  display: block;
  font-size: 13.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.pf-row__body small {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.pf-row__badge {
  font-style: normal;
  font-size: 10.5px;
  font-weight: 800;
  color: #fff;
  background: var(--c-danger);
  min-width: 19px;
  height: 19px;
  border-radius: var(--r-full);
  display: grid;
  place-items: center;
  padding: 0 5px;
}

.pf-row__arrow {
  color: var(--c-text-4);
}

.pf-row--danger strong {
  color: var(--c-danger);
}

/* 注销确认 */
.pf-danger-mask {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(30, 14, 12, 0.5);
  backdrop-filter: blur(3px);
  display: grid;
  place-items: center;
  padding: 22px;
}

.pf-danger {
  width: min(360px, 100%);
  padding: 26px 22px 20px;
  border-radius: 20px;
  background: #fff;
  text-align: center;
}

.pf-danger__icon {
  display: inline-grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  color: var(--c-danger);
  background: #fdeceb;
  margin-bottom: 10px;
}

.pf-danger h3 {
  font-size: 16.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.pf-danger p {
  font-size: 12px;
  line-height: 1.75;
  color: var(--c-text-3);
  margin: 8px 0 14px;
}

.pf-danger__confirm input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border-radius: 11px;
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-subtle);
  font-size: 13px;
  text-align: center;
}

.pf-danger__ops {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.pf-danger__btn {
  flex: 1;
  height: 42px;
  border-radius: var(--r-full);
  font-size: 13.5px;
  font-weight: 700;
}

.pf-danger__btn--ghost {
  background: var(--c-bg-muted);
  color: var(--c-text-2);
}

.pf-danger__btn--red {
  background: var(--c-danger);
  color: #fff;
}

.pf-danger__btn--red:disabled {
  opacity: 0.4;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.pf-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 8px;
}

.pf-tag {
  height: 30px;
  padding: 0 13px;
  border-radius: var(--r-full);
  font-size: 12px;
  color: var(--c-text-2);
  background: var(--c-bg-muted);
  border: 1px solid transparent;
  transition: all var(--dur-fast);
}

.pf-tag.is-on {
  color: #fff;
  font-weight: 700;
  background: var(--c-primary-600);
}

/* ===== 我的作物共建 ===== */
.pf-contrib__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.pf-contrib__head .pf-card__title {
  margin-bottom: 0;
}

.pf-contrib__more {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 700;
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
  padding: 4px 10px;
  border-radius: var(--r-full);
}

.pf-contrib__loading {
  font-size: 11.5px;
  color: var(--c-text-4);
  padding: 6px 0;
}

.pf-contrib__sum {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--c-text-3);
  padding: 9px 11px;
  border-radius: 11px;
  background: var(--c-bg-subtle);
  margin-bottom: 10px;
}

.pf-contrib__sum b {
  color: var(--c-primary-700);
  font-size: 12.5px;
}

.pf-contrib__sum-ok {
  color: #1a7f45;
  font-weight: 700;
}

.pf-contrib__sum-wait {
  color: #9a6a1e;
  font-weight: 700;
}

.pf-contrib__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pf-sub {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px;
  border-radius: 13px;
  background: var(--c-bg-subtle);
  border: 1px solid var(--c-line-soft);
}

.pf-sub__emoji {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  display: grid;
  place-items: center;
  background: var(--c-bg-card);
  flex-shrink: 0;
}

.pf-sub__body {
  flex: 1;
  min-width: 0;
}

.pf-sub__body strong {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-text-1);
}

.pf-sub__body em {
  font-style: normal;
  font-size: 9.5px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  color: var(--c-text-4);
}

.pf-sub__body small {
  display: block;
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--c-text-4);
  line-height: 1.5;
}

/* 三步进度：提交 → 核验 → 并入 */
.pf-sub__steps {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.pf-sub__steps i {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: var(--c-line);
}

.pf-sub__steps i.is-done {
  background: var(--c-primary-500);
}

.pf-sub__steps i.is-bad {
  background: #b4342f;
}

.pf-sub__status {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: var(--r-full);
}

.pf-contrib__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 14px 0 4px;
  text-align: center;
}

.pf-contrib__empty p {
  font-size: 12.5px;
  color: var(--c-text-3);
}

.pf-contrib__empty small {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.pf-contrib__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 16px;
  border-radius: var(--r-full);
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  box-shadow: 0 5px 14px rgba(var(--c-primary-rgb), 0.24);
}

#contrib {
  scroll-margin-top: 12px;
}
</style>
