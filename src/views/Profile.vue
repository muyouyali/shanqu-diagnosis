<script setup lang="ts">
/**
 * 个人中心：头像上传、资料修改、退出登录、注销账号
 */
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import SceneryBanner from '@/components/SceneryBanner.vue'
import AuthSheet from '@/components/AuthSheet.vue'
import { useAppStore } from '@/stores/app'
import { provinceOfRegion } from '@/data/regions'

const router = useRouter()
const store = useAppStore()

const authOpen = ref(false)

const form = ref({
  nickname: '',
  phone: '',
  email: '',
  wechatId: '',
  region: '',
  title: '',
  password: ''
})
/** 专家可编辑擅长领域 */
const expertTags = ref<string[]>([])
const EXPERT_FIELDS = ['三七', '重楼', '黄精', '蓝莓', '柑橘', '茶叶', '核桃', '花椒', '芒果', '咖啡', '食用玫瑰', '草果']
const toggleTag = (f: string) => {
  const i = expertTags.value.indexOf(f)
  if (i === -1) expertTags.value = [...expertTags.value, f].slice(0, 8)
  else expertTags.value = expertTags.value.filter((x) => x !== f)
}
const avatarFile = ref('')
const saving = ref(false)
const dangerOpen = ref(false)
const dangerText = ref('')

const defaults: Record<string, string> = {
  昭通市: '苹果、天麻核心产区',
  文山市: '三七之乡',
  普洱市: '茶山与咖啡谷'
}

onMounted(async () => {
  await store.restoreUser()
  if (store.user) fillForm()
})

const fillForm = () => {
  const u = store.user!
  form.value = {
    nickname: u.nickname,
    phone: u.phone,
    email: u.email,
    wechatId: u.wechatId,
    region: u.region || store.region,
    title: (u as any).title || '',
    password: ''
  }
  expertTags.value = (u as any).specialty || []
  avatarFile.value = u.avatar
}

/** 选择头像并压缩为 base64（最长边 320px，足够清晰且体积极小） */
const pickAvatar = (e: Event) => {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) return store.showToast('请选择图片文件', 'error')
  const reader = new FileReader()
  reader.onload = () => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 320 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      avatarFile.value = canvas.toDataURL('image/jpeg', 0.82)
    }
    img.src = reader.result as string
  }
  reader.readAsDataURL(file)
  input.value = ''
}

const dirty = computed(
  () =>
    store.user &&
    (avatarFile.value !== store.user.avatar || JSON.stringify(pick()) !== JSON.stringify(pickOf(store.user)))
)

const pick = () => ({
  nickname: form.value.nickname.trim(),
  phone: form.value.phone.trim(),
  email: form.value.email.trim(),
  wechatId: form.value.wechatId.trim(),
  region: form.value.region,
  ...(store.isExpert && { title: form.value.title, specialty: expertTags.value }),
  ...(form.value.password ? { password: form.value.password } : {})
})

const pickOf = (u: { nickname: string; phone: string; email: string; wechatId: string; region: string; title?: string; specialty?: string[] }) => ({
  ...(store.isExpert && { title: u.title || '', specialty: u.specialty || [] }),
  nickname: u.nickname,
  phone: u.phone,
  email: u.email,
  wechatId: u.wechatId,
  region: u.region
})

