# Utleie priskalkulator

En enkel, generisk web-kalkulator som leser priser fra `gebyrregulativ_2025.csv`, lar deg velge kombinasjoner og beregner pris, samt bygge en handlekurv med flere linjer.

# Demo

Eksempelet viser hvordan kalkulatoren fungerer for et komplekst utleiescenario.

[https://porticoestate.github.io/priskalkulator/](https://porticoestate.github.io/priskalkulator/)

## Filstruktur

- `index.html` – Brukergrensesnitt (valg, pris, handlekurv)
- `styles.css` – Stil for layout og tabell
- `script.js` – Logikk: CSV-lesing, parsing, valg, beregning, handlekurv
- `gebyrregulativ_2025.csv` – Prisdata (kommaseparert; ekstra kolonner ignoreres)

## Hvordan det fungerer

### Lese CSV

- CSV hentes i nettleseren og parses linje for linje.
- Parseren er tolerant: finner siste tallkolonne som «Sats», antar kolonnen før er «Enhet», og leter etter «Formål» blant kjente verdier (Alle, Andre, turneringer, barn 8-12 år), også når teksten inneholder ekstra komma.

### Valg og avhengigheter

- Rekkefølge: Hvor → Hva → Formål.
- «Hva» og «Formål» er låst inntil «Hvor» er valgt.
- Formål-listen avhenger kun av valgt «Hvor» (ikke av «Hva»).
- «Antall» settes automatisk til 1 hver gang du bytter «Hvor».
- Enhet (f.eks. «pr. time») vises først når «Hva» er valgt (skjules ellers).

### Beregning

- Først forsøkes eksakt match: Hvor + Hva + Formål.
- Fallback: Mangler eksakt match, brukes første treff for Hvor + Formål (merknad vises).
- Pris = Sats × Antall. Vises i norsk format, f.eks. `1 234,- kr`.

### Handlekurv

- «Legg til i handlekurv» legger gjeldende valg inn som en linje.
- Like linjer (samme Hvor, Hva, Formål, Enhet, Sats) slås sammen ved å øke antallet.
- Tabellen viser enhetssats, antall (redigerbart), linjetotal og knapp for å fjerne.
- Summen vises i tabellfoten. Sum og linjetotal brytes ikke til ny linje.
- «Tøm handlekurv» fjerner alle linjer.

## CSV-format og tips

- Forventet kolonnerekkefølge: `Hvor,Hva,Formål,Enhet,Sats` (resten ignoreres).
- Varianter som `pr. time`, `pr gang`, `Pr dag` aksepteres og vises som enhet når «Hva» er valgt.
- Innfører du nye «Formål»-verdier (utover Alle, Andre, turneringer, barn 8-12 år) i «rotete» CSV, kan du legge dem inn i listen `FORMAL_VALUES` i `script.js` for mest robust parsing.

## Bruk

- Plasser filene på en webserver (mappen ligger under `public_html`).
- Åpne `index.html` i nettleseren.
- Velg «Hvor» → «Hva» → «Formål», sett «Antall», og se pris. Legg til i handlekurv ved behov.

## Tilpasning

- Endre stil i `styles.css` (farger, typografi, tabelloppsett).
- Juster fallback-oppførsel i `calculate()` om du vil kreve eksakt match.
- Legg til flere felt/kolonner i CSV – parseren ignorerer ekstra kolonner.

## Feilsøking

- Ingen data: Sjekk at `gebyrregulativ_2025.csv` ligger i samme mappe og er tilgjengelig (CORS/filbane).
- Uventede «Hva»/«Formål»: Rens CSV eller utvid `FORMAL_VALUES` i `script.js`.
- Enhet vises ikke: Enhet vises bare etter at «Hva» er valgt (selv om fallback brukes).
