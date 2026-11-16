<script setup lang="ts">
/** 专家端：人工复核队列 + 农户咨询队列，处理意见自动私信农户 */
import { ref, onMounted, computed } from 'vue'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import EmptyState from '@/components/EmptyState.vue'
import { useAppStore } from '@/stores/app'
import type { ReviewRequest, Consult } from '@/types'

const store = useAppStore()
const tab = ref<'review' | 'consult'>('review')
const reviews = ref<ReviewRequest[]>([])
const consults = ref<Consult[]>([])
const loading = ref(true)

/* 处理弹层 */
const target = ref<ReviewRequest | Consult | null>(null)
const kind = ref<'review' | 'consult'>('review')
const opinion = ref('')
const sending = ref(false)
const done = ref(false)

/* 只读详情弹层（工单/咨询均可点击查看） */
const detail = ref<ReviewRequest | Consult | null>(null)
const detailKind = ref<'review' | 'consult'>('review')
const openDetail = (kindIn: 'review' | 'consult', item: ReviewRequest | Consult) => {
  detailKind.value = kindIn
  detail.value = item
}
const removeConsult = async (c: Consult) => {
  if (!confirm(`确定删除「${c.userName}」的这条咨询吗？`)) return
  try {
    await api.deleteConsult(c.id)
    store.showToast('咨询已删除', 'success')
    consults.value = consults.value.filter((x) => x.id !== c.id)
  } catch (e: any) {
    store.showToast(e?.message || '删除失败', 'error')
  }
}

const pendingReviews = computed(() => reviews.value.filter((r) => r.status === 'pending'))
const pendingConsults = computed(() => consults.value.filter((c) => c.status === 'pending'))

/**
 * 复核请求按「当前专家擅长领域对口」优先排序：
 * 请求携带 cropId，与当前登录专家的 specialty 匹配的排到最前并标记「对口」
 */
const currentSpecialty = computed(() => (store.user as any)?.specialty || [])

const cropNameOf = (cropId?: string | null) => {
  const c = store.crops.find((x) => x.id === cropId)
  return c?.name || cropId || ''
}

const isMatchedExpert = (r: ReviewRequest) => {
  const crop = cropNameOf(r.cropId)
  if (!crop) return false
  return currentSpecialty.value.some((s: string) => crop.includes(s) || s.includes(crop))
}

const sortedReviews = computed(() => {
  const list = [...reviews.value]
  return list.sort((a, b) => {
    const am = isMatchedExpert(a) ? 1 : 0
    const bm = isMatchedExpert(b) ? 1 : 0
    if (am !== bm) return bm - am
    // 同级时待复核优先，再按时间倒序
    if ((a.status === 'pending') !== (b.status === 'pending')) return a.status === 'pending' ? -1 : 1
    return a.createdAt < b.createdAt ? 1 : -1
  })
})

/* 复核工单处理：最终确诊病害下拉 + 确认/驳回 */
const decision = ref<'confirm' | 'reject'>('confirm')
const finalDisease = ref('')
const diseaseOptions = ref<{ id: string; name: string }[]>([])

const openHandle = async (kindIn: 'review' | 'consult', item: ReviewRequest | Consult) => {
  kind.value = kindIn
  target.value = item
  opinion.value = ''
  done.value = false
  decision.value = 'confirm'
  finalDisease.value = ''
  diseaseOptions.value = []
  if (kindIn === 'review') {
    const r = item as ReviewRequest
    finalDisease.value = r.aiDisease || ''
    if (r.cropId) {
      try {
        diseaseOptions.value = await api.diseases(r.cropId)
      } catch {
        /* 病害列表加载失败时仍可手填 */
      }
    }
  }
}
const closeHandle = () => {
  target.value = null
}

/** 删除复核工单（已复核的队列清理） */
const removeHandle = async (r: ReviewRequest) => {
  if (!window.confirm(`确定删除工单 #TK${String(r.id).padStart(4, '0')} 吗？删除后不可恢复。`)) return
  try {
    await api.deleteReviewRequest(r.id)
    reviews.value = reviews.value.filter((x) => x.id !== r.id)
    store.showToast('工单已删除', 'success')
  } catch (e: any) {
    store.showToast(e?.message || '删除失败', 'error')
  }
}

/** ESC 关闭处理弹窗 */
const onEscKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && target.value) closeHandle()
}
window.addEventListener('keydown', onEscKey)

