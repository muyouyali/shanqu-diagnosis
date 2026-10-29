<script setup lang="ts">
/**
 * 手机扫码确认页（无需登录态）
 * 电脑端展示二维码 → 手机扫码打开本页 → 填手机号确认 → 电脑端自动登录
 */
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/api'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const store = useAppStore()

const ticket = ref('')
const phone = ref('')
const nickname = ref('')
const busy = ref(false)
const done = ref(false)
const errMsg = ref('')

// 打开页面即告知电脑端「已扫码」
onMounted(() => {
  ticket.value = String(route.query.ticket || '')
  if (ticket.value) api.scanTouch(ticket.value).catch(() => {})
})

const canConfirm = computed(() => /^1\d{10}$/.test(phone.value) && !busy.value)

const confirm = async () => {
  if (!canConfirm.value) return
  busy.value = true
  errMsg.value = ''
  try {
    await api.scanConfirm({ ticket: ticket.value, phone: phone.value, nickname: nickname.value })
    done.value = true
  } catch (e: any) {
    errMsg.value = e?.message || '确认失败，请重试'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="sl">
    <div class="sl__brand">🌿 云岭农诊</div>

    <div class="sl-card">
      <template v-if="!done">
        <span class="sl-card__ico">📱</span>
        <h1>扫码登录确认</h1>
        <p class="sl-card__sub">确认后，电脑端将自动登录该账号</p>

        <label class="sl-field">
          <span>手机号</span>
          <input v-model="phone" type="tel" maxlength="11" placeholder="用于登录的手机号" />
        </label>
        <label class="sl-field">
          <span>昵称（选填）</span>
          <input v-model="nickname" maxlength="12" placeholder="首次登录将以此创建账号" />
        </label>

        <p v-if="errMsg" class="sl-err">⚠️ {{ errMsg }}</p>

        <button class="sl-btn" :disabled="!canConfirm" @click="confirm">
          {{ busy ? '确认中…' : '✓ 确认登录' }}
        </button>
        <p class="sl-note">首次使用将自动创建账号并绑定此手机号</p>
      </template>

      <template v-else>
        <span class="sl-card__ico sl-card__ico--ok">✓</span>
        <h1>确认成功</h1>
        <p class="sl-card__sub">电脑端正在自动登录，请查看电脑屏幕</p>
      </template>
    </div>

    <footer class="sl__foot">云岭农诊 · 山地作物病虫害 AI 诊断</footer>
  </div>
</template>

<style scoped>
.sl {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(120% 160% at 100% 0%, rgba(255, 255, 255, 0.1), transparent 55%),
    linear-gradient(150deg, #0f3d22, #17643a 65%, #2f9e5f);
  color: #fff;
}

.sl__brand {
  padding: 18px 20px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 1px;
}

.sl-card {
  flex: 1;
  margin: 10px 18px 24px;
  padding: 28px 22px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(14px);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.sl-card__ico {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 30px;
  background: rgba(255, 255, 255, 0.16);
  margin-bottom: 14px;
}

.sl-card__ico--ok {
  background: rgba(88, 200, 120, 0.35);
  border: 2px solid #6fce8d;
  font-weight: 800;
}

.sl-card h1 {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 1px;
}

.sl-card__sub {
  font-size: 12.5px;
  opacity: 0.85;
  margin: 7px 0 20px;
}

.sl-field {
  width: 100%;
  text-align: left;
  margin-bottom: 13px;
}

.sl-field span {
  display: block;
  font-size: 12px;
  font-weight: 700;
  opacity: 0.85;
  margin-bottom: 5px;
}

.sl-field input {
  width: 100%;
  padding: 13px 15px;
  border-radius: 13px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 15px;
}

.sl-field input::placeholder {
  color: rgba(255, 255, 255, 0.45);
}

.sl-field input:focus {
  outline: none;
  border-color: #9fd8ae;
  background: rgba(255, 255, 255, 0.16);
}

.sl-err {
  width: 100%;
  font-size: 12px;
  color: #ffb3ab;
  background: rgba(180, 52, 47, 0.25);
  border-radius: 10px;
  padding: 8px 11px;
  margin-bottom: 10px;
  text-align: left;
}

.sl-btn {
  width: 100%;
  height: 50px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #fff;
  background: linear-gradient(135deg, #1f8a4c, #14532d);
  border: 1px solid rgba(255, 255, 255, 0.25);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.3);
}

.sl-btn:disabled {
  opacity: 0.5;
}

.sl-note {
  font-size: 11px;
  opacity: 0.7;
  margin-top: 12px;
}

.sl__foot {
  text-align: center;
  padding: 12px;
  font-size: 11px;
  opacity: 0.6;
}
</style>
