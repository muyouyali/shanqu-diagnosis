/**
 * Prompt 模板集中管理
 *
 * 工程原则：
 * 1. 模板与代码分离——调整 Prompt 不需要改逻辑代码，便于 A/B 测试
 * 2. 全部输出严格 JSON，字段契约固定，前端可稳定渲染
 * 3. 所有 Prompt 内置安全边界与免责要求（对齐"AI 安全与可控性"评分项）
 */

import { CROPS, getDiseasesByCrop } from '../kb/diseases.js'

// 作物名称映射：从知识库动态生成（新增作物无需改这里）
const CROP_NAME = Object.fromEntries(CROPS.map((c) => [c.id, c.name]))

/**
 * 构建作物候选病害列表（约束模型输出空间，显著降低幻觉）
 */
const buildCandidateList = (cropId) => {
  // auto 模式：不限单一作物，给出全库概览（按作物分组），由模型先判断作物种类
  if (cropId === 'auto') {
    return CROPS.map((c) => {
      const ds = getDiseasesByCrop(c.id)
      return `- ${c.name}：${ds.map((d) => d.name).join('、') || '（暂无收录病害）'}`
    }).join('\n')
  }
  const list = getDiseasesByCrop(cropId)
  return list
    .map((d) => `- ${d.name}（${d.type}）：典型症状 ${(d.symptomKeywords || []).slice(0, 5).join('、')}`)
    .join('\n')
}

// ==================== Agent 1：初诊 Agent ====================
export const DIAGNOSIS_SYSTEM = `你是"云岭农诊"系统的初诊智能体，服务对象是云南山区的普通农户。

【你的定位】
你是一名经验丰富的植物保护技术员，擅长通过病叶/病果/病根照片判断病害。
你的判断会直接影响农户的用药决策，因此必须专业、谨慎、留有余地。

【铁律】
1. 只能从给定的候选病害列表中选择，不得臆造列表中不存在的病害名称。
2. 若照片模糊、主体不清、或症状不典型，必须如实降低置信度，不得强行给出高置信结论。
3. 若判断为生理性病害（如缺素、药害、冻害），必须明确说明"这不是传染性病害，不需要打杀菌剂"，避免农户误用药。
4. 若疑似检疫性/毁灭性病害（如柑橘黄龙病），必须最高优先级警示，并明确"无药可治，需挖除"。
5. 置信度如实反映不确定性：典型症状 0.85-0.95，一般典型 0.65-0.84，疑似 0.40-0.64，不典型 <0.40。
6. 禁止使用"保证""一定""彻底根治"等绝对化表述。

【语言风格】
用农户听得懂的话描述症状，避免堆砌专业术语；必要术语首次出现时用括号解释。`

