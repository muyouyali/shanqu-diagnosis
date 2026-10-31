<script setup lang="ts">
/**
 * QuickLookup · 图文速查弹层
 * 拍照上传 + 症状自由描述放在同一页：
 *  - 有照片：AI 视觉模型自由识别作物与病害（不限于当前选中作物）
 *  - 有文字：按症状关键词实时匹配知识库病害，可与照片互相补充
 */
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'
import { useAppStore } from '@/stores/app'
import type { Disease } from '@/types'

const props = defineProps<{ open: boolean; diseases: Disease[] }>()
const emit = defineEmits<{ close: [] }>()

const router = useRouter()
const store = useAppStore()

/* ===== 照片上传 ===== */
const imgPreview = ref('')
const imgBase64 = ref('')
const busy = ref(false)
const aiResults = ref<{ name: string; confidence: number; urgency?: string }[]>([])
const aiRecordId = ref('')
const aiErr = ref('')

const fileRef = ref<HTMLInputElement | null>(null)
const pickImage = () => fileRef.value?.click()

const onFile = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (!/^image\//.test(file.type)) return store.showToast('请选择图片文件', 'error')
  if (file.size > 8 * 1024 * 1024) {
    store.showToast('图片不能超过 8MB', 'error')
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = String(reader.result)
    imgPreview.value = dataUrl
    imgBase64.value = dataUrl
    aiResults.value = []
    aiErr.value = ''
  }
  reader.readAsDataURL(file)
}

const resetPhoto = () => {
  imgPreview.value = ''
  imgBase64.value = ''
  aiResults.value = []
  aiErr.value = ''
  if (fileRef.value) fileRef.value.value = ''
}

/* ===== 症状自由描述 ===== */
const symptomText = ref('')

/** 当前作物高频症状关键词，点击可直接追加到描述 */
const symptomChips = computed(() => {
  const freq = new Map<string, number>()
  for (const d of props.diseases) {
    for (const k of d.symptomKeywords) freq.set(k, (freq.get(k) || 0) + 1)
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k]) => k)
})

const appendChip = (k: string) => {
  if (symptomText.value.includes(k)) return
  symptomText.value = (symptomText.value.trim() + (symptomText.value.trim() ? '，' : '') + k).slice(0, 200)
}

/** 全库症状匹配（跨作物）：AI 知识库检索，含作物名 */
const crossMatches = ref<Array<{ id: string; name: string; cropName: string; symptoms: string[] }>>([])
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(symptomText, (v) => {
  if (searchTimer) clearTimeout(searchTimer)
  const text = v.trim()
  if (text.length < 2) {
    crossMatches.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    try {
      const res = await api.kbSearch(text)
      crossMatches.value = (res.hits || []).slice(0, 4).map((h) => ({
        id: String(h.id),
        name: h.name,
        cropName: h.cropName || '',
        symptoms: h.symptoms || []
      }))
    } catch {
      crossMatches.value = []
    }
  }, 350)
})

