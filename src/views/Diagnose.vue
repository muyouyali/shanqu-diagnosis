<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'

const router = useRouter()
const store = useAppStore()

const image = ref('')
const fileName = ref('')
const symptomsText = ref('')
const altitude = ref('')
const weather = ref('')
const stage = ref('')
const area = ref('')
const submitting = ref(false)
const showExtra = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const weatherOptions = ['连续降雨', '阴雨连绵', '晴转多云', '高温干旱', '晴', '霜冻']
const stageOptions = ['苗期', '生长期', '开花期', '结果期', '采收期']
const areaOptions = ['零星几株', '约 0.5 亩', '约 1-2 亩', '超过 3 亩']

/** 进度推进动效（体现"多 Agent 工作流"的过程感） */
const steps = [
  { key: 'triage', label: '初诊 Agent', desc: '识别照片症状特征', icon: 'camera' },
  { key: 'gate', label: '安全闸门', desc: '校验置信度与风险', icon: 'shield' },
  { key: 'treatment', label: '用药指导 Agent', desc: '检索安全数据生成方案', icon: 'flask' }
]
const activeStep = ref(-1)

const currentCrop = computed(() => store.selectedCrop)

const canSubmit = computed(() => Boolean(image.value || symptomsText.value.trim()))

onMounted(async () => {
  try {
    await store.loadCrops()
  } catch {
    store.showToast('无法加载作物信息，请检查服务', 'error')
  }
})

/** 图片压缩：保证上传体积可控，同时不损失诊断所需的细节 */
const compressImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1280
        let { width, height } = img
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) return reject(new Error('canvas 不可用'))
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.86))
      }
      img.onerror = () => reject(new Error('图片解析失败'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })

const handleFile = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    store.showToast('请选择图片文件', 'error')
    return
  }
  if (file.size > 12 * 1024 * 1024) {
    store.showToast('图片过大，请选择 12MB 以内的照片', 'error')
    return
  }

  try {
    image.value = await compressImage(file)
    fileName.value = file.name
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  }
  target.value = ''
}

const pickImage = () => inputRef.value?.click()

const clearImage = () => {
  image.value = ''
  fileName.value = ''
}

const resetForm = () => {
  clearImage()
  symptomsText.value = ''
  altitude.value = ''
  weather.value = ''
  stage.value = ''
  area.value = ''
  activeStep.value = -1
}

const submit = async () => {
  if (!canSubmit.value || submitting.value) return
  if (!currentCrop.value) {
    store.showToast('请先选择作物', 'error')
    return
  }

  submitting.value = true
  activeStep.value = 0

  // 模拟阶段推进（真实耗时由后端返回，此处仅做视觉反馈）
  const stepTimer = setInterval(() => {
    if (activeStep.value < steps.length - 1) activeStep.value++
  }, 1400)

  try {
    const result = await api.diagnose({
      cropId: currentCrop.value.id,
      image: image.value || undefined,
      symptomsText: symptomsText.value || undefined,
      altitude: altitude.value || undefined,
      weather: weather.value || undefined,
      stage: stage.value || undefined,
      area: area.value || undefined,
      region: store.region,
      userId: store.userId
    })

    store.setLastResult(result, image.value)
    clearInterval(stepTimer)
    activeStep.value = steps.length
    store.showToast('诊断完成', 'success')
    setTimeout(() => router.replace(`/result/${result.recordId}`), 320)
  } catch (err) {
    clearInterval(stepTimer)
    activeStep.value = -1
    submitting.value = false
    store.showToast((err as Error).message, 'error')
  }
}
</script>

