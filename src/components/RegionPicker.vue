<script setup lang="ts">
import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'

const store = useAppStore()
const open = ref(false)

/** 云南省 16 州市 + 特色产区定位 */
const regions: { group: string; items: string[] }[] = [
  {
    group: '重点产区',
    items: ['文山市', '昭通市', '普洱市', '大理白族自治州', '红河州', '曲靖市']
  },
  {
    group: '其他州市',
    items: [
      '昆明市',
      '丽江市',
      '临沧市',
      '保山市',
      '西双版纳州',
      '楚雄州',
      '玉溪市',
      '德宏州',
      '怒江州',
      '迪庆州'
    ]
  }
]

const pick = (r: string) => {
  store.setRegion(r)
  open.value = false
  store.showToast(`定位已切换到 ${r}`, 'success')
}
</script>

<template>
  <div class="region-picker">
    <button class="region-btn" @click.stop="open = true">
      <AppIcon name="map-pin" :size="13" />
      {{ store.region }}
      <AppIcon name="chevron-down" :size="11" class="region-btn__caret" />
    </button>

    <Teleport to="body">
      <Transition name="sheet">
        <div v-if="open" class="mask" @click.self="open = false">
          <div class="sheet" @click.stop>
            <div class="sheet__head">
              <h3>选择您的种植区域</h3>
              <p>天气与病害风险将按所选区域计算</p>
            </div>
            <div class="sheet__body">
              <template v-for="g in regions" :key="g.group">
                <p class="sheet__group">{{ g.group }}</p>
                <div class="sheet__grid">
                  <button
                    v-for="r in g.items"
                    :key="r"
                    class="sheet__item"
                    :class="{ 'is-active': store.region === r }"
                    @click="pick(r)"
                  >
                    <AppIcon name="map-pin" :size="12" />
                    {{ r }}
                  </button>
                </div>
              </template>
            </div>
            <button class="sheet__cancel" @click="open = false">取消</button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.region-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 11px;
  border-radius: var(--r-full);
  background: rgba(255, 255, 255, 0.13);
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.94);
  font-size: 12px;
  font-weight: 500;
  backdrop-filter: blur(8px);
  transition: background var(--dur-fast);
}

.region-btn:active {
  background: rgba(255, 255, 255, 0.22);
}

.region-btn__caret {
  opacity: 0.7;
}

/* ===== 弹层 ===== */
.mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(10, 20, 15, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-height: 76vh;
  max-width: 560px;
  background: var(--c-bg-card);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sheet__head {
  padding: 20px 20px 12px;
  text-align: center;
  border-bottom: 1px solid var(--c-line-soft);
}

.sheet__head h3 {
  font-size: 16px;
  font-weight: 700;
}

.sheet__head p {
  font-size: 11.5px;
  color: var(--c-text-4);
  margin-top: 3px;
}

.sheet__body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 20px 20px;
}

.sheet__group {
  font-size: 11px;
  font-weight: 700;
  color: var(--c-text-4);
  letter-spacing: 0.5px;
  margin: 10px 0 8px;
}

.sheet__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.sheet__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 11px 8px;
  border-radius: var(--r-md);
  background: var(--c-bg-muted);
  border: 1.5px solid var(--c-line-soft);
  font-size: 13px;
  color: var(--c-text-2);
  transition: all var(--dur-fast);
}

.sheet__item:active {
  transform: scale(0.97);
}

.sheet__item.is-active {
  background: var(--c-primary-50);
  border-color: var(--c-primary-500);
  color: var(--c-primary-700);
  font-weight: 700;
}

.sheet__cancel {
  height: 52px;
  border-top: 1px solid var(--c-line-soft);
  font-size: 14px;
  font-weight: 600;
  color: var(--c-text-3);
  background: var(--c-bg-card);
}

/* 弹层动画 */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity var(--dur-base);
}
.sheet-enter-active .sheet,
.sheet-leave-active .sheet {
  transition: transform var(--dur-base) var(--ease-out);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet,
.sheet-leave-to .sheet {
  transform: translateY(40%);
}

@media (min-width: 960px) {
  .mask {
    align-items: center;
  }
  .sheet {
    border-radius: var(--r-xl);
  }
}
</style>
