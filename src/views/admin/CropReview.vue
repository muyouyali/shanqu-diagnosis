<script setup lang="ts">
/**
 * 作物共建审核（后台）
 * 农户提交 → 专家核验 → 通过后自动并入该省地区作物图谱
 */
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import CropEmoji from '@/components/CropEmoji.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useAppStore } from '@/stores/app'
import { listLocalSubsFiltered, reviewLocalSub } from '@/data/localSubs'
import type { CropSubmission, DiseaseSample } from '@/types'

const store = useAppStore()
const router = useRouter()

/** 顶部模式切换：作物共建 / 病害样本（农户提交 → 专家审核 → 入库知识库） */
const mode = ref<'crops' | 'samples'>('crops')

const list = ref<CropSubmission[]>([])
/** 全量提交（不随筛选变化）：用于顶部统计卡各状态总数 */
const allSubs = ref<CropSubmission[]>([])
const loading = ref(true)
const status = ref<'pending' | 'approved' | 'rejected' | 'all'>('pending')
const active = ref<CropSubmission | null>(null)
const note = ref('')
const busy = ref(false)

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待审核', color: '#9a6a1e', bg: '#fdf3e7' },
  approved: { label: '已通过', color: '#1a7f45', bg: '#e8f7ee' },
  rejected: { label: '已驳回', color: '#b4342f', bg: '#fdeceb' }
}

const STATUS_TABS = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
  { key: 'all', label: '全部' }
] as const

const load = async () => {
  loading.value = true
  let remote: CropSubmission[] = []
  try {
    // 拉全量（不带 status）：顶部统计卡需始终显示各状态总数，不随筛选变化
    const res = await api.cropSubmissions({})
    remote = res.items
  } catch {
    // 静态托管：远端不可用时仅用本地数据
    remote = []
  }
  // 合并本地兜底提交（去重：远端同名同期的优先）
  const local = listLocalSubsFiltered()
  const keys = new Set(remote.map((s) => `${s.name}|${s.createdAt}`))
  const merged = [
    ...remote,
    ...local.items
      .filter((l) => !keys.has(`${l.name}|${l.createdAt}`))
      .map((l) => l as unknown as CropSubmission)
  ]
  allSubs.value = merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  list.value = allSubs.value.filter((s) => status.value === 'all' || s.status === status.value)
  loading.value = false
}

onMounted(() => {
  load()
  // 预拉样本计数：进入页面即可看到「病害样本」待办角标
  loadSamples()
})

const switchStatus = (s: typeof status.value) => {
  status.value = s
  // 全量数据已在前端：本地过滤即可，无需重新请求
  list.value = allSubs.value.filter((x) => s === 'all' || x.status === s)
}

const counts = computed(() => {
  const m: Record<string, number> = { pending: 0, approved: 0, rejected: 0 }
  for (const it of allSubs.value) m[it.status] = (m[it.status] || 0) + 1
  return m
})

const open = (item: CropSubmission) => {
  active.value = item
  note.value = item.note || ''
}

const review = async (next: 'approved' | 'rejected') => {
  if (!active.value || busy.value) return
  busy.value = true
  const target = active.value
  try {
    if ((target as any).local) {
      // 本地兜底提交：直接更新本地状态，无需请求
      reviewLocalSub(target.id, { status: next, note: note.value })
    } else {
      try {
        await api.reviewCropSubmission(target.id, { status: next, note: note.value })
      } catch {
        reviewLocalSub(target.id, { status: next, note: note.value })
      }
    }
    store.showToast(next === 'approved' ? '已通过，作物已并入地区图谱' : '已驳回', 'success')
    active.value = null
    await load()
  } catch (e) {
    store.showToast((e as Error).message, 'error')
  } finally {
    busy.value = false
  }
}

const fmt = (iso: string) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* ==================== 🌱 病害样本审核 ==================== */
const sList = ref<DiseaseSample[]>([])
const sLoading = ref(false)
const sStatus = ref<'pending' | 'approved' | 'rejected' | 'all'>('pending')
const sActive = ref<DiseaseSample | null>(null)
const sNote = ref('')
const sDiseaseName = ref('')
const sDiseaseType = ref('真菌病害')
const sTreatment = ref('')
const sBusy = ref(false)
/** 图片放大查看 */
const sImgView = ref('')

