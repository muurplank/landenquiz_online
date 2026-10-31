# Land Trainer – volgorde op basis van responstijd

Literatuurrapport en algoritmespecificatie, 31 oktober 2026. Geschreven door een onderzoeks-AI op een prompt van de programmeur; de antwoorden op de vervolgvragen staan onderaan. De implementatie staat in `js/core/tempo.js` (algoritme), `js/core/engine.js` (picker `tempo`) en de quizvormen in `js/quiz/`. Markeringen: **[bron]** direct uit een gevonden bron, **[afgeleid]** redenering vanuit bronnen, **[eigen]** inschatting van de onderzoeker.

## 1. Conclusie

1. Gebruik responstijd (RT) alleen bij correcte antwoorden en alleen als relatieve maat: log-RT min je eigen basissnelheid in dezelfde context (antwoordmanier × vaardigheid × apparaat). Absolute milliseconden zijn tussen quizvormen niet vergelijkbaar.
2. Werk het langetermijnbeeld bij met koude metingen (eerste keer per sessie dat een item gevraagd wordt). Herhalingen binnen een sessie meten vooral werkgeheugen en tellen nauwelijks mee.
3. De eenheid is land × vaardigheid (bijv. "NL, vlag→land"), met gedeeltelijke overdracht via een landgemiddelde als beginwaarde. De engine kiest het paar, niet alleen het land.
4. Selectie: gewogen trekking met een begrensde frequentieverhouding (traagste ≈ 5× vaker dan snelste), een harde minimale tussenafstand, een vergeetterm die groeit met de tijd sinds de laatste meting, en een achterstandsboost zodat geen land langer dan ~4 weken wegblijft.
5. Fouten krijgen een vaste, begrensde slechtste score en komen binnen de sessie na enkele andere vragen terug, zoals in ARTS.
6. Waarom: ARTS (responstijd + juistheid) gaf in een aardrijkskundetaak beter onthouden na een week dan vaste schema's, met effectgroottes rond d = 0,5–0,8. Ook SlimStampen gebruikt RT met succes. Maar RT is een ruizig signaal, en voor stof die al bijna perfect beheerst wordt bestaat geen direct bewijs. Begin daarom voorzichtig, log meer gegevens, en evalueer binnen-persoon.

## 2. Theorie in het kort

**Retrieval strength en storage strength.** Bjork & Bjork (1992) onderscheiden hoe makkelijk je iets nu kunt ophalen (retrieval strength) van hoe diep het verankerd zit (storage strength). Vlak na het zien van het antwoord is retrieval strength hoog, ook als storage strength laag is. Een snelle RT meet dus vooral retrieval strength. **[bron]**

**Activatie en latency (ACT-R).** Elk feit heeft een activatie A die na elke herhaling vervalt met een machtsfunctie van de tijd. De voorspelde RT is RT = F·e^(−A) + vaste tijd. SlimStampen/MemoryLab gebruikt precies deze vergelijkingen: per item en per leerder wordt een rate of forgetting bijgesteld op basis van het verschil tussen voorspelde en gemeten RT (Sense et al., 2015; 2016; van Rijn et al., 2009). **[bron]** Omdat A ≈ −d·ln(t), stijgt ln(RT) ongeveer lineair met ln(tijd sinds laatste herhaling). Dat is de basis voor de vergeetterm. **[afgeleid]**

**Automaticiteit en de oefencurve.** Volgens Logan's instance theory (1988) wordt een taak automatisch zodra het antwoord direct uit het geheugen komt. RT daalt dan snel en vlakt af. Heathcote, Brown & Mewhort (2000) lieten op 7910 leerreeksen van 475 deelnemers zien dat per persoon een exponentiële curve beter past dan de power law. **[bron]** Praktisch: er is een plafond.

