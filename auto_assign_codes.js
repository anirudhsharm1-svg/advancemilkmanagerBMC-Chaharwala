import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://smuuezmrixkekwowfzzf.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtdXVlem1yaXhrZWt3b3dmenpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjYyNTIsImV4cCI6MjA5NDYwMjI1Mn0.uiwqQ3XhfGpW6GWiI9bEUyfzmHO33ZivBIUm2MfOO60'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function run() {
  console.log("Fetching all farmers...")
  const { data: farmers, error: fetchError } = await supabase.from('farmers').select('*').order('created_at', { ascending: true })
  if (fetchError) {
    console.error("Error fetching farmers:", fetchError.message)
    return
  }

  console.log(`Found ${farmers.length} farmers. Assigning codes...`)
  let nextCode = 1001

  // Find max existing numeric code to avoid conflict
  farmers.forEach(f => {
    if (f.code) {
      const parsed = parseInt(f.code, 10)
      if (!isNaN(parsed) && parsed >= nextCode) {
        nextCode = parsed + 1
      }
    }
  })

  for (const farmer of farmers) {
    if (!farmer.code) {
      const codeStr = String(nextCode)
      console.log(`Assigning code ${codeStr} to ${farmer.name}...`)
      const { error: updateError } = await supabase
        .from('farmers')
        .update({ code: codeStr })
        .eq('id', farmer.id)
      
      if (updateError) {
        console.error(`Error updating farmer ${farmer.name}:`, updateError.message)
      } else {
        nextCode++
      }
    } else {
      console.log(`Farmer ${farmer.name} already has code: ${farmer.code}`)
    }
  }

  console.log("Auto-assignment completed.")
}

run()
