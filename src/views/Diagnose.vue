<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import CropEmoji from '@/components/CropEmoji.vue'
import RegionPicker from '@/components/RegionPicker.vue'
import PageHero from '@/components/PageHero.vue'
import api from '@/api'
import { provinceOfRegion } from '@/data/regions'

/** 当前地区可诊断的作物：优先显示所选区域对应的本地作物，跨区作物归入「其他地区」 */
const regionCrops = computed(() => store.localCrops.filter((c) => c.diagnosable !== false))
const remoteCrops = computed(() => store.otherCrops.filter((c) => c.diagnosable !== false))
const showRemote = ref(false)

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
const showExtra = ref(true)
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

/* ==================== AI 多 Agent 推理日志面板 ==================== */
type AgentLogState = 'loading' | 'done' | 'warn'
interface AgentLog {
  icon: string
  agent: string
  text: string
  ts: string
  state: AgentLogState
}
const agentLogs = ref<AgentLog[]>([])
const agentOpen = ref(true)
const agentRunning = computed(() => submitting.value)
/** 低置信度（<85%）→ 显示「提交专家人工复核」蓝色主按钮 */
const needReview = ref(false)
const reviewSubmitting = ref(false)
const reviewDone = ref(false)
const lastRecord = ref<{ recordId: number; cropId: string; confidencePct: number; aiDisease: string; image: string } | null>(null)
const logListRef = ref<HTMLElement | null>(null)

const nowTs = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 追加一条 Agent 日志（默认进行中，带 loading 动画） */
const pushLog = (icon: string, agent: string, text: string, state: AgentLogState = 'loading') => {
  agentLogs.value.push({ icon, agent, text, ts: nowTs(), state })
  nextTick(() => logListRef.value?.scrollTo({ top: logListRef.value.scrollHeight, behavior: 'smooth' }))
}

/** 完成最后一条日志：更新文本 + 状态 */
const finishLog = (text: string, state: AgentLogState = 'done') => {
  const last = agentLogs.value[agentLogs.value.length - 1]
  if (!last) return
  last.text = text
  last.state = state
  last.ts = nowTs()
}

/** 结果到达后，把三个 Agent 的结论按顺序流式点亮（模拟真实推理时序）；返回置信度百分比 */
const streamAgentLogs = async (result: any): Promise<number> => {
  const top = result.diagnosis?.results?.[0]
  const kbCount = result.kbSources?.length || 0
  const similar = result.diagnosis?.results?.[1]?.name
  const lesion =
    result.diagnosis?.noticed?.[0] || top?.symptomMatch?.[0] || '病斑特征区域'

  finishLog(`识别作物：${result.cropName}；检测病灶部位：${lesion}`)
  await sleep(650)
  pushLog('📚', 'RAG 检索 Agent', '基于作物与病灶，检索本地植保知识库…')
  await sleep(550)
  finishLog(`检索得到 ${kbCount} 条相关植保知识库片段`)
  await sleep(650)
  pushLog('✅', '置信复核 Agent', '正在计算病害置信分数，校验相似病害…')
  await sleep(550)
  const pct = Math.round((top?.confidence ?? 0) * 100)
  finishLog(`识别置信度：${pct}%；排除相似病害：${similar || '无高相似干扰项'}`)

  // 置信度 ≥85% 直接出报告；<85% 日志末尾黄色警告 + 蓝色复核按钮
  needReview.value = pct < 85
  lastRecord.value = {
    recordId: result.recordId,
    cropId: result.cropId,
    confidencePct: pct,
    aiDisease: top?.name || '',
    image: image.value || ''
  }
  if (needReview.value) {
    await sleep(420)
    pushLog('⚠️', '置信复核 Agent', '置信度偏低，建议提交农技专家人工复核', 'warn')
  }
  return pct
}

/** 提交专家人工复核（低置信度路径，先弹确认弹窗） */
const reviewConfirmOpen = ref(false)
const openReviewConfirm = () => {
  if (!lastRecord.value) return
  reviewConfirmOpen.value = true
}

