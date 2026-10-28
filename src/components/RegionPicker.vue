<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import SceneryBanner from '@/components/SceneryBanner.vue'
import { PROVINCES, provinceOfRegion } from '@/data/regions'

const store = useAppStore()
const open = ref(false)
const activeProvince = ref('云南')
const keyword = ref('')

const currentProvince = computed(
  () => PROVINCES.find((p) => p.name === activeProvince.value) || PROVINCES[0]
)

/** 全部地区扁平化（用于搜索） */
const allRegions = PROVINCES.flatMap((p) =>
  p.groups.flatMap((g) => g.items.map((name) => ({ name, province: p.name })))
)

/** 搜索结果：同时匹配地区名与省份名 */
const searchResults = computed(() => {
  const k = keyword.value.trim()
  if (!k) return []
  return allRegions.filter((r) => r.name.includes(k) || r.province.includes(k)).slice(0, 12)
})

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
            <SceneryBanner :province="activeProvince" :region="activeProvince" class="sheet__banner" />
            <div class="sheet__head">
              <h3>选择您的种植区域</h3>
              <p>天气与病害风险将按所选区域计算</p>
            </div>

            <!-- 搜索框 -->
            <div class="search-box">
              <AppIcon name="search" :size="15" class="search-box__icon" />
              <input
                v-model="keyword"
                class="search-box__input"
                placeholder="搜索地区，如：毕节、凉山、普洱…"
                maxlength="12"
              />
              <button v-if="keyword" class="search-box__clear" @click="keyword = ''">
                <AppIcon name="x" :size="13" />
              </button>
            </div>

            <!-- 搜索结果 -->
            <div v-if="keyword.trim()" class="search-results">
              <template v-if="searchResults.length">
                <button
                  v-for="r in searchResults"
                  :key="r.province + r.name"
                  class="search-item"
                  :class="{ 'is-active': store.region === r.name }"
                  @click="pick(r.name)"
                >
                  <AppIcon name="map-pin" :size="13" />
                  <span class="search-item__name">{{ r.name }}</span>
                  <span class="search-item__prov">{{ r.province }}</span>
                </button>
              </template>
              <p v-else class="search-empty">未找到匹配的地区，试试输入省份名或市/州名</p>
            </div>

            <!-- 默认：热门省份 + 当前省列表 -->
            <template v-else>
              <div class="prov-tabs">
                <button
                  v-for="p in PROVINCES.slice(0, 8)"
                  :key="p.name"
                  class="prov-tab"
                  :class="{ 'is-active': activeProvince === p.name }"
                  @click="activeProvince = p.name"
                >
                  {{ p.name }}
                  <i v-if="p.name === '云南'" class="prov-tab__badge">主产区</i>
                </button>
                <select
                  class="prov-more"
                  :value="PROVINCES.slice(8).some((p) => p.name === activeProvince) ? activeProvince : ''"
                  @change="activeProvince = ($event.target as HTMLSelectElement).value"
                >
                  <option value="" disabled>更多省份…</option>
                  <option v-for="p in PROVINCES.slice(8)" :key="p.name" :value="p.name">
                    {{ p.name }}
                  </option>
                </select>
              </div>

              <div class="sheet__body">
                <p class="sheet__note">{{ currentProvince.note }}</p>
                <template v-for="g in currentProvince.groups" :key="g.group">
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
            </template>
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

.sheet__banner {
  border-radius: 0;
  flex-shrink: 0;
}

.sheet__banner :deep(.scenery__svg) {
  height: 96px;
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

/* 搜索框 */
.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 20px 0;
  padding: 0 14px;
  height: 42px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1.5px solid var(--c-line);
  transition: border-color var(--dur-fast);
  flex-shrink: 0;
}

.search-box:focus-within {
  border-color: var(--c-primary-300);
  background: #fff;
}

.search-box__icon {
  color: var(--c-text-4);
  flex-shrink: 0;
}

.search-box__input {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
}

.search-box__clear {
  color: var(--c-text-4);
  display: grid;
  place-items: center;
  padding: 4px;
}

/* 搜索结果 */
.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 10px 20px 14px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.search-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--c-bg-muted);
  border: 1.5px solid var(--c-line-soft);
  font-size: 13.5px;
  color: var(--c-text-1);
  text-align: left;
}

.search-item.is-active {
  border-color: var(--c-primary-500);
  background: var(--c-primary-50);
}

.search-item__name {
  font-weight: 700;
}

.search-item__prov {
  margin-left: auto;
  font-size: 11px;
  color: var(--c-text-4);
}

.search-empty {
  text-align: center;
  font-size: 12.5px;
  color: var(--c-text-4);
  padding: 24px 0;
}

/* 省份快捷行（8 个 + 更多下拉） */
.prov-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 20px 0;
}

.prov-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1.5px solid var(--c-line-soft);
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-3);
  white-space: nowrap;
  transition: all var(--dur-fast);
}

.prov-more {
  padding: 7px 12px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1.5px dashed var(--c-line);
  font-size: 12px;
  font-weight: 600;
  color: var(--c-text-3);
  cursor: pointer;
  outline: none;
}

.prov-tab.is-active {
  background: var(--c-primary-600);
  border-color: var(--c-primary-600);
  color: #fff;
}

.prov-tab__badge {
  font-style: normal;
  font-size: 9px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.25);
}

.prov-tab:not(.is-active) .prov-tab__badge {
  background: var(--c-primary-50);
  color: var(--c-primary-600);
}

.sheet__note {
  font-size: 11.5px;
  color: var(--c-text-4);
  margin-bottom: 4px;
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