<template>
  <div class="diagnose">
    <!-- 顶栏 -->
    <header class="page-head">
      <button class="page-head__back" @click="router.back()">
        <AppIcon name="arrow-left" :size="20" />
      </button>
      <h1 class="page-head__title">智能诊断</h1>
      <button class="page-head__reset" @click="resetForm" :disabled="submitting">
        <AppIcon name="refresh" :size="17" />
      </button>
    </header>

    <div class="scroll-area">
      <!-- 作物选择 -->
      <section class="block">
        <label class="block__label">1 · 选择作物</label>
        <div class="crop-chips">
          <button
            v-for="c in store.crops.filter((c) => c.diagnosable !== false)"
            :key="c.id"
            class="crop-chip"
            :class="{ 'is-active': store.selectedCropId === c.id }"
            :style="{ '--crop-color': c.color }"
            @click="store.setCrop(c.id)"
          >
            <span class="crop-chip__emoji">{{ c.emoji }}</span>
            <span>{{ c.name }}</span>
            <AppIcon v-if="store.selectedCropId === c.id" name="check" :size="14" class="crop-chip__check" />
          </button>
        </div>
      </section>

      <!-- 拍照上传 -->
      <section class="block">
        <label class="block__label">
          2 · 上传病株照片
          <span class="block__hint">清晰、对焦、占据画面主体</span>
        </label>

        <input
          ref="inputRef"
          type="file"
          accept="image/*"
          capture="environment"
          class="hidden-input"
          @change="handleFile"
        />

        <div v-if="!image" class="uploader" @click="pickImage">
          <div class="uploader__icon">
            <AppIcon name="camera" :size="30" :stroke="1.6" />
          </div>
          <p class="uploader__title">点击拍照或从相册选择</p>
          <p class="uploader__sub">支持叶片、果实、根茎部照片</p>
          <div class="uploader__tips">
            <span><AppIcon name="check" :size="11" /> 顺光拍摄</span>
            <span><AppIcon name="check" :size="11" /> 病部居中</span>
            <span><AppIcon name="check" :size="11" /> 避免模糊</span>
          </div>
        </div>

        <div v-else class="preview">
          <img :src="image" alt="待诊断照片" class="preview__img" />
          <div class="preview__overlay">
            <span class="preview__name">{{ fileName || '已选择照片' }}</span>
          </div>
          <div class="preview__actions">
            <button class="preview__btn" @click="pickImage">
              <AppIcon name="refresh" :size="14" /> 重选
            </button>
            <button class="preview__btn preview__btn--danger" @click="clearImage">
              <AppIcon name="x" :size="14" /> 删除
            </button>
          </div>
        </div>
      </section>

      <!-- 症状描述 -->
      <section class="block">
        <label class="block__label">
          3 · 描述症状
          <span class="block__hint">选填，可显著提升准确率</span>
        </label>
        <textarea
          v-model="symptomsText"
          class="textarea"
          rows="3"
          maxlength="200"
          placeholder="例如：叶子背面有灰白色霉层，下部老叶先发黄，这几天连着下雨后突然严重了……"
        ></textarea>
        <div class="textarea__foot">
          <span class="textarea__count">{{ symptomsText.length }}/200</span>
        </div>
      </section>

      <!-- 环境信息 -->
      <section class="block">
        <button class="collapse-head" @click="showExtra = !showExtra">
          <span class="block__label" style="margin: 0">
            4 · 种植环境
            <span class="block__hint">选填，帮助 AI 缩小判断范围</span>
          </span>
          <AppIcon name="arrow-right" :size="16" class="collapse-head__arrow" :class="{ 'is-open': showExtra }" />
        </button>

        <div v-show="showExtra" class="extra">
          <div class="field">
            <label class="field__label">种植海拔</label>
            <div class="input-wrap">
              <input v-model="altitude" class="input" placeholder="例如 1800m" maxlength="12" />
            </div>
          </div>

          <div class="field">
            <label class="field__label">近期天气</label>
            <div class="chip-row">
              <button
                v-for="w in weatherOptions"
                :key="w"
                class="mini-chip"
                :class="{ 'is-active': weather === w }"
                @click="weather = weather === w ? '' : w"
              >
                {{ w }}
              </button>
            </div>
          </div>

          <div class="field">
            <label class="field__label">生长阶段</label>
            <div class="chip-row">
              <button
                v-for="s in stageOptions"
                :key="s"
                class="mini-chip"
                :class="{ 'is-active': stage === s }"
                @click="stage = stage === s ? '' : s"
              >
                {{ s }}
              </button>
            </div>
          </div>

          <div class="field">
            <label class="field__label">发病面积</label>
            <div class="chip-row">
              <button
                v-for="a in areaOptions"
                :key="a"
                class="mini-chip"
                :class="{ 'is-active': area === a }"
                @click="area = area === a ? '' : a"
              >
                {{ a }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div class="notice">
        <AppIcon name="alert" :size="14" />
        <span>照片越清晰、描述越具体，诊断越准确。AI 结果仅供参考，严重情况请联系当地农技站。</span>
      </div>
    </div>

    <!-- 提交栏 -->
    <div class="submit-bar">
      <button
        class="btn btn--primary btn--block btn--lg"
        :disabled="!canSubmit || submitting"
        @click="submit"
      >
        <AppIcon v-if="!submitting" name="sparkle" :size="18" />
        {{ submitting ? '正在诊断…' : canSubmit ? '开始 AI 诊断' : '请上传照片或描述症状' }}
      </button>
    </div>

    <!-- 诊断中遮罩 -->
    <transition name="fade">
      <div v-if="submitting" class="progress-mask">
        <div class="progress-card">
          <div class="progress-card__pulse">
            <AppIcon name="leaf" :size="26" :stroke="1.8" />
          </div>
          <h3 class="progress-card__title">多 Agent 正在协同诊断</h3>
          <p class="progress-card__sub">{{ currentCrop?.name }} · 请稍候</p>

          <div class="steps">
            <div
              v-for="(s, i) in steps"
              :key="s.key"
              class="step"
              :class="{
                'is-done': activeStep > i,
                'is-active': activeStep === i
              }"
            >
              <div class="step__marker">
                <AppIcon v-if="activeStep > i" name="check" :size="13" :stroke="2.6" />
                <AppIcon v-else :name="s.icon" :size="13" />
              </div>
              <div class="step__body">
                <strong>{{ s.label }}</strong>
                <small>{{ s.desc }}</small>
              </div>
              <span v-if="activeStep === i" class="step__spinner"></span>
            </div>
          </div>

          <p class="progress-card__hint">首次使用可能需要 10–30 秒</p>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.diagnose {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-page);
}

