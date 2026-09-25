import type { DemoTour, TourAction, TourCondition, TourStep, TourText } from "@/lib/programme/demo-tour"

/** Raise when the steps or texts change, so stored packs pick up the new tour. */
export const FLEVOLAND_TOUR_VERSION = 9

type Place = TourStep["place"]

function step(
  id: string,
  block: string,
  place: Place,
  options: { target?: string; click?: string; waitForJob?: TourStep["waitForJob"]; estMinutes: number },
  nl: TourText,
  en: TourText,
): TourStep {
  return { id, block, place, ...options, text: { nl, en } }
}

const DOC: Place = { view: "document" }
const READ: Place = { view: "document", mode: "read" }
const section = (name: NonNullable<Place["section"]>): Place => ({ view: "document", section: name })

const click = (target: string, extra: Partial<Extract<TourAction, { do: "click" }>> = {}): TourAction => ({ do: "click", target, ...extra })
const wait = (ms: number): TourAction => ({ do: "wait", ms })
const at = (fact: string, min = 1): TourCondition => ({ fact, min })

/** What the autopilot does on each step, and when a step counts as done. */
const AUTOPILOT: Record<string, Pick<TourStep, "auto" | "doneWhen">> = {
  sources: {
    doneWhen: [at("setup")],
    auto: [click("start-writing"), { do: "waitFor", condition: at("setup"), timeoutMs: 60000 }, wait(2000)],
  },
  digest: {
    auto: [
      click("make-digest"),
      { do: "waitFor", condition: at("digests"), timeoutMs: 180000 },
      { do: "waitNarration" },
      wait(1000),
      click("read-digest", { optional: true }),
    ],
  },
  "platform-ai": { auto: [{ do: "waitNarration" }] },
  "authority-models": {
    auto: [
      click("agents-toggle", { state: "closed", optional: true }),
      click("space-models"),
      { do: "waitNarration" },
      { do: "key", key: "Escape" },
    ],
  },
  "authority-agent": {
    auto: [
      click("agents-toggle", { state: "closed", optional: true }),
      click("agent-edit"),
      { do: "waitNarration" },
      { do: "key", key: "Escape" },
    ],
  },
  "run-analysis": {
    doneWhen: [at("analysis")],
    auto: [click("run-analysis"), { do: "waitFor", condition: at("analysis"), timeoutMs: 420000 }],
  },
  "vision-view": { auto: [click("tool-switch-vision"), { do: "waitNarration" }, click("tool-switch-findings")] },
  "interests-list": { auto: [click("interests-selected-only", { state: "off", optional: true })] },
  workup: {
    doneWhen: [{ fact: "workups", min: 1, atLeastFact: "chosen" }],
    auto: [click("workup-chosen"), { do: "waitJob", kind: "workup" }, wait(2000)],
  },
  "open-workup": { auto: [click("open-workup"), { do: "waitNarration" }, { do: "key", key: "Escape" }] },
  propose: {
    doneWhen: [{ fact: "measuredInterests", min: 1, atLeastFact: "chosen" }],
    auto: [1, 2, 3].map(() => ({
      do: "group" as const,
      unless: { fact: "measuredInterests", min: 1, atLeastFact: "chosen" },
      actions: [click("propose-measures", { state: "todo" }), { do: "waitJob" as const, kind: "measures" as const }, wait(4000)],
    })),
  },
  register: { auto: [click("measure-row")] },
  decide: {
    doneWhen: [at("decided", 3), at("dropped")],
    auto: [
      { do: "group", unless: at("decided", 1), actions: [click("measure-row", { state: "undecided" }), click("decision-keep"), wait(1500)] },
      {
        do: "group",
        unless: at("decided", 2),
        actions: [
          click("measure-row", { state: "undecided" }),
          click("decision-adapt"),
          {
            do: "type",
            target: "decision-reason",
            text: {
              nl: "Sluit aan op de bestaande woningbouwmonitor, zodat gemeenten niet twee keer rapporteren.",
              en: "Tie this to the existing housing monitor, so municipalities do not report twice.",
            },
          },
          click("decision-confirm"),
          wait(1500),
        ],
      },
      {
        do: "group",
        unless: at("dropped"),
        actions: [
          click("measure-row", { state: "undecided" }),
          click("decision-drop"),
          {
            do: "type",
            target: "decision-reason",
            text: {
              nl: "Valt buiten de rol van de provincie; gemeenten regelen dit al zelf.",
              en: "Outside the province's role; municipalities already arrange this themselves.",
            },
          },
          click("decision-confirm"),
          wait(1500),
        ],
      },
    ],
  },
  priority: {
    doneWhen: [at("prioritised", 3)],
    auto: [
      { do: "group", unless: at("prioritised", 1), actions: [click("measure-row", { state: "unprioritised" }), click("priority-high"), wait(1500)] },
      { do: "group", unless: at("prioritised", 2), actions: [click("measure-row", { state: "unprioritised" }), click("priority-high"), wait(1500)] },
      { do: "group", unless: at("prioritised", 3), actions: [click("measure-row", { state: "unprioritised" }), click("priority-low"), wait(1500)] },
    ],
  },
  roles: {
    doneWhen: [at("rolesChecked")],
    auto: [click("check-roles"), { do: "waitJob", kind: "roles" }, wait(1500)],
  },
  break: { auto: [{ do: "waitNarration" }, { do: "pause" }] },
  compare: {
    doneWhen: [at("coherence")],
    auto: [click("compare-interests"), { do: "waitJob", kind: "coherence" }, wait(2500)],
  },
  grid: {
    auto: [click("coherence-cell", { optional: true }), { do: "waitNarration" }, click("coherence-show-all", { optional: true })],
  },
  dilemmas: {
    doneWhen: [at("coherenceDecided", 2)],
    auto: [
      click("coherence-keep", { state: "dilemma undecided", optional: true, unless: at("coherenceDecided", 1) }),
      wait(1200),
      click("coherence-keep", { state: "shared_measure undecided", optional: true, unless: at("coherenceDecided", 2) }),
      wait(1200),
      {
        do: "group",
        optional: true,
        unless: at("coherenceDecided", 3),
        actions: [
          click("coherence-drop", { state: "reinforces undecided", optional: true }),
          {
            do: "type",
            target: "coherence-reason",
            optional: true,
            text: {
              nl: "Dit volgt al uit de gedeelde maatregelen; het programma hoeft het niet apart te noemen.",
              en: "This already follows from the shared measures; the programme need not name it separately.",
            },
          },
          click("coherence-drop-confirm", { optional: true }),
        ],
      },
    ],
  },
  effects: {
    doneWhen: [at("effects")],
    auto: [click("save-effects"), { do: "waitFor", condition: at("effects"), timeoutMs: 30000 }],
  },
  write: {
    doneWhen: [{ fact: "chaptersWritten", min: 1, atLeastFact: "chapters" }],
    auto: [click("write-chapters"), wait(3000)],
  },
  comments: { auto: [click("show-comments", { state: "off", optional: true })] },
  "common-notes": { auto: [click("find-common-notes", { optional: true, onlyIf: at("comments", 2) })] },
  review: {
    doneWhen: [at("approved")],
    auto: [
      click("request-review", { unless: at("reviewRequested") }),
      { do: "waitFor", condition: at("reviewRequested"), timeoutMs: 60000 },
      click("approve-chapter"),
      { do: "waitFor", condition: at("approved"), timeoutMs: 30000 },
    ],
  },
  "read-programme": {
    auto: [
      { do: "waitJob", kind: "fill" },
      { do: "scrollTo", text: "Ambities en doelen" },
      wait(15000),
      { do: "scrollTo", text: "Beleidsuitwerking en maatregelen" },
    ],
  },
  redraft: {
    doneWhen: [at("redrafts")],
    auto: [
      click("chapter-edit"),
      wait(1500),
      click("chapter-tools"),
      wait(800),
      click("regenerate-chapter"),
      { do: "waitJob", kind: "chapter" },
      wait(2000),
    ],
  },
  audit: {
    doneWhen: [at("freezes")],
    auto: [
      click("demo-approve-rest", { unless: at("allApproved") }),
      { do: "waitFor", condition: at("allApproved"), timeoutMs: 60000 },
      wait(1500),
      click("audit-pack"),
      { do: "waitFor", condition: at("freezes"), timeoutMs: 60000 },
    ],
  },
  word: { auto: [click("export-docx"), wait(3000)] },
  publish: {
    doneWhen: [at("publications")],
    auto: [click("publish-snapshot"), { do: "waitFor", condition: at("publications"), timeoutMs: 60000 }],
  },
  consultation: {
    doneWhen: [at("consultations")],
    auto: [click("open-consultation"), { do: "waitFor", condition: at("consultations"), timeoutMs: 60000 }],
  },
}