**Vloeiendheid misleidt.** Benjamin, Bjork & Schwartz (1998) vonden dat antwoorden met de kortste latency het hoogst werden ingeschat, terwijl antwoorden met de langste latency later het vaakst werden herinnerd. Moeizaam maar succesvol ophalen versterkt het geheugen meer (Pyc & Rawson, 2009). **[bron]** Voor de volgorde wijzen beide kanten dezelfde kant op: een traag-correct item is nu zwakker én haalt meer winst uit een volgende oefening. **[afgeleid]**

**Aantal keuzes (Hick-Hyman).** Bij een keuzereactie stijgt RT met de logaritme van het aantal alternatieven (Hick, 1952; Hyman, 1953). **[bron]** Dit geldt vooral voor kiezen uit een zichtbare lijst. **[afgeleid]**

## 3. Antwoorden per onderzoeksvraag

### V1. Validiteit van responstijd
- In het Tsjechische aardrijkskundesysteem outlinemaps.org hing de kans dat het volgende antwoord over hetzelfde item goed is, bij een correct huidig antwoord ongeveer lineair af van de RT: van circa 95% bij zeer snelle tot bijna 80% bij trage antwoorden. Extreem snelle antwoorden wezen soms op gokken. Bij een fout antwoord voorspelde een langere RT juist iets vaker een goed volgend antwoord (Papoušek et al., 2015). **[bron]**
- Pelánek (2018) vond in wiskunde, spelling en grammatica dat foute antwoorden informatiever zijn dan RT. Řihák & Pelánek (2016): de manier waarop je RT verwerkt maakt meer uit dan het domeinmodel. **[bron]** RT is bruikbaar maar zwakker dan fout/goed; bij iemand die bijna nooit fout maakt is RT de enige overgebleven informatie, maar middel hem over meerdere metingen.
- Snelheid misleidt: (a) vlak na het zien van het antwoord, na een fout of via de spiekbrief (werkgeheugen; Mettler et al. 2016 bouwden daarom een verplichte vertraging in); (b) bij een zichtbare lijst of uitsluiting aan het eind van een ronde; (c) bij gokken op meerkeuze; (d) bij motorische verschillen. **[bron + afgeleid]**

### V2. Bestaande systemen die RT gebruiken
**ARTS (Mettler, Massey & Kellman, 2011; 2016).** P_i = a · (N_i − D) · [ b · (1 − α_i) · log(RT_i / r) + α_i · W ], met N_i beurten sinds de laatste presentatie, D verplichte vertraging (1), α_i = 1 bij fout, W grote prioriteit voor fouten, r = 3,0. RT van foute antwoorden wordt genegeerd. Experiment 1: 24 Afrikaanse landen op een kaart, kiezen uit 38 namen, 72 studenten; na een week scoorde de adaptieve groep 0,42 tegen 0,31 en 0,30 (d ≈ 0,56–0,57). Experiment 2 (n = 48) tegen "yoked" schema's: d ≈ 0,74–0,80. **[bron]** ARTS is gepatenteerd (US 7052277); alleen de principes zijn overgenomen.

**SlimStampen / MemoryLab (van Rijn et al., 2009; Sense et al., 2015, 2016).** A(t) = ln Σ_j (t − t_j)^(−d_j), d_j = c·e^(A(t_j)) + α, α start 0,3. Na elk antwoord wordt α bijgesteld. Rate of forgetting is stabiel over weken, verschilt tussen materialen (vlaggen en stadslocaties getest, 67 deelnemers, 3 weken). RT-aanpak verslaat Leitner (Wilschut et al., 2021). **[bron]** Zwaar in opslag: alle herhalingstijdstippen per item.

**Elo-varianten met tijd (Pelánek et al.; Math Garden).** Gokcorrectie P(goed) = 1/n + (1 − 1/n)·σ(θ − b) (Papoušek et al., 2014; Pelánek et al., 2017). Prestatiemaat r = max(0, 1 − t/14) (Řihák & Pelánek, 2016). High Speed High Stakes: snel goed levert veel op, snel fout kost veel (Klinkenberg et al., 2011; Maris & van der Maas, 2012). **[bron]**

