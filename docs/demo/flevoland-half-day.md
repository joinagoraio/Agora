# Flevoland half-day demo: script and guide

Tuesday 29 September 2026. About 3 hours 45 minutes including a 15-minute break.

The same script drives the guided tour in the app (Tour tab in the side panel, and the blue strip under the toolbar). If you change the text here, change it in `lib/programme/flevoland-tour.ts`, raise `FLEVOLAND_TOUR_VERSION`, deploy, and press **Record narration** again on the demo packs page.

## Timetable

| Part | Starts | Minutes |
| --- | --- | --- |
| 1. Set up for Flevoland | 0:00 | 20 |
| 2. What policy already exists | 0:20 | 17 |
| 3. Interests and work-ups | 0:37 | 20 |
| 4. Measures | 0:57 | 33 |
| Break | 1:30 | 15 |
| 5. Across interests | 1:45 | 20 |
| 6. Effects | 2:05 | 10 |
| 7. Write the programme | 2:15 | 5 |
| 8. Working together | 2:20 | 20 |
| 9. Read the result | 2:40 | 10 |
| 10. Accountability | 2:50 | 20 |
| 11. Publish and consult | 3:10 | 20 |
| 12. Questions | 3:30 | 15 |

The chapters are written during part 8, so there is no waiting in front of the room.

## The day before and the morning of

1. **Credits.** Check the OpenAI balance. A full run (analysis, three work-ups, three measure proposals, role check, comparison, eight chapters, one redraft) costs a few euros; keep at least 20 euros of headroom.
2. **Narration.** Platform admin → Demo packs → Flevoland demo → *Tour narration*. It should read 36 of 36 for both Dutch and English. If not, press **Record narration** and wait about a minute.
3. **Fresh demo.** On the same page, press **Load demo**. This creates a new authority with the files, the nine-part structure and interests 14, 15 and 16 chosen. Open the programme; the setup wizard shows. This is where part 1 starts.
4. **Backup programme.** Load a second demo and run it up to and including part 7 (chapters written). If an AI step fails or runs slow on the day, switch to the backup at the same step. Keep it in a second browser tab.
5. **Language.** The tour and the voice follow the screen language. Set Agora to Nederlands (user menu) for a Dutch room.
6. **Sound.** Connect the laptop audio to the room. Play step 1's narration once to set the volume.
7. **Browser.** Use one window, full screen, zoom at 100 percent. Keep the side panel open on the **Tour** tab.

## How the tour works

- The blue strip under the toolbar shows the part, the step and **Back** / **Next**. **Next** goes to the right screen, opens the right tab or panel, and outlines the button to press in blue.
- The side panel shows, for the current step: **What to do**, **Why**, **What is happening** (with live progress while an AI step runs) and **What the room sees**, plus the other steps in this part.
- **Play narration** (the play button) reads the current step aloud. **Let the voice present** (the speaker button) plays the narration automatically each time you press **Next**. You still press the outlined buttons yourself.
- The tour remembers its step per programme in this browser, so a reload does not lose your place.
- Only platform admins in a loaded demo see the tour. Nobody else does.

## Waiting times

| AI step | Takes |
| --- | --- |
| Existing-policy analysis | about 2 min |
| Work up three interests | about 2 min per interest |
| Propose measures | about 2 min per interest |
| Check roles | about 1 min |
| Compare interests | about 1 min |
| Write empty chapters | about 8 min |
| Redraft one chapter | about 1 min |

Work-ups, measure proposals, the comparison, role checks, chapter writing and redrafts keep running on the server if you go elsewhere or reload. The analysis does not; stay on the Analysis screen until it finishes.

## If something goes wrong

- **An AI step says the provider has no credits or is rate limiting.** Top up, wait a minute, and press the button once more. Meanwhile switch to the backup programme at the same step.
- **An AI step takes much longer than the table.** Carry on talking; the side panel shows progress. After twice the usual time, switch to the backup.
- **The voice does not play.** Read the text under **Why** in the side panel, or the narration below.
- **The wrong screen is showing.** Press **Show me where** in the side panel, or **Back** then **Next**.
- **Everything is broken.** Use the demo strip's **Reset** to load a fresh copy, then open the backup tab.

## What the demo does not show

- **The automatic effects check.** It reads the environmental effects report (OER), which is not in the demo pack. Part 6 shows recording effects per measure instead. The real report is the *Ontwerp Omgevingseffectrapport Omgevingsvisie Flevoland 2050*; add it to the pack and the check can run live.
- **Staff decisions on analysis findings** and **lines between interests in the policy graph** are not built yet. Decisions happen on measures and on links across interests.

## Step by step

Each step lists what to do in Dutch and English, what the room should see, and what the voice says.

### Opzetten voor Flevoland / Set up for Flevoland (20 min, from 0:00)

#### 1. Welkom: wat Agora is / Welcome: what Agora is · 4 min · 0:00

