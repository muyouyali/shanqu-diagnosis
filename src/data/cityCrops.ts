/** 云南州市级主导作物映射：所选州市的主导作物在列表中置顶（主攻云南，其他省保留省级粒度） */
export const CITY_SPECIALTY: Record<string, string[]> = {
  文山市: ['sanqi'],
  昭通市: ['tianma', 'walnut'],
  普洱市: ['tea', 'coffee'],
  红河州: ['shiliu'],
  曲靖市: ['moyu'],
  昆明市: ['blueberry', 'citrus'],
  丽江市: ['walnut', 'blueberry'],
  大理白族自治州: ['walnut'],
  保山市: ['coffee', 'tea'],
  临沧市: ['tea'],
  西双版纳州: ['tea', 'coffee'],
  德宏州: ['coffee', 'tea'],
  怒江州: ['walnut'],
  迪庆州: ['walnut'],
  楚雄州: ['walnut', 'moyu'],
  玉溪市: ['citrus', 'blueberry']
}

/** 按州市特色把主导作物排到最前 */
export const sortByCity = <T extends { id: string }>(items: T[], region: string): T[] => {
  const specialty = CITY_SPECIALTY[region] || []
  if (!specialty.length) return items
  return [
    ...items.filter((c) => specialty.includes(c.id)),
    ...items.filter((c) => !specialty.includes(c.id))
  ]
}
