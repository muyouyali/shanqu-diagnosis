<script setup lang="ts">
/**
 * 登录 / 注册弹层
 * 支持手机号、邮箱、微信号三种登录方式 + 密码
 */
import { ref, computed, watch } from 'vue'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { PROVINCES } from '@/data/regions'
import { useAppStore } from '@/stores/app'

const props = defineProps<{ open: boolean; initialMode?: 'login' | 'register' }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'success'): void }>()

const store = useAppStore()

const mode = ref<'login' | 'register'>('login')
const method = ref<'phone' | 'wechat' | 'email'>('phone')
const account = ref('')
const password = ref('')
const nickname = ref('')
const showPwd = ref(false)

/* 注册身份：农户 / 专家（专家需填职称、擅长领域、驻点地区） */
const regRole = ref<'user' | 'expert'>('user')
const regTitle = ref('')
const regRegion = ref('')
const regSpecialty = ref<string[]>([])
const EXPERT_FIELDS = ['三七', '重楼', '黄精', '蓝莓', '柑橘', '茶叶', '核桃', '花椒', '芒果', '咖啡', '食用玫瑰', '草果']
const toggleSpecialty = (f: string) => {
  const i = regSpecialty.value.indexOf(f)
  if (i === -1) regSpecialty.value = [...regSpecialty.value, f].slice(0, 8)
  else regSpecialty.value = regSpecialty.value.filter((x) => x !== f)
}
const regRegionOptions = PROVINCES.find((p) => p.name === '云南')!.groups.flatMap((g) => g.items)
const busy = ref(false)
const error = ref('')

watch(
  () => props.open,
  (v) => {
    if (v) {
      mode.value = props.initialMode || 'login'
      error.value = ''
      account.value = ''
      password.value = ''
      nickname.value = ''
    }
  }
)

const METHODS = [
  { key: 'phone', label: '手机号', icon: 'phone', placeholder: '请输入手机号' },
  { key: 'wechat', label: '微信', icon: 'chat', placeholder: '请输入微信号' },
  { key: 'email', label: '邮箱', icon: 'mail', placeholder: '请输入邮箱' }
] as const

const METHOD_PLACEHOLDER: Record<string, string> = {
  phone: '请输入手机号，如 13800000001',
  wechat: '请输入微信号',
  email: '请输入邮箱，如 farmer@qq.com'
}

const canGo = computed(() => {
  if (mode.value === 'register') {
    const base = account.value.trim().length >= 5 && password.value.length >= 6
    if (regRole.value === 'expert') return base && regSpecialty.value.length > 0 && !!regRegion.value
    return base
  }
  return account.value.trim().length >= 4 && password.value.length >= 1
})

const go = async () => {
  if (!canGo.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    if (mode.value === 'login') {
      const res = await api.login({
        account: account.value.trim(),
        password: password.value,
        method: method.value
      })
      store.setAuth(res.token, res.user)
      store.showToast(`欢迎回来，${res.user.nickname}`, 'success')
    } else {
      const res = await api.register({
        account: account.value.trim(),
        password: password.value,
        nickname: nickname.value.trim(),
        method: method.value,
        role: regRole.value,
        title: regRole.value === 'expert' ? regTitle.value.trim() : undefined,
        specialty: regRole.value === 'expert' ? regSpecialty.value : undefined,
        region: regRole.value === 'expert' ? regRegion.value : undefined
      })
      store.setAuth(res.token, res.user)
      store.showToast('注册成功，已自动登录', 'success')
    }
    emit('success')
    emit('close')
  } catch (e: any) {
    error.value = e?.message || '操作失败，请稍后重试'
  } finally {
    busy.value = false
  }
}

