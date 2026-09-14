# NivTec Planungstool

Privates Lernprojekt zur Planung modularer Eventtechnik-Aufbauten (Bühnenpodeste, Tresen/Theken)
aus dem NivTec-Systempodest-Katalog, inspiriert von [nivteccalculator.evtp.de](https://nivteccalculator.evtp.de).

Aus Breite/Tiefe/Höhe und frei per Drag & Drop platzierten Podestplatten berechnet das Tool
automatisch die benötigten Füße, Verstrebungen und eine detaillierte Materialliste — inklusive
2D-Grundriss, 3D-Ansicht und Export als CSV/PNG/PPTX.

Alle Maße und Regeln sind recherchiert bzw. plausible Annahmen ohne Gewähr — keine offiziellen
NivTec-Preise oder Artikelnummern.

## Entwicklung

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Tests

```bash
npx tsc -b
npx vitest run
```
