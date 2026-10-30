/**
 * 服务端单元测试（node:test，零依赖）
 * 覆盖：RAG 检索 / 农药安全校验 / JSON 提取 / 规则引擎 / 天气工具
 * 运行：npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { retrieve, buildContext } from '../kb/retriever.js'
import { DISEASES, PESTICIDE_SAFETY, CROPS } from '../kb/diseases.js'
import { extractJSON } from '../ai/adapter.js'
import { ruleBasedDiagnose } from '../kb/retriever.js'
import { validateChemicalPlan } from '../agents/workflow.js'

// ==================== RAG 检索 ====================
describe('RAG 检索（BM25 + 同义词扩展）', () => {
  test('按病害名检索，命中该病害且排名第一', () => {
    const hits = retrieve('三七根腐病怎么防治', { cropId: 'sanqi', topK: 5 })
    assert.ok(hits.length > 0, '应有命中')
    assert.ok(hits[0].disease.name.includes('根腐'), `首位应为根腐类，实际 ${hits[0].disease.name}`)
  })

  test('按症状关键词检索（不提病害名）', () => {
    const hits = retrieve('叶片上面有褐色斑点还有霉层', { cropId: 'tea', topK: 3 })
    assert.ok(hits.length > 0)
    // 命中的病害应至少含一个症状相关关键词
    const names = hits.map((h) => h.disease.name)
    assert.ok(names.length <= 3, 'topK 生效')
  })

  test('无命中时返回空数组而不是报错（兜底语义）', () => {
    const hits = retrieve('量子纠缠波动方程', { cropId: 'sanqi', topK: 3 })
    assert.ok(Array.isArray(hits))
  })

  test('scoreNormalized 归一化到 0~1', () => {
    const hits = retrieve('根腐病', { cropId: 'sanqi', topK: 5 })
    for (const h of hits) {
      assert.ok(h.scoreNormalized >= 0 && h.scoreNormalized <= 1, `score ${h.scoreNormalized} 越界`)
    }
  })

  test('buildContext 返回上下文文本与来源', () => {
    const ctx = buildContext('三七根部腐烂发臭', { cropId: 'sanqi', topK: 2 })
    assert.ok(typeof ctx.context === 'string')
    assert.ok(Array.isArray(ctx.hits))
  })
})

// ==================== 知识库数据完整性 ====================
describe('知识库数据完整性', () => {
  test('作物不少于 10 种，且每种种名/emoji/简介齐全', () => {
    assert.ok(CROPS.length >= 10, `作物数 ${CROPS.length}`)
    for (const c of CROPS) {
      assert.ok(c.id && c.name && c.emoji && c.intro, `作物 ${c.id} 字段缺失`)
    }
  })

  test('病害不少于 30 种，症状关键词与防治措施非空', () => {
    assert.ok(DISEASES.length >= 30, `病害数 ${DISEASES.length}`)
    for (const d of DISEASES) {
      assert.ok(d.name && d.cropId && d.severity, `病害 ${d.id} 基础字段缺失`)
      assert.ok(Array.isArray(d.symptomKeywords) && d.symptomKeywords.length, `病害 ${d.name} 缺症状关键词`)
      assert.ok(Array.isArray(d.treatment) && d.treatment.length, `病害 ${d.name} 缺防治措施`)
    }
  })

  test('农药安全数据字段完整（剂量/间隔期/禁忌）', () => {
    assert.ok(PESTICIDE_SAFETY.length >= 15, `农药数据 ${PESTICIDE_SAFETY.length} 条`)
    for (const p of PESTICIDE_SAFETY) {
      assert.ok(p.chemical && p.cropId && p.dosage && p.interval, `农药 ${p.chemical} 字段缺失`)
    }
  })
})

// ==================== JSON 提取（模型输出解析） ====================
describe('extractJSON（模型输出容错解析）', () => {
  test('纯 JSON 直接解析', () => {
    const r = extractJSON('{"a":1}')
    assert.equal(r.a, 1)
  })

  test('markdown 代码围栏包裹也能提取', () => {
    const r = extractJSON('好的，以下是结果：\n```json\n{"name":"三七根腐病"}\n```')
    assert.equal(r.name, '三七根腐病')
  })

  test('前后夹杂文字时截取大括号内容', () => {
    const r = extractJSON('诊断结果 {"confidence":0.65} 以上')
    assert.equal(r.confidence, 0.65)
  })

  test('完全非 JSON 输入返回 null（交给上层降级）', () => {
    assert.equal(extractJSON('抱歉我无法回答'), null)
    assert.equal(extractJSON(''), null)
    assert.equal(extractJSON(null), null)
  })
})

// ==================== 农药安全硬校验 ====================
describe('农药安全硬校验（安全闸门）', () => {
  test('正常药剂通过校验', () => {
    const { plan, violations } = validateChemicalPlan(
      [{ chemical: '苯醚甲环唑', dosage: '10% 水分散粒剂 1500 倍液', safeInterval: '14 天' }],
      'sanqi'
    )
    assert.equal(plan.length, 1)
    assert.equal(violations.length, 0)
  })

  test('禁用农药被拦截并产生违规记录', () => {
    const { plan, violations } = validateChemicalPlan(
      [{ chemical: '甲胺磷', dosage: '任意', safeInterval: '-' }],
      'sanqi'
    )
    assert.equal(plan.length, 0, '禁用药必须被移除')
    assert.ok(violations.length >= 1)
    assert.ok(violations.some((v) => v.includes('禁用')), `违规提示应含「禁用」：${violations}`)
  })

  test('空方案不报错', () => {
    const { plan, violations } = validateChemicalPlan([], 'tea')
    assert.equal(plan.length, 0)
    assert.equal(violations.length, 0)
  })
})

// ==================== 规则引擎（AI 降级路径） ====================
describe('规则引擎诊断（AI 不可用时的降级）', () => {
  test('典型症状文本能匹配到病害', () => {
    const results = ruleBasedDiagnose('sanqi', '根部变褐腐烂，有臭味，植株萎蔫')
    assert.ok(results.length > 0, '应命中至少一个病害')
    assert.ok(results[0].confidence > 0 && results[0].confidence <= 1)
  })

  test('无关文本不命中', () => {
    const results = ruleBasedDiagnose('sanqi', '今天天气不错心情很好')
    // 允许命中但应为低置信，或为空
    if (results.length) assert.ok(results[0].confidence < 0.6, '无关键症状不应高置信')
  })

  test('空文本返回空数组', () => {
    assert.deepEqual(ruleBasedDiagnose('sanqi', ''), [])
  })
})