const S_STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: '待审核', color: '#9a6a1e', bg: '#fdf3e7' },
  approved: { label: '审核通过 · 已入库', color: '#1a7f45', bg: '#e8f7ee' },
  rejected: { label: '已驳回', color: '#b4342f', bg: '#fdeceb' }
}

const S_STATUS_TABS = [
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已驳回' },
  { key: 'all', label: '全部' }
] as const

const sCounts = ref<Record<string, number>>({ pending: 0, approved: 0, rejected: 0 })

const loadSamples = async () => {
  sLoading.value = true
  try {
    // 拉全量后前端按状态分桶（列表量级小，一次拉取可同时算角标）
    const res = await api.diseaseSamples('all')
    sList.value = (res.items || []).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    const m: Record<string, number> = { pending: 0, approved: 0, rejected: 0 }
    for (const it of sList.value) m[it.status] = (m[it.status] || 0) + 1
    sCounts.value = m
  } catch (e: any) {
    store.showToast(e?.message || '样本列表加载失败', 'error')
  } finally {
    sLoading.value = false
  }
}

const sFiltered = computed(() =>
  sStatus.value === 'all' ? sList.value : sList.value.filter((s) => s.status === sStatus.value)
)

const switchMode = (m: 'crops' | 'samples') => {
  mode.value = m
  if (m === 'samples') loadSamples()
}

const switchSampleStatus = (s: typeof sStatus.value) => {
  sStatus.value = s
}

const openSample = (s: DiseaseSample) => {
  sActive.value = s
  sNote.value = s.note || ''
  sDiseaseName.value = s.diseaseName || ''
  sDiseaseType.value = s.diseaseType || '真菌病害'
  sTreatment.value = s.treatment || ''
}

const reviewSample = async (next: 'approved' | 'rejected') => {
  if (!sActive.value || sBusy.value) return
  if (next === 'approved' && !sDiseaseName.value.trim()) {
    store.showToast('请填写确诊病害名称（入库知识库用）', 'error')
    return
  }
  if (next === 'rejected' && !sNote.value.trim()) {
    store.showToast('请填写驳回理由，将通知农户修改后重新提交', 'error')
    return
  }
  sBusy.value = true
  try {
    await api.reviewDiseaseSample(sActive.value.id, {
      status: next,
      note: sNote.value.trim(),
      diseaseName: sDiseaseName.value.trim(),
      diseaseType: sDiseaseType.value.trim(),
      treatment: sTreatment.value.trim()
    })
    store.showToast(
      next === 'approved' ? '已通过，样本已并入病害图谱知识库' : '已驳回，已通知农户修改后重新提交',
      'success'
    )
    sActive.value = null
    await loadSamples()
  } catch (e: any) {
    store.showToast(e?.message || '操作失败', 'error')
  } finally {
    sBusy.value = false
  }
}
</script>

