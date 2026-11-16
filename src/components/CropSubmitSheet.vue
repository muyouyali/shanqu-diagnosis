<script setup lang="ts">
/**
 * 作物共建提交弹层
 * 用户提交新作物 → 进入 pending 队列 → 后台专家审核通过后并入地区百科
 * 线上静态托管（无后端）时自动降级为本地暂存，专家端同浏览器可审核
 */
import { ref, computed, watch } from 'vue'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { useAppStore } from '@/stores/app'
import { PROVINCES } from '@/data/regions'
import { addLocalSub } from '@/data/localSubs'

const props = defineProps<{ open: boolean; presetName?: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'submitted'): void }>()

const store = useAppStore()

const EMOJIS = ['🌱', '🌿', '🍎', '🍊', '🍑', '🍇', '🥝', '🌾', '🍃', '🍄', '🌰', '🥔', '🍋', '🥭', '🌼', '🍯']

/** 州市选项：云南主攻（含区县提示），其他省保留市级 */
const provinceOptions = PROVINCES.map((p) => p.name)
const cityOptions = computed(() => {
  const p = PROVINCES.find((x) => x.name === form.value.province)
  if (!p) return []
  return p.groups.flatMap((g) => g.items)
})

const form = ref({
  name: '',
  alias: '',
  province: '云南',
  city: '',
  altitude: '',
  season: '',
  emoji: '🌱',
  desc: '',
  pests: '',
  submitter: '',
  contact: ''
})
/** 自定义图标（base64 图片，优先于 emoji） */
const customIcon = ref('')

const submitting = ref(false)
const error = ref('')
const done = ref(false)
const doneLocal = ref(false)
const iconInput = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  (v) => {
    if (v) {
      error.value = ''
      done.value = false
      doneLocal.value = false
      customIcon.value = ''
      form.value.province = '云南'
      form.value.city = ''
      if (props.presetName) form.value.name = props.presetName
    }
  }
)

const canSubmit = computed(
  () =>
    form.value.name.trim().length >= 2 &&
    !!form.value.province &&
    !!form.value.city &&
    form.value.desc.trim().length >= 8
)

/** 选择自定义图标：压缩为 96px base64 */
const pickIcon = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) return store.showToast('请选择图片文件', 'error')
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 96
      const ctx = canvas.getContext('2d')!
      const scale = Math.max(96 / img.width, 96 / img.height)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (96 - w) / 2, (96 - h) / 2, w, h)
      customIcon.value = canvas.toDataURL('image/png')
    }
    img.src = reader.result as string
  }
  reader.readAsDataURL(file)
}

