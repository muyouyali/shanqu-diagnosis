<script setup lang="ts">
/**
 * 全屏登录落地页 · 真实山景照片背景
 * 表单已组件化拆分：AppInput / AppButton / LoginForm（见 @/components/form）
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '@/api'
import { useAppStore } from '@/stores/app'
import { addLocalExpert } from '@/data/localExperts'
import AppInput from '@/components/form/AppInput.vue'
import AppButton from '@/components/form/AppButton.vue'
import LoginForm from '@/components/form/LoginForm.vue'

const router = useRouter()
const route = useRoute()
const store = useAppStore()

const mode = ref<'login' | 'register' | 'forgot'>('login')
const busy = ref(false)
const errMsg = ref('')

/* ================= 注册表单 ================= */
const confirmPwd = ref('')
const nickname = ref('')
const regRole = ref<'user' | 'expert'>('user')
const regTitle = ref('')
const regRegion = ref('')
const regSpecialty = ref<string[]>([])

const SPECIALTIES = ['茶树', '天麻', '核桃', '花椒', '魔芋', '石榴', '咖啡', '文山三七', '蓝莓', '柑橘', '烤烟', '马铃薯']

const toggleSpecialty = (s: string) => {
  const i = regSpecialty.value.indexOf(s)
  if (i >= 0) regSpecialty.value.splice(i, 1)
  else if (regSpecialty.value.length < 8) regSpecialty.value.push(s)
}

/* 注册表单行内校验（失焦触发） */
const PHONE_RE = /^1[3-9]\d{9}$/
const regAccount = ref('')
const regPassword = ref('')
const errNickname = ref('')
const errRegAccount = ref('')
const errRegPassword = ref('')
const errConfirm = ref('')

const vNickname = () => {
  errNickname.value = nickname.value.trim() ? '' : '请输入昵称'
  return !errNickname.value
}
const vRegAccount = () => {
  const v = regAccount.value.trim()
  if (!v) errRegAccount.value = '请输入账号或手机号'
  else if (/^\d{11}$/.test(v) && !PHONE_RE.test(v)) errRegAccount.value = '手机号格式不正确（应为 1 开头的 11 位数字）'
  else errRegAccount.value = ''
  return !errRegAccount.value
}
const vRegPassword = () => {
  if (!regPassword.value) errRegPassword.value = '请输入密码'
  else if (regPassword.value.length < 6) errRegPassword.value = '密码至少 6 位'
  else errRegPassword.value = ''
  return !errRegPassword.value
}
const vConfirm = () => {
  if (!confirmPwd.value) errConfirm.value = '请再次输入密码'
  else if (confirmPwd.value !== regPassword.value) errConfirm.value = '两次输入的密码不一致'
  else errConfirm.value = ''
  return !errConfirm.value
}

const canRegister = computed(() => {
  if (busy.value) return false
  return (
    !!regAccount.value.trim() &&
    regPassword.value.length >= 6 &&
    confirmPwd.value === regPassword.value &&
    !!nickname.value.trim() &&
    (regRole.value === 'user' || !!regTitle.value.trim())
  )
})

/**
 * 注册成为专家后立刻写入本地专家池，
 * 保证「刚注册的专家及时出现在向专家提问的列表里」，
 * 也保证静态托管（无后端）时专家团队不为空。
 */
const publishExpert = (u: any) => {
  if (u?.role !== 'expert') return
  addLocalExpert({
    ...u,
    title: u.title || regTitle.value.trim() || '农技专家',
    specialty: u.specialty?.length ? u.specialty : [...regSpecialty.value],
    region: u.region || regRegion.value.trim() || '云南'
  })
}

const goIn = () => {
  const redirect = (route.query.redirect as string) || '/'
  router.replace(redirect)
}

/** 登录表单提交（LoginForm 组件已完成行内校验） */
const onLogin = async (payload: { account: string; password: string; remember: boolean }) => {
  if (busy.value) return // in-flight 守卫：杜绝任何路径下的重复提交
  busy.value = true
  errMsg.value = ''
  try {
    const res = await api.login({ account: payload.account, password: payload.password })
    store.setAuth(res.token, res.user)
    store.showToast(`欢迎回来，${res.user.nickname || '农户朋友'}`, 'success')
    goIn()
    // 成功后不复位 busy：路由即将切换，保持按钮禁用堵住切换间隙的重复提交窗口
  } catch (e: any) {
    errMsg.value = e?.message || '登录失败，请重试'
    busy.value = false
  }
}

/* ================= 忘记密码（验证码重置） ================= */
const fpPwd = ref('')
const fpPwd2 = ref('')
const fpBusy = ref(false)
const fpErr = ref('')

const onForgot = () => {
  mode.value = 'forgot'
  errMsg.value = ''
  fpErr.value = ''
  fpPwd.value = ''
  fpPwd2.value = ''
  quickTarget.value = ''
  quickCode.value = ''
  codeSent.value = false
  codeHint.value = ''
}

const canReset = computed(
  () =>
    !!quickTarget.value.trim() &&
    quickCode.value.length === 6 &&
    fpPwd.value.length >= 6 &&
    fpPwd.value === fpPwd2.value &&
    !fpBusy.value
)

const resetSubmit = async () => {
  if (!canReset.value) {
    if (fpPwd.value.length < 6) fpErr.value = '新密码至少 6 位'
    else if (fpPwd.value !== fpPwd2.value) fpErr.value = '两次输入的密码不一致'
    return
  }
  fpBusy.value = true
  fpErr.value = ''
  try {
    await api.resetPassword({
      target: quickTarget.value.trim(),
      code: quickCode.value,
      password: fpPwd.value
    })
    store.showToast('密码已重置，请用新密码登录', 'success')
    if (cdTimer) clearInterval(cdTimer)
    countdown.value = 0
    mode.value = 'login'
    errMsg.value = ''
  } catch (e: any) {
    fpErr.value = e?.message || '重置失败，请重试'
  } finally {
    fpBusy.value = false
  }
}

