<script setup lang="ts">
/**
 * 全屏登录落地页 · 视频背景
 * 山地梯田航拍视频 + 深绿遮罩 + 玻璃拟态登录卡
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '@/api'
import { useAppStore } from '@/stores/app'
import { addLocalExpert } from '@/data/localExperts'

const router = useRouter()
const route = useRoute()
const store = useAppStore()

const mode = ref<'login' | 'register'>('login')
const account = ref('')
const password = ref('')
const confirmPwd = ref('')
const nickname = ref('')
const regRole = ref<'user' | 'expert'>('user')
const regTitle = ref('')
const regRegion = ref('')
const regSpecialty = ref<string[]>([])
const remember = ref(true)
const busy = ref(false)
const errMsg = ref('')

const SPECIALTIES = ['普洱茶树', '昭通天麻', '云南核桃', '大红花椒', '富源魔芋', '蒙自石榴', '普洱咖啡', '文山三七', '高原蓝莓', '柑橘', '烤烟', '马铃薯']

const toggleSpecialty = (s: string) => {
  const i = regSpecialty.value.indexOf(s)
  if (i >= 0) regSpecialty.value.splice(i, 1)
  else if (regSpecialty.value.length < 8) regSpecialty.value.push(s)
}

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

const canSubmit = computed(() => {
  if (busy.value) return false
  if (mode.value === 'login') return account.value.trim() && password.value
  if (!account.value.trim() || !password.value || password.value.length < 6) return false
  if (confirmPwd.value !== password.value) return false
  if (!nickname.value.trim()) return false
  if (regRole.value === 'expert') return !!regTitle.value.trim()
  return true
})

const goIn = () => {
  const redirect = (route.query.redirect as string) || '/'
  router.replace(redirect)
}

const submit = async () => {
  if (!canSubmit.value) return
  busy.value = true
  errMsg.value = ''
  try {
    if (mode.value === 'login') {
      const res = await api.login({ account: account.value.trim(), password: password.value })
      store.setAuth(res.token, res.user)
      store.showToast(`欢迎回来，${res.user.nickname || '农户朋友'}`, 'success')
    } else {
      const res = await api.register({
        account: account.value.trim(),
        password: password.value,
        nickname: nickname.value.trim(),
        role: regRole.value,
        title: regRole.value === 'expert' ? regTitle.value.trim() : undefined,
        specialty: regRole.value === 'expert' ? [...regSpecialty.value] : undefined,
        region: regRole.value === 'expert' ? regRegion.value.trim() : undefined
      })
      store.setAuth(res.token, res.user)
      publishExpert(res.user)
      store.showToast('注册成功，欢迎加入云岭农诊', 'success')
    }
    goIn()
  } catch (e: any) {
    // 静态托管兜底：本机注册（无后端时也能注册成功并进入对应端）
    if (mode.value === 'register') {
      const localUser = {
        id: Date.now(),
        account: account.value.trim(),
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
      return
    }
    errMsg.value = e?.message || '操作失败，请重试'
  } finally {
    busy.value = false
  }
}

/** 演示账号一键体验 */
const demo = async (role: 'user' | 'expert') => {
  busy.value = true
  errMsg.value = ''
  try {
    const res = await api.login({
      account: role === 'expert' ? '13800000001' : '13800000002',
      password: 'demo123'
    })
    store.setAuth(res.token, res.user)
    goIn()
  } catch (e: any) {
    errMsg.value = e?.message || '演示登录失败'
  } finally {
    busy.value = false
  }
}

/** 其他登录方式 */
type QuickProvider = 'wechat' | 'alipay' | 'email' | 'phone' | 'scan'
const otherOpen = ref<QuickProvider | null>(null)
const wechatReal = ref(false)
const wechatQrUrl = ref('')
const wechatErr = ref('')
const wechatMissing = ref<string[]>([])
const quickMode = ref<'login' | 'register'>('login')
const quickTarget = ref('')
const quickCode = ref('')
const quickNickname = ref('')
const quickRole = ref<'user' | 'expert'>('user')
const quickBusy = ref(false)
const codeSent = ref(false)
const codeHint = ref('')
const countdown = ref(0)
let cdTimer: number | undefined