- **Doen / Do:** Laat het scherm staan terwijl de middag wordt ingeleid.
  Leave the screen as it is while the afternoon is introduced.
- **De zaal ziet / The room sees:** Het nieuwe programma van Flevoland, nog zonder tekst.

> **NL:** Welkom. Vanmiddag laten we zien hoe Agora de provincie Flevoland helpt een omgevingsprogramma te schrijven. We beginnen bij de omgevingsvisie en het bestaande beleid, werken via de provinciale belangen naar concrete maatregelen, en eindigen met een programma dat klaar is voor inspraak. Alles wat u ziet draait op echte stukken: de ontwerp-omgevingsvisie Flevoland 2050 en vier stukken over wonen. Agora schrijft niet in plaats van de ambtenaar. Het leest, stelt voor en onderbouwt; de ambtenaar besluit. En elke bewering verwijst naar een bladzijde in een bron.
>
> **EN:** Welcome. This afternoon we show how Agora helps the province of Flevoland write an environmental programme. We start from the environmental vision and the policy that already exists, work through the provincial interests to concrete measures, and finish with a programme that is ready for public consultation. Everything you see runs on real documents: the draft Flevoland 2050 environmental vision and four documents on housing. Agora does not write instead of the civil servant. It reads, proposes and backs up; the civil servant decides. And every claim points to a page in a source.

#### 2. De structuur van de provincie / The province's structure · 3 min · 0:04

- **Doen / Do:** Kies onder 'Gebruik een hoofdstukstructuur' de structuur 'Flevoland demo'.
  Under 'Use a chapter structure', choose 'Flevoland demo'.
- **De zaal ziet / The room sees:** Het scherm gaat door naar de bronnen.

> **NL:** Eerst de structuur. Flevoland heeft een vaste opbouw voor omgevingsprogramma's: negen delen, van positionering en context tot de formele aspecten. Die structuur kiezen we hier. Agora schrijft daarbinnen, en elk deel weet wat erin hoort en uit welke bronnen het put.
>
> **EN:** First, the structure. Flevoland has a fixed layout for environmental programmes: nine parts, from positioning and context to the formal aspects. That is what we choose here. Agora writes inside it, and each part knows what belongs in it and which sources it draws on.

#### 3. Bronnen met een rol / Sources with a role · 3 min · 0:07

- **Doen / Do:** Controleer dat de omgevingsvisie en het bestaande beleid gekozen zijn, en klik 'Begin met schrijven'.
  Check that the environmental vision and the existing policy are chosen, then click 'Start writing'.
- **De zaal ziet / The room sees:** Het document opent met de negen delen, nog leeg.

> **NL:** Dan de bronnen. Elke bron krijgt een rol. De omgevingsvisie geeft de koers. De stukken over wonen zijn bestaand beleid: dat gaan we zo toetsen. Agora gebruikt alleen wat hier gekoppeld is. Er komt niets van internet bij, en niets wat de provincie niet zelf heeft aangeleverd.
>
> **EN:** Next, the sources. Each source gets a role. The environmental vision sets the direction. The housing documents are existing policy, which we will test in a moment. Agora only uses what is linked here. Nothing comes in from the internet, and nothing the province did not supply itself.

#### 4. De bibliotheek van het programma / The programme's library · 3 min · 0:10

- **Doen / Do:** Laat de bestanden zien en wijs op de rol bij elk bestand.
  Show the files and point at the role of each one.
- **De zaal ziet / The room sees:** Vijf bronnen, elk met een rol.

> **NL:** Dit is de bibliotheek van het programma. De omgevingsvisie, de notitie Flevolandse woonopgave, de startnotitie en het plan van aanpak voor het volkshuisvestingsprogramma, en de voortgangsrapportage woningbouw. Agora leest niet alleen de eerste bladzijden, maar zoekt per vraag de relevante delen op, tot op de pagina.
>
> **EN:** This is the programme's library. The environmental vision, the note on Flevoland's housing task, the starting note and the plan of approach for the housing programme, and the progress report on house building. Agora does not just read the first pages. For each question it looks up the relevant parts, down to the page.

#### 5. Wie is eigenaar, wat is verplicht / Who owns it, what is required · 3 min · 0:13

- **Doen / Do:** Laat de documenteigenaar en het reviewbeleid zien.
  Show the document owner and the review policy.
- **De zaal ziet / The room sees:** De instellingen van dit programma.

> **NL:** In de configuratie legt de provincie vast wie eigenaar is van het programma en hoe er wordt goedgekeurd. Bijvoorbeeld: mag de schrijver zijn eigen hoofdstuk goedkeuren, of moet een tweede ambtenaar tekenen? Dat zijn keuzes van de organisatie, niet van de software.
>
> **EN:** In the configuration the province records who owns the programme and how approval works. For example: may the writer approve their own chapter, or must a second civil servant sign off? Those are choices for the organisation, not for the software.