/** 一键填入演示账号（答辩演示用） */
const fillDemo = (role: 'expert' | 'user') => {
  method.value = 'phone'
  account.value = role === 'expert' ? '13800000001' : '13800000002'
  password.value = 'demo123'
  mode.value = 'login'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="au-mask" @click.self="emit('close')">
        <div class="au">
          <button class="au__close" @click="emit('close')"><AppIcon name="x" :size="15" /></button>

          <!-- 品牌区 -->
          <div class="au__hero">
            <span class="au__logo"><AppIcon name="leaf" :size="22" :stroke="2.2" /></span>
            <h2>{{ mode === 'login' ? '欢迎回来' : '加入云岭农诊' }}</h2>
            <p>{{ mode === 'login' ? '登录后可查看专家回复与个人档案' : '注册账号，开始山地作物的智能管护' }}</p>
          </div>

          <!-- 登录方式切换 -->
          <div class="au__methods">
            <button
              v-for="m in METHODS"
              :key="m.key"
              class="au__method"
              :class="{ 'is-on': method === m.key }"
              @click="method = m.key"
            >
              <AppIcon :name="m.icon" :size="15" />
              {{ m.label }}
            </button>
          </div>

          <div class="au__body">
            <label class="au__field">
              <span class="au__label">{{ METHODS.find((m) => m.key === method)?.label }}账号</span>
              <div class="au__input-wrap">
                <AppIcon :name="(METHODS.find((m) => m.key === method)?.icon || 'user') as any" :size="15" class="au__input-icon" />
                <input
                  v-model="account"
                  class="au__input"
                  :placeholder="METHOD_PLACEHOLDER[method]"
                  :type="method === 'email' ? 'email' : 'text'"
                  maxlength="40"
                />
              </div>
            </label>

            <label v-if="mode === 'register'" class="au__field">
              <span class="au__label">昵称</span>
              <div class="au__input-wrap">
                <AppIcon name="user" :size="15" class="au__input-icon" />
                <input v-model="nickname" class="au__input" placeholder="怎么称呼您？" maxlength="16" />
              </div>
            </label>

            <!-- 注册身份 -->
            <div v-if="mode === 'register'" class="au__field">
              <span class="au__label">注册身份</span>
              <div class="au__roles">
                <button type="button" class="au__role" :class="{ 'is-on': regRole === 'user' }" @click="regRole = 'user'">
                  <AppIcon name="user" :size="14" /> 我是农户
                </button>
                <button type="button" class="au__role" :class="{ 'is-on': regRole === 'expert' }" @click="regRole = 'expert'">
                  <AppIcon name="settings" :size="14" /> 我是专家
                </button>
              </div>
            </div>

            <template v-if="mode === 'register' && regRole === 'expert'">
              <label class="au__field">
                <span class="au__label">职称</span>
                <div class="au__input-wrap">
                  <AppIcon name="book" :size="15" class="au__input-icon" />
                  <input v-model="regTitle" class="au__input" placeholder="如：高级农艺师 / 植保专家" maxlength="12" />
                </div>
              </label>
              <div class="au__field">
                <span class="au__label">擅长领域 <i class="au__req">*</i></span>
                <div class="au__chips">
                  <button
                    v-for="f in EXPERT_FIELDS"
                    :key="f"
                    type="button"
                    class="au__chip"
                    :class="{ 'is-on': regSpecialty.includes(f) }"
                    @click="toggleSpecialty(f)"
                  >
                    {{ f }}
                  </button>
                </div>
                <small class="au__hint">选 1–8 个最擅长的作物/领域，农户将据此找到您</small>
              </div>
              <label class="au__field">
                <span class="au__label">驻点地区 <i class="au__req">*</i></span>
                <select v-model="regRegion" class="au__region">
                  <option value="">请选择州市</option>
                  <option v-for="r in regRegionOptions" :key="r" :value="r">{{ r }}</option>
                </select>
              </label>
            </template>

            <label class="au__field">
              <span class="au__label">密码</span>
              <div class="au__input-wrap">
                <AppIcon name="shield" :size="15" class="au__input-icon" />
                <input
                  v-model="password"
                  class="au__input"
                  :type="showPwd ? 'text' : 'password'"
                  placeholder="请输入密码"
                  maxlength="32"
                  @keyup.enter="go"
                />
                <button class="au__eye" type="button" @click="showPwd = !showPwd">
                  <AppIcon :name="showPwd ? 'eye-off' : 'eye'" :size="15" />
                </button>
              </div>
              <small v-if="mode === 'register'" class="au__hint">6–32 位，建议字母 + 数字组合</small>
            </label>

            <p v-if="error" class="au__error">
              <AppIcon name="alert" :size="13" />
              <span>
                {{ error }}
                <button
                  v-if="error.includes('密码错误') && mode === 'login'"
                  class="au__error-link"
                  @click="mode = 'register'"
                >
                  没有账号？先注册
                </button>
              </span>
            </p>

            <button class="au__btn" :disabled="!canGo || busy" @click="go">
              <AppIcon v-if="busy" name="loader" :size="15" class="spin" />
              {{ busy ? '处理中…' : mode === 'login' ? '登 录' : '注 册' }}
            </button>

            <p class="au__switch">
              {{ mode === 'login' ? '还没有账号？' : '已有账号？' }}
              <button @click="mode = mode === 'login' ? 'register' : 'login'; error = ''">
                {{ mode === 'login' ? '立即注册' : '去登录' }}
              </button>
            </p>

            <!-- 演示账号（评委一键体验） -->
            <div class="au__demo">
              <span>演示账号</span>
              <button @click="fillDemo('expert')">👨‍🌾 专家端</button>
              <button @click="fillDemo('user')">🌱 农户端</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.au-mask {
  position: fixed;
  inset: 0;
  z-index: 140;
  background: rgba(14, 30, 22, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
}

.au {
  position: relative;
  width: min(400px, 100%);
  max-height: 92vh;
  overflow-y: auto;
  background: var(--c-bg-card);
  border-radius: 22px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
}

.au__close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
  z-index: 1;
}

.au__hero {
  padding: 28px 24px 18px;
  text-align: center;
  background: linear-gradient(160deg, var(--c-primary-600), var(--c-primary-800));
  border-radius: 22px 22px 0 0;
  color: #fff;
}

.au__logo {
  display: inline-grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.16);
  margin-bottom: 10px;
}