/* 顶栏 */
.page-head {
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--c-line-soft);
  position: sticky;
  top: 0;
  z-index: 30;
}

.page-head__back,
.page-head__reset {
  width: 38px;
  height: 38px;
  border-radius: var(--r-sm);
  display: grid;
  place-items: center;
  color: var(--c-text-2);
  transition: background var(--dur-fast);
}

.page-head__back:active,
.page-head__reset:active {
  background: var(--c-line-soft);
}

.page-head__reset:disabled {
  opacity: 0.35;
}

.page-head__title {
  font-size: 16.5px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.scroll-area {
  flex: 1;
  padding: 16px 16px 20px;
}

/* 区块 */
.block {
  margin-bottom: 20px;
}

.block__label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 700;
  color: var(--c-text-2);
  margin-bottom: 10px;
  letter-spacing: 0.1px;
}

.block__hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--c-text-4);
}

/* 作物 chip */
.crop-chips {
  display: flex;
  gap: 8px;
}

.crop-chip {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 11px 6px 10px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1.5px solid var(--c-line);
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-3);
  position: relative;
  transition: all var(--dur-fast) var(--ease-out);
}

.crop-chip__emoji {
  font-size: 21px;
  line-height: 1;
}

.crop-chip.is-active {
  border-color: var(--crop-color);
  background: color-mix(in srgb, var(--crop-color) 7%, white);
  color: var(--crop-color);
}

.crop-chip__check {
  position: absolute;
  top: 5px;
  right: 5px;
  color: var(--crop-color);
}

/* 上传区 */
.hidden-input {
  display: none;
}

.uploader {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px 20px 24px;
  border-radius: var(--r-lg);
  border: 1.5px dashed var(--c-primary-300);
  background: linear-gradient(180deg, var(--c-primary-50), rgba(255, 255, 255, 0.6));
  transition: all var(--dur-base) var(--ease-out);
  cursor: pointer;
}

.uploader:active {
  transform: scale(0.985);
  background: var(--c-primary-100);
}

.uploader__icon {
  width: 62px;
  height: 62px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--c-bg-card);
  color: var(--c-primary-500);
  box-shadow: 0 6px 20px rgba(47, 152, 104, 0.14);
  margin-bottom: 12px;
}

.uploader__title {
  font-size: 14.5px;
  font-weight: 700;
  color: var(--c-primary-800);
  margin-bottom: 4px;
}

.uploader__sub {
  font-size: 11.5px;
  color: var(--c-text-3);
  margin-bottom: 14px;
}

.uploader__tips {
  display: flex;
  gap: 12px;
}

.uploader__tips span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  color: var(--c-primary-600);
  font-weight: 500;
}

/* 预览 */
.preview {
  position: relative;
  border-radius: var(--r-lg);
  overflow: hidden;
  box-shadow: var(--sh-md);
  background: #000;
}

.preview__img {
  width: 100%;
  max-height: 320px;
  object-fit: cover;
  display: block;
}

.preview__overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 24px 14px 10px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.62));
}

.preview__name {
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.92);
}

.preview__actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  gap: 6px;
}

.preview__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 11px;
  border-radius: var(--r-full);
  background: rgba(0, 0, 0, 0.52);
  backdrop-filter: blur(8px);
  color: #fff;
  font-size: 11.5px;
  font-weight: 500;
}

