/**
 * 作物真实照片映射（替代卡通 emoji 图标）
 * 照片来源：维基百科文章主图（公有领域 / CC 授权），本地存放于 public/crops/img/
 */
const EMOJI_IMG: Record<string, string> = {
  '🫐': 'blueberry',
  '🍊': 'mandarin',
  '🍎': 'apple',
  '🍃': 'tea',
  '🌰': 'chestnut',
  '🌶️': 'chili',
  '🌶': 'chili',
  '🍅': 'tomato',
  '☕': 'coffee',
  '🌾': 'rice',
  '🌽': 'maize',
  '🥔': 'potato',
  '🍂': 'tobacco',
  '🎋': 'sugarcane',
  '🥜': 'peanut',
  '🥭': 'mango',
  '🍌': 'banana',
  '🐉': 'dragonfruit',
  '🍓': 'strawberry',
  '🥝': 'kiwifruit',
  '🍇': 'grape',
  '🍑': 'peach',
  '🥒': 'cucumber',
  '🍄': 'shiitake',
  '🌿': 'ginseng',
  '🌱': 'seedling',
  '🍐': 'pear',
  '🍋': 'lemon',
  '🍈': 'melon',
  '🥬': 'cabbage',
  '🌹': 'rose',
  '🌻': 'sunflower',
  '🌼': 'chrysanth',
  '🍯': 'honey',
  '🍍': 'pineapple',
  '🍒': 'cherry',
  '🟣': 'konjac',
}

/** 名称精确覆盖：同一 emoji 被多种作物共用时，按名称给出正确照片 */
const NAME_OVERRIDES: Array<[string, string]> = [
  ['魔芋', 'konjac'],
  ['杨梅', 'bayberry'],
  ['枣', 'jujube'],
  ['枸杞', 'goji'],
  ['荔枝', 'lychee'],
  ['龙眼', 'longan'],
  ['李', 'plum'],
  ['杏', 'apricot'],
  ['无花果', 'fig'],
  ['枇杷', 'loquat'],
  ['柿', 'persimmon'],
  ['石榴', 'pomegranate'],
  ['银杏', 'ginkgo'],
  ['板栗', 'chestnut'],
  ['山核桃', 'walnut'],
  ['核桃', 'walnut'],
  ['天麻', 'tianma'],
  ['花椒', 'pepper-tian'],
  ['生姜', 'ginger'],
  ['重楼', 'chonglou'],
  ['黄精', 'huangjing'],
]

const cache: Record<string, string> = {}

/** 解析作物对应的真实照片路径；无匹配返回 null（调用方可回退 emoji） */
export function cropImageOf(emoji?: string, name?: string): string | null {
  if (name) {
    for (const [kw, key] of NAME_OVERRIDES) {
      if (name.includes(kw)) {
        cache[key] = cache[key] || `/crops/img/${key}.jpg`
        return cache[key]
      }
    }
  }
  if (emoji && EMOJI_IMG[emoji]) {
    const key = EMOJI_IMG[emoji]
    cache[key] = cache[key] || `/crops/img/${key}.jpg`
    return cache[key]
  }
  return null
}
