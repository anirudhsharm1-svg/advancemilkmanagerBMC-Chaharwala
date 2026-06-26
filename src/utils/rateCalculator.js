import { supabase } from '../lib/supabaseClient'

let customRatesCache = null

/**
 * Fetch custom rates from database and cache them in memory
 */
export async function fetchAndCacheCustomRates() {
  try {
    const { data, error } = await supabase
      .from('farmers')
      .select('address')
      .eq('code', 'SYSTEM_RATES')
      .maybeSingle()
    
    if (error) {
      console.error('Error fetching custom rates:', error)
      return null
    }

    if (data && data.address) {
      try {
        customRatesCache = JSON.parse(data.address)
        return customRatesCache
      } catch (e) {
        console.error('Failed to parse custom rates JSON:', e)
      }
    }
  } catch (err) {
    console.error('Failed to load custom rates:', err)
  }
  return null
}

/**
 * Manually update the cached custom rates
 */
export function setCustomRatesCache(rates) {
  customRatesCache = rates
}

/**
 * Get the cached custom rates
 */
export function getCustomRatesCache() {
  return customRatesCache
}

/**
 * Calculate milk rate based on FAT and SNF slab
 * @param {number} fat - FAT value (e.g., 5.3)
 * @param {number} snf - SNF value (e.g., 92 or 9.2)
 * @param {number} liters - Quantity in liters
 * @param {Array}  slabs - Array of SNF slab objects from DB (fallback)
 * @param {string} milkType - 'cow' or 'buffalo'
 * @param {object} customRates - Custom rates grid (optional override)
 * @returns {{ rate: number, total: number, found: boolean, slab: object|null }}
 */
export function calculateMilkRate(fat, snf, liters, slabs, milkType = 'cow', customRates = null) {
  const fatNum = parseFloat(fat)
  const litersNum = parseFloat(liters)
  const snfRaw = parseFloat(snf)

  if (isNaN(snfRaw) || isNaN(fatNum) || isNaN(litersNum)) {
    return { rate: 0, total: 0, found: false, slab: null }
  }

  // Normalize SNF: if entered as 9.2 (instead of 92), convert to 92
  const snfNum = snfRaw < 15 ? Math.round(snfRaw * 10) : Math.round(snfRaw)

  // Use the passed customRates if provided, otherwise fallback to cache
  const ratesToUse = customRates || customRatesCache

  // 1. Check custom rates first
  if (ratesToUse && ratesToUse[milkType]) {
    const key = `${fatNum.toFixed(1)}_${snfNum}`
    const customRate = ratesToUse[milkType][key]
    if (customRate !== undefined && customRate !== null && customRate !== '') {
      const rate = parseFloat(customRate)
      return {
        rate: Math.round(rate * 100) / 100,
        total: Math.round(rate * litersNum * 100) / 100,
        found: true,
        slab: null // Custom cells are not bound to standard formulas
      }
    }
  }

  // 2. Fallback to DB slab calculation
  const targetSnf = milkType === 'buffalo' ? snfNum + 100 : snfNum
  let slab = slabs?.find(s => s.snf_value === targetSnf)

  // Fallback to official Sirsa union rate chart if not in DB
  if (!slab) {
    const cowBaseRates = {
      82: 30.14, 83: 30.58, 84: 31.02, 85: 31.46, 86: 31.69,
      87: 31.92, 88: 32.15, 89: 32.25, 90: 32.35, 91: 32.45, 92: 32.55
    }
    const buffaloBaseRates = {
      82: 35.28, 83: 35.78, 84: 36.28, 85: 37.28, 86: 37.78,
      87: 38.28, 88: 38.78, 89: 39.03, 90: 39.28, 91: 39.53, 92: 39.78
    }

    if (milkType === 'cow') {
      const base_rate = cowBaseRates[snfNum]
      if (base_rate !== undefined) {
        slab = {
          snf_value: snfNum,
          fat_min: 3.5,
          fat_max: 5.0,
          base_rate,
          rate_per_fat_increment: 0.34
        }
      }
    } else if (milkType === 'buffalo') {
      const base_rate = buffaloBaseRates[snfNum]
      if (base_rate !== undefined) {
        slab = {
          snf_value: snfNum + 100,
          fat_min: 5.1,
          fat_max: 10.0,
          base_rate,
          rate_per_fat_increment: 0.78
        }
      }
    }
  }

  if (!slab) return { rate: 0, total: 0, found: false, slab: null }

  const { fat_min, base_rate, rate_per_fat_increment } = slab
  const fatMinNum = parseFloat(fat_min)
  const baseRateNum = parseFloat(base_rate)
  const incrementNum = parseFloat(rate_per_fat_increment)

  const increments = Math.round((fatNum - fatMinNum) / 0.1)
  let rate = baseRateNum + increments * incrementNum

  // Add the 1.00 incentive for buffalo milk above FAT 6.0 and SNF >= 8.4 (mapped snf >= 184)
  if (milkType === 'buffalo' && slab.snf_value >= 184 && fatNum >= 6.0) {
    rate += 1.00
  }

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
  const { snf_value, fat_min, fat_max, base_rate, rate_per_fat_increment } = slab
  const rows = []
  let fat = parseFloat(fat_min)
  const max = parseFloat(fat_max)
  const base = parseFloat(base_rate)
  const inc = parseFloat(rate_per_fat_increment)
  const snfVal = parseInt(snf_value, 10)

  while (fat <= max + 0.001) {
    const increments = Math.round((fat - parseFloat(fat_min)) / 0.1)
    let rate = base + increments * inc
    
    if (snfVal >= 180 && snfVal >= 184 && fat >= 6.0) {
      rate += 1.00
    }
    
    rate = Math.round(rate * 100) / 100
    rows.push({ fat: Math.round(fat * 10) / 10, rate })
    fat = Math.round((fat + 0.1) * 10) / 10
  }
  return rows
}