const onRegister = async () => {
  // 提交前再统一跑一遍校验
  const ok = [vNickname(), vRegAccount(), vRegPassword(), vConfirm()].every(Boolean)
  if (!ok || !canRegister.value) return
  busy.value = true
  errMsg.value = ''
  try {
    const res = await api.register({
      account: regAccount.value.trim(),
      password: regPassword.value,
      nickname: nickname.value.trim(),
      role: regRole.value,
      title: regRole.value === 'expert' ? regTitle.value.trim() : undefined,
      specialty: regRole.value === 'expert' ? [...regSpecialty.value] : undefined,
      region: regRole.value === 'expert' ? regRegion.value.trim() : undefined
    })
    store.setAuth(res.token, res.user)
    publishExpert(res.user)
    store.showToast('注册成功，欢迎加入云岭农诊', 'success')
    goIn()
  } catch (e: any) {
    // 静态托管兜底：本机注册（无后端时也能注册成功并进入对应端）
    const localUser = {
      id: Date.now(),
      account: regAccount.value.trim(),
      nickname: nickname.value.trim(),
      role: regRole.value,
      phone: '',
      email: '',
      wechatId: '',
      avatar: '',
      region: regRole.value === 'expert' ? regRegion.value.trim() || '云南' : '云南',
      title: regRole.value === 'expert' ? regTitle.value.trim() : undefined,
      specialty: regRole.value === 'expert' ? [...regSpecialty.value] : undefined,
      createdAt: new Date().toISOString()
    }
    store.setAuth(`local_${Date.now()}`, localUser as any)
    publishExpert(localUser)
    store.showToast(
      regRole.value === 'expert' ? '专家账号已创建，可在专家列表中看到你' : '注册成功，开始诊断吧',
      'success'
    )
    goIn()
  } finally {
    busy.value = false
  }
}

/**
 * 演示账号一键体验：
 * 体验账号校验完全在后端（POST /api/auth/demo），前端不硬编码任何体验账号密码
 */
const demoRole = ref<'' | 'user' | 'expert'>('')
const demo = async (role: 'user' | 'expert') => {
  if (busy.value) return // in-flight 守卫：防重复点击
  demoRole.value = role
  const ok = window.confirm(
    role === 'expert'
      ? '「专家体验」将使用预置的演示专家账号一键登录（无需注册/输密码），用于快速浏览专家端功能。\n\n确定进入吗？'
      : '「农户体验」将使用预置的演示农户账号一键登录（无需注册/输密码），用于快速浏览农户端功能。\n\n确定进入吗？'
  )
  if (!ok) return
  busy.value = true
  errMsg.value = ''
  try {
    const res = await api.demoLogin(role)
    store.setAuth(res.token, res.user)
    goIn()
  } catch (e: any) {
    errMsg.value = e?.message || '演示登录失败'
    busy.value = false
    demoRole.value = ''
  }
}

/* ================= 其他登录方式（微信 / 邮箱 / 手机验证码） ================= */
type QuickProvider = 'wechat' | 'email' | 'phone'
const otherOpen = ref<QuickProvider | null>(null)
const wechatReal = ref(false)
const wechatQrUrl = ref('')
const wechatErr = ref('')
const wechatMissing = ref<string[]>([])
const quickTarget = ref('')
const quickCode = ref('')
const quickNickname = ref('')
const quickRole = ref<'user' | 'expert'>('user')
const quickBusy = ref(false)
const codeSent = ref(false)
const codeHint = ref('')
const countdown = ref(0)
let cdTimer: number | undefined

const PROVIDER_META: Record<Exclude<QuickProvider, 'wechat'>, { name: string; ph: string; type: string }> = {
  email: { name: '邮箱', ph: 'you@example.com', type: 'email' },
  phone: { name: '手机号', ph: '13800000000', type: 'tel' }
}

const otherLogin = async (p: QuickProvider) => {
  if (p === 'wechat') {
    // 查询服务端是否配置了微信开放平台：配置→真实扫码；未配置→演示模拟
    wechatReal.value = false
    wechatQrUrl.value = ''
    wechatErr.value = ''
    wechatMissing.value = []
    otherOpen.value = p
    try {
      const cfg = await api.wechatConfig()
      wechatMissing.value = cfg.missing || []
      if (cfg.enabled) {
        const qr = await api.wechatQr()
        wechatQrUrl.value = qr.url
        wechatReal.value = true
      }
    } catch {
      /* 保持演示模式 */
    }
    return
  }
  quickTarget.value = ''
  quickCode.value = ''
  quickNickname.value = ''
  quickRole.value = 'user'
  codeSent.value = false
  codeHint.value = ''
  otherOpen.value = p
}

const closeOther = () => {
  otherOpen.value = null
  if (cdTimer) clearInterval(cdTimer)
  countdown.value = 0
}

const sending = ref(false)
const getCode = async () => {
  if (!quickTarget.value.trim() || countdown.value > 0 || sending.value) return
  sending.value = true
  store.showToast('正在发送，请稍候…', 'info')
  try {
    const res = await api.smsCode(quickTarget.value.trim())
    codeSent.value = true
    codeHint.value = res.demoCode || ''
    countdown.value = 60
    cdTimer = window.setInterval(() => {
      countdown.value--
      if (countdown.value <= 0 && cdTimer) clearInterval(cdTimer)
    }, 1000)
    store.showToast(
      res.demoCode
        ? `验证码已生成（演示环境直接回显）`
        : `已发送！通常 5–20 秒送达，请留意收件箱与垃圾邮件`,
      'success',
    )
  } catch (e: any) {
    store.showToast(e?.message || '验证码发送失败，请稍后重试', 'error')
  } finally {
    sending.value = false
  }
}

const canQuick = computed(() => {
  if (quickBusy.value) return false
  if (!quickTarget.value.trim() || quickCode.value.length !== 6) return false
  if (quickRole.value === 'expert' && !quickRegion.value.trim()) return false
  return true
})

const quickRegion = ref('')