**Modellen zonder RT.** Half-Life Regression (Settles & Meeder, 2016), DASH (Lindsey et al., 2014: +16,5% na een maand), FSRS (Ye et al., 2022). Ze plannen over dagen, gebruiken goed/fout en hebben veel data nodig. **[bron]**

### V3. Van tijd naar score
1. Log-transformatie. 2. Normaliseren tegen jezelf in dezelfde context: r = ln(RT) − B_ctx. Geen z-scores: de spreiding is met weinig data instabiel. **[eigen]** 3. Uitschieters weggooien (tabblad verborgen, RT < 250 ms, RT > max(15 s, 6·e^B)); residu begrensd op [−0,8; +1,0]. 4. Gewogen lopend gemiddelde met startgewicht: α = max(1/(n + n₀), α_min). 5. α_min = 0,2: de laatste ~5 koude metingen bepalen het beeld. 6. Fouten: vast residu 1,2.

### V4. Storende factoren
| Factor | Correctie |
|---|---|
| Antwoordmanier, apparaat, typsnelheid | Basislijn per context (antwoordmanier × vaardigheid × apparaat), terugval op antwoordmanier × apparaat bij < 15 metingen |
| Woordlengte | Tijd tot de eerste toets (TTFK) |
| Setgrootte / Hick | Alleen voor lijst- en klikvormen: bucket (≤ 12, 13–30, 31–60, > 60) |
| Uitsluiting aan het eind van een ronde | Geen rondes; op tempo geen markering van al beantwoorde landen |
| Herkennen uit een lijst | Lage weging (0,3) |
| Tijd sinds de vorige vraag | w_rec; alleen koude metingen sturen het langetermijnbeeld |
| Vergeten over dagen | r_adj = r − s(Δdagen) |

### V5. Wat precies meten
Typen: tijd tot de eerste toets vanaf het zichtbaar worden van de stimulus. Zelf beoordelen: tijd tot de spatiebalk; direct 1/2 zonder tonen is de tijd tot die toets, maar "goed" krijgt gewicht 0,4 (mensen overschatten hun eigen juistheid; Dunlosky & Rawson, 2012). Kaart met oplichtend land: klok start na de zoomanimatie. Naam → aanklikken: tijd tot de eerste klik. Hoofdstad aanklikken: weeg laag, log de afstand. Kwartet: geen RT. Geschiedenis: geen RT (leestijd domineert). Alles of niets: per stap.

### V6. Eenheid van kennis
Per land én vaardigheid. Pan & Rickard (2018), 192 effectgroottes: overdracht bestaat (d ≈ 0,40), het zwakst bij omgedraaide items. Sense et al. (2016): vergeetsnelheid verschilt tussen vlaggen en locaties. **[bron]** Model: item = (land, vaardigheid), beginwaarde m₀ = ρ·c_land met ρ = 0,5. De engine kiest het paar. Score voor de hele app, niet per set. Geschiedenis: eenheid = weetje, apart model (nog niet gebouwd).

### V7. Selectie
Gewogen trekking met ARTS-principes als harde regels. Exploratiebonus β/√(n+1). Harde tussenafstand g = min(4, ⌊N/3⌋), daarna f(k) = 1 − e^(−(k−g)/κ). Fout terug na g_fout = min(3, N − 1). Maximale frequentieverhouding R = 5 **[eigen]**. Achterstandsboost na 28 dagen. Stoppen na Q = clamp(round(1,5·N), 15, 40): doorgaan na beheersing binnen één sessie gaf na 4 weken nauwelijks winst (Rohrer et al., 2005); liever verspreid opnieuw oefenen (Rawson & Dunlosky, 2011, 2012). **[bron]**

### V8. Tijd en vergeten
s(Δd) = min(0,8; c·log₂(1 + Δd)) met c = 0,12. Bij het bijwerken aftrekken, bij het kiezen optellen. Binnen een sessie: koude metingen wegen volledig, latere w_rec = 0,3·(1 − e^(−Δt/90 s)).

