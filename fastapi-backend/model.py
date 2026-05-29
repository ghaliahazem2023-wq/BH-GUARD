"""
Modèle Random Forest pour la détection de fraude BH Assurance.
Entraîné sur les données réelles de bh_assurance.sinistres.
"""
import os
import numpy as np
import joblib
from sklearn.ensemble import RandomForestClassifier
from typing import Dict, Any, List
from dotenv import load_dotenv

load_dotenv()

from database import get_all_sinistres

MODEL_PATH = os.path.join(os.path.dirname(__file__), "fraud_model.joblib")


# ─────────────────────────── Feature engineering ────────────────────────────

def _montant(d: Dict) -> float:
    v = d.get("MONTANT_EVALUATION")
    try:
        return float(v) if v is not None and str(v).strip() not in ("", "—", "None", "null") else 0.0
    except (ValueError, TypeError):
        return 0.0

def _deces(d: Dict) -> int:
    v = d.get("NOMBRE_DECES")
    try:
        return int(float(v)) if v is not None and str(v).strip() not in ("", "—", "None", "null") else 0
    except (ValueError, TypeError):
        return 0

def _blesses(d: Dict) -> int:
    v = d.get("NOMBRE_BLESSES")
    try:
        return int(float(v)) if v is not None and str(v).strip() not in ("", "—", "None", "null") else 0
    except (ValueError, TypeError):
        return 0

def _resp_t(d: Dict) -> int:
    return 1 if str(d.get("CODE_RESPONSABILITE") or "").strip().upper() == "T" else 0


def extract_features(s: Dict[str, Any]) -> np.ndarray:
    montant = _montant(s)
    deces   = _deces(s)
    blesses = _blesses(s)
    resp    = _resp_t(s)
    return np.array([
        min(montant / 500_000.0, 1.0),
        min(deces,   5) / 5.0,
        min(blesses, 10) / 10.0,
        float(resp),
        1.0 if montant >= 100_000 else 0.0,
        1.0 if montant >= 50_000  else 0.0,
        1.0 if deces > 0          else 0.0,
        1.0 if blesses > 1        else 0.0,
    ], dtype=float)


def score_regle(s: Dict[str, Any]) -> int:
    score = 0
    m = _montant(s)
    if   m >= 100_000: score += 40
    elif m >=  50_000: score += 30
    elif m >=  20_000: score += 20
    elif m >=  10_000: score += 10
    if _deces(s)   > 0: score += 30
    if _blesses(s) > 1: score += 15
    if _resp_t(s)  == 1: score += 15
    return min(score, 100)


# ─────────────────────────── Modèle ─────────────────────────────────────────