#### 6. Specialisten achter elke stap / Specialists behind each step · 4 min · 0:16

- **Doen / Do:** Laat de lijst specialisten zien en open er één.
  Show the list of specialists and open one.
- **De zaal ziet / The room sees:** Specialisten voor analyse, maatregelen, schrijven, effecten en kwaliteit.

> **NL:** Achter elke stap zit een specialist: één voor de analyse van bestaand beleid, één voor maatregelen, één die schrijft, één voor effecten en één voor kwaliteit. Elke specialist heeft eigen instructies, eigen bronnen en een eigen taalmodel. De provincie kan ze aanpassen, en elke versie wordt bewaard. Zo is later altijd na te gaan met welke instructies een tekst is gemaakt.
>
> **EN:** Behind each step is a specialist: one analyses existing policy, one proposes measures, one writes, one checks effects and one checks quality. Each has its own instructions, its own sources and its own language model. The province can change them, and every version is kept. So you can always trace which instructions produced a text.

### Wat er al aan beleid is / What policy already exists (17 min, from 0:20)

#### 7. Het bestaande beleid toetsen / Test the existing policy · 5 min · 0:20

- **Doen / Do:** Klik 'Bestaand-beleid analyseren'. Dit duurt ongeveer twee minuten.
  Click 'Run existing-policy analysis'. It takes about two minutes.
- **AI-stap / AI step:** Agora legt de relevante delen van de vier beleidsstukken naast de omgevingsvisie en bepaalt per onderwerp: overnemen, aanpassen, laten vallen, of het ontbreekt nog.
- **De zaal ziet / The room sees:** Een rapport met bevindingen, elk met een label en bronnen.

> **NL:** Voordat de provincie nieuw beleid schrijft, wil ze weten wat er al ligt. Agora legt nu het bestaande woonbeleid naast de omgevingsvisie. Per onderwerp krijgt u een oordeel: overnemen, aanpassen, laten vallen, of: dit ontbreekt nog. Dat is werk dat nu vaak weken kost. Het duurt hier ongeveer twee minuten.
>
> **EN:** Before the province writes new policy, it wants to know what is already there. Agora now sets the existing housing policy against the environmental vision. For each topic you get a verdict: adopt, adapt, drop, or: this is still missing. That is work that often takes weeks today. Here it takes about two minutes.

#### 8. Bevindingen met bron / Findings with a source · 8 min · 0:25

- **Doen / Do:** Lees een bevinding met 'Aanpassen' voor, en wijs op het visiedoel, het belang en de bronnen eronder.
  Read out a finding labelled 'Adapt', and point at the vision goal, the interest and the sources below it.
- **De zaal ziet / The room sees:** Groene, oranje, rode en blauwe labels: overnemen, aanpassen, laten vallen, ontbreekt.

> **NL:** Kijk naar een bevinding met het label aanpassen. U ziet wat er anders moet, aan welk doel uit de visie het raakt, bij welk provinciaal belang het hoort, en uit welke stukken het blijkt, met paginanummer. Niets hiervan is een mening van de software: het is een lezing van de stukken, die de ambtenaar zelf kan controleren.
>
> **EN:** Look at a finding labelled adapt. You see what must change, which goal in the vision it touches, which provincial interest it belongs to, and which documents show it, with page numbers. None of this is the software's opinion. It is a reading of the documents that the civil servant can check.

#### 9. Maatregelen en de visie / Measures and the vision · 4 min · 0:33

- **Doen / Do:** Klik bovenaan op 'Maatregelen en de visie'.
  Click 'Measures and the vision' at the top.
- **De zaal ziet / The room sees:** Een overzicht van de visie met wat eraan hangt.

> **NL:** Dit overzicht draait het om: vanuit de visie gezien. Welke doelen worden al gedekt, en waar zitten nog gaten? Straks, als er maatregelen zijn, hangen die hier ook aan.
>
> **EN:** This view turns it around, seen from the vision. Which goals are already covered, and where are the gaps? Once there are measures, they hang off this view too.

### Belangen en uitwerkingen / Interests and work-ups (20 min, from 0:37)

#### 10. De belangen uit de visie / The interests in the vision · 5 min · 0:37

- **Doen / Do:** Laat de lijst zien. De belangen 14, 15 en 16 over wonen zijn gekozen. Is de lijst leeg, klik dan 'Belangen zoeken'.
  Show the list. Interests 14, 15 and 16 on housing are chosen. If the list is empty, click 'Find interests'.
- **De zaal ziet / The room sees:** De belangen van Flevoland, elk met paginanummer.

> **NL:** De omgevingsvisie noemt een reeks provinciale belangen. Agora heeft ze uit de visie gehaald, elk met de bladzijde waar het staat. Dit programma gaat over wonen, dus werken we met drie belangen: vitale steden en dorpen, voldoende en betaalbare woningen, en toekomstbestendige woonomgevingen.
>
> **EN:** The environmental vision names a set of provincial interests. Agora took them from the vision, each with the page where it appears. This programme is about housing, so we work with three interests: vital towns and villages, enough affordable homes, and future-proof living environments.

