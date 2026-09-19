import type { HandbookSeedNode } from "@/lib/programme/handbook-seed"

export const LEEFREGIO_TEMPLATE_NAME = "Omgevingsprogramma Sterke Leefregio's"

export const LEEFREGIO_SEED_NODES: HandbookSeedNode[] = [
  {
    title: "Inleiding en wettelijk kader",
    purpose: "Kader het programmadeel, de wettelijke grondslag en de leeswijzer.",
    instructions:
      "Noem de wettelijke grondslag, de relatie tot de Omgevingsvisie Flevoland 2050, en wat dit programmadeel besluit. Verzin geen juridische citaten.",
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
    purpose: "Veranker hoofdstuk 4.2 van de visie en de provinciale belangen 1, 2 en 3.",
    instructions:
      "Werk uit vanuit Omgevingsvisie 4.2 Sterke Leefregio's, met aandacht voor 2.2 Wonen en Mobiliteit, 3.1 Wensbeeld 2050 en 3.2 rollen van de provincie. Koppel ambities aan provinciale belangen 1–3.",
    required: true,
    sortOrder: 2,
    fieldSpecs: [
      { key: "ambitions", label: "Visie-ambities", required: true },
      { key: "interests", label: "Provinciale belangen 1–3", required: true },
    ],
    qualityRules: "Noem belangen zoals in de visie, niet vrij parafraseren.",
    outputForm: "Kort proza plus een lijst ambitie/belang.",
    relationHints: "Bronnen: visie 4.2. Vervolg: wonen, mobiliteit, maatregelen.",
  },
  {
    title: "Wonen en samenleving",
    purpose: "Hoofdstuk 5.2 en provinciale belangen 14, 15 en 16.",
    instructions:
      "Plaats woon- en leefbaarheidsmaatregelen hier. Grond claims in visie 5.2 en het volkshuisvestingsprogramma. Eis locatie of typologie.",
    required: true,
    sortOrder: 3,
    fieldSpecs: [{ key: "housing_focus", label: "Woonfocus", required: true }],
    qualityRules: "Verzin geen wooncijfers die niet in gebonden bronnen staan.",
    outputForm: "Narratief plus geplaatste maatregelen.",
    relationHints: "Bronnen: visie 5.2 + volkshuisvesting. Belangen 14–16.",
  },
  {
    title: "Mobiliteit",
    purpose: "Hoofdstuk 5.4 en provinciale belangen 20 en 21.",
    instructions:
      "Werk mobiliteitsmaatregelen uit die bijdragen aan Sterke Leefregio's. Koppel aan belangen 20 en 21. Signaleer spanning met landschap of leefbaarheid.",
    required: true,
    sortOrder: 4,
    fieldSpecs: [{ key: "mobility_focus", label: "Mobiliteitsfocus", required: true }],
    qualityRules: "Geen nieuwe modal-split-targets zonder bron.",
    outputForm: "Narratief plus geplaatste maatregelen.",
    relationHints: "Bronnen: visie 5.4. Vervolg: maatregelen en OER.",
  },
  {
    title: "Energie voor Sterke Leefregio's",
    purpose: "Hoofdstuk 5.5 voor zover relevant voor leefregio's.",
    instructions:
      "Alleen energieonderdelen die de leefregio raken: netcongestie bij woningbouw, warmte bij verdichting. Laat provinciebrede energiesystemen elders.",
    required: false,
    sortOrder: 5,
    fieldSpecs: [{ key: "energy_scope", label: "Relevante energieopgaven", required: false }],
    qualityRules: "Alleen wat de visie 5.5 koppelt aan wonen of mobiliteit.",
    outputForm: "Korte constraint-lijst met citaten.",
    relationHints: "Bronnen: visie 5.5. Optioneel hoofdstuk.",
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
    relationHints: "Bronnen: housing_programme + visie 5.2.",
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
