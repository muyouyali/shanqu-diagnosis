<script setup lang="ts">
/**
 * 作物百科详情弹层
 * 两类作物差异化呈现：
 *  - 知识库作物（diagnosable）：展示形态要点、适种海拔，可直接进入诊断
 *  - 百科作物：展示简介、上市期、主要病虫害，引导用户共建补全
 */
import { computed } from 'vue'
import type { Crop } from '@/types'
import AppIcon from '@/components/AppIcon.vue'
import CropEmoji from '@/components/CropEmoji.vue'
import SceneryBanner from '@/components/SceneryBanner.vue'
import { provinceOfRegion } from '@/data/regions'
import { useAppStore } from '@/stores/app'

const props = defineProps<{ crop: Crop | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'diagnose', id: string): void
  (e: 'contribute'): void
}>()

const store = useAppStore()

const province = computed(() => provinceOfRegion(store.region))

const sourceLabel = computed(() => {
  const s = props.crop?.source
  if (s === 'community') return '农户共建'
  if (s === 'atlas') return '地区百科'
  return '知识库收录'
})

const keyPoints = computed(() => props.crop?.keyPoints || [])
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div v-if="crop" class="cd-mask" @click.self="emit('close')">
        <div class="cd">
          <div class="cd__banner">
            <SceneryBanner :province="province" :region="store.region" compact />
            <button class="cd__close" @click="emit('close')">
              <AppIcon name="x" :size="15" />
            </button>
          </div>

          <div class="cd__body">
            <!-- 标题区：独立于横幅下方，与横幅说明文字互不遮挡 -->
            <div class="cd__title-wrap">
              <CropEmoji class="cd__emoji" :emoji="crop.emoji" :name="crop.name" :size="34" />
              <div class="cd__title-text">
                <h2 class="cd__name">{{ crop.name }}</h2>
                <p class="cd__alias">{{ crop.alias || crop.tagline }}</p>
              </div>
            </div>

            <div class="cd__tags">
              <span class="cd__tag cd__tag--src">{{ sourceLabel }}</span>
              <span v-if="crop.regions?.includes(province)" class="cd__tag cd__tag--local">
                {{ province }}适种
              </span>
              <span v-if="crop.diagnosable" class="cd__tag cd__tag--ok">可 AI 诊断</span>
              <span v-else class="cd__tag cd__tag--wait">待收录病害图谱</span>
            </div>

            <p class="cd__desc">{{ crop.desc || crop.intro || crop.tagline }}</p>

            <div class="cd__facts">
              <div class="cd__fact">
                <AppIcon name="mountain" :size="16" />
                <div>
                  <small>适宜海拔</small>
                  <strong>{{ crop.altitude || '待补充' }}</strong>
                </div>
              </div>
              <div class="cd__fact">
                <AppIcon name="clock" :size="16" />
                <div>
                  <small>上市 / 采收期</small>
                  <strong>{{ crop.season || '待补充' }}</strong>
                </div>
              </div>
              <div class="cd__fact">
                <AppIcon name="shield" :size="16" />
                <div>
                  <small>已收录病害</small>
                  <strong>{{ crop.diseaseCount ? `${crop.diseaseCount} 种` : '暂无' }}</strong>
                </div>
              </div>
            </div>

            <template v-if="keyPoints.length">
              <h3 class="cd__h3">形态与栽培要点</h3>
              <ul class="cd__points">
                <li v-for="(p, i) in keyPoints" :key="i">
                  <span class="cd__dot" />{{ p }}
                </li>
              </ul>
            </template>

            <template v-if="crop.pests">
              <h3 class="cd__h3">主要病虫害</h3>
              <p class="cd__pests">{{ crop.pests }}</p>
            </template>
          </div>

          <div class="cd__footer">
            <button v-if="crop.diagnosable" class="cd__btn cd__btn--primary" @click="emit('diagnose', crop.id)">
              <AppIcon name="camera" :size="16" />
              开始诊断{{ crop.name }}
            </button>
            <button v-else class="cd__btn cd__btn--ghost" @click="emit('contribute')">
              <AppIcon name="plus" :size="16" />
              补充该作物病虫害资料
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cd-mask {
  position: fixed;
  inset: 0;
  z-index: 120;
  background: rgba(18, 34, 24, 0.42);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.cd {
  width: min(560px, 100%);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg-card);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  overflow: hidden;
  box-shadow: 0 -18px 48px rgba(0, 0, 0, 0.18);
}