.au__hero h2 {
  font-size: 19px;
  font-weight: 800;
  letter-spacing: 0.4px;
}

.au__hero p {
  font-size: 11.5px;
  opacity: 0.85;
  margin-top: 5px;
}

.au__methods {
  display: flex;
  gap: 7px;
  padding: 16px 22px 0;
}

.au__method {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 36px;
  border-radius: var(--r-full);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
  border: 1.5px solid transparent;
  transition: all var(--dur-fast);
}

.au__method.is-on {
  background: var(--c-primary-50);
  border-color: var(--c-primary-400);
  color: var(--c-primary-700);
}

.au__body {
  padding: 16px 22px 22px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.au__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.au__label {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-2);
}

.au__input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 44px;
  border-radius: 12px;
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-subtle);
  transition: border-color var(--dur-fast), background var(--dur-fast);
}

.au__input-wrap:focus-within {
  border-color: var(--c-primary-400);
  background: #fff;
}

.au__input-icon {
  color: var(--c-text-4);
  flex-shrink: 0;
}

.au__input {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  color: var(--c-text-1);
}

.au__eye {
  color: var(--c-text-4);
  display: grid;
  place-items: center;
}

.au__req {
  color: var(--c-danger);
  font-style: normal;
}

.au__roles {
  display: flex;
  gap: 8px;
}

.au__role {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 40px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text-2);
  background: var(--c-bg-muted);
  border: 1.5px solid transparent;
  transition: all var(--dur-fast);
}

.au__role.is-on {
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border-color: var(--c-primary-500);
}

.au__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.au__chip {
  height: 28px;
  padding: 0 12px;
  border-radius: var(--r-full);
  font-size: 12px;
  color: var(--c-text-2);
  background: var(--c-bg-muted);
  border: 1px solid transparent;
  transition: all var(--dur-fast);
}

.au__chip.is-on {
  color: #fff;
  font-weight: 700;
  background: var(--c-primary-600);
}

.au__region {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid var(--c-line);
  background: var(--c-bg-card);
  font-size: 13.5px;
  color: var(--c-text-1);
}

.au__region:focus {
  outline: none;
  border-color: var(--c-primary-500);
}

.au__hint {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.au__error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--c-danger);
  background: var(--c-danger-bg);
  padding: 9px 11px;
  border-radius: var(--r-sm);
}

.au__error-link {
  color: var(--c-danger);
  font-weight: 700;
  text-decoration: underline;
  margin-left: 3px;
}

.au__btn {
  height: 46px;
  border-radius: var(--r-full);
  font-size: 14.5px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  box-shadow: 0 8px 20px rgba(var(--c-primary-rgb), 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.au__btn:disabled {
  opacity: 0.45;
  box-shadow: none;
}

.au__switch {
  text-align: center;
  font-size: 12px;
  color: var(--c-text-4);
}

.au__switch button {
  color: var(--c-primary-600);
  font-weight: 700;
  margin-left: 4px;
}

.au__demo {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
  font-size: 11px;
  color: var(--c-text-4);
}

.au__demo span {
  flex-shrink: 0;
}

.au__demo button {
  flex: 1;
  height: 28px;
  border-radius: var(--r-full);
  font-size: 11px;
  font-weight: 700;
  color: var(--c-primary-700);
  background: #fff;
  border: 1px dashed var(--c-primary-300);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.24s var(--ease-out);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-active .au,
.sheet-leave-active .au {
  transition: transform 0.3s var(--ease-out);
}
.sheet-enter-from .au,
.sheet-leave-to .au {
  transform: translateY(28px) scale(0.97);
}
</style>