const quickSubmit = async () => {
  if (!canQuick.value || !otherOpen.value || otherOpen.value === 'wechat') return
  quickBusy.value = true
  try {
    const res = await api.quickAuth({
      method: otherOpen.value as 'phone' | 'email',
      target: quickTarget.value.trim(),
      code: quickCode.value,
      mode: 'auto',
      nickname: quickNickname.value.trim() || undefined,
      role: quickRole.value,
      region: quickRole.value === 'expert' ? quickRegion.value.trim() : undefined
    })
    store.setAuth(res.token, res.user)
    publishExpert(res.user)
    store.showToast(`欢迎，${res.user.nickname || '农友'}`, 'success')
    closeOther()
    goIn()
  } catch (e: any) {
    // 静态托管兜底：验证码直通（演示环境 codeHint 已回显）
    const isPhone = quickTarget.value.trim().length === 11
    const localUser = {
      id: Date.now(),
      account: quickTarget.value.trim(),
      nickname: quickNickname.value.trim() || (quickRole.value === 'expert' ? '农技专家' : '农友'),
      role: quickRole.value,
      phone: isPhone ? quickTarget.value.trim() : '',
      email: isPhone ? '' : quickTarget.value.trim(),
      wechatId: '',
      avatar: '',
      region: quickRole.value === 'expert' ? quickRegion.value.trim() || '云南' : '云南',
      title: quickRole.value === 'expert' ? '农技专家' : undefined,
      specialty: quickRole.value === 'expert' ? ['综合农技'] : undefined,
      createdAt: new Date().toISOString()
    }
    store.setAuth(`local_${Date.now()}`, localUser as any)
    publishExpert(localUser)
    store.showToast(`欢迎，${localUser.nickname}`, 'success')
    closeOther()
    goIn()
  } finally {
    quickBusy.value = false
  }
}

/** 微信演示模拟扫码授权 */
const scanning = ref(false)
const oauthSubmit = async () => {
  if (otherOpen.value !== 'wechat' || scanning.value) return
  scanning.value = true
  try {
    const res = await api.oauthAuth({ provider: 'wechat' })
    store.setAuth(res.token, res.user)
    store.showToast(`微信授权成功，欢迎 ${res.user.nickname}`, 'success')
    closeOther()
    goIn()
  } catch (e: any) {
    // 静态托管兜底：授权演示直通
    const localUser = {
      id: Date.now(),
      account: `oauth_wechat_${Date.now()}`,
      nickname: '微信用户',
      role: 'user',
      phone: '',
      email: '',
      wechatId: '',
      avatar: '',
      region: '云南',
      createdAt: new Date().toISOString()
    }
    store.setAuth(`local_${Date.now()}`, localUser as any)
    store.showToast(`微信授权成功，欢迎 ${localUser.nickname}`, 'success')
    closeOther()
    goIn()
  } finally {
    scanning.value = false
  }
}

/** 模拟二维码图案（固定伪随机，视觉用） */
const pseudoQr = (n: number) => {
  const x = (n * 2654435761) % 4294967296
  return (x ^ (n * 97)) % 3 !== 0
}

/* ================= 知识库统计：后端接口动态拉取，失败展示兜底文案 ================= */
const kbStat = ref<{ crops: number; diseases: number } | null>(null)
const kbFail = ref(false)
const kbLoading = ref(false)
const kbText = computed(() =>
  kbStat.value
    ? `知识库已收录 ${kbStat.value.crops} 种山地作物 · ${kbStat.value.diseases} 种常见病虫害`
    : kbLoading.value
      ? '知识库数据加载中…'
      : '知识库数据暂时无法获取',
)

/** 手动刷新知识库统计（卡片底部小刷新图标） */
const refreshKb = async () => {
  if (kbLoading.value) return
  kbLoading.value = true
  try {
    const r = await api.kbStats()
    kbStat.value = { crops: r.crops, diseases: r.diseases }
    kbFail.value = false
  } catch {
    kbStat.value = null
    kbFail.value = true
  } finally {
    kbLoading.value = false
  }
}

/* ================= 底部 AI 提示轮播 ================= */
const TIPS = [
  'AI 多 Agent 流水线：识别 → 知识检索 → 复核把关，30 秒出具诊断报告',
  '今日提醒：雨季来临，三七根腐病高发，注意清沟排水',
  '低置信度病例自动转人工复核，专家团队在线支撑'
]
const tipIdx = ref(0)
let timer: number | undefined

/** 真实微信扫码：iframe 内回调页 postMessage 通知登录成功 */
const onOauthMessage = (e: MessageEvent) => {
  if (e.origin !== window.location.origin) return
  const d = e.data as { type?: string; token?: string; error?: string }
  if (d?.type !== 'ylnz-oauth') return
  if (d.token) {
    finishWechat(d.token)
  } else {
    wechatErr.value = d.error || '微信授权失败'
  }
}

const finishWechat = async (token: string) => {
  try {
    const user = await api.meWithToken(token)
    store.setAuth(token, user)
    store.showToast(`微信登录成功，欢迎 ${user.nickname}`, 'success')
    closeOther()
    goIn()
  } catch {
    wechatErr.value = '登录态获取失败，请重试'
  }
}

/** 整页跳转微信授权（iframe 被 X-Frame-Options 拦截时的兜底，也是移动端微信内唯一可行方式） */
const gotoWechat = () => {
  if (!wechatQrUrl.value) return
  window.location.href = wechatQrUrl.value
}

onMounted(() => {
  timer = window.setInterval(() => {
    tipIdx.value = (tipIdx.value + 1) % TIPS.length
  }, 4200)
  window.addEventListener('message', onOauthMessage)
  // 知识库统计动态拉取（失败走兜底文案）
  api
    .kbStats()
    .then((r) => {
      kbStat.value = { crops: r.crops, diseases: r.diseases }
    })
    .catch(() => {
      kbFail.value = true
    })
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('message', onOauthMessage)
})
</script>