const PROVIDER_META: Record<QuickProvider, { name: string; icon: string; ph: string; type?: string }> = {
  wechat: { name: '微信', icon: '💬', ph: '' },
  alipay: { name: '支付宝', icon: '🅰️', ph: '' },
  email: { name: '邮箱', icon: '✉️', ph: 'you@example.com', type: 'email' },
  phone: { name: '手机号', icon: '📱', ph: '13800000000', type: 'tel' },
  scan: { name: '扫码', icon: '▦', ph: '' }
}

const otherLogin = async (p: QuickProvider) => {
  if (p === 'scan') {
    // 真实跨设备扫码登录：生成二维码并轮询
    scanQrImg.value = ''
    scanTicket.value = ''
    scanStatus.value = 'loading'
    otherOpen.value = p
    await startScan()
    return
  }
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
  if (p === 'alipay') {
    otherOpen.value = p
    return
  }
  quickMode.value = 'login'
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
  if (scanTimer) clearInterval(scanTimer)
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
  if (!canQuick.value || !otherOpen.value) return
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

/** 模拟扫码授权 */
const scanning = ref(false)
const oauthSubmit = async () => {
  if (!otherOpen.value || scanning.value) return
  scanning.value = true
  try {
    const res = await api.oauthAuth({ provider: otherOpen.value as 'wechat' | 'alipay' })
    store.setAuth(res.token, res.user)
    store.showToast(`${PROVIDER_META[otherOpen.value].name}授权成功，欢迎 ${res.user.nickname}`, 'success')
    closeOther()
    goIn()
  } catch (e: any) {
    // 静态托管兜底：授权演示直通
    const localUser = {
      id: Date.now(),
      account: `oauth_${otherOpen.value}_${Date.now()}`,
      nickname: `${PROVIDER_META[otherOpen.value].name}用户`,
      role: 'user',
      phone: '',
      email: '',
      wechatId: '',
      avatar: '',
      region: '云南',
      createdAt: new Date().toISOString()
    }
    store.setAuth(`local_${Date.now()}`, localUser as any)
    store.showToast(`${PROVIDER_META[otherOpen.value].name}授权成功，欢迎 ${localUser.nickname}`, 'success')
    closeOther()
    goIn()
  } finally {
    scanning.value = false
  }
}

/** ===== 跨设备真实扫码登录 ===== */
const scanQrImg = ref('')
const scanTicket = ref('')
const scanStatus = ref<'loading' | 'pending' | 'scanned' | 'confirmed' | 'expired'>('loading')
let scanTimer: number | undefined

const startScan = async () => {
  scanStatus.value = 'loading'
  try {
    const res = await api.scanQr()
    scanQrImg.value = res.qrDataUrl
    scanTicket.value = res.ticket
    scanStatus.value = 'pending'
    if (scanTimer) clearInterval(scanTimer)
    scanTimer = window.setInterval(pollScan, 1500)
  } catch (e: any) {
    store.showToast(e?.message || '二维码生成失败', 'error')
    scanStatus.value = 'expired'
  }
}

const pollScan = async () => {
  if (!scanTicket.value) return
  try {
    const res = await api.scanPoll(scanTicket.value)
    if (res.status === 'expired') {
      scanStatus.value = 'expired'
      if (scanTimer) clearInterval(scanTimer)
      return
    }
    if (res.status === 'confirmed' && res.token) {
      scanStatus.value = 'confirmed'
      if (scanTimer) clearInterval(scanTimer)
      const user = await api.meWithToken(res.token)
      store.setAuth(res.token, user)
      store.showToast(`扫码登录成功，欢迎 ${user.nickname}`, 'success')
      closeOther()
      goIn()
    } else if (res.status === 'scanned') {
      scanStatus.value = 'scanned'
    }
  } catch {
    /* 轮询失败静默重试 */
  }
}

/** 模拟二维码图案（固定伪随机，视觉用） */
const pseudoQr = (n: number) => {
  const x = (n * 2654435761) % 4294967296
  return (x ^ (n * 97)) % 3 !== 0
}

/** 底部 AI 提示轮播 */
const TIPS = [
  'AI 多 Agent 流水线：识别 → 知识检索 → 复核把关，30 秒出具诊断报告',
  '今日提醒：雨季来临，三七根腐病高发，注意清沟排水',
  '低置信度病例自动转人工复核，专家团队在线支撑',
  '知识库已收录 10 种山地作物 · 34 种常见病虫害'
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
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('message', onOauthMessage)
})
</script>