/** 文字症状实时匹配当前作物候选病害 */
const textMatches = computed(() => {
  const text = symptomText.value.trim()
  if (text.length < 2) return []
  const terms = text
    .split(/[，,。；;、\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 1)
  const pool = terms.length ? terms : [text]
  return props.diseases
    .map((d) => {
      const haystack = [d.name, d.alias || '', ...d.symptomKeywords, ...d.symptoms].join(' ')
      const hits = pool.filter((t) => haystack.includes(t))
      return { d, score: hits.length, hits }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
})

const matchDisease = (name: string) =>
  props.diseases.find((d) => name.includes(d.name) || d.name.includes(name) || (d.alias && name.includes(d.alias.split('、')[0])))

/* ===== AI 识别（照片 + 文字一起提交） ===== */
/** 至少有照片或已输入症状才能识别 */
const canRun = computed(() => (!!imgBase64.value || symptomText.value.trim().length >= 2) && !busy.value)

const runAI = async () => {
  if (!canRun.value) return
  busy.value = true
  aiErr.value = ''
  aiResults.value = []
  try {
    // cropId 传 'auto'：AI 先判断照片中的作物种类（不限当前选中作物），再给出病害结论
    const res = await api.diagnose({
      cropId: 'auto',
      image: imgBase64.value,
      symptomsText: symptomText.value.trim() || undefined,
      region: store.user?.region ? String(store.user.region) : (store.region || '云南'),
      userId: store.user ? String(store.user.id) : undefined
    })
    aiRecordId.value = res.recordId ? String(res.recordId) : ''
    aiResults.value = (res.diagnosis?.results || []).slice(0, 3)
    if (!aiResults.value.length) aiErr.value = '未能识别出疑似病害，请尝试更清晰的照片或补充症状描述'
  } catch (e: any) {
    aiErr.value = e?.message || '识别失败，请重试'
  } finally {
    busy.value = false
  }
}

/** 跳转跨库病害详情（详情页支持全库病害 id） */
const goCrossDetail = (m: { id: string }) => {
  emit('close')
  router.push(`/knowledge/${m.id}`)
}

const goDetail = (name: string) => {
  const d = matchDisease(name)
  if (d) {
    emit('close')
    router.push(`/knowledge/${d.id}`)
  } else store.showToast('图谱中暂无该病害详情', 'info')
}

const goResult = () => {
  if (!aiRecordId.value) return
  emit('close')
  router.push(`/result/${aiRecordId.value}`)
}

watch(
  () => props.open,
  (v) => {
    if (v) {
      symptomText.value = ''
      resetPhoto()
    }
  }
)

const severityLabel: Record<string, string> = { critical: '毁灭性', high: '高发', medium: '中等', low: '轻微' }
</script>

<template>
  <Teleport to="body">
    <Transition name="ql-fade">
      <div v-if="open" class="ql-mask" @click.self="emit('close')">
        <div class="ql">
          <header class="ql__head">
            <b><AppIcon name="book" :size="16" /> 图文速查</b>
            <button class="ql__close" @click="emit('close')">✕</button>
          </header>

          <div class="ql__body">
            <!-- ① 拍照上传 -->
            <p class="ql__tip">上传病部照片，AI 视觉模型会自由识别作物种类与病害（不限当前选中作物）；再补充症状描述，结果更准</p>

            <input ref="fileRef" type="file" accept="image/*" capture="environment" hidden @change="onFile" />

            <div v-if="!imgPreview" class="ql__upload" @click="pickImage">
              <AppIcon name="camera" :size="30" />
              <b>点击拍照 / 选择照片</b>
              <small>支持 JPG / PNG，8MB 以内</small>
            </div>

            <div v-else class="ql__preview">
              <img :src="imgPreview" alt="病部照片" />
              <div class="ql__preview-actions">
                <button class="ql__mini" @click="pickImage">换一张</button>
              </div>
            </div>

            <p v-if="aiErr" class="ql__err">⚠️ {{ aiErr }}</p>

            <!-- ② 症状自由描述 -->
            <div class="ql__sym">
              <label class="ql__sym-label">补充症状描述（选填，自由输入）</label>
              <textarea
                v-model="symptomText"
                class="ql__sym-input"
                rows="2"
                maxlength="200"
                placeholder="用大白话描述看到的现象，如：叶片发黄、根部长褐色斑点、下雨后烂果…"
              />
              <div class="ql__chips">
                <button v-for="k in symptomChips" :key="k" class="ql__chip" @click="appendChip(k)">
                  + {{ k }}
                </button>
              </div>
            </div>

            <!-- ③ 确认症状后再识别 -->
            <button class="ql__go" :disabled="!canRun" @click="runAI">
              {{ busy ? '⏳ AI 识别中…' : '🔍 开始识别' }}
            </button>
            <p v-if="!canRun && !busy" class="ql__go-hint">请先上传照片或输入至少 2 个字的症状描述</p>

            <!-- AI 识别结果 -->
            <div v-if="aiResults.length" class="ql__results">
              <p class="ql__results-title">AI 识别结果（按置信度排序）</p>
              <div v-for="(r, i) in aiResults" :key="i" class="ql__result">
                <div class="ql__result-main">
                  <b>{{ r.name }}</b>
                  <span class="ql__conf">
                    置信度 {{ Math.round(r.confidence * 100) }}%
                    <i class="ql__conf-bar"><i :style="{ width: Math.round(r.confidence * 100) + '%' }" /></i>
                  </span>
                </div>
                <button class="ql__link" @click="goDetail(r.name)">图谱详情 ›</button>
              </div>
              <button class="ql__full" @click="goResult">查看完整诊断报告（用药方案 / 防治建议）→</button>
            </div>

            <!-- 文字实时匹配 -->
            <div v-if="crossMatches.length" class="ql__matches">
              <p class="ql__results-title">全库症状匹配（不限当前作物）</p>
              <div
                v-for="m in crossMatches"
                :key="m.id"
                class="ql__result"
                @click="goCrossDetail(m)"
              >
                <div class="ql__result-main">
                  <b>{{ m.name }}</b>
                  <span class="ql__crop-tag">{{ m.cropName || '知识库' }}</span>
                </div>
                <small class="ql__result-sub">{{ m.symptoms.slice(0, 2).join('；') }}</small>
              </div>
            </div>

            <div v-if="textMatches.length" class="ql__matches">
              <p class="ql__results-title">{{ store.crops.find((c) => c.id === store.selectedCropId)?.name || '当前作物' }}内匹配到 {{ textMatches.length }} 种病害</p>
              <div
                v-for="m in textMatches"
                :key="m.d.id"
                class="ql__match"
                @click="emit('close'); router.push(`/knowledge/${m.d.id}`)"
              >
                <div class="ql__match-main">
                  <b>{{ m.d.name }}</b>
                  <span class="ql__match-hits">命中 {{ m.hits.join(' / ') }}</span>
                </div>
                <span class="ql__match-sev" :data-sev="m.d.severity">{{ severityLabel[m.d.severity] }}</span>
                <i class="ql__match-arrow">›</i>
              </div>
            </div>
            <div v-else-if="symptomText.trim().length >= 2 && !aiResults.length" class="ql__nomatch">
              当前描述暂未匹配到病害，试试更具体的词，或上传照片让 AI 识别
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ql-mask {
  position: fixed;
  inset: 0;
  z-index: 380;
  background: rgba(10, 30, 18, 0.55);
  backdrop-filter: blur(5px);
  display: grid;
  place-items: center;
  padding: 18px;
  overscroll-behavior: contain;
}

.ql {
  width: min(560px, 100%);
  max-height: 88vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 24px 60px rgba(10, 40, 22, 0.3);
}

.ql__head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 18px;
  background: linear-gradient(118deg, #0f3d22, #17643a 70%, #2f9e5f);
  color: #fff;
  font-size: 15px;
  border-radius: 20px 20px 0 0;
}

.ql__head b {
  display: flex;
  align-items: center;
  gap: 7px;
}

.ql__close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 13px;
}

.ql__body {
  padding: 14px 18px 20px;
}

.ql__tip {
  font-size: 12px;
  line-height: 1.7;
  color: var(--c-text-3);
  margin-bottom: 13px;
}

/* 上传区 */
.ql__upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 30px 16px;
  border: 2px dashed var(--c-primary-200);
  border-radius: 16px;
  background: var(--c-primary-50);
  color: var(--c-primary-700);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.ql__upload:hover {
  border-color: var(--c-primary-400);
  background: var(--c-primary-100);
}

.ql__upload b {
  font-size: 13.5px;
}

.ql__upload small {
  font-size: 10.5px;
  color: var(--c-text-4);
}

/* 预览 */
.ql__preview img {
  width: 100%;
  max-height: 240px;
  object-fit: contain;
  border-radius: 14px;
  background: var(--c-bg-page);
}

.ql__preview-actions {
  display: flex;
  gap: 9px;
  margin-top: 11px;
}

.ql__mini {
  flex: 1;
  padding: 10px;
  border-radius: 11px;
  border: 1.5px solid var(--c-line);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-text-2);
}

.ql__mini--go {
  background: linear-gradient(135deg, #1f8a4c, #166532);
  border-color: transparent;
  color: #fff;
}

.ql__mini--go:disabled {
  opacity: 0.6;
}

.ql__err {
  font-size: 12px;
  color: #b91c1c;
  background: #fee2e2;
  border-radius: 10px;
  padding: 9px 12px;
  margin-top: 11px;
}

/* 症状描述 */
.ql__sym {
  margin-top: 14px;
  padding-top: 13px;
  border-top: 1px dashed var(--c-line);
}

.ql__sym-label {
  display: block;
  font-size: 12px;
  font-weight: 800;
  color: var(--c-text-2);
  margin-bottom: 7px;
}

.ql__sym-input {
  width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-page);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--c-text-1);
  resize: none;
  transition: border-color 0.15s, background 0.15s;
}