#### 11. De belangen uitwerken / Work up the interests · 8 min · 0:42

- **Doen / Do:** Klik 'Gekozen uitwerken'. Dit loopt op de achtergrond, ongeveer twee minuten per belang.
  Click 'Work up chosen'. It runs in the background, about two minutes per interest.
- **AI-stap / AI step:** Agora werkt de drie belangen een voor een uit, met citaten uit de bronnen. U kunt intussen verder; het werk loopt op de server door.
- **De zaal ziet / The room sees:** Bij elk belang verschijnt 'Uitwerking openen' zodra het klaar is.

> **NL:** Nu werkt Agora de drie belangen uit. Per belang zoekt het op wat de visie vraagt, wat het bestaande beleid al regelt en wat nog ontbreekt, en zet het dat onder de koppen van de structuur. Dit loopt op de server. We kunnen intussen iets anders laten zien, of de pagina verlaten: het werk gaat door.
>
> **EN:** Agora now works up the three interests. For each one it looks up what the vision asks, what existing policy already covers and what is still missing, and puts that under the structure's headings. This runs on the server. We can show something else meanwhile, or even leave the page: the work continues.

#### 12. Een uitwerking lezen / Read a work-up · 7 min · 0:50

- **Doen / Do:** Klik 'Uitwerking openen' bij belang 14, scroll door de koppen en beweeg over een bronverwijzing.
  Click 'Open work-up' for interest 14, scroll through the headings and hover a source reference.
- **De zaal ziet / The room sees:** Een leesbaar stuk met koppen en aanklikbare bronverwijzingen.

> **NL:** Dit is de uitwerking van vitale steden en dorpen. Het is werkmateriaal, geen hoofdstuk: wat de visie vraagt, welk beleid er al is, waar het schuurt, en wat ontbreekt. Beweeg over een bronverwijzing en u ziet het citaat en de bladzijde. De hoofdstukken bouwen straks op deze uitwerkingen.
>
> **EN:** This is the work-up for vital towns and villages. It is working material, not a chapter: what the vision asks, which policy exists, where it rubs, and what is missing. Hover a source reference and you see the quote and the page. The chapters will build on these work-ups.

### Maatregelen / Measures (33 min, from 0:57)

#### 13. Maatregelen voorstellen / Propose measures · 8 min · 0:57

- **Doen / Do:** Klik 'Maatregelen voorstellen' bij belang 14. Als dat klaar is, doe hetzelfde bij 15 en 16, één tegelijk.
  Click 'Propose measures' for interest 14. When it finishes, do the same for 15 and 16, one at a time.
- **AI-stap / AI step:** Agora stelt per belang een handvol concrete maatregelen voor, met doel, opgave, actie, de rol van de provincie, tijdpad, indicator en bronnen.
- **De zaal ziet / The room sees:** Na ongeveer twee minuten per belang staan de maatregelen in het register.

> **NL:** Van belangen naar maatregelen. Agora stelt per belang een handvol concrete maatregelen voor. Niet: we streven naar meer betaalbare woningen. Maar: wie doet wat, met welk instrument, wanneer, en hoe weten we of het werkt. Elke maatregel verwijst naar de bronnen waar hij op steunt.
>
> **EN:** From interests to measures. For each interest Agora proposes a handful of concrete measures. Not: we aim for more affordable homes. But: who does what, with which instrument, when, and how we know it works. Each measure points to the sources it rests on.

#### 14. Het register / The register · 7 min · 1:05

- **Doen / Do:** Loop één maatregel door: belangen, doel, opgave, actie, rol, tijdpad, indicator, wie handelt en bronnen.
  Walk through one measure: interests, goal, challenge, action, role, timeline, indicator, who acts and sources.
- **De zaal ziet / The room sees:** Een maatregel met alle velden en de bronnen eronder.

> **NL:** Dit is het maatregelenregister. Kijk naar één maatregel. Bij welke belangen hoort hij, wat is het doel, wat is de opgave, wat is de concrete actie, welke rol neemt de provincie, wanneer, en waaraan meet je het. En belangrijk: wie handelt er eigenlijk? De provincie zelf, een gemeente, of een corporatie? Dat staat er expliciet bij.
>
> **EN:** This is the measures register. Look at one measure. Which interests it belongs to, the goal, the challenge, the concrete action, the province's role, the timeline, and how you measure it. And importantly: who actually acts? The province itself, a municipality, or a housing association? That is stated explicitly.

#### 15. De ambtenaar besluit / Staff decide · 8 min · 1:12

- **Doen / Do:** Kies bij één maatregel 'Behouden', bij een andere 'Aanpassen' met wat er moet veranderen, en laat er één vallen met een reden.
  Choose 'Keep' on one measure, 'Adapt' on another with what should change, and drop one with a reason.