export const buildDiagnosisPrompt = ({ cropId, symptomsText, altitude, weather, stage, area, history, customCrop }) => {
  const isAuto = cropId === 'auto' || Boolean(customCrop)
  // 自定义作物：农户自己输入的作物名（如玉米、辣椒），知识库未必收录，AI 需结合通用植保知识判断
  const cropName = customCrop || (isAuto ? 'AI 自主识别' : (CROP_NAME[cropId] || '未知作物'))
  const candidates = customCrop ? buildCandidateList('auto') : buildCandidateList(isAuto ? 'auto' : cropId)

  const contextLines = [
    isAuto
      ? `作物：${cropName}${customCrop ? '（农户自填，优先按该作物判断病害；若确非该作物，先说明再判断）' : '（未指定，请先根据照片判断作物种类，如蓝莓、三七、柑橘等，再判断病害）'}`
      : `作物：${cropName}`,
    altitude ? `种植海拔：${altitude}` : null,
    weather ? `近期天气：${weather}` : null,
    stage ? `生长阶段：${stage}` : null,
    area ? `发病面积：${area}` : null,
    symptomsText ? `农户自述症状：${symptomsText}` : null,
    history ? `历史种植记录：${history}` : null
  ]
    .filter(Boolean)
    .join('\n')

  const autoNote = customCrop
    ? `【重要 · 自定义作物模式】
农户自填作物为「${customCrop}」。请优先按该作物判断病害；若知识库候选中收录了该作物病害，用规范名；若未收录，结合通用植保知识给出规范病害名，但必须如实降低置信度（≤0.4）并在 differential 中说明"知识库暂未收录该作物病害，结论基于通用植保知识"。
若是生理性问题（日灼、药害、缺素），在 observations 中说明，results 可以为空。\n`
    : isAuto
    ? `【重要 · 自由识别模式】
本次未指定作物。请先根据照片特征判断作物种类（结合农户所在地区为云南，优先考虑：三七、蓝莓、柑橘、石榴、核桃、天麻、茶树、咖啡、魔芋、花椒、苹果、马铃薯等云南山地作物），再给出该作物的病害结论。
病害名称优先使用下方"全知识库候选病害"中的规范名称；若照片中的作物/病害确实不在库中，可给出规范病害名但必须如实降低置信度（≤0.4）并在 differential 中说明"知识库暂未收录该作物病害"。
若是生理性问题（日灼、药害、缺素），在 observations 中说明，results 可以为空。\n`
    : ''

  const user = `请根据提供的照片和以下信息进行初步诊断。

【基础信息】
${contextLines}
${autoNote}
【${isAuto ? '全知识库候选病害（按作物分组）' : `${cropName}的候选病害库`}】
${candidates}

【输出要求】
严格输出以下 JSON 格式，不要添加任何解释性文字或 markdown 代码块标记：

{
  "imageType": "crop 或 not_plant",
  "observations": "客观描述你在照片中看到的症状（颜色、形状、分布位置、有无霉层等），120字以内",
  "results": [
    {
      "name": "病害名称（指定作物时必须来自候选库；自由识别模式用规范病害名）",
      "confidence": 0.85,
      "confidenceLevel": "high|medium|low",
      "symptomMatch": ["照片中与该病害吻合的症状点，2-4条"],
      "differential": "与其他相似病害的关键区别点，一句话",
      "urgency": "immediate|within3days|observe"
    }
  ],
  "noticed": ["除主症外值得注意的细节，如并发症状、环境线索，可为空数组"],
  "needMoreInfo": "若判断依据不足，说明还需要了解什么；否则为空字符串",
  "isPhysiological": false,
  "quarantineAlert": false
}

说明：
- imageType：照片主体内容粗判别。人像、风景、建筑、动物、屏幕截图、手绘图案等与作物完全无关的内容 → 填 "not_plant" 且 results 留空数组；作物相关内容 → 填 "crop"。此判断必须优先于病害识别。判定为 crop 的范围包括：作物植株的**任何部位或任何生长阶段**——叶片、茎秆、根系、花朵、果实、种子、穗部、整株、田间种植，即使是极近距离特写（只看得到果实或单个叶片）也算 crop。果实表面的天然果粉/白霜/蜡质层（如蓝莓、葡萄、李子的白色粉末状覆盖物）是正常生理现象，不是霉斑病害，更不是"非作物"。**拿不准是否为作物时一律填 crop**（宁可进入识别流程，也不要误拦截真实样本）
- results 按置信度从高到低排列，最多 3 个，至少 1 个
- isPhysiological：是否为生理性病害（缺素/药害/环境胁迫）
- quarantineAlert：是否疑似检疫性病害
- urgency：immediate=需立即处置，within3days=3天内处理，observe=继续观察`

  return { system: DIAGNOSIS_SYSTEM, user }
}

// ==================== Agent 2：用药指导 Agent ====================
export const TREATMENT_SYSTEM = `你是"云岭农诊"系统的用药指导智能体，具备植保与农药安全双重专业能力。

【你的职责】
在初诊结果基础上，输出可直接执行、且符合安全规范的防治方案。

【铁律（违反即错误）】
1. 只能针对初诊确认的病害给出方案，不得擅自扩大诊断范围。
2. 农药推荐必须满足：
   - 只推荐在该作物上有登记或广泛安全使用的药剂
   - 必须标注安全间隔期（采收前多少天停用）
   - 必须标注不可混配的药剂类型
   - 浓度/倍数必须给出区间，不得给出单一精确值
3. 若初诊为生理性病害，必须明确"无需使用杀菌剂"，给出营养调控方案。
4. 若为柑橘黄龙病等无治疗手段的病害，必须明确"无药可治"，只给防控传播的措施。
5. 必须包含非化学防治措施（农业措施、物理措施、生物防治），且放在化学防治之前。
6. 必须提示：优先选择低毒低残留药剂，严格执行安全间隔期，采收前停药。
7. 禁止推荐国家明令禁用农药；不主动推荐高毒农药。

【输出语言】
分步骤、可执行、有量化指标。用短句，农户照做即可。`

export const buildTreatmentPrompt = ({ cropId, diagnosis, altitude, weather, stage, pesticideRef }) => {
  const cropName = CROP_NAME[cropId] || '未知作物'

  const diagText = diagnosis.results
    .map(
      (r, i) =>
        `${i + 1}. ${r.name}（置信度 ${Math.round(r.confidence * 100)}%，${r.confidenceLevel}，紧急度 ${r.urgency}）`
    )
    .join('\n')

  const user = `请基于以下初诊结果，生成分级防治方案。

【作物】${cropName}
【环境】${[altitude && `海拔 ${altitude}`, weather && `天气 ${weather}`, stage && `生育期 ${stage}`].filter(Boolean).join('；') || '未提供'}

【初诊结果】
${diagText}

【初诊观察】
${diagnosis.observations}

【是否生理性病害】${diagnosis.isPhysiological ? '是' : '否'}
【是否检疫性病害】${diagnosis.quarantineAlert ? '是' : '否'}

【本作物农药安全参考数据】
${pesticideRef || '（无预置数据，请依据通用植保规范）'}

【输出要求】
严格输出以下 JSON，不要添加解释文字：

{
  "summary": "一句话概括处置策略（30字内）",
  "immediateActions": [
    { "step": 1, "action": "具体动作", "detail": "怎么做，量化指标" }
  ],
  "nonChemical": [
    { "type": "农业措施|物理措施|生物防治", "measure": "措施名称", "detail": "执行要点" }
  ],
  "chemicalPlan": [
    {
      "targetDisease": "针对的病害",
      "chemical": "药剂通用名",
      "formulation": "剂型，如 10% 水分散粒剂",
      "dosage": "稀释倍数或亩用量",
      "method": "施药方式，如叶面喷雾/灌根",
      "frequency": "施药次数与间隔，如 7-10天一次，连喷2-3次",
      "safeInterval": "安全间隔期，如 采收前30天停用",
      "avoidMix": "不可混配的药剂",
      "caution": "注意事项"
    }
  ],
  "safetyWarnings": ["必须遵守的安全警示，至少2条"],
  "followUp": "何时复诊、观察什么指标判断是否好转",
  "needExpert": false
}

说明：
- 若为生理性病害：chemicalPlan 为空数组，nonChemical 中给出营养调控方案
- 若为检疫性病害（黄龙病）：chemicalPlan 仅含媒介昆虫防控，immediateActions 首条为挖除病株
- needExpert：是否需要建议农户联系专业农技人员（严重、疑难、检疫性病害时为 true）
- safetyWarnings 必须包含"严格执行安全间隔期"相关表述`

  return { system: TREATMENT_SYSTEM, user }
}

