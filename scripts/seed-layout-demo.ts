#!/usr/bin/env tsx

import { createClient } from "@supabase/supabase-js"

const EMAIL = "local.dev@example.com"

const extraAuthorities: Array<{
  name: string
  spaceType: "municipal" | "regional" | "national" | "other"
  jurisdiction: string
  summary: string
  description: string
  programmes: Array<{ name: string; description: string }>
}> = [
  {
    name: "Gemeente Rotterdam",
    spaceType: "municipal",
    jurisdiction: "Rotterdam",
    summary: "A port city working on housing, climate, and a just energy transition.",
    description: "Rotterdam programmes cover waterfront densification, heat networks, and neighbourhood quality.",
    programmes: [
      { name: "Port city housing", description: "Add homes near the river without losing working harbour space." },
      { name: "Heat network south", description: "Connect districts to residual heat from the port." },
      { name: "Neighbourhood streets", description: "Calmer streets, trees, and play space in older districts." },
    ],
  },
  {
    name: "Gemeente Utrecht",
    spaceType: "municipal",
    jurisdiction: "Utrecht",
    summary: "A growing city balancing new neighbourhoods with the historic centre.",
    description: "Utrecht programmes focus on cycling, infill housing, and healthy public space.",
    programmes: [
      { name: "Merwede housing", description: "Car-light neighbourhood with social and mid-market homes." },
      { name: "City-wide cycling", description: "Complete the bicycle network and station approaches." },
    ],
  },
  {
    name: "Gemeente Den Haag",
    spaceType: "municipal",
    jurisdiction: "Den Haag",
    summary: "A coastal capital with coastal defence, housing, and international institutions.",
    description: "The Hague programmes cover Scheveningen, inner-city housing, and green schoolyards.",
    programmes: [
      { name: "Coastal living", description: "Homes and public space that sit with sea-level rise." },
      { name: "Inner-city densification", description: "Add homes around existing streets and courtyards." },
      { name: "Schoolyards as parks", description: "Open schoolyards after hours as neighbourhood green." },
    ],
  },
  {
    name: "Gemeente Haarlem",
    spaceType: "municipal",
    jurisdiction: "Haarlem",
    summary: "A compact historic city with pressure on housing and public space.",
    description: "Haarlem programmes focus on canals, stations, and climate-proof streets.",
    programmes: [
      { name: "Station district", description: "Homes and walking routes around Haarlem station." },
      { name: "Canal streets", description: "Cooler, greener streets along the historic canals." },
    ],
  },
  {
    name: "Gemeente Eindhoven",
    spaceType: "municipal",
    jurisdiction: "Eindhoven",
    summary: "A tech city matching housing growth with campuses and green wedges.",
    description: "Eindhoven programmes cover Brainport housing, mobility, and heat.",
    programmes: [
      { name: "Brainport housing", description: "Homes for a growing workforce next to campuses." },
      { name: "Regional mobility", description: "Bus, bike, and station access into the city." },
      { name: "District heating", description: "Expand heat networks in post-war neighbourhoods." },
    ],
  },
  {
    name: "Gemeente Almere",
    spaceType: "municipal",
    jurisdiction: "Almere",
    summary: "A new town still filling in, with room to test climate-proof neighbourhoods.",
    description: "Almere programmes cover new districts, nature edges, and water.",
    programmes: [
      { name: "Pampus district", description: "A new neighbourhood with social housing and water space." },
      { name: "Nature edges", description: "Keep city growth from eating the green fringe." },
    ],
  },
  {
    name: "Gemeente Groningen",
    spaceType: "municipal",
    jurisdiction: "Groningen",
    summary: "A northern city pairing a car-light centre with earthquake-proof housing.",
    description: "Groningen programmes cover the centre, villages, and heat from residual sources.",
    programmes: [
      { name: "Car-light centre", description: "More space for walking, cycling, and trees inside the canals." },
      { name: "Village housing", description: "Modest growth in villages that keep services open." },
    ],
  },
  {
    name: "Provincie Zuid-Holland",
    spaceType: "regional",
    jurisdiction: "Zuid-Holland",
    summary: "A dense province coordinating housing, landscape, and the delta.",
    description: "Provincial programmes cover growth locations, green buffers, and water safety.",
    programmes: [
      { name: "Growth locations", description: "Where extra homes can sit without losing polder landscape." },
      { name: "Green buffers", description: "Keep city edges from merging into one urban field." },
      { name: "Delta safety", description: "Align housing with dikes, rivers, and emergency water." },
    ],
  },
  {
    name: "Waterschap Amstel, Gooi en Vecht",
    spaceType: "other",
    jurisdiction: "Amstel, Gooi en Vecht",
    summary: "A water authority working on flooding, drought, and water quality.",
    description: "Programmes cover storage, clean water, and climate-proof polders.",
    programmes: [
      { name: "Rainwater storage", description: "Space for extreme rain in streets, parks, and polders." },
      { name: "Clean watercourses", description: "Restore banks and reduce nutrient load." },
    ],
  },
  {
    name: "Ministerie van Binnenlandse Zaken",
    spaceType: "national",
    jurisdiction: "Nederland",
    summary: "National housing and spatial policy that municipalities carry out.",
    description: "Programmes cover housing production, liveability, and shared rules.",
    programmes: [
      { name: "Housing production", description: "National agreements on homes, including social housing." },
      { name: "Liveable neighbourhoods", description: "Support for streets, schools, and meeting places." },
    ],
  },
]