const submit = async () => {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  error.value = ''
  const payload = {
    ...form.value,
    city: form.value.city,
    emoji: customIcon.value || form.value.emoji
  }
  try {
    await api.submitCrop({ ...payload })
    done.value = true
    doneLocal.value = false
    emit('submitted')
  } catch {
    // 线上静态托管无后端：降级为本地暂存，专家端（同浏览器）可继续审核
    addLocalSub({ ...payload, submitter: store.user?.nickname || form.value.submitter || '演示用户' })
    done.value = true
    doneLocal.value = true
    emit('submitted')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="open" class="cs-mask" @click.self="emit('close')">
        <div class="cs">
          <header class="cs__head">
            <div>
              <h2 class="cs__title">提交本地作物</h2>
              <p class="cs__sub">通过专家审核后，将出现在本地区作物百科中</p>
            </div>
            <button class="cs__close" @click="emit('close')"><AppIcon name="x" :size="15" /></button>
          </header>

          <div v-if="done" class="cs__done">
            <div class="cs__done-icon"><AppIcon name="check-circle" :size="34" /></div>
            <h3>提交成功，已进入审核队列</h3>
            <p>
              <template v-if="doneLocal">当前为演示环境，资料已保存在本机，<br />在专家端「作物审核」中即可完成核验。</template>
              <template v-else>农技专家会在 1–2 个工作日内完成资料核验。<br />通过后该作物会自动出现在「{{ form.province }}」的作物列表中。</template>
            </p>
            <p class="cs__done-track">审核进度可在「病害图谱速查 · 我的共建进度」中查看</p>
            <button class="cs__btn cs__btn--primary" @click="emit('close')">知道了</button>
          </div>

          <template v-else>
            <div class="cs__body">
              <label class="cs__field">
                <span class="cs__label">作物名称 <i>*</i></span>
                <input v-model="form.name" class="cs__input" placeholder="如：鲁甸青花椒" maxlength="16" />
              </label>

              <label class="cs__field">
                <span class="cs__label">别名 / 品种</span>
                <input v-model="form.alias" class="cs__input" placeholder="如：九叶青、顶坛花椒" maxlength="24" />
              </label>

              <div class="cs__row">
                <div class="cs__field">
                  <span class="cs__label">所属省份 <i>*</i></span>
                  <select v-model="form.province" class="cs__input">
                    <option v-for="p in provinceOptions" :key="p" :value="p">{{ p }}</option>
                  </select>
                </div>
                <div class="cs__field">
                  <span class="cs__label">州市 / 县区 <i>*</i></span>
                  <select v-model="form.city" class="cs__input">
                    <option value="">请选择产区</option>
                    <option v-for="c in cityOptions" :key="c" :value="c">{{ c }}</option>
                  </select>
                </div>
              </div>

              <div class="cs__row">
                <label class="cs__field">
                  <span class="cs__label">适宜海拔</span>
                  <input v-model="form.altitude" class="cs__input" placeholder="1400–1900m" maxlength="20" />
                </label>
                <label class="cs__field">
                  <span class="cs__label">采收期</span>
                  <input v-model="form.season" class="cs__input" placeholder="7–9月" maxlength="20" />
                </label>
              </div>

              <div class="cs__field">
                <span class="cs__label">图标（可选上传作物照片）</span>
                <div class="cs__emojis">
                  <button
                    v-for="e in EMOJIS"
                    :key="e"
                    class="cs__emoji"
                    :class="{ 'is-on': !customIcon && form.emoji === e }"
                    @click="customIcon = ''; form.emoji = e"
                  >
                    {{ e }}
                  </button>
                  <!-- 上传自定义图标 -->
                  <button class="cs__emoji cs__emoji--up" :class="{ 'is-on': !!customIcon }" @click="iconInput?.click()">
                    <img v-if="customIcon" :src="customIcon" alt="自定义图标" />
                    <AppIcon v-else name="plus" :size="14" />
                  </button>
                  <input ref="iconInput" type="file" accept="image/*" hidden @change="pickIcon" />
                </div>
              </div>

              <label class="cs__field">
                <span class="cs__label">作物简介 <i>*</i></span>
                <textarea
                  v-model="form.desc"
                  class="cs__textarea"
                  rows="3"
                  maxlength="120"
                  placeholder="介绍种植区域、品质特点、主要用途（至少 8 个字）"
                />
                <span class="cs__count">{{ form.desc.length }}/120</span>
              </label>

              <label class="cs__field">
                <span class="cs__label">常见病虫害（便于专家建档）</span>
                <input v-model="form.pests" class="cs__input" placeholder="如：蚜虫、锈病、流胶病" maxlength="40" />
              </label>

              <div class="cs__row">
                <label class="cs__field">
                  <span class="cs__label">提交人 / 单位</span>
                  <input v-model="form.submitter" class="cs__input" placeholder="合作社、农技站或个人" maxlength="24" />
                </label>
                <label class="cs__field">
                  <span class="cs__label">联系方式</span>
                  <input v-model="form.contact" class="cs__input" placeholder="邮箱或电话" maxlength="32" />
                </label>
              </div>

              <p v-if="error" class="cs__error"><AppIcon name="alert" :size="13" />{{ error }}</p>
            </div>

            <footer class="cs__footer">
              <button class="cs__btn cs__btn--ghost" @click="emit('close')">取消</button>
              <button class="cs__btn cs__btn--primary" :disabled="!canSubmit || submitting" @click="submit">
                <AppIcon v-if="submitting" name="loader" :size="15" class="spin" />
                {{ submitting ? '提交中…' : '提交审核' }}
              </button>
            </footer>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cs-mask {
  position: fixed;
  inset: 0;
  z-index: 130;
  background: rgba(18, 34, 24, 0.42);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.cs {
  width: min(540px, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-card);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  overflow: hidden;
}

.cs__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 18px 12px;
  border-bottom: 1px solid var(--c-line-soft);
}

.cs__title {
  font-size: 17px;
  font-weight: 800;
  color: var(--c-text-1);
}

.cs__sub {
  font-size: 11.5px;
  color: var(--c-text-4);
  margin-top: 3px;
}

.cs__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
}

.cs__body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cs__field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  position: relative;
  flex: 1;
  min-width: 0;
}