<template>
  <div class="lg">
    <!-- 视频背景：层叠青山薄雾（Pexels 免费授权，已提亮调色） -->
    <video
      class="lg__video"
      src="/media/login-bg.mp4"
      poster="/media/login-bg-poster.jpg"
      autoplay
      muted
      loop
      playsinline
    />
    <div class="lg__shade" />
    <div class="lg__grain" />

    <!-- 顶部品牌条 -->
    <div class="lg__topbar">
      <span class="lg__logo">
        <span class="lg__logo-ico">🌿</span>
        云岭农诊
      </span>
      <span class="lg__region">📍 服务云南山地特色作物</span>
    </div>

    <!-- 登录卡 -->
    <div class="lg__wrap">
      <div class="lg-card">
        <div class="lg-card__icons">
          <span class="lg-card__ico">🌱</span>
          <span class="lg-card__ico">🤖</span>
        </div>
        <h1 class="lg-card__title">云岭农诊</h1>
        <div class="lg-card__tags">
          <span>山地作物 · AI 农技员</span>
          <i />
          <span>多 Agent 智能诊断</span>
        </div>

        <!-- 登录表单 -->
        <template v-if="mode === 'login'">
          <label class="lg-field">
            <span class="lg-field__label">👤 账号 / 手机号</span>
            <input v-model="account" class="lg-field__input" placeholder="手机号 / 账号" autocomplete="username" />
          </label>
          <label class="lg-field">
            <span class="lg-field__label">🔒 密码</span>
            <input
              v-model="password"
              class="lg-field__input"
              type="password"
              placeholder="密码"
              autocomplete="current-password"
              @keyup.enter="submit"
            />
          </label>
          <div class="lg-row">
            <label class="lg-check"><input v-model="remember" type="checkbox" /> 记住登录</label>
            <span class="lg-forgot">忘记密码？</span>
          </div>
        </template>

        <!-- 注册表单 -->
        <template v-else>
          <div class="lg-roles">
            <button class="lg-role" :class="{ 'is-on': regRole === 'user' }" @click="regRole = 'user'">🌾 我是农户</button>
            <button class="lg-role" :class="{ 'is-on': regRole === 'expert' }" @click="regRole = 'expert'">🎓 我是专家</button>
          </div>
          <label class="lg-field">
            <span class="lg-field__label">👤 昵称</span>
            <input v-model="nickname" class="lg-field__input" placeholder="怎么称呼您" />
          </label>
          <label class="lg-field">
            <span class="lg-field__label">📱 账号 / 手机号</span>
            <input v-model="account" class="lg-field__input" placeholder="用于登录" />
          </label>
          <label class="lg-field">
            <span class="lg-field__label">🔒 设置密码</span>
            <input v-model="password" class="lg-field__input" type="password" placeholder="至少 6 位" />
          </label>
          <label class="lg-field">
            <span class="lg-field__label">🔁 确认密码</span>
            <input
              v-model="confirmPwd"
              class="lg-field__input"
              type="password"
              placeholder="请再次输入密码"
              :class="{ 'is-bad': confirmPwd && confirmPwd !== password }"
              @keyup.enter="submit"
            />
          </label>
          <p v-if="confirmPwd && confirmPwd !== password" class="lg-warn">两次输入的密码不一致</p>
          <template v-if="regRole === 'expert'">
            <label class="lg-field">
              <span class="lg-field__label">🎓 职称</span>
              <input v-model="regTitle" class="lg-field__input" placeholder="如：高级农艺师" />
            </label>
            <div class="lg-field">
              <span class="lg-field__label">🌿 擅长领域（最多 8 项）</span>
              <div class="lg-chips">
                <button
                  v-for="s in SPECIALTIES"
                  :key="s"
                  class="lg-chip"
                  :class="{ 'is-on': regSpecialty.includes(s) }"
                  @click="toggleSpecialty(s)"
                >
                  {{ s }}
                </button>
              </div>
            </div>
            <label class="lg-field">
              <span class="lg-field__label">📍 驻点地区</span>
              <input v-model="regRegion" class="lg-field__input" placeholder="如：文山市" />
            </label>
          </template>
        </template>

        <p v-if="errMsg" class="lg-err">⚠️ {{ errMsg }}</p>

        <button class="lg-btn" :disabled="!canSubmit" @click="submit">
          <span v-if="busy">⏳ {{ mode === 'login' ? '登录中…' : '注册中…' }}</span>
          <span v-else>{{ mode === 'login' ? '🌿 登 录' : '🎉 注 册 并 加入' }}</span>
        </button>

        <p class="lg-switch">
          {{ mode === 'login' ? '没有账号？' : '已有账号？' }}
          <button class="lg-switch__link" @click="mode = mode === 'login' ? 'register' : 'login'; errMsg = ''">
            {{ mode === 'login' ? '立即注册' : '去登录' }}
          </button>
        </p>

        <div class="lg-demo">
          <small>快速体验</small>
          <div class="lg-demo__btns">
            <button class="lg-demo__btn" :disabled="busy" @click="demo('user')">🌾 农户体验</button>
            <button class="lg-demo__btn" :disabled="busy" @click="demo('expert')">🎓 专家体验</button>
          </div>
        </div>

        <div class="lg-other">
          <small>—— 其他方式登录 / 注册 ——</small>
          <div class="lg-other__btns">
            <button class="lg-other__btn" title="微信登录" @click="otherLogin('wechat')">💬</button>
            <button class="lg-other__btn" title="支付宝登录" @click="otherLogin('alipay')">🅰️</button>
            <button class="lg-other__btn" title="邮箱登录 / 注册" @click="otherLogin('email')">✉️</button>
            <button class="lg-other__btn" title="手机号登录 / 注册" @click="otherLogin('phone')">📱</button>
            <button class="lg-other__btn lg-other__btn--scan" title="真实扫码登录（手机扫码确认）" @click="otherLogin('scan')">▦</button>
          </div>
        </div>

        <!-- AI 跑马灯 -->
        <Transition name="tipfade" mode="out-in">
          <p :key="tipIdx" class="lg-tip">
            <b>AI</b>
            {{ TIPS[tipIdx] }}
          </p>
        </Transition>
      </div>
    </div>

    <!-- 其他方式弹层 -->
    <Teleport to="body">
      <Transition name="tipfade">
        <div v-if="otherOpen" class="om-mask" @click.self="closeOther">
          <!-- 真实跨设备扫码登录 -->
          <div v-if="otherOpen === 'scan'" class="om">
            <header class="om__head">
              <b>▦ 扫码登录</b>
              <button class="om__close" @click="closeOther">✕</button>
            </header>
            <div class="om__body om__body--qr">
              <div class="scan-qr">
                <img v-if="scanQrImg" :src="scanQrImg" alt="登录二维码" class="scan-qr__img" :class="{ 'is-dim': scanStatus === 'expired' }" />
                <div v-else class="scan-qr__loading">生成中…</div>
                <div v-if="scanStatus === 'expired'" class="scan-qr__mask">
                  <span>二维码已过期</span>
                  <button class="om__refresh" @click="startScan">刷新二维码</button>
                </div>
                <div v-if="scanStatus === 'confirmed'" class="scan-qr__mask scan-qr__mask--ok">✓ 已确认</div>
              </div>
              <p class="om__note" v-if="scanStatus === 'pending'">请用手机「扫一扫」识别二维码，在手机上确认后本机将自动登录</p>
              <p class="om__note" v-else-if="scanStatus === 'scanned'" style="color: #9fd8ae; font-weight: 700">
                ✓ 手机已打开确认页，请在手机上点击「确认登录」
              </p>
              <p class="om__note" v-else-if="scanStatus === 'confirmed'">登录成功，正在进入系统…</p>
              <p class="om__note" v-else-if="scanStatus === 'loading'">正在生成二维码…</p>
              <p class="om__note" style="opacity: 0.75">无需任何第三方账号资质 · 手机与电脑处于同一登录体系</p>
            </div>
          </div>

          <!-- 微信：真实扫码（已配置开放平台） -->
          <div v-if="otherOpen === 'wechat'" class="om">
            <header class="om__head">
              <b>💬 微信授权登录</b>
              <button class="om__close" @click="closeOther">✕</button>
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
                  <button class="om__refresh" @click="gotoWechat">在新页面打开微信授权</button>
                  <button class="om__refresh" @click="otherLogin('wechat')">刷新二维码</button>
                </div>
              </template>
              <template v-else>
                <div class="qr" :class="{ 'is-done': scanning }">
                  <div class="qr__grid">
                    <i v-for="n in 49" :key="n" :class="{ on: pseudoQr(n) }" />
                  </div>
                  <div class="qr__scan">{{ scanning ? '✓ 已授权' : '请使用微信扫一扫' }}</div>
                </div>
                <p class="om__note">
                  ⚠️ 未配置微信开放平台网站应用
                  <template v-if="wechatMissing.length">，缺少：<b style="color: #ffd9a0">{{ wechatMissing.join(' / ') }}</b></template>
                  。当前为演示模拟；在 <code>.env</code> 填入企业主体的 AppID / Secret / 回调域名后，此处自动切换为微信官方真实二维码。
                </p>
                <button class="lg-btn om__btn" :disabled="scanning" @click="oauthSubmit">
                  {{ scanning ? '✓ 授权成功，正在进入…' : '模拟微信扫码成功' }}
                </button>
              </template>
              <p v-if="wechatErr" class="om__note" style="color: #ffb3ab">{{ wechatErr }}</p>
            </div>
          </div>

          <!-- 支付宝：演示模拟 -->
          <div v-else-if="otherOpen === 'alipay'" class="om">
            <header class="om__head">
              <b>{{ PROVIDER_META[otherOpen].icon }} {{ PROVIDER_META[otherOpen].name }}授权登录</b>
              <button class="om__close" @click="closeOther">✕</button>
            </header>
            <div class="om__body om__body--qr">
              <div class="qr" :class="{ 'is-done': scanning }">
                <div class="qr__grid">
                  <i v-for="n in 49" :key="n" :class="{ on: pseudoQr(n) }" />
                </div>
                <div class="qr__scan">{{ scanning ? '✓ 已授权' : '请使用' + PROVIDER_META[otherOpen].name + '扫一扫' }}</div>
              </div>
              <p class="om__note">演示环境：点击下方按钮模拟扫码授权，将自动创建/登录绑定账号</p>
              <button class="lg-btn om__btn" :disabled="scanning" @click="oauthSubmit">
                {{ scanning ? '✓ 授权成功，正在进入…' : `模拟${PROVIDER_META[otherOpen].name}扫码成功` }}
              </button>
            </div>
          </div>

          <!-- 邮箱 / 手机号：验证码快捷登录注册 -->
          <div v-else class="om">
            <header class="om__head">
              <b>{{ PROVIDER_META[otherOpen].icon }} {{ PROVIDER_META[otherOpen].name }}登录 / 注册</b>
              <button class="om__close" @click="closeOther">✕</button>
            </header>
            <div class="om__body">
              <label class="lg-field">
                <span class="lg-field__label">{{ PROVIDER_META[otherOpen].name }}账号</span>
                <input
                  v-model="quickTarget"
                  class="lg-field__input"
                  :type="PROVIDER_META[otherOpen].type || 'text'"
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
                  <button class="lg-code-btn" :disabled="countdown > 0 || sending || !quickTarget.trim()" @click="getCode">
                    {{ sending ? '发送中…' : countdown > 0 ? `${countdown}s 后重发` : '获取验证码' }}
                  </button>
                </div>
                <em v-if="codeHint" class="lg-code-hint">演示环境验证码：<b>{{ codeHint }}</b>（配置邮件服务后真实下发）</em>
              </label>

              <div class="lg-roles">
                <button class="lg-role" :class="{ 'is-on': quickRole === 'user' }" @click="quickRole = 'user'">🌾 我是农户</button>
                <button class="lg-role" :class="{ 'is-on': quickRole === 'expert' }" @click="quickRole = 'expert'">🎓 我是专家</button>
              </div>
              <label v-if="quickRole === 'expert'" class="lg-field">
                <span class="lg-field__label">📍 驻点地区</span>
                <input v-model="quickRegion" class="lg-field__input" placeholder="如：文山市" />
              </label>

              <button class="lg-btn om__btn" :disabled="!canQuick" @click="quickSubmit">
                {{ quickBusy ? '⏳ 处理中…' : '登录 / 注册' }}
              </button>
              <p class="om__note">未注册的邮箱将自动创建账号，无需单独注册流程</p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 底部版权 -->
    <footer class="lg__foot">云岭农诊 · 山地特色经济作物病虫害多 Agent 诊断系统</footer>
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