<template>
  <div class="lg">
    <!-- 照片背景：青绿晨雾群山（本地静态资源，Ken-burns 缓动） -->
    <div class="lg__bg lg__kenburns" />
    <!-- 深色蒙版：弱化背景饱和度，突出登录卡片主体 -->
    <div class="lg__shade" />
    <div class="lg__grain" />

    <!-- 顶部品牌条 -->
    <div class="lg__topbar">
      <span class="lg__logo">
        <span class="lg__logo-ico">🌿</span>
        云岭农诊
      </span>
      <span class="lg__region lg__region--soft">📍 服务云南山地特色作物</span>
    </div>

    <!-- 登录卡 -->
    <div class="lg__wrap">
      <div class="lg-card">
        <div class="lg-card__icons">
          <span class="lg-card__ico">🌱</span>
          <span class="lg-card__ico">🤖</span>
        </div>
        <h1 class="lg-card__title">云岭农诊</h1>
        <p class="lg-card__subtitle">山地特色作物 · 多 Agent AI 病虫害诊断</p>

        <!-- 登录表单（组件化：LoginForm + AppInput + AppButton） -->
        <LoginForm
          v-if="mode === 'login'"
          :busy="busy"
          :server-error="errMsg"
          @submit="onLogin"
          @forgot="onForgot"
        />

        <!-- 注册表单 -->
        <form v-else-if="mode === 'register'" class="lreg" novalidate @submit.prevent="onRegister">
          <div class="lg-roles">
            <button type="button" class="lg-role" :class="{ 'is-on': regRole === 'user' }" @click="regRole = 'user'">🌾 我是农户</button>
            <button type="button" class="lg-role" :class="{ 'is-on': regRole === 'expert' }" @click="regRole = 'expert'">🎓 我是专家</button>
          </div>
          <AppInput
            v-model="nickname"
            label="👤 昵称"
            placeholder="怎么称呼您"
            :error="errNickname"
            @blur="vNickname"
          />
          <AppInput
            v-model="regAccount"
            label="📱 账号 / 手机号"
            placeholder="用于登录"
            autocomplete="username"
            :error="errRegAccount"
            @blur="vRegAccount"
          />
          <AppInput
            v-model="regPassword"
            type="password"
            label="🔒 设置密码"
            placeholder="至少 6 位"
            autocomplete="new-password"
            :error="errRegPassword"
            @blur="vRegPassword"
          />
          <AppInput
            v-model="confirmPwd"
            type="password"
            label="🔁 确认密码"
            placeholder="请再次输入密码"
            autocomplete="new-password"
            :error="errConfirm"
            @blur="vConfirm"
          />
          <template v-if="regRole === 'expert'">
            <AppInput v-model="regTitle" label="🎓 职称" placeholder="如：高级农艺师" />
            <div class="lg-field">
              <span class="lg-field__label">🌿 擅长领域（最多 8 项）</span>
              <div class="lg-chips">
                <button
                  v-for="s in SPECIALTIES"
                  :key="s"
                  type="button"
                  class="lg-chip"
                  :class="{ 'is-on': regSpecialty.includes(s) }"
                  @click="toggleSpecialty(s)"
                >
                  {{ s }}
                </button>
              </div>
            </div>
            <AppInput v-model="regRegion" label="📍 驻点地区" placeholder="如：文山市" />
          </template>

          <p v-if="errMsg" class="lreg__err" role="alert">⚠️ {{ errMsg }}</p>

          <AppButton block type="submit" variant="primary" :loading="busy" :disabled="!canRegister">
            {{ busy ? '注册中…' : '🎉 注 册 并 加 入' }}
          </AppButton>
        </form>

        <!-- 忘记密码：验证码校验通过后重置 -->
        <form v-else-if="mode === 'forgot'" class="lreg lreg--forgot" novalidate @submit.prevent="resetSubmit">
          <p class="lforgot__tip">输入注册时使用的手机号或邮箱，通过验证码设置新密码</p>

          <label class="lg-field">
            <span class="lg-field__label">📱 手机号 / 邮箱</span>
            <input
              v-model="quickTarget"
              class="lg-field__input"
              type="text"
              placeholder="如 13800000000 或 you@example.com"
              autocomplete="username"
            />
          </label>

          <label class="lg-field">
            <span class="lg-field__label">验证码</span>
            <div class="lg-code-row">
              <input
                v-model="quickCode"
                class="lg-field__input"
                maxlength="6"
                placeholder="6 位验证码"
                autocomplete="one-time-code"
              />
              <button type="button" class="lg-code-btn" :disabled="countdown > 0 || sending || !quickTarget.trim()" @click="getCode">
                {{ sending ? '发送中…' : countdown > 0 ? `${countdown}s 后重发` : '获取验证码' }}
              </button>
            </div>
            <em v-if="codeHint" class="lg-code-hint">演示环境验证码：<b>{{ codeHint }}</b>（正式环境对接短信 / 邮件服务后真实下发）</em>
          </label>

          <AppInput
            v-model="fpPwd"
            type="password"
            label="🔒 新密码"
            placeholder="至少 6 位"
            autocomplete="new-password"
          />
          <AppInput
            v-model="fpPwd2"
            type="password"
            label="🔁 确认新密码"
            placeholder="请再次输入新密码"
            autocomplete="new-password"
          />

          <p v-if="fpErr" class="lreg__err" role="alert">⚠️ {{ fpErr }}</p>

          <AppButton block type="submit" variant="primary" :loading="fpBusy" :disabled="!canReset">
            {{ fpBusy ? '重置中…' : '✅ 重置密码' }}
          </AppButton>
          <button type="button" class="lforgot__back" @click="mode = 'login'; errMsg = ''">← 返回登录</button>
        </form>

        <p class="lg-switch">
          {{ mode === 'login' ? '没有账号？' : mode === 'register' ? '已有账号？' : '想起密码了？' }}
          <button
            type="button"
            class="lg-switch__link"
            @click="mode = mode === 'login' ? 'register' : 'login'; errMsg = ''"
          >
            {{ mode === 'login' ? '立即注册' : mode === 'register' ? '去登录' : '去登录' }}
          </button>
        </p>

        <!-- 快速体验：农户为主按钮（绿色），专家为次要按钮（浅色） -->
        <div class="lg-demo">
          <small>快速体验 · 演示账号一键登录</small>
          <div class="lg-demo__btns">
            <button
              type="button"
              class="lg-demo__btn lg-demo__btn--primary"
              :class="{ 'is-loading': busy && demoRole === 'user' }"
              :disabled="busy"
              data-tip="无需注册，直接体验 AI 拍照诊断、病害查询"
              @click="demo('user')"
            >
              <span v-if="busy && demoRole === 'user'" class="lg-demo__spin" aria-hidden="true" />
              <span :class="{ 'is-hidden': busy && demoRole === 'user' }">🌾 农户体验</span>
            </button>
            <button
              type="button"
              class="lg-demo__btn lg-demo__btn--soft"
              :class="{ 'is-loading': busy && demoRole === 'expert' }"
              :disabled="busy"
              data-tip="知识库审核、病害标注、模型反馈专家操作入口"
              @click="demo('expert')"
            >
              <span v-if="busy && demoRole === 'expert'" class="lg-demo__spin" aria-hidden="true" />
              <span :class="{ 'is-hidden': busy && demoRole === 'expert' }">🎓 专家体验</span>
            </button>
          </div>
        </div>

        <!-- 其他方式登录：微信 / 邮箱 / 手机验证码（线性绿色图标 + 文字标签） -->
        <div class="lg-other">
          <small>—— 其他方式登录 / 注册 ——</small>
          <div class="lg-other__btns">
            <button type="button" class="lg-other__item" title="微信登录" @click="otherLogin('wechat')">
              <span class="lg-other__ico">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9.5 4C5.9 4 3 6.4 3 9.4c0 1.7 1 3.3 2.5 4.3l-.6 2.3 2.6-1.3c.6.2 1.3.3 2 .3" />
                  <path d="M14.5 8.5c3 0 5.5 2 5.5 4.6 0 1.5-.9 2.9-2.2 3.8l.5 2-2.2-1.1c-.5.1-1 .2-1.6.2-3 0-5.5-2-5.5-4.7s2.5-4.8 5.5-4.8Z" />
                  <circle cx="7.5" cy="9" r="0.4" fill="currentColor" />
                  <circle cx="11" cy="9" r="0.4" fill="currentColor" />
                  <circle cx="13.5" cy="12" r="0.4" fill="currentColor" />
                  <circle cx="16.5" cy="12" r="0.4" fill="currentColor" />
                </svg>
              </span>
              <em>微信</em>
            </button>
            <button type="button" class="lg-other__item" title="邮箱登录 / 注册" @click="otherLogin('email')">
              <span class="lg-other__ico">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
              </span>
              <em>邮箱</em>
            </button>
            <button type="button" class="lg-other__item" title="手机号验证码登录 / 注册" @click="otherLogin('phone')">
              <span class="lg-other__ico">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="7" y="3" width="10" height="18" rx="2.5" />
                  <path d="M10.5 6h3" />
                  <circle cx="12" cy="17.5" r="0.6" fill="currentColor" />
                </svg>
              </span>
              <em>验证码登录</em>
            </button>
          </div>
        </div>

        <!-- AI 业务提示（赛道特色：让评委一眼识别这是 AI 驱动应用） -->
        <p class="lg-aihint">
          <b>📌</b>
          提示：拍照上传作物叶片，AI 多 Agent 自动识别病害，生成防治方案
        </p>

        <!-- AI 提示跑马灯 -->
        <Transition name="tipfade" mode="out-in">
          <p :key="tipIdx" class="lg-tip">
            <b>AI</b>
            {{ TIPS[tipIdx] }}
          </p>
        </Transition>

        <!-- 知识库统计（后端接口动态渲染；失败时兜底文案） -->
        <p class="lg-kbstat" :class="{ 'is-fail': !kbStat }">
          <span class="lg-kbstat__dot" />
          <span>{{ kbText }}</span>
          <button
            type="button"
            class="lg-kbstat__refresh"
            :class="{ 'is-spinning': kbLoading }"
            title="刷新知识库统计"
            aria-label="刷新知识库统计"
            @click="refreshKb"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 11a8 8 0 1 0-2.3 6.3" />
              <path d="M20 5v6h-6" />
            </svg>
          </button>
        </p>

        <!-- 卡内页脚（弱化，避免与卡外文字重复） -->
        <p class="lg-footnote">AI 多 Agent 智能诊断 · 让山地种植更省心</p>
      </div>
    </div>

    <!-- 其他方式弹层 -->
    <Teleport to="body">
      <Transition name="tipfade">
        <div v-if="otherOpen" class="om-mask" @click.self="closeOther">
          <!-- 微信：真实扫码（已配置开放平台） -->
          <div v-if="otherOpen === 'wechat'" class="om">
            <header class="om__head">
              <b>💬 微信授权登录</b>
              <button type="button" class="om__close" @click="closeOther">✕</button>
            </header>
            <div class="om__body om__body--qr">
              <template v-if="wechatReal">
                <iframe
                  :src="wechatQrUrl"
                  class="wx-iframe"
                  frameborder="0"
                  allowtransparency="true"
                  scrolling="no"
                  title="微信扫码登录"
                />
                <p class="om__note">请使用微信扫描二维码确认登录，授权后将自动绑定并进入系统</p>
                <div class="wx-actions">
                  <button type="button" class="om__refresh" @click="gotoWechat">在新页面打开微信授权</button>
                  <button type="button" class="om__refresh" @click="otherLogin('wechat')">刷新二维码</button>
                </div>
              </template>
              <template v-else>
                <div class="qr" :class="{ 'is-done': scanning }">
                  <div class="qr__grid">
                    <i v-for="n in 49" :key="n" :class="{ on: pseudoQr(n) }" />
                  </div>
                  <div class="qr__scan">{{ scanning ? '✓ 已授权' : '请使用微信扫一扫' }}</div>
                </div>
                <p class="om__note om__note--center">
                  当前为演示版本，微信登录采用模拟体验模式
                </p>
                <AppButton block variant="primary" :loading="scanning" @click="oauthSubmit">
                  {{ scanning ? '✓ 授权成功，正在进入…' : '模拟微信扫码成功' }}
                </AppButton>
              </template>
              <p v-if="wechatErr" class="om__note" style="color: #ffb3ab">{{ wechatErr }}</p>
            </div>
          </div>

          <!-- 邮箱 / 手机号：验证码快捷登录注册 -->
          <div v-else class="om">
            <header class="om__head">
              <b>{{ otherOpen === 'email' ? '✉️' : '📱' }} {{ PROVIDER_META[otherOpen].name }}登录 / 注册</b>
              <button type="button" class="om__close" @click="closeOther">✕</button>
            </header>
            <div class="om__body">
              <label class="lg-field">
                <span class="lg-field__label">{{ PROVIDER_META[otherOpen].name }}账号</span>
                <input
                  v-model="quickTarget"
                  class="lg-field__input"
                  :type="PROVIDER_META[otherOpen].type"
                  :placeholder="PROVIDER_META[otherOpen].ph"
                  autocomplete="username"
                />
              </label>

              <label class="lg-field">
                <span class="lg-field__label">验证码</span>
                <div class="lg-code-row">
                  <input
                    v-model="quickCode"
                    class="lg-field__input"
                    maxlength="6"
                    placeholder="6 位验证码"
                    autocomplete="one-time-code"
                    @keyup.enter="canQuick && quickSubmit()"
                  />
                  <button type="button" class="lg-code-btn" :disabled="countdown > 0 || sending || !quickTarget.trim()" @click="getCode">
                    {{ sending ? '发送中…' : countdown > 0 ? `${countdown}s 后重发` : '获取验证码' }}
                  </button>
                </div>
                <em v-if="codeHint" class="lg-code-hint">演示环境验证码：<b>{{ codeHint }}</b>（正式环境对接短信 / 邮件服务后真实下发）</em>
              </label>

              <div class="lg-roles">
                <button type="button" class="lg-role" :class="{ 'is-on': quickRole === 'user' }" @click="quickRole = 'user'">🌾 我是农户</button>
                <button type="button" class="lg-role" :class="{ 'is-on': quickRole === 'expert' }" @click="quickRole = 'expert'">🎓 我是专家</button>
              </div>
              <label v-if="quickRole === 'expert'" class="lg-field">
                <span class="lg-field__label">📍 驻点地区</span>
                <input v-model="quickRegion" class="lg-field__input" placeholder="如：文山市" />
              </label>

              <AppButton block variant="primary" :loading="quickBusy" :disabled="!canQuick" @click="quickSubmit">
                {{ quickBusy ? '⏳ 处理中…' : '登录 / 注册' }}
              </AppButton>
              <p class="om__note om__note--center">未注册的手机号将自动创建账号，无需单独注册流程</p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
