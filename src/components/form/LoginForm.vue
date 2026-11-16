<script setup lang="ts">
/**
 * 登录表单组件（从登录页拆分）
 * - 失焦即触发校验，输入框下方行内红色小字报错（不使用 alert）
 * - 校验规则：账号非空 + 手机号格式合法性（11 位手机号时校验）、密码非空
 * - 「记住登录」居左、「忘记密码？」居右，垂直居中对齐
 * - 提交按钮：busy 时置灰 + loading 动画，防重复提交
 */
import { ref, computed } from 'vue'
import AppInput from './AppInput.vue'
import AppButton from './AppButton.vue'

const props = defineProps<{
  busy?: boolean
  serverError?: string
}>()

const emit = defineEmits<{
  (e: 'submit', payload: { account: string; password: string; remember: boolean }): void
  (e: 'forgot'): void
}>()

const account = ref('')
const password = ref('')
const remember = ref(true)

/** 行内校验错误 */
const errAccount = ref('')
const errPassword = ref('')

/** 手机号格式（11 位、1 开头第二位 3-9） */
const PHONE_RE = /^1[3-9]\d{9}$/

const validateAccount = () => {
  const v = account.value.trim()
  if (!v) {
    errAccount.value = '请输入账号'
  } else if (/^\d{11}$/.test(v) && !PHONE_RE.test(v)) {
    errAccount.value = '手机号格式不正确（应为 1 开头的 11 位数字）'
  } else {
    errAccount.value = ''
  }
  return !errAccount.value
}

const validatePassword = () => {
  if (!password.value) {
    errPassword.value = '请输入密码'
  } else {
    errPassword.value = ''
  }
  return !errPassword.value
}

/** 输入时清除对应错误，避免红字滞留 */
const onAccountInput = (v: string) => {
  account.value = v
  if (errAccount.value) errAccount.value = ''
}
const onPasswordInput = (v: string) => {
  password.value = v
  if (errPassword.value) errPassword.value = ''
}

const canSubmit = computed(
  () => !props.busy && !!account.value.trim() && !!password.value,
)

const onSubmit = () => {
  const okA = validateAccount()
  const okP = validatePassword()
  if (!okA || !okP) return
  emit('submit', {
    account: account.value.trim(),
    password: password.value,
    remember: remember.value,
  })
}
</script>

<template>
  <form class="lform" novalidate @submit.prevent="onSubmit">
    <AppInput
      :model-value="account"
      label="👤 账号"
      placeholder="请输入账号"
      autocomplete="username"
      :error="errAccount"
      @update:model-value="onAccountInput"
      @blur="validateAccount"
    />
    <AppInput
      :model-value="password"
      type="password"
      label="🔒 密码"
      placeholder="密码"
      autocomplete="current-password"
      :error="errPassword"
      @update:model-value="onPasswordInput"
      @blur="validatePassword"
      @keyup.enter="onSubmit"
    />

    <!-- 记住登录（左） / 忘记密码（右），垂直居中 -->
    <div class="lform__row">
      <label class="lform__check">
        <input v-model="remember" type="checkbox" />
        <span>记住登录</span>
      </label>
      <button type="button" class="lform__forgot" @click="$emit('forgot')">忘记密码？</button>
    </div>

    <!-- 服务端错误：同样以行内红字呈现 -->
    <p v-if="serverError" class="lform__server-err" role="alert">⚠️ {{ serverError }}</p>

    <AppButton
      block
      variant="primary"
      :loading="busy"
      :disabled="!canSubmit"
      @click="onSubmit"
    >
      {{ busy ? '登录中…' : '🌿 登 录' }}
    </AppButton>
  </form>
</template>

<style scoped>
.lform__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 0 12px;
  font-size: 12.5px;
}

.lform__check {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.82);
  cursor: pointer;
  user-select: none;
}

.lform__check input {
  width: 15px;
  height: 15px;
  margin: 0;
  accent-color: #2f9e5f;
  cursor: pointer;
  vertical-align: middle;
}

.lform__check span {
  line-height: 1;
}

.lform__forgot {
  color: rgba(255, 255, 255, 0.72);
  text-decoration: underline dashed;
  text-underline-offset: 3px;
  cursor: pointer;
  transition: color 0.15s;
}

.lform__forgot:hover {
  color: #9fd8ae;
}

.lform__forgot:active {
  opacity: 0.7;
}

.lform__server-err {
  font-size: 12px;
  color: #ffb3ab;
  background: rgba(180, 52, 47, 0.22);
  border: 1px solid rgba(255, 130, 120, 0.35);
  border-radius: 10px;
  padding: 8px 11px;
  margin-bottom: 12px;
  text-align: left;
}
</style>