.lg__video {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
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

.lg__shade {
  position: fixed;
  inset: 0;
  z-index: 1;
  background:
    linear-gradient(180deg, rgba(8, 26, 16, 0.55), rgba(8, 26, 16, 0.35) 40%, rgba(6, 20, 12, 0.72)),
    radial-gradient(90% 70% at 50% 45%, rgba(10, 40, 22, 0.12), rgba(6, 18, 10, 0.6));
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
  padding: 18px 28px;
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

.lg__region {
  font-size: 12px;
  opacity: 0.85;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
  padding: 7px 14px;
  border-radius: 999px;
  backdrop-filter: blur(6px);
}

/* 登录卡 */
.lg__wrap {
  position: relative;
  z-index: 2;
  flex: 1;
  display: grid;
  place-items: center;
  padding: 16px 16px 8px;
}

.lg-card {
  width: min(430px, 100%);
  max-height: calc(100dvh - 150px);
  overflow-y: auto;
  background: rgba(14, 34, 22, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 24px;
  backdrop-filter: blur(18px) saturate(140%);
  -webkit-backdrop-filter: blur(18px) saturate(140%);
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.45),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);
  padding: 30px 32px 24px;
  color: #fff;
  text-align: center;
}

.lg-card__icons {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 10px;
}

.lg-card__ico {
  font-size: 30px;
  filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.35));
}