.lg {
  position: fixed;
  inset: 0;
  overflow: auto;
  background: #0c2013;
  display: flex;
  flex-direction: column;
}

.lg__bg {
  position: fixed;
  inset: -3%;
  z-index: 0;
  background: url('/media/bg-yunling.jpg') center 30% / cover no-repeat;
}

.lg__kenburns {
  animation: lgKenburns 22s ease-in-out infinite alternate;
  will-change: transform;
}

@keyframes lgKenburns {
  0% {
    transform: scale(1) translate(0, 0);
  }
  100% {
    transform: scale(1.26) translate(-3%, -4%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lg__kenburns {
    animation: none;
  }
}

/* 深色蒙版：弱化背景饱和度、突出登录卡片 */
.lg__shade {
  position: fixed;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(180deg, rgba(10, 30, 18, 0.42), rgba(10, 28, 17, 0.3) 40%, rgba(7, 20, 12, 0.55)),
    radial-gradient(85% 68% at 50% 44%, rgba(8, 30, 17, 0.14), rgba(6, 18, 10, 0.5));
  backdrop-filter: saturate(88%);
  -webkit-backdrop-filter: saturate(88%);
}

.lg__grain {
  position: fixed;
  inset: 0;
  z-index: 1;
  opacity: 0.05;
  background-image: radial-gradient(rgba(255, 255, 255, 0.9) 0.5px, transparent 0.5px);
  background-size: 3px 3px;
  pointer-events: none;
}

/* 顶部品牌条 */
.lg__topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 26px;
  color: #fff;
}

.lg__logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 1px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.lg__logo-ico {
  font-size: 20px;
}

/* 右上角 slogan：弱化视觉权重 */
.lg__region {
  font-size: 12px;
  opacity: 0.85;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
  padding: 7px 14px;
  border-radius: 999px;
  backdrop-filter: blur(6px);
}

.lg__region--soft {
  font-size: 12.5px;
  font-weight: 400;
  opacity: 0.6;
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.1);
}