### V9. Eerste keer
m₀ = ρ·c_land of 0; prior n₀ = 2; na ~3 koude metingen weegt de data 60%. De onzekerheidsbonus zorgt dat nieuwe items vroeg komen.

### V10. Motivatie en risico's
Papoušek et al. (2016): makkelijke vragen zijn beter voor korte-termijn-engagement, moeilijkere voor leren. Maatregelen: geen klok tonen, begrensde R, heel snelle antwoorden niet als bewijs tellen, fout weegt altijd zwaarder dan traag. Plafond: 10e percentiel van je koude correcte tijden per context × 1,15; twee koude sessies op rij daarbinnen → need begrensd op −1, item blijft in rotatie.

### V11. Evaluatie
Randomisatie per item binnen één gebruiker (arm A tempo, arm B uniform met dezelfde afstandsregels), vaste toewijzing; uitkomst het koude residu bij het volgende sessiebegin. Corrigeert regressie naar het gemiddelde. Statistiek: gepaard per item (Wilcoxon), mixed model over gebruikers.

### V12. Fout en halfgoed
Correct r ∈ [−0,8; 1,0], fout 1,2, goedgekeurde typfout +0,3, een ander geldig antwoord (Iran ↔ Irak) telt als fout. Hoofdstad-klik: ≤ 50 km geen straf, 50–250 km +0,3 × (d − 50)/200. Meerkeuze met k opties: gewicht (1 − 1/k) (gokcorrectie, Papoušek et al., 2014).

### V13. Dataontwerp
Extra loggen: tijd tot eerste invoer, stimulus klaar, antwoordmanier, getoond of niet, tabblad verborgen, spiekbrief open, apparaatklasse, typfoutafstand en verwisselbaarheid, setgrootte en aantal keuzes, vaardigheid, afstand in km, fout antwoord, stappen bij Alles of niets. Samenvatting per item `[m×100, n×10, dag, flags]` (bit0 laatste fout, bit1-2 plafondreeks, bit3 legacy). Samenvoegen tussen apparaten: nieuwste dag wint, bij gelijke dag de hoogste n. Oude data: per item per sessie alleen het eerste correcte antwoord, basislijn per (quizvorm, vraagtype) uit die data, gewicht 0,3, legacy-flag.

## 4. Vergelijkingstabel

| Algoritme | Data per item | Complexiteit | Bewijs | Geschiktheid |
|---|---|---|---|---|
| Thompson Sampling (huidig) | 2 tellers, niet persistent | Laag | Bandit-principe | Laag bij bijna 100% goed |
| ARTS | Laatste RT, goed/fout, beurten | Laag | Gecontroleerd, landen op een kaart, d ≈ 0,5–0,8 | Hoog als principe; gepatenteerd |
| SlimStampen / ACT-R | Alle herhalingstijdstippen + α | Middel | Lab- en veldstudies | Middel: zwaar in opslag |
| Elo + tijd | Vaardigheid en moeilijkheid | Laag | Groot in gebruik | Middel: veel gebruikers nodig |
| HLR / DASH / FSRS | Features + getrainde gewichten | Middel–hoog | Groot, geen RT | Laag |
| **Begrensde RT-need-sampler (gekozen)** | m, n_eff, dag, flags | Laag–middel | Afgeleid, zelf nog niet getoetst | Hoog |

## 5. Aanbevolen algoritme (zoals gebouwd)

**Context.** `ctx = answerMode | skill | device [| setBucket]`; terugval op `answerMode | device` bij n < 15; onder 5 metingen is B het gemiddelde van de ln(RT)'s in die context inclusief de huidige.

**Residu.** Correct: r = clip(ln RT − B, −0,8, 1,0) + 0,3·[typfout] + km-straf, max 1,2. Fout of verwisselbaar: r = 1,2.

**Delay-correctie.** s(Δd) = min(0,8; 0,12·log₂(1 + Δd)); r_adj = r − s.