.lg-card__title {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 3px;
  color: #f2e8c9;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}

.lg-card__tags {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 9px 0 20px;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.8);
}

.lg-card__tags i {
  width: 1px;
  height: 12px;
  background: rgba(255, 255, 255, 0.35);
}

/* 表单 */
.lg-field {
  display: block;
  text-align: left;
  margin-bottom: 13px;
}

.lg-field__label {
  display: block;
  font-size: 12px;
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
  font-size: 14px;
  transition: border-color var(--dur-fast), background var(--dur-fast);
}

.lg-field__input::placeholder {
  color: rgba(255, 255, 255, 0.45);
}

.lg-field__input:focus {
  outline: none;
  border-color: #9fd8ae;
  background: rgba(255, 255, 255, 0.15);
}

.lg-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 0 16px;
  font-size: 12px;
}

.lg-check {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
}

.lg-check input {
  accent-color: #2f9e5f;
}

.lg-forgot {
  color: rgba(255, 255, 255, 0.7);
  text-decoration: underline dashed;
  text-underline-offset: 3px;
  cursor: pointer;
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
  transition: all var(--dur-fast);
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
  font-size: 11px;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.07);
  color: rgba(255, 255, 255, 0.85);
  transition: all var(--dur-fast);
}

.lg-chip.is-on {
  background: rgba(88, 200, 120, 0.3);
  border-color: #6fce8d;
  color: #fff;
  font-weight: 700;
}