/* 登录卡 */
.lg__wrap {
  position: relative;
  z-index: 2;
  flex: 1;
  display: grid;
  place-items: center;
  padding: 10px 16px 6px;
}

.lg-card {
  width: min(432px, 100%);
  max-height: calc(100dvh - 96px);
  overflow-y: auto;
  background: rgba(14, 34, 22, 0.66);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: var(--r-lg);
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  padding: 20px 30px 14px;
  color: #fff;
  text-align: center;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.lg-card__icons {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 6px;
}

.lg-card__ico {
  font-size: 26px;
  filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.35));
}

.lg-card__title {
  font-size: 30px;
  font-weight: 900;
  letter-spacing: 4px;
  /* 明亮浅黄绿 + 高光：第一眼聚焦项目名 */
  color: #f7fbe6;
  text-shadow:
    0 0 18px rgba(163, 230, 53, 0.35),
    0 0 40px rgba(88, 200, 120, 0.22),
    0 2px 4px rgba(0, 0, 0, 0.45);
}

/* 副标题：突出 AI 核心定位 */
.lg-card__subtitle {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 1.5px;
  color: rgba(255, 255, 255, 0.88);
  margin: 6px 0 14px;
}

/* 注册身份 */
.lg-roles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-bottom: 13px;
}

.lg-role {
  padding: 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  font-weight: 700;
  transition: all 0.15s;
}

.lg-role:hover {
  background: rgba(255, 255, 255, 0.14);
}

.lg-role:active {
  transform: scale(0.97);
}

.lg-role.is-on {
  background: rgba(88, 200, 120, 0.28);
  border-color: #6fce8d;
  color: #fff;
}

.lg-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.lg-chip {
  font-size: 12.5px;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.85);
  transition: all 0.15s;
}

