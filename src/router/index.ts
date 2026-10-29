import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('@/layouts/MobileLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('@/views/Home.vue'), meta: { title: '首页' } },
      {
        path: 'diagnose',
        name: 'diagnose',
        component: () => import('@/views/Diagnose.vue'),
        meta: { title: '智能诊断' }
      },
      {
        path: 'result/:id',
        name: 'result',
        component: () => import('@/views/Result.vue'),
        meta: { title: '诊断结果' }
      },
      {
        path: 'qa',
        name: 'qa',
        component: () => import('@/views/QA.vue'),
        meta: { title: '农技问答' }
      },
      {
        path: 'archive',
        name: 'archive',
        component: () => import('@/views/Archive.vue'),
        meta: { title: '我的档案' }
      },
      {
        path: 'knowledge',
        name: 'knowledge',
        component: () => import('@/views/Knowledge.vue'),
        meta: { title: '病害图谱' }
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/Profile.vue'),
        meta: { title: '个人中心' }
      },
      {
        path: 'ask-expert',
        name: 'ask-expert',
        component: () => import('@/views/AskExpert.vue'),
        meta: { title: '向专家提问' }
      },
      {
        path: 'messages-page',
        name: 'messages-page',
        component: () => import('@/views/MessagesPage.vue'),
        meta: { title: '我的消息' }
      },
      {
        path: 'knowledge/:diseaseId',
        name: 'disease-detail',
        component: () => import('@/views/DiseaseDetail.vue'),
        meta: { title: '病害详情' }
      }
    ]
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    // 角色守卫：仅专家可进入农技站后台
    beforeEnter: async () => {
      const { useAppStore } = await import('@/stores/app')
      const store = useAppStore()
      await store.restoreUser()
      if (!store.user) return { path: '/', query: { need: 'login' } }
      if (store.user.role !== 'expert') return { path: '/profile' }
      return true
    },
    children: [
      {
        path: '',
        name: 'admin-dashboard',
        component: () => import('@/views/admin/Dashboard.vue'),
        meta: { title: '数据看板' }
      },
      {
        path: 'records',
        name: 'admin-records',
        component: () => import('@/views/admin/Records.vue'),
        meta: { title: '诊断记录' }
      },
      {
        path: 'crops',
        name: 'admin-crop',
        component: () => import('@/views/admin/CropReview.vue'),
        meta: { title: '作物审核' }
      },
      {
        path: 'alert',
        name: 'admin-alert',
        component: () => import('@/views/admin/Alert.vue'),
        meta: { title: '区域预警' }
      },
      {
        path: 'review',
        name: 'admin-review',
        component: () => import('@/views/admin/Review.vue'),
        meta: { title: '人工复核' }
      },
      {
        path: 'notify',
        name: 'admin-notify',
        component: () => import('@/views/admin/Notify.vue'),
        meta: { title: '消息通知' }
      },
      {
        path: 'system',
        name: 'admin-system',
        component: () => import('@/views/admin/System.vue'),
        meta: { title: '系统状态' }
      }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.afterEach((to) => {
  const base = '云岭农诊'
  document.title = to.meta.title ? `${to.meta.title} · ${base}` : base
})

export default router
