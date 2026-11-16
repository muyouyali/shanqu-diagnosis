/**
 * 病害症状实拍图映射：病害 id → 图片文件
 * 图片存放于 /diseases/img/{id}.jpg（720×540，4:3）
 * 未收录的病害自动回退到作物实拍图
 */
const SET = new Set([
  'tea-blister-blight', 'tea-anthracnose', 'tea-green-leafhopper', 'tea-tea-moth',
  'tm-tuber-rot', 'tm-black-spot', 'tm-soft-rot', 'wn-bacterial-blight', 'wn-anthracnose',
  'wn-blight', 'wn-moth', 'hj-rust', 'hj-aphid', 'my-soft-rot', 'my-stem-rot',
  'sl-dry-rot', 'sl-scab', 'cf-rust', 'cf-cbd', 'rice-blast', 'rice-sheath-blight',
  'maize-northern-blight', 'maize-southern-rust', 'potato-late-blight', 'potato-early-blight',
  'tobacco-black-shank', 'tobacco-mosaic', 'sugarcane-top-rot', 'sugarcane-smut',
  'mango-anthracnose', 'mango-powdery', 'banana-leaf-spot', 'banana-fusarium-wilt',
  'dragonfruit-canker', 'dragonfruit-stem-rot', 'strawberry-gray-mold', 'strawberry-powdery',
  'kiwi-canker', 'kiwi-brown-spot', 'tomato-late-blight', 'tomato-virus',
  'pepper-phytophthora', 'pepper-anthracnose', 'cucumber-downy', 'cucumber-powdery',
  'grape-downy', 'grape-white-rot', 'peach-brown-rot', 'peach-bacterial-shot-hole',
  'ginger-bacterial-wilt', 'ginger-anthracnose', 'shiitake-trichoderma', 'shiitake-rot',
  'chonglou-root-rot', 'chonglou-leaf-spot', 'huangjing-root-rot', 'huangjing-leaf-blight',
  'peanut-leaf-spot', 'peanut-rust', 'sq-root-rot', 'sq-black-spot', 'sq-blught',
  'sq-grey-mold', 'bb-grey-mold', 'bb-stem-blight', 'bb-mummy', 'bb-chlorosis',
  'bb-leaf-spot', 'ct-hlb', 'ct-canker', 'ct-anthracnose', 'ct-mite', 'ct-leafminer'
])

/** 获取病害症状实拍图地址（无则返回 null） */
export const diseaseImageOf = (diseaseId: string): string | null =>
  SET.has(diseaseId) ? `/diseases/img/${diseaseId}.jpg` : null