.cs__label {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-2);
}

.cs__label i {
  color: var(--c-danger);
  font-style: normal;
}

.cs__input,
.cs__textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-subtle);
  font-size: 13px;
  color: var(--c-text-1);
  transition: border-color var(--dur-fast), background var(--dur-fast);
}

.cs__input:focus,
.cs__textarea:focus {
  border-color: var(--c-primary-400);
  background: #fff;
}

.cs__textarea {
  resize: none;
  line-height: 1.6;
}

.cs__count {
  position: absolute;
  right: 10px;
  bottom: 8px;
  font-size: 11.5px;
  color: var(--c-text-4);
}

.cs__row {
  display: flex;
  gap: 10px;
}

.cs__emojis {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cs__emoji {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  font-size: 17px;
  background: var(--c-bg-muted);
  border: 1.5px solid transparent;
  transition: all var(--dur-fast);
}

.cs__emoji.is-on {
  border-color: var(--c-primary-500);
  background: var(--c-primary-50);
  transform: scale(1.06);
}

.cs__emoji--up {
  display: grid;
  place-items: center;
  color: var(--c-primary-600);
  border: 1.5px dashed var(--c-primary-300, #a9d8bd);
  background: var(--c-primary-50);
}

.cs__emoji--up img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

.cs__done-track {
  font-size: 12.5px;
  color: var(--c-primary-700);
  margin-top: -8px;
}

select.cs__input {
  appearance: none;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' fill='none' stroke-width='1.5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 30px;
}

.cs__error {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--c-danger);
  background: var(--c-danger-bg);
  padding: 9px 11px;
  border-radius: var(--r-sm);
}

.cs__footer {
  display: flex;
  gap: 10px;
  padding: 12px 18px calc(14px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--c-line-soft);
}

.cs__btn {
  flex: 1;
  height: 46px;
  border-radius: var(--r-full);
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.cs__btn--primary {
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  color: #fff;
  box-shadow: 0 8px 20px rgba(var(--c-primary-rgb), 0.26);
}

.cs__btn--primary:disabled {
  opacity: 0.45;
  box-shadow: none;
}

.cs__btn--ghost {
  background: var(--c-bg-muted);
  color: var(--c-text-2);
  flex: 0 0 96px;
}

.cs__done {
  padding: 34px 24px 28px;
  text-align: center;
}

.cs__done-icon {
  width: 66px;
  height: 66px;
  margin: 0 auto 14px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--c-primary-600);
  background: var(--c-primary-50);
}

.cs__done h3 {
  font-size: 16px;
  font-weight: 800;
  color: var(--c-text-1);
}

.cs__done p {
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--c-text-3);
  margin: 8px 0 20px;
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
.sheet-enter-active .cs,
.sheet-leave-active .cs {
  transition: transform 0.3s var(--ease-out);
}
.sheet-enter-from .cs,
.sheet-leave-to .cs {
  transform: translateY(100%);
}

@media (min-width: 960px) {
  .cs-mask {
    align-items: center;
  }
  .cs {
    border-radius: var(--r-xl);
  }
}
</style>
