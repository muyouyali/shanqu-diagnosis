<script setup lang="ts">
/** 向专家提问：按作物/地区推荐擅长领域的专家 */
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import { useAppStore } from '@/stores/app'
import { PROVINCES } from '@/data/regions'
import RegionPicker from '@/components/RegionPicker.vue'
import { mergeExperts, scoreExpert, addLocalConsult } from '@/data/localExperts'
import type { Expert } from '@/types'

const router = useRouter()
const store = useAppStore()
const experts = ref<Expert[]>([])
const loading = ref(true)
const cropName = ref('')

/** 云南州市选项（取自地区数据） */
const selRegion = computed(() => store.region || '')

/** 本地区可问作物优先（最多 12 个），不足时用跨区作物补齐 */
const askCrops = computed(() => {
  const pool = [...store.localCrops, ...store.otherCrops].filter((c) => c.diagnosable !== false)
  const seen = new Set<string>()
  return pool.filter((c) => (seen.has(c.id) ? false : seen.add(c.id))).slice(0, 12)
})

const reload = async () => {
  loading.value = true
  try {
    cropName.value = store.crops.find((c) => c.id === store.selectedCropId)?.name || ''
    let remote: Expert[] = []
    try {
      const res = await api.experts({
        cropId: store.selectedCropId || undefined,
        region: selRegion.value || undefined
      })
      remote = res.items
    } catch {
      // 静态托管兜底：内置专家种子 + 本机注册专家
      remote = []
    }
    // 合并：本机新注册专家置顶，保证「注册的专家及时出现」
    experts.value = mergeExperts(remote as any)
      .map((e) => scoreExpert(e as any, cropName.value, selRegion.value))
      .sort((a, b) => b.match - a.match) as Expert[]
  } catch (e: any) {
    store.showToast(e?.message || '专家列表加载失败', 'error')
  } finally {
    loading.value = false
  }
}

const pickCrop = async (id: string) => {
  store.setCrop(id)
  await reload()
}


const initials = (n: string) => n.slice(0, 1)

const toneColor = (i: number) =>
  ['#1a7f45', '#2563eb', '#b45309', '#7c3aed', '#be185d'][i % 5]

/** 推荐标：匹配度 >=2 视为强相关 */
const matched = computed(() => experts.value.filter((e) => e.match >= 2))
/** 本地专家：驻点即当前所选地区 */
const localExperts = computed(() =>
  selRegion.value ? experts.value.filter((e) => (e.region || '').includes(selRegion.value) && e.match < 2) : []
)
/** 其他地区专家 */
const others = computed(() =>
  experts.value.filter((e) => !matched.value.includes(e) && !localExperts.value.includes(e))
)

/* ---------- 咨询弹层 ---------- */
const target = ref<Expert | null>(null)
const question = ref('')
const sending = ref(false)
const sent = ref(false)

const openAsk = (e: Expert) => {
  target.value = e
  question.value = ''
  sent.value = false
}
const closeAsk = () => {
  target.value = null
}

const submitAsk = async () => {
  if (!target.value || !question.value.trim() || sending.value) return
  sending.value = true
  try {
    await api.sendConsult({
      expertId: target.value.id,
      cropId: store.selectedCropId || null,
      region: selRegion.value || '',
      question: question.value.trim()
    })
    sent.value = true
    store.showToast('咨询已发送，专家将在消息中心收到并回复', 'success')
  } catch {
    // 静态托管兜底：咨询单落到本地，演示闭环不断
    addLocalConsult({
      userId: Number(store.user?.id) || 0,
      userName: store.user?.nickname || '农户',
      expertId: target.value.id,
      cropId: store.selectedCropId || null,
      region: selRegion.value || '',
      question: question.value.trim()
    })
    sent.value = true
    store.showToast('咨询已提交，专家端「待回复咨询」可见', 'success')
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  await store.restoreUser()
  try {
    await store.loadCrops()
  } catch {
    /* ignore */
  }
  await reload()
})