<template>
  <div class="cp">
    <!-- 模式切换：作物共建 / 病害样本 -->
    <div class="mode-switch">
      <button class="mode-btn" :class="{ 'is-on': mode === 'crops' }" @click="switchMode('crops')">
        🌾 作物共建
      </button>
      <button class="mode-btn" :class="{ 'is-on': mode === 'samples' }" @click="switchMode('samples')">
        🌱 病害样本
        <i v-if="sCounts.pending">{{ sCounts.pending }}</i>
      </button>
    </div>

    <template v-if="mode === 'crops'">
    <!-- 页头横幅 -->
    <header class="cp__hero">
      <div class="cp__hero-text">
        <h1>作物共建审核</h1>
        <p>农户提交的地方作物经核验后并入对应省份的作物图谱，供全站用户检索</p>
      </div>
      <button class="cp__hero-badge" @click="router.push('/knowledge')">
        <AppIcon name="leaf" :size="18" />
        <span>共建图谱</span>
        <AppIcon name="arrow-right" :size="14" />
      </button>
    </header>

    <!-- 统计卡 -->
    <div class="cp__stats">
      <div class="stat stat--amber" :class="{ 'is-dim': status !== 'pending' }" @click="switchStatus('pending')">
        <span class="stat__icon"><AppIcon name="clock" :size="16" /></span>
        <div>
          <strong>{{ counts.pending || 0 }}</strong>
          <small>待审核</small>
        </div>
      </div>
      <div class="stat stat--green" :class="{ 'is-dim': status !== 'approved' }" @click="switchStatus('approved')">
        <span class="stat__icon"><AppIcon name="check-circle" :size="16" /></span>
        <div>
          <strong>{{ counts.approved || 0 }}</strong>
          <small>已通过</small>
        </div>
      </div>
      <div class="stat stat--red" :class="{ 'is-dim': status !== 'rejected' }" @click="switchStatus('rejected')">
        <span class="stat__icon"><AppIcon name="x" :size="16" /></span>
        <div>
          <strong>{{ counts.rejected || 0 }}</strong>
          <small>已驳回</small>
        </div>
      </div>
    </div>

    <!-- 筛选签 -->
    <div class="cp__tabs">
      <button
        v-for="t in STATUS_TABS"
        :key="t.key"
        class="cp__tab"
        :class="{ 'is-on': status === t.key }"
        @click="switchStatus(t.key)"
      >
        {{ t.label }}
        <i v-if="t.key !== 'all' && counts[t.key]">{{ counts[t.key] }}</i>
      </button>
    </div>

    <div v-if="loading" class="cp__empty">正在加载…</div>

    <div v-else-if="!list.length" class="cp__empty">
      <span class="cp__empty-icon">🌾</span>
      <p>当前没有{{ STATUS_TABS.find((t) => t.key === status)?.label }}的提交</p>
      <small>农户在「我的档案 · 作物共建」提交后，会出现在这里等待核验</small>
    </div>

    <div v-else class="cp__list">
      <article v-for="it in list" :key="it.id" class="sub-card">
        <div class="sub-card__left">
          <CropEmoji class="sub-card__emoji" :emoji="it.emoji" :name="it.name" :size="22" />
        </div>
        <div class="sub-card__body">
          <div class="sub-card__top">
            <h3>{{ it.name }}</h3>
            <span
              class="sub-card__status"
              :style="{ color: STATUS_META[it.status].color, background: STATUS_META[it.status].bg }"
            >
              {{ STATUS_META[it.status].label }}
            </span>
          </div>
          <p class="sub-card__alias">{{ it.alias || '无别名' }} · {{ it.province }}</p>
          <p class="sub-card__desc">{{ it.desc }}</p>
          <div class="sub-card__meta">
            <span><AppIcon name="mountain" :size="11" /> {{ it.altitude || '待补充' }}</span>
            <span><AppIcon name="clock" :size="11" /> {{ it.season || '待补充' }}</span>
            <span><AppIcon name="user" :size="11" /> {{ it.submitter }}</span>
            <span>{{ fmt(it.createdAt) }}</span>
          </div>
          <p v-if="it.note" class="sub-card__note">
            <AppIcon name="info" :size="11" /> {{ it.note }}
          </p>
        </div>
        <div class="sub-card__ops">
          <button class="op-btn op-btn--primary" @click="open(it)">
            {{ it.status === 'pending' ? '审核' : '查看' }}
          </button>
        </div>
      </article>
    </div>

    </template>

    <!-- ===== 🌱 病害样本审核（农户共建闭环） ===== -->
    <template v-else>
      <header class="cp__hero cp__hero--sample">
        <div class="cp__hero-text">
          <h1>病害样本审核</h1>
          <p>农户提交的病害样本经核验后自动并入本地病害图谱知识库，供全站检索与 AI 问答引用</p>
        </div>
        <button class="cp__hero-badge" @click="router.push('/knowledge')">
          <AppIcon name="leaf" :size="18" />
          <span>病害图谱</span>
          <AppIcon name="arrow-right" :size="14" />
        </button>
      </header>

      <!-- 统计卡 -->
      <div class="cp__stats">
        <div class="stat stat--amber" :class="{ 'is-dim': sStatus !== 'pending' }" @click="switchSampleStatus('pending')">
          <span class="stat__icon"><AppIcon name="clock" :size="16" /></span>
          <div>
            <strong>{{ sCounts.pending || 0 }}</strong>
            <small>待审核</small>
          </div>
        </div>
        <div class="stat stat--green" :class="{ 'is-dim': sStatus !== 'approved' }" @click="switchSampleStatus('approved')">
          <span class="stat__icon"><AppIcon name="check-circle" :size="16" /></span>
          <div>
            <strong>{{ sCounts.approved || 0 }}</strong>
            <small>已入库</small>
          </div>
        </div>
        <div class="stat stat--red" :class="{ 'is-dim': sStatus !== 'rejected' }" @click="switchSampleStatus('rejected')">
          <span class="stat__icon"><AppIcon name="x" :size="16" /></span>
          <div>
            <strong>{{ sCounts.rejected || 0 }}</strong>
            <small>已驳回</small>
          </div>
        </div>
      </div>

      <!-- 筛选签 -->
      <div class="cp__tabs">
        <button
          v-for="t in S_STATUS_TABS"
          :key="t.key"
          class="cp__tab"
          :class="{ 'is-on': sStatus === t.key }"
          @click="switchSampleStatus(t.key)"
        >
          {{ t.label }}
          <i v-if="t.key !== 'all' && sCounts[t.key]">{{ sCounts[t.key] }}</i>
        </button>
      </div>

      <div v-if="sLoading" class="cp__empty">正在加载…</div>

      <div v-else-if="!sFiltered.length" class="cp__empty cp__empty--art">
        <EmptyState
          variant="sample"
          :title="`当前没有${S_STATUS_TABS.find((t) => t.key === sStatus)?.label}的病害样本`"
          desc="农户在「我的种植档案 · 提交病害样本」提交后，会出现在这里等待核验"
        />
      </div>

      <div v-else class="cp__list cp__list--sample">
        <article v-for="s in sFiltered" :key="s.id" class="sub-card sm-card">
          <div class="sm-card__thumbs">
            <img v-for="(img, i) in s.images.slice(0, 3)" :key="i" :src="img" alt="样本" @click="sImgView = img" />
          </div>
          <div class="sub-card__body">
            <div class="sub-card__top">
              <h3>🌿 {{ s.cropName }}</h3>
              <span
                class="sub-card__status"
                :style="{ color: S_STATUS_META[s.status].color, background: S_STATUS_META[s.status].bg }"
              >
                {{ S_STATUS_META[s.status].label }}
              </span>
            </div>
            <p class="sm-card__desc">{{ s.description }}</p>
            <div class="sub-card__meta">
              <span><AppIcon name="user" :size="11" /> {{ s.userName }}</span>
              <span v-if="s.altitude"><AppIcon name="mountain" :size="11" /> 海拔 {{ s.altitude }}</span>
              <span v-if="s.weather"><AppIcon name="clock" :size="11" /> {{ s.weather }}</span>
              <span>{{ fmt(s.createdAt) }}</span>
            </div>
            <p v-if="s.status === 'approved' && s.diseaseName" class="sub-card__note">
              <AppIcon name="check" :size="11" /> 确诊：{{ s.diseaseName }} · 已入库知识库
            </p>
            <p v-if="s.status === 'rejected' && s.note" class="sm-card__reason">
              <AppIcon name="x" :size="11" /> 驳回理由：{{ s.note }}
            </p>
          </div>
          <div class="sub-card__ops">
            <button class="op-btn op-btn--primary" @click="openSample(s)">
              {{ s.status === 'pending' ? '审核' : '查看' }}
            </button>
          </div>
        </article>
      </div>
    </template>

    <!-- 审核抽屉（作物共建） -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="active" class="rv-mask" @click.self="active = null">
          <div class="rv">
            <header class="rv__head">
              <div class="rv__title">
                <CropEmoji class="rv__emoji" :emoji="active.emoji" :name="active.name" :size="40" />
                <div>
                  <h2>{{ active.name }}</h2>
                  <p>{{ active.province }} · {{ active.submitter }}</p>
                </div>
              </div>
              <button class="rv__close" @click="active = null"><AppIcon name="x" :size="15" /></button>
            </header>

            <div class="rv__body">
              <div class="rv__grid">
                <div><small>别名 / 品种</small><strong>{{ active.alias || '—' }}</strong></div>
                <div><small>适宜海拔</small><strong>{{ active.altitude || '—' }}</strong></div>
                <div><small>采收期</small><strong>{{ active.season || '—' }}</strong></div>
                <div><small>联系方式</small><strong>{{ active.contact || '—' }}</strong></div>
              </div>

              <h4>作物简介</h4>
              <p class="rv__text">{{ active.desc }}</p>

              <h4>主要病虫害</h4>
              <p class="rv__text">{{ active.pests || '未填写' }}</p>

              <h4>审核意见</h4>
              <textarea
                v-model="note"
                class="rv__textarea"
                rows="3"
                maxlength="120"
                placeholder="填写审核说明，通过后将随作物一同展示"
              />
              <ul class="rv__checklist">
                <li>作物名称是否规范、无歧义</li>
                <li>适宜海拔与采收期是否与当地气候相符</li>
                <li>病虫害描述是否具备诊断参考价值</li>
              </ul>
            </div>

            <footer class="rv__footer">
              <button class="rv__btn rv__btn--reject" :disabled="busy" @click="review('rejected')">
                驳回
              </button>
              <button class="rv__btn rv__btn--pass" :disabled="busy" @click="review('approved')">
                <AppIcon name="check" :size="15" /> 通过并收录
              </button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>
    <!-- 🌱 样本审核抽屉 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="sActive" class="rv-mask" @click.self="sActive = null">
          <div class="rv">
            <header class="rv__head">
              <div class="rv__title">
                <span class="rv__emoji rv__emoji--txt">🌿</span>
                <div>
                  <h2>{{ sActive.cropName }} 病害样本</h2>
                  <p>#SP{{ String(sActive.id).padStart(4, '0') }} · {{ sActive.userName }} 提交于 {{ fmt(sActive.createdAt) }}</p>
                </div>
              </div>
              <button class="rv__close" @click="sActive = null"><AppIcon name="x" :size="15" /></button>
            </header>

            <div class="rv__body">
              <div class="rv__grid">
                <div><small>作物</small><strong>{{ sActive.cropName }}</strong></div>
                <div><small>提交农户</small><strong>{{ sActive.userName }}</strong></div>
                <div v-if="sActive.altitude"><small>海拔</small><strong>{{ sActive.altitude }}</strong></div>
                <div v-if="sActive.weather"><small>天气</small><strong>{{ sActive.weather }}</strong></div>
              </div>

              <h4>样本图片（点击放大）</h4>
              <div class="rv__imgs">
                <img v-for="(img, i) in sActive.images" :key="i" :src="img" alt="样本图片" @click="sImgView = img" />
              </div>

              <h4>病害现象描述</h4>
              <p class="rv__text">{{ sActive.description }}</p>

              <!-- 待审核：填写审核结论 -->
              <template v-if="sActive.status === 'pending'">
                <h4>确诊病害名称 <i class="rv__req">*必填，通过后作为知识库条目名</i></h4>
                <input
                  v-model="sDiseaseName"
                  class="rv__input"
                  maxlength="40"
                  placeholder="如：三七黑斑病、褐斑病（疑似）"
                />
                <div class="rv__row2">
                  <div>
                    <h4>病害类型</h4>
                    <select v-model="sDiseaseType" class="rv__input">
                      <option>真菌病害</option>
                      <option>细菌病害</option>
                      <option>病毒病害</option>
                      <option>虫害</option>
                      <option>生理性病害</option>
                      <option>社区共建样本</option>
                    </select>
                  </div>
                  <div>
                    <h4>防治建议（选填）</h4>
                    <input v-model="sTreatment" class="rv__input" maxlength="300" placeholder="入库后随条目展示" />
                  </div>
                </div>
                <h4>审核意见</h4>
                <textarea
                  v-model="sNote"
                  class="rv__textarea"
                  rows="3"
                  maxlength="300"
                  placeholder="通过时可填写收录说明；驳回时此处为驳回理由（必填）"
                />
                <ul class="rv__checklist">
                  <li>样本照片是否为该作物真实发病部位</li>
                  <li>症状描述与照片是否吻合、可支撑病害定名</li>
                  <li>驳回时必须写明理由，便于农户修改后重新提交</li>
                </ul>
              </template>

              <!-- 已审核：展示结论 -->
              <template v-else>
                <h4>审核结论</h4>
                <p class="rv__text">
                  <b :style="{ color: S_STATUS_META[sActive.status].color }">
                    {{ S_STATUS_META[sActive.status].label }}
                  </b>
                  <template v-if="sActive.diseaseName"> · 确诊为「{{ sActive.diseaseName }}」（{{ sActive.diseaseType }}）</template>
                </p>
                <p v-if="sActive.treatment" class="rv__text">防治建议：{{ sActive.treatment }}</p>
                <p class="rv__text">{{ sActive.status === 'approved' ? '收录说明：' : '驳回理由：' }}{{ sActive.note || '—' }}</p>
                <p class="rv__meta">审核专家：{{ sActive.reviewer }} · {{ fmt(sActive.reviewedAt) }}</p>
              </template>
            </div>

            <footer v-if="sActive.status === 'pending'" class="rv__footer">
              <button class="rv__btn rv__btn--reject" :disabled="sBusy" @click="reviewSample('rejected')">
                驳回
              </button>
              <button class="rv__btn rv__btn--pass" :disabled="sBusy" @click="reviewSample('approved')">
                <AppIcon name="check" :size="15" /> 通过并入库
              </button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 图片放大查看 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="sImgView" class="img-view" @click="sImgView = ''">
          <img :src="sImgView" alt="样本大图" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.cp {
  padding: 26px 34px 64px;
}