.lg-chip:hover {
  background: rgba(255, 255, 255, 0.15);
}

.lg-chip:active {
  transform: scale(0.95);
}

.lg-chip.is-on {
  background: rgba(88, 200, 120, 0.3);
  border-color: #6fce8d;
  color: #fff;
  font-weight: 700;
}

.lg-field {
  display: block;
  text-align: left;
  margin-bottom: 13px;
}

.lg-field__label {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}

.lg-field__input {
  width: 100%;
  padding: 12px 15px;
  border-radius: 13px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.09);
  color: #fff;
  font-size: 15px;
  transition: border-color 0.15s, background 0.15s;
}

.lg-field__input::placeholder {
  color: rgba(255, 255, 255, 0.45);
}

.lg-field__input:focus {
  outline: none;
  border-color: #9fd8ae;
  background: rgba(255, 255, 255, 0.15);
}

.lreg__err {
  font-size: 12px;
  color: #ffb3ab;
  background: rgba(180, 52, 47, 0.22);
  border: 1px solid rgba(255, 130, 120, 0.35);
  border-radius: 10px;
  padding: 8px 11px;
  margin-bottom: 12px;
  text-align: left;
}

/* 忘记密码表单 */
.lforgot__tip {
  font-size: 12.5px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 9px 12px;
  margin-bottom: 14px;
  text-align: left;
}

.lforgot__back {
  width: 100%;
  margin-top: 10px;
  height: 34px;
  font-size: 12.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.72);
  background: transparent;
  border: none;
  cursor: pointer;
}

.lforgot__back:hover {
  color: #fff;
}

.lg-switch {
  margin: 11px 0 2px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.75);
}

.lg-switch__link {
  color: #9fd8ae;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 3px;
  transition: opacity 0.15s;
}

.lg-switch__link:hover {
  opacity: 0.85;
}

.lg-switch__link:active {
  opacity: 0.65;
}

/* 快速体验 */
.lg-demo {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed rgba(255, 255, 255, 0.18);
}

.lg-demo small {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 2px;
}

.lg-demo__btns {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 9px;
  margin-top: 9px;
}

.lg-demo__btn {
  position: relative;
  padding: 10px 10px;
  border-radius: 999px;
  font-size: 13.5px;
  font-weight: 800;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}

/* 体验按钮 loading：spinner 居中、文字隐藏 */
.lg-demo__btn.is-loading {
  opacity: 0.75;
}

.lg-demo__btn .is-hidden {
  opacity: 0;
}

.lg-demo__spin {
  position: absolute;
  width: 18px;
  height: 18px;
  left: 50%;
  top: 50%;
  margin: -9px 0 0 -9px;
  border-radius: 50%;
  border: 2.5px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  animation: abtnSpin 0.7s linear infinite;
}

/* 主按钮：农户体验（品牌绿） */
.lg-demo__btn--primary {
  color: #fff;
  background: linear-gradient(135deg, #1f8a4c, #166532);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 8px 20px rgba(20, 90, 50, 0.5);
}

.lg-demo__btn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 11px 26px rgba(20, 90, 50, 0.62);
  background: linear-gradient(135deg, #239957, #18723a);
}

/* 次要按钮：专家体验（浅色玻璃） */
.lg-demo__btn--soft {
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.28);
}

.lg-demo__btn--soft:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
}

.lg-demo__btn:active:not(:disabled) {
  transform: scale(0.97);
}

.lg-demo__btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* 悬浮 tooltip（纯 CSS，无需 JS） */
.lg-demo__btn::after {
  content: attr(data-tip);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%) translateY(4px);
  width: max-content;
  max-width: 250px;
  white-space: normal;
  background: rgba(8, 24, 14, 0.94);
  border: 1px solid rgba(88, 200, 120, 0.35);
  color: #dcefe2;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.55;
  letter-spacing: 0.2px;
  padding: 7px 11px;
  border-radius: 9px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s, transform 0.18s;
  z-index: 30;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.4);
}

.lg-demo__btn:hover::after {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* 其他方式登录：线性绿色图标 + 文字标签 */
.lg-other {
  margin-top: 12px;
}

.lg-other small {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 1px;
}

.lg-other__btns {
  display: flex;
  justify-content: center;
  gap: 22px;
  margin-top: 8px;
}

.lg-other__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  background: transparent;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
}

.lg-other__ico {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #7fce9d;
  border: 1.5px solid rgba(88, 200, 120, 0.5);
  background: rgba(88, 200, 120, 0.08);
  transition: all 0.15s;
}

.lg-other__item:hover .lg-other__ico {
  background: rgba(88, 200, 120, 0.18);
  border-color: #7fce9d;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(20, 90, 50, 0.35);
}

.lg-other__item:active .lg-other__ico {
  transform: scale(0.94);
}

.lg-other__item em {
  font-style: normal;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.72);
  letter-spacing: 0.5px;
}

/* AI 业务提示（赛道特色）：淡入 + 轻微呼吸，不抢表单主体注意力 */
.lg-aihint {
  margin-top: 12px;
  padding: 9px 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(88, 200, 120, 0.14), rgba(31, 138, 76, 0.1));
  border: 1px solid rgba(88, 200, 120, 0.3);
  font-size: 12px;
  line-height: 1.6;
  color: #e2f4e8;
  text-align: left;
  animation: hintIn 0.5s ease-out both, hintBreath 3.8s 0.8s ease-in-out infinite;
}

@keyframes hintIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
}

@keyframes hintBreath {
  0%,
  100% {
    opacity: 0.88;
  }
  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lg-aihint {
    animation: none;
  }
}

.lg-aihint b {
  margin-right: 5px;
}

/* AI 提示跑马灯 */
.lg-tip {
  margin-top: 10px;
  padding: 9px 13px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 11.5px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.85);
  text-align: left;
}

