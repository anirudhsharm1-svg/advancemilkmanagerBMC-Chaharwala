import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://smuuezmrixkekwowfzzf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtdXVlem1yaXhrZWt3b3dmenpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjYyNTIsImV4cCI6MjA5NDYwMjI1Mn0.uiwqQ3XhfGpW6GWiI9bEUyfzmHO33ZivBIUm2MfOO60'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function run() {
  console.log("Seeding Routes...")
  const dummyRoutes = [
    { name: 'Route 53', code: 'R53' },
    { name: 'Route 28', code: 'R28' },
    { name: 'Route 12', code: 'R12' }
  ]

  const { data: routes, error: routeErr } = await supabase.from('routes').insert(dummyRoutes).select()
  if (routeErr) {
    console.error("Error inserting routes (they might already exist):", routeErr.message)
    return
  }
  console.log(`Seeded ${routes.length} routes.`)

  const route53 = routes.find(r => r.code === 'R53')
  const route28 = routes.find(r => r.code === 'R28')

  console.log("Seeding Societies...")
  const dummySocieties = [
    // Route 53
    { route_id: route53.id, code: '1235', name: 'Ad C' },
    { route_id: route53.id, code: '1236', name: 'Ekta' },
    { route_id: route53.id, code: '1270', name: 'New' },
    { route_id: route53.id, code: '1506', name: 'Dha' },
    { route_id: route53.id, code: '1279', name: 'Sahp' },
    { route_id: route53.id, code: '1490', name: 'new' },
    { route_id: route53.id, code: '1516', name: 'Dhan' },
    { route_id: route53.id, code: '1372', name: 'Local' },
    { route_id: route53.id, code: '1231', name: 'Bhadra' },
    // Route 28
    { route_id: route28.id, code: '2201', name: 'Sangaria' },
    { route_id: route28.id, code: '2202', name: 'Dabli' }
  ]

  const { data: societies, error: socErr } = await supabase.from('societies').insert(dummySocieties).select()
  if (socErr) {
    console.error("Error inserting societies:", socErr.message)
    return
  }
  console.log(`Seeded ${societies.length} societies.`)

  console.log("Generating 10 days of Route Dispatch transactions...")
  const dispatchesToInsert = []
  const today = new Date()

  // Generate for last 10 days
  for (let d = 9; d >= 0; d--) {
    const targetDate = new Date()
    targetDate.setDate(today.getDate() - d)
    const dateStr = targetDate.toISOString().split('T')[0]

    for (const shift of ['morning', 'evening']) {
      for (const soc of societies) {
        // Each society might have 1 or 2 entries for different milk types (buffalo vs cow)
        const milkTypes = Math.random() > 0.5 ? ['b', 'c'] : [Math.random() > 0.5 ? 'b' : 'c']

        for (const mt of milkTypes) {
          const cans = Math.floor(1 + Math.random() * 8)
          const qty = parseFloat((cans * 30 + Math.random() * 20).toFixed(1))
          
          let fat = 3.5
          if (mt === 'b') {
            fat = parseFloat((6.0 + Math.random() * 2.5).toFixed(1))
          } else {
            fat = parseFloat((3.5 + Math.random() * 1.3).toFixed(1))
          }

          const clr = parseFloat((26 + Math.floor(Math.random() * 5)).toFixed(1))
          
          // SNF Formula: CLR/4 + 0.21 * Fat + 0.66
          const snf = parseFloat((clr / 4 + 0.21 * fat + 0.66).toFixed(2))
          const kgFat = parseFloat((qty * fat / 100).toFixed(3))
          const kgSnf = parseFloat((qty * snf / 100).toFixed(3))

          dispatchesToInsert.push({
            date: dateStr,
            shift,
            route_id: soc.route_id,
            society_id: soc.id,
            milk_type: mt,
            cans,
            quantity: qty,
            fat,
            clr,
            snf,
            kg_fat: kgFat,
            kg_snf: kgSnf
          })
        }
      }
    }
  }

  console.log(`Inserting ${dispatchesToInsert.length} dispatch entries...`)
  const chunkSize = 50
  for (let i = 0; i < dispatchesToInsert.length; i += chunkSize) {
    const chunk = dispatchesToInsert.slice(i, i + chunkSize)
    const { error: insErr } = await supabase.from('route_dispatches').insert(chunk)
    if (insErr) {
      console.error(`Error inserting chunk starting at ${i}:`, insErr.message)
    }
  }

  console.log("Route Dispatch seeding completed successfully!")
}

run()