const amsterdamProgrammes = [
  { name: "Mobility 2026–2030", description: "Public transport, cycling, and fewer cars in the inner city." },
  { name: "Green roofs and courts", description: "Cooling, water storage, and biodiversity on existing buildings." },
  { name: "Social housing quality", description: "Renovation, insulation, and fair allocation of social homes." },
  { name: "Water safety inner dikes", description: "Keep neighbourhoods dry as rainfall and river levels rise." },
  { name: "Circular construction", description: "Reuse materials in municipal works and housing projects." },
  { name: "School buildings", description: "Healthy, energy-efficient schools next to new housing." },
  { name: "Public space centres", description: "Squares, markets, and play space in densifying districts." },
  { name: "Heat transition South", description: "District heating and insulation in Amsterdam-Zuid." },
  { name: "Inner city densification", description: "Homes in courtyards and above shops without losing courts." },
  { name: "Bicycle network gaps", description: "Close missing links and calm dangerous junctions." },
  { name: "Noise and air quality", description: "Reduce traffic noise and keep housing away from dirty air." },
]

const amsterdamLibrary = [
  { title: "Environmental vision Amsterdam", summary: "The long-term spatial story the programmes must follow." },
  { title: "Housing agenda 2026", summary: "How many homes, where, and which tenures the city will protect." },
  { title: "Climate adaptation strategy", summary: "Heat, rain, and drought measures for streets and buildings." },
  { title: "Energy transition roadmap", summary: "Heat networks, insulation, and the end of household gas." },
  { title: "Mobility ordinance", summary: "Parking, cycling, and public transport rules for new districts." },
  { title: "Green structure plan", summary: "Parks, canals, and ecological connections that cannot be built over." },
  { title: "Waterboard advice", summary: "Storage and discharge requirements for new paving and roofs." },
  { title: "Social housing covenant", summary: "Agreements with housing associations on renovation and allocation." },
  { title: "Noise mapping 2024", summary: "Where new homes need extra façade insulation." },
  { title: "Circular procurement rules", summary: "How municipal works should reuse materials." },
]

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", EMAIL)
    .maybeSingle()
  if (profileError) throw profileError
  if (!profile) throw new Error(`No profile for ${EMAIL}`)
  const userId = profile.id

  const { data: amsterdam } = await supabase.from("spaces").select("id").eq("name", "Gemeente Amsterdam").maybeSingle()
  if (!amsterdam) throw new Error("Gemeente Amsterdam not found")

  let programmesAdded = 0
  for (const programme of amsterdamProgrammes) {
    const { data: existing } = await supabase
      .from("workspaces")
      .select("id")
      .eq("space_id", amsterdam.id)
      .eq("name", programme.name)
      .maybeSingle()
    if (existing) continue
    const { data: created, error } = await supabase
      .from("workspaces")
      .insert({
        space_id: amsterdam.id,
        name: programme.name,
        description: programme.description,
        created_by: userId,
        kind: "environmental_programme",
        metadata: { kind: "environmental_programme" },
      })
      .select("id")
      .single()
    if (error) throw error
    await supabase.from("workspace_members").upsert(
      { workspace_id: created.id, user_id: userId, role: "admin", job: "author" },
      { onConflict: "workspace_id,user_id" },
    )
    programmesAdded += 1
  }

  let docsAdded = 0
  const { error: visibilityError } = await supabase
    .from("space_items")
    .update({ visibility: "internal", classification: "internal" })
    .eq("space_id", amsterdam.id)
    .eq("item_type", "document")
  if (visibilityError) throw visibilityError
  const { data: existingDocs } = await supabase
    .from("space_items")
    .select("payload")
    .eq("space_id", amsterdam.id)
    .eq("item_type", "document")
  const existingTitles = new Set(
    (existingDocs ?? []).map((row) => String((row.payload as { title?: string } | null)?.title ?? "")),
  )
  for (const doc of amsterdamLibrary) {
    if (existingTitles.has(doc.title)) continue
    const { error } = await supabase.from("space_items").insert({
      space_id: amsterdam.id,
      item_type: "document",
      classification: "internal",
      visibility: "internal",
      payload: { title: doc.title, summary: doc.summary, file_name: `${doc.title}.pdf` },
      created_by: userId,
    })
    if (error) throw error
    docsAdded += 1
  }

  let authoritiesAdded = 0
  let extraProgrammes = 0
  for (const authority of extraAuthorities) {
    const { data: existingSpace } = await supabase.from("spaces").select("id").eq("name", authority.name).maybeSingle()
    let spaceId = existingSpace?.id
    if (!spaceId) {
      const { data: created, error } = await supabase
        .from("spaces")
        .insert({
          name: authority.name,
          slug: slugify(authority.name),
          owner_id: userId,
          space_type: authority.spaceType,
          visibility: "internal",
          jurisdiction: { label: authority.jurisdiction },
          description: authority.summary,
          metadata: {
            setupWizard: { completed: true, dismissed: true },
            scope: { description: authority.description, timeframe: "2026–2030" },
          },
        })
        .select("id")
        .single()
      if (error) throw error
      spaceId = created.id
      await supabase.from("space_members").upsert(
        { space_id: spaceId, user_id: userId, role: "owner", job: "administrator" },
        { onConflict: "space_id,user_id" },
      )
      authoritiesAdded += 1
    }

    for (const programme of authority.programmes) {
      const { data: existing } = await supabase
        .from("workspaces")
        .select("id")
        .eq("space_id", spaceId)
        .eq("name", programme.name)
        .maybeSingle()
      if (existing) continue
      const { data: created, error } = await supabase
        .from("workspaces")
        .insert({
          space_id: spaceId,
          name: programme.name,
          description: programme.description,
          created_by: userId,
          kind: "environmental_programme",
          metadata: { kind: "environmental_programme" },
        })
        .select("id")
        .single()
      if (error) throw error
      await supabase.from("workspace_members").upsert(
        { workspace_id: created.id, user_id: userId, role: "admin", job: "author" },
        { onConflict: "workspace_id,user_id" },
      )
      extraProgrammes += 1
    }
  }

  console.log(
    JSON.stringify(
      { amsterdamProgrammes: programmesAdded, amsterdamLibrary: docsAdded, authoritiesAdded, extraProgrammes },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