const submitReview = async () => {
  if (!lastRecord.value || reviewSubmitting.value || reviewDone.value) return
  reviewConfirmOpen.value = false
  reviewSubmitting.value = true
  try {
    await api.createReviewRequest({
      recordId: lastRecord.value.recordId,
      cropId: lastRecord.value.cropId,
      region: store.region,
      question: `AI 置信度偏低（${lastRecord.value.confidencePct}%），请人工复核本次诊断结论`,
      image: lastRecord.value.image || undefined,
      aiDisease: lastRecord.value.aiDisease || undefined,
      aiConfidence: lastRecord.value.confidencePct / 100
    })
    reviewDone.value = true
    pushLog('📨', '复核调度 Agent', '复核工单已推送至专家端，专家意见将通过消息通知您', 'done')
    store.showToast('工单已提交成功，请等待专家处理', 'success')
    setTimeout(() => router.replace(`/result/${lastRecord.value!.recordId}`), 1100)
  } catch (e) {
    store.showToast((e as Error).message || '提交复核失败，请重试', 'error')
  } finally {
    reviewSubmitting.value = false
  }
}

/** 低置信度时也可直接查看完整诊断报告 */
const gotoReport = () => {
  if (lastRecord.value) router.replace(`/result/${lastRecord.value.recordId}`)
}

/** 多 Agent 协作说明弹窗 */
const flowOpen = ref(false)
const FLOW_DESC: Record<string, string> = {
  triage: '视觉大模型（Qwen3-VL）读取照片，识别作物器官与病斑形态，输出疑似病害与置信度',
  gate: '校验置信度是否达标、是否涉及检疫性/毁灭性病害，低置信度结果不直接下发，转交专家复核',
  treatment: '结合知识库与农药安全数据生成用药方案，标注剂量、频次与安全间隔期'
}

const currentCrop = computed(() => store.selectedCrop)

/** 自定义作物：知识库未收录的作物也能诊断（走 AI 自由识别 + 农户自填作物名） */
const isCustomCrop = ref(false)
const customCropName = ref('')

const canSubmit = computed(() => Boolean(image.value || symptomsText.value.trim()))

