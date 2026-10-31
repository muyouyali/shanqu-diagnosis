/**
 * 启动时 IP 静默定位（每次会话最多一次，不打扰、不弹权限）
 * - 已由用户手动选择过地区（ylnz_region_pinned）则不再覆盖
 * - 定位到云南州市才应用；识别不到保持默认
 */
import { useAppStore } from '@/stores/app'
import { matchRegionOf } from '@/data/regions'

const PIN_FLAG = 'ylnz_region_pinned'
const AUTO_FLAG = 'ylnz_geo_done'

export const autoLocateOnce = async () => {
  const store = useAppStore()
  if (localStorage.getItem(AUTO_FLAG) || localStorage.getItem(PIN_FLAG)) return
  localStorage.setItem(AUTO_FLAG, '1')
  try {
    let name = ''
    try {
      const r = await fetch('https://api.bigdatacloud.net/data/client-info', {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(6000)
      })
      if (r.ok) {
        const j = await r.json()
        name = j.city || j.principalSubdivision || ''
      }
    } catch { /* 下一个 */ }
    if (!name) {
      try {
        const r = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(6000) })
        if (r.ok) {
          const j = await r.json()
          name = j.city || j.region || ''
        }
      } catch { /* 放弃 */ }
    }
    if (!name) return
    const matched = matchRegionOf(name)
    if (matched && matched !== store.region) {
      store.setRegion(matched)
      store.showToast(`已按当前网络位置定位到 ${matched}，天气与作物随之更新`, 'success')
    }
  } catch {
    /* 静默失败，保留默认地区 */
  }
}