const save = async () => {
  if (!store.user || saving.value) return
  if (form.value.password && form.value.password.length < 6) {
    return store.showToast('新密码至少 6 位', 'error')
  }
  saving.value = true
  try {
    const u = await api.updateProfile({ ...pick(), avatar: avatarFile.value })
    store.updateUser(u)
    form.value.password = ''
    store.showToast('资料已更新', 'success')
  } catch (e: any) {
    store.showToast(e?.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

const doLogout = async () => {
  await store.logout()
  dangerText.value = ''
  store.showToast('已退出登录', 'success')
  router.push('/')
}

const doDelete = async () => {
  try {
    await api.deleteAccount()
    await store.logout()
    dangerText.value = ''
    store.showToast('账号已注销', 'success')
    router.push('/')
  } catch (e: any) {
    store.showToast(e?.message || '注销失败', 'error')
  }
}

const logoutOnly = async () => {
  await store.logout()
  store.showToast('已退出登录', 'success')
  router.push('/')
}

const avatarInitial = computed(() => (store.user?.nickname || '农')[0])
</script>

<template>
  <div class="profile">
    <!-- 未登录：引导登录 -->
    <template v-if="!store.user">
      <div class="pf-login">
        <div class="pf-login__card">
          <span class="pf-login__icon"><AppIcon name="user" :size="30" /></span>
          <h2>登录云岭农诊</h2>
          <p>登录后可查看专家回复消息、<br />保存诊断档案并同步个人资料</p>
          <button class="pf-login__btn" @click="authOpen = true">
            <AppIcon name="arrow-right" :size="16" /> 立即登录 / 注册
          </button>
        </div>
      </div>
      <AuthSheet :open="authOpen" @close="authOpen = false" @success="fillForm" />
    </template>

    <!-- 已登录 -->
    <template v-else>
      <!-- 头部横幅 -->
      <div class="pf-hero">
        <SceneryBanner :province="provinceOfRegion(store.user.region || store.region)" :region="store.user.region || store.region" compact />
        <div class="pf-hero__row">
          <label class="pf-avatar">
            <img v-if="avatarFile" :src="avatarFile" alt="头像" />
            <span v-else class="pf-avatar__fallback">{{ avatarInitial }}</span>
            <span class="pf-avatar__edit"><AppIcon name="camera" :size="13" /></span>
            <input type="file" accept="image/*" hidden @change="pickAvatar" />
          </label>
          <div class="pf-hero__info">
            <h1>
              {{ store.user.nickname }}
              <span v-if="store.isExpert" class="pf-role pf-role--expert">专家</span>
              <span v-else class="pf-role">农户</span>
            </h1>
            <p><AppIcon name="map-pin" :size="11" /> {{ store.user.region || store.region }} · {{ defaults[store.user.region] || '山地种植户' }}</p>
            <p><AppIcon name="clock" :size="11" /> 加入于 {{ store.user.createdAt.slice(0, 10) }}</p>
          </div>
        </div>
      </div>

      <!-- 资料表单 -->
      <section class="pf-card">
        <h3 class="pf-card__title"><AppIcon name="edit" :size="14" /> 基本信息</h3>

        <label class="pf-field">
          <span>昵称</span>
          <input v-model="form.nickname" maxlength="16" placeholder="昵称" />
        </label>

        <div class="pf-grid">
          <label class="pf-field">
            <span>手机号</span>
            <input v-model="form.phone" maxlength="15" placeholder="手机号" />
          </label>
          <label class="pf-field">
            <span>邮箱</span>
            <input v-model="form.email" maxlength="40" placeholder="邮箱" />
          </label>
          <label class="pf-field">
            <span>微信号</span>
            <input v-model="form.wechatId" maxlength="30" placeholder="微信号" />
          </label>
          <label class="pf-field">
            <span>常驻地区</span>
            <input v-model="form.region" maxlength="12" placeholder="如：文山市" />
          </label>
        </div>

        <!-- 专家专属：职称与擅长领域 -->
        <template v-if="store.isExpert">
          <label class="pf-field">
            <span>职称</span>
            <input v-model="form.title" maxlength="12" placeholder="如：高级农艺师" />
          </label>
          <div class="pf-field">
            <span>擅长领域（点选，农户将据此找到您）</span>
            <div class="pf-tags">
              <button
                v-for="f in EXPERT_FIELDS"
                :key="f"
                type="button"
                class="pf-tag"
                :class="{ 'is-on': expertTags.includes(f) }"
                @click="toggleTag(f)"
              >
                {{ f }}
              </button>
            </div>
          </div>
        </template>

        <label class="pf-field">
          <span>新密码（留空则不修改）</span>
          <input v-model="form.password" type="password" maxlength="32" placeholder="••••••" />
        </label>

        <button class="pf-save" :disabled="!dirty || saving" @click="save">
          <AppIcon v-if="saving" name="loader" :size="14" class="spin" />
          {{ saving ? '保存中…' : '保存修改' }}
        </button>
      </section>

      <!-- 账号操作 -->
      <section class="pf-card">
        <h3 class="pf-card__title"><AppIcon name="shield" :size="14" /> 账号与安全</h3>

        <button class="pf-row" @click="router.push('/messages-page')">
          <span class="pf-row__icon pf-row__icon--green"><AppIcon name="bell" :size="16" /></span>
          <span class="pf-row__body">
            <strong>我的消息</strong>
            <small>专家回复与平台公告</small>
          </span>
          <em v-if="store.unread > 0" class="pf-row__badge">{{ store.unread }}</em>
          <AppIcon name="arrow-right" :size="15" class="pf-row__arrow" />
        </button>

        <button class="pf-row" @click="logoutOnly">
          <span class="pf-row__icon pf-row__icon--blue"><AppIcon name="logout" :size="16" /></span>
          <span class="pf-row__body">
            <strong>退出登录</strong>
            <small>下次仍可用本账号登录</small>
          </span>
          <AppIcon name="arrow-right" :size="15" class="pf-row__arrow" />
        </button>

        <button class="pf-row pf-row--danger" @click="dangerOpen = true">
          <span class="pf-row__icon pf-row__icon--red"><AppIcon name="alert" :size="16" /></span>
          <span class="pf-row__body">
            <strong>注销账号</strong>
            <small>删除账号与全部个人数据，不可恢复</small>
          </span>
          <AppIcon name="arrow-right" :size="15" class="pf-row__arrow" />
        </button>
      </section>

      <!-- 注销确认 -->
      <Teleport to="body">
        <Transition name="fade">
          <div v-if="dangerOpen" class="pf-danger-mask" @click.self="dangerOpen = false">
            <div class="pf-danger">
              <span class="pf-danger__icon"><AppIcon name="alert-octagon" :size="26" /></span>
              <h3>确认注销账号？</h3>
              <p>注销后将删除您的个人资料、消息记录，且无法恢复。诊断档案将保留用于科研统计（已匿名化）。</p>
              <label class="pf-danger__confirm">
                <input v-model="dangerText" placeholder="请输入「注销」以确认" maxlength="4" />
              </label>
              <div class="pf-danger__ops">
                <button class="pf-danger__btn pf-danger__btn--ghost" @click="dangerOpen = false">再想想</button>
                <button
                  class="pf-danger__btn pf-danger__btn--red"
                  :disabled="dangerText !== '注销'"
                  @click="doDelete"
                >
                  确认注销
                </button>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>
    </template>
  </div>
</template>

<style scoped>
.profile {
  padding: 0 0 40px;
}

/* 未登录 */
.pf-login {
  padding: 60px 22px;
  display: grid;
  place-items: center;
}

.pf-login__card {
  text-align: center;
  padding: 40px 34px;
  border-radius: 22px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-md);
}

.pf-login__icon {
  display: inline-grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: var(--c-primary-50);
  color: var(--c-primary-600);
  margin-bottom: 14px;
}

.pf-login__card h2 {
  font-size: 18px;
  font-weight: 800;
  color: var(--c-text-1);
}

.pf-login__card p {
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--c-text-4);
  margin: 8px 0 20px;
}

.pf-login__btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 46px;
  padding: 0 34px;
  border-radius: var(--r-full);
  font-size: 14px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  box-shadow: 0 8px 20px rgba(var(--c-primary-rgb), 0.28);
}