.lg-err {
  font-size: 12px;
  color: #ffb3ab;
  background: rgba(180, 52, 47, 0.22);
  border: 1px solid rgba(255, 130, 120, 0.35);
  border-radius: 10px;
  padding: 8px 11px;
  margin-bottom: 12px;
  text-align: left;
}

.lg-warn {
  font-size: 11.5px;
  color: #ffd9a0;
  margin: -8px 0 10px;
  text-align: left;
}

.lg-field__input.is-bad {
  border-color: rgba(255, 150, 130, 0.7);
}

/* 其他登录方式 */
.lg-other {
  margin-top: 13px;
}

.lg-other small {
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 1px;
}

.lg-other__btns {
  display: flex;
  justify-content: center;
  gap: 14px;
  margin-top: 9px;
}

.lg-other__btn {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 17px;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  transition: all var(--dur-fast);
}

.lg-other__btn:hover {
  background: rgba(255, 255, 255, 0.18);
  transform: translateY(-2px);
}

/* 登录按钮 */
.lg-btn {
  width: 100%;
  height: 48px;
  border-radius: 999px;
  font-size: 15.5px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #fff;
  background: linear-gradient(135deg, #1f8a4c, #166532);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 10px 26px rgba(20, 90, 50, 0.55);
  transition: transform var(--dur-fast), box-shadow var(--dur-fast), opacity var(--dur-fast);
}

.lg-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 14px 32px rgba(20, 90, 50, 0.65);
}