.lg-tip b {
  display: inline-block;
  margin-right: 7px;
  padding: 1px 7px;
  border-radius: 6px;
  font-size: 11.5px;
  background: linear-gradient(135deg, #f0c75e, #d9a23a);
  color: #3a2a05;
}

/* 知识库统计（动态数据 + 兜底） */
.lg-kbstat {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: 10px;
  font-size: 11.5px;
  letter-spacing: 0.4px;
  color: #b9e6c8;
}

/* 手动刷新小图标 */
.lg-kbstat__refresh {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  color: rgba(185, 230, 200, 0.75);
  background: transparent;
  transition: background 0.15s, color 0.15s, transform 0.15s;
}

.lg-kbstat__refresh:hover {
  background: rgba(88, 200, 120, 0.18);
  color: #dcefe2;
  transform: rotate(30deg);
}

.lg-kbstat__refresh:active {
  transform: scale(0.9);
}

.lg-kbstat__refresh.is-spinning svg {
  animation: kbSpin 0.8s linear infinite;
}

@keyframes kbSpin {
  to {
    transform: rotate(360deg);
  }
}

/* 卡内页脚（弱化） */
.lg-footnote {
  margin-top: 7px;
  font-size: 11.5px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.42);
}

.lg-kbstat.is-fail {
  color: rgba(255, 217, 160, 0.85);
}

.lg-kbstat__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #58c878;
  box-shadow: 0 0 8px rgba(88, 200, 120, 0.8);
  animation: kbPulse 2s ease-in-out infinite;
}

.lg-kbstat.is-fail .lg-kbstat__dot {
  background: #d9a23a;
  box-shadow: 0 0 8px rgba(217, 162, 58, 0.7);
  animation: none;
}

@keyframes kbPulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.45;
  }
}

.tipfade-enter-active,
.tipfade-leave-active {
  transition: opacity 0.4s, transform 0.4s;
}

.tipfade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.tipfade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

/* ===== 其他方式弹层 ===== */
.om-mask {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(6, 18, 10, 0.6);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  padding: 20px;
}

.om {
  width: min(400px, 100%);
  max-height: 86vh;
  overflow-y: auto;
  border-radius: var(--r-lg);
  background: rgba(16, 36, 24, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.16);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
  color: #fff;
}

.om__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 14.5px;
}

.om__close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  transition: background 0.15s, transform 0.15s;
}

.om__close:hover {
  background: rgba(255, 255, 255, 0.22);
}

.om__close:active {
  transform: scale(0.9);
}

.om__body {
  padding: 16px 18px 20px;
}

.om__body--qr {
  text-align: center;
}

/* 模拟二维码 */
.qr {
  width: 190px;
  margin: 6px auto 12px;
  padding: 12px;
  border-radius: 14px;
  background: #fff;
  position: relative;
}

.qr__grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.qr__grid i {
  aspect-ratio: 1;
  border-radius: 1px;
  background: #d8e4da;
}

.qr__grid i.on {
  background: #12331f;
}

.qr__scan {
  position: absolute;
  inset: auto 12px 12px;
  background: linear-gradient(135deg, #1f8a4c, #166532);
  color: #fff;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 700;
  padding: 5px;
}

.qr.is-done {
  outline: 3px solid #58c878;
}

.om__note {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.65);
  line-height: 1.7;
  margin-bottom: 12px;
}

.om__note--center {
  text-align: center;
  margin-left: auto;
  margin-right: auto;
}

.wx-iframe {
  width: 300px;
  height: 400px;
  max-width: 100%;
  border: none;
  border-radius: 12px;
  background: #fff;
  margin-bottom: 10px;
}

.om__refresh {
  padding: 7px 16px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  transition: background 0.15s, transform 0.15s;
}

.om__refresh:hover {
  background: rgba(255, 255, 255, 0.2);
}

.om__refresh:active {
  transform: scale(0.96);
}

.wx-actions {
  display: flex;
  gap: 9px;
  justify-content: center;
  flex-wrap: wrap;
}

.lg-code-row {
  display: flex;
  gap: 8px;
}

.lg-code-row .lg-field__input {
  flex: 1;
}

.lg-code-btn {
  flex-shrink: 0;
  padding: 0 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
  transition: background 0.15s, transform 0.15s;
}

.lg-code-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.lg-code-btn:active:not(:disabled) {
  transform: scale(0.96);
}

.lg-code-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lg-code-hint {
  display: block;
  font-size: 12.5px;
  color: #ffd9a0;
  margin-top: 6px;
  font-style: normal;
}

.lg-code-hint b {
  color: #ffe9bd;
  letter-spacing: 2px;
}

/* 矮屏（笔记本小窗口）压缩纵向留白：隐藏装饰图标与跑马灯，收紧间距 */
@media (max-height: 900px) {
  .lg-card__icons {
    display: none;
  }
  .lg-tip {
    display: none;
  }
  .lg-card {
    padding: 16px 28px 12px;
  }
  :deep(.ai-field) {
    margin-bottom: 9px;
  }
  .lg-switch {
    margin: 9px 0 0;
  }
  .lg-demo {
    margin-top: 10px;
    padding-top: 10px;
  }
  .lg-aihint {
    margin-top: 10px;
    padding: 8px 11px;
  }
  .lg-other {
    margin-top: 9px;
  }
  .lg-kbstat {
    margin-top: 6px;
  }
  .lg-footnote {
    display: none;
  }
}

/* ===== 响应式适配：平板 / 小屏 ===== */
@media (max-width: 720px) {
  .lg__topbar {
    padding: 14px 16px;
  }
  .lg__region {
    display: none;
  }
  .lg-card {
    padding: 22px 18px 18px;
    max-height: calc(100dvh - 110px);
    border-radius: var(--r-lg);
  }
  .lg-other__btns {
    gap: 16px;
  }
}

@media (max-width: 400px) {
  .lg-card {
    padding: 18px 14px 16px;
    border-radius: var(--r-lg);
  }
  .lg-card__title {
    font-size: 26px;
  }
  .lg-card__subtitle {
    font-size: 12px;
  }
  .lg-other__btns {
    gap: 10px;
  }
  .lg-other__ico {
    width: 40px;
    height: 40px;
  }
  .lg-demo__btns {
    grid-template-columns: 1fr;
  }
}

/* 矮屏（笔记本小窗口）压缩纵向留白 */

</style>