/* 页头横幅 */
.cp__hero {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 30px 32px;
  border-radius: var(--r-lg);
  background:
    radial-gradient(120% 180% at 100% 0%, rgba(255, 255, 255, 0.14), transparent 55%),
    linear-gradient(120deg, #14532d, #1a7f45 70%, #2f9e5f);
  color: #fff;
  margin-bottom: 16px;
}

.cp__hero::after {
  content: '';
  position: absolute;
  right: -40px;
  bottom: -70px;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

.cp__hero h1 {
  font-size: 25px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.cp__hero p {
  font-size: 14px;
  opacity: 0.85;
  margin-top: 7px;
  max-width: 640px;
  line-height: 1.65;
}

.cp__hero-badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 20px;
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(4px);
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
  transition: background var(--dur-fast), transform var(--dur-fast);
}

.cp__hero-badge:hover {
  background: rgba(255, 255, 255, 0.28);
  transform: translateX(2px);
}

/* 统计卡 */
.cp__stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
  margin-bottom: 18px;
}

.stat {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 22px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  cursor: pointer;
  transition: transform var(--dur-fast), box-shadow var(--dur-fast), opacity var(--dur-fast);
}

.stat:hover {
  transform: translateY(-2px);
  box-shadow: var(--sh-sm);
}

.stat.is-dim {
  opacity: 0.55;
}

.stat__icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.stat--amber .stat__icon { background: #fdf3e7; color: #b57a17; }
.stat--green .stat__icon { background: #e8f7ee; color: #1a7f45; }
.stat--red .stat__icon { background: #fdeceb; color: #b4342f; }

.stat strong {
  display: block;
  font-size: 26px;
  font-weight: 800;
  line-height: 1.15;
  color: var(--c-text-1);
}

.stat small {
  font-size: 12.5px;
  color: var(--c-text-4);
}

/* 筛选签 */
.cp__tabs {
  display: flex;
  gap: 9px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.cp__tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 19px;
  border-radius: var(--r-full);
  font-size: 14px;
  font-weight: 700;
  color: var(--c-text-3);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  transition: all var(--dur-fast);
}

.cp__tab i {
  font-style: normal;
  font-size: 11.5px;
  font-weight: 800;
  padding: 1px 8px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  color: var(--c-text-3);
}

.cp__tab.is-on {
  background: var(--c-primary-600);
  border-color: var(--c-primary-600);
  color: #fff;
}

.cp__tab.is-on i {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}

.cp__empty {
  padding: 72px 20px;
  text-align: center;
  color: var(--c-text-4);
  font-size: 14px;
  background: var(--c-bg-card);
  border-radius: var(--r-md);
  border: 1px dashed var(--c-line);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
}

.cp__empty-icon {
  font-size: 52px;
  line-height: 1;
  margin-bottom: 2px;
}

.cp__empty p {
  font-weight: 700;
  color: var(--c-text-2);
}

.cp__empty small {
  font-size: 12.5px;
  color: var(--c-text-4);
}

.cp__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
  gap: 14px;
}

.cp__list .sub-card {
  flex-direction: column;
  gap: 12px;
}

.cp__list .sub-card__ops {
  width: 100%;
  justify-content: flex-end;
  border-top: 1px dashed var(--c-line-soft);
  padding-top: 10px;
}

.sub-card {
  display: flex;
  gap: 14px;
  padding: 18px 20px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
  transition: box-shadow var(--dur-fast);
}

.sub-card:hover {
  box-shadow: var(--sh-sm);
}

.sub-card__left {
  flex-shrink: 0;
}

.sub-card__emoji {
  width: 52px;
  height: 52px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  font-size: 27px;
  background: var(--c-primary-50);
}

.sub-card__body {
  flex: 1;
  min-width: 0;
}

.sub-card__top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub-card__top h3 {
  font-size: 16.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.sub-card__status {
  font-size: 12.5px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: var(--r-full);
}

.sub-card__alias {
  font-size: 12px;
  color: var(--c-text-4);
  margin-top: 2px;
}

.sub-card__desc {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--c-text-2);
  margin: 7px 0 9px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sub-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 13px;
  font-size: 12px;
  color: var(--c-text-4);
}

.sub-card__meta span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.sub-card__note {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--c-accent-600);
  background: var(--c-accent-100);
  padding: 6px 9px;
  border-radius: var(--r-sm);
}

.sub-card__ops {
  display: flex;
  align-items: center;
}

.op-btn {
  padding: 9px 19px;
  border-radius: var(--r-full);
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.op-btn--primary {
  background: var(--c-primary-600);
  color: #fff;
}

/* 审核抽屉 */
.rv-mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(16, 30, 22, 0.44);
  backdrop-filter: blur(3px);
  display: flex;
  justify-content: flex-end;
}

.rv {
  width: min(460px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-card);
  box-shadow: -20px 0 50px rgba(0, 0, 0, 0.18);
}

.rv__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--c-line-soft);
}