function withAutopilot(steps: TourStep[]): TourStep[] {
  return steps.map((item) => ({ ...item, ...AUTOPILOT[item.id] }))
}

export const FLEVOLAND_TOUR: DemoTour = {
  version: FLEVOLAND_TOUR_VERSION,
  blocks: [
    { id: "setup", title: { nl: "Opzetten voor Flevoland", en: "Set up for Flevoland" }, minutes: 20 },
    { id: "ai", title: { nl: "Hoe de AI is ingericht", en: "How the AI is set up" }, minutes: 8 },
    { id: "analysis", title: { nl: "Wat er al aan beleid is", en: "What policy already exists" }, minutes: 17 },
    { id: "interests", title: { nl: "Belangen en uitwerkingen", en: "Interests and work-ups" }, minutes: 20 },
    { id: "measures", title: { nl: "Maatregelen", en: "Measures" }, minutes: 33 },
    { id: "break", title: { nl: "Pauze", en: "Break" }, minutes: 15 },
    { id: "coherence", title: { nl: "Samenhang tussen belangen", en: "Across interests" }, minutes: 20 },
    { id: "effects", title: { nl: "Effecten", en: "Effects" }, minutes: 10 },
    { id: "write", title: { nl: "Het programma schrijven", en: "Write the programme" }, minutes: 5 },
    { id: "together", title: { nl: "Samenwerken", en: "Working together" }, minutes: 20 },
    { id: "read", title: { nl: "Het resultaat lezen", en: "Read the result" }, minutes: 10 },
    { id: "accountability", title: { nl: "Verantwoording", en: "Accountability" }, minutes: 20 },
    { id: "publish", title: { nl: "Publiceren en inspraak", en: "Publish and consult" }, minutes: 20 },
    { id: "questions", title: { nl: "Vragen", en: "Questions" }, minutes: 15 },
    { id: "heard", title: { nl: "Wat we hebben gehoord", en: "What we heard" }, minutes: 5 },
  ],
  steps: withAutopilot([
    step(
      "welcome",
      "setup",
      DOC,
      { estMinutes: 4 },
      {
        title: "Welkom: wat Agora is",
        action: "Laat het scherm staan terwijl de middag wordt ingeleid.",
        why: "Het publiek moet eerst weten wat het ziet: een werkbank voor ambtenaren die een omgevingsprogramma schrijven, op basis van de eigen stukken van de provincie. En dat Agora niet meeluistert: de microfoon staat alleen aan zolang de knop Vragen is ingedrukt.",
        expect: "Het nieuwe programma van Flevoland, nog zonder tekst.",
        narration:
          "Welkom. Vanmiddag laten we zien hoe Agora de provincie Flevoland helpt een omgevingsprogramma te schrijven. We beginnen bij de omgevingsvisie en het bestaande beleid, werken via de provinciale belangen naar concrete maatregelen, en eindigen met een programma dat klaar is voor inspraak. Alles wat u ziet draait op echte stukken: de ontwerp-omgevingsvisie Flevoland 2050 en vier stukken over wonen. Agora schrijft niet in plaats van de ambtenaar. Het leest, stelt voor en onderbouwt; de ambtenaar besluit. En elke bewering verwijst naar een bladzijde in een bron. Nog één ding vooraf: Agora luistert niet mee. Wat u hoort is vooraf opgenomen. Alleen als we de knop Vragen ingedrukt houden, staat de microfoon aan en gaat die ene vraag naar de AI. Zodra we loslaten, is de microfoon weer uit.",
      },
      {
        title: "Welcome: what Agora is",
        action: "Leave the screen as it is while the afternoon is introduced.",
        why: "The room first needs to know what it is looking at: a workbench for civil servants who write an environmental programme, built on the province's own documents. And that Agora is not listening: the microphone is on only while the Questions button is held down.",
        expect: "Flevoland's new programme, still without text.",
        narration:
          "Welcome. This afternoon we show how Agora helps the province of Flevoland write an environmental programme. We start from the environmental vision and the policy that already exists, work through the provincial interests to concrete measures, and finish with a programme that is ready for public consultation. Everything you see runs on real documents: the draft Flevoland 2050 environmental vision and four documents on housing. Agora does not write instead of the civil servant. It reads, proposes and backs up; the civil servant decides. And every claim points to a page in a source. One more thing before we start: Agora is not listening. What you hear was recorded in advance. Only while we hold down the Questions button is the microphone on, and only that one question goes to the AI. As soon as we let go, the microphone is off again.",
      },
    ),
    step(
      "different-kind",
      "setup",
      DOC,
      { estMinutes: 2 },
      {
        title: "Een ander soort applicatie",
        action: "Laat het scherm staan; dit hoort bij de inleiding.",
        why: "Agora is geen vast product. Het is door mensen en AI samen ontwikkeld en groeit mee met hoe het gebruikt wordt. De vragen van vandaag helpen het beter te maken.",
        expect: "Het programma van Flevoland, nog zonder tekst.",
        narration:
          "Agora is een ander soort applicatie. Het is ontwikkeld door mensen en AI samen, vanuit een gedeeld begrip van wat de ambtenaar nodig heeft. Daardoor is het geen vast product: het groeit mee met hoe u ermee werkt. Wat u vandaag vraagt, aan de knop Vragen of in het venster Vraag, helpt ons Agora beter te maken. Alleen die vragen en antwoorden bewaren we, voor een samenvatting aan het eind van de middag. Deze rondleiding zelf is nog in bèta: een interne functie voor demonstraties, die later nieuwe gebruikers kan helpen op weg te komen, of ervaren gebruikers meer uit Agora te halen.",
      },
      {
        title: "A different kind of application",
        action: "Leave the screen as it is; this is part of the introduction.",
        why: "Agora is not a fixed product. It was developed by people and AI together and grows with the way it is used. Today's questions help make it better.",
        expect: "Flevoland's programme, still without text.",
        narration:
          "Agora is a different kind of application. It was developed by people and AI together, from a shared understanding of what civil servants need. So it is not a fixed product: it grows with the way you work with it. What you ask today, with the Questions button or in the Ask window, helps us make Agora better. Only those questions and answers are kept, for a summary at the end of the afternoon. This tour itself is still in beta: an internal feature for demonstrations, which could later help new users get started, or help experienced users get more out of Agora.",
      },
    ),
    step(
      "sources",
      "setup",
      DOC,
      { target: "start-writing", estMinutes: 3 },
      {
        title: "Bronnen met een rol",
        action: "Controleer dat de omgevingsvisie en het bestaande beleid gekozen zijn, en klik 'Begin met schrijven'.",
        why: "Elke bron krijgt een rol. Die rol bepaalt wat Agora ermee doet: de visie geeft de koers, het bestaande beleid wordt getoetst.",
        expect: "Het document opent met de negen delen, nog leeg.",
        narration:
          "Eerst de bronnen. Elke bron krijgt een rol. De omgevingsvisie geeft de koers. De stukken over wonen zijn bestaand beleid: dat gaan we zo toetsen. Agora gebruikt alleen wat hier gekoppeld is. Er komt niets van internet bij, en niets wat de provincie niet zelf heeft aangeleverd.",
      },
      {
        title: "Sources with a role",
        action: "Check that the environmental vision and the existing policy are chosen, then click 'Start writing'.",
        why: "Each source gets a role. The role decides what Agora does with it: the vision sets the direction, existing policy gets tested.",
        expect: "The document opens with its nine parts, still empty.",
        narration:
          "First, the sources. Each source gets a role. The environmental vision sets the direction. The housing documents are existing policy, which we will test in a moment. Agora only uses what is linked here. Nothing comes in from the internet, and nothing the province did not supply itself.",
      },
    ),
    step(
      "structure",
      "setup",
      section("outline"),
      { estMinutes: 3 },
      {
        title: "De structuur van de provincie",
        action: "Laat de negen delen in de structuur zien. Beweeg over een kop om te lezen wat erin hoort.",
        why: "De structuur komt van de provincie zelf: negen delen, van positionering en context tot de formele aspecten. Agora schrijft binnen die structuur, niet in een eigen format.",
        expect: "De negen delen van het programma, elk met een beschrijving.",
        narration:
          "Dan de structuur. Flevoland heeft een vaste opbouw voor omgevingsprogramma's: negen delen, van positionering en context tot de formele aspecten. Die structuur staat hier klaar. Agora schrijft daarbinnen, en elk deel weet wat erin hoort en uit welke bronnen het put.",
      },
      {
        title: "The province's structure",
        action: "Show the nine parts in the structure. Hover a heading to read what belongs in it.",
        why: "The structure comes from the province itself: nine parts, from positioning and context to the formal aspects. Agora writes inside that structure, not in a format of its own.",
        expect: "The programme's nine parts, each with a description.",
        narration:
          "Next, the structure. Flevoland has a fixed layout for environmental programmes: nine parts, from positioning and context to the formal aspects. That structure is set up here. Agora writes inside it, and each part knows what belongs in it and which sources it draws on.",
      },
    ),
    step(
      "knowledge",
      "setup",
      { view: "knowledge" },
      { estMinutes: 3 },
      {
        title: "De bibliotheek van het programma",
        action: "Laat de bestanden zien en wijs op de rol bij elk bestand.",
        why: "Hier staat alles waar het programma op steunt. Een ambtenaar kan hier bestanden toevoegen of een andere rol geven.",
        expect: "Vijf bronnen, elk met een rol.",
        narration:
          "Dit is de bibliotheek van het programma. De omgevingsvisie, de notitie Flevolandse woonopgave, de startnotitie en het plan van aanpak voor het volkshuisvestingsprogramma, en de voortgangsrapportage woningbouw. Agora leest niet alleen de eerste bladzijden, maar zoekt per vraag de relevante delen op, tot op de pagina.",
      },
      {
        title: "The programme's library",
        action: "Show the files and point at the role of each one.",
        why: "Everything the programme rests on is here. A civil servant can add files here or change their role.",
        expect: "Five sources, each with a role.",
        narration:
          "This is the programme's library. The environmental vision, the note on Flevoland's housing task, the starting note and the plan of approach for the housing programme, and the progress report on house building. Agora does not just read the first pages. For each question it looks up the relevant parts, down to the page.",
      },
    ),
    step(
      "configuration",
      "setup",
      section("setup"),
      { estMinutes: 3 },
      {
        title: "Wie is eigenaar, wat is verplicht",
        action: "Laat de documenteigenaar en het reviewbeleid zien.",
        why: "De provincie legt vast wie eigenaar is van het programma, welke hoofdstukken verplicht zijn, en of een tweede ambtenaar moet goedkeuren.",
        expect: "De instellingen van dit programma.",
        narration:
          "In de configuratie legt de provincie vast wie eigenaar is van het programma en hoe er wordt goedgekeurd. Bijvoorbeeld: mag de schrijver zijn eigen hoofdstuk goedkeuren, of moet een tweede ambtenaar tekenen? Dat zijn keuzes van de organisatie, niet van de software.",
      },
      {
        title: "Who owns it, what is required",
        action: "Show the document owner and the review policy.",
        why: "The province records who owns the programme, which chapters are required, and whether a second civil servant must approve.",
        expect: "This programme's settings.",
        narration:
          "In the configuration the province records who owns the programme and how approval works. For example: may the writer approve their own chapter, or must a second civil servant sign off? Those are choices for the organisation, not for the software.",
      },
    ),
    step(
      "agents",
      "setup",
      section("agents"),
      { estMinutes: 4 },
      {
        title: "Specialisten achter elke stap",
        action: "Laat de lijst specialisten zien en open er één.",
        why: "Achter elke stap zit een specialist met eigen instructies, bronnen en model. De provincie kan die aanpassen, en elke versie wordt bewaard.",
        expect: "Specialisten voor analyse, maatregelen, schrijven, effecten en kwaliteit.",
        narration:
          "Achter elke stap zit een specialist: één voor de analyse van bestaand beleid, één voor maatregelen, één die schrijft, één voor effecten en één voor kwaliteit. Elke specialist heeft eigen instructies, eigen bronnen en een eigen taalmodel. De provincie kan ze aanpassen, en elke versie wordt bewaard. Zo is later altijd na te gaan met welke instructies een tekst is gemaakt.",
      },
      {
        title: "Specialists behind each step",
        action: "Show the list of specialists and open one.",
        why: "Behind each step is a specialist with its own instructions, sources and model. The province can change them, and every version is kept.",
        expect: "Specialists for analysis, measures, drafting, effects and quality.",
        narration:
          "Behind each step is a specialist: one analyses existing policy, one proposes measures, one writes, one checks effects and one checks quality. Each has its own instructions, its own sources and its own language model. The province can change them, and every version is kept. So you can always trace which instructions produced a text.",
      },
    ),
    {
      ...step(
        "platform-ai",
        "ai",
        { view: "document", page: "platform" },
        { target: "platform-models", estMinutes: 3 },
        {
          title: "Welke AI, en via wiens account",
          action: "Laat de aanbieders en modellen zien die het platform toestaat. Open het tabblad met organisaties niet.",
          why: "Het platform bepaalt welke taalmodellen zijn toegestaan. Per organisatie ligt vast of Agora de sleutels van het platform gebruikt of die van de organisatie zelf.",
          expect: "De toegestane aanbieders en modellen, met bij elke aanbieder of er een sleutel is.",
          narration:
            "Welke AI gebruikt Agora, en via wiens account? Dit zijn de instellingen van het platform: welke aanbieders en welke taalmodellen zijn toegestaan. Per organisatie ligt vast of Agora werkt met de sleutels van het platform, of met die van de organisatie zelf. De sleutels zelf zijn nooit zichtbaar; er staat alleen dat er een sleutel is.",
        },
        {
          title: "Which AI, and on whose account",
          action: "Show the providers and models the platform allows. Do not open the organisations tab.",
          why: "The platform decides which language models are allowed. For each organisation it is recorded whether Agora uses the platform's keys or the organisation's own.",
          expect: "The allowed providers and models, each showing whether a key is on file.",
          narration:
            "Which AI does Agora use, and on whose account? These are the platform settings: which providers and which language models are allowed. For each organisation it is recorded whether Agora works with the platform's keys or with the organisation's own. The keys themselves are never shown; it only says that a key is on file.",
        },
      ),
      option: "aiSetup",
    },
    {
      ...step(
        "authority-models",
        "ai",
        { view: "document", page: "authority" },
        { target: "space-models", estMinutes: 2 },
        {
          title: "De modellen van dit bevoegd gezag",
          action: "Klik bij Agenten op 'Modellen' en laat zien welke modellen dit bevoegd gezag gebruikt.",
          why: "Binnen wat het platform toestaat, kiest het bevoegd gezag zelf welke modellen zijn medewerkers gebruiken.",
          expect: "De modellen die voor dit bevoegd gezag aan staan.",
          narration:
            "Binnen wat het platform toestaat, kiest de provincie zelf welke modellen haar medewerkers gebruiken. Dat staat hier, op het niveau van het bevoegd gezag. Zo kan een organisatie bijvoorbeeld alleen modellen toestaan die aan haar eigen eisen voldoen.",
        },
        {
          title: "This authority's models",
          action: "Under Agents, click 'Models' and show which models this authority uses.",
          why: "Within what the platform allows, the authority itself chooses which models its staff use.",
          expect: "The models switched on for this authority.",
          narration:
            "Within what the platform allows, the province itself chooses which models its staff use. That is set here, at the level of the authority. So an organisation can, for example, allow only models that meet its own requirements.",
        },
      ),
      option: "aiSetup",
    },
    {
      ...step(
        "authority-agent",
        "ai",
        { view: "document", page: "authority" },
        { target: "agent-edit", estMinutes: 3 },
        {
          title: "Eén specialist van dichtbij",
          action: "Open één specialist bij Agenten: laat de instructies, het model en de eerdere versies zien.",
          why: "Elke specialist is vastgelegd met instructies, bronnen en model. Elke wijziging wordt een nieuwe versie met een toelichting, zodat later na te gaan is met welke instructies een tekst is gemaakt.",
          expect: "De instellingen van de specialist en zijn versies.",
          narration:
            "Dit is één specialist van dichtbij. U ziet de instructies waarmee hij werkt, welke bronnen hij mag lezen en welk model hij gebruikt. Elke wijziging wordt een nieuwe versie, met een toelichting. Bij elke tekst in het programma is zo later terug te vinden met welke versie hij is gemaakt. Daarna gaan we terug naar het programma.",
        },
        {
          title: "One specialist up close",
          action: "Open one specialist under Agents: show its instructions, model and earlier versions.",
          why: "Each specialist is recorded with instructions, sources and model. Every change becomes a new version with a note, so you can trace later which instructions produced a text.",
          expect: "The specialist's settings and its versions.",
          narration:
            "This is one specialist up close. You see the instructions it works with, which sources it may read and which model it uses. Every change becomes a new version, with a note. So for every text in the programme you can find out later which version produced it. Then we go back to the programme.",
        },
      ),
      option: "aiSetup",
    },
    step(
      "run-analysis",
      "analysis",
      section("analysis"),
      { target: "run-analysis", estMinutes: 5 },
      {
        title: "Het bestaande beleid toetsen",
        action: "Klik 'Bestaand-beleid analyseren'. Dit duurt ongeveer twee minuten.",
        why: "Voordat je nieuw beleid schrijft, wil je weten wat er al is: wat blijft staan, wat moet anders, en wat ontbreekt.",
        happening: "Agora legt de relevante delen van de vier beleidsstukken naast de omgevingsvisie en bepaalt per onderwerp: overnemen, aanpassen, laten vallen, of het ontbreekt nog.",
        expect: "Een rapport met bevindingen, elk met een label en bronnen.",
        narration:
          "Voordat de provincie nieuw beleid schrijft, wil ze weten wat er al ligt. Agora legt nu het bestaande woonbeleid naast de omgevingsvisie. Per onderwerp krijgt u een oordeel: overnemen, aanpassen, laten vallen, of: dit ontbreekt nog. Dat is werk dat nu vaak weken kost. Het duurt hier ongeveer twee minuten.",
      },
      {
        title: "Test the existing policy",
        action: "Click 'Run existing-policy analysis'. It takes about two minutes.",
        why: "Before you write new policy, you want to know what exists: what stays, what must change, and what is missing.",
        happening: "Agora sets the relevant parts of the four policy documents against the environmental vision and decides per topic: adopt, adapt, drop, or still missing.",
        expect: "A report of findings, each with a label and sources.",
        narration:
          "Before the province writes new policy, it wants to know what is already there. Agora now sets the existing housing policy against the environmental vision. For each topic you get a verdict: adopt, adapt, drop, or: this is still missing. That is work that often takes weeks today. Here it takes about two minutes.",
      },
    ),
    step(
      "read-findings",
      "analysis",
      section("analysis"),
      { estMinutes: 8 },
      {
        title: "Bevindingen met bron",
        action: "Lees een bevinding met 'Aanpassen' voor, en wijs op het visiedoel, het belang en de bronnen eronder.",
        why: "Elke bevinding zegt waarom, en uit welk stuk en welke bladzijde dat blijkt. De ambtenaar kan het zelf nalezen.",
        expect: "Groene, oranje, rode en blauwe labels: overnemen, aanpassen, laten vallen, ontbreekt.",
        narration:
          "Kijk naar een bevinding met het label aanpassen. U ziet wat er anders moet, aan welk doel uit de visie het raakt, bij welk provinciaal belang het hoort, en uit welke stukken het blijkt, met paginanummer. Niets hiervan is een mening van de software: het is een lezing van de stukken, die de ambtenaar zelf kan controleren.",
      },
      {
        title: "Findings with a source",
        action: "Read out a finding labelled 'Adapt', and point at the vision goal, the interest and the sources below it.",
        why: "Each finding says why, and which document and page shows it. The civil servant can check it themselves.",
        expect: "Green, amber, red and blue labels: adopt, adapt, drop, missing.",
        narration:
          "Look at a finding labelled adapt. You see what must change, which goal in the vision it touches, which provincial interest it belongs to, and which documents show it, with page numbers. None of this is the software's opinion. It is a reading of the documents that the civil servant can check.",
      },
    ),
    step(
      "vision-view",
      "analysis",
      section("analysis"),
      { estMinutes: 4 },
      {
        title: "Maatregelen en de visie",
        action: "Klik bovenaan op 'Maatregelen en de visie'.",
        why: "Dit laat zien welke delen van de visie al door beleid of maatregelen worden gedekt, en waar nog gaten zitten.",
        expect: "Een overzicht van de visie met wat eraan hangt.",
        narration:
          "Dit overzicht draait het om: vanuit de visie gezien. Welke doelen worden al gedekt, en waar zitten nog gaten? Straks, als er maatregelen zijn, hangen die hier ook aan.",
      },
      {
        title: "Measures and the vision",
        action: "Click 'Measures and the vision' at the top.",
        why: "This shows which parts of the vision are already covered by policy or measures, and where the gaps are.",
        expect: "An overview of the vision with what hangs off it.",
        narration:
          "This view turns it around, seen from the vision. Which goals are already covered, and where are the gaps? Once there are measures, they hang off this view too.",
      },
    ),
    step(
      "interests-list",
      "interests",
      section("interests"),
      { click: "interests-view-interests", estMinutes: 5 },
      {
        title: "De belangen uit de visie",
        action: "Laat de lijst zien. De belangen 14, 15 en 16 over wonen zijn gekozen. Is de lijst leeg, klik dan 'Belangen zoeken'.",
        why: "De provinciale belangen komen letterlijk uit de omgevingsvisie, met de bladzijde. Zo blijft het programma herleidbaar naar de visie.",
        expect: "De belangen van Flevoland, elk met paginanummer.",
        narration:
          "De omgevingsvisie noemt een reeks provinciale belangen. Agora heeft ze uit de visie gehaald, elk met de bladzijde waar het staat. Dit programma gaat over wonen, dus werken we met drie belangen: vitale steden en dorpen, voldoende en betaalbare woningen, en toekomstbestendige woonomgevingen.",
      },
      {
        title: "The interests in the vision",
        action: "Show the list. Interests 14, 15 and 16 on housing are chosen. If the list is empty, click 'Find interests'.",
        why: "The provincial interests come straight from the environmental vision, with the page. That keeps the programme traceable to the vision.",
        expect: "Flevoland's interests, each with a page number.",
        narration:
          "The environmental vision names a set of provincial interests. Agora took them from the vision, each with the page where it appears. This programme is about housing, so we work with three interests: vital towns and villages, enough affordable homes, and future-proof living environments.",
      },
    ),
    step(
      "workup",
      "interests",
      section("interests"),
      { target: "workup-chosen", waitForJob: "workup", estMinutes: 8 },
      {
        title: "De belangen uitwerken",
        action: "Klik 'Gekozen uitwerken'. Dit loopt op de achtergrond, ongeveer twee minuten per belang.",
        why: "Een uitwerking verzamelt per belang wat de visie vraagt, wat er al aan beleid is en wat ontbreekt, onder de koppen van de structuur.",
        happening: "Agora werkt de drie belangen een voor een uit, met citaten uit de bronnen. U kunt intussen verder; het werk loopt op de server door.",
        expect: "Bij elk belang verschijnt 'Uitwerking openen' zodra het klaar is.",
        narration:
          "Nu werkt Agora de drie belangen uit. Per belang zoekt het op wat de visie vraagt, wat het bestaande beleid al regelt en wat nog ontbreekt, en zet het dat onder de koppen van de structuur. Dit loopt op de server. We kunnen intussen iets anders laten zien, of de pagina verlaten: het werk gaat door.",
      },
      {
        title: "Work up the interests",
        action: "Click 'Work up chosen'. It runs in the background, about two minutes per interest.",
        why: "A work-up gathers, for each interest, what the vision asks, what policy exists and what is missing, under the structure's headings.",
        happening: "Agora works up the three interests one at a time, quoting the sources. You can carry on; the work continues on the server.",
        expect: "'Open work-up' appears next to each interest as it finishes.",
        narration:
          "Agora now works up the three interests. For each one it looks up what the vision asks, what existing policy already covers and what is still missing, and puts that under the structure's headings. This runs on the server. We can show something else meanwhile, or even leave the page: the work continues.",
      },
    ),
    step(
      "open-workup",
      "interests",
      section("interests"),
      { target: "open-workup", estMinutes: 7 },
      {
        title: "Een uitwerking lezen",
        action: "Klik 'Uitwerking openen' bij belang 14, scroll door de koppen en beweeg over een bronverwijzing.",
        why: "Een uitwerking is werkmateriaal, geen hoofdstuk. Het maakt zichtbaar waar het programma op gaat steunen.",
        expect: "Een leesbaar stuk met koppen en aanklikbare bronverwijzingen.",
        narration:
          "Dit is de uitwerking van vitale steden en dorpen. Het is werkmateriaal, geen hoofdstuk: wat de visie vraagt, welk beleid er al is, waar het schuurt, en wat ontbreekt. Beweeg over een bronverwijzing en u ziet het citaat en de bladzijde. De hoofdstukken bouwen straks op deze uitwerkingen.",
      },
      {
        title: "Read a work-up",
        action: "Click 'Open work-up' for interest 14, scroll through the headings and hover a source reference.",
        why: "A work-up is working material, not a chapter. It shows what the programme will rest on.",
        expect: "A readable document with headings and clickable source references.",
        narration:
          "This is the work-up for vital towns and villages. It is working material, not a chapter: what the vision asks, which policy exists, where it rubs, and what is missing. Hover a source reference and you see the quote and the page. The chapters will build on these work-ups.",
      },
    ),
    step(
      "propose",
      "measures",
      section("interests"),
      { target: "propose-measures", waitForJob: "measures", estMinutes: 8 },
      {
        title: "Maatregelen voorstellen",
        action: "Klik 'Maatregelen voorstellen' bij belang 14. Als dat klaar is, doe hetzelfde bij 15 en 16, één tegelijk.",
        why: "Een programma is pas een programma als er concrete maatregelen in staan: wie doet wat, wanneer, en hoe meet je het.",
        happening: "Agora stelt per belang een handvol concrete maatregelen voor, met doel, opgave, actie, de rol van de provincie, tijdpad, indicator en bronnen.",
        expect: "Na ongeveer twee minuten per belang staan de maatregelen in het register.",
        narration:
          "Van belangen naar maatregelen. Agora stelt per belang een handvol concrete maatregelen voor. Niet: we streven naar meer betaalbare woningen. Maar: wie doet wat, met welk instrument, wanneer, en hoe weten we of het werkt. Elke maatregel verwijst naar de bronnen waar hij op steunt.",
      },
      {
        title: "Propose measures",
        action: "Click 'Propose measures' for interest 14. When it finishes, do the same for 15 and 16, one at a time.",
        why: "A programme only becomes a programme when it holds concrete measures: who does what, when, and how you measure it.",
        happening: "Agora proposes a handful of concrete measures per interest, each with a goal, challenge, action, the province's role, timeline, indicator and sources.",
        expect: "After about two minutes per interest, the measures are in the register.",
        narration:
          "From interests to measures. For each interest Agora proposes a handful of concrete measures. Not: we aim for more affordable homes. But: who does what, with which instrument, when, and how we know it works. Each measure points to the sources it rests on.",
      },
    ),
    step(
      "register",
      "measures",
      section("measures"),
      { estMinutes: 7 },
      {
        title: "Het register",
        action: "Loop één maatregel door: belangen, doel, opgave, actie, rol, tijdpad, indicator, wie handelt en bronnen.",
        why: "Een maatregel is geen ambitie maar een actie met een eigenaar en een indicator. De rol van de provincie moet passen bij de instrumenten die zij echt heeft.",
        expect: "Een maatregel met alle velden en de bronnen eronder.",
        narration:
          "Dit is het maatregelenregister. Kijk naar één maatregel. Bij welke belangen hoort hij, wat is het doel, wat is de opgave, wat is de concrete actie, welke rol neemt de provincie, wanneer, en waaraan meet je het. En belangrijk: wie handelt er eigenlijk? De provincie zelf, een gemeente, of een corporatie? Dat staat er expliciet bij.",
      },
      {
        title: "The register",
        action: "Walk through one measure: interests, goal, challenge, action, role, timeline, indicator, who acts and sources.",
        why: "A measure is not an ambition but an action with an owner and an indicator. The province's role must fit the instruments it really has.",
        expect: "One measure with all its fields and the sources below.",
        narration:
          "This is the measures register. Look at one measure. Which interests it belongs to, the goal, the challenge, the concrete action, the province's role, the timeline, and how you measure it. And importantly: who actually acts? The province itself, a municipality, or a housing association? That is stated explicitly.",
      },
    ),
    step(
      "decide",
      "measures",
      section("measures"),
      { target: "measure-staff", estMinutes: 8 },
      {
        title: "De ambtenaar besluit",
        action: "Kies bij één maatregel 'Behouden', bij een andere 'Aanpassen' met wat er moet veranderen, en laat er één vallen met een reden.",
        why: "Hier zit de ambtenaar aan het stuur. Het besluit en de reden worden vastgelegd met naam en tijd, en komen terug in het programma en in het auditpakket.",
        expect: "Het besluit staat bij de maatregel, met een gekleurde rand: grijs, oranje of rood.",
        narration:
          "Hier besluit de ambtenaar. Deze maatregel houden we. Deze moet anders, en we schrijven op wat er moet veranderen. En deze laten we vallen, met een reden. Elk besluit wordt vastgelegd: wie, wanneer en waarom. Een maatregel die valt, komt niet in het programma. Maar het besluit blijft bewaard, zodat later te zien is dat hij bewust is geschrapt.",
      },
      {
        title: "Staff decide",
        action: "Choose 'Keep' on one measure, 'Adapt' on another with what should change, and drop one with a reason.",
        why: "This is where the civil servant is in charge. The decision and reason are recorded with name and time, and they show up in the programme and in the audit pack.",
        expect: "The decision shows on the measure with a coloured edge: grey, amber or red.",
        narration:
          "Here the civil servant decides. This measure we keep. This one must change, and we write down what should change. And this one we drop, with a reason. Every decision is recorded: who, when and why. A dropped measure does not go into the programme. But the decision is kept, so later anyone can see it was removed on purpose.",
      },
    ),
    step(
      "priority",
      "measures",
      section("measures"),
      { target: "measure-staff", estMinutes: 5 },
      {
        title: "Prioriteit",
        action: "Geef twee maatregelen 'Hoog' en één 'Laag'. De lijst staat op 'Prioriteit eerst'.",
        why: "De prioriteit bepaalt de volgorde in het programma. De delen over uitvoering en middelen noemen de hoge prioriteit eerst.",
        expect: "De lijst staat op prioriteit, met de gevallen maatregel onderaan.",
        narration:
          "Niet alles kan tegelijk. De ambtenaar geeft maatregelen een prioriteit: hoog, middel of laag, met een reden als dat nodig is. Het programma volgt die volgorde. Straks ziet u in de hoofdstukken dat de hoge prioriteit eerst staat.",
      },
      {
        title: "Priority",
        action: "Give two measures 'High' and one 'Low'. The list is sorted 'Priority first'.",
        why: "Priority sets the order in the programme. The parts on execution and resources name the high-priority measures first.",
        expect: "The list is in priority order, with the dropped measure at the bottom.",
        narration:
          "Not everything can happen at once. The civil servant gives measures a priority: high, medium or low, with a reason where needed. The programme follows that order. Later you will see in the chapters that the high-priority measures come first.",
      },
    ),
    step(
      "roles",
      "measures",
      section("measures"),
      { target: "check-roles", waitForJob: "roles", estMinutes: 5 },
      {
        title: "Klopt de rol van de provincie?",
        action: "Klik 'Rollen controleren'.",
        why: "Een programma belooft vaak dingen die een provincie niet zelf kan doen. Agora toetst of de rol past bij de bevoegdheden en instrumenten van de provincie.",
        happening: "Agora bekijkt per maatregel wie er echt handelt en welk instrument de provincie daarvoor heeft.",
        expect: "Bij elke maatregel staat wie handelt, met een uitleg onder 'Waarom deze rol'.",
        narration:
          "Een bekende valkuil: een programma belooft dingen die de provincie niet zelf kan doen. Agora controleert per maatregel wie er echt handelt, en of de provincie daar een instrument voor heeft. Waar een gemeente of corporatie aan zet is, staat dat erbij, met de uitleg waarom.",
      },
      {
        title: "Is the province's role right?",
        action: "Click 'Check roles'.",
        why: "Programmes often promise things a province cannot do itself. Agora checks whether the role fits the province's powers and instruments.",
        happening: "Agora looks at who really acts on each measure and which instrument the province has for it.",
        expect: "Each measure shows who acts, with an explanation under 'Why this role'.",
        narration:
          "A familiar trap: a programme promises things the province cannot do itself. Agora checks, for each measure, who really acts and whether the province has an instrument for it. Where a municipality or housing association has to act, it says so, and explains why.",
      },
    ),
    step(
      "break",
      "break",
      DOC,
      { estMinutes: 15 },
      {
        title: "Pauze",
        action: "Pauze. Laat het scherm op het document staan.",
        why: "Na de pauze gaan we van losse belangen naar samenhang, en daarna naar het programma zelf.",
        expect: "Het document.",
        narration:
          "We nemen een korte pauze. Na de pauze kijken we hoe de drie belangen samenhangen, waar ze botsen, en laten we Agora het programma schrijven.",
      },
      {
        title: "Break",
        action: "Break. Leave the screen on the document.",
        why: "After the break we move from separate interests to how they fit together, and then to the programme itself.",
        expect: "The document.",
        narration:
          "Let's take a short break. After the break we look at how the three interests fit together, where they clash, and then we let Agora write the programme.",
      },
    ),
    step(
      "compare",
      "coherence",
      section("interests"),
      { click: "interests-view-coherence", target: "compare-interests", waitForJob: "coherence", estMinutes: 7 },
      {
        title: "Belangen naast elkaar",
        action: "Klik 'Gekozen belangen vergelijken'. Dit duurt ongeveer een minuut.",
        why: "Belangen staan niet los van elkaar. Waar ze elkaar versterken, kan één maatregel twee doelen dienen. Waar ze botsen, moet de provincie kiezen.",
        happening: "Agora legt de uitwerkingen en maatregelen van de drie belangen naast elkaar en zoekt waar ze elkaar versterken, maatregelen kunnen delen, of botsen.",
        expect: "Een raster van belangen, met daaronder de gevonden verbanden.",
        narration:
          "Belangen staan niet los van elkaar. Meer woningen bouwen raakt aan de kwaliteit van de woonomgeving. Agora legt nu de drie uitwerkingen en hun maatregelen naast elkaar, en zoekt drie dingen: waar versterken ze elkaar, waar kan één maatregel twee belangen dienen, en waar botsen ze.",
      },
      {
        title: "Interests side by side",
        action: "Click 'Compare chosen interests'. It takes about a minute.",
        why: "Interests do not stand alone. Where they reinforce each other, one measure can serve two goals. Where they clash, the province must choose.",
        happening: "Agora sets the work-ups and measures of the three interests side by side and looks for where they reinforce each other, can share measures, or clash.",
        expect: "A grid of interests, with the links found listed below.",
        narration:
          "Interests do not stand alone. Building more homes touches the quality of the living environment. Agora now sets the three work-ups and their measures side by side, and looks for three things: where they reinforce each other, where one measure can serve two interests, and where they clash.",
      },
    ),
    step(
      "grid",
      "coherence",
      section("interests"),
      { click: "interests-view-coherence", target: "coherence-grid", estMinutes: 6 },
      {
        title: "Het raster",
        action: "Klik in het raster op een vakje om alleen dat paar te zien. Klik 'Alle paren tonen' om terug te gaan.",
        why: "Het raster laat in één oogopslag zien welke belangen het meest met elkaar te maken hebben.",
        expect: "Alleen de verbanden van dat paar staan eronder.",
        narration:
          "Elk vakje is een paar belangen. De letters tellen wat er gevonden is: versterkend, een gedeelde maatregel, of een dilemma. Klik op een vakje en u ziet alleen dat paar.",
      },
      {
        title: "The grid",
        action: "Click a cell in the grid to see only that pair. Click 'Show every pair' to go back.",
        why: "The grid shows at a glance which interests have most to do with each other.",
        expect: "Only that pair's links are listed below.",
        narration:
          "Each cell is a pair of interests. The letters count what was found: reinforcing, a shared measure, or a dilemma. Click a cell and you see only that pair.",
      },
    ),
    step(
      "dilemmas",
      "coherence",
      section("interests"),
      { click: "interests-view-coherence", target: "coherence-keep", estMinutes: 7 },
      {
        title: "Dilemma's houden of opzij zetten",
        action: "Houd een dilemma en een gedeelde maatregel met 'Behouden'. Zet er één opzij met een reden.",
        why: "Wat de ambtenaar houdt, neemt het programma mee in het deel over samenhang. Wat opzij gaat, niet.",
        expect: "Gehouden verbanden krijgen een donkere rand; opzij gezette worden doorgestreept.",
        narration:
          "Ook hier besluit de ambtenaar. Dit dilemma is echt, dat houden we: het programma moet er iets over zeggen. Deze gedeelde maatregel houden we ook. En deze zetten we opzij, met een reden. Alleen wat gehouden is, komt in het programma.",
      },
      {
        title: "Keep or set aside",
        action: "Keep a dilemma and a shared measure with 'Keep'. Set one aside with a reason.",
        why: "What the civil servant keeps goes into the part of the programme on coherence. What is set aside does not.",
        expect: "Kept links get a dark edge; set-aside links are struck through.",
        narration:
          "Here too the civil servant decides. This dilemma is real, so we keep it: the programme must say something about it. This shared measure we keep as well. And this one we set aside, with a reason. Only what is kept goes into the programme.",
      },
    ),
    step(
      "effects",
      "effects",
      section("effects"),
      { target: "record-effects", estMinutes: 10 },
      {
        title: "Effecten per maatregel",
        action: "Kies bij een maatregel de richting (positief, negatief, neutraal) en klik 'Effecten opslaan'.",
        why: "Per maatregel legt de provincie vast of die de leefomgeving helpt of schaadt ten opzichte van het omgevingseffectrapport. Een afwijking vraagt een geschreven reden.",
        expect: "De maatregel staat als vastgelegd in de lijst.",
        narration:
          "Bij een omgevingsvisie hoort een omgevingseffectrapport. Per maatregel legt de provincie hier vast of die de leefomgeving helpt of schaadt, en waar een maatregel afwijkt van het rapport, moet een reden worden opgeschreven. Met het effectrapport gekoppeld toetst Agora dit ook automatisch. Dat rapport zit niet in deze demo, dus we laten het vastleggen zien.",
      },
      {
        title: "Effects per measure",
        action: "Choose a measure's direction (positive, negative, neutral) and click 'Save effects'.",
        why: "For each measure the province records whether it helps or harms the living environment against the environmental effects report. A deviation needs a written reason.",
        expect: "The measure shows as recorded in the list.",
        narration:
          "An environmental vision comes with an environmental effects report. For each measure the province records here whether it helps or harms the living environment, and where a measure departs from the report, a reason must be written down. With the effects report linked, Agora checks this automatically too. That report is not in this demo, so we show the recording.",
      },
    ),
    step(
      "write",
      "write",
      DOC,
      { target: "write-chapters", waitForJob: "fill", estMinutes: 5 },
      {
        title: "Het programma laten schrijven",
        action: "Klik 'Lege hoofdstukken schrijven'. Ga daarna meteen door; dit loopt ongeveer acht minuten.",
        why: "Nu komt alles samen: de uitwerkingen, de gehouden samenhang en de maatregelen op volgorde van prioriteit.",
        happening: "Agora schrijft de acht verplichte delen een voor een. Elk hoofdstuk verschijnt zodra het klaar is. Dit loopt op de server door, ook als u ergens anders heen gaat.",
        expect: "Een voortgangsbalk bovenaan het document; hoofdstukken vullen zich een voor een.",
        narration:
          "Nu laten we Agora het programma schrijven. Elk deel weet wat erin hoort en waar het uit put: de uitwerkingen, de verbanden die de ambtenaar heeft gehouden, en de maatregelen, op volgorde van prioriteit. Dit duurt ongeveer acht minuten. We wachten niet: intussen laten we zien hoe collega's samenwerken.",
      },
      {
        title: "Let Agora write the programme",
        action: "Click 'Write empty chapters'. Then move straight on; it takes about eight minutes.",
        why: "Everything comes together now: the work-ups, the links that were kept, and the measures in priority order.",
        happening: "Agora writes the eight required parts one at a time. Each chapter appears as soon as it is done. This keeps running on the server even if you go elsewhere.",
        expect: "A progress bar at the top of the document; chapters fill in one by one.",
        narration:
          "Now we let Agora write the programme. Each part knows what belongs in it and what it draws on: the work-ups, the links the civil servant kept, and the measures in priority order. This takes about eight minutes. We won't wait: meanwhile we show how colleagues work together.",
      },
    ),
    step(
      "comments",
      "together",
      READ,
      { target: "show-comments", estMinutes: 6 },
      {
        title: "Notities van collega's",
        action: "Zet 'Toon commentaar' aan, selecteer een zin in een klaar hoofdstuk en plaats een notitie.",
        why: "Collega's lezen mee en plaatsen notities op het concept, zoals in een Word-document, maar dan bij het levende programma.",
        expect: "De notitie verschijnt naast de tekst.",
        narration:
          "Terwijl Agora schrijft, lezen collega's mee. Zij plaatsen notities bij een zin, zoals ze dat in Word gewend zijn. Het verschil: de notities zitten aan het levende programma vast, en niet aan een kopie die per mail rondgaat.",
      },
      {
        title: "Colleagues' notes",
        action: "Turn on 'Show comments', select a sentence in a finished chapter and add a note.",
        why: "Colleagues read along and leave notes on the draft, as in a Word document, but on the live programme.",
        expect: "The note appears next to the text.",
        narration:
          "While Agora writes, colleagues read along. They leave notes on a sentence, as they are used to in Word. The difference: the notes are attached to the live programme, not to a copy that goes round by email.",
      },
    ),
    step(
      "common-notes",
      "together",
      READ,
      { target: "find-common-notes", estMinutes: 5 },
      {
        title: "Notities die hetzelfde zeggen",
        action: "Klik 'Zoek gemeenschappelijke notities'.",
        why: "Bij veel notities zeggen er vaak meerdere hetzelfde. Agora groepeert ze, zodat de schrijver één keer antwoordt.",
        expect: "De review opent op de gegroepeerde notities.",
        narration:
          "Als tien collega's meelezen, zeggen er vaak drie hetzelfde. Agora groepeert notities die over hetzelfde gaan, zodat de schrijver één keer kan antwoorden en ze in één keer als verwerkt kan markeren.",
      },
      {
        title: "Notes that say the same",
        action: "Click 'Find common notes'.",
        why: "With many notes, several often say the same thing. Agora groups them so the writer answers once.",
        expect: "Review opens on the grouped notes.",
        narration:
          "When ten colleagues read along, three of them often say the same thing. Agora groups notes on the same point, so the writer can answer once and mark them handled in one go.",
      },
    ),
    step(
      "review",
      "together",
      section("review"),
      { target: "request-review", estMinutes: 5 },
      {
        title: "Review en goedkeuring",
        action: "Klik 'Review vragen' bij het eerste hoofdstuk, en daarna 'Keur hoofdstuk goed'.",
        why: "Een hoofdstuk gaat pas door als een collega het goedkeurt. Wie dat mag, legt de provincie vast in de configuratie.",
        expect: "Het hoofdstuk staat op goedgekeurd.",
        narration:
          "Elk hoofdstuk en elke maatregel krijgt een status: concept, in review, goedgekeurd. De schrijver vraagt review aan, een collega keurt goed of stuurt terug met een verzoek. Zo is altijd duidelijk wat klaar is en wat niet.",
      },
      {
        title: "Review and approval",
        action: "Click 'Request review' on the first chapter, then 'Approve chapter'.",
        why: "A chapter only moves on when a colleague approves it. Who may do that is set by the province in the configuration.",
        expect: "The chapter shows as approved.",
        narration:
          "Each chapter and each measure has a status: draft, in review, approved. The writer requests a review, and a colleague approves it or sends it back with a request. So it is always clear what is done and what is not.",
      },
    ),
    step(
      "status",
      "together",
      section("overview"),
      { estMinutes: 4 },
      {
        title: "Waar staat het programma?",
        action: "Laat zien wat klaar is en wat nog open staat.",
        why: "De projectleider ziet in één scherm waar het programma staat, zonder rond te bellen.",
        expect: "Een overzicht van de stappen en hoofdstukken.",
        narration:
          "De projectleider hoeft niet rond te bellen. Hier staat in één scherm wat klaar is, wat in review is en wat nog open staat.",
      },
      {
        title: "Where does the programme stand?",
        action: "Show what is done and what is still open.",
        why: "The project lead sees where the programme stands on one screen, without phoning round.",
        expect: "An overview of the steps and chapters.",
        narration:
          "The project lead doesn't need to phone round. This one screen shows what is done, what is in review and what is still open.",
      },
    ),
    step(
      "read-programme",
      "read",
      READ,
      { estMinutes: 10 },
      {
        title: "Het geschreven programma",
        action: "Open 'Hoofdstukken' en ga naar het deel over samenhang en daarna het deel met de maatregelen. Wijs op de volgorde en op de gevallen maatregel die ontbreekt.",
        why: "Het programma neemt over wat de ambtenaar besliste: gehouden verbanden, maatregelen op prioriteit, en niets wat is geschrapt.",
        expect: "Leesbare hoofdstukken met bronverwijzingen; hoge prioriteit eerst.",
        narration:
          "Het programma is geschreven. Kijk naar het deel over samenhang: daar staan de verbanden die de ambtenaar heeft gehouden, niet de verbanden die opzij zijn gezet. En in het deel met de maatregelen staan ze op volgorde van prioriteit. De maatregel die we lieten vallen, staat er niet in. Elke bewering heeft een bronverwijzing; beweeg erover en u ziet het citaat.",
      },
      {
        title: "The written programme",
        action: "Open 'Chapters' and go to the part on coherence, then the part with the measures. Point at the order and at the dropped measure that is absent.",
        why: "The programme carries over what the civil servant decided: the links kept, measures in priority order, and nothing that was dropped.",
        expect: "Readable chapters with source references; high priority first.",
        narration:
          "The programme is written. Look at the part on coherence: it holds the links the civil servant kept, not the ones set aside. And in the part with the measures, they are in priority order. The measure we dropped is not there. Every claim has a source reference; hover it and you see the quote.",
      },
    ),
    step(
      "redraft",
      "accountability",
      DOC,
      { waitForJob: "chapter", estMinutes: 6 },
      {
        title: "Eén hoofdstuk opnieuw, streng op bronnen",
        action: "Klik het potlood bij een hoofdstuk, open het menu van dat hoofdstuk en kies 'Opnieuw genereren met strikte citaties'.",
        why: "Als een hoofdstuk niet goed genoeg onderbouwd is, schrijft Agora het opnieuw en controleert daarna elk citaat tegen de bron.",
        happening: "Agora schrijft dit ene hoofdstuk opnieuw en zoekt elk citaat terug in de bronnen.",
        expect: "Een melding: zoveel van zoveel citaten gevonden in de bronnen.",
        narration:
          "Vertrouwen moet je kunnen controleren. Dit hoofdstuk laten we opnieuw schrijven, met strikte regels voor bronnen. Daarna zoekt Agora elk citaat terug in de bron, en meldt hoeveel er gevonden zijn. Een citaat dat niet te vinden is, wordt gemarkeerd.",
      },
      {
        title: "Redraft one chapter, strict on sources",
        action: "Click the pencil on a chapter, open that chapter's menu and choose 'Regenerate with strict citations'.",
        why: "If a chapter is not backed well enough, Agora rewrites it and then checks every quote against the source.",
        happening: "Agora rewrites this one chapter and looks up every quote in the sources.",
        expect: "A message: so many of so many quotes found in the sources.",
        narration:
          "Trust has to be checkable. We have this chapter rewritten with strict rules on sources. Then Agora looks up every quote in its source and reports how many it found. A quote that cannot be found is flagged.",
      },
    ),
    step(
      "provenance",
      "accountability",
      section("provenance"),
      { estMinutes: 8 },
      {
        title: "Herleidbaarheid",
        action: "Open een hoofdstuk-run: laat de score zien, de beweringen die gecontroleerd moeten worden, en de ongebruikte bronnen.",
        why: "Voor elke AI-run is vastgelegd welk model, welke bronnen en hoe goed de beweringen onderbouwd zijn. Agora verbergt zijn zwakke plekken niet.",
        expect: "Een score, een lijst beweringen om te controleren, en welke bronnen niet zijn gelezen.",
        narration:
          "Hier legt Agora verantwoording af. Voor elke keer dat het tekst maakte: welk model, welke bronnen, en hoe goed de beweringen onderbouwd zijn. Een score van honderd betekent dat elke bewering een citaat heeft dat in de bron staat. Wat niet klopt, staat er gewoon: deze bewering heeft geen bron, dit citaat is niet gevonden. De ambtenaar weet precies wat nog nagekeken moet worden.",
      },
      {
        title: "Provenance",
        action: "Open a chapter run: show the score, the claims to check, and the sources left unused.",
        why: "For every AI run, the model, the sources and how well the claims were backed are recorded. Agora does not hide its weak spots.",
        expect: "A score, a list of claims to check, and which sources were not read.",
        narration:
          "This is where Agora accounts for itself. For every time it produced text: which model, which sources, and how well the claims were backed. A score of one hundred means every claim has a quote that is in the source. What does not hold up is shown plainly: this claim has no source, this quote was not found. The civil servant knows exactly what still needs checking.",
      },
    ),
    step(
      "audit",
      "accountability",
      section("export"),
      { target: "audit-pack", estMinutes: 6 },
      {
        title: "Het auditpakket",
        action: "Keur voor de demo eerst de overige hoofdstukken in één keer goed ('Demo: keur de rest goed'), en klik dan 'Auditpakket maken'.",
        why: "Het auditpakket legt een versie vast met alle AI-runs, maatregelen, besluiten en bronnen, met een digitale vingerafdruk. Zo kan de provincie later aantonen hoe het programma tot stand kwam.",
        expect: "Een bestand wordt gedownload; onder aan de pagina staat 'Vastgelegde versie van …'.",
        narration:
          "Als het programma straks ter discussie staat, bij de Staten of bij de rechter, wil de provincie kunnen laten zien hoe het tot stand kwam. Het auditpakket legt een versie vast met alle AI-runs, alle maatregelen, alle besluiten met naam en reden, en alle bronnen, met een digitale vingerafdruk. Die versie is ook wat we zo publiceren.",
      },
      {
        title: "The audit pack",
        action: "For the demo, first approve the remaining chapters in one go ('Demo: approve the rest'), then click 'Build audit pack'.",
        why: "The audit pack fixes a version with every AI run, measure, decision and source, with a digital fingerprint. The province can later show how the programme came about.",
        expect: "A file downloads; the page shows 'Fixed version from …'.",
        narration:
          "If the programme is challenged later, in the provincial council or in court, the province wants to show how it came about. The audit pack fixes a version with every AI run, every measure, every decision with name and reason, and every source, with a digital fingerprint. That version is also what we publish next.",
      },
    ),
    step(
      "word",
      "publish",
      section("export"),
      { target: "export-docx", estMinutes: 4 },
      {
        title: "Naar Word",
        action: "Klik 'Word' en open het bestand.",
        why: "De provincie werkt met Word-bestanden voor de Staten en de huisstijl. Agora levert een net document met de bronverwijzingen.",
        expect: "Een Word-document met de hoofdstukken en maatregelen.",
        narration:
          "De provincie werkt voor de Staten en de huisstijl met Word. Met één klik komt het programma als Word-document eruit, met de hoofdstukken, de maatregelen op volgorde van prioriteit, en de bronverwijzingen.",
      },
      {
        title: "To Word",
        action: "Click 'Word' and open the file.",
        why: "The province uses Word files for the council and its house style. Agora produces a clean document with the source references.",
        expect: "A Word document with the chapters and measures.",
        narration:
          "For the council and its house style, the province works in Word. One click and the programme comes out as a Word document, with the chapters, the measures in priority order, and the source references.",
      },
    ),
    step(
      "publish",
      "publish",
      section("publish"),
      { target: "publish-snapshot", estMinutes: 5 },
      {
        title: "Publiceren voor inspraak",
        action: "Kies wie de versie mag lezen en klik 'Publiceer deze versie'. Open daarna de publieke pagina.",
        why: "De vastgelegde versie wordt leesbaar voor inwoners en partners. Het levende concept blijft intern.",
        expect: "Een publieke pagina met het programma en een vaste bronvermelding.",
        narration:
          "Nu publiceren we de vastgelegde versie. Inwoners, gemeenten en partners lezen precies de versie die in het auditpakket staat. Het concept waar de ambtenaren in werken, blijft intern. De formele bekendmaking loopt apart; dit is de versie om op te reageren.",
      },
      {
        title: "Publish for consultation",
        action: "Choose who may read the version and click 'Publish this version'. Then open the public page.",
        why: "The fixed version becomes readable for residents and partners. The live draft stays internal.",
        expect: "A public page with the programme and a fixed citation.",
        narration:
          "Now we publish the fixed version. Residents, municipalities and partners read exactly the version that is in the audit pack. The draft the civil servants work in stays internal. Formal enactment happens separately; this is the version to respond to.",
      },
    ),
    step(
      "consultation",
      "publish",
      section("consultation"),
      { target: "open-consultation", estMinutes: 6 },
      {
        title: "De inspraakperiode",
        action: "Kies de data en klik 'Open consultatie'. Plaats op de publieke pagina een reactie als inwoner.",
        why: "Reacties komen binnen op de gepubliceerde versie, niet op het concept. Zo weet iedereen waarop gereageerd is.",
        expect: "De reactie verschijnt in de consultatie.",
        narration:
          "We openen de inspraakperiode. Een inwoner reageert op de gepubliceerde versie, en die reactie komt hier binnen. Reacties gaan over precies de tekst die gepubliceerd is, niet over een concept dat intussen is veranderd.",
      },
      {
        title: "The consultation period",
        action: "Pick the dates and click 'Open consultation'. On the public page, leave a comment as a resident.",
        why: "Comments arrive on the published version, not on the draft. Everyone knows what was commented on.",
        expect: "The comment appears in Consultation.",
        narration:
          "We open the consultation period. A resident responds to the published version, and the response arrives here. Comments are about exactly the text that was published, not a draft that has changed since.",
      },
    ),
    step(
      "consultation-handle",
      "publish",
      section("consultation"),
      { estMinutes: 5 },
      {
        title: "Reacties verwerken",
        action: "Groepeer de reacties op onderwerp, beantwoord er één en leg het besluit vast.",
        why: "De Omgevingswet vraagt dat de provincie laat zien wat zij met reacties heeft gedaan. Dat wordt hier per reactie vastgelegd.",
        expect: "De reactie heeft een antwoord en een besluit.",
        narration:
          "De provincie moet laten zien wat zij met reacties heeft gedaan. Agora groepeert reacties op onderwerp, de ambtenaar beantwoordt ze en legt per reactie vast wat ermee gebeurt. Dat overzicht gaat mee in de verantwoording.",
      },
      {
        title: "Handle the responses",
        action: "Group the responses by topic, answer one and record the decision.",
        why: "The Environment and Planning Act asks the province to show what it did with responses. That is recorded here per response.",
        expect: "The response has an answer and a decision.",
        narration:
          "The province must show what it did with the responses. Agora groups them by topic, the civil servant answers them and records what happens with each one. That overview becomes part of the accountability record.",
      },
    ),
    step(
      "questions",
      "questions",
      DOC,
      { estMinutes: 15 },
      {
        title: "Vragen",
        action: "Open de vloer voor vragen. Wilt u een vraag door Agora laten beantwoorden, klik dan 'Vragen' en houd de knop ingedrukt terwijl de vraag wordt gesteld.",
        why: "Laat de vragen de volgende stap bepalen: welk programma, welke bronnen, wie werkt ermee.",
        expect: "Het document.",
        narration:
          "Dat was Agora, van visie tot inspraak. De ambtenaar besliste bij elke stap, en elke bewering is terug te voeren op een bladzijde in de eigen stukken van de provincie. We horen graag uw vragen. Wilt u Agora zelf iets vragen? Dan houden we de knop Vragen ingedrukt terwijl u spreekt. Alleen dan staat de microfoon aan.",
      },
      {
        title: "Questions",
        action: "Open the floor for questions. To let Agora answer one, click 'Questions' and hold the button down while the question is asked.",
        why: "Let the questions shape the next step: which programme, which sources, who works with it.",
        expect: "The document.",
        narration:
          "That was Agora, from vision to consultation. The civil servant decided at every step, and every claim can be traced to a page in the province's own documents. We would be glad to take your questions. Would you like to ask Agora itself? Then we hold down the Questions button while you speak. Only then is the microphone on.",
      },
    ),
    {
      ...step(
        "digest",
        "heard",
        DOC,
        { target: "make-digest", estMinutes: 5 },
        {
          title: "Wat we hebben gehoord",
          action: "Klik 'Maak de samenvatting' in het panel Rondleiding. Lees de verbeterpunten voor of laat ze voorlezen.",
          why: "Hier maakt het gesprek van vandaag Agora beter: de vragen worden verbeterpunten voor het team.",
          happening: "Agora leest de vragen en antwoorden van vandaag, uit het venster Vraag en van de knop Vragen, en vat ze samen zonder namen en zonder vragen letterlijk te herhalen.",
          expect: "Onderwerpen, waar de antwoorden tekortschoten, wat onduidelijk was, verbeterpunten en vervolgvragen.",
          narration:
            "Tot slot kijken we terug op wat u vandaag heeft gevraagd. Agora leest alle vragen en antwoorden van deze middag en vat ze samen: welke onderwerpen er speelden, waar de antwoorden tekortschoten, en wat er beter kan. Zonder namen, en zonder uw vragen letterlijk te herhalen. Zo groeit Agora: uw vragen worden verbeterpunten voor het team. Dank u wel.",
        },
        {
          title: "What we heard",
          action: "Click 'Make the summary' in the Tour panel. Read out the improvement points, or let them be read aloud.",
          why: "This is where today's conversation makes Agora better: the questions become improvement points for the team.",
          happening: "Agora reads today's questions and answers, from the Ask window and the Questions button, and summarises them without names and without repeating questions word for word.",
          expect: "Topics, where the answers fell short, what was unclear, improvement points and follow-up questions.",
          narration:
            "Finally, we look back at what you asked today. Agora reads all the questions and answers from this afternoon and summarises them: which topics came up, where the answers fell short, and what could be better. Without names, and without repeating your questions word for word. This is how Agora grows: your questions become improvement points for the team. Thank you.",
        },
      ),
      panel: "digest",
    },
  ]),
}
