<script setup lang="ts">
/** 专家端：人工复核队列 + 农户咨询队列，处理意见自动私信农户 */
import { ref, onMounted, computed } from 'vue'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
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

const pendingReviews = computed(() => reviews.value.filter((r) => r.status === 'pending'))
const pendingConsults = computed(() => consults.value.filter((c) => c.status === 'pending'))

const openHandle = (kindIn: 'review' | 'consult', item: ReviewRequest | Consult) => {
  kind.value = kindIn
  target.value = item
  opinion.value = ''
  done.value = false
}
const closeHandle = () => {
  target.value = null
}

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
  sending.value = true
  try {
    if (kind.value === 'review') {
      await api.resolveReviewRequest(target.value.id, opinion.value.trim())
      reviews.value = reviews.value.filter((r) => r.id !== target.value!.id)
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
      <h2>人工复核</h2>
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
        <AppIcon name="check-circle" :size="26" />
        <p>暂无待复核请求<br />农户在诊断结果页点击「申请人工复核」后会出现在这里</p>
      </div>
      <div v-for="r in reviews" :key="r.id" class="rv-card" :class="{ 'is-done': r.status === 'done' }">
        <div class="rv-card__top">
          <span class="rv-card__badge" :class="r.status">
            {{ r.status === 'pending' ? '待复核' : '已复核' }}
          </span>
          <strong class="rv-card__title">
            诊断记录 #{{ r.recordId }}
            <small>{{ r.userName }} · {{ r.region || '未填地区' }}</small>
          </strong>
          <small class="rv-card__time">{{ fmt(r.createdAt) }}</small>
        </div>
        <p v-if="r.question" class="rv-card__q">补充说明：{{ r.question }}</p>
        <p v-if="r.opinion" class="rv-card__opinion">复核意见：{{ r.opinion }}</p>
        <button v-if="r.status === 'pending'" class="rv-card__btn" @click="openHandle('review', r)">
          <AppIcon name="check" :size="13" /> 开始复核
        </button>
      </div>
    </template>

    <template v-else>
      <div v-if="!consults.length" class="rv__empty">
        <AppIcon name="chat" :size="26" />
        <p>暂无农户咨询<br />农户在「向专家提问」页发起咨询后会出现在这里</p>
      </div>
      <div v-for="c in consults" :key="c.id" class="rv-card" :class="{ 'is-done': c.status === 'done' }">
        <div class="rv-card__top">
          <span class="rv-card__badge" :class="c.status">
            {{ c.status === 'pending' ? '待回复' : '已回复' }}
          </span>
          <strong class="rv-card__title">
            {{ c.userName }} 的咨询
            <small>{{ c.cropId || '' }} {{ c.region ? '· ' + c.region : '' }}</small>
          </strong>
          <small class="rv-card__time">{{ fmt(c.createdAt) }}</small>
        </div>
        <p class="rv-card__q">{{ c.question }}</p>
        <p v-if="c.reply" class="rv-card__opinion">已回复：{{ c.reply }}</p>
        <button v-if="c.status === 'pending'" class="rv-card__btn" @click="openHandle('consult', c)">
          <AppIcon name="chat" :size="13" /> 回复农户
        </button>
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
                placeholder="填写防治建议、用药指导、注意事项等，提交后自动私信给农户…"
              />
              <button class="rv-dialog__btn" :disabled="!opinion.trim() || sending" @click="submitHandle">
                {{ sending ? '提交中…' : '提交并发送给农户' }}
              </button>
            </template>

            <div v-else class="rv-dialog__done">
              <AppIcon name="check-circle" :size="30" />
              <p>已完成，结果已私信农户</p>
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

.rv__head h2 {
  font-size: 19px;
  font-weight: 800;
  color: var(--c-text-1);
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
  font-size: 10px;
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

.rv-card__top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rv-card__badge {
  font-size: 9px;
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
  font-size: 10.5px;
  color: var(--c-text-4);
  font-weight: 400;
}

.rv-card__time {
  font-size: 10px;
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

.rv-fade-enter-active,
.rv-fade-leave-active {
  transition: opacity 0.2s;
}
.rv-fade-enter-from,
.rv-fade-leave-to {
  opacity: 0;
}
</style>