.cd__banner {
  position: relative;
}

/* 横幅加高：更饱满，风光说明文字独占其上 */
.cd__banner :deep(.scenery__img) {
  height: 170px;
}

.cd__close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  z-index: 2;
}

/* 标题区：位于正文顶部，横幅下方独立一行 */
.cd__title-wrap {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 16px 0 14px;
}

.cd__emoji {
  width: 58px;
  height: 58px;
  border-radius: var(--r-lg);
  display: grid;
  place-items: center;
  font-size: 30px;
  background: linear-gradient(135deg, var(--c-primary-50), #f0faf4);
  box-shadow: var(--sh-sm);
  flex-shrink: 0;
}

.cd__name {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.4px;
  color: var(--c-text-1);
  line-height: 1.3;
}

.cd__alias {
  font-size: 13px;
  line-height: 1.6;
  color: var(--c-text-3);
  margin-top: 3px;
}

.cd__body {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 8px;
}

.cd__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.cd__tag {
  font-size: 12.5px;
  font-weight: 700;
  padding: 4px 11px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  color: var(--c-text-3);
}

.cd__tag--src {
  background: var(--c-primary-50);
  color: var(--c-primary-700);
}

.cd__tag--local {
  background: var(--c-accent-100);
  color: var(--c-accent-600);
}

.cd__tag--ok {
  background: #e8f7ee;
  color: #1a7f45;
}

.cd__tag--wait {
  background: #fdf3e7;
  color: #9a6a1e;
}

.cd__desc {
  font-size: 14px;
  line-height: 1.75;
  color: var(--c-text-2);
}

.cd__facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 16px 0 4px;
}

.cd__fact {
  display: flex;
  gap: 8px;
  padding: 12px 11px;
  border-radius: var(--r-md);
  background: var(--c-bg-muted);
  color: var(--c-primary-600);
}

.cd__fact small {
  display: block;
  font-size: 12px;
  color: var(--c-text-4);
  margin-bottom: 3px;
  line-height: 1.5;
}

.cd__fact strong {
  font-size: 13.5px;
  color: var(--c-text-1);
  font-weight: 700;
  line-height: 1.4;
  display: block;
}

.cd__h3 {
  font-size: 14.5px;
  font-weight: 800;
  color: var(--c-text-1);
  margin: 18px 0 9px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.cd__h3::before {
  content: '';
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: var(--c-primary-500);
}

.cd__points {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cd__points li {
  display: flex;
  gap: 9px;
  font-size: 14px;
  line-height: 1.65;
  color: var(--c-text-2);
}

.cd__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--c-primary-400);
  margin-top: 9px;
  flex-shrink: 0;
}

.cd__pests {
  font-size: 14px;
  line-height: 1.7;
  color: var(--c-text-2);
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: #fdf6ee;
  border-left: 3px solid var(--c-accent-400);
}

.cd__footer {
  padding: 13px 20px calc(15px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--c-line-soft);
  background: var(--c-bg-card);
}

.cd__btn {
  width: 100%;
  height: 48px;
  border-radius: var(--r-full);
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.cd__btn--primary {
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  color: #fff;
  box-shadow: 0 8px 20px rgba(var(--c-primary-rgb), 0.28);
}

.cd__btn--ghost {
  background: var(--c-bg-muted);
  color: var(--c-primary-700);
  border: 1.5px dashed var(--c-primary-300);
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.24s var(--ease-out);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-active .cd,
.sheet-leave-active .cd {
  transition: transform 0.3s var(--ease-out);
}

.sheet-enter-from .cd,
.sheet-leave-to .cd {
  transform: translateY(100%);
}

@media (min-width: 960px) {
  .cd-mask {
    align-items: center;
  }
  .cd {
    border-radius: var(--r-xl);
  }
}
</style>
