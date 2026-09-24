import fs from "node:fs"
import path from "node:path"

import type { DocumentRole } from "@/lib/programme/domain"

const SOURCE_DIR = path.join(process.cwd(), "lib/programme/flevoland-sources")

export const FLEVOLAND_DEMO_FILES: Array<{ filename: string; title: string; role: DocumentRole }> = [
  {
    filename: "vision-2050.txt",
    title: "Ontwerp Omgevingsvisie Flevoland 2050, Blik op de toekomst",
    role: "environmental_vision",
  },
  {
    filename: "woonopgave.txt",
    title: "Notitie Flevolandse Woonopgave 2025-2050",
    role: "existing_policy",
  },
  {
    filename: "startnotitie.txt",
    title: "Startnotitie provinciaal volkshuisvestingsprogramma",
    role: "existing_policy",
  },
  {
    filename: "plan-van-aanpak.txt",
    title: "Plan van aanpak Flevolands volkshuisvestingsprogramma",
    role: "existing_policy",
  },
  {
    filename: "voortgang.txt",
    title: "Voortgangsrapportage woningbouw en brede welvaart, tweede helft 2025",
    role: "existing_policy",
  },
]

export function loadFlevolandDemoFiles(): Array<{ title: string; text: string; role: DocumentRole }> {
  return FLEVOLAND_DEMO_FILES.map((file) => ({
    title: file.title,
    role: file.role,
    text: fs.readFileSync(path.join(SOURCE_DIR, file.filename), "utf8").trim(),
  }))
}