.ql__sym-input:focus {
  border-color: var(--c-primary-400);
  background: #fff;
  outline: none;
}

.ql__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 9px;
}

.ql__chip {
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px dashed var(--c-primary-200);
  background: var(--c-primary-50);
  font-size: 11.5px;
  color: var(--c-primary-700);
  transition: all 0.13s;
}

.ql__chip:hover {
  background: var(--c-primary-100);
}

/* AI 结果 */
.ql__results {
  margin-top: 14px;
  padding-top: 13px;
  border-top: 1px dashed var(--c-line);
}

.ql__results-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--c-text-2);
  margin-bottom: 9px;
}

.ql__result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--c-bg-page);
  border: 1px solid var(--c-line-soft);
  margin-bottom: 7px;
}

.ql__result-main b {
  font-size: 13.5px;
  display: block;
  margin-bottom: 4px;
}

.ql__conf {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  color: var(--c-text-3);
}

.ql__conf-bar {
  width: 80px;
  height: 5px;
  border-radius: 99px;
  background: var(--c-line-soft);
  overflow: hidden;
  font-style: normal;
}

.ql__conf-bar i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: linear-gradient(90deg, #2f9e5f, #58c878);
  font-style: normal;
}

.ql__link {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--c-primary-700);
  padding: 6px 11px;
  border-radius: 999px;
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
}