**Gewicht.** w = w_vorm · w_verif · w_rec · w_gok; fout: w = 1 (0,7 bij klikken op touchscreen). w_vorm: snelheidstest/typen 0,9; zelf 0,7; mix 0,6; lijst 0,3; klik 0,6; hoofdstad-klik 0,4; Alles of niets per stap 0,6; Kwartet alleen fouten met 0,5. RT ongeldig (tabblad verborgen, spiekbrief open, < 250 ms, > max(15 s, 6·e^B)): alleen een fout wordt geboekt.

**Itemupdate.** m₀ = 0,5·c_land; α = max(1/(n + 2), 0,2); m ← m + α·w·(r_adj − m); n ← min(n + w, 20); koude meting: dag ← vandaag, legacy-flag weg.

**Need en gewicht.** need = m + s(Δd_nu) + 0,4/√(n + 1); geautomatiseerd: need = −1; weight = exp(λ·clip(need, −1, 1)) met λ = ln(5)/2; ≥ 28 dagen niet gezien: weight = 4·√5.

**Afstand.** g = min(4, ⌊N/3⌋), κ = max(2, N/4); f = 0 binnen g, daarna 1 − e^(−(k−g)/κ); hetzelfde land nooit twee keer achter elkaar, ook niet over vaardigheden heen; fout terug na g_fout = min(3, N − 1).

**Sessie.** Q = clamp(round(1,5·N·min(S, 2)), 15, 40) met S het aantal vaardigheden; een keten (Alles of niets) of een set (Kwartet) is één vraag.

**Rekenvoorbeelden** (B = ln 1500, typen): zie `tests/tempo.test.mjs`.

## 6. Eenvoudigere variant
Per item alleen het laatste koude residu en de dag; drie bakken (traag > 0,2 of laatste fout; snel < −0,2); gewichten 4/2/1; ≥ 21 dagen niet gemeten één bak omhoog; gewogen trekking met harde afstand; fouten terug na 3 vragen.

## 7. Onzekerheden
Goed onderzocht: RT bij correcte antwoorden voorspelt het volgende antwoord (Papoušek et al., 2015); adaptieve spreiding met RT verslaat vaste schema's (Mettler et al., 2016); spacing (Rohrer et al., 2005; Rawson & Dunlosky, 2011); gokcorrectie. Afgeleid: delay-correctie via ACT-R, partiële overdracht, koude metingen. Eigen inschatting: vrijwel alle getallen (R, β, c, w_vorm, T_max, residugrenzen, typfoutstraf). Tegenstrijdigheden: Pelánek (2018) vs. Mettler over de waarde van RT; ACT-R vs. Benjamin/Pyc & Rawson over "traag = zwak"; power law vs. exponentieel; overlearning. Grootste gat: geen studie naar RT-gebaseerde volgorde bij bijna perfecte beheersing.

## 8. Antwoorden op de vervolgvragen van de programmeur

1. Een fout weegt 1,0, los van de antwoordvorm; bij klikvormen op een touchscreen 0,7. Een fout telt ook als de RT ongeldig was.
2. B₀: zelf-direct ln(2000); meerkeuze ln(1500 + 350·log₂(k+1)); hoofdstad aanklikken ln(3000). Belangrijker: opwarmregel, onder 5 metingen is B het gemiddelde inclusief de huidige.
3. Plafond: buffer van 50 koude tijden (ms/10), P10 = 5e kleinste; minimaal 30 koude correcte metingen in die context; 2 koude sessies per item blijven gelden.
4. Geschiedenis: "Op tempo" voorlopig weglaten.
5. Alles of niets: fout boeken op de skill van de stap die misging, geen aparte skill. Kwartet: alleen fouten bij de eerste poging, gewicht 0,5.
6. Lijstvormen: bucket op k (zichtbare lijst). Naam → aanklikken: bucket op N. Beide loggen.
7. Legacy: geen extra bonus; begrens de legacy-bijdrage tot n ≤ 1,5; wis het flag bij de eerste zuivere koude meting; legacy-items uitsluiten van de plafondstatus en van de evaluatie.
8. Q = clamp(round(1,5·N·min(S, 2)), 15, 40); in g en κ blijft N het aantal landen.
9. Evaluatie: toewijzing nu inbouwen (hash(account + item) mod 2, arm loggen), controleconditie achter een feature flag (`P.control`) en pas na 2–3 weken aanzetten; daarna de parameters niet meer veranderen.