const fmt = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 复核请求的默认意见模板 */
const fillTemplate = (item: ReviewRequest) => {
  opinion.value = `复核意见：\n1. 结合您上传的照片与描述，诊断方向基本正确。\n2. 建议先按当前防治方案处理，3 天后观察病斑是否扩散。\n3. 若持续恶化，请重新拍照（含病斑特写与整株）并再次申请复核。`
}

const submitHandle = async () => {
  if (!target.value || !opinion.value.trim() || sending.value) return
  if (kind.value === 'review' && decision.value === 'confirm' && !finalDisease.value.trim()) {
    store.showToast('请选择最终确诊病害', 'error')
    return
  }
  sending.value = true
  try {
    if (kind.value === 'review') {
      const res = await api.resolveReviewRequest(target.value.id, {
        opinion: opinion.value.trim(),
        decision: decision.value,
        finalDisease: decision.value === 'confirm' ? finalDisease.value.trim() : undefined
      })
      // 更新为已处理状态（列表保留，徽章变「已复核」）
      const idx = reviews.value.findIndex((r) => r.id === target.value!.id)
      if (idx >= 0) reviews.value[idx] = res.item
    } else {
      const c = target.value as Consult
      // 咨询处理 = 直接回复农户消息
      await api.sendMessage({
        userId: c.userId,
        title: `回复：${c.question.slice(0, 24)}`.slice(0, 60),
        content: opinion.value.trim()
      })
      await api.closeConsult(c.id, opinion.value.trim())
      consults.value = consults.value.filter((x) => x.id !== c.id)
    }
    done.value = true
    store.showToast('处理完成，结果已私信农户', 'success')
  } catch (e: any) {
    store.showToast(e?.message || '操作失败', 'error')
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  try {
    const [a, b] = await Promise.all([api.reviewRequests(), api.consults()])
    reviews.value = a.items
    consults.value = b.items
  } catch (e: any) {
    store.showToast(e?.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="rv">
    <header class="rv__head">
      <div class="rv__tabs">
        <button :class="{ 'is-on': tab === 'review' }" @click="tab = 'review'">
          复核请求 <i v-if="pendingReviews.length">{{ pendingReviews.length }}</i>
        </button>
        <button :class="{ 'is-on': tab === 'consult' }" @click="tab = 'consult'">
          农户咨询 <i v-if="pendingConsults.length">{{ pendingConsults.length }}</i>
        </button>
      </div>
    </header>

    <div v-if="loading" class="rv__empty">正在加载…</div>

    <template v-else-if="tab === 'review'">
      <div v-if="!reviews.length" class="rv__empty">
        <EmptyState
          variant="review"
          title="暂无待处理复核工单 🎉"
          desc="农户低置信诊断提交复核后会出现在这里，处理完可稍作休息"
        />
      </div>
      <div v-for="r in sortedReviews" :key="r.id" class="rv-card" :class="{ 'is-done': r.status === 'done' }">
        <div class="rv-card__top">
          <span class="rv-card__badge" :class="r.status">
            {{ r.status === 'pending' ? '待复核' : '已复核' }}
          </span>
          <strong class="rv-card__title">
            工单 #TK{{ String(r.id).padStart(4, '0') }}
            <small>{{ r.userName }} · {{ r.region || '未填地区' }}<template v-if="r.cropId"> · {{ cropNameOf(r.cropId) }}</template></small>
          </strong>
          <small class="rv-card__time">{{ fmt(r.createdAt) }}</small>
        </div>
        <div v-if="r.image || r.aiDisease" class="rv-card__case">
          <img v-if="r.image" :src="r.image" alt="农户上报照片" class="rv-card__thumb" />
          <div class="rv-card__caseinfo">
            <p><b>AI 初步诊断</b>{{ r.aiDisease || '—' }}</p>
            <p v-if="r.aiConfidence != null">
              <b>AI 置信度</b>
              <span class="rv-card__conf" :class="{ 'is-low': r.aiConfidence < 0.85 }">
                {{ Math.round(r.aiConfidence * 100) }}%
              </span>
            </p>
          </div>
        </div>
        <span v-if="isMatchedExpert(r) && r.status === 'pending'" class="rv-card__match">
          <AppIcon name="check" :size="11" /> 与您擅长领域对口，建议优先处理
        </span>
        <p v-if="r.question" class="rv-card__q">补充说明：{{ r.question }}</p>
        <p v-if="r.opinion" class="rv-card__opinion">
          复核意见：{{ r.opinion }}
          <template v-if="r.finalDisease"><br />最终诊断结论：{{ r.finalDisease }}</template>
        </p>
        <div class="rv-card__ops">
          <button class="rv-card__btn rv-card__btn--ghost" @click="openDetail('review', r)">
            <AppIcon name="search" :size="13" /> 查看详情
          </button>
          <button v-if="r.status === 'pending'" class="rv-card__btn" @click="openHandle('review', r)">
            <AppIcon name="check" :size="13" /> 去处理
          </button>
          <template v-else>
            <button class="rv-card__btn rv-card__btn--ghost" @click="openHandle('review', r)">
              <AppIcon name="edit" :size="13" /> 重新复核
            </button>
          </template>
          <button class="rv-card__btn rv-card__btn--danger" @click="removeHandle(r)">
            <AppIcon name="trash" :size="13" /> 删除
          </button>
        </div>
      </div>
    </template>

    <template v-else>
      <div v-if="!consults.length" class="rv__empty">
        <AppIcon name="chat" :size="26" />
        <p>暂无农户咨询<br />农户在「向专家提问」页发起咨询后会出现在这里</p>
      </div>
      <div v-for="c in consults" :key="c.id" class="rv-card" :class="{ 'is-done': c.status === 'done' }">
        <div class="rv-card__top" @click="openDetail('consult', c)">
          <span class="rv-card__badge" :class="c.status">
            {{ c.status === 'pending' ? '待回复' : '已回复' }}
          </span>
          <strong class="rv-card__title">
            {{ c.userName }} 的咨询
            <small>{{ cropNameOf(c.cropId) || '' }} {{ c.region ? '· ' + c.region : '' }}</small>
          </strong>
          <small class="rv-card__time">{{ fmt(c.createdAt) }}</small>
        </div>
        <p class="rv-card__q" @click="openDetail('consult', c)">{{ c.question }}</p>
        <p v-if="c.reply" class="rv-card__opinion">已回复：{{ c.reply }}</p>
        <div class="rv-card__ops">
          <button class="rv-card__btn rv-card__btn--ghost" @click="openDetail('consult', c)">
            <AppIcon name="search" :size="13" /> 查看详情
          </button>
          <button v-if="c.status === 'pending'" class="rv-card__btn" @click="openHandle('consult', c)">
            <AppIcon name="chat" :size="13" /> 回复农户
          </button>
          <button class="rv-card__btn rv-card__btn--danger" @click="removeConsult(c)">
            <AppIcon name="trash" :size="13" /> 删除
          </button>
        </div>
      </div>
    </template>

    <!-- 处理弹层 -->
    <Teleport to="body">
      <Transition name="rv-fade">
        <div v-if="target" class="rv-mask" @click.self="closeHandle">
          <div class="rv-dialog">
            <header class="rv-dialog__head">
              <strong>{{ kind === 'review' ? '填写复核意见' : '回复农户咨询' }}</strong>
              <button class="rv-dialog__close" @click="closeHandle"><AppIcon name="x" :size="14" /></button>
            </header>

            <template v-if="!done">
              <!-- 复核工单：回显原图 + AI 结论 + 置信度 -->
              <div v-if="kind === 'review'" class="rv-dialog__case">
                <img
                  v-if="(target as ReviewRequest).image"
                  :src="(target as ReviewRequest).image"
                  alt="农户上报原图"
                  class="rv-dialog__img"
                />
                <div class="rv-dialog__ai">
                  <p><b>农户</b>{{ target.userName }}</p>
                  <p><b>AI 初步诊断</b>{{ (target as ReviewRequest).aiDisease || '—' }}</p>
                  <p v-if="(target as ReviewRequest).aiConfidence != null">
                    <b>AI 置信度</b>
                    <span class="rv-card__conf" :class="{ 'is-low': (target as ReviewRequest).aiConfidence! < 0.85 }">
                      {{ Math.round((target as ReviewRequest).aiConfidence! * 100) }}%
                    </span>
                  </p>
                </div>
              </div>

              <p class="rv-dialog__q">
                {{ target.userName }}：{{ (target as ReviewRequest).question || (target as Consult).question || '（无补充说明）' }}
              </p>
              <button
                v-if="kind === 'review'"
                class="rv-dialog__tpl"
                @click="fillTemplate(target as ReviewRequest)"
              >
                填入常用复核模板
              </button>
              <textarea
                v-model="opinion"
                class="rv-dialog__input"
                rows="6"
                maxlength="600"
                :placeholder="kind === 'review' ? '填写复核意见（必填）：防治建议、用药指导、注意事项等…' : '填写防治建议、用药指导、注意事项等，提交后自动私信给农户…'"
              />

              <!-- 复核工单：最终确诊病害下拉 + 确认/驳回 -->
              <template v-if="kind === 'review'">
                <label class="rv-dialog__field">
                  <span>最终确诊病害（确认诊断时必选）</span>
                  <select
                    v-model="finalDisease"
                    class="rv-dialog__select"
                    :disabled="decision === 'reject'"
                  >
                    <option value="" disabled>请选择病害…</option>
                    <option v-if="!diseaseOptions.length" :value="finalDisease">{{ finalDisease || '（该作物暂无病害列表）' }}</option>
                    <option v-for="d in diseaseOptions" :key="d.id" :value="d.name">{{ d.name }}</option>
                    <option v-if="diseaseOptions.length && finalDisease && !diseaseOptions.some((d) => d.name === finalDisease)" :value="finalDisease">{{ finalDisease }}（AI 初诊）</option>
                  </select>
                </label>

                <div class="rv-dialog__btns">
                  <button
                    class="rv-dialog__btn rv-dialog__btn--confirm"
                    :disabled="!opinion.trim() || !finalDisease.trim() || sending"
                    @click="decision = 'confirm'; submitHandle()"
                  >
                    {{ sending && decision === 'confirm' ? '提交中…' : '✅ 确认诊断' }}
                  </button>
                  <button
                    class="rv-dialog__btn rv-dialog__btn--reject"
                    :disabled="!opinion.trim() || sending"
                    @click="decision = 'reject'; submitHandle()"
                  >
                    {{ sending && decision === 'reject' ? '提交中…' : '⚠️ 驳回' }}
                  </button>
                </div>
                <small class="rv-dialog__reject-tip">驳回适用于样本质量差、无法判断的情况，将建议农户重新拍照</small>
              </template>

              <button
                v-else
                class="rv-dialog__btn"
                :disabled="!opinion.trim() || sending"
                @click="submitHandle"
              >
                {{ sending ? '提交中…' : '提交并发送给农户' }}
              </button>
            </template>

            <div v-else class="rv-dialog__done">
              <AppIcon name="check-circle" :size="30" />
              <p>{{ kind === 'review' ? '工单处理完成，结果已通知农户' : '已完成，结果已私信农户' }}</p>
              <button class="rv-dialog__btn rv-dialog__btn--close" @click="closeHandle">关闭</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 只读详情弹层 -->
    <Teleport to="body">
      <Transition name="rv-fade">
        <div v-if="detail" class="rv-mask" @click.self="detail = null">
          <div class="rv-dialog">
            <header class="rv-dialog__head">
              <strong>{{ detailKind === 'review' ? '复核工单详情' : '农户咨询详情' }}</strong>
              <button class="rv-dialog__close" @click="detail = null"><AppIcon name="x" :size="14" /></button>
            </header>
            <template v-if="detailKind === 'review'">
              <div class="rv-dialog__case">
                <img
                  v-if="(detail as ReviewRequest).image"
                  :src="(detail as ReviewRequest).image"
                  alt="农户上报原图"
                  class="rv-dialog__img"
                />
                <div class="rv-dialog__ai">
                  <p><b>农户</b>{{ detail.userName }}{{ (detail as ReviewRequest).region ? ' · ' + (detail as ReviewRequest).region : '' }}</p>
                  <p><b>作物</b>{{ cropNameOf((detail as ReviewRequest).cropId) || '—' }}</p>
                  <p><b>AI 初步诊断</b>{{ (detail as ReviewRequest).aiDisease || '—' }}</p>
                  <p v-if="(detail as ReviewRequest).aiConfidence != null">
                    <b>AI 置信度</b>
                    <span class="rv-card__conf" :class="{ 'is-low': (detail as ReviewRequest).aiConfidence! < 0.85 }">
                      {{ Math.round((detail as ReviewRequest).aiConfidence! * 100) }}%
                    </span>
                  </p>
                </div>
              </div>
              <p v-if="(detail as ReviewRequest).question" class="rv-dialog__q">农户补充：{{ (detail as ReviewRequest).question }}</p>
              <p v-if="(detail as ReviewRequest).opinion" class="rv-dialog__q rv-dialog__q--reply">复核意见：{{ (detail as ReviewRequest).opinion }}</p>
              <p v-if="(detail as ReviewRequest).finalDisease" class="rv-dialog__q rv-dialog__q--reply">最终诊断结论：{{ (detail as ReviewRequest).finalDisease }}</p>
            </template>
            <template v-else>
              <div class="rv-dialog__ai">
                <p><b>农户</b>{{ detail.userName }}{{ (detail as Consult).region ? ' · ' + (detail as Consult).region : '' }}</p>
                <p><b>作物</b>{{ cropNameOf((detail as Consult).cropId) || '—' }}</p>
                <p><b>状态</b>{{ (detail as Consult).status === 'pending' ? '待回复' : '已回复' }}</p>
              </div>
              <p class="rv-dialog__q">咨询内容：{{ (detail as Consult).question || '（无）' }}</p>
              <p v-if="(detail as Consult).reply" class="rv-dialog__q rv-dialog__q--reply">专家回复：{{ (detail as Consult).reply }}</p>
            </template>
            <div class="rv-dialog__btns">
              <button class="rv-dialog__btn rv-dialog__btn--ghost" @click="detail = null">关闭</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.rv {
  padding: 4px 0 40px;
}

.rv__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}


.rv__tabs {
  display: flex;
  gap: 6px;
}

.rv__tabs button {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 14px;
  border-radius: var(--r-full);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-text-2);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
}

.rv__tabs button.is-on {
  color: #fff;
  background: var(--c-primary-600);
  border-color: var(--c-primary-600);
}

.rv__tabs i {
  font-style: normal;
  font-size: 11.5px;
  font-weight: 800;
  min-width: 17px;
  height: 17px;
  border-radius: var(--r-full);
  display: grid;
  place-items: center;
  background: var(--c-danger);
  color: #fff;
}

.rv__tabs button.is-on i {
  background: #fff;
  color: var(--c-danger);
}

.rv__empty {
  padding: 56px 20px;
  text-align: center;
  color: var(--c-text-4);
  font-size: 12.5px;
  line-height: 1.9;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.rv__empty-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--c-text-2);
}

.rv__empty small {
  font-size: 11.5px;
  color: var(--c-text-4);
}

/* 队列卡片 */
.rv-card {
  padding: 14px 15px;
  margin-bottom: 10px;
  border-radius: 14px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
}

.rv-card.is-done {
  opacity: 0.72;
}

.rv-card__match {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  color: #1a7f45;
  background: #e8f7ee;
  border: 1px solid #c8ead4;
}

.rv-card__top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rv-card__badge {
  font-size: 11.5px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--r-full);
  flex-shrink: 0;
  letter-spacing: 0.5px;
}