// 地区切换（RegionPicker 全局定位）→ 重新推荐
watch(selRegion, () => reload())
</script>

<template>
  <div class="ax">
    <header class="ax__head">
      <button class="ax__back" @click="router.back()"><AppIcon name="arrow-left" :size="17" /></button>
      <h1>向专家提问</h1>
    </header>

    <!-- 作物与地区选择 -->
    <div class="ax__pick">
      <div class="ax__pick-row">
        <span class="ax__pick-label">作物</span>
        <div class="ax__chips">
          <button
            v-for="c in askCrops"
            :key="c.id"
            class="ax__chip"
            :class="{ 'is-on': store.selectedCropId === c.id }"
            @click="pickCrop(c.id)"
          >
            {{ c.name }}
          </button>
        </div>
      </div>
      <div class="ax__pick-row">
        <span class="ax__pick-label">地区</span>
        <div class="ax__rp">
          <RegionPicker />
          <button v-if="selRegion" class="ax__rp-clear" @click="store.setRegion('')">清除</button>
        </div>
      </div>
    </div>

    <div class="ax__intro">
      <AppIcon name="user" :size="14" />
      <span v-if="cropName">已根据你选择的「{{ cropName }}」<template v-if="selRegion">和地区「{{ selRegion }}」</template><em>优先推荐</em>对口专家</span>
      <span v-else>选择擅长对应作物领域的专家，获得更有针对性的解答</span>
    </div>

    <div v-if="loading" class="ax__empty">正在加载专家团队…</div>
    <div v-else-if="!experts.length" class="ax__empty">暂无专家入驻</div>

    <template v-else>
      <!-- 推荐专家 -->
      <div v-if="matched.length" class="ax__group">
        <h2 class="ax__group-title">
          <AppIcon name="sparkle" :size="13" /> 为你推荐
        </h2>
        <div
          v-for="(e, i) in matched"
          :key="e.id"
          class="ex-card ex-card--hot"
          @click="openAsk(e)"
        >
          <span class="ex-card__avatar" :style="{ background: '#e8f7ee', color: toneColor(i) }">
            {{ initials(e.nickname) }}
          </span>
          <div class="ex-card__main">
            <div class="ex-card__top">
              <strong>{{ e.nickname }}</strong>
              <span class="ex-card__title">{{ e.title }}</span>
              <span class="ex-card__match">推荐</span>
            </div>
            <div class="ex-card__tags">
              <span v-for="s in e.specialty" :key="s" class="ex-card__tag">{{ s }}</span>
            </div>
            <p class="ex-card__meta">
              <AppIcon name="home" :size="11" /> 驻点 {{ e.region }}
            </p>
          </div>
          <button class="ex-card__btn">咨询</button>
        </div>
      </div>

      <!-- 本地专家 -->
      <div v-if="localExperts.length" class="ax__group">
        <h2 class="ax__group-title">
          <AppIcon name="map-pin" :size="13" /> {{ selRegion }}本地专家
        </h2>
        <div v-for="(e, i) in localExperts" :key="e.id" class="ex-card" @click="openAsk(e)">
          <span class="ex-card__avatar" :style="{ background: '#eef3f0', color: toneColor(i + 2) }">
            {{ initials(e.nickname) }}
          </span>
          <div class="ex-card__main">
            <div class="ex-card__top">
              <strong>{{ e.nickname }}</strong>
              <span class="ex-card__title">{{ e.title || '农技专家' }}</span>
              <span class="ex-card__match ex-card__match--local">本地</span>
            </div>
            <div class="ex-card__tags">
              <span v-for="t in e.specialty" :key="t" class="ex-card__tag">{{ t }}</span>
            </div>
            <p class="ex-card__meta"><AppIcon name="home" :size="11" /> 驻点 {{ e.region }}</p>
          </div>
          <button class="ex-card__btn">咨询</button>
        </div>
      </div>

      <!-- 其他地区专家 -->
      <div v-if="others.length" class="ax__group">
        <h2 class="ax__group-title">
          {{ selRegion ? '其他地区专家（可远程咨询）' : '全部专家' }}
        </h2>
        <div v-for="(e, i) in others" :key="e.id" class="ex-card" @click="openAsk(e)">
          <span class="ex-card__avatar" :style="{ background: '#eef3f0', color: toneColor(i + 2) }">
            {{ initials(e.nickname) }}
          </span>
          <div class="ex-card__main">
            <div class="ex-card__top">
              <strong>{{ e.nickname }}</strong>
              <span class="ex-card__title">{{ e.title }}</span>
            </div>
            <div class="ex-card__tags">
              <span v-for="s in e.specialty" :key="s" class="ex-card__tag">{{ s }}</span>
            </div>
            <p class="ex-card__meta"><AppIcon name="home" :size="11" /> 驻点 {{ e.region }}</p>
          </div>
          <button class="ex-card__btn">咨询</button>
        </div>
      </div>
    </template>

    <!-- 咨询弹层 -->
    <Teleport to="body">
      <Transition name="ax-sheet">
        <div v-if="target" class="ax-mask" @click.self="closeAsk">
          <div class="ax-sheet">
            <header class="ax-sheet__head">
              <strong>{{ sent ? '咨询已发送' : `咨询 ${target.nickname}` }}</strong>
              <button class="ax-sheet__close" @click="closeAsk"><AppIcon name="x" :size="14" /></button>
            </header>

            <template v-if="!sent">
              <div class="ax-sheet__expert">
                <strong>{{ target.nickname }} · {{ target.title }}</strong>
                <span>擅长：{{ (target.specialty || []).join('、') }} ｜ 驻点 {{ target.region }}</span>
              </div>
              <textarea
                v-model="question"
                class="ax-sheet__input"
                rows="5"
                maxlength="500"
                placeholder="描述作物、症状、持续时间等，越详细专家判断越准确…"
              />
              <button class="ax-sheet__btn" :disabled="!question.trim() || sending" @click="submitAsk">
                <AppIcon name="arrow-right" :size="14" />
                {{ sending ? '发送中…' : '发送咨询' }}
              </button>
              <p class="ax-sheet__note">专家会在农技站后台收到你的咨询，回复将出现在「我的消息」</p>
            </template>

            <div v-else class="ax-sheet__done">
              <AppIcon name="check-circle" :size="34" />
              <p>咨询已发送给 {{ target.nickname }}</p>
              <button class="ax-sheet__btn" @click="router.push('/messages-page')">
                去消息中心查看回复
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ax {
  padding: 14px 16px 40px;
}

