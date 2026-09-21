import type { HandbookSeedNode } from "@/lib/programme/handbook-seed"

export const LEEFREGIO_TEMPLATE_NAME = "Omgevingsprogramma Sterke Leefregio's"

export const LEEFREGIO_SEED_NODES: HandbookSeedNode[] = [
  {
    title: "Inleiding en wettelijk kader",
    purpose: "Kader het programmadeel, de wettelijke grondslag en de leeswijzer.",
    instructions:
      "Noem de wettelijke grondslag en wat dit programmadeel besluit, alleen vanuit gebonden bronnen. Verzin geen visiehoofdstukken, belangen of juridische citaten die niet in die bronnen staan.",
    required: true,
    sortOrder: 1,
    fieldSpecs: [
      { key: "legal_basis", label: "Wettelijke grondslag", required: true },
      { key: "scope", label: "Geografische en temporele reikwijdte", required: true },
    ],
    qualityRules: "Citeer alleen de gebonden visie, handleiding en wetsteksten.",
    outputForm: "Proza met korte genummerde reikwijdtepunten.",
    relationHints: "Bronnen: handleiding + visie. Vervolg: alle hoofdstukken.",
  },
  {
    title: "Visie 4.2 Sterke Leefregio's",
    purpose: "Veranker de gebonden omgevingsvisie. Noem alleen belangen die in die bron staan.",
    instructions:
      "Werk alleen uit wat de gebonden visie en het gebonden beleid dekken (vaak wonen bij knooppunten en de belangen die daar genoemd worden). Verzin geen visieparagrafen, belangen 1–3 of 4.2-tekst die niet in de gebonden bronnen staan.",
    required: true,
    sortOrder: 2,
    fieldSpecs: [
      { key: "ambitions", label: "Visie-ambities", required: true },
      { key: "interests", label: "Provinciale belangen from the bound vision", required: true },
    ],
    qualityRules: "Noem belangen zoals in de gebonden visie, niet vrij parafraseren.",
    outputForm: "Kort proza plus een lijst ambitie/belang.",
    relationHints: "Bronnen: gebonden omgevingsvisie. Vervolg: wonen, mobiliteit, maatregelen.",
  },
  {
    title: "Wonen en samenleving",
    purpose: "Wonen bij knooppunten en de belangen die de gebonden bronnen noemen (vaak 14 en 20).",
    instructions:
      "Plaats woon- en leefbaarheidsmaatregelen hier. Grond claims alleen in de gebonden visie, bestaand beleid en het woonprogramma. Eis locatie of typologie. Verzin geen visieparagraaf 5.2 of belangen die niet in die bronnen staan.",
    required: true,
    sortOrder: 3,
    fieldSpecs: [{ key: "housing_focus", label: "Woonfocus", required: true }],
    qualityRules: "Verzin geen wooncijfers die niet in gebonden bronnen staan.",
    outputForm: "Narratief plus geplaatste maatregelen.",
    relationHints: "Bronnen: gebonden visie en gebonden bestaand beleid. Alleen belangen die daar staan.",
  },
  {
    title: "Mobiliteit",
    purpose: "Mobiliteit voor zover de gebonden bronnen die dekken.",
    instructions:
      "Werk mobiliteitsmaatregelen alleen uit als de gebonden bronnen die dekken. Koppel aan belangen die daar staan (vaak 20). Verzin belang 21 of modal-split-targets niet.",
    required: true,
    sortOrder: 4,
    fieldSpecs: [{ key: "mobility_focus", label: "Mobiliteitsfocus", required: true }],
    qualityRules: "Geen nieuwe modal-split-targets zonder bron.",
    outputForm: "Narratief plus geplaatste maatregelen.",
    relationHints: "Bronnen: gebonden visie en beleid waar die mobiliteit dekken. Vervolg: maatregelen en OER.",
  },
  {
    title: "Energie voor Sterke Leefregio's",
    purpose: "Energie voor zover relevant voor leefregio's in de gebonden bronnen.",
    instructions:
      "Alleen energieonderdelen die de leefregio raken: netcongestie bij woningbouw, warmte bij verdichting. Laat provinciebrede energiesystemen elders.",
    required: false,
    sortOrder: 5,
    fieldSpecs: [{ key: "energy_scope", label: "Relevante energieopgaven", required: false }],
    qualityRules: "Alleen wat de gebonden visie koppelt aan wonen of mobiliteit.",
    outputForm: "Korte constraint-lijst met citaten.",
    relationHints: "Bronnen: gebonden visie en effectenrapport waar die energie bij knooppunten dekken. Optioneel hoofdstuk.",
  },
  {
    title: "Volkshuisvestingsprogramma",
    purpose: "Het verplichte volkshuisvestingsprogramma-in-ontwikkeling.",
    instructions:
      "Verwerk het gebonden housing_programme. Neem bestaande teksten niet één-op-één over; maak er programmamaatregelen van die op de visie aansluiten.",
    required: true,
    sortOrder: 6,
    fieldSpecs: [{ key: "housing_programme", label: "Volkshuisvestingskoppeling", required: true }],
    qualityRules: "Geen blinde overname van het bestaande woonprogramma.",
    outputForm: "Narratief plus maatregelen op dit knooppunt.",
    relationHints: "Bronnen: gebonden woonprogramma of bestaand beleid plus gebonden visie.",
  },
  {
    title: "Maatregelenprogramma",
    purpose: "Registerverhaal: concrete SMART-maatregelen.",
    instructions:
      "Stel samen vanuit het maatregelenregister op de outline-knooppunten. Verzin geen maatregelen die niet in het register staan.",
    required: true,
    sortOrder: 7,
    fieldSpecs: [{ key: "measure_count", label: "Verwacht aantal maatregelen", required: false }],
    qualityRules: "Elke maatregel heeft citaten en een specifieke actie.",
    outputForm: "Gegroepeerd per knooppunt; bijlage-klaar.",
    relationHints: "Bronnen: analyse + register. Graaf: maatregel → doel → ambitie.",
  },
  {
    title: "Afstemming omgevingseffectrapport",
    purpose: "Positieve, negatieve en neutrale effecten en gerechtvaardigde afwijkingen.",
    instructions:
      "Per maatregel de effectrichting tegen het gebonden OER. Ongerechtvaardigde afwijkingen blijven open.",
    required: true,
    sortOrder: 8,
    fieldSpecs: [{ key: "deviations", label: "Open afwijkingen", required: false }],
    qualityRules: "Afwijking zonder motivering is onvolledig.",
    outputForm: "Tabel maatregel × richting × motivering.",
    relationHints: "Bronnen: OER + maatregelen.",
  },
  {
    title: "Uitvoering, monitoring en governance",
    purpose: "Rollen, planning, monitoring en herijking.",
    instructions:
      "Wijs eigenaarrollen, termijnen en indicatoren toe vanuit goedgekeurde maatregelen.",
    required: false,
    sortOrder: 9,
    fieldSpecs: [
      { key: "owners", label: "Eigenaarrollen", required: true },
      { key: "monitoring", label: "Monitoringcyclus", required: false },
    ],
    qualityRules: "Verzin geen budgetten die niet in bronnen staan.",
    outputForm: "Uitvoeringstabel.",
    relationHints: "Bronnen: maatregelen + handleiding. Optioneel hoofdstuk.",
  },
]

export const LEEFREGIO_TEMPLATE_META = {
  qualityRules:
    "Citeer alleen gebonden bronnen. Verplichte hoofdstukken moeten aanwezig zijn voor stakeholder-export. Maatregelen van type measure zijn specifiek, geciteerd en geplaatst.",
  outputForm:
    "Programma Sterke Leefregio's: genummerde hoofdstukken volgens deze structuur, maatregelenbijlage, bronvoetnoten.",
}
