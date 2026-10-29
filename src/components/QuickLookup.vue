<script setup lang="ts">
/**
 * QuickLookup · 图文速查弹层
 * 两种速查方式：
 *  1. 拍照速查：上传/拍摄病部照片 → AI 视觉识别 → 疑似病害列表（可跳图谱详情或诊断结果）
 *  2. 症状速查：勾选症状关键词 → 实时筛选当前作物病害
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

const tab = ref<'photo' | 'symptom'>('photo')

/* ===== 拍照速查 ===== */
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

const matchDisease = (name: string) =>
  props.diseases.find((d) => name.includes(d.name) || d.name.includes(name) || (d.alias && name.includes(d.alias.split('、')[0])))

const runAI = async () => {
  if (!imgBase64.value || busy.value) return
  busy.value = true
  aiErr.value = ''
  aiResults.value = []
  try {
    const res = await api.diagnose({
      cropId: store.selectedCropId,
      image: imgBase64.value,
      region: store.user?.region ? String(store.user.region) : '云南',
      userId: store.user ? String(store.user.id) : undefined
    })
    aiRecordId.value = res.recordId ? String(res.recordId) : ''
    aiResults.value = (res.diagnosis?.results || []).slice(0, 3)
    if (!aiResults.value.length) aiErr.value = '未能识别出疑似病害，请尝试更清晰的照片'
  } catch (e: any) {
    aiErr.value = e?.message || '识别失败，请重试'
  } finally {
    busy.value = false
  }
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

/* ===== 症状速查 ===== */
const selectedSymptoms = ref<string[]>([])

/** 聚合当前作物病害的高频症状关键词 */
const symptomChips = computed(() => {
  const freq = new Map<string, number>()
  for (const d of props.diseases) {
    for (const k of d.symptomKeywords) freq.set(k, (freq.get(k) || 0) + 1)
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k]) => k)
})

const toggleSymptom = (k: string) => {
  const i = selectedSymptoms.value.indexOf(k)
  if (i >= 0) selectedSymptoms.value.splice(i, 1)
  else selectedSymptoms.value.push(k)
}

const symptomResults = computed(() => {
  if (!selectedSymptoms.value.length) return []
  return props.diseases
    .map((d) => {
      const hit = d.symptomKeywords.filter((k) => selectedSymptoms.value.includes(k))
      const hit2 = d.symptoms.join(' ').includes(selectedSymptoms.value.join('')) ? 0 : 0
      return { d, score: hit.length + hit2, hits: hit }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
})

watch(
  () => props.open,
  (v) => {
    if (v) {
      selectedSymptoms.value = []
      resetPhoto()
      tab.value = 'photo'
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

          <!-- 方式切换 -->
          <div class="ql__tabs">
            <button class="ql__tab" :class="{ 'is-on': tab === 'photo' }" @click="tab = 'photo'">
              📷 拍照识别
            </button>
            <button class="ql__tab" :class="{ 'is-on': tab === 'symptom' }" @click="tab = 'symptom'">
              📝 症状勾选
            </button>
          </div>

          <!-- ① 拍照识别 -->
          <div v-if="tab === 'photo'" class="ql__body">
            <p class="ql__tip">拍摄或上传病部清晰照片，AI 视觉模型将对照「{{ store.crops.find((c) => c.id === store.selectedCropId)?.name }}」候选病害给出疑似结果</p>

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
                <button class="ql__mini ql__mini--go" :disabled="busy" @click="runAI">
                  {{ busy ? '⏳ AI 识别中…' : '🔍 开始识别' }}
                </button>
              </div>
            </div>

            <p v-if="aiErr" class="ql__err">⚠️ {{ aiErr }}</p>

            <!-- 识别结果 -->
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
          </div>

          <!-- ② 症状勾选 -->
          <div v-else class="ql__body">
            <p class="ql__tip">勾选田间观察到的症状，实时匹配当前作物的候选病害</p>

            <div class="ql__chips">
              <button
                v-for="k in symptomChips"
                :key="k"
                class="ql__chip"
                :class="{ 'is-on': selectedSymptoms.includes(k) }"
                @click="toggleSymptom(k)"
              >
                {{ k }}
              </button>
            </div>

            <div v-if="selectedSymptoms.length" class="ql__picked">
              已选 {{ selectedSymptoms.length }} 项：
              <span v-for="s in selectedSymptoms" :key="s" class="ql__picked-tag" @click="toggleSymptom(s)">{{ s }} ✕</span>
              <button class="ql__picked-clear" @click="selectedSymptoms = []">清空</button>
            </div>

            <!-- 匹配结果 -->
            <div v-if="symptomResults.length" class="ql__matches">
              <div v-for="m in symptomResults" :key="m.d.id" class="ql__match" @click="emit('close'); router.push(`/knowledge/${m.d.id}`)">
                <div class="ql__match-main">
                  <b>{{ m.d.name }}</b>
                  <span class="ql__match-hits">命中 {{ m.hits.join(' / ') }}</span>
                </div>
                <span class="ql__match-sev" :data-sev="m.d.severity">{{ severityLabel[m.d.severity] }}</span>
                <i class="ql__match-arrow">›</i>
              </div>
            </div>
            <div v-else-if="selectedSymptoms.length" class="ql__nomatch">
              当前组合未匹配到病害，试试减少勾选项
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

.ql__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 14px 18px 0;
}

.ql__tab {
  padding: 10px;
  border-radius: 12px;
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-page);
  font-size: 13.5px;
  font-weight: 700;
  color: var(--c-text-2);
  transition: all 0.15s;
}

.ql__tab.is-on {
  border-color: var(--c-primary-500);
  background: var(--c-primary-50);
  color: var(--c-primary-700);
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
  padding: 34px 16px;
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
  max-height: 260px;
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

/* 症状勾选 */
.ql__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-bottom: 12px;
}

.ql__chip {
  padding: 7px 13px;
  border-radius: 999px;
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-card);
  font-size: 12px;
  color: var(--c-text-2);
  transition: all 0.13s;
}

.ql__chip.is-on {
  background: var(--c-primary-500);
  border-color: var(--c-primary-500);
  color: #fff;
  font-weight: 700;
}

.ql__picked {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11.5px;
  color: var(--c-text-3);
  margin-bottom: 11px;
}

.ql__picked-tag {
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--c-primary-100);
  color: var(--c-primary-800);
  font-weight: 700;
  cursor: pointer;
}

.ql__picked-clear {
  font-size: 11px;
  color: var(--c-text-4);
  text-decoration: underline;
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
  padding: 22px;
  text-align: center;
  font-size: 12.5px;
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
</style>
