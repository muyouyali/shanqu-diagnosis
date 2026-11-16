<script setup lang="ts">
/**
 * 通用输入组件（登录/注册表单拆分）
 * - 密码类型自带「显示/隐藏」小眼睛切换，解决农户输密码易错问题
 * - 支持行内错误提示（红色小字，输入框正下方），禁止 alert
 */
import { ref, computed } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: string
    label?: string
    type?: 'text' | 'password' | 'tel' | 'email'
    placeholder?: string
    autocomplete?: string
    maxlength?: string
    error?: string
    disabled?: boolean
  }>(),
  { type: 'text' },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'blur'): void
}>()

/** 小眼睛：仅密码类型显示 */
const showPwd = ref(false)
const realType = computed(() =>
  props.type === 'password' ? (showPwd.value ? 'text' : 'password') : props.type,
)
</script>

<template>
  <label class="ai-field">
    <span v-if="label" class="ai-field__label">{{ label }}</span>
    <span class="ai-field__box" :class="{ 'is-bad': !!error }">
      <input
        :value="modelValue"
        :type="realType"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :maxlength="maxlength"
        :disabled="disabled"
        :aria-invalid="!!error"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @blur="emit('blur')"
      />
      <!-- 显示/隐藏密码小眼睛 -->
      <button
        v-if="type === 'password'"
        type="button"
        class="ai-field__eye"
        :title="showPwd ? '隐藏密码' : '显示密码'"
        :aria-label="showPwd ? '隐藏密码' : '显示密码'"
        tabindex="-1"
        @click.prevent="showPwd = !showPwd"
      >
        <!-- 线性眼睛图标（绿色国风线性风格） -->
        <svg v-if="!showPwd" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
          <circle cx="12" cy="12" r="2.8" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
          <circle cx="12" cy="12" r="2.8" />
          <line x1="4" y1="20" x2="20" y2="4" />
        </svg>
      </button>
    </span>
    <!-- 行内错误提示 -->
    <p v-if="error" class="ai-field__err" role="alert">{{ error }}</p>
  </label>
</template>

<style scoped>
.ai-field {
  display: block;
  text-align: left;
  margin-bottom: 12px;
}

.ai-field__label {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 6px;
  letter-spacing: 0.5px;
}

.ai-field__box {
  position: relative;
  display: flex;
  align-items: center;
}

.ai-field__box input {
  width: 100%;
  padding: 10px 15px;
  border-radius: 13px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.09);
  color: #fff;
  font-size: 15px;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.ai-field__box input::placeholder {
  color: rgba(255, 255, 255, 0.45);
}

.ai-field__box input:focus {
  outline: none;
  border-color: #4ade80;
  background: rgba(255, 255, 255, 0.16);
  box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.22);
}

/* 焦点时标签（含左侧图标）同步高亮，明确“正在填哪一项” */
.ai-field:focus-within .ai-field__label {
  color: #b7f0c4;
}

.ai-field__box.is-bad input {
  border-color: rgba(255, 140, 122, 0.75);
  background: rgba(180, 52, 47, 0.14);
}

.ai-field__box.is-bad input:focus {
  box-shadow: 0 0 0 3px rgba(255, 120, 105, 0.12);
}

.ai-field__box input:not(:placeholder-shown) + .ai-field__eye,
.ai-field__eye {
  position: absolute;
  right: 10px;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: #9fd8ae;
  background: transparent;
  transition: background 0.15s, transform 0.15s;
}

.ai-field__eye:hover {
  background: rgba(88, 200, 120, 0.16);
}

.ai-field__eye:active {
  transform: scale(0.9);
}

/* 有眼睛图标时给输入右侧留出空间 */
.ai-field__box input {
  padding-right: 44px;
}

.ai-field__box:not(:has(.ai-field__eye)) input {
  padding-right: 15px;
}

.ai-field__err {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  color: #ff9c8f;
  margin: 5px 2px 0;
  text-align: left;
  animation: aiErr 0.18s ease-out;
}

.ai-field__err::before {
  content: '!';
  flex-shrink: 0;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: rgba(255, 120, 105, 0.28);
  border: 1px solid rgba(255, 140, 122, 0.6);
  font-size: 11.5px;
  font-weight: 800;
  display: grid;
  place-items: center;
  line-height: 1;
}

@keyframes aiErr {
  from {
    opacity: 0;
    transform: translateY(-3px);
  }
}
</style>