.lg-btn:disabled {
  opacity: 0.55;
}

.lg-switch {
  margin: 15px 0 4px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.75);
}

.lg-switch__link {
  color: #9fd8ae;
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* 演示登录 */
.lg-demo {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed rgba(255, 255, 255, 0.18);
}

.lg-demo small {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 2px;
}

.lg-demo__btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
  margin-top: 9px;
}

.lg-demo__btn {
  padding: 9px;
  border-radius: 11px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  transition: background var(--dur-fast);
}

.lg-demo__btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
}

/* AI 提示跑马灯 */
.lg-tip {
  margin-top: 15px;
  padding: 10px 13px;
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
  font-size: 10px;
  background: linear-gradient(135deg, #f0c75e, #d9a23a);
  color: #3a2a05;
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

.lg__foot {
  position: relative;
  z-index: 2;
  text-align: center;
  padding: 10px 16px 16px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  letter-spacing: 1px;
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
  border-radius: 20px;
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
  font-size: 11px;
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
}

.wx-actions {
  display: flex;
  gap: 9px;
  justify-content: center;
  flex-wrap: wrap;
}

/* 真实扫码 */
.scan-qr {
  position: relative;
  width: 220px;
  margin: 6px auto 12px;
}

.scan-qr__img {
  width: 100%;
  border-radius: 14px;
  background: #fff;
  padding: 8px;
}

.scan-qr__img.is-dim {
  filter: blur(3px) grayscale(0.6);
  opacity: 0.6;
}

.scan-qr__loading {
  height: 200px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}

.scan-qr__mask {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background: rgba(10, 28, 17, 0.82);
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  color: #fff;
  font-size: 13.5px;
  font-weight: 700;
}

.scan-qr__mask--ok {
  background: rgba(31, 138, 76, 0.9);
  font-size: 16px;
}

.om__btn {
  height: 44px;
  font-size: 14px;
  letter-spacing: 1px;
}

.om__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 14px;
}

.om__tab {
  padding: 9px;
  border-radius: 11px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  font-weight: 700;
}

.om__tab.is-on {
  background: rgba(88, 200, 120, 0.28);
  border-color: #6fce8d;
  color: #fff;
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
}

.lg-code-btn:disabled {
  opacity: 0.5;
}

.lg-code-hint {
  display: block;
  font-size: 11px;
  color: #ffd9a0;
  margin-top: 6px;
  font-style: normal;
}

.lg-code-hint b {
  color: #ffe9bd;
  letter-spacing: 2px;
}

@media (max-width: 720px) {
  .lg-card {
    padding: 24px 20px 20px;
    max-height: calc(100dvh - 130px);
  }
  .lg__region {
    display: none;
  }
}
</style>