.ax__head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.ax__back {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  color: var(--c-text-2);
}

.ax__head h1 {
  font-size: 17px;
  font-weight: 800;
  color: var(--c-text-1);
}

/* 作物/地区选择器 */
.ax__pick {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.ax__pick-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ax__pick-label {
  font-size: 12px;
  font-weight: 800;
  color: var(--c-text-3);
  line-height: 28px;
  flex-shrink: 0;
}

.ax__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ax__chip {
  height: 28px;
  padding: 0 12px;
  border-radius: var(--r-full);
  font-size: 12px;
  color: var(--c-text-2);
  background: var(--c-bg-muted);
  border: 1px solid transparent;
  transition: all var(--dur-fast);
}

.ax__chip.is-on {
  color: #fff;
  font-weight: 700;
  background: var(--c-primary-600);
}

.ax__rp {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.ax__rp-clear {
  height: 28px;
  padding: 0 11px;
  border-radius: var(--r-full);
  font-size: 11.5px;
  font-weight: 700;
  color: var(--c-text-3);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line-soft);
  flex-shrink: 0;
}

.ax__rp :deep(.region-btn) {
  color: var(--c-text-1);
  background: var(--c-bg-muted);
  border: 1px solid var(--c-line);
}

.ax__intro {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 13px;
  border-radius: 12px;
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
  font-size: 12px;
  color: var(--c-primary-700);
  margin-bottom: 14px;
}

.ax__intro em {
  font-style: normal;
  font-weight: 800;
}

.ax__empty {
  padding: 50px 20px;
  text-align: center;
  color: var(--c-text-4);
  font-size: 12.5px;
}

.ax__group {
  margin-bottom: 16px;
}

.ax__group-title {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 800;
  color: var(--c-text-3);
  margin-bottom: 8px;
}

/* 专家卡 */
.ex-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 13px 14px;
  margin-bottom: 9px;
  border-radius: 15px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  text-align: left;
  transition: all var(--dur-fast);
}