.preview__btn--danger {
  background: rgba(200, 50, 50, 0.72);
}

/* 文本域 */
.textarea {
  width: 100%;
  padding: 13px 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1.5px solid var(--c-line);
  font-size: 14px;
  line-height: 1.7;
  resize: none;
  transition: border-color var(--dur-fast);
}

.textarea:focus {
  border-color: var(--c-primary-400);
}

.textarea__foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 5px;
}

.textarea__count {
  font-size: 11px;
  color: var(--c-text-4);
  font-variant-numeric: tabular-nums;
}

/* 折叠头 */
.collapse-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0;
  margin-bottom: 10px;
}

.collapse-head__arrow {
  color: var(--c-text-4);
  transition: transform var(--dur-base) var(--ease-out);
}

.collapse-head__arrow.is-open {
  transform: rotate(90deg);
}

.extra {
  padding: 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.field {
  margin-bottom: 14px;
}

.field:last-child {
  margin-bottom: 0;
}

.field__label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-3);
  margin-bottom: 7px;
}

.input {
  width: 100%;
  height: 42px;
  padding: 0 13px;
  border-radius: var(--r-sm);
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-muted);
  font-size: 14px;
  transition: border-color var(--dur-fast);
}

.input:focus {
  border-color: var(--c-primary-400);
  background: #fff;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.mini-chip {
  padding: 6px 13px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1.5px solid var(--c-line);
  font-size: 12.5px;
  color: var(--c-text-2);
  transition: all var(--dur-fast) var(--ease-out);
}

.mini-chip.is-active {
  background: var(--c-primary-50);
  border-color: var(--c-primary-400);
  color: var(--c-primary-700);
  font-weight: 600;
}

/* 提示 */
.notice {
  display: flex;
  gap: 8px;
  padding: 11px 13px;
  border-radius: var(--r-sm);
  background: var(--c-accent-100);
  color: var(--c-accent-600);
  font-size: 11.5px;
  line-height: 1.65;
}

.notice :deep(.icon) {
  flex-shrink: 0;
  margin-top: 1px;
}

/* 提交栏 */
.submit-bar {
  position: sticky;
  bottom: 0;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(transparent, var(--c-bg-page) 22%);
  margin-top: -12px;
}

/* 进度遮罩 */
.progress-mask {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(12, 22, 18, 0.5);
  backdrop-filter: blur(6px);
}

.progress-card {
  width: 100%;
  max-width: 340px;
  padding: 28px 22px 22px;
  border-radius: var(--r-xl);
  background: var(--c-bg-card);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
  text-align: center;
}

.progress-card__pulse {
  width: 68px;
  height: 68px;
  margin: 0 auto 16px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(140deg, var(--c-primary-400), var(--c-primary-700));
  box-shadow: 0 0 0 0 rgba(47, 152, 104, 0.5);
  animation: pulse 1.8s infinite;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(47, 152, 104, 0.45);
  }
  70% {
    box-shadow: 0 0 0 18px rgba(47, 152, 104, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(47, 152, 104, 0);
  }
}

.progress-card__title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 4px;
}

.progress-card__sub {
  font-size: 12px;
  color: var(--c-text-4);
  margin-bottom: 22px;
}

.steps {
  display: flex;
  flex-direction: column;
  gap: 9px;
  text-align: left;
}

.step {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
  opacity: 0.45;
  transition: all var(--dur-base) var(--ease-out);
}

.step.is-active {
  opacity: 1;
  background: var(--c-primary-50);
}

.step.is-done {
  opacity: 1;
  background: transparent;
}

.step__marker {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: var(--c-line);
  color: var(--c-text-3);
}

.step.is-active .step__marker {
  background: var(--c-primary-500);
  color: #fff;
}

.step.is-done .step__marker {
  background: var(--c-success-bg);
  color: var(--c-success);
}

.step__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.step__body strong {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--c-text-1);
}

.step__body small {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.step__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--c-primary-200);
  border-top-color: var(--c-primary-500);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.progress-card__hint {
  margin-top: 16px;
  font-size: 10.5px;
  color: var(--c-text-4);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--dur-base) var(--ease-out);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

<style scoped>
@media (min-width: 960px) {
  .scroll-area {
    max-width: var(--max-w-mobile);
    margin: 0 auto;
    width: 100%;
    padding-top: 26px;
  }
  .submit-bar {
    max-width: var(--max-w-mobile);
    margin: 0 auto;
    width: 100%;
  }
}
</style>