- **De zaal ziet / The room sees:** Het besluit staat bij de maatregel, met een gekleurde rand: grijs, oranje of rood.

> **NL:** Hier besluit de ambtenaar. Deze maatregel houden we. Deze moet anders, en we schrijven op wat er moet veranderen. En deze laten we vallen, met een reden. Elk besluit wordt vastgelegd: wie, wanneer en waarom. Een maatregel die valt, komt niet in het programma. Maar het besluit blijft bewaard, zodat later te zien is dat hij bewust is geschrapt.
>
> **EN:** Here the civil servant decides. This measure we keep. This one must change, and we write down what should change. And this one we drop, with a reason. Every decision is recorded: who, when and why. A dropped measure does not go into the programme. But the decision is kept, so later anyone can see it was removed on purpose.

#### 16. Prioriteit / Priority · 5 min · 1:20

- **Doen / Do:** Geef twee maatregelen 'Hoog' en één 'Laag'. Zet daarna 'Maatregelen sorteren' op 'Prioriteit eerst'.
  Give two measures 'High' and one 'Low'. Then set 'Sort measures' to 'Priority first'.
- **De zaal ziet / The room sees:** De lijst staat op prioriteit, met de gevallen maatregel onderaan.

> **NL:** Niet alles kan tegelijk. De ambtenaar geeft maatregelen een prioriteit: hoog, middel of laag, met een reden als dat nodig is. Het programma volgt die volgorde. Straks ziet u in de hoofdstukken dat de hoge prioriteit eerst staat.
>
> **EN:** Not everything can happen at once. The civil servant gives measures a priority: high, medium or low, with a reason where needed. The programme follows that order. Later you will see in the chapters that the high-priority measures come first.

#### 17. Klopt de rol van de provincie? / Is the province's role right? · 5 min · 1:25

- **Doen / Do:** Klik 'Rollen controleren'.
  Click 'Check roles'.
- **AI-stap / AI step:** Agora bekijkt per maatregel wie er echt handelt en welk instrument de provincie daarvoor heeft.
- **De zaal ziet / The room sees:** Bij elke maatregel staat wie handelt, met een uitleg onder 'Waarom deze rol'.

> **NL:** Een bekende valkuil: een programma belooft dingen die de provincie niet zelf kan doen. Agora controleert per maatregel wie er echt handelt, en of de provincie daar een instrument voor heeft. Waar een gemeente of corporatie aan zet is, staat dat erbij, met de uitleg waarom.
>
> **EN:** A familiar trap: a programme promises things the province cannot do itself. Agora checks, for each measure, who really acts and whether the province has an instrument for it. Where a municipality or housing association has to act, it says so, and explains why.

### Pauze / Break (15 min, from 1:30)

#### 18. Pauze / Break · 15 min · 1:30

- **Doen / Do:** Pauze. Laat het scherm op het document staan.
  Break. Leave the screen on the document.
- **De zaal ziet / The room sees:** Het document.

> **NL:** We nemen een korte pauze. Na de pauze kijken we hoe de drie belangen samenhangen, waar ze botsen, en laten we Agora het programma schrijven.
>
> **EN:** Let's take a short break. After the break we look at how the three interests fit together, where they clash, and then we let Agora write the programme.

### Samenhang tussen belangen / Across interests (20 min, from 1:45)

#### 19. Belangen naast elkaar / Interests side by side · 7 min · 1:45

- **Doen / Do:** Klik 'Gekozen belangen vergelijken'. Dit duurt ongeveer een minuut.
  Click 'Compare chosen interests'. It takes about a minute.
- **AI-stap / AI step:** Agora legt de uitwerkingen en maatregelen van de drie belangen naast elkaar en zoekt waar ze elkaar versterken, maatregelen kunnen delen, of botsen.
- **De zaal ziet / The room sees:** Een raster van belangen, met daaronder de gevonden verbanden.

> **NL:** Belangen staan niet los van elkaar. Meer woningen bouwen raakt aan de kwaliteit van de woonomgeving. Agora legt nu de drie uitwerkingen en hun maatregelen naast elkaar, en zoekt drie dingen: waar versterken ze elkaar, waar kan één maatregel twee belangen dienen, en waar botsen ze.
>
> **EN:** Interests do not stand alone. Building more homes touches the quality of the living environment. Agora now sets the three work-ups and their measures side by side, and looks for three things: where they reinforce each other, where one measure can serve two interests, and where they clash.

#### 20. Het raster / The grid · 6 min · 1:52

- **Doen / Do:** Klik in het raster op een vakje om alleen dat paar te zien. Klik 'Alle paren tonen' om terug te gaan.
  Click a cell in the grid to see only that pair. Click 'Show every pair' to go back.
- **De zaal ziet / The room sees:** Alleen de verbanden van dat paar staan eronder.