.rv-card__badge.pending {
  background: var(--c-danger);
  color: #fff;
}

.rv-card__badge.done {
  background: var(--c-bg-muted);
  color: var(--c-text-4);
}

.rv-card__title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--c-text-1);
  display: flex;
  align-items: baseline;
  gap: 7px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rv-card__title small {
  font-size: 11.5px;
  color: var(--c-text-4);
  font-weight: 400;
}

.rv-card__time {
  font-size: 11.5px;
  color: var(--c-text-4);
  flex-shrink: 0;
}

.rv-card__q {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--c-text-2);
  background: var(--c-bg-muted);
  border-radius: 9px;
  padding: 9px 11px;
}

.rv-card__opinion {
  margin-top: 7px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--c-primary-700);
}

/* 工单病例信息：缩略图 + AI 初诊/置信度 */
.rv-card__case {
  display: flex;
  gap: 10px;
  margin-top: 10px;
  padding: 9px;
  border-radius: 10px;
  background: var(--c-bg-muted);
}

.rv-card__thumb {
  width: 62px;
  height: 62px;
  border-radius: 9px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--c-line-soft);
  cursor: zoom-in;
}

.rv-card__caseinfo {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  justify-content: center;
}

.rv-card__caseinfo p {
  font-size: 12px;
  color: var(--c-text-2);
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.rv-card__caseinfo b {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-4);
  background: var(--c-bg-card);
  border-radius: 5px;
  padding: 1px 7px;
  flex-shrink: 0;
}

