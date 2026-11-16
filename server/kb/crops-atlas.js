/**
 * 山地作物百科：全国各省特色作物图谱
 * - 与知识库 CROPS（含完整病害知识）配合：省份命中的知识库作物 + 本表百科作物 = 当地作物全集
 * - ATLAS 为省级兜底条目；ATLAS_CITY 为州市级条目，命中时优先于省级（避免他市特产串位）
 * - 百科作物可被 AI 问答咨询，也支持用户提交新作物经审核后并入
 */

/** 州市级百科作物（真实地方特产，优先级高于省级） */
export const ATLAS_CITY = {
  // 西藏
  '昌都市': [
    { name: '昌都醉梨', emoji: '🍐', desc: '藏东高原名梨，肉细汁多、酸甜浓香，昌都河谷特产', season: '9–10月', altitude: '2800–3400m' },
    { name: '芒康葡萄', emoji: '🍇', desc: '澜沧江河谷葡萄酒原料，盐井千年红酒产区', season: '9–10月', altitude: '2300–2800m' },
    { name: '八宿荞麦', emoji: '🌾', desc: '高原苦荞，黄酮含量高，藏东健康杂粮', season: '8–10月', altitude: '2800–3300m' }
  ],
  '林芝市': [
    { name: '林芝苹果', emoji: '🍎', desc: '雪域高原苹果，糖心、着色艳、耐储运', season: '10–11月', altitude: '2900–3300m' },
    { name: '林芝松茸', emoji: '🍄', desc: '出口级松茸，青藏高原林下珍稀食用菌', season: '7–9月', altitude: '3000–4000m' },
    { name: '墨脱香蕉', emoji: '🍌', desc: '藏南峡谷热区香蕉，低海拔河谷特产', season: '全年', altitude: '800–1500m' }
  ],
  '拉萨市': [
    { name: '曲水土豆', emoji: '🥔', desc: '拉萨河谷沙壤马铃薯，口感沙糯、品质佳', season: '8–10月', altitude: '3600–3800m' },
    { name: '堆龙青稞', emoji: '🌾', desc: '拉萨河谷青稞，糌粑与青稞酒优质原料', season: '8–9月', altitude: '3600–3900m' },
    { name: '高原藏红花', emoji: '🌺', desc: '温室设施栽培藏红花，柱头为名贵药材食材', season: '10–11月采花', altitude: '3600–3800m' }
  ],
  '日喀则市': [
    { name: '艾玛土豆', emoji: '🥔', desc: '南木林艾玛沟高原马铃薯，个大皮薄，国家地理标志产品', season: '9–10月', altitude: '3800–4100m' },
    { name: '江孜青稞', emoji: '🌾', desc: '年楚河谷青稞核心产区，西藏粮仓名品', season: '8–9月', altitude: '3900–4100m' },
    { name: '亚东黑木耳', emoji: '🍄', desc: '亚东椴木黑木耳，朵小肉厚，高原林下珍品', season: '全年多茬', altitude: '2800–3400m' }
  ],
  '山南市': [
    { name: '隆子黑青稞', emoji: '🌾', desc: '黑青稞稀有品种，花青素含量高，山南特产', season: '8–9月', altitude: '3800–4200m' },
    { name: '加查核桃', emoji: '🌰', desc: '雅鲁藏布河谷千年核桃，皮薄仁香出油高', season: '9–10月', altitude: '3200–3600m' },
    { name: '错那茶叶', emoji: '🍃', desc: '勒布沟高原茶园，藏地新兴茶产区', season: '4–9月采制', altitude: '2400–2800m' }
  ],
  '那曲市': [
    { name: '那曲冬虫夏草', emoji: '🍄', desc: '世界屋脊冬虫夏草核心产区，道地药材之王', season: '5–7月采挖', altitude: '4500–5200m' },
    { name: '高原芫根', emoji: '🥬', desc: '羌塘高原芫根（蔓菁），耐寒药食两用块根', season: '9–10月', altitude: '4200–4600m' }
  ],
  '阿里地区': [
    { name: '普兰青稞', emoji: '🌾', desc: '孔雀河谷高原青稞，阿里主要口粮作物', season: '8–9月', altitude: '3800–4200m' },
    { name: '狮泉河棚栽蔬菜', emoji: '🥬', desc: '高原日光温室蔬菜，阿里城镇保供产业', season: '全年设施', altitude: '4200–4300m' }
  ],
  // 云南重点州市
  '昆明市': [
    { name: '呈贡宝珠梨', emoji: '🍐', desc: '滇池畔古树宝珠梨，皮薄汁多、脆甜微香', season: '8–10月', altitude: '1900–2100m' },
    { name: '安宁食用玫瑰', emoji: '🌹', desc: '安宁玫瑰，鲜花饼原料，花冠厚实香气浓', season: '3–5月', altitude: '1800–2200m' },
    { name: '富民甜柿', emoji: '🧡', desc: '高原甜柿，自然脱涩脆甜，国家地理标志产品', season: '9–11月', altitude: '1700–2100m' }
  ],
  '昭通市': [
    { name: '昭通苹果', emoji: '🍎', desc: '高原糖心苹果，昼夜温差大、着色好、脆甜多汁', season: '9–11月', altitude: '1900–2400m' },
    { name: '鲁甸花椒', emoji: '🫧', desc: '鲁甸青花椒，麻香浓郁，高原河谷主产', season: '7–8月', altitude: '1500–2000m' },
    { name: '巧家石榴', emoji: '🍎', desc: '金沙江河谷软籽石榴，果大籽软汁甜', season: '8–10月', altitude: '900–1400m' }
  ],
  '曲靖市': [
    { name: '宣威马铃薯', emoji: '🥔', desc: '高山马铃薯，干物质高、口感沙糯', season: '7–11月', altitude: '1800–2600m' },
    { name: '会泽盐水石榴', emoji: '🍎', desc: '国家地理标志石榴，籽软汁甜、皮薄色艳', season: '8–10月', altitude: '1500–1900m' },
    { name: '罗平小黄姜', emoji: '🧄', desc: '国家地理标志小黄姜，姜辣素含量高', season: '10–12月采挖', altitude: '1400–1900m' }
  ],
  '玉溪市': [
    { name: '元江芒果', emoji: '🥭', desc: '干热河谷早熟芒果，台农贵妃品种丰富', season: '4–7月', altitude: '400–800m' },
    { name: '华宁柑橘', emoji: '🍊', desc: '盘溪柑橘，早熟蜜橘皮薄化渣', season: '10–12月', altitude: '1200–1600m' },
    { name: '通海蔬菜', emoji: '🥬', desc: '滇中蔬菜外销基地，花菜葱蒜四季不断', season: '全年多茬', altitude: '1800–1900m' }
  ],
  '保山市': [
    { name: '保山小粒咖啡', emoji: '☕', desc: '怒江河谷阿拉比卡咖啡，浓而不苦、香而不烈', season: '10–次年2月', altitude: '1000–1400m' },
    { name: '昌宁核桃', emoji: '🌰', desc: '国家地理标志核桃，壳薄仁白、香味醇厚', season: '9–10月', altitude: '1700–2200m' },
    { name: '腾冲乌龙茶', emoji: '🍃', desc: '高黎贡山乌龙茶，高山云雾出好茶', season: '3–10月采制', altitude: '1600–2200m' }
  ],
  '丽江市': [
    { name: '丽江雪桃', emoji: '🍑', desc: '国庆前后上市的高原晚熟雪桃，个大色艳', season: '9–10月', altitude: '1900–2500m' },
    { name: '华坪芒果', emoji: '🥭', desc: '全国晚熟芒果之乡，金沙江干热河谷主产', season: '8–11月', altitude: '1000–1600m' },
    { name: '永胜软籽石榴', emoji: '🍎', desc: '程海湖畔软籽石榴，个大籽软汁多', season: '8–10月', altitude: '1500–1700m' }
  ],
  '普洱市': [
    { name: '墨江紫米', emoji: '🌾', desc: '国家地理标志紫米，花青素含量高、米香浓', season: '9–11月', altitude: '1300–1700m' },
    { name: '景东核桃', emoji: '🌰', desc: '无量山核桃，壳薄仁香、出油率高', season: '9–10月', altitude: '1500–2100m' },
    { name: '澜沧古树茶', emoji: '🍃', desc: '景迈山古茶林，千年万亩古茶树群落', season: '3–11月采制', altitude: '1400–1800m' }
  ],
  '临沧市': [
    { name: '临沧坚果', emoji: '🌰', desc: '澳洲坚果（夏威夷果）亚洲主产区之一', season: '8–10月', altitude: '900–1500m' },
    { name: '耿马甘蔗', emoji: '🎋', desc: '孟定河谷糖料甘蔗，含糖量高', season: '11–次年3月榨季', altitude: '500–1100m' },
    { name: '勐库大叶茶', emoji: '🍃', desc: '双江勐库大叶种茶，冰岛昔归名山茶核心产区', season: '3–11月采制', altitude: '1400–2000m' }
  ],
  '大理白族自治州': [
    { name: '漾濞核桃', emoji: '🌰', desc: '中国核桃之乡，果大壳薄、仁白味香', season: '9–10月', altitude: '1700–2300m' },
    { name: '宾川葡萄', emoji: '🍇', desc: '高原早熟葡萄，红提种植面积全国前列', season: '6–9月', altitude: '1400–1700m' },
    { name: '洱源梅子', emoji: '🫐', desc: '国家地理标志梅子，果大肉厚酸香', season: '5–7月', altitude: '1800–2400m' }
  ],
  '楚雄州': [
    { name: '元谋番茄', emoji: '🍅', desc: '冬早番茄外销基地，南菜北运核心产区', season: '11–次年4月', altitude: '1100–1400m' },
    { name: '大姚核桃', emoji: '🌰', desc: '国家地理标志核桃，果仁饱满香味浓', season: '9–10月', altitude: '1700–2300m' },
    { name: '双柏魔芋', emoji: '🟣', desc: '哀牢山魔芋，葡甘聚糖含量高', season: '10–12月采挖', altitude: '1500–2100m' }
  ],
  '红河州': [
    { name: '蒙自石榴', emoji: '🍎', desc: '国家地理标志石榴，果大皮薄、籽软汁甜', season: '8–10月', altitude: '1200–1600m' },
    { name: '石屏杨梅', emoji: '🫐', desc: '高原早熟杨梅，个大汁多、酸甜适口', season: '4–6月', altitude: '1400–1800m' },
    { name: '建水柑橘', emoji: '🍊', desc: '低热河谷蜜橘，皮薄化渣、酸甜多汁', season: '10–次年1月', altitude: '900–1400m' }
  ],
  '文山州': [
    { name: '丘北辣椒', emoji: '🌶️', desc: '国家地理标志辣椒，小籽粒浓香型干椒', season: '8–10月', altitude: '1400–1900m' },
    { name: '广南八宝米', emoji: '🌾', desc: '贡米之乡，粒大色白、清香软糯', season: '9–11月', altitude: '1100–1500m' },
    { name: '马关草果', emoji: '🌿', desc: '边境山区草果，香料药用双价值', season: '10–12月采果', altitude: '1200–1800m' }
  ],
  '西双版纳州': [
    { name: '小糯玉米', emoji: '🌽', desc: '傣家糯玉米，香糯软甜、即蒸即食', season: '全年多茬', altitude: '500–1000m' },
    { name: '勐海茶', emoji: '🍃', desc: '普洱茶核心产区，布朗山南糯山古茶园', season: '3–11月采制', altitude: '1200–1900m' },
    { name: '景洪芒果', emoji: '🥭', desc: '热区反季节芒果，台农贵妃品种多', season: '3–7月', altitude: '500–900m' }
  ],
  '怒江州': [
    { name: '怒江草果', emoji: '🌿', desc: '独龙江河谷草果，国家地理标志香料', season: '10–12月', altitude: '1200–2000m' },
    { name: '贡山核桃', emoji: '🌰', desc: '怒江大峡谷高山核桃，仁香出油高', season: '9–10月', altitude: '1800–2600m' }
  ],
  '迪庆州': [
    { name: '香格里拉松茸', emoji: '🍄', desc: '出口级鲜松茸，横断高山栎林下珍稀菌', season: '7–9月', altitude: '3000–3800m' },
    { name: '德钦酿酒葡萄', emoji: '🍇', desc: '澜沧江峡谷冰酒原料葡萄，日照足糖度高', season: '9–10月', altitude: '2200–2800m' },
    { name: '维西核桃', emoji: '🌰', desc: '澜沧江畔泡核桃，壳薄仁香', season: '9–10月', altitude: '1800–2400m' }
  ],
  // 四川重点州市
  '乐山市': [
    { name: '犍为茉莉花', emoji: '🌼', desc: '茉莉花茶窨制原料，花冠饱满香气清冽', season: '6–9月', altitude: '400–700m' },
    { name: '沐川猕猴桃', emoji: '🥝', desc: '红心猕猴桃新产区，果肉细嫩酸甜', season: '8–10月', altitude: '700–1300m' },
    { name: '马边绿茶', emoji: '🍃', desc: '高山绿茶，森林覆盖率高、云雾多', season: '3–9月采制', altitude: '800–1500m' }
  ],
  '凉山州': [
    { name: '盐源苹果', emoji: '🍎', desc: '高原苹果，日照足、糖度高达 16°+', season: '10–11月', altitude: '2300–2700m' },
    { name: '会理石榴', emoji: '🍎', desc: '中国石榴之乡，软籽石榴种植面积全国前列', season: '8–10月', altitude: '1500–1900m' },
    { name: '雷波脐橙', emoji: '🍊', desc: '金沙江河谷脐橙，皮薄化渣、甜酸爽口', season: '11–次年1月', altitude: '500–1000m' }
  ],
  '成都市': [
    { name: '蒲江猕猴桃', emoji: '🥝', desc: '红心猕猴桃，国家地理标志产品', season: '8–10月', altitude: '600–1100m' },
    { name: '龙泉驿水蜜桃', emoji: '🍑', desc: '中国水蜜桃之乡，汁多化渣香气浓', season: '6–8月', altitude: '500–900m' },
    { name: '郫都韭黄', emoji: '🥬', desc: '国家地理标志韭黄，软化栽培色泽金黄', season: '全年多茬', altitude: '600–700m' }
  ],
  '宜宾市': [
    { name: '宜宾早茶', emoji: '🍃', desc: '全国最早春茶之一，二月即可开采', season: '2–9月采制', altitude: '600–1100m' },
    { name: '江安夏橙', emoji: '🍊', desc: '晚熟夏橙，错季上市甜酸适度', season: '4–6月', altitude: '300–600m' },
    { name: '长宁竹笋', emoji: '🎍', desc: '蜀南竹海楠竹笋，脆嫩鲜香', season: '3–11月', altitude: '400–900m' }
  ],
  // 贵州
  '毕节市': [
    { name: '威宁荞麦', emoji: '🌾', desc: '高原苦荞，黄酮含量高，健康杂粮', season: '8–10月', altitude: '2200–2500m' },
    { name: '威宁马铃薯', emoji: '🥔', desc: '南方马铃薯之乡，淀粉含量高耐储运', season: '8–10月', altitude: '2100–2400m' },
    { name: '赫章核桃', emoji: '🌰', desc: '国家地理标志核桃，乌蒙山区主产', season: '9–10月', altitude: '1700–2200m' }
  ],
  '贵阳市': [
    { name: '修文猕猴桃', emoji: '🥝', desc: '贵长猕猴桃，肉细汁多、酸甜适口', season: '9–11月', altitude: '1000–1500m' },
    { name: '花溪辣椒', emoji: '🌶️', desc: '黔中辣椒，香辣适中，油辣椒名品原料', season: '7–9月', altitude: '1100–1400m' },
    { name: '清镇酥李', emoji: '🍑', desc: '凹河酥李，皮薄肉脆、清甜离核', season: '6–7月', altitude: '1000–1300m' }
  ],
  '黔南州': [
    { name: '都匀毛尖', emoji: '🍃', desc: '中国十大名茶，卷曲披毫、鲜爽回甘', season: '3–5月采制', altitude: '1000–1600m' },
    { name: '罗甸火龙果', emoji: '🐉', desc: '贵州热带果品代表，红心火龙果主产', season: '6–11月', altitude: '500–900m' },
    { name: '荔波百香果', emoji: '🥚', desc: '喀斯特河谷百香果，香气浓郁酸甜', season: '7–11月', altitude: '500–900m' }
  ],
  '遵义市': [
    { name: '湄潭翠芽', emoji: '🍃', desc: '贵州名茶，产自全国产茶第一县湄潭，扁平挺秀栗香持久', season: '3–4月采制', altitude: '800–1200m' },
    { name: '赤水金钗石斛', emoji: '🌿', desc: '国家地理标志药材，丹霞崖壁仿野生栽培', season: '全年采收', altitude: '300–900m' },
    { name: '虾子辣椒', emoji: '🌶️', desc: '全国最大辣椒专业市场所在地，干椒鲜椒并重', season: '6–9月', altitude: '800–1100m' }
  ],
  '雅安市': [
    { name: '蒙顶山茶', emoji: '🍃', desc: '有文字记载的人工种茶最早之地，甘露黄芽名品辈出', season: '2–4月采制', altitude: '900–1400m' },
    { name: '汉源花椒', emoji: '🧂', desc: '唐代贡椒，麻香纯正，中国花椒之乡', season: '7–9月', altitude: '1400–2200m' },
    { name: '石棉黄果柑', emoji: '🍊', desc: '晚熟柑橘，花果同树独特景观，大渡河谷主产', season: '2–4月', altitude: '800–1200m' }
  ],
  '十堰市': [
    { name: '房县黑木耳', emoji: '🍄', desc: '国家地理标志，段木栽培朵大肉厚，武当山区主产', season: '全年多发', altitude: '400–1000m' },
    { name: '武当道茶', emoji: '🍃', desc: '鄂西北高山茶，武当山麓云雾茶园', season: '3–5月采制', altitude: '600–1200m' },
    { name: '郧西香口土豆', emoji: '🥔', desc: '秦巴山区高山土豆，粉糯香甜', season: '6–8月', altitude: '800–1500m' }
  ],
  '丽水市': [
    { name: '庆元香菇', emoji: '🍄', desc: '香菇发源地之一，中国香菇之乡，砍花法栽培传承千年', season: '全年多发', altitude: '600–1200m' },
    { name: '松阳银猴', emoji: '🍃', desc: '浙江名茶，松阳茶乡主产，条索微弯似银猴', season: '3–4月采制', altitude: '500–900m' },
    { name: '云和雪梨', emoji: '🍐', desc: '浙南名梨，细脆多汁，云和梯田产区', season: '8–9月', altitude: '500–1000m' }
  ],
  '汉中市': [
    { name: '洋县黑米', emoji: '🍚', desc: '「黑珍珠」贡米，朱鹮之乡有机稻作，国家地理标志', season: '9–10月', altitude: '450–700m' },
    { name: '城固柑橘', emoji: '🍊', desc: '西北最北缘柑橘产区，橘园镇万亩桔海', season: '10–12月', altitude: '500–800m' },
    { name: '汉中仙毫', emoji: '🍃', desc: '绿茶名品，午子山定军山高山茶园', season: '3–4月采制', altitude: '800–1200m' }
  ],
  '延安市': [
    { name: '洛川苹果', emoji: '🍎', desc: '国家地理标志，黄土高原苹果优生区，糖度高硬度好', season: '10–11月', altitude: '900–1200m' }
  ],
  '天水市': [
    { name: '花牛苹果', emoji: '🍎', desc: '可与美国蛇果齐名的元帅系苹果，渭河谷地主产', season: '9–10月', altitude: '1000–1600m' }
  ],
  '大连市': [
    { name: '大连苹果', emoji: '🍎', desc: '辽南苹果产区，瓦房店国光苹果脆甜耐储', season: '10–11月', altitude: '50–300m' }
  ]
}