class FraudModel:

    def __init__(self):
        self.clf      : RandomForestClassifier | None = None
        self.is_ready : bool = False
        self._load_or_train()

    def _load_or_train(self):
        if os.path.exists(MODEL_PATH):
            self.clf      = joblib.load(MODEL_PATH)
            self.is_ready = True
            print("[Modele] Charge depuis le disque OK")
            return

        print("[Modele] Entrainement Random Forest sur donnees reelles...")
        rows = get_all_sinistres(limit=2000)

        if not rows:
            print("[Modele] Aucune donnee - modele de secours")
            self._train_on_synthetic()
            return

        X, y = [], []
        for r in rows:
            X.append(extract_features(r))
            y.append(1 if score_regle(r) >= 65 else 0)

        X = np.array(X)
        y = np.array(y)

        self.clf = RandomForestClassifier(
            n_estimators=200, max_depth=8, min_samples_leaf=5,
            random_state=42, n_jobs=-1, class_weight="balanced"
        )
        self.clf.fit(X, y)
        joblib.dump(self.clf, MODEL_PATH)

        suspects = y.sum()
        print(f"[Modèle] Entraîné ✅ — {len(X)} sinistres, {suspects} suspects ({suspects / len(X) * 100:.1f} %)")
        self.is_ready = True

    def _train_on_synthetic(self):
        X = np.array([
            [0.05, 0, 0, 0, 0, 0, 0, 0],
            [0.10, 0, 0, 0, 0, 0, 0, 0],
            [0.40, 0, 0.5, 0, 0, 1, 0, 1],
            [0.20, 0, 0, 1, 0, 0, 0, 0],
            [1.00, 0, 0, 1, 1, 1, 0, 0],
            [0.60, 1, 0, 0, 1, 1, 1, 0],
            [0.80, 0, 1, 1, 1, 1, 0, 1],
            [0.20, 0.2, 0.3, 0, 0, 0, 1, 1],
        ], dtype=float)
        y = np.array([0, 0, 0, 0, 1, 1, 1, 1])
        self.clf = RandomForestClassifier(n_estimators=50, random_state=42)
        self.clf.fit(X, y)
        self.is_ready = True

    def predict(self, data: Dict[str, Any]) -> Dict[str, Any]:
        feats = extract_features(data).reshape(1, -1)

        proba_ml  = self.clf.predict_proba(feats)[0][1] if self.is_ready else 0.0
        score_ml  = int(proba_ml * 100)
        score_reg = score_regle(data)
        score_final = min(int(score_ml * 0.6 + score_reg * 0.4), 100)

        est_suspect = score_final >= 75

        if   score_final >= 75: niveau = "CRITIQUE"
        elif score_final >= 40: niveau = "INVESTIGATION"
        else:                   niveau = "CONFORME"

        flags = self._flags(data)
        expli = self._explication(data, score_final, flags, niveau)
        reco  = self._recommandation(score_final)

        return {
            "num_sinistre"   : str(data.get("NUM_SINISTRE") or data.get("num_sinistre") or ""),
            "score_risque"   : score_final,
            "est_suspect"    : est_suspect,
            "niveau_risque"  : niveau,
            "flags_detectes" : flags,
            "explication_ia" : expli,
            "recommandation" : reco,
            "donnees_sinistre": {
                k: (v.isoformat() if hasattr(v, 'isoformat') else
                    float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else
                    str(v) if v is not None else "—")
                for k, v in data.items()
                if k not in ("num_sinistre",)
            }
        }

    def chat(self, num_sinistre, message, historique, sinistre_data):
        api_key = os.getenv("MISTRAL_API_KEY", "").strip()
        if api_key:
            resp = self._chat_mistral(num_sinistre, message, historique, sinistre_data, api_key)
            if resp:
                return resp
        return self._chat_regle(num_sinistre, message, sinistre_data)

    _USAGE_MAP = {
        "VP": "Véhicule Particulier",
        "VU": "Véhicule Utilitaire",
        "TC": "Transport en Commun",
        "TP": "Transport Public",
        "TM": "Transport de Marchandises",
        "AM": "Ambulance",
        "TR": "Tracteur",
        "EN": "Engin",
        "MT": "Motocyclette",
        "SP": "Véhicule de Sport",
    }

    def _disp(self, v: str) -> str:
        return "Non renseigné" if v == "—" else v

    def _fmt_montant(self, v: float) -> str:
        return f"{v:,.0f}" if v and v > 0 else "Non renseigné"

    def _get(self, data: Dict, *keys) -> str:
        for k in keys:
            v = data.get(k)
            if v is not None and str(v).strip() not in ("", "—", "None", "null"):
                return str(v).strip()
        return "—"

    def _fmt_date(self, v) -> str:
        if not v or str(v) == "—": return "—"
        return str(v).split("T")[0].split(" ")[0]

    def _chat_mistral(self, num, msg, hist, data, api_key) -> str | None:
        try:
            from mistralai import Mistral
            client = Mistral(api_key=api_key)

            montant     = _montant(data)
            nature      = self._get(data, "NATURE_SINISTRE",      "nature_sinistre")
            contrat     = self._get(data, "NUM_CONTRAT",           "num_contrat")
            type_sin    = self._get(data, "TYPE_SINISTRE",         "type_sinistre")
            lieu        = self._get(data, "LIEU_ACCIDENT",         "lieu_accident")
            gouvernorat = self._get(data, "GOUVERNORAT",           "gouvernorat")
            date_surv   = self._fmt_date(self._get(data, "DATE_SURVENANCE",  "date_survenance"))
            date_decl   = self._fmt_date(self._get(data, "DATE_DECLARATION", "date_declaration"))
            date_ouv    = self._fmt_date(self._get(data, "DATE_OUVERTURE",   "date_ouverture"))
            etat        = self._get(data, "LIB_ETAT_SINISTRE",    "lib_etat_sinistre")
            # ── usage : minuscule en premier (nom exact colonne SQL Server) ──
            usage_raw   = self._get(data, "usage", "USAGE", "LIB_USAGE")
            usage       = self._USAGE_MAP.get(usage_raw.upper(), usage_raw) if usage_raw != "—" else "—"
            code_type   = self._get(data, "CODE_TYPE_CONTRAT",    "code_type_contrat")
            annee       = self._get(data, "ANNEE_EXERCICE",        "annee_exercice")
            blesses     = _blesses(data)
            deces       = _deces(data)
            code_resp   = self._get(data, "CODE_RESPONSABILITE",  "code_responsabilite")
            cumul_reg   = self._get(data, "cumul_reglement",      "CUMUL_REGLEMENT")
            total_sap   = self._get(data, "Total_SAP_Final",      "total_sap_final", "TOTAL_SAP")

            # ── Debug ──
            print(f"[MISTRAL] usage_raw={usage_raw} | usage={usage} | contrat={contrat} | code_type={code_type}")

            score_ctx = data.get("score_risque")
            try:
                score = int(float(str(score_ctx))) if score_ctx is not None else score_regle(data)
            except (ValueError, TypeError):
                score = score_regle(data)

            niveau            = "CRITIQUE" if score >= 75 else "INVESTIGATION" if score >= 40 else "CONFORME"
            flags             = data.get("flags_detectes") or []
            flags_str         = ", ".join(flags) if isinstance(flags, list) and flags else "Aucun signal détecté"
            explication       = self._get(data, "explication_ia")
            decision          = self._get(data, "decision_agent")
            commentaire_agent = self._get(data, "commentaire_agent")

            delai_str = "Non renseigné"
            if date_surv != "—" and date_decl != "—":
                try:
                    from datetime import datetime as _dt
                    d1 = _dt.strptime(date_surv, "%Y-%m-%d")
                    d2 = _dt.strptime(date_decl, "%Y-%m-%d")
                    delai = (d2 - d1).days
                    delai_str = f"{delai} jour(s)" + (" ⚠️ déclaration tardive" if delai > 5 else " (dans les délais)")
                except Exception:
                    delai_str = "Non calculable"

            d = self._disp
            system = (
                f"Tu es VeriAI, l'Assistant IA Anti-Fraude de BH Assurance Tunisie.\n"
                f"Tu as accès aux données COMPLÈTES et VÉRIFIÉES du sinistre {num}.\n"
                f"RÈGLE ABSOLUE : Tu dois utiliser EXACTEMENT les valeurs fournies ci-dessous.\n"
                f"INTERDIT de dire 'information non disponible' ou 'je ne sais pas' si la valeur est présente.\n\n"
                f"══ 📋 IDENTIFICATION ══\n"
                f"N° Sinistre       : {num}\n"
                f"N° Contrat        : {d(contrat)}\n"
                f"Code Type Contrat : {d(code_type)}\n"
                f"Année Exercice    : {d(annee)}\n\n"
                f"══ 🚗 VÉHICULE & USAGE ══\n"
                f"Usage du véhicule : {d(usage)}\n"
                f"Code usage brut   : {usage_raw}\n"
                f"Type Sinistre     : {d(type_sin)}\n"
                f"Nature Sinistre   : {d(nature)}\n"
                f"État dossier      : {d(etat)}\n\n"
                f"══ 📍 LOCALISATION ══\n"
                f"Gouvernorat       : {d(gouvernorat)}\n"
                f"Lieu accident     : {d(lieu)}\n\n"
                f"══ 📅 DATES ══\n"
                f"Date survenance   : {d(date_surv)}\n"
                f"Date déclaration  : {d(date_decl)}\n"
                f"Date ouverture    : {d(date_ouv)}\n"
                f"Délai déclaration : {delai_str}\n\n"
                f"══ 💰 FINANCIER ══\n"
                f"Montant évaluation: {self._fmt_montant(montant)} TND\n"
                f"Cumul règlement   : {d(cumul_reg)} TND\n"
                f"Total SAP Final   : {d(total_sap)} TND\n"
                f"Responsabilité    : {d(code_resp)}\n\n"
                f"══ 🏥 VICTIMES ══\n"
                f"Nombre blessés    : {blesses}\n"
                f"Nombre décès      : {deces}\n\n"
                f"══ 🤖 ANALYSE IA ══\n"
                f"Score risque ML   : {score}%\n"
                f"Niveau            : {niveau}\n"
                f"Signaux détectés  : {flags_str}\n"
                f"Explication       : {d(explication)}\n\n"
                f"══ 👤 DÉCISION AGENT ══\n"
                f"Décision          : {d(decision)}\n"
                f"Commentaire       : {d(commentaire_agent)}\n\n"
                f"══ EXEMPLES DE RÉPONSES ATTENDUES ══\n"
                f"Si on demande 'usage' ou 'véhicule' → répondre : 'L'usage du véhicule est {d(usage)} (code: {usage_raw})'\n"
                f"Si on demande 'contrat' → répondre : 'N° Contrat {d(contrat)}, type {d(code_type)}'\n"
                f"Si on demande 'date' → répondre avec date_surv={d(date_surv)}, date_decl={d(date_decl)}, délai={delai_str}\n"
                f"Répondre toujours en français, de manière professionnelle et concise."
            )

            messages = [{"role": "system", "content": system}]
            for h in hist[-10:]:
                messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
            messages.append({"role": "user", "content": msg})

            resp = client.chat.complete(
                model="mistral-large-latest", messages=messages, max_tokens=1000
            )
            return resp.choices[0].message.content

        except Exception as exc:
            print(f"[Mistral] Erreur: {exc}")
            return None

    def _chat_regle(self, num, msg, data) -> str:
        print(f"[REGLE] Fallback règles — usage={data.get('usage')} | NUM_CONTRAT={data.get('NUM_CONTRAT')} | keys_sample={list(data.keys())[:10]}")

        ml      = msg.lower().strip()
        montant = _montant(data)
        nature  = self._get(data, "NATURE_SINISTRE",   "nature_sinistre")
        deces   = _deces(data)
        blesses = _blesses(data)
        resp    = _resp_t(data)
        etat    = self._get(data, "LIB_ETAT_SINISTRE", "lib_etat_sinistre")
        contrat = self._get(data, "NUM_CONTRAT",        "num_contrat")

        score_ctx = data.get("score_risque")
        try:
            score = int(float(str(score_ctx))) if score_ctx is not None else score_regle(data)
        except (ValueError, TypeError):
            score = score_regle(data)

        niveau = "CRITIQUE" if score >= 75 else "INVESTIGATION" if score >= 40 else "CONFORME"

        date_surv   = self._fmt_date(self._get(data, "DATE_SURVENANCE",     "date_survenance"))
        date_decl   = self._fmt_date(self._get(data, "DATE_DECLARATION",    "date_declaration"))
        gouvernorat = self._get(data, "GOUVERNORAT",         "gouvernorat")
        type_sin    = self._get(data, "TYPE_SINISTRE",       "type_sinistre")
        # ── usage : minuscule en premier (nom exact colonne SQL Server) ──
        usage       = self._get(data, "usage",               "USAGE",             "LIB_USAGE")
        code_type   = self._get(data, "CODE_TYPE_CONTRAT",   "code_type_contrat")
        annee       = self._get(data, "ANNEE_EXERCICE",       "annee_exercice")
        segment     = self._get(data, "SEGMENT",              "LIB_SEGMENT")
        puissance   = self._get(data, "PUISSANCE",            "PUISSANCE_VEHICULE")
        valeur      = self._get(data, "VALEUR_VENALE",        "VALEUR_VEHICULE")
        age_veh     = self._get(data, "AGE_VEHICULE")
        remorquage  = self._get(data, "MONTANT_REMORQUAGE_TOTAL", "MONTANT_REMORQUAGE")
        cumul_reg   = self._get(data, "cumul_reglement",      "CUMUL_REGLEMENT")
        code_resp   = self._get(data, "CODE_RESPONSABILITE",  "code_responsabilite")
        total_sap   = self._get(data, "Total_SAP_Final",      "total_sap_final",   "TOTAL_SAP")

        print(f"[REGLE] usage résolu={usage} | code_type={code_type} | contrat={contrat}")

        # ── Pourquoi ────────────────────────────────────────────────────────
        if any(w in ml for w in ["pourquoi", "why", "w 3leh", "3leh", "3lah",
                                   "expliquer", "explication", "fassarli", "fasser",
                                   "zid", "elaborate", "détailler"]):
            reasons = []
            if montant < 10_000:   reasons.append(f"montant faible ({montant:,.0f} TND)")
            elif montant < 20_000: reasons.append(f"montant modéré ({montant:,.0f} TND — +10 pts)")
            elif montant < 50_000: reasons.append(f"montant significatif ({montant:,.0f} TND — +20 pts)")
            elif montant < 100_000:reasons.append(f"montant élevé ({montant:,.0f} TND — +30 pts)")
            else:                  reasons.append(f"montant très élevé ({montant:,.0f} TND — +40 pts)")
            if deces == 0:   reasons.append("aucun décès déclaré (+0 pts)")
            else:            reasons.append(f"{deces} décès déclaré(s) (+30 pts)")
            if blesses <= 1: reasons.append("0 ou 1 blessé (+0 pts)")
            else:            reasons.append(f"{blesses} blessés (+15 pts)")
            if resp == 0:    reasons.append("pas de responsabilité totale (+0 pts)")
            else:            reasons.append("responsabilité totale déclarée (+15 pts)")
            return (
                f"**Pourquoi score {score}/100 pour le sinistre {num} ?**\n\n"
                + "\n".join(f"• {r}" for r in reasons)
                + f"\n\n**Total = {score}/100 — niveau {niveau}**. "
                + ("Ce profil ne présente pas d'anomalie majeure." if score < 40
                   else "Ce profil mérite une investigation.")
            )

        # ── Calcul ──────────────────────────────────────────────────────────
        if any(w in ml for w in ["calculé", "calcul", "comment", "algorithme",
                                   "modèle", "model", "random forest", "rf", "ia", "intelligence"]):
            return (
                "**Méthode de calcul du score de risque VeriAI :**\n\n"
                "Le score (0–100) combine deux composantes :\n\n"
                "**1. Règles métier (40%)**\n"
                "• Montant ≥ 100 000 TND → +40 pts\n"
                "• Montant ≥ 50 000 TND  → +30 pts\n"
                "• Montant ≥ 20 000 TND  → +20 pts\n"
                "• Montant ≥ 10 000 TND  → +10 pts\n"
                "• Décès déclaré(s)       → +30 pts\n"
                "• Blessés > 1            → +15 pts\n"
                "• Responsabilité totale  → +15 pts\n\n"
                "**2. Random Forest (60%)**\n"
                "Entraîné sur 2 000 sinistres réels de BH Assurance.\n\n"
                f"**Résultat : {score}/100 — {niveau}**"
            )

        # ── Rapport ─────────────────────────────────────────────────────────
        if any(w in ml for w in ["rapport", "audit", "report", "génère", "genere",
                                   "générer", "generer", "genera"]):
            flags = self._flags(data)
            return (
                f"**═══ RAPPORT D'AUDIT — Sinistre {num} ═══**\n\n"
                f"• **Nature**       : {nature}\n"
                f"• **Usage**        : {usage if usage != '—' else 'Non renseigné'}\n"
                f"• **Contrat**      : {contrat}\n"
                f"• **Montant**      : {montant:,.0f} TND\n"
                f"• **Blessés**      : {blesses}  |  **Décès** : {deces}\n"
                f"• **Responsab.**   : {'Totale' if resp else 'Non totale'}\n"
                f"• **État dossier** : {etat}\n"
                f"• **Score risque** : {score}/100 — {niveau}\n"
                f"• **Signaux**      : {', '.join(flags) if flags else 'Aucun'}\n\n"
                f"**► Recommandation :** {self._recommandation(score)}"
            )

        # ── Résumé ──────────────────────────────────────────────────────────
        if any(w in ml for w in ["résume", "resume", "résumé", "points clés", "points cles",
                                   "clé", "summary", "synthèse", "synthese", "résumer"]):
            return (
                f"**Résumé — Sinistre {num}**\n\n"
                f"Sinistre de nature **{nature}** (contrat {contrat}), "
                f"montant évalué **{montant:,.0f} TND**. "
                + (f"**{deces} décès** et " if deces > 0 else "")
                + (f"**{blesses} blessé(s)**. " if blesses > 0 else "")
                + f"Usage véhicule : **{usage if usage != '—' else 'Non renseigné'}**. "
                f"État : **{etat}**. Score : **{score}/100 ({niveau})**.\n\n"
                f"**Action :** {self._recommandation(score)}"
            )

        # ── Éléments à vérifier ─────────────────────────────────────────────
        if any(w in ml for w in ["vérifier", "verifier", "priorité", "priorite",
                                   "éléments", "elements", "contrôler", "controle",
                                   "checker", "check"]):
            items = []
            if montant >= 20_000: items.append(f"Justificatifs du montant ({montant:,.0f} TND)")
            if deces > 0:         items.append(f"Actes de décès ({deces} décès)")
            if blesses > 0:       items.append(f"Rapports médicaux ({blesses} blessé(s))")
            if resp:              items.append("Rapport de police (responsabilité totale)")
            items += [
                "Cohérence entre date de survenance et date de déclaration",
                "Antécédents sinistres du titulaire du contrat",
                "Validité et ancienneté du contrat"
            ]
            return "**Éléments à vérifier en priorité :**\n" + "\n".join(f"• {i}" for i in items)

        # ── Véhicule / usage / contrat ──────────────────────────────────────
        if any(w in ml for w in ["véhicule", "vehicule", "voiture", "moto", "puissance",
                                   "valeur", "age", "âge", "marque", "modèle",
                                   "contrat", "usage", "type contrat", "chneya"]):
            parts = []
            if usage     != "—": parts.append(f"Usage du véhicule : **{usage}**")
            if code_type != "—": parts.append(f"Type de contrat   : **{code_type}**")
            if contrat   != "—": parts.append(f"N° Contrat        : **{contrat}**")
            if puissance != "—": parts.append(f"Puissance         : **{puissance} CV**")
            if valeur    != "—": parts.append(f"Valeur vénale     : **{valeur} TND**")
            if age_veh   != "—": parts.append(f"Âge du véhicule   : **{age_veh} an(s)**")
            if segment   != "—": parts.append(f"Segment           : **{segment}**")
            if parts:
                return "**Informations véhicule / contrat :**\n" + "\n".join(f"• {p}" for p in parts)
            return (
                f"Usage du véhicule : **{usage if usage != '—' else 'Non renseigné'}** | "
                f"Type contrat : **{code_type if code_type != '—' else 'Non renseigné'}** | "
                f"N° Contrat : **{contrat if contrat != '—' else 'Non renseigné'}**"
            )

        # ── Règlement / frais ────────────────────────────────────────────────
        if any(w in ml for w in ["remorquage", "frais", "rembours", "règlement",
                                   "reglement", "cumul", "total", "sap", "payé"]):
            parts = []
            if remorquage != "—": parts.append(f"Montant remorquage : **{remorquage} TND**")
            if cumul_reg  != "—": parts.append(f"Cumul règlement    : **{cumul_reg} TND**")
            if total_sap  != "—": parts.append(f"Total SAP final    : **{total_sap} TND**")
            if parts: return "**Montants réglés :**\n" + "\n".join(f"• {p}" for p in parts)
            return "Les données de règlement ne sont pas disponibles pour ce sinistre."

        # ── Type ────────────────────────────────────────────────────────────
        if any(w in ml for w in ["type", "code", "catégorie", "categorie",
                                   "corporel", "matériel", "mixte"]):
            parts = []
            if type_sin  != "—": parts.append(f"Type de sinistre    : **{type_sin}**")
            if nature    != "—": parts.append(f"Nature              : **{nature}**")
            if code_resp != "—": parts.append(f"Code responsabilité : **{code_resp}**")
            if parts: return "\n".join(f"• {p}" for p in parts)

        # ── Tout ────────────────────────────────────────────────────────────
        if any(w in ml for w in ["tout", "all", "kol", "koll", "liste", "info",
                                   "données", "donnees", "disponible", "connais", "sait"]):
            available = []
            if contrat     != "—": available.append(f"Contrat : {contrat}")
            if usage       != "—": available.append(f"Usage véhicule : {usage}")
            if code_type   != "—": available.append(f"Type contrat : {code_type}")
            if nature      != "—": available.append(f"Nature : {nature}")
            if type_sin    != "—": available.append(f"Type : {type_sin}")
            if montant     >   0 : available.append(f"Montant : {montant:,.0f} TND")
            if date_surv   != "—": available.append(f"Date accident : {date_surv}")
            if date_decl   != "—": available.append(f"Date déclaration : {date_decl}")
            if gouvernorat != "—": available.append(f"Gouvernorat : {gouvernorat}")
            if etat        != "—": available.append(f"État : {etat}")
            if deces       >   0 : available.append(f"Décès : {deces}")
            if blesses     >   0 : available.append(f"Blessés : {blesses}")
            if code_resp   != "—": available.append(f"Responsabilité : {code_resp}")
            if cumul_reg   != "—": available.append(f"Cumul règlement : {cumul_reg} TND")
            if not available:
                return f"Aucune donnée enrichie disponible pour le sinistre {num}."
            return (
                f"**Toutes les données — Sinistre {num} :**\n"
                + "\n".join(f"• {a}" for a in available)
                + f"\n\n**Score risque : {score}/100 — {niveau}**"
            )

        # ── Score ────────────────────────────────────────────────────────────
        if any(w in ml for w in ["score", "risque", "fraude", "suspect", "niveau",
                                   "faible", "bas", "élevé"]):
            return (
                f"Le sinistre **{num}** obtient un score de **{score}/100 — {niveau}**. "
                + ("Une investigation approfondie est requise." if score >= 65
                   else "Ce profil est dans les normes habituelles.")
            )

        # ── Montant ──────────────────────────────────────────────────────────
        if any(w in ml for w in ["montant", "somme", "évaluation", "argent",
                                   "prix", "coût", "cout", "tnd", "dinars"]):
            return (
                f"Le montant évalué pour le sinistre **{num}** est de **{montant:,.0f} TND**. "
                + ("Montant très élevé — facteur de risque majeur." if montant >= 50_000
                   else f"Montant {'modéré' if montant >= 10_000 else 'faible'}.")
            )

        # ── Nature ───────────────────────────────────────────────────────────
        if any(w in ml for w in ["nature", "corporel", "assistance", "matériel", "vol"]):
            return f"La nature de ce sinistre est **{nature}** (contrat n° {contrat})."

        # ── État ─────────────────────────────────────────────────────────────
        if any(w in ml for w in ["état", "etat", "statut", "situation", "clos", "ouvert"]):
            return f"L'état actuel du sinistre **{num}** est : **{etat}**."

        # ── Décision ─────────────────────────────────────────────────────────
        if any(w in ml for w in ["décision", "decision", "action", "faire",
                                   "recommandation", "recommande", "procéder"]):
            return self._recommandation(score)

        # ── Date ─────────────────────────────────────────────────────────────
        if any(w in ml for w in ["wa9tech", "quand", "when", "date", "survenance",
                                   "déclaration", "déclaré", "survenu", "passé", "arrivé"]):
            parts = []
            if date_surv != "—": parts.append(f"Date de l'accident (survenance) : **{date_surv}**")
            if date_decl != "—": parts.append(f"Date de déclaration              : **{date_decl}**")
            if date_surv != "—" and date_decl != "—":
                try:
                    from datetime import datetime
                    d1 = datetime.strptime(date_surv, "%Y-%m-%d")
                    d2 = datetime.strptime(date_decl, "%Y-%m-%d")
                    delai = (d2 - d1).days
                    parts.append(f"Délai de déclaration : **{delai} jour(s)**"
                                  + (" ⚠️ tardive" if delai > 5 else ""))
                except: pass
            if parts: return "\n".join(parts)
            return "Les dates ne sont pas disponibles pour ce sinistre."

        # ── Lieu ─────────────────────────────────────────────────────────────
        if any(w in ml for w in ["win", "où", "lieu", "location", "adresse",
                                   "gouvernorat", "ville", "région", "region"]):
            if gouvernorat != "—":
                return f"Le sinistre **{num}** est localisé dans le gouvernorat : **{gouvernorat}**."
            return f"Le gouvernorat n'est pas disponible pour le sinistre **{num}**."

        # ── Décès ────────────────────────────────────────────────────────────
        if any(w in ml for w in ["décès", "deces", "mort", "victime", "tué"]):
            return (f"**{deces} décès déclaré(s)** pour ce sinistre." if deces > 0
                    else "Aucun décès déclaré pour ce sinistre.")

        # ── Blessés ──────────────────────────────────────────────────────────
        if any(w in ml for w in ["blessé", "blesse", "blessure", "blessés"]):
            return (f"**{blesses} blessé(s)** déclaré(s) pour ce sinistre." if blesses > 0
                    else "Aucun blessé déclaré pour ce sinistre.")

        # ── Default ──────────────────────────────────────────────────────────
        return (
            f"Pour le sinistre **{num}** (nature: {nature}, montant: {montant:,.0f} TND, "
            f"score: {score}/100), je peux :\n"
            "• Expliquer **pourquoi** ce score\n"
            "• Détailler **comment** il est calculé\n"
            "• Générer un **rapport d'audit**\n"
            "• Lister les **éléments à vérifier**\n"
            "• Donner les infos **véhicule / contrat / usage**\n"
            "• **Résumer** les points clés du dossier"
        )

    def _flags(self, data: Dict) -> List[str]:
        flags   = []
        montant = _montant(data)
        deces   = _deces(data)
        blesses = _blesses(data)
        resp    = str(data.get("CODE_RESPONSABILITE") or "").strip().upper()

        if   montant > 500_000: flags.append(f"Montant exceptionnel ({montant:,.0f} TND)")
        elif montant > 200_000: flags.append(f"Montant très élevé ({montant:,.0f} TND)")
        elif montant > 100_000: flags.append(f"Montant élevé ({montant:,.0f} TND)")
        elif montant >  50_000: flags.append(f"Montant suspect ({montant:,.0f} TND)")
        elif montant >  20_000: flags.append(f"Montant significatif ({montant:,.0f} TND)")

        if   deces >= 3: flags.append(f"{int(deces)} décès déclarés")
        elif deces >= 1: flags.append(f"{int(deces)} décès déclaré(s)")

        if   blesses >= 5: flags.append(f"{int(blesses)} blessés déclarés (nombre élevé)")
        elif blesses >= 3: flags.append(f"{int(blesses)} blessés déclarés")
        elif blesses >= 1: flags.append(f"{int(blesses)} blessé(s) déclaré(s)")

        if resp in ("T", "TOTALE", "100"):
            flags.append("Responsabilité totale déclarée (100%)")
        elif resp in ("P", "PARTIELLE", "50"):
            flags.append("Responsabilité partielle déclarée")

        date_surv = data.get("DATE_SURVENANCE") or data.get("date_survenance")
        date_decl = data.get("DATE_DECLARATION") or data.get("date_declaration")
        if date_surv and date_decl:
            try:
                from datetime import datetime
                def _pd(v):
                    s = str(v).strip().split("T")[0].split(" ")[0]
                    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
                        try: return datetime.strptime(s, fmt)
                        except: pass
                    return None
                d1, d2 = _pd(date_surv), _pd(date_decl)
                if d1 and d2:
                    delai = (d2 - d1).days
                    if   delai > 90: flags.append(f"Déclaration très tardive ({delai} jours)")
                    elif delai > 30: flags.append(f"Déclaration tardive ({delai} jours)")
                    elif delai > 15: flags.append(f"Déclaration différée ({delai} jours)")
            except Exception:
                pass

        cumul_raw = data.get("cumul_reglement") or data.get("CUMUL_REGLEMENT")
        if cumul_raw is not None and montant > 0:
            try:
                cumul = float(cumul_raw)
                if cumul > 0:
                    ratio = cumul / montant
                    if   ratio > 2.0:
                        flags.append(f"Règlement très suspect ({cumul:,.0f} TND vs {montant:,.0f} TND évalué)")
                    elif ratio > 1.5:
                        flags.append(f"Règlement suspect ({cumul:,.0f} TND vs {montant:,.0f} TND évalué)")
                    elif ratio < 0.3:
                        flags.append(f"Sous-règlement anormal ({cumul:,.0f} TND vs {montant:,.0f} TND évalué)")
            except (ValueError, TypeError):
                pass

        return flags

    def _explication(self, data, score, flags, niveau):
        num     = data.get("NUM_SINISTRE") or data.get("num_sinistre") or "?"
        nature  = data.get("NATURE_SINISTRE") or "Non précisé"
        montant = _montant(data)
        return (
            f"Analyse du sinistre {num} — Score {score}/100 ({niveau}). "
            f"Nature: {nature} | Montant: {montant:,.0f} TND. "
            f"Facteurs: {'; '.join(flags) if flags else 'aucun signal majeur'}. "
            f"{'Forte probabilité de fraude.' if score >= 65 else 'Profil dans les normes.'}"
        )

    def _recommandation(self, score: int) -> str:
        if   score >= 75: return "INVESTIGATION REQUISE — Dossier suspect, demander pièces justificatives."
        elif score >= 40: return "SURVEILLANCE — Vérification rigoureuse des documents."
        else:             return "TRAITEMENT NORMAL — Aucune anomalie majeure."