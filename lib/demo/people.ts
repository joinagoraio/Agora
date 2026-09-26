import "server-only"

import { randomBytes } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import { logger } from "@/lib/utils/logger"

export type DemoPerson = {
  slug: string
  name: string
  /** What they do, in the words the AI uses to write as them. */
  role: string
  /** Colleagues work on the programme as writer or reviewer. */
  job?: "author" | "reviewer"
}

/** Fictional colleagues of the province who read along on the draft. */
export const DEMO_COLLEAGUES: DemoPerson[] = [
  { slug: "anne-bakker", name: "Anne Bakker", role: "beleidsadviseur wonen", job: "author" },
  { slug: "joris-van-dam", name: "Joris van Dam", role: "jurist omgevingsrecht", job: "reviewer" },
  { slug: "fatima-el-amrani", name: "Fatima El Amrani", role: "adviseur financiën en subsidies", job: "reviewer" },
  { slug: "pieter-de-graaf", name: "Pieter de Graaf", role: "accountmanager gemeenten", job: "author" },
  { slug: "lotte-visser", name: "Lotte Visser", role: "adviseur natuur, water en landschap", job: "reviewer" },
]

/** Fictional residents and partners who respond to the published programme. */
export const DEMO_RESIDENTS: DemoPerson[] = [
  { slug: "marieke-jansen", name: "Marieke Jansen (Almere)", role: "inwoner van Almere, starter op de woningmarkt" },
  { slug: "ruud-de-boer", name: "Ruud de Boer (Lelystad)", role: "inwoner van Lelystad, gepensioneerd" },
  { slug: "sanne-mulder", name: "Sanne Mulder (Dronten)", role: "inwoner van Dronten, jong gezin" },
  { slug: "henk-kramer", name: "Henk Kramer (Urk)", role: "inwoner van Urk, ondernemer" },
  { slug: "karin-hoekstra", name: "Karin Hoekstra (gemeente)", role: "beleidsmedewerker wonen van een Flevolandse gemeente" },
  { slug: "wim-postma", name: "Wim Postma (woningcorporatie)", role: "directeur vastgoed van een woningcorporatie" },
  { slug: "ilse-dekker", name: "Ilse Dekker (natuurorganisatie)", role: "medewerker van een regionale natuurorganisatie" },
  { slug: "tom-vermeer", name: "Tom Vermeer (ontwikkelaar)", role: "projectontwikkelaar woningbouw" },
]

function demoEmail(slug: string) {
  return `agora-demo-${slug}@example.com`
}

/** Makes sure each demo person has an account that nobody can sign in to, and returns their ids by slug. */
export async function ensureDemoPeople(people: DemoPerson[]): Promise<Map<string, string>> {
  const admin = createAdminClient()
  const emails = people.map((person) => demoEmail(person.slug))
  const { data: existing } = await admin.from("profiles").select("id, email").in("email", emails)
  const ids = new Map<string, string>()
  for (const person of people) {
    const email = demoEmail(person.slug)
    let id = (existing || []).find((row) => row.email === email)?.id as string | undefined
    if (!id) {
      const created = await admin.auth.admin.createUser({
        email,
        password: randomBytes(24).toString("hex"),
        email_confirm: true,
        user_metadata: { full_name: person.name, language: "nl" },
        app_metadata: { demo_person: true },
      })
      id = created.data.user?.id
      if (!id) {
        logger.warn("[DemoPeople] Could not create a demo person", { slug: person.slug, error: created.error?.message })
        continue
      }
    }
    await admin.from("profiles").upsert({ id, email, full_name: person.name, language: "nl" }, { onConflict: "id" })
    ids.set(person.slug, id)
  }
  return ids
}

/** Adds the demo colleagues to the demo authority and its programme, as writers and reviewers. */
export async function addDemoColleagues(workspaceId: string, spaceId: string): Promise<Map<string, string>> {
  const ids = await ensureDemoPeople(DEMO_COLLEAGUES)
  const admin = createAdminClient()
  for (const person of DEMO_COLLEAGUES) {
    const id = ids.get(person.slug)
    if (!id) continue
    await admin.from("space_members").upsert({ space_id: spaceId, user_id: id, role: "member" }, { onConflict: "space_id,user_id" })
    await admin
      .from("workspace_members")
      .upsert({ workspace_id: workspaceId, user_id: id, role: "member", job: person.job ?? "author" }, { onConflict: "workspace_id,user_id" })
  }
  return ids
}