.rv-card__conf {
  font-size: 11.5px;
  font-weight: 800;
  color: #15803d;
  background: #dcfce7;
  border-radius: var(--r-full);
  padding: 1px 8px;
}

.rv-card__conf.is-low {
  color: #b45309;
  background: #fef3c7;
}

/* 处理弹窗：病例回显 */
.rv-dialog__case {
  display: flex;
  gap: 12px;
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 12px;
  background: var(--c-bg-muted);
}

.rv-dialog__img {
  width: 110px;
  height: 110px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--c-line-soft);
  cursor: zoom-in;
}

.rv-dialog__ai {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  justify-content: center;
}

.rv-dialog__ai p {
  font-size: 12.5px;
  color: var(--c-text-2);
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.rv-dialog__ai b {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-4);
  background: var(--c-bg-card);
  border-radius: 5px;
  padding: 1px 7px;
  flex-shrink: 0;
}

.rv-dialog__field {
  display: block;
  margin-top: 11px;
}

.rv-dialog__field span {
  display: block;
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-3);
  margin-bottom: 6px;
}

.rv-dialog__select {
  width: 100%;
  height: 40px;
  padding: 0 11px;
  border-radius: 11px;
  border: 1px solid var(--c-line);
  background: var(--c-bg-card);
  font-size: 13px;
  color: var(--c-text-1);
}