> **NL:** Elk vakje is een paar belangen. De letters tellen wat er gevonden is: versterkend, een gedeelde maatregel, of een dilemma. Klik op een vakje en u ziet alleen dat paar.
>
> **EN:** Each cell is a pair of interests. The letters count what was found: reinforcing, a shared measure, or a dilemma. Click a cell and you see only that pair.

#### 21. Dilemma's houden of opzij zetten / Keep or set aside · 7 min · 1:58

- **Doen / Do:** Houd een dilemma en een gedeelde maatregel met 'Behouden'. Zet er één opzij met een reden.
  Keep a dilemma and a shared measure with 'Keep'. Set one aside with a reason.
- **De zaal ziet / The room sees:** Gehouden verbanden krijgen een donkere rand; opzij gezette worden doorgestreept.

> **NL:** Ook hier besluit de ambtenaar. Dit dilemma is echt, dat houden we: het programma moet er iets over zeggen. Deze gedeelde maatregel houden we ook. En deze zetten we opzij, met een reden. Alleen wat gehouden is, komt in het programma.
>
> **EN:** Here too the civil servant decides. This dilemma is real, so we keep it: the programme must say something about it. This shared measure we keep as well. And this one we set aside, with a reason. Only what is kept goes into the programme.

### Effecten / Effects (10 min, from 2:05)

#### 22. Effecten per maatregel / Effects per measure · 10 min · 2:05

- **Doen / Do:** Kies bij een maatregel de richting (positief, negatief, neutraal) en klik 'Effecten opslaan'.
  Choose a measure's direction (positive, negative, neutral) and click 'Save effects'.
- **De zaal ziet / The room sees:** De maatregel staat als vastgelegd in de lijst.

> **NL:** Bij een omgevingsvisie hoort een omgevingseffectrapport. Per maatregel legt de provincie hier vast of die de leefomgeving helpt of schaadt, en waar een maatregel afwijkt van het rapport, moet een reden worden opgeschreven. Met het effectrapport gekoppeld toetst Agora dit ook automatisch. Dat rapport zit niet in deze demo, dus we laten het vastleggen zien.
>
> **EN:** An environmental vision comes with an environmental effects report. For each measure the province records here whether it helps or harms the living environment, and where a measure departs from the report, a reason must be written down. With the effects report linked, Agora checks this automatically too. That report is not in this demo, so we show the recording.

### Het programma schrijven / Write the programme (5 min, from 2:15)

#### 23. Het programma laten schrijven / Let Agora write the programme · 5 min · 2:15

- **Doen / Do:** Klik 'Lege hoofdstukken schrijven'. Ga daarna meteen door; dit loopt ongeveer acht minuten.
  Click 'Write empty chapters'. Then move straight on; it takes about eight minutes.
- **AI-stap / AI step:** Agora schrijft de acht verplichte delen een voor een. Elk hoofdstuk verschijnt zodra het klaar is. Dit loopt op de server door, ook als u ergens anders heen gaat.
- **De zaal ziet / The room sees:** Een voortgangsbalk bovenaan het document; hoofdstukken vullen zich een voor een.

> **NL:** Nu laten we Agora het programma schrijven. Elk deel weet wat erin hoort en waar het uit put: de uitwerkingen, de verbanden die de ambtenaar heeft gehouden, en de maatregelen, op volgorde van prioriteit. Dit duurt ongeveer acht minuten. We wachten niet: intussen laten we zien hoe collega's samenwerken.
>
> **EN:** Now we let Agora write the programme. Each part knows what belongs in it and what it draws on: the work-ups, the links the civil servant kept, and the measures in priority order. This takes about eight minutes. We won't wait: meanwhile we show how colleagues work together.

### Samenwerken / Working together (20 min, from 2:20)

#### 24. Notities van collega's / Colleagues' notes · 6 min · 2:20

- **Doen / Do:** Zet 'Toon commentaar' aan, selecteer een zin in een klaar hoofdstuk en plaats een notitie.
  Turn on 'Show comments', select a sentence in a finished chapter and add a note.
- **De zaal ziet / The room sees:** De notitie verschijnt naast de tekst.

> **NL:** Terwijl Agora schrijft, lezen collega's mee. Zij plaatsen notities bij een zin, zoals ze dat in Word gewend zijn. Het verschil: de notities zitten aan het levende programma vast, en niet aan een kopie die per mail rondgaat.
>
> **EN:** While Agora writes, colleagues read along. They leave notes on a sentence, as they are used to in Word. The difference: the notes are attached to the live programme, not to a copy that goes round by email.

#### 25. Notities die hetzelfde zeggen / Notes that say the same · 5 min · 2:26

- **Doen / Do:** Klik 'Zoek gemeenschappelijke notities'.
  Click 'Find common notes'.
- **De zaal ziet / The room sees:** De review opent op de gegroepeerde notities.