## 9. Bronnen

- Benjamin, A. S., Bjork, R. A., & Schwartz, B. L. (1998). The mismeasure of memory: When retrieval fluency is misleading as a metamnemonic index. *JEP: General, 127*(1), 55–68. https://doi.org/10.1037/0096-3445.127.1.55
- Bjork, R. A., & Bjork, E. L. (1992). A new theory of disuse and an old theory of stimulus fluctuation. In *From learning processes to cognitive processes* (Vol. 2, pp. 35–67). Erlbaum.
- Dunlosky, J., & Rawson, K. A. (2012). Overconfidence produces underachievement. *Learning and Instruction, 22*, 271–280.
- Fitts, P. M. (1954). The information capacity of the human motor system in controlling the amplitude of movement. *JEP, 47*(6), 381–391.
- Heathcote, A., Brown, S., & Mewhort, D. J. K. (2000). The power law repealed. *Psychonomic Bulletin & Review, 7*(2), 185–207. https://doi.org/10.3758/BF03212979
- Hick, W. E. (1952). On the rate of gain of information. *QJEP, 4*(1), 11–26. https://doi.org/10.1080/17470215208416600
- Hyman, R. (1953). Stimulus information as a determinant of reaction time. *JEP, 45*(3), 188–196. https://doi.org/10.1037/h0056940
- Kahana, M. J. (2002). Associative symmetry and memory theory. *Memory & Cognition, 30*(6), 823–840. https://doi.org/10.3758/BF03195769
- Klinkenberg, S., Straatemeier, M., & van der Maas, H. L. J. (2011). Computer adaptive practice of Maths ability. *Computers & Education, 57*(2), 1813–1824. https://doi.org/10.1016/j.compedu.2011.02.003
- Lindsey, R. V., Shroyer, J. D., Pashler, H., & Mozer, M. C. (2014). Improving students' long-term knowledge retention through personalized review. *Psychological Science, 25*(3), 639–647. https://doi.org/10.1177/0956797613504302
- Logan, G. D. (1988). Toward an instance theory of automaticity. *Psychological Review, 95*(4), 492–527. https://doi.org/10.1037/0033-295X.95.4.492
- Maris, G., & van der Maas, H. (2012). Speed-accuracy response models. *Psychometrika, 77*(4), 615–633. https://doi.org/10.1007/s11336-012-9288-y
- Mettler, E., Massey, C. M., & Kellman, P. J. (2011). Improving adaptive learning technology through the use of response times. *Proceedings of CogSci 33*. https://escholarship.org/uc/item/2xs4n8wz
- Mettler, E., Massey, C. M., & Kellman, P. J. (2016). A comparison of adaptive and fixed schedules of practice. *JEP: General, 145*(7), 897–917. https://doi.org/10.1037/xge0000170
- Mettler, E., Massey, C. M., El-Ashmawy, A. K., & Kellman, P. J. (2020). Adaptive vs. fixed spacing of learning items. *Proceedings of CogSci 2020*.
- Pan, S. C., & Rickard, T. C. (2018). Transfer of test-enhanced learning. *Psychological Bulletin, 144*(7), 710–756. https://doi.org/10.1037/bul0000151
- Papoušek, J., Pelánek, R., & Stanislav, V. (2014). Adaptive practice of facts in domains with varied prior knowledge. *EDM 2014*, 6–13.
- Papoušek, J., Pelánek, R., Řihák, J., & Stanislav, V. (2015). An analysis of response times in adaptive practice of geography facts. *EDM 2015*, 562–563.
- Papoušek, J., Stanislav, V., & Pelánek, R. (2016). Impact of question difficulty on engagement and learning. *ITS 2016*, 267–272. https://doi.org/10.1007/978-3-319-39583-8_28
- Pavlik, P. I., & Anderson, J. R. (2008). Using a model to compute the optimal schedule of practice. *JEP: Applied, 14*(2), 101–117. https://doi.org/10.1037/1076-898X.14.2.101
- Pelánek, R. (2018). Exploring the utility of response times and wrong answers for adaptive learning. *Learning@Scale 2018*. https://doi.org/10.1145/3231644.3231675
- Pelánek, R., Papoušek, J., Řihák, J., Stanislav, V., & Nižnan, J. (2017). Elo-based learner modeling for the adaptive practice of facts. *UMUAI*, 89–118. https://doi.org/10.1007/s11257-016-9185-7
- Pyc, M. A., & Rawson, K. A. (2009). Testing the retrieval effort hypothesis. *JML, 60*(4), 437–447. https://doi.org/10.1016/j.jml.2009.01.004
- Rawson, K. A., & Dunlosky, J. (2011). Optimizing schedules of retrieval practice for durable and efficient learning. *JEP: General, 140*(3), 283–302. https://doi.org/10.1037/a0023956
- Rawson, K. A., & Dunlosky, J. (2012). When is practice testing most effective? *Educational Psychology Review, 24*, 419–435. https://doi.org/10.1007/s10648-012-9203-1
- Řihák, J., & Pelánek, R. (2016). What is more important for student modeling: Domain structure or response times? *ITS 2016*, 451–452.
- Rohrer, D., Taylor, K., Pashler, H., Wixted, J. T., & Cepeda, N. J. (2005). The effect of overlearning on long-term retention. *Applied Cognitive Psychology, 19*(3), 361–374. https://doi.org/10.1002/acp.1083
- Rohrer, D., & Pashler, H. (2007). Increasing retention without increasing study time. *Current Directions in Psychological Science, 16*(4). https://doi.org/10.1111/j.1467-8721.2007.00500.x
- Sense, F., Behrens, F., Meijer, R. R., & van Rijn, H. (2015). Stability of individual parameters in a model of optimal fact learning. *ICCM 2015*, 136–141.
- Sense, F., Behrens, F., Meijer, R. R., & van Rijn, H. (2016). An individual's rate of forgetting is stable over time but differs across materials. *Topics in Cognitive Science, 8*(1), 305–321. https://doi.org/10.1111/tops.12183
- Settles, B., & Meeder, B. (2016). A trainable spaced repetition model for language learning. *ACL 2016*, 1848–1858. https://doi.org/10.18653/v1/P16-1174
- van der Velde, M., Sense, F., Borst, J., & van Rijn, H. (2021). Alleviating the cold start problem in adaptive learning using data-driven difficulty estimates. *Computational Brain & Behavior, 4*(2), 231–249. https://doi.org/10.1007/s42113-021-00101-6
- van Rijn, H., van Maanen, L., & van Woudenberg, M. (2009). Passing the test: Improving learning gains by balancing spacing and testing effects. *ICCM 2009*, 110–115.
- Wilschut, T., Sense, F., van der Velde, M., Fountas, Z., Maaß, S. C., & van Rijn, H. (2021). Benefits of adaptive learning transfer from typing-based learning to speech-based learning. *Frontiers in AI, 4*, 780131. https://doi.org/10.3389/frai.2021.780131
- Ye, J., Su, J., & Cao, Y. (2022). A stochastic shortest path algorithm for optimizing spaced repetition scheduling. *KDD 2022*. FSRS-formules uit de open-source documentatie (niet peer-reviewed).

Niet-wetenschappelijk: Duolingo-blog "How we learn how you learn"; RUG/edlab-pagina's over SlimStampen (+10–20%).