.ql__full {
  width: 100%;
  margin-top: 5px;
  padding: 11px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 800;
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border: 1.5px solid var(--c-primary-200);
}

/* 文字匹配 */
.ql__matches {
  margin-top: 14px;
  padding-top: 13px;
  border-top: 1px dashed var(--c-line);
}

.ql__match {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  text-align: left;
  padding: 11px 12px;
  border-radius: 12px;
  border: 1px solid var(--c-line-soft);
  background: var(--c-bg-card);
  margin-bottom: 7px;
  transition: border-color 0.13s;
  cursor: pointer;
}

.ql__match:hover {
  border-color: var(--c-primary-300);
}

.ql__match-main {
  flex: 1;
  min-width: 0;
}

.ql__match-main b {
  font-size: 13.5px;
  display: block;
}

.ql__match-hits {
  font-size: 10.5px;
  color: var(--c-primary-700);
}

.ql__match-sev {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
}

.ql__match-sev[data-sev='critical'],
.ql__match-sev[data-sev='high'] {
  color: #c2410c;
  background: #ffedd5;
}

.ql__match-sev[data-sev='medium'] {
  color: #a16207;
  background: #fef9c3;
}

.ql__match-sev[data-sev='low'] {
  color: #15803d;
  background: #dcfce7;
}

.ql__match-arrow {
  font-style: normal;
  color: var(--c-text-4);
}

.ql__nomatch {
  padding: 18px;
  text-align: center;
  font-size: 12px;
  color: var(--c-text-4);
}

.ql-fade-enter-active,
.ql-fade-leave-active {
  transition: opacity 0.2s;
}

.ql-fade-enter-from,
.ql-fade-leave-to {
  opacity: 0;
}

/* 识别主按钮（症状输入之后） */
.ql__go {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 44px;
  margin-top: 12px;
  border-radius: var(--r-full);
  font-size: 14px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  box-shadow: 0 6px 16px rgba(var(--c-primary-rgb), 0.3);
  transition: all var(--dur-fast);
}

.ql__go:disabled {
  opacity: 0.45;
  box-shadow: none;
  cursor: not-allowed;
}

.ql__go-hint {
  margin-top: 6px;
  font-size: 10.5px;
  color: var(--c-text-4);
  text-align: center;
}

/* 跨库匹配的作物名标签 */
.ql__crop-tag {
  flex-shrink: 0;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
  padding: 1px 7px;
  border-radius: var(--r-full);
}

.ql__result-sub {
  display: block;
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--c-text-4);
  line-height: 1.5;
}
</style>