> **NL:** Als tien collega's meelezen, zeggen er vaak drie hetzelfde. Agora groepeert notities die over hetzelfde gaan, zodat de schrijver één keer kan antwoorden en ze in één keer als verwerkt kan markeren.
>
> **EN:** When ten colleagues read along, three of them often say the same thing. Agora groups notes on the same point, so the writer can answer once and mark them handled in one go.

#### 26. Review en goedkeuring / Review and approval · 5 min · 2:31

- **Doen / Do:** Klik 'Review vragen' bij het eerste hoofdstuk, en daarna 'Keur hoofdstuk goed'.
  Click 'Request review' on the first chapter, then 'Approve chapter'.
- **De zaal ziet / The room sees:** Het hoofdstuk staat op goedgekeurd.

> **NL:** Elk hoofdstuk en elke maatregel krijgt een status: concept, in review, goedgekeurd. De schrijver vraagt review aan, een collega keurt goed of stuurt terug met een verzoek. Zo is altijd duidelijk wat klaar is en wat niet.
>
> **EN:** Each chapter and each measure has a status: draft, in review, approved. The writer requests a review, and a colleague approves it or sends it back with a request. So it is always clear what is done and what is not.

#### 27. Waar staat het programma? / Where does the programme stand? · 4 min · 2:36

- **Doen / Do:** Laat zien wat klaar is en wat nog open staat.
  Show what is done and what is still open.
- **De zaal ziet / The room sees:** Een overzicht van de stappen en hoofdstukken.

> **NL:** De projectleider hoeft niet rond te bellen. Hier staat in één scherm wat klaar is, wat in review is en wat nog open staat.
>
> **EN:** The project lead doesn't need to phone round. This one screen shows what is done, what is in review and what is still open.

### Het resultaat lezen / Read the result (10 min, from 2:40)

#### 28. Het geschreven programma / The written programme · 10 min · 2:40

- **Doen / Do:** Open 'Hoofdstukken' en ga naar het deel over samenhang en daarna het deel met de maatregelen. Wijs op de volgorde en op de gevallen maatregel die ontbreekt.
  Open 'Chapters' and go to the part on coherence, then the part with the measures. Point at the order and at the dropped measure that is absent.
- **De zaal ziet / The room sees:** Leesbare hoofdstukken met bronverwijzingen; hoge prioriteit eerst.

> **NL:** Het programma is geschreven. Kijk naar het deel over samenhang: daar staan de verbanden die de ambtenaar heeft gehouden, niet de verbanden die opzij zijn gezet. En in het deel met de maatregelen staan ze op volgorde van prioriteit. De maatregel die we lieten vallen, staat er niet in. Elke bewering heeft een bronverwijzing; beweeg erover en u ziet het citaat.
>
> **EN:** The programme is written. Look at the part on coherence: it holds the links the civil servant kept, not the ones set aside. And in the part with the measures, they are in priority order. The measure we dropped is not there. Every claim has a source reference; hover it and you see the quote.

### Verantwoording / Accountability (20 min, from 2:50)

#### 29. Eén hoofdstuk opnieuw, streng op bronnen / Redraft one chapter, strict on sources · 6 min · 2:50

- **Doen / Do:** Klik het potlood bij een hoofdstuk, open het menu van dat hoofdstuk en kies 'Opnieuw genereren met strikte citaties'.
  Click the pencil on a chapter, open that chapter's menu and choose 'Regenerate with strict citations'.
- **AI-stap / AI step:** Agora schrijft dit ene hoofdstuk opnieuw en zoekt elk citaat terug in de bronnen.
- **De zaal ziet / The room sees:** Een melding: zoveel van zoveel citaten gevonden in de bronnen.

> **NL:** Vertrouwen moet je kunnen controleren. Dit hoofdstuk laten we opnieuw schrijven, met strikte regels voor bronnen. Daarna zoekt Agora elk citaat terug in de bron, en meldt hoeveel er gevonden zijn. Een citaat dat niet te vinden is, wordt gemarkeerd.
>
> **EN:** Trust has to be checkable. We have this chapter rewritten with strict rules on sources. Then Agora looks up every quote in its source and reports how many it found. A quote that cannot be found is flagged.

#### 30. Herleidbaarheid / Provenance · 8 min · 2:56

- **Doen / Do:** Open een hoofdstuk-run: laat de score zien, de beweringen die gecontroleerd moeten worden, en de ongebruikte bronnen.
  Open a chapter run: show the score, the claims to check, and the sources left unused.
- **De zaal ziet / The room sees:** Een score, een lijst beweringen om te controleren, en welke bronnen niet zijn gelezen.

> **NL:** Hier legt Agora verantwoording af. Voor elke keer dat het tekst maakte: welk model, welke bronnen, en hoe goed de beweringen onderbouwd zijn. Een score van honderd betekent dat elke bewering een citaat heeft dat in de bron staat. Wat niet klopt, staat er gewoon: deze bewering heeft geen bron, dit citaat is niet gevonden. De ambtenaar weet precies wat nog nagekeken moet worden.
>
> **EN:** This is where Agora accounts for itself. For every time it produced text: which model, which sources, and how well the claims were backed. A score of one hundred means every claim has a quote that is in the source. What does not hold up is shown plainly: this claim has no source, this quote was not found. The civil servant knows exactly what still needs checking.

