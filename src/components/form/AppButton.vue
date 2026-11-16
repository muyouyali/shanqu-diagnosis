<script setup lang="ts">
/**
 * 通用按钮组件
 * - loading 状态：按钮置灰 + 旋转加载动画，防止重复提交
 * - variant：primary 绿色主按钮 / soft 浅色次要按钮 / ghost 幽灵按钮
 * - 所有按钮自带 hover / active 按压反馈
 */
withDefaults(
  defineProps<{
    loading?: boolean
    disabled?: boolean
    variant?: 'primary' | 'soft' | 'ghost'
    block?: boolean
    type?: 'button' | 'submit'
    title?: string
  }>(),
  { variant: 'primary', type: 'button' },
)

defineEmits<{ (e: 'click'): void }>()
</script>

<template>
  <button
    class="abtn"
    :class="[`abtn--${variant}`, { 'is-loading': loading, 'abtn--block': block }]"
    :type="type"
    :disabled="disabled || loading"
    :title="title"
    @click="$emit('click')"
  >
    <!-- 旋转加载动画 -->
    <span v-if="loading" class="abtn__spinner" aria-hidden="true" />
    <span class="abtn__txt" :class="{ 'is-hidden': loading }"><slot /></span>
  </button>
</template>

<style scoped>
.abtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 46px;
  padding: 0 20px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 1.5px;
  border: 1px solid transparent;
  cursor: pointer;
  position: relative;
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s, opacity 0.15s;
}

.abtn--block {
  width: 100%;
}

/* 主按钮：品牌绿 */
.abtn--primary {
  color: #fff;
  background: linear-gradient(135deg, #1f8a4c, #166532);
  border-color: rgba(255, 255, 255, 0.22);
  box-shadow: 0 10px 26px rgba(20, 90, 50, 0.5);
}

.abtn--primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 14px 32px rgba(20, 90, 50, 0.62);
  background: linear-gradient(135deg, #239957, #18723a);
}

/* 次要按钮：浅色玻璃 */
.abtn--soft {
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.abtn--soft:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

/* 幽灵按钮 */
.abtn--ghost {
  color: #9fd8ae;
  background: transparent;
  border-color: rgba(88, 200, 120, 0.4);
}

.abtn--ghost:hover:not(:disabled) {
  background: rgba(88, 200, 120, 0.12);
}

/* 按压反馈（所有变体） */
.abtn:active:not(:disabled) {
  transform: scale(0.97);
}

.abtn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* loading 时文字隐藏、spinner 居中 */
.abtn.is-loading {
  opacity: 0.75;
}

.abtn__txt.is-hidden {
  opacity: 0;
}

.abtn__spinner {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2.5px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  animation: abtnSpin 0.7s linear infinite;
}

@keyframes abtnSpin {
  to {
    transform: rotate(360deg);
  }
}
</style>
