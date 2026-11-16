<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'
import api from '@/api'
import type { HealthResponse, MetricsResponse } from '@/types'

const store = useAppStore()
const health = ref<HealthResponse | null>(null)
const metrics = ref<MetricsResponse | null>(null)
const loading = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

const load = async () => {
  try {
    const [h, m] = await Promise.all([api.health(), api.metrics()])
    health.value = h
    metrics.value = m
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

const refreshing = ref(false)
const refreshStatus = async () => {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await load()
    store.showToast('状态已刷新', 'success')
  } finally {
    refreshing.value = false
  }
}

const resetDemo = async () => {
  if (!confirm('重置演示数据？将恢复为初始的多样化模拟诊断记录。')) return
  try {
    await api.resetDemo()
    store.showToast('演示数据已重置', 'success')
    await load()
  } catch (err) {
    store.showToast((err as Error).message, 'error')
  }
}

const fmtUptime = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分 ${s % 60} 秒`
}

onMounted(() => {
  load()
  timer = setInterval(load, 10000)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="system">
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
    </div>

    <template v-else>
      <!-- 服务状态 -->
      <div class="status-hero" :class="{ 'is-warn': !health?.ai.configured }">
        <div class="status-hero__icon">
          <AppIcon :name="health?.ai.configured ? 'check-circle' : 'alert'" :size="26" />
        </div>
        <div class="status-hero__body">
          <h2 class="status-hero__title">
            {{ health?.ai.configured ? '系统运行正常' : 'AI 服务未配置' }}
          </h2>
          <p class="status-hero__desc">
            {{
              health?.ai.configured
                ? '所有模块可用，诊断能力处于完整状态'
                : '当前以「知识库降级模式」运行：无图像识别，仅支持症状文字匹配。请配置 .env 中的 AI 参数以启用完整能力。'
            }}
          </p>
        </div>
        <div class="status-hero__meta">
          <span>版本 v{{ health?.version }}</span>
          <span>运行 {{ fmtUptime(health?.uptime || 0) }}</span>
        </div>
      </div>

      <!-- 配置信息 -->
      <div class="grid-2">
        <div class="panel">
          <h3 class="panel__title">
            <AppIcon name="cpu" :size="16" />
            AI 服务配置
          </h3>
          <div class="kv-list">
            <div class="kv">
              <span class="kv__k">接入状态</span>
              <span class="kv__v" :class="health?.ai.configured ? 'is-ok' : 'is-warn'">
                {{ health?.ai.configured ? '已配置' : '未配置' }}
              </span>
            </div>
            <div class="kv">
              <span class="kv__k">服务地址</span>
              <span class="kv__v mono">{{ health?.ai.baseUrl || '—' }}</span>
            </div>
            <div class="kv">
              <span class="kv__k">视觉模型</span>
              <span class="kv__v mono">{{ health?.ai.visionModel }}</span>
            </div>
            <div class="kv">
              <span class="kv__k">文本模型</span>
              <span class="kv__v mono">{{ health?.ai.textModel }}</span>
            </div>
            <div class="kv">
              <span class="kv__k">密钥</span>
              <span class="kv__v mono">{{ health?.ai.keyMasked }}</span>
            </div>
            <div class="kv">
              <span class="kv__k">协议</span>
              <span class="kv__v">OpenAI 兼容 · 可热切换服务商</span>
            </div>
          </div>
          <div class="hint-box">
            <AppIcon name="info" :size="13" />
            <span>本系统采用统一适配层，更换服务商只需修改 .env 中的 4 项配置，代码无需改动。</span>
          </div>
        </div>

        <div class="panel">
          <h3 class="panel__title">
            <AppIcon name="database" :size="16" />
            知识库与运行指标
          </h3>
          <div class="stat-grid">
            <div class="stat">
              <span class="stat__num">{{ health?.kb.crops }}</span>
              <span class="stat__label">特色作物</span>
            </div>
            <div class="stat">
              <span class="stat__num">{{ health?.kb.diseases }}</span>
              <span class="stat__label">病害条目</span>
            </div>
            <div class="stat">
              <span class="stat__num">{{ health?.kb.pesticides }}</span>
              <span class="stat__label">农药安全数据</span>
            </div>
            <div class="stat">
              <span class="stat__num">{{ metrics?.calls || 0 }}</span>
              <span class="stat__label">模型调用次数</span>
            </div>
            <div class="stat">
              <span class="stat__num">{{ metrics?.avgLatencyMs || 0 }}</span>
              <span class="stat__label">平均延迟 ms</span>
            </div>
            <div class="stat">
              <span class="stat__num">{{ metrics?.totalTokens || 0 }}</span>
              <span class="stat__label">累计 Token</span>
            </div>
          </div>
          <div class="hint-box">
            <AppIcon name="info" :size="13" />
            <span>检索层采用 BM25 + 中文二元切分 + 领域同义词扩展，零外部依赖，可替换为向量检索。</span>
          </div>
        </div>
      </div>

      <!-- 调用记录 -->
      <div class="panel">
        <div class="panel__head">
          <h3 class="panel__title">
            <AppIcon name="clock" :size="16" />
            最近模型调用
          </h3>
          <span class="panel__sub">每 10 秒自动刷新</span>
        </div>

        <div v-if="!metrics?.history?.length" class="empty-hint">
          暂无调用记录。完成一次图像诊断后，这里会显示模型调用的耗时与 Token 消耗。
        </div>

        <div v-else class="call-list">
          <div v-for="(h, i) in metrics.history.slice(-8).reverse()" :key="i" class="call-item">
            <span class="call-item__dot"></span>
            <span class="call-item__model mono">{{ h.model }}</span>
            <span class="call-item__time">{{ new Date(h.at).toLocaleTimeString('zh-CN') }}</span>
            <span class="call-item__latency">{{ h.latencyMs }}ms</span>
            <span class="call-item__token">{{ h.tokens }} tokens</span>
          </div>
        </div>
      </div>

      <!-- 操作 -->
      <div class="panel">
        <h3 class="panel__title">
          <AppIcon name="settings" :size="16" />
          运维操作
        </h3>
        <div class="actions-row">
          <button class="btn btn--outline" :disabled="refreshing" @click="refreshStatus">
            <AppIcon name="refresh" :size="16" /> {{ refreshing ? '刷新中…' : '刷新状态' }}
          </button>
          <button class="btn btn--outline" @click="resetDemo">
            <AppIcon name="database" :size="16" /> 重置演示数据
          </button>
        </div>
        <div class="hint-box hint-box--warn">
          <AppIcon name="alert" :size="13" />
          <span>
            演示数据标记为 isDemo，与真实诊断记录区分存储。正式使用时建议清空演示数据，避免影响统计真实性。
          </span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.system {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.loading-state {
  display: grid;
  place-items: center;
  padding: 100px 0;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 2.5px solid var(--c-primary-100);
  border-top-color: var(--c-primary-500);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 状态条 */
.status-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-radius: var(--r-lg);
  background: linear-gradient(135deg, #ecfdf5, #f7fdfa);
  border: 1px solid #a7f3d0;
}

.status-hero.is-warn {
  background: linear-gradient(135deg, #fffbeb, #fffdf7);
  border-color: #fde68a;
}

.status-hero__icon {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: var(--c-primary-600);
  color: #fff;
  flex-shrink: 0;
}

.status-hero.is-warn .status-hero__icon {
  background: var(--c-warning);
}

.status-hero__body {
  flex: 1;
  min-width: 0;
}

.status-hero__title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 3px;
  color: var(--c-text-1);
}

.status-hero__desc {
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--c-text-2);
}

.status-hero__meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  font-size: 11.5px;
  color: var(--c-text-4);
  flex-shrink: 0;
}

/* 面板 */
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.panel {
  padding: 18px;
  border-radius: var(--r-lg);
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.panel__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
}

.panel__title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 14px;
}

.panel__head .panel__title {
  margin-bottom: 0;
}

.panel__title :deep(.icon) {
  color: var(--c-primary-600);
}

.panel__sub {
  font-size: 11.5px;
  color: var(--c-text-4);
}

/* KV */
.kv-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.kv {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--c-line-soft);
}

.kv:last-child {
  border-bottom: none;
}

.kv__k {
  font-size: 12px;
  color: var(--c-text-4);
  flex-shrink: 0;
}

.kv__v {
  font-size: 12px;
  color: var(--c-text-1);
  font-weight: 500;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kv__v.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 12.5px;
}

.kv__v.is-ok {
  color: var(--c-primary-600);
  font-weight: 700;
}

.kv__v.is-warn {
  color: var(--c-accent-600);
  font-weight: 700;
}

/* 统计格 */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 13px 8px;
  border-radius: var(--r-md);
  background: var(--c-bg-muted);
}

.stat__num {
  font-family: var(--font-num);
  font-size: 20px;
  font-weight: 700;
  color: var(--c-primary-700);
  line-height: 1.2;
}

.stat__label {
  font-size: 11.5px;
  color: var(--c-text-4);
  text-align: center;
}

/* 提示 */
.hint-box {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
  border: 1px dashed var(--c-line);
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--c-text-3);
  align-items: flex-start;
}

.hint-box--warn {
  background: var(--c-warning-bg);
  border-color: #fde68a;
  color: #92400e;
}

.hint-box :deep(.icon) {
  flex-shrink: 0;
  margin-top: 2px;
}

/* 调用列表 */
.call-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.call-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 13px;
  border-radius: var(--r-sm);
  background: var(--c-bg-muted);
  font-size: 11.5px;
}

.call-item__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-success);
  flex-shrink: 0;
}

.call-item__model {
  flex: 1;
  color: var(--c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 12.5px;
}

.call-item__time {
  color: var(--c-text-4);
  font-variant-numeric: tabular-nums;
}

.call-item__latency {
  color: var(--c-primary-600);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  width: 60px;
  text-align: right;
}

.call-item__token {
  color: var(--c-text-4);
  font-variant-numeric: tabular-nums;
  width: 80px;
  text-align: right;
}

.empty-hint {
  padding: 30px 16px;
  text-align: center;
  font-size: 12px;
  color: var(--c-text-4);
  line-height: 1.7;
}

.actions-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

@media (max-width: 1000px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
  .stat-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
