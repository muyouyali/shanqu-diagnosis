<script setup lang="ts">
/**
 * 作物共建审核（后台）
 * 农户提交 → 专家核验 → 通过后自动并入该省地区作物图谱
 */
import { ref, onMounted, computed } from 'vue'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { useAppStore } from '@/stores/app'
import type { CropSubmission } from '@/types'

const store = useAppStore()

const list = ref<CropSubmission[]>([])
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
  try {
    const res = await api.cropSubmissions({ status: status.value })
    list.value = res.items
  } catch (e) {
    store.showToast((e as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(load)

const switchStatus = (s: typeof status.value) => {
  status.value = s
  load()
}

const counts = computed(() => {
  const m: Record<string, number> = { pending: 0, approved: 0, rejected: 0 }
  for (const it of list.value) m[it.status] = (m[it.status] || 0) + 1
  return m
})

const open = (item: CropSubmission) => {
  active.value = item
  note.value = item.note || ''
}

const review = async (next: 'approved' | 'rejected') => {
  if (!active.value || busy.value) return
  busy.value = true
  try {
    await api.reviewCropSubmission(active.value.id, { status: next, note: note.value })
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
</script>

<template>
  <div class="cp">
    <header class="cp__head">
      <div>
        <h1>作物共建审核</h1>
        <p>农户提交的地方作物经核验后并入对应省份的作物图谱，供全站用户检索</p>
      </div>
      <div class="cp__stat">
        <div><strong>{{ counts.pending || 0 }}</strong><small>待审核</small></div>
        <div><strong>{{ counts.approved || 0 }}</strong><small>已通过</small></div>
        <div><strong>{{ counts.rejected || 0 }}</strong><small>已驳回</small></div>
      </div>
    </header>

    <div class="cp__tabs">
      <button
        v-for="t in STATUS_TABS"
        :key="t.key"
        class="cp__tab"
        :class="{ 'is-on': status === t.key }"
        @click="switchStatus(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="loading" class="cp__empty">正在加载…</div>

    <div v-else-if="!list.length" class="cp__empty">
      <AppIcon name="check-circle" :size="26" />
      <p>当前没有{{ STATUS_TABS.find((t) => t.key === status)?.label }}的提交</p>
    </div>

    <div v-else class="cp__list">
      <article v-for="it in list" :key="it.id" class="sub-card">
        <div class="sub-card__left">
          <span class="sub-card__emoji">{{ it.emoji }}</span>
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

    <!-- 审核抽屉 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="active" class="rv-mask" @click.self="active = null">
          <div class="rv">
            <header class="rv__head">
              <div class="rv__title">
                <span class="rv__emoji">{{ active.emoji }}</span>
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
  </div>
</template>

<style scoped>
.cp {
  padding: 24px 28px 60px;
  max-width: 1080px;
}

.cp__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.cp__head h1 {
  font-size: 21px;
  font-weight: 800;
  color: var(--c-text-1);
}

.cp__head p {
  font-size: 12.5px;
  color: var(--c-text-4);
  margin-top: 5px;
  max-width: 520px;
}

.cp__stat {
  display: flex;
  gap: 22px;
  padding: 12px 20px;
  border-radius: var(--r-md);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
}

.cp__stat div {
  text-align: center;
}

.cp__stat strong {
  display: block;
  font-size: 19px;
  font-weight: 800;
  color: var(--c-primary-700);
}

.cp__stat small {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.cp__tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.cp__tab {
  padding: 7px 16px;
  border-radius: var(--r-full);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--c-text-3);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  transition: all var(--dur-fast);
}

.cp__tab.is-on {
  background: var(--c-primary-600);
  border-color: var(--c-primary-600);
  color: #fff;
}

.cp__empty {
  padding: 60px 20px;
  text-align: center;
  color: var(--c-text-4);
  font-size: 13px;
  background: var(--c-bg-card);
  border-radius: var(--r-md);
  border: 1px dashed var(--c-line);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.cp__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sub-card {
  display: flex;
  gap: 14px;
  padding: 15px 16px;
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
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 23px;
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
  font-size: 14.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.sub-card__status {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: var(--r-full);
}

.sub-card__alias {
  font-size: 11px;
  color: var(--c-text-4);
  margin-top: 2px;
}

.sub-card__desc {
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--c-text-2);
  margin: 6px 0 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sub-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11px;
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
  padding: 7px 15px;
  border-radius: var(--r-full);
  font-size: 12px;
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
  font-size: 10px;
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
  font-size: 10px;
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

@media (max-width: 720px) {
  .cp {
    padding: 16px 14px 50px;
  }
  .sub-card {
    flex-wrap: wrap;
  }
  .sub-card__ops {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
