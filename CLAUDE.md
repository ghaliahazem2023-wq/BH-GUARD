# BH-Guard — PDF Audit Report Feature

## OBJECTIVE
Generate a professional A4 PDF audit report for BH Guard anti-fraud platform.
The PDF must be downloaded directly (not opened in browser) using jsPDF + html2canvas.

## LIBRARIES INSTALLED
- jspdf (already installed)
- html2canvas (already installed)

## IMPORTS REQUIRED
```typescript
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
```

## REFERENCE DESIGN (the good one — replicate exactly)
The approved design looks like this (top to bottom):

### PAGE HEADER (every page)
- Top bar: date/time left | "Rapport Audit — {num_sinistre}" center | page number right
- Font: small gray text, 8px

### MAIN HEADER
- BH logo (assets/logo-bh1.png) left aligned
- Title "RAPPORT D'AUDIT ANTI-FRAUDE" bold navy
- Subtitle "BH Assurance Tunisie — Système BH Guard" small gray
- Right side box: Réf, Date, Agent, N° Sinistre — right aligned small text

### SCORE BAND (colored border box)
- Red bordered box for CRITIQUE, orange for MODÉRÉ, green for CONFORME
- Contains: "CRITIQUE | Score de risque : 87/100 | Niveau de risque évalué par VeriAI"
- Background: light red/orange/green tint

### SCORE DETAILS (below score band)
- Score circle left: big % number, "SCORE GLOBAL" label, colored border
- Right side text lines:
  - "Score Formule (règles métier) — X%"
  - "Score ML (Random Forest) — X%"
  - "Score Global (2×Formule + ML) / 3 — X%"
  - "Formule : (2 × X + X) / 3 = X"

### SECTIONS (numbered, blue title with underline)
Each section: "N — TITLE" in blue uppercase + blue underline border

1 — IDENTIFICATION DU DOSSIER
  Grid 3 columns:
  - N° Sinistre | N° Contrat | Type contrat
  - Nature sinistre | Type sinistre | État dossier
  - Gouvernorat | Année exercice | Usage véhicule

2 — CHRONOLOGIE
  Grid 3 columns:
  - Date survenance | Date déclaration | Date ouverture
  - Lieu accident

3 — VOLET FINANCIER
  Grid 3 columns:
  - Montant évaluation (RED + large) | Cumul règlement | Moyenne base BH (3 736 TND)
  - Responsabilité | Ratio vs moyenne

4 — VICTIMES DÉCLARÉES
  Grid 2 columns:
  - Nombre de blessés | Nombre de décès

5 — SIGNAUX D'ALERTE DÉTECTÉS
  List with ⚠️ icon, each flag on its own line with left orange border

