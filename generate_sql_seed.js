import fs from 'fs'
import path from 'path'

// Standard SNF rate slabs (from seed.sql)
const slabs = [
  { snf: 88, fat_min: 5.1, base_rate: 30.00, increment: 0.32 },
  { snf: 89, fat_min: 5.2, base_rate: 31.00, increment: 0.35 },
  { snf: 90, fat_min: 5.3, base_rate: 32.00, increment: 0.38 },
  { snf: 91, fat_min: 5.4, base_rate: 33.00, increment: 0.40 },
  { snf: 92, fat_min: 5.5, base_rate: 34.00, increment: 0.42 }
]

function getRate(fat, snf, liters) {
  const slab = slabs.find(s => s.snf === snf)
  if (!slab) return { rate: 35.0, total: 35.0 * liters }
  
  const fatMin = slab.fat_min
  const baseRate = slab.base_rate
  const increment = slab.increment

  const increments = Math.round((fat - fatMin) / 0.1)
  const rate = baseRate + increments * increment
  const total = rate * liters

  return {
    rate: Math.round(rate * 100) / 100,
    total: Math.round(total * 100) / 100
  }
}

function generate() {
  let sql = `-- ============================================================
-- Seeding 10 Days of Dummy Data (Morning & Evening)
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Populate SNF rate slabs if they do not exist
INSERT INTO snf_slabs (snf_value, fat_min, fat_max, base_rate, rate_per_fat_increment) VALUES
(88, 5.1, 6.1, 30.00, 0.32),
(89, 5.2, 6.2, 31.00, 0.35),
(90, 5.3, 6.3, 32.00, 0.38),
(91, 5.4, 6.4, 33.00, 0.40),
(92, 5.5, 6.5, 34.00, 0.42)
ON CONFLICT (snf_value) DO NOTHING;

-- 2. Create 5 test farmers
INSERT INTO farmers (id, code, name, phone, address, balance) VALUES
('f1111111-1111-1111-1111-111111111111', '1001', 'Ramesh Patel', '9876543210', 'Vitta Village', 0),
('f2222222-2222-2222-2222-222222222222', '1002', 'Suresh Sharma', '9876543211', 'Sahawa Village', 0),
('f3333333-3333-3333-3333-333333333333', '1003', 'Mahesh Singh', '9876543212', 'Vitta Village', 0),
('f4444444-4444-4444-4444-444444444444', '1004', 'Rajesh Kumar', '9876543213', 'Bikaner Road', 0),
('f5555555-5555-5555-5555-555555555555', '1005', 'Dinesh Verma', '9876543214', 'Sahawa Village', 0)
ON CONFLICT (phone) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name;

-- 3. Clean existing dummy collections to prevent duplicate errors
DELETE FROM milk_collections WHERE farmer_id IN (
  'f1111111-1111-1111-1111-111111111111',
  'f2222222-2222-2222-2222-222222222222',
  'f3333333-3333-3333-3333-333333333333',
  'f4444444-4444-4444-4444-444444444444',
  'f5555555-5555-5555-5555-555555555555'
);

-- 4. Insert Collections for the last 10 days
INSERT INTO milk_collections (farmer_id, collection_date, shift, quantity_liters, fat, snf, rate_per_liter, total_amount, milk_type) VALUES
`

  const farmers = [
    { id: 'f1111111-1111-1111-1111-111111111111', name: 'Ramesh Patel' },
    { id: 'f2222222-2222-2222-2222-222222222222', name: 'Suresh Sharma' },
    { id: 'f3333333-3333-3333-3333-333333333333', name: 'Mahesh Singh' },
    { id: 'f4444444-4444-4444-4444-444444444444', name: 'Rajesh Kumar' },
    { id: 'f5555555-5555-5555-5555-555555555555', name: 'Dinesh Verma' }
  ]

  const today = new Date()
  const rows = []

  for (let d = 9; d >= 0; d--) {
    const targetDate = new Date()
    targetDate.setDate(today.getDate() - d)
    const dateStr = targetDate.toISOString().split('T')[0]

    for (const shift of ['morning', 'evening']) {
      for (const farmer of farmers) {
        const milkType = Math.random() > 0.4 ? 'cow' : 'buffalo'
        const quantity = Math.round((8.0 + Math.random() * 10.0) * 10) / 10
        
        let fat = 4.5
        if (milkType === 'cow') {
          fat = Math.round((3.8 + Math.random() * 1.0) * 10) / 10
        } else {
          fat = Math.round((6.2 + Math.random() * 1.5) * 10) / 10
        }

        const slab = slabs[Math.floor(Math.random() * slabs.length)]
        const snf = slab.snf
        const { rate, total } = getRate(fat, snf, quantity)

        rows.push(`('${farmer.id}', '${dateStr}', '${shift}', ${quantity}, ${fat}, ${snf}, ${rate}, ${total}, '${milkType}')`)
      }
    }
  }

  sql += rows.join(',\n') + ';\n\n'

  sql += `-- 5. Update farmer balances to match their earnings
UPDATE farmers SET balance = -(
  SELECT COALESCE(SUM(total_amount), 0) FROM milk_collections WHERE farmer_id = farmers.id
) WHERE id IN (
  'f1111111-1111-1111-1111-111111111111',
  'f2222222-2222-2222-2222-222222222222',
  'f3333333-3333-3333-3333-333333333333',
  'f4444444-4444-4444-4444-444444444444',
  'f5555555-5555-5555-5555-555555555555'
);\n`

  const destPath = path.resolve('supabase', 'seed_test_data.sql')
  fs.writeFileSync(destPath, sql, 'utf8')
  console.log(`Successfully generated seed SQL at ${destPath}`)
}

generate()