export const ATLAS = {
  云南: [
    { name: '昭通苹果', emoji: '🍎', desc: '高原糖心苹果，昼夜温差大、着色好、脆甜多汁', season: '9–11月', altitude: '1900–2400m' },
    { name: '食用玫瑰', emoji: '🌹', desc: '安宁玫瑰，鲜花饼原料，花冠厚实香气浓', season: '3–5月', altitude: '1800–2200m' },
    { name: '宣威马铃薯', emoji: '🥔', desc: '高山马铃薯，干物质高、口感沙糯', season: '7–11月', altitude: '1800–2600m' }
  ],
  贵州: [
    { name: '修文猕猴桃', emoji: '🥝', desc: '贵长猕猴桃，肉细汁多、酸甜适口', season: '9–11月', altitude: '1000–1500m' },
    { name: '威宁荞麦', emoji: '🌾', desc: '高原苦荞，黄酮含量高，健康杂粮', season: '8–10月', altitude: '2200–2500m' },
    { name: '都匀毛尖', emoji: '🍃', desc: '中国十大名茶，卷曲披毫、鲜爽回甘', season: '3–5月采制', altitude: '1000–1600m' }
  ],
  四川: [
    { name: '安岳柠檬', emoji: '🍋', desc: '中国柠檬之都，果香浓、酸度高、出汁多', season: '10–12月', altitude: '300–600m' },
    { name: '苍溪红心猕猴桃', emoji: '🥝', desc: '红心果肉、甜度高，国家地理标志产品', season: '8–10月', altitude: '600–1200m' },
    { name: '盐源苹果', emoji: '🍎', desc: '高原苹果，日照足、糖度高达 16°+', season: '10–11月', altitude: '2300–2700m' }
  ],
  重庆: [
    { name: '奉节脐橙', emoji: '🍊', desc: '三峡库区名片，皮薄化渣、甜酸爽口', season: '11–次年2月', altitude: '200–800m' },
    { name: '涪陵青菜头', emoji: '🥬', desc: '榨菜原料，肉质肥厚、脆嫩鲜美', season: '1–2月', altitude: '300–800m' },
    { name: '巫山脆李', emoji: '🍑', desc: '脆甜离核，喀斯特山地特色果品', season: '6–8月', altitude: '500–1200m' }
  ],
  广西: [
    { name: '横州茉莉花', emoji: '🌼', desc: '全球最大茉莉花产地，窨制花茶核心原料', season: '6–9月', altitude: '100–300m' },
    { name: '百色芒果', emoji: '🥭', desc: '桂七芒香气浓郁，右江河谷热区水果', season: '6–8月', altitude: '150–600m' },
    { name: '融安金桔', emoji: '🍊', desc: '滑皮金桔，皮薄蜜甜、可连皮食用', season: '11–次年1月', altitude: '300–700m' }
  ],
  西藏: [
    { name: '青稞', emoji: '🌾', desc: '高原主粮，糌粑与青稞酒原料，耐寒耐瘠', season: '8–9月', altitude: '3200–4200m' },
    { name: '高原马铃薯', emoji: '🥔', desc: '高原河谷马铃薯，昼夜温差大、品质佳', season: '8–10月', altitude: '3200–4000m' },
    { name: '高原油菜籽', emoji: '🌻', desc: '高原河谷油菜，菜籽油清香营养', season: '7–8月', altitude: '3200–3900m' }
  ],
  湖南: [
    { name: '安化黑茶', emoji: '🍃', desc: '千年黑茶之乡，雪峰山区大叶种原料', season: '5–9月采制', altitude: '300–1000m' },
    { name: '炎陵黄桃', emoji: '🍑', desc: '高山黄桃，果肉金黄、浓甜有香气', season: '7–8月', altitude: '600–1200m' },
    { name: '靖州杨梅', emoji: '🫐', desc: '东魁杨梅个大汁多，武陵山区特产', season: '6月中下旬', altitude: '300–800m' }
  ],
  湖北: [
    { name: '秭归脐橙', emoji: '🍊', desc: '四季有鲜橙，三峡河谷冬暖小气候', season: '全年多茬', altitude: '200–800m' },
    { name: '恩施硒茶', emoji: '🍃', desc: '世界硒都富硒茶，玉露蒸青工艺独特', season: '3–9月采制', altitude: '600–1300m' },
    { name: '房县黑木耳', emoji: '🍄', desc: '椴木黑木耳，朵大肉厚，山地林下栽培', season: '全年多茬', altitude: '500–1000m' }
  ],
  广东: [
    { name: '增城荔枝', emoji: '🍒', desc: '挂绿荔枝故里，桂味糯米糍清甜核小', season: '6–7月', altitude: '50–300m' },
    { name: '梅州金柚', emoji: '🍊', desc: '沙田柚类，蜜甜耐储，长寿之乡特产', season: '10–12月', altitude: '200–600m' },
    { name: '徐闻菠萝', emoji: '🍍', desc: '中国菠萝第一县，菠萝的海连片种植', season: '3–6月', altitude: '50–200m' }
  ],
  福建: [
    { name: '安溪铁观音', emoji: '🍃', desc: '乌龙茶代表，兰花香观音韵', season: '4–10月采制', altitude: '600–1200m' },
    { name: '平和蜜柚', emoji: '🍊', desc: '琯溪蜜柚，汁多化渣，年产量全国第一', season: '9–12月', altitude: '100–600m' },
    { name: '古田银耳', emoji: '🍄', desc: '食用菌之都，银耳产量占全国 90%', season: '全年工厂化', altitude: '500–1000m' }
  ],
  浙江: [
    { name: '西湖龙井', emoji: '🍃', desc: '绿茶皇后，扁平挺秀、豆香馥郁', season: '3–4月采制', altitude: '100–800m' },
    { name: '仙居杨梅', emoji: '🫐', desc: '东魁杨梅发源地，果大如乒乓', season: '6月', altitude: '100–600m' },
    { name: '临安山核桃', emoji: '🌰', desc: '天目山珍，壳薄仁香，浙江名产', season: '9月', altitude: '300–900m' }
  ],
  江西: [
    { name: '赣南脐橙', emoji: '🍊', desc: '世界橙都，甜酸适度、香气浓', season: '11–次年1月', altitude: '200–600m' },
    { name: '婺源皇菊', emoji: '🌼', desc: '金丝皇菊一朵一杯，徽州山区特产', season: '10–11月', altitude: '300–800m' },
    { name: '南丰蜜桔', emoji: '🍊', desc: '千年贡桔，皮薄易剥、蜜甜无渣', season: '10–11月', altitude: '100–400m' }
  ],
  陕西: [
    { name: '洛川苹果', emoji: '🍎', desc: '黄土高原苹果优生区，硬度大耐储存', season: '10–11月', altitude: '1000–1200m' },
    { name: '周至猕猴桃', emoji: '🥝', desc: '全球最大猕猴桃生产基地，翠香徐香', season: '9–10月', altitude: '500–800m' },
    { name: '紫阳富硒茶', emoji: '🍃', desc: '天然富硒绿茶，陕南秦巴山区特产', season: '3–9月采制', altitude: '500–1000m' }
  ],
  甘肃: [
    { name: '花牛苹果', emoji: '🍎', desc: '天水蛇果，可与美国蛇果媲美的元帅系', season: '9–10月', altitude: '1000–1600m' },
    { name: '兰州百合', emoji: '🧄', desc: '唯一食用甜百合，色白如玉、清甜无渣', season: '10–11月', altitude: '2000–2600m' },
    { name: '岷县当归', emoji: '🌿', desc: '中国当归之乡，岷归为道地药材上品', season: '10月采挖', altitude: '2200–2800m' }
  ],
  海南: [
    { name: '三亚芒果', emoji: '🥭', desc: '反季节芒果，台农贵妃品种丰富', season: '2–6月', altitude: '50–300m' },
    { name: '文昌椰子', emoji: '🥥', desc: '海南椰子半文昌，椰肉香椰水甜', season: '全年', altitude: '0–100m' },
    { name: '白沙绿茶', emoji: '🍃', desc: '陨石坑茶叶，雨林生态高山绿茶', season: '全年多轮', altitude: '300–800m' }
  ],
  安徽: [
    { name: '黄山毛峰', emoji: '🍃', desc: '绿茶名品，鱼叶金黄、色似象牙', season: '3–5月采制', altitude: '300–1000m' },
    { name: '六安瓜片', emoji: '🍃', desc: '唯一无芽无梗单片叶茶，大别山特产', season: '4–5月采制', altitude: '300–900m' },
    { name: '砀山酥梨', emoji: '🍐', desc: '百年梨都，果大核小、酥脆多汁', season: '8–9月', altitude: '50–200m' }
  ],
  河南: [
    { name: '灵宝苹果', emoji: '🍎', desc: '秦岭北麓优生区，果香浓郁脆甜', season: '10–11月', altitude: '600–1100m' },
    { name: '信阳毛尖', emoji: '🍃', desc: '绿茶尖峰，细圆光直、栗香高长', season: '4–9月采制', altitude: '300–800m' },
    { name: '怀山药', emoji: '🌿', desc: '四大怀药之首，垆土铁棍山药为上品', season: '10–11月', altitude: '100–300m' }
  ],
  山西: [
    { name: '隰县玉露香梨', emoji: '🍐', desc: '梨中极品，皮薄核小、汁多无渣', season: '9–10月', altitude: '900–1300m' },
    { name: '大同黄花', emoji: '🌼', desc: '大同黄花菜，金针菜上品，云州区主产', season: '6–8月', altitude: '1000–1400m' },
    { name: '运城苹果', emoji: '🍎', desc: '晋南黄土坡苹果，早熟品种优势明显', season: '8–11月', altitude: '400–800m' }
  ],
  山东: [
    { name: '烟台苹果', emoji: '🍎', desc: '中国苹果发源地，红富士品质标杆', season: '10–11月', altitude: '100–600m' },
    { name: '沾化冬枣', emoji: '🍒', desc: '皮薄肉脆、甘甜清香，晚熟枣极品', season: '9–10月', altitude: '10–100m' },
    { name: '肥城桃', emoji: '🍑', desc: '佛桃个大香浓，中国桃乡', season: '8–9月', altitude: '100–400m' }
  ],
  河北: [
    { name: '迁西板栗', emoji: '🌰', desc: '燕山板栗代表，糯香甘甜、适于炒食', season: '9–10月', altitude: '200–800m' },
    { name: '赵州雪梨', emoji: '🍐', desc: '千年梨乡，皮薄汁丰、清肺润燥', season: '9–10月', altitude: '50–200m' },
    { name: '赞皇大枣', emoji: '🍒', desc: '三倍体枣品种唯一，个大核小', season: '9–10月', altitude: '100–500m' }
  ],
  辽宁: [
    { name: '丹东草莓', emoji: '🍓', desc: '九九草莓，果大香甜，中国草莓之都', season: '12–次年5月', altitude: '50–300m' },
    { name: '大连樱桃', emoji: '🍒', desc: '暖棚大樱桃，果硬味浓、上市早', season: '3–6月', altitude: '50–300m' },
    { name: '南果梨', emoji: '🍐', desc: '鞍山特产，需后熟转黄，酒香浓郁', season: '9月', altitude: '100–500m' }
  ],
  吉林: [
    { name: '长白山人参', emoji: '🌿', desc: '道地人参核心产区，林下山参珍稀', season: '8–9月采挖', altitude: '500–1200m' },
    { name: '延边苹果梨', emoji: '🍐', desc: '抗寒梨种，果肉脆嫩、酸甜带香', season: '9–10月', altitude: '200–800m' },
    { name: '吉林黑木耳', emoji: '🍄', desc: '寒地黑木耳，胶质厚、品质优', season: '全年多茬', altitude: '300–800m' }
  ],
  黑龙江: [
    { name: '五常大米', emoji: '🌾', desc: '稻花香 2 号，米香浓郁、冷饭不回生', season: '9–10月', altitude: '150–300m' },
    { name: '东北黑木耳', emoji: '🍄', desc: '小兴安岭木耳，朵小肉厚胶质足', season: '全年多茬', altitude: '200–600m' },
    { name: '椴树蜜', emoji: '🍯', desc: '黑蜂椴树雪蜜，结晶洁白细腻', season: '7月摇蜜', altitude: '200–800m' }
  ],
  江苏: [
    { name: '阳山水蜜桃', emoji: '🍑', desc: '太湖水蜜桃代表，汁多可插吸管', season: '6–8月', altitude: '10–100m' },
    { name: '洞庭碧螺春', emoji: '🍃', desc: '茶果间作独特花果香，卷曲如螺', season: '3–4月采制', altitude: '50–300m' },
    { name: '泰兴银杏', emoji: '🌰', desc: '银杏之乡，果仁糯香、药食同源', season: '9–10月', altitude: '10–50m' }
  ],
  内蒙古: [
    { name: '河套向日葵', emoji: '🌻', desc: '葵花籽黄金产区，籽粒饱满香脆', season: '9月', altitude: '1000–1200m' },
    { name: '武川马铃薯', emoji: '🥔', desc: '阴山北麓马铃薯，干物质高耐储运', season: '9–10月', altitude: '1500–2000m' },
    { name: '阴山燕麦', emoji: '🌾', desc: '高原裸燕麦，β-葡聚糖含量高', season: '8–9月', altitude: '1500–2000m' }
  ],
  宁夏: [
    { name: '中宁枸杞', emoji: '🍒', desc: '中国枸杞之乡，粒大色红、甘甜少籽', season: '6–10月', altitude: '1100–1500m' },
    { name: '贺兰山酿酒葡萄', emoji: '🍇', desc: '葡萄酒新贵产区，日照足温差大', season: '9–10月', altitude: '1000–1300m' },
    { name: '西吉马铃薯', emoji: '🥔', desc: '六盘山马铃薯，淀粉含量高', season: '9–10月', altitude: '1700–2200m' }
  ],
  青海: [
    { name: '柴达木枸杞', emoji: '🍒', desc: '高原红枸杞，颗粒大、多糖含量高', season: '7–10月', altitude: '2800–3300m' },
    { name: '互助青稞', emoji: '🌾', desc: '高原青稞，酿青稞酒与糌粑原料', season: '8–9月', altitude: '2500–3000m' },
    { name: '门源油菜籽', emoji: '🌻', desc: '百里油菜花海，菜籽油清香营养', season: '7月花/8月籽', altitude: '2700–3200m' }
  ],
  新疆: [
    { name: '库尔勒香梨', emoji: '🍐', desc: '皮薄肉细、香甜多汁，享誉全球', season: '9–10月', altitude: '850–1000m' },
    { name: '吐鲁番葡萄', emoji: '🍇', desc: '火洲葡萄，无核白晾制葡萄干首选', season: '7–9月', altitude: '-100–300m' },
    { name: '哈密瓜', emoji: '🍈', desc: '甜瓜之王，网纹细密、糖度 15°+', season: '7–9月', altitude: '500–1500m' }
  ],
  北京: [
    { name: '平谷大桃', emoji: '🍑', desc: '中国桃乡，白桃黄桃蟠桃全系列', season: '6–10月', altitude: '100–500m' },
    { name: '怀柔板栗', emoji: '🌰', desc: '长城板栗，糖炒栗子上品', season: '9–10月', altitude: '200–700m' },
    { name: '京西白蜜', emoji: '🍯', desc: '荆条花蜂蜜，门头沟林下蜂业', season: '6–8月', altitude: '300–1000m' }
  ],
  天津: [
    { name: '沙窝萝卜', emoji: '🥬', desc: '赛鸭梨水果萝卜，脆甜多汁', season: '10–12月', altitude: '5–20m' },
    { name: '茶淀玫瑰香葡萄', emoji: '🍇', desc: '玫瑰香浓郁，滨海新区名产', season: '8–9月', altitude: '5–20m' },
    { name: '盘山柿子', emoji: '🧡', desc: '磨盘柿个大无核，蓟州山货', season: '10–11月', altitude: '100–500m' }
  ],
  上海: [
    { name: '南汇水蜜桃', emoji: '🍑', desc: '玉露水蜜桃，沪郊果品名片', season: '7–8月', altitude: '5–20m' },
    { name: '马陆葡萄', emoji: '🍇', desc: '设施葡萄标杆，巨峰阳光玫瑰', season: '7–9月', altitude: '5–20m' },
    { name: '崇明大米', emoji: '🌾', desc: '生态岛大米，软糯清香', season: '10–11月', altitude: '5–20m' }
  ],
  台湾: [
    { name: '冻顶乌龙', emoji: '🍃', desc: '中国台湾乌龙代表，烘焙香醇厚', season: '4–11月采制', altitude: '500–1200m' },
    { name: '凤梨', emoji: '🍍', desc: '金钻凤梨无眼无刺、可直接削食', season: '全年', altitude: '50–500m' },
    { name: '玉荷包荔枝', emoji: '🍒', desc: '早熟荔枝，果肉脆甜微酸', season: '5–6月', altitude: '50–400m' }
  ]
}
