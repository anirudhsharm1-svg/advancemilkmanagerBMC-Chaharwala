/**
 * Calculate milk rate based on FAT and SNF slab
 * @param {number} fat - FAT value (e.g., 5.3)
 * @param {number} snf - SNF integer value (e.g., 88)
 * @param {number} liters - Quantity in liters
 * @param {Array}  slabs - Array of SNF slab objects from DB
 * @returns {{ rate: number, total: number, found: boolean, slab: object|null }}
 */
export function calculateMilkRate(fat, snf, liters, slabs) {
  const snfNum = parseInt(snf, 10)
  const fatNum = parseFloat(fat)
  const litersNum = parseFloat(liters)

  if (isNaN(snfNum) || isNaN(fatNum) || isNaN(litersNum)) {
    return { rate: 0, total: 0, found: false, slab: null }
  }

  const slab = slabs.find(s => s.snf_value === snfNum)
  if (!slab) return { rate: 0, total: 0, found: false, slab: null }

  const { fat_min, base_rate, rate_per_fat_increment } = slab
  const fatMinNum = parseFloat(fat_min)
  const baseRateNum = parseFloat(base_rate)
  const incrementNum = parseFloat(rate_per_fat_increment)

  // Round to avoid floating point drift (e.g., 0.2/0.1 = 1.9999...)
  const increments = Math.round((fatNum - fatMinNum) / 0.1)
  const rate = baseRateNum + increments * incrementNum
  const total = rate * litersNum

  return {
    rate: Math.round(rate * 100) / 100,
    total: Math.round(total * 100) / 100,
    found: true,
    slab,
  }
}

/**
 * Generate a preview rate table for a given SNF slab
 * @param {object} slab
 * @returns {Array<{ fat: number, rate: number }>}
 */
export function generateRatePreview(slab) {
  if (!slab) return []
  const { fat_min, fat_max, base_rate, rate_per_fat_increment } = slab
  const rows = []
  let fat = parseFloat(fat_min)
  const max = parseFloat(fat_max)
  const base = parseFloat(base_rate)
  const inc = parseFloat(rate_per_fat_increment)

  while (fat <= max + 0.001) {
    const increments = Math.round((fat - parseFloat(fat_min)) / 0.1)
    const rate = Math.round((base + increments * inc) * 100) / 100
    rows.push({ fat: Math.round(fat * 10) / 10, rate })
    fat = Math.round((fat + 0.1) * 10) / 10
  }
  return rows
}
