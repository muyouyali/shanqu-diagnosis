<script setup lang="ts">
/**
 * 全屏登录落地页 · 视频背景
 * 山地梯田航拍视频 + 深绿遮罩 + 玻璃拟态登录卡
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import api from '@/api'
import { useAppStore } from '@/stores/app'

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
      store.showToast('注册成功，欢迎加入云岭农诊', 'success')
    }
    goIn()
  } catch (e: any) {
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

/** 其他登录方式（演示环境模拟） */
const otherLogin = (name: string) => {
  store.showToast(`${name}登录暂未接入，请使用账号或「快速体验」`, 'info')
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
onMounted(() => {
  timer = window.setInterval(() => {
    tipIdx.value = (tipIdx.value + 1) % TIPS.length
  }, 4200)
})
onBeforeUnmount(() => timer && clearInterval(timer))
</script>

<template>
  <div class="lg">
    <!-- 视频背景 -->
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
          <small>—— 其他方式（演示环境可选体验） ——</small>
          <div class="lg-other__btns">
            <button class="lg-other__btn" title="微信登录" @click="otherLogin('微信')">💬</button>
            <button class="lg-other__btn" title="支付宝登录" @click="otherLogin('支付宝')">🅰️</button>
            <button class="lg-other__btn" title="Google 登录" @click="otherLogin('Google')">🇬</button>
            <button class="lg-other__btn" title="扫码登录" @click="otherLogin('扫码')">▦</button>
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
