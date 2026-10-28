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