.rv__title {
  display: flex;
  gap: 11px;
  align-items: center;
}

.rv__emoji {
  width: 44px;
  height: 44px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  font-size: 22px;
  background: var(--c-primary-50);
}

.rv__title h2 {
  font-size: 16.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.rv__title p {
  font-size: 11.5px;
  color: var(--c-text-4);
  margin-top: 2px;
}

.rv__close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
}

.rv__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.rv__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}

.rv__grid > div {
  padding: 9px 11px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
}

.rv__grid small {
  display: block;
  font-size: 11.5px;
  color: var(--c-text-4);
  margin-bottom: 2px;
}

.rv__grid strong {
  font-size: 12px;
  color: var(--c-text-1);
  font-weight: 700;
}

.rv__body h4 {
  font-size: 12px;
  font-weight: 800;
  color: var(--c-text-2);
  margin: 14px 0 6px;
}

.rv__text {
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--c-text-2);
}

.rv__textarea {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-subtle);
  font-size: 12.5px;
  line-height: 1.6;
  resize: none;
}

.rv__textarea:focus {
  border-color: var(--c-primary-400);
  background: #fff;
}

.rv__checklist {
  margin-top: 12px;
  padding: 11px 13px;
  border-radius: var(--r-sm);
  background: var(--c-primary-50);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.rv__checklist li {
  font-size: 11.5px;
  color: var(--c-primary-700);
  padding-left: 14px;
  position: relative;
  line-height: 1.5;
}

.rv__checklist li::before {
  content: '✓';
  position: absolute;
  left: 0;
  font-weight: 800;
  font-size: 11.5px;
}

.rv__footer {
  display: flex;
  gap: 10px;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--c-line-soft);
}