#### 31. Het auditpakket / The audit pack · 6 min · 3:04

- **Doen / Do:** Klik 'Auditpakket maken'.
  Click 'Build audit pack'.
- **De zaal ziet / The room sees:** Een bestand wordt gedownload; onder aan de pagina staat 'Vastgelegde versie van …'.

> **NL:** Als het programma straks ter discussie staat, bij de Staten of bij de rechter, wil de provincie kunnen laten zien hoe het tot stand kwam. Het auditpakket legt een versie vast met alle AI-runs, alle maatregelen, alle besluiten met naam en reden, en alle bronnen, met een digitale vingerafdruk. Die versie is ook wat we zo publiceren.
>
> **EN:** If the programme is challenged later, in the provincial council or in court, the province wants to show how it came about. The audit pack fixes a version with every AI run, every measure, every decision with name and reason, and every source, with a digital fingerprint. That version is also what we publish next.

### Publiceren en inspraak / Publish and consult (20 min, from 3:10)

#### 32. Naar Word / To Word · 4 min · 3:10

- **Doen / Do:** Klik 'Word' en open het bestand.
  Click 'Word' and open the file.
- **De zaal ziet / The room sees:** Een Word-document met de hoofdstukken en maatregelen.

> **NL:** De provincie werkt voor de Staten en de huisstijl met Word. Met één klik komt het programma als Word-document eruit, met de hoofdstukken, de maatregelen op volgorde van prioriteit, en de bronverwijzingen.
>
> **EN:** For the council and its house style, the province works in Word. One click and the programme comes out as a Word document, with the chapters, the measures in priority order, and the source references.

#### 33. Publiceren voor inspraak / Publish for consultation · 5 min · 3:14

- **Doen / Do:** Kies wie de versie mag lezen en klik 'Publiceer deze versie'. Open daarna de publieke pagina.
  Choose who may read the version and click 'Publish this version'. Then open the public page.
- **De zaal ziet / The room sees:** Een publieke pagina met het programma en een vaste bronvermelding.

> **NL:** Nu publiceren we de vastgelegde versie. Inwoners, gemeenten en partners lezen precies de versie die in het auditpakket staat. Het concept waar de ambtenaren in werken, blijft intern. De formele bekendmaking loopt apart; dit is de versie om op te reageren.
>
> **EN:** Now we publish the fixed version. Residents, municipalities and partners read exactly the version that is in the audit pack. The draft the civil servants work in stays internal. Formal enactment happens separately; this is the version to respond to.

#### 34. De inspraakperiode / The consultation period · 6 min · 3:19

- **Doen / Do:** Kies de data en klik 'Open consultatie'. Plaats op de publieke pagina een reactie als inwoner.
  Pick the dates and click 'Open consultation'. On the public page, leave a comment as a resident.
- **De zaal ziet / The room sees:** De reactie verschijnt in de consultatie.

> **NL:** We openen de inspraakperiode. Een inwoner reageert op de gepubliceerde versie, en die reactie komt hier binnen. Reacties gaan over precies de tekst die gepubliceerd is, niet over een concept dat intussen is veranderd.
>
> **EN:** We open the consultation period. A resident responds to the published version, and the response arrives here. Comments are about exactly the text that was published, not a draft that has changed since.

#### 35. Reacties verwerken / Handle the responses · 5 min · 3:25

- **Doen / Do:** Groepeer de reacties op onderwerp, beantwoord er één en leg het besluit vast.
  Group the responses by topic, answer one and record the decision.
- **De zaal ziet / The room sees:** De reactie heeft een antwoord en een besluit.

> **NL:** De provincie moet laten zien wat zij met reacties heeft gedaan. Agora groepeert reacties op onderwerp, de ambtenaar beantwoordt ze en legt per reactie vast wat ermee gebeurt. Dat overzicht gaat mee in de verantwoording.
>
> **EN:** The province must show what it did with the responses. Agora groups them by topic, the civil servant answers them and records what happens with each one. That overview becomes part of the accountability record.

### Vragen / Questions (15 min, from 3:30)

#### 36. Vragen / Questions · 15 min · 3:30

- **Doen / Do:** Open de vloer voor vragen.
  Open the floor for questions.
- **De zaal ziet / The room sees:** Het document.

> **NL:** Dat was Agora, van visie tot inspraak. De ambtenaar besliste bij elke stap, en elke bewering is terug te voeren op een bladzijde in de eigen stukken van de provincie. We horen graag uw vragen.
>
> **EN:** That was Agora, from vision to consultation. The civil servant decided at every step, and every claim can be traced to a page in the province's own documents. We would be glad to take your questions.