/* 头部 */
.pf-hero {
  position: relative;
  padding-bottom: 0;
}

.pf-hero__row {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  padding: 0 20px;
  margin-top: -34px;
  position: relative;
  z-index: 1;
}

.pf-avatar {
  position: relative;
  width: 84px;
  height: 84px;
  border-radius: 26px;
  overflow: visible;
  cursor: pointer;
  flex-shrink: 0;
  background: #fff;
  border: 3px solid #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}

.pf-avatar img,
.pf-avatar__fallback {
  width: 100%;
  height: 100%;
  border-radius: 23px;
  object-fit: cover;
  display: block;
}

.pf-avatar__fallback {
  display: grid;
  place-items: center;
  font-size: 30px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
}

.pf-avatar__edit {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--c-primary-600);
  border: 2.5px solid #fff;
}

.pf-hero__info h1 {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 19px;
  font-weight: 800;
  color: var(--c-text-1);
  padding-bottom: 6px;
}

.pf-role {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 9px;
  border-radius: var(--r-full);
  background: var(--c-primary-50);
  color: var(--c-primary-700);
}

.pf-role--expert {
  background: var(--c-accent-100);
  color: var(--c-accent-600);
}

.pf-hero__info p {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--c-text-4);
  margin-top: 3px;
}

/* 卡片 */
.pf-card {
  margin: 16px 16px 0;
  padding: 16px 16px 18px;
  border-radius: 18px;
  background: var(--c-bg-card);
  border: 1px solid var(--c-line-soft);
  box-shadow: var(--sh-xs);
}

