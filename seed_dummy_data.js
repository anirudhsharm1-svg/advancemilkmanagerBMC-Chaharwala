import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://smuuezmrixkekwowfzzf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtdXVlem1yaXhrZWt3b3dmenpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjYyNTIsImV4cCI6MjA5NDYwMjI1Mn0.uiwqQ3XhfGpW6GWiI9bEUyfzmHO33ZivBIUm2MfOO60'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Calculate milk rate based on slab
function getRate(fat, snf, liters, slabs) {
  const slab = slabs.find(s => s.snf_value === snf)
  if (!slab) return { rate: 35.0, total: 35.0 * liters } // Fallback
  
  const fatMin = parseFloat(slab.fat_min)
  const baseRate = parseFloat(slab.base_rate)
  const increment = parseFloat(slab.rate_per_fat_increment)

  const increments = Math.round((fat - fatMin) / 0.1)
  const rate = baseRate + increments * increment
  const total = rate * liters

  return {
    rate: Math.round(rate * 100) / 100,
    total: Math.round(total * 100) / 100
  }
}

async function run() {
  console.log("Checking SNF Slabs...")
  let { data: slabs, error: slabsErr } = await supabase.from('snf_slabs').select('*')
  if (slabsErr) {
    console.error("Error checking slabs:", slabsErr.message)
    return
  }

  if (!slabs || slabs.length === 0) {
    console.log("No rate slabs found in database. Populating standard slabs (SNF 80 to 95)...")
    const defaultSlabs = []
    for (let val = 80; val <= 95; val++) {
      const diff = val - 80
      defaultSlabs.push({
        snf_value: val,
        fat_min: 3.5,
        fat_max: 10.0,
        base_rate: Math.round((22.00 + diff * 1.2) * 100) / 100,
        rate_per_fat_increment: Math.round((0.30 + diff * 0.01) * 100) / 100
      })
    }
    const { data: insertedSlabs, error: insSlabsErr } = await supabase.from('snf_slabs').insert(defaultSlabs).select()
    if (insSlabsErr) {
      console.error("Error inserting rate slabs:", insSlabsErr.message)
      return
    }
    slabs = insertedSlabs
    console.log(`Successfully created ${slabs.length} rate slabs.`)
  } else {
    console.log(`Found ${slabs.length} existing rate slabs.`)
  }

  // Check if we have farmers
  let { data: farmers, error: farmErr } = await supabase.from('farmers').select('*')
  if (farmErr) {
    console.error("Error fetching farmers:", farmErr.message)
    return
  }

  if (farmers.length === 0) {
    console.log("No farmers found. Creating 5 dummy farmers...")
    const dummyFarmers = [
      { code: '1001', name: 'Ramesh Patel', phone: '9876543210', address: 'Vitta Village', balance: 0 },
      { code: '1002', name: 'Suresh Sharma', phone: '9876543211', address: 'Sahawa Village', balance: 0 },
      { code: '1003', name: 'Mahesh Singh', phone: '9876543212', address: 'Vitta Village', balance: 0 },
      { code: '1004', name: 'Rajesh Kumar', phone: '9876543213', address: 'Bikaner Road', balance: 0 },
      { code: '1005', name: 'Dinesh Verma', phone: '9876543214', address: 'Sahawa Village', balance: 0 },
    ]
    const { data: inserted, error: insErr } = await supabase.from('farmers').insert(dummyFarmers).select()
    if (insErr) {
      console.error("Error inserting dummy farmers:", insErr.message)
      return
    }
    farmers = inserted
    console.log(`Created ${farmers.length} dummy farmers.`)
  } else {
    console.log(`Found ${farmers.length} existing farmers. Using them for seed data.`)
  }

  // Ensure every farmer has a code
  for (let i = 0; i < farmers.length; i++) {
    if (!farmers[i].code) {
      const codeStr = String(1001 + i)
      await supabase.from('farmers').update({ code: codeStr }).eq('id', farmers[i].id)
      farmers[i].code = codeStr
    }
  }

  console.log("Generating 10 days of collection data...")
  const collectionsToInsert = []
  
  // Last 10 days
  const today = new Date()
  
  for (let d = 9; d >= 0; d--) {
    const targetDate = new Date()
    targetDate.setDate(today.getDate() - d)
    
    // YYYY-MM-DD
    const dateStr = targetDate.toISOString().split('T')[0]
    
    for (const shift of ['morning', 'evening']) {
      console.log(`Generating entries for ${dateStr} - ${shift}...`)
      
      for (const farmer of farmers) {
        // Random milk properties
        const milkType = Math.random() > 0.4 ? 'cow' : 'buffalo'
        const liters = Math.round((6.0 + Math.random() * 14.0) * 100) / 100 // 6.00 to 20.00 Liters
        
        // Typical FAT values: Cow (3.5 - 5.0), Buffalo (6.0 - 8.0)
        let fat = 4.0
        if (milkType === 'cow') {
          fat = Math.round((3.5 + Math.random() * 1.5) * 10) / 10
        } else {
          fat = Math.round((6.0 + Math.random() * 2.0) * 10) / 10
        }

        // SNF values: select a random slab value from DB slabs
        const randomSlab = slabs[Math.floor(Math.random() * slabs.length)]
        const snf = randomSlab.snf_value

        // Calculate rate & total amount
        const { rate, total } = getRate(fat, snf, liters, slabs)

        collectionsToInsert.push({
          farmer_id: farmer.id,
          collection_date: dateStr,
          shift,
          quantity_liters: liters,
          fat,
          snf,
          rate_per_liter: rate,
          total_amount: total,
          milk_type: milkType
        })
      }
    }
  }

  console.log(`Inserting ${collectionsToInsert.length} collection entries...`)
  
  // Insert in chunks of 50 to avoid network size limits
  const chunkSize = 50
  for (let i = 0; i < collectionsToInsert.length; i += chunkSize) {
    const chunk = collectionsToInsert.slice(i, i + chunkSize)
    
    const { error: insErr } = await supabase.from('milk_collections').insert(chunk)
    if (insErr) {
      console.log(`Error inserting chunk starting at index ${i}: ${insErr.message}. Trying clean fallback...`)
      // Fallback: Remove milk_type column if table migration was not run yet
      const cleanedChunk = chunk.map(({ milk_type, ...rest }) => rest)
      const { error: retryErr } = await supabase.from('milk_collections').insert(cleanedChunk)
      if (retryErr) {
        console.error("Retry insert failed:", retryErr.message)
      }
    }
  }

  // Update farmer balances based on total earnings
  console.log("Recalculating farmer balances...")
  for (const farmer of farmers) {
    const { data: colData } = await supabase.from('milk_collections').select('total_amount').eq('farmer_id', farmer.id)
    const totalEarnings = (colData || []).reduce((s, c) => s + parseFloat(c.total_amount || 0), 0)
    // Balance = initial (0) - totalEarnings (negative means they are owed)
    const newBalance = -totalEarnings
    await supabase.from('farmers').update({ balance: newBalance }).eq('id', farmer.id)
  }

  console.log("Seeding completed successfully!")
}

run()