6 — ANALYSE VERIAI
  Text box with left blue border, light blue background
  Contains: explication_ia (NO markdown — strip ** ### etc)

7 — DÉCISION DE L'AGENT
  Colored box: green for CONFORME, red for FRAUDE, gray for pending
  Contains decision text + commentaire agent below (italic)

8 — RECOMMANDATION SYSTÈME
  Box with left border, contains recommandation text

### PAGE FOOTER (every page)
Left side:
- "BH Assurance Tunisie"
- "Système BH Guard — Détection de fraude assistée par IA"
- "Document confidentiel — Usage interne uniquement"
- "Généré le {date} par {agent}"

Right side (signature box):
- "Visa de l'agent anti-fraude" label
- Empty line (180px wide) for handwritten signature
- Agent name bold
- "Agent Anti-Fraude" role
- Date

Bottom center watermark:
- "CONFIDENTIEL — BH GUARD — USAGE INTERNE UNIQUEMENT"

## DATA SOURCES
```typescript
// For downloadAuditPDF() — current session sinistre
const r = this.resultat;            // ML result from /predict
const s = this.currentSinistreData; // raw DB data

// For downloadDecisionPDF(d) — historique decision
// Must call BOTH endpoints first:
const dbData = await http.get(`/sinistre/${d.num}`)           // raw DB fields
const result = await http.post('/predict', {NUM_SINISTRE: d.num}) // ML result

// Merge strategy:
const s = { ...dbData, ...(result?.donnees_sinistre || {}) }
```

## FIELD MAPPING (always try both cases)
```typescript
const get = (...keys: string[]) => {
  for (const k of keys) {
    const v = s[k];
    if (v !== null && v !== undefined &&
        String(v).trim() !== '' &&
        String(v).trim() !== '—') return String(v).trim();
  }
  return '—';
};

montant  = parseFloat(get('MONTANT_EVALUATION','montantEvaluation') || '0') || 0
nature   = get('NATURE_SINISTRE','natureSinistre')
gouv     = get('GOUVERNORAT','gouvernorat')
etat     = get('LIB_ETAT_SINISTRE','libEtatSinistre')
contrat  = get('NUM_CONTRAT','numContrat')
codeType = get('CODE_TYPE_CONTRAT','codeTypeContrat')
typeSin  = get('TYPE_SINISTRE','typeSinistre')
lieu     = get('LIEU_ACCIDENT','lieuAccident')
dateSurv = get('DATE_SURVENANCE','dateSurvenance')
dateDecl = get('DATE_DECLARATION','dateDeclaration')
dateOuv  = get('DATE_OUVERTURE','dateOuverture')
annee    = get('ANNEE_EXERCICE','anneeExercice')
usage    = get('usage','USAGE','LIB_USAGE')
cumul    = get('cumul_reglement','CUMUL_REGLEMENT','cumulReglement')
resp     = get('CODE_RESPONSABILITE','codeResponsabilite')
blesses  = get('NOMBRE_BLESSES','nombreBlesses')
deces    = get('NOMBRE_DECES','nombreDeces')
```

## COLORS
- Navy  : `#002B80`
- Blue  : `#0047CC`
- Red   : `#CC2229`
- Orange: `#F5A623`
- Green : `#16a34a`
- Gray  : `#64748b`

By risk level:
- CRITIQUE      (≥75%)  → `#CC2229`
- RISQUE MODÉRÉ (40-74%)→ `#F5A623`
- CONFORME      (<40%)  → `#16a34a`

## PDF GENERATION METHOD
```typescript
private async generatePDF(htmlContent: string, filename: string): Promise<void> {
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: -9999px; left: -9999px;
    width: 794px;
    background: white;
    font-family: Arial, sans-serif;
  `;
  container.innerHTML = htmlContent;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      width: 794,
      windowWidth: 794,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.98);
    const pdf     = new jsPDF('p', 'mm', 'a4');
    const pdfW    = pdf.internal.pageSize.getWidth();
    const pdfH    = pdf.internal.pageSize.getHeight();
    const imgH    = (canvas.height * pdfW) / canvas.width;

    let y = 0;
    let remaining = imgH;
    while (remaining > 0) {
      if (y > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, -y, pdfW, imgH);
      y         += pdfH;
      remaining -= pdfH;
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}
```

## MARKDOWN STRIPPING (MANDATORY)
```typescript
private stripMarkdown(text: string): string {
  return (text || '—')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g,     '$1')
    .replace(/#{1,6}\s/g,      '')
    .replace(/`(.+?)`/g,       '$1')
    .replace(/\n/g,            ' ');
}
```

## TWO FUNCTIONS NEEDED

### 1. downloadAuditPDF()
- Triggered from: "Rapport PDF" button in analyse result card
- Data from: `this.resultat` + `this.currentSinistreData`
- Filename: `Rapport-Audit-{num_sinistre}-{date}.pdf`
- Must be: `async downloadAuditPDF(): Promise<void>`

### 2. downloadDecisionPDF(d: any)
- Triggered from: PDF button in historique table rows
- Data from: GET `/sinistre/{d.num}` + POST `/predict`
- Filename: `Rapport-Decision-{d.num}-{date}.pdf`
- Must call `_generateDecisionPDF(d, dbData, result)`
- Must be: `async _generateDecisionPDF(...): Promise<void>`

## BACKEND ENDPOINT NEEDED
```python
# In main.py
@app.get("/sinistre/{num}")
def get_sinistre(num: str):
    from database import get_sinistre_by_num
    row = get_sinistre_by_num(num)
    if not row:
        raise HTTPException(status_code=404, detail="Sinistre non trouvé")
    return dict(row)
```

## HTML TEMPLATE RULES
- Width: exactly 794px (A4 at 96dpi)
- Font: Arial, 10px base
- `@page`: size A4, margin 12mm 14mm
- All styles inline or in `<style>` tag
- Logo: `<img src="http://localhost:4200/assets/logo-bh1.png">`
- NO external fonts, NO external CSS
- Score circle: pure CSS border-radius, no SVG
- Section titles: uppercase, blue, with blue bottom border
- Fields: label small gray uppercase + value bold black below
- Flags list: each flag with ⚠️ + left orange border
- Strip ALL markdown from explication_ia and recommandation

## WHAT NOT TO DO
- NEVER use `window.open()` or `window.print()` — use jsPDF only
- NEVER use Blob URL approach
- NEVER show markdown symbols (`**bold**`, `### headers`) in PDF
- NEVER hardcode data — always use `get()` helper
- NEVER forget to strip markdown from AI text fields
- NEVER use external libraries other than jspdf + html2canvas