onMounted(async () => {
  // 先恢复登录态：提交诊断时记录才能归属到当前账号
  await store.restoreUser().catch(() => {})
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

/** 文件接入统一入口：点击选择 / 拖拽放入共用（类型与大小前置校验 + 压缩） */
const acceptFile = async (file: File) => {
  // 前置校验①：文件类型（只允许 jpg/png/jpeg，拦截 heic/gif 等）
  const okType =
    ['image/jpeg', 'image/png'].includes(file.type) ||
    /\.(jpe?g|png)$/i.test(file.name || '')
  if (!okType) {
    store.showToast('仅支持jpg/png图片格式', 'error')
    return
  }
  // 前置校验②：文件大小（>10MB 直接拦截，不进 AI 流程）
  if (file.size > 10 * 1024 * 1024) {
    store.showToast('图片不能超过10MB，请压缩后重新上传', 'error')
    return
  }

  try {
    image.value = await compressImage(file)
    fileName.value = file.name
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  }
}

const handleFile = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  await acceptFile(file)
  target.value = ''
}

/* ---- 拖拽上传：图片可直接从文件夹拖进上传区 ---- */
const dragOver = ref(false)

const onDrop = async (e: DragEvent) => {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  await acceptFile(file)
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
  agentLogs.value = []
  needReview.value = false
  reviewDone.value = false
  lastRecord.value = null
}

const submit = async () => {
  if (!canSubmit.value || submitting.value) return
  if (isCustomCrop.value && !customCropName.value.trim()) {
    store.showToast('请输入作物名称', 'error')
    return
  }
  if (!isCustomCrop.value && !currentCrop.value) {
    store.showToast('请先选择作物', 'error')
    return
  }

  submitting.value = true
  activeStep.value = 0
  // 复位推理日志面板：默认展开并输出第一条 Agent 日志
  agentLogs.value = []
  needReview.value = false
  reviewDone.value = false
  lastRecord.value = null
  agentOpen.value = true
  pushLog('🧠', '视觉识别 Agent', '正在解析图片，识别作物种类，定位病灶区域…')

  // 模拟阶段推进（真实耗时由后端返回，此处仅做视觉反馈）
  const stepTimer = setInterval(() => {
    if (activeStep.value < steps.length - 1) activeStep.value++
  }, 1400)

  try {
    // 优先异步任务模式：提交立即返回，后台执行，避免托管网关 60s 掐断（504）
    const payload = {
      cropId: isCustomCrop.value ? 'auto' : currentCrop.value?.id || 'auto',
      customCrop: isCustomCrop.value ? customCropName.value.trim() || undefined : undefined,
      image: image.value || undefined,
      symptomsText: symptomsText.value || undefined,
      altitude: altitude.value || undefined,
      weather: weather.value || undefined,
      stage: stage.value || undefined,
      area: area.value || undefined,
      region: store.region,
      userId: store.recordsUserId
    }
    let result: any = null
    try {
      const { taskId } = await api.submitDiagnose(payload)
      for (let i = 0; i < 250; i++) {
        await new Promise((r) => setTimeout(r, 1200))
        const st = await api.pollDiagnoseTask(taskId)
        if (st.status === 'done') {
          result = st as any
          break
        }
        if (st.status === 'error') {
          // 业务错误（AI 样例拦截：非植株/无病灶、任务失败等）：标记后直接抛出，禁止降级重试
          const bizErr = new Error(st.error || '诊断失败，请重试') as Error & { bizError?: boolean }
          bizErr.bizError = true
          throw bizErr
        }
      }
      if (!result) throw new Error('TASK_TIMEOUT')
    } catch (e: any) {
      if (e?.bizError) throw e
      if (e?.message === 'TASK_TIMEOUT') throw new Error('诊断超时，请稍后重试')
      // 限流 / 超时等 HTTP 层错误：直接提示，不降级（降级会造成重复真实诊断）
      if (e?.httpStatus === 429 || e?.message?.includes('超时')) throw e
      // 仅当异步接口不可用（纯静态部署 404 / 网络异常）→ 同步调用兜底
      if (e?.httpStatus && e.httpStatus !== 404) throw e
      result = await api.diagnose(payload)
    }

    store.setLastResult(result, image.value)
    clearInterval(stepTimer)
    activeStep.value = steps.length

    // 三个 Agent 结论依次流式点亮（视觉识别 → RAG 检索 → 置信复核）
    const pct = await streamAgentLogs(result)

    if (needReview.value) {
      // 低置信度：停留本页，展示「提交专家人工复核」蓝色按钮，由用户决定
      submitting.value = false
      store.showToast(`诊断完成，置信度 ${pct}%，建议人工复核`, 'info')
    } else {
      // 高置信度：直接进入完整诊断报告（不出现复核按钮）
      store.showToast('诊断完成', 'success')
      setTimeout(() => router.replace(`/result/${result.recordId}`), 700)
    }
  } catch (err) {
    clearInterval(stepTimer)
    activeStep.value = -1
    submitting.value = false
    finishLog(`诊断中断：${(err as Error).message || '未知错误'}`, 'warn')
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

    <!-- 宽屏横幅 -->
    <PageHero
      wide-only
      emoji="📷"
      title="智能诊断"
      desc="拍张照片、描述症状，AI 双 Agent 联合分析，约 30 秒出具诊断报告"
      badge="多 Agent 协作"
      badge-icon="sparkle"
      image="/media/banners/b39452374_wide.jpg"
      :tags="['症状越清晰越准', '支持叶片 / 果实 / 根部', '低置信度自动转专家复核']"
      @badge-click="flowOpen = true"
    />

    <!-- 多 Agent 协作说明弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="flowOpen" class="flow-mask" @click.self="flowOpen = false">
          <div class="flow">
            <header class="flow__head">
              <b><AppIcon name="sparkle" :size="15" /> 多 Agent 协作 · 工作原理</b>
              <button class="flow__close" @click="flowOpen = false">✕</button>
            </header>
            <div class="flow__body">
              <div v-for="(s, i) in steps" :key="s.key" class="flow__item">
                <span class="flow__n">{{ i + 1 }}</span>
                <span class="flow__icon"><AppIcon :name="s.icon" :size="17" /></span>
                <div class="flow__txt">
                  <strong>{{ s.label }}</strong>
                  <p>{{ FLOW_DESC[s.key] }}</p>
                </div>
              </div>
              <p class="flow__foot">
                三个 Agent 各司其职、层层把关：视觉模型负责「看」，闸门负责「把关」，用药 Agent 负责「开方」——
                置信度不足或涉及检疫性病害时会自动转交人工复核，而不是硬给一个答案。
              </p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div class="scroll-area">
      <!-- 作物选择 -->
      <section class="block">
        <label class="block__label">
          1 · 选择作物
          <span class="block__hint">{{ store.region }} · {{ store.cropsProvince }}产区</span>
          <!-- 点击可自行切换种植地区，作物列表随之刷新 -->
          <RegionPicker class="diagnose-region" />
        </label>
        <div class="crop-chips">
          <button
            v-for="c in regionCrops"
            :key="c.id"
            class="crop-chip"
            :class="{ 'is-active': store.selectedCropId === c.id }"
            :style="{ '--crop-color': c.color }"
            @click="store.setCrop(c.id)"
          >
            <CropEmoji class="crop-chip__emoji" :emoji="c.emoji" :name="c.name" :size="20" />
            <span>{{ c.name }}</span>
            <AppIcon v-if="store.selectedCropId === c.id" name="check" :size="14" class="crop-chip__check" />
          </button>
        </div>

        <!-- 跨区作物：折叠展开，避免与本地产区混淆 -->
        <div v-if="remoteCrops.length" class="remote-wrap">
          <button class="remote-toggle" @click="showRemote = !showRemote">
            <AppIcon name="grid" :size="13" />
            <span>{{ showRemote ? '收起' : '其他地区作物' }}（{{ remoteCrops.length }}）</span>
            <AppIcon :name="showRemote ? 'chevron-up' : 'chevron-down'" :size="13" />
          </button>
          <div v-if="showRemote" class="crop-chips crop-chips--remote">
            <button
              v-for="c in remoteCrops"
              :key="c.id"
              class="crop-chip"
              :class="{ 'is-active': store.selectedCropId === c.id }"
              :style="{ '--crop-color': c.color }"
              @click="store.setCrop(c.id)"
            >
              <CropEmoji class="crop-chip__emoji" :emoji="c.emoji" :name="c.name" :size="20" />
              <span>{{ c.name }}</span>
            </button>
          </div>
          <p v-if="showRemote" class="remote-tip">
            以下作物在 {{ store.cropsProvince }} 非主产区，知识库已收录诊断模型，可按需选择
          </p>
        </div>

        <!-- 自定义作物：不在列表中的作物也能诊断 -->
        <div class="remote-wrap">
          <button
            class="crop-chip"
            :class="{ 'is-active': isCustomCrop }"
            @click="isCustomCrop = !isCustomCrop"
          >
            <span class="crop-chip__emoji">✏️</span>
            <span>其他作物</span>
          </button>
          <div v-if="isCustomCrop" class="field" style="margin-top: 10px">
            <input
              v-model="customCropName"
              class="input"
              placeholder="输入作物名称，如：辣椒、玉米、百合…"
              maxlength="12"
            />
            <p class="remote-tip">
              知识库未收录的作物也能诊断：AI 将结合您的照片与通用植保知识判断，结果中会标注可靠性
            </p>
          </div>
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
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          capture="environment"
          class="hidden-input"
          @change="handleFile"
        />

        <div
          v-if="!image"
          class="uploader"
          :class="{ 'is-drag': dragOver }"
          @click="pickImage"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDrop"
        >
          <div class="uploader__icon">
            <AppIcon name="camera" :size="30" :stroke="1.6" />
          </div>
          <p class="uploader__title">点击拍照、从相册选择或拖入图片</p>
          <p class="uploader__sub">支持叶片、果实、根茎部照片（可直接把图片文件拖进来）</p>
          <div class="uploader__tips">
            <span><AppIcon name="check" :size="11" /> 顺光拍摄</span>
            <span><AppIcon name="check" :size="11" /> 病部居中</span>
            <span><AppIcon name="check" :size="11" /> 避免模糊</span>
          </div>
        </div>

        <div
          v-else
          class="preview"
          :class="{ 'is-drag': dragOver }"
          @dragover.prevent="dragOver = true"
          @dragleave.prevent="dragOver = false"
          @drop.prevent="onDrop"
        >
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

      <!-- 🔍 AI 多 Agent 推理过程日志面板（默认展开） -->
      <section class="block">
        <button class="agent-head" @click="agentOpen = !agentOpen">
          <span class="agent-head__title">🔍 AI 多 Agent 推理过程</span>
          <span class="agent-head__meta">
            <i v-if="agentRunning" class="agent-head__live">推理中</i>
            <AppIcon name="arrow-right" :size="15" class="agent-head__arrow" :class="{ 'is-open': agentOpen }" />
          </span>
        </button>

        <div v-show="agentOpen" class="agent-body">
          <div ref="logListRef" class="agent-logs">
            <p v-if="!agentLogs.length" class="agent-logs__empty">
              📡 上传照片并点击「开始 AI 诊断」后，这里将实时展示每个 Agent 的推理过程
            </p>
            <div
              v-for="(l, i) in agentLogs"
              :key="i"
              class="alog"
              :class="'alog--' + l.state"
            >
              <span class="alog__icon">{{ l.icon }}</span>
              <div class="alog__main">
                <div class="alog__top">
                  <b>【{{ l.agent }}】</b>
                  <span class="alog__ts">{{ l.ts }}</span>
                </div>
                <p class="alog__text">
                  <span v-if="l.state === 'loading'" class="alog__spin" aria-hidden="true"></span>
                  <template v-else>{{ l.state === 'done' ? '✅ ' : '⚠️ ' }}</template>
                  {{ l.text }}
                </p>
              </div>
            </div>
          </div>

          <!-- 低置信度分支：蓝色主按钮（置信度 ≥85% 时不渲染） -->
          <button
            v-if="needReview && !reviewDone"
            class="agent-review"
            :disabled="reviewSubmitting"
            @click="openReviewConfirm"
          >
            <AppIcon name="shield" :size="16" />
            {{ reviewSubmitting ? '⏳ 正在提交复核…' : '提交专家人工复核' }}
          </button>
          <p v-if="reviewDone" class="agent-review__done">
            ✅ 已提交专家人工复核，专家意见将通过消息通知您
          </p>
          <button v-if="needReview" class="agent-report-link" @click="gotoReport">
            查看完整诊断报告 →
          </button>
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
        <span>拍摄建议：优先拍叶片正反面与病斑特写，避免逆光与模糊；信息填写越完整，AI 识别准确率越高。AI 诊断结果仅作参考，严重病害请及时联系本地农技站。</span>
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

    <!-- 复核提交确认弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="reviewConfirmOpen" class="rc-mask" @click.self="reviewConfirmOpen = false">
          <div class="rc-dialog">
            <div class="rc-dialog__icon">🧑‍🔬</div>
            <h3 class="rc-dialog__title">提交专家人工复核</h3>
            <p class="rc-dialog__text">
              将把<b>照片、AI 初步诊断结果</b>提交给农技专家复核；提交后可在
              <b>【我的种植档案】- 专家复核记录</b>查看进度。
            </p>
            <div class="rc-dialog__btns">
              <button class="rc-btn rc-btn--ghost" @click="reviewConfirmOpen = false">取消</button>
              <button class="rc-btn rc-btn--primary" :disabled="reviewSubmitting" @click="submitReview">
                {{ reviewSubmitting ? '⏳ 提交中…' : '确认提交' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 诊断中遮罩（日志面板展开时由面板承担进度展示，避免遮挡） -->
    <transition name="fade">
      <div v-if="submitting && !agentOpen" class="progress-mask">
        <div class="progress-card">
          <div class="progress-card__pulse">
            <AppIcon name="leaf" :size="26" :stroke="1.8" />
          </div>
          <h3 class="progress-card__title">多 Agent 正在协同诊断</h3>
          <p class="progress-card__sub">{{ isCustomCrop ? customCropName || '自定义作物' : currentCrop?.name }} · 请稍候</p>

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
.hero-tips {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.hero-tips span {
  font-size: 12.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.18);
  padding: 6px 13px;
  border-radius: 999px;
  backdrop-filter: blur(4px);
}

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
  font-size: 12.5px;
  font-weight: 400;
  color: var(--c-text-4);
}

/* 诊断页地区选择按钮（紧凑配色） */
.diagnose-region {
  margin-left: 8px;
}

.diagnose-region :deep(.region-btn) {
  padding: 5px 12px;
  font-size: 12px;
  background: var(--c-primary-50, #eaf5ee);
  border: 1px solid var(--c-primary-100, #d6ecdf);
  color: var(--c-primary-700, #256b47);
}

.diagnose-region :deep(.region-btn:hover) {
  background: #dcf0e4;
  border-color: var(--c-primary-600);
}

.diagnose-region :deep(.region-btn__switch) {
  background: rgba(37, 107, 71, 0.12);
  border-color: rgba(37, 107, 71, 0.3);
}

/* 作物 chip */
.crop-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.crop-chip {
  flex: 1 1 calc(25% - 8px);
  min-width: 76px;
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

/* 跨区作物折叠区 */
.remote-wrap {
  margin-top: 10px;
}

.remote-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--c-bg-soft);
  border: 1px dashed var(--c-line);
  font-size: 12px;
  color: var(--c-text-3);
  transition: all var(--dur-fast) var(--ease-out);
}

.remote-toggle:hover {
  border-color: var(--c-brand);
  color: var(--c-brand);
}

.crop-chips--remote {
  margin-top: 9px;
  opacity: 0.92;
}

.remote-tip {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--c-text-4);
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

/* 拖拽悬停高亮（空态与已选图两种状态共用） */
.uploader.is-drag,
.preview.is-drag {
  border: 2px dashed var(--c-primary-500);
  background: var(--c-primary-50);
  box-shadow: 0 0 0 4px rgba(47, 152, 104, 0.15);
  transform: scale(1.01);
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
  font-size: 11.5px;
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
  font-size: 12.5px;
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

/* ==================== AI 多 Agent 推理日志面板 ==================== */
.agent-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  border-radius: var(--r-md);
  background: linear-gradient(118deg, #0f3d22, #17643a 72%, #2f9e5f);
  color: #fff;
  box-shadow: var(--sh-xs);
  transition: transform var(--dur-fast);
}

.agent-head:active {
  transform: scale(0.99);
}

.agent-head__title {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.3px;
}

.agent-head__meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.agent-head__live {
  font-style: normal;
  font-size: 11.5px;
  font-weight: 700;
  padding: 1px 8px;
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.18);
  animation: agentLive 1.4s ease-in-out infinite;
}

@keyframes agentLive {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

.agent-head__arrow {
  color: rgba(255, 255, 255, 0.85);
  transition: transform var(--dur-base) var(--ease-out);
}

.agent-head__arrow.is-open {
  transform: rotate(90deg);
}

.agent-body {
  margin-top: 10px;
  padding: 12px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.agent-logs {
  display: flex;
  flex-direction: column;
  gap: 9px;
  max-height: 320px;
  overflow-y: auto;
}

.agent-logs__empty {
  font-size: 12px;
  color: var(--c-text-4);
  text-align: center;
  padding: 18px 10px;
  line-height: 1.7;
}

.alog {
  display: flex;
  gap: 9px;
  padding: 9px 11px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
  border-left: 3px solid var(--c-line);
  animation: alogIn 0.25s ease-out;
}

.alog--loading {
  border-left-color: #f59e0b;
}

.alog--done {
  border-left-color: #10b981;
}

.alog--warn {
  border-left-color: #f59e0b;
  background: #fffbeb;
}

.alog__icon {
  font-size: 16px;
  line-height: 1.3;
  flex-shrink: 0;
}

.alog__main {
  flex: 1;
  min-width: 0;
}

.alog__top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.alog__top b {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-text-1);
}

.alog__ts {
  font-size: 11.5px;
  color: var(--c-text-4);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.alog__text {
  font-size: 12px;
  line-height: 1.65;
  color: var(--c-text-2);
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.alog--done .alog__text {
  color: #065f46;
}

.alog--warn .alog__text {
  color: #92400e;
  font-weight: 600;
}

.alog__spin {
  width: 12px;
  height: 12px;
  border: 2px solid #fcd34d;
  border-top-color: #f59e0b;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes alogIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}

/* 低置信度复核按钮（蓝色主按钮） */
.agent-review {
  width: 100%;
  margin-top: 12px;
  height: 44px;
  border-radius: var(--r-md);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.5px;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.3);
  transition: background var(--dur-fast), transform var(--dur-fast), box-shadow var(--dur-fast);
}

.agent-review:hover:not(:disabled) {
  background: #1d4ed8;
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(37, 99, 235, 0.38);
}

.agent-review:active:not(:disabled) {
  transform: scale(0.98);
}

.agent-review:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.agent-review__done {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.6;
  color: #065f46;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: var(--r-sm);
  padding: 8px 11px;
}

.agent-report-link {
  width: 100%;
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--c-text-3);
  text-align: center;
  text-decoration: underline dashed;
  text-underline-offset: 3px;
  transition: color var(--dur-fast);
}

.agent-report-link:hover {
  color: var(--c-primary-700);
}

/* 复核提交确认弹窗 */
.rc-mask {
  position: fixed;
  inset: 0;
  z-index: 600;
  background: rgba(12, 22, 18, 0.5);
  backdrop-filter: blur(5px);
  display: grid;
  place-items: center;
  padding: 24px;
}

.rc-dialog {
  width: min(360px, 100%);
  background: var(--c-bg-card);
  border-radius: var(--r-lg);
  padding: 22px 20px 18px;
  text-align: center;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
}

.rc-dialog__icon {
  font-size: 40px;
  line-height: 1;
  margin-bottom: 10px;
}

.rc-dialog__title {
  font-size: 16px;
  font-weight: 800;
  color: var(--c-text-1);
  margin-bottom: 8px;
}

.rc-dialog__text {
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--c-text-2);
  margin-bottom: 16px;
}

.rc-dialog__text b {
  color: var(--c-primary-700);
}

.rc-dialog__btns {
  display: flex;
  gap: 10px;
}

.rc-btn {
  flex: 1;
  height: 42px;
  border-radius: var(--r-full);
  font-size: 14px;
  font-weight: 700;
  transition: transform var(--dur-fast), background var(--dur-fast);
}

.rc-btn--ghost {
  color: var(--c-text-2);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line);
}

.rc-btn--primary {
  color: #fff;
  background: #2563eb;
  box-shadow: 0 8px 20px rgba(37, 99, 235, 0.3);
}

.rc-btn--primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.rc-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.rc-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
  font-size: 11.5px;
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
  font-size: 11.5px;
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

/* 多 Agent 说明弹窗 */
.flow-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(10, 30, 18, 0.5);
  backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  padding: 20px;
  overscroll-behavior: contain;
}

.flow {
  width: min(480px, 100%);
  max-height: 84vh;
  overflow-y: auto;
  background: var(--c-bg-card);
  border-radius: var(--r-lg);
  box-shadow: 0 24px 60px rgba(10, 40, 22, 0.28);
}

.flow__head {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 15px 18px;
  background: linear-gradient(118deg, #0f3d22, #17643a 70%, #2f9e5f);
  color: #fff;
  font-size: 14.5px;
  border-radius: var(--r-xl) var(--r-xl) 0 0;
}

.flow__head b {
  display: flex;
  align-items: center;
  gap: 7px;
}

.flow__close {
  width: 27px;
  height: 27px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 12px;
}

.flow__body {
  padding: 16px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.flow__item {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  position: relative;
  padding-bottom: 2px;
}

.flow__n {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11.5px;
  font-weight: 800;
  color: #fff;
  background: var(--c-primary-600);
  flex-shrink: 0;
  margin-top: 7px;
}

.flow__icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  flex-shrink: 0;
}

.flow__txt strong {
  display: block;
  font-size: 13px;
  font-weight: 800;
  color: var(--c-text-1);
  margin-bottom: 2px;
}

.flow__txt p {
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--c-text-3);
}

.flow__foot {
  margin-top: 4px;
  padding: 11px 13px;
  border-radius: 12px;
  background: var(--c-primary-50);
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--c-primary-800);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
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

/* 宽屏隐藏移动端顶栏（由横幅替代） */
@media (min-width: 960px) {
  .page-head.page-head {
    display: none;
  }
}
</style>