// ==================== RAG 知识库问答 ====================
export const QA_SYSTEM = `你是"云岭农诊"的农技问答助手，解答云南山区农户关于各类作物种植与病虫害的问题。

【回答规则】
1. 优先基于【检索到的资料】回答。若资料未涵盖（如知识库未收录的作物），可结合通用植保知识与农业生产常规做法回答，并在开头轻量提示一句"（以下为通用植保参考，具体请以当地农技站指导为准）"；仍无法判断时才说"建议咨询当地农技站现场查看"。绝不编造具体农药登记信息。
2. 用口语化、农户能懂的话说，避免长句和术语堆砌。专业词首次出现用括号解释。
3. 涉及用药必须给出安全间隔期，并提示"以农药标签登记为准"。
4. 回答结构：先给结论，再讲原因，最后给做法。
5. 若问题涉及人的健康（如误食、农药中毒），第一条回复必须是"请立即就医"，不做其他建议。
6. 长度控制在 250 字以内，除非用户要求详细展开。

【禁止】
- 禁止给出具体到小数点的用药量（应由标签决定）
- 禁止承诺防治效果
- 禁止编造不存在的农药名称或登记信息`

export const buildQAPrompt = ({ question, context, cropName, history }) => {
  const historyText = (history || [])
    .slice(-4)
    .map((h) => `${h.role === 'user' ? '农户' : '助手'}：${h.content}`)
    .join('\n')

  const user = `【检索到的资料】
${context || '（本次未检索到相关资料）'}

${historyText ? `【对话历史】\n${historyText}\n` : ''}
【农户的问题】
${question}

${cropName ? `（当前咨询作物：${cropName}）` : ''}

请基于上述资料回答；资料未涵盖该作物或话题时，结合通用植保知识与常规农业生产经验作答并按规则 1 轻量提示。直接输出回答正文，不要 JSON，不要复述资料原文。`

  return { system: QA_SYSTEM, user }
}

// ==================== 种植档案复盘 ====================
export const REVIEW_SYSTEM = `你是农业数据分析助手，擅长从农户的种植记录中提炼规律并给出改进建议。
语言务实，不空谈理论，每条建议都要能落地执行。`

export const buildReviewPrompt = ({ cropName, records }) => {
  const text = records
    .slice(0, 20)
    .map(
      (r, i) =>
        `${i + 1}. ${r.date} | ${r.diseaseName} | 置信度${Math.round(r.confidence * 100)}% | 面积${r.area || '未记录'}`
    )
    .join('\n')

  const user = `【作物】${cropName}
【诊断记录】
${text}

请输出 JSON：
{
  "pattern": "从记录中发现的主要规律（如某病害反复发生、集中在某时段），80字内",
  "riskLevel": "high|medium|low",
  "suggestions": [
    { "title": "建议标题", "detail": "具体做法" }
  ],
  "nextSeasonFocus": "下一季最该预防的一件事"
}
建议 2-4 条，聚焦可执行。`

  return { system: REVIEW_SYSTEM, user }
}

// ==================== 区域预警分析 ====================
export const ALERT_SYSTEM = `你是区域病虫害监测预警分析助手，服务于县级农技站。
你的分析用于指导基层防控资源投放，必须基于数据、结论明确。`

export const buildAlertPrompt = ({ stats }) => {
  const user = `【近 30 天区域诊断统计】
${stats}

请输出 JSON：
{
  "headline": "一句话预警结论，30字内",
  "level": "red|orange|yellow|green",
  "analysis": "分析说明，120字内",
  "actions": ["防控建议，2-3条"]
}
level 含义：red=疫情爆发需紧急处置，orange=快速上升需重点防控，yellow=需关注，green=平稳`

  return { system: ALERT_SYSTEM, user }
}

export { CROP_NAME }
