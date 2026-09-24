import type { ChapterInput } from "@/lib/programme/domain"
import type { WorkupHeading } from "@/lib/programme/interests"

type SeedChapter = {
  title: string
  purpose: string
  instructions: string
  outputForm?: string
  drawsOn: ChapterInput[]
  required: boolean
  sortOrder: number
}

const GUARDRAILS =
  "Schrijf bevestigend en concreet. Verdeel geen woningaantallen over gemeenten en presenteer dit niet als het wettelijke volkshuisvestingsprogramma. Noem geen bedragen die niet in de bronnen staan."

export const FLEVOLAND_MEASURE_OUTPUT_FORM =
  "Orden de maatregelen per provinciaal belang, met het belang als tussenkop. Elke maatregel is alleen dit blok, in deze volgorde: Doel (de visieregel die de maatregel dient). Opgave. Rol van de provincie en wie verder handelt. Maatregel: de concrete actie. Gebied, alleen als een bron een gebied noemt. Termijn. Indicator. Middelen, alleen als een bron ze noemt. Geen langer verhaal om de blokken heen."

/** The nine parts of Flevoland's final programme structure. */
export const FLEVOLAND_PROGRAMME_CHAPTERS: SeedChapter[] = [
  {
    title: "Positionering en context",
    purpose: "Waarom dit programma er is, waar het staat in de beleidscyclus en welke provinciale belangen het uitwerkt.",
    instructions: `Beschrijf de aanleiding, de plaats van het programma tussen de Omgevingsvisie Flevoland 2050 en de Omgevingsverordening, en de gekozen provinciale belangen met per belang één zin over waarom het hier telt. Houd het bij één tot twee pagina's. ${GUARDRAILS}`,
    drawsOn: ["interests"],
    required: true,
    sortOrder: 1,
  },
  {
    title: "Opgaven en ontwikkelingen",
    purpose: "De opgaven en trends achter de gekozen belangen, met cijfers uit de bronnen.",
    instructions: `Beschrijf per gekozen belang de belangrijkste opgaven en ontwikkelingen, met cijfers en bronvermelding waar de bronnen die geven. Benoem waar opgaven van verschillende belangen op elkaar ingrijpen. ${GUARDRAILS}`,
    drawsOn: ["interests"],
    required: true,
    sortOrder: 2,
  },
  {
    title: "Ambities en doelen",
    purpose: "Wat de provincie per belang wil bereiken, en waar doelen elkaar versterken of schuren.",
    instructions: `Geef per gekozen belang de ambitie uit de visie en de doelen voor de programmaperiode, meetbaar waar de bronnen dat toelaten. Sluit af met een korte paragraaf over samenhang: waar doelen elkaar versterken en welke dilemma's bestuurlijk om een keuze vragen. ${GUARDRAILS}`,
    drawsOn: ["interests", "coherence"],
    required: true,
    sortOrder: 3,
  },
  {
    title: "Sturing en samenwerking",
    purpose: "De rol van de provincie per opgave en met wie zij samenwerkt.",
    instructions: `Beschrijf per belang welke rol de provincie neemt (zelf doen, samen met anderen, of anderen in staat stellen), met welke partners (gemeenten, Rijk, waterschap, corporaties, netbeheerders en andere partijen) en met welke instrumenten. Baseer de rol op de rolcheck van de maatregelen en op de bronnen. ${GUARDRAILS}`,
    drawsOn: ["measures", "interests"],
    required: true,
    sortOrder: 4,
  },
  {
    title: "Beleidsuitwerking en maatregelen",
    purpose: "De maatregelen per provinciaal belang, in een vaste compacte vorm.",
    instructions: `Zet alle behouden maatregelen in de vaste vorm, geordend per belang. Noem bij maatregelen die meerdere belangen dienen alle betrokken belangen. ${GUARDRAILS}`,
    outputForm: FLEVOLAND_MEASURE_OUTPUT_FORM,
    drawsOn: ["measures", "coherence"],
    required: true,
    sortOrder: 5,
  },
  {
    title: "Gebiedsgerichte uitwerking",
    purpose: "Waar maatregelen per leefregio of gebied anders uitpakken.",
    instructions: `Werk per leefregio of gebied uit wat de maatregelen daar betekenen, alleen waar de bronnen een gebied noemen. Laat gebieden weg waarover de bronnen niets zeggen. ${GUARDRAILS}`,
    drawsOn: ["measures"],
    required: false,
    sortOrder: 6,
  },
  {
    title: "Uitvoering en middelen",
    purpose: "Hoe de maatregelen worden uitgevoerd, in welke volgorde en met welke middelen.",
    instructions: `Beschrijf de uitvoering op hoofdlijnen: volgorde en termijnen van de maatregelen, wie trekt, en de middelen en financiële gevolgen voor zover de bronnen die noemen. Waar de bronnen geen middelen noemen, schrijf dat dit bij de begroting wordt bepaald. ${GUARDRAILS}`,
    drawsOn: ["measures"],
    required: true,
    sortOrder: 7,
  },
  {
    title: "Monitoring en actualisatie",
    purpose: "Hoe de voortgang wordt gevolgd en wanneer het programma wordt bijgesteld.",
    instructions: `Zet de indicatoren van de maatregelen bij elkaar, beschrijf de monitoringcyclus en de momenten waarop het programma wordt geëvalueerd en bijgesteld. Gebruik bestaande monitors uit de bronnen waar die er zijn. ${GUARDRAILS}`,
    drawsOn: ["measures"],
    required: true,
    sortOrder: 8,
  },
  {
    title: "De formele aspecten",
    purpose: "Juridische status, procedure en de verhouding tot de Omgevingsverordening en andere programma's.",
    instructions: `Beschrijf de juridische status van het programma onder de Omgevingswet, wie het vaststelt, hoe participatie en inspraak zijn ingericht, de looptijd, en de verhouding tot de Omgevingsverordening en andere programma's. Noem procedurestappen alleen voor zover de bronnen of de Omgevingswet ze noemen, en markeer wat bestuurlijk nog moet worden bepaald. ${GUARDRAILS}`,
    drawsOn: [],
    required: true,
    sortOrder: 9,
  },
]

/** The eight aspects Flevoland works up for each provincial interest. */
export const FLEVOLAND_WORKUP_HEADINGS: WorkupHeading[] = [
  { key: "onderbouwing", label: "Onderbouwing van het provinciale belang" },
  { key: "ambities", label: "Ambities en opgaven" },
  { key: "beleidskeuzes", label: "Beleidskeuzes, maatregelen en de rol van de provincie" },
  { key: "bestaand_beleid", label: "Bestaand beleid en beleidsregels" },
  { key: "gebied", label: "Gebieds- en locatiespecifieke uitwerking waar relevant" },
  { key: "uitvoerbaarheid", label: "Uitvoerbaarheid, middelen en financiële consequenties op hoofdlijnen" },
  { key: "samenhang", label: "Samenhang met andere provinciale belangen en de Omgevingsverordening" },
  { key: "monitoring", label: "Monitoring, evaluatie en bijstelling" },
]

export const FLEVOLAND_FOCUS_INTERESTS = ["14", "15", "16"]

export const FLEVOLAND_DEFAULT_MODEL_ID = "gpt-5.6"
