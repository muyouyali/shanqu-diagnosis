import { createApp } from 'vue'

// 应用启动时间戳：供 api 层判断 401 是否发生在首屏加载（静默清理，不弹提示）
;(window as any).__ylnz_booted = Date.now()
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/tokens.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)

/**
 * v-reveal：滚动渐入指令
 * 用法 <div v-reveal> 或 <div v-reveal="120">（毫秒级延迟）
 */
const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        ;(e.target as HTMLElement).classList.add('is-in')
        observer.unobserve(e.target)
      }
    }
  },
  { threshold: 0.08 }
)

app.directive('reveal', {
  mounted(el: HTMLElement, binding) {
    el.classList.add('reveal')
    if (binding.value) el.style.setProperty('--reveal-delay', `${binding.value}ms`)
    observer.observe(el)
  }
})

app.mount('#app')