.pf-card__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 800;
  color: var(--c-text-1);
  margin-bottom: 13px;
}

.pf-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 11px;
}

.pf-field span {
  font-size: 11px;
  font-weight: 700;
  color: var(--c-text-3);
}

.pf-field input {
  height: 42px;
  padding: 0 12px;
  border-radius: 11px;
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-subtle);
  font-size: 13px;
  color: var(--c-text-1);
  transition: border-color var(--dur-fast), background var(--dur-fast);
}

.pf-field input:focus {
  border-color: var(--c-primary-400);
  background: #fff;
}

.pf-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}

.pf-save {
  width: 100%;
  height: 44px;
  border-radius: var(--r-full);
  font-size: 13.5px;
  font-weight: 800;
  color: #fff;
  background: linear-gradient(135deg, var(--c-primary-500), var(--c-primary-700));
  box-shadow: 0 6px 16px rgba(var(--c-primary-rgb), 0.26);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 4px;
}

.pf-save:disabled {
  opacity: 0.45;
  box-shadow: none;
}

/* 操作行 */
.pf-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 4px;
  border-bottom: 1px solid var(--c-line-soft);
  text-align: left;
}

.pf-row:last-child {
  border-bottom: none;
  padding-bottom: 4px;
}

.pf-row__icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.pf-row__icon--green {
  background: #e8f7ee;
  color: #1a7f45;
}

.pf-row__icon--blue {
  background: #e8f2ff;
  color: #2563eb;
}

.pf-row__icon--red {
  background: #fdeceb;
  color: #b4342f;
}

.pf-row__body {
  flex: 1;
  min-width: 0;
}

.pf-row__body strong {
  display: block;
  font-size: 13.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.pf-row__body small {
  font-size: 10.5px;
  color: var(--c-text-4);
}

.pf-row__badge {
  font-style: normal;
  font-size: 10.5px;
  font-weight: 800;
  color: #fff;
  background: var(--c-danger);
  min-width: 19px;
  height: 19px;
  border-radius: var(--r-full);
  display: grid;
  place-items: center;
  padding: 0 5px;
}

.pf-row__arrow {
  color: var(--c-text-4);
}

.pf-row--danger strong {
  color: var(--c-danger);
}

/* 注销确认 */
.pf-danger-mask {
  position: fixed;
  inset: 0;
  z-index: 150;
  background: rgba(30, 14, 12, 0.5);
  backdrop-filter: blur(3px);
  display: grid;
  place-items: center;
  padding: 22px;
}

.pf-danger {
  width: min(360px, 100%);
  padding: 26px 22px 20px;
  border-radius: 20px;
  background: #fff;
  text-align: center;
}

.pf-danger__icon {
  display: inline-grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border-radius: 50%;
  color: var(--c-danger);
  background: #fdeceb;
  margin-bottom: 10px;
}

.pf-danger h3 {
  font-size: 16.5px;
  font-weight: 800;
  color: var(--c-text-1);
}

.pf-danger p {
  font-size: 12px;
  line-height: 1.75;
  color: var(--c-text-3);
  margin: 8px 0 14px;
}

.pf-danger__confirm input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border-radius: 11px;
  border: 1.5px solid var(--c-line);
  background: var(--c-bg-subtle);
  font-size: 13px;
  text-align: center;
}

.pf-danger__ops {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.pf-danger__btn {
  flex: 1;
  height: 42px;
  border-radius: var(--r-full);
  font-size: 13.5px;
  font-weight: 700;
}

.pf-danger__btn--ghost {
  background: var(--c-bg-muted);
  color: var(--c-text-2);
}

.pf-danger__btn--red {
  background: var(--c-danger);
  color: #fff;
}

.pf-danger__btn--red:disabled {
  opacity: 0.4;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.22s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.pf-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 8px;
}

.pf-tag {
  height: 30px;
  padding: 0 13px;
  border-radius: var(--r-full);
  font-size: 12px;
  color: var(--c-text-2);
  background: var(--c-bg-muted);
  border: 1px solid transparent;
  transition: all var(--dur-fast);
}

.pf-tag.is-on {
  color: #fff;
  font-weight: 700;
  background: var(--c-primary-600);
}
</style>