.ex-card--hot {
  border-color: var(--c-primary-200);
  background: linear-gradient(150deg, var(--c-primary-50), #fff 60%);
}

.ex-card__avatar {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 17px;
  font-weight: 800;
  flex-shrink: 0;
}

.ex-card__main {
  flex: 1;
  min-width: 0;
}

.ex-card__top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ex-card__top strong {
  font-size: 13.5px;
  color: var(--c-text-1);
}

.ex-card__title {
  font-size: 11.5px;
  color: var(--c-text-4);
}

.ex-card__match--local {
  background: #b45309;
}

.ex-card__match {
  font-size: 11.5px;
  font-weight: 800;
  color: #fff;
  background: var(--c-primary-600);
  padding: 1.5px 7px;
  border-radius: var(--r-full);
}

.ex-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}

.ex-card__tag {
  font-size: 11.5px;
  color: var(--c-primary-700);
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
  padding: 1px 8px;
  border-radius: var(--r-full);
}

.ex-card__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 5px;
  font-size: 11.5px;
  color: var(--c-text-4);
}

.ex-card__btn {
  flex-shrink: 0;
  height: 30px;
  padding: 0 15px;
  border-radius: var(--r-full);
  font-size: 11.5px;
  font-weight: 700;
  color: #fff;
  background: var(--c-primary-600);
  border: none;
}

/* 咨询弹层 */
.ax-mask {
  position: fixed;
  inset: 0;
  z-index: 140;
  background: rgba(14, 30, 22, 0.5);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.ax-sheet {
  width: min(520px, 100%);
  background: var(--c-bg-page);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  padding: 16px;
}

.ax-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ax-sheet__head strong {
  font-size: 15.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.ax-sheet__close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--c-bg-muted);
  color: var(--c-text-3);
}

.ax-sheet__expert {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 11px 13px;
  border-radius: 12px;
  background: var(--c-primary-50);
  border: 1px solid var(--c-primary-200);
  font-size: 12.5px;
  color: var(--c-primary-700);
  margin-bottom: 12px;
}

.ax-sheet__expert span {
  font-size: 12.5px;
  color: var(--c-text-3);
}

.ax-sheet__input {
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

.ax-sheet__input:focus {
  outline: none;
  border-color: var(--c-primary-500);
}

.ax-sheet__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 42px;
  margin-top: 12px;
  border-radius: var(--r-full);
  font-size: 13.5px;
  font-weight: 700;
  color: #fff;
  background: var(--c-primary-600);
  border: none;
}

.ax-sheet__btn:disabled {
  opacity: 0.5;
}

.ax-sheet__note {
  margin-top: 9px;
  font-size: 11.5px;
  color: var(--c-text-4);
  text-align: center;
}

.ax-sheet__done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 22px 0 10px;
  color: var(--c-primary-600);
  font-size: 14px;
  font-weight: 700;
}

/* 过渡 */
.ax-sheet-enter-active,
.ax-sheet-leave-active {
  transition: opacity 0.24s var(--ease-out);
}
.ax-sheet-enter-from,
.ax-sheet-leave-to {
  opacity: 0;
}

@media (min-width: 960px) {
  .ax-mask {
    align-items: center;
  }
  .ax-sheet {
    border-radius: var(--r-xl);
  }
}
</style>