.rv-dialog__select:focus {
  outline: none;
  border-color: var(--c-primary-500);
}

.rv-dialog__select:disabled {
  opacity: 0.5;
}

.rv-dialog__btns {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.rv-dialog__btns .rv-dialog__btn {
  margin-top: 0;
}

.rv-dialog__btn--confirm {
  background: var(--c-primary-600);
}

.rv-dialog__btn--reject {
  background: #d97706;
}

.rv-dialog__btn--ghost {
  background: var(--c-bg-muted);
  color: var(--c-text-2);
}

.rv-dialog__q--reply {
  background: var(--c-primary-50, #eaf5ee);
  color: var(--c-primary-700, #256b47);
}

.rv-dialog__btn--reject:disabled {
  opacity: 0.5;
}

.rv-dialog__reject-tip {
  display: block;
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--c-text-4);
  text-align: center;
}

.rv-card__btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 10px;
  height: 30px;
  padding: 0 14px;
  border-radius: var(--r-full);
  font-size: 11.5px;
  font-weight: 700;
  color: #fff;
  background: var(--c-primary-600);
  border: none;
}

/* 已复核工单操作区：重新复核 + 删除 */
.rv-card__ops {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.rv-card__ops .rv-card__btn {
  margin-top: 0;
}

.rv-card__btn--ghost {
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
}

.rv-card__btn--danger {
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
}

.rv-card__btn--danger:hover {
  background: #fee2e2;
}

/* 处理弹层 */
.rv-mask {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(14, 30, 22, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.rv-dialog {
  width: min(520px, 100%);
  background: var(--c-bg-page);
  border-radius: var(--r-xl);
  padding: 18px;
  max-height: 86vh;
  overflow-y: auto;
}

.rv-dialog__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.rv-dialog__head strong {
  font-size: 15.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.rv-dialog__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--c-bg-muted);
  color: var(--c-text-3);
}

.rv-dialog__q {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--c-text-2);
  background: var(--c-bg-muted);
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 10px;
}

.rv-dialog__tpl {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
  border-radius: var(--r-full);
  padding: 4px 12px;
  margin-bottom: 10px;
}

.rv-dialog__input {
  width: 100%;
  padding: 11px 13px;
  border-radius: 12px;
  border: 1px solid var(--c-line);
  background: var(--c-bg-card);
  font-size: 13px;
  line-height: 1.7;
  color: var(--c-text-1);
  resize: vertical;
  font-family: inherit;
}

.rv-dialog__input:focus {
  outline: none;
  border-color: var(--c-primary-500);
}

.rv-dialog__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 40px;
  margin-top: 12px;
  border-radius: var(--r-full);
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: var(--c-primary-600);
  border: none;
}

.rv-dialog__btn:disabled {
  opacity: 0.5;
}

.rv-dialog__done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  padding: 20px 0 8px;
  color: var(--c-primary-600);
  font-size: 14px;
  font-weight: 700;
}

.rv-dialog__btn--close {
  width: auto;
  min-width: 120px;
  padding: 0 24px;
}

.rv-fade-enter-active,
.rv-fade-leave-active {
  transition: opacity 0.2s;
}
.rv-fade-enter-from,
.rv-fade-leave-to {
  opacity: 0;
}
</style>