.rv__btn {
  flex: 1;
  height: 44px;
  border-radius: var(--r-full);
  font-size: 13.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.rv__btn--reject {
  flex: 0 0 110px;
  background: var(--c-bg-muted);
  color: var(--c-danger);
}

.rv__btn--pass {
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  color: #fff;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s var(--ease-out);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.fade-enter-active .rv,
.fade-leave-active .rv {
  transition: transform 0.28s var(--ease-out);
}
.fade-enter-from .rv,
.fade-leave-to .rv {
  transform: translateX(100%);
}

/* ===== 模式切换 ===== */
.mode-switch {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 10px 22px;
  border-radius: var(--r-full);
  font-size: 14px;
  font-weight: 700;
  color: var(--c-text-3);
  background: var(--c-bg-card);
  border: 1.5px solid var(--c-line-soft);
  transition: all var(--dur-fast);
}

.mode-btn.is-on {
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  border-color: transparent;
  color: #fff;
  box-shadow: 0 4px 12px rgba(47, 152, 104, 0.3);
}

.mode-btn i {
  font-style: normal;
  min-width: 17px;
  height: 17px;
  padding: 0 5px;
  border-radius: var(--r-full);
  font-size: 11.5px;
  font-weight: 800;
  display: grid;
  place-items: center;
  background: var(--c-bg-muted);
  color: var(--c-text-3);
}

.mode-btn.is-on i {
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
}

/* ===== 病害样本列表 ===== */
.cp__hero--sample {
  background:
    radial-gradient(120% 180% at 100% 0%, rgba(255, 255, 255, 0.14), transparent 55%),
    linear-gradient(120deg, #0e5a3c, #178a56 70%, #2fae70);
}

.cp__list--sample {
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
}

.sm-card {
  flex-direction: column;
  gap: 11px;
}

.sm-card__thumbs {
  display: flex;
  gap: 7px;
}

.sm-card__thumbs img {
  width: 74px;
  height: 74px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--c-line-soft);
  cursor: zoom-in;
  transition: transform var(--dur-fast);
}

.sm-card__thumbs img:hover {
  transform: scale(1.04);
}

.sm-card__desc {
  font-size: 13px;
  line-height: 1.7;
  color: var(--c-text-2);
  margin: 6px 0 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sm-card__reason {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
  font-size: 11.5px;
  color: var(--c-danger);
  background: var(--c-danger-bg, #fdeceb);
  padding: 6px 9px;
  border-radius: var(--r-sm);
}

.sm-card .sub-card__ops {
  width: 100%;
  justify-content: flex-end;
  border-top: 1px dashed var(--c-line-soft);
  padding-top: 10px;
}

/* ===== 样本审核抽屉扩展 ===== */
.rv__emoji--txt {
  font-size: 22px;
}

.rv__imgs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}

.rv__imgs img {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--c-line-soft);
  cursor: zoom-in;
}

.rv__req {
  font-style: normal;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--c-danger);
  margin-left: 6px;
}

.rv__input {
  width: 100%;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-subtle);
  font-size: 12.5px;
  transition: border-color var(--dur-fast);
}

.rv__input:focus {
  border-color: var(--c-primary-400);
  background: #fff;
  outline: none;
}

.rv__row2 {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 10px;
}

.rv__meta {
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--c-text-4);
}

/* 图片放大查看 */
.img-view {
  position: fixed;
  inset: 0;
  z-index: 400;
  background: rgba(0, 0, 0, 0.82);
  display: grid;
  place-items: center;
  cursor: zoom-out;
  padding: 30px;
}

.img-view img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 12px;
  object-fit: contain;
}

@media (max-width: 720px) {
  .cp {
    padding: 16px 14px 50px;
  }
  .cp__hero {
    flex-direction: column;
    align-items: flex-start;
    padding: 20px 18px;
  }
  .cp__stats {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .stat {
    padding: 10px 12px;
    gap: 8px;
  }
  .stat__icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
  }
  .stat strong {
    font-size: 16px;
  }
  .sub-card {
    flex-wrap: wrap;
  }
  .cp__list {
    grid-template-columns: 1fr;
  }
  .sub-card__ops {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
