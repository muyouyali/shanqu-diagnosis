<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import AppIcon from '@/components/AppIcon.vue'

const store = useAppStore()
const open = ref(false)
const activeProvince = ref('云南')

/** 全国省级行政区（云南为主产区置顶，山地特色省份次之，其余省份均可查询使用） */
const provinces: { name: string; note: string; groups: { group: string; items: string[] }[] }[] = [
  {
    name: '云南',
    note: '主产区 · 全部州市',
    groups: [
      {
        group: '重点产区',
        items: ['文山市', '昭通市', '普洱市', '大理白族自治州', '红河州', '曲靖市']
      },
      {
        group: '其他州市',
        items: [
          '昆明市', '丽江市', '临沧市', '保山市', '西双版纳州', '楚雄州',
          '玉溪市', '德宏州', '怒江州', '迪庆州'
        ]
      }
    ]
  },
  {
    name: '贵州',
    note: '山地农业重点省',
    groups: [
      {
        group: '主要区域',
        items: ['遵义市', '毕节市', '黔东南州', '黔南州', '安顺市', '六盘水市', '铜仁市', '黔西南州', '贵阳市']
      }
    ]
  },
  {
    name: '四川',
    note: '盆周山地区域',
    groups: [
      {
        group: '主要区域',
        items: ['凉山州', '雅安市', '甘孜州', '阿坝州', '宜宾市', '泸州市', '乐山市', '达州市', '攀枝花市', '成都市']
      }
    ]
  },
  {
    name: '重庆',
    note: '三峡库区山地',
    groups: [
      {
        group: '主要区域',
        items: ['万州区', '涪陵区', '黔江区', '奉节县', '巫山县', '城口县', '酉阳县', '武隆区', '重庆市中心城区']
      }
    ]
  },
  {
    name: '广西',
    note: '亚热带山地区域',
    groups: [
      {
        group: '主要区域',
        items: ['百色市', '河池市', '桂林市', '柳州市', '崇左市', '来宾市', '贺州市', '梧州市', '南宁市']
      }
    ]
  },
  {
    name: '西藏',
    note: '高原特色种植',
    groups: [
      {
        group: '主要区域',
        items: ['林芝市', '昌都市', '山南市', '日喀则市', '拉萨市']
      }
    ]
  },
  {
    name: '湖南',
    note: '丘陵山地',
    groups: [{ group: '主要区域', items: ['怀化市', '邵阳市', '永州市', '郴州市', '湘西州', '张家界市', '长沙市'] }]
  },
  {
    name: '湖北',
    note: '鄂西山地',
    groups: [{ group: '主要区域', items: ['恩施州', '十堰市', '宜昌市', '黄冈市', '随州市', '武汉市'] }]
  },
  {
    name: '广东',
    note: '南岭山地',
    groups: [{ group: '主要区域', items: ['韶关市', '梅州市', '清远市', '河源市', '云浮市', '肇庆市', '广州市'] }]
  },
  {
    name: '福建',
    note: '武夷茶果产区',
    groups: [{ group: '主要区域', items: ['南平市', '三明市', '龙岩市', '宁德市', '漳州市', '福州市'] }]
  },
  {
    name: '浙江',
    note: '丘陵茶产区',
    groups: [{ group: '主要区域', items: ['丽水市', '衢州市', '温州市', '杭州市', '绍兴市', '金华市'] }]
  },
  {
    name: '江西',
    note: '赣南果业山区',
    groups: [{ group: '主要区域', items: ['赣州市', '吉安市', '抚州市', '上饶市', '九江市', '南昌市'] }]
  },
  {
    name: '陕西',
    note: '秦巴山地',
    groups: [{ group: '主要区域', items: ['汉中市', '安康市', '商洛市', '宝鸡市', '延安市', '西安市'] }]
  },
  {
    name: '甘肃',
    note: '黄土高原山地',
    groups: [{ group: '主要区域', items: ['陇南市', '天水市', '定西市', '平凉市', '兰州市', '张掖市'] }]
  },
  {
    name: '海南',
    note: '热带经济作物',
    groups: [{ group: '主要区域', items: ['三亚市', '五指山市', '琼中县', '保亭县', '海口市', '儋州市'] }]
  },
  {
    name: '安徽',
    note: '皖南山区',
    groups: [{ group: '主要区域', items: ['黄山市', '六安市', '宣城市', '池州市', '安庆市', '合肥市'] }]
  },
  {
    name: '河南',
    note: '豫西山区',
    groups: [{ group: '主要区域', items: ['洛阳市', '三门峡市', '南阳市', '信阳市', '郑州市'] }]
  },
  {
    name: '山西',
    note: '太行吕梁山区',
    groups: [{ group: '主要区域', items: ['晋城市', '长治市', '临汾市', '吕梁市', '忻州市', '太原市'] }]
  },
  {
    name: '山东',
    note: '鲁中山区',
    groups: [{ group: '主要区域', items: ['临沂市', '烟台市', '泰安市', '潍坊市', '青岛市', '济南市'] }]
  },
  {
    name: '河北',
    note: '燕山太行山区',
    groups: [{ group: '主要区域', items: ['承德市', '张家口市', '保定市', '邢台市', '石家庄市'] }]
  },
  {
    name: '辽宁',
    note: '辽东山地',
    groups: [{ group: '主要区域', items: ['本溪市', '丹东市', '抚顺市', '铁岭市', '沈阳市', '大连市'] }]
  },
  {
    name: '吉林',
    note: '长白山区',
    groups: [{ group: '主要区域', items: ['延边州', '通化市', '白山市', '吉林市', '长春市'] }]
  },
  {
    name: '黑龙江',
    note: '大小兴安岭',
    groups: [{ group: '主要区域', items: ['黑河市', '伊春市', '牡丹江市', '大兴安岭地区', '哈尔滨市'] }]
  },
  {
    name: '江苏',
    note: '丘陵岗地',
    groups: [{ group: '主要区域', items: ['南京市', '镇江市', '常州市', '连云港市', '苏州市'] }]
  },
  {
    name: '内蒙古',
    note: '高原农牧交错带',
    groups: [{ group: '主要区域', items: ['赤峰市', '通辽市', '乌兰察布市', '呼伦贝尔市', '呼和浩特市'] }]
  },
  {
    name: '宁夏',
    note: '六盘山片区',
    groups: [{ group: '主要区域', items: ['固原市', '中卫市', '吴忠市', '银川市'] }]
  },
  {
    name: '青海',
    note: '高原冷凉作物',
    groups: [{ group: '主要区域', items: ['海东市', '西宁市', '黄南州', '海北州'] }]
  },
  {
    name: '新疆',
    note: '绿洲特色林果',
    groups: [{ group: '主要区域', items: ['阿克苏地区', '喀什地区', '伊犁州', '和田地区', '乌鲁木齐市'] }]
  },
  {
    name: '北京',
    note: '京郊山区',
    groups: [{ group: '主要区域', items: ['密云区', '延庆区', '怀柔区', '门头沟区', '北京市区'] }]
  },
  {
    name: '天津',
    note: '津北山区',
    groups: [{ group: '主要区域', items: ['蓟州区', '天津市中心城区'] }]
  },
  {
    name: '上海',
    note: '都市近郊农业',
    groups: [{ group: '主要区域', items: ['崇明区', '金山区', '奉贤区', '上海市中心城区'] }]
  },
  {
    name: '台湾',
    note: '中国台湾 · 高山农业',
    groups: [{ group: '主要区域', items: ['南投县', '嘉义县', '台东县', '花莲县', '屏东县'] }]
  }
]

const currentProvince = computed(
  () => provinces.find((p) => p.name === activeProvince.value) || provinces[0]
)

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

            <!-- 省份 Tab -->
            <div class="prov-tabs">
              <button
                v-for="p in provinces"
                :key="p.name"
                class="prov-tab"
                :class="{ 'is-active': activeProvince === p.name }"
                @click="activeProvince = p.name"
              >
                {{ p.name }}
                <i v-if="p.name === '云南'" class="prov-tab__badge">主产区</i>
              </button>
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

/* 省份 Tab */
.prov-tabs {
  display: flex;
  gap: 6px;
  padding: 10px 20px 0;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}

.prov-tabs::-webkit-scrollbar {
  display: none;
}

.prov-tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  border-radius: var(--r-full);
  background: var(--c-bg-muted);
  border: 1.5px solid var(--c-line-soft);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--c-text-3);
  white-space: nowrap;
  transition: all var(--dur-fast);
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
