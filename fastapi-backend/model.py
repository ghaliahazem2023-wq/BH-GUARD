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

_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path=_ENV_PATH, override=True)
print(f"[INIT] .env chargé depuis : {_ENV_PATH}")
print(f"[INIT] MISTRAL_API_KEY présent: {bool(os.getenv('MISTRAL_API_KEY', '').strip())}")

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
        elif score_final >= 40: niveau = "RISQUE_MODÉRÉ"
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

    def analyze_sinistre_for_chat(self, s: dict) -> dict:
        """Pré-calcule score, flags causaux et recommandation pour le prompt Mistral."""
        from datetime import datetime as _dt

        montant = _montant(s)
        blesses = _blesses(s)
        deces   = _deces(s)
        resp    = str(s.get("CODE_RESPONSABILITE") or "").strip().upper()

        date_surv = str(s.get("DATE_SURVENANCE") or "")
        date_decl = str(s.get("DATE_DECLARATION") or "")

        MOYENNE = 3736.79

        # Délai déclaration
        delai_jours   = None
        delai_suspect = False
        try:
            d1 = _dt.strptime(date_surv[:10], "%Y-%m-%d")
            d2 = _dt.strptime(date_decl[:10], "%Y-%m-%d")
            delai_jours   = (d2 - d1).days
            delai_suspect = delai_jours > 30
        except Exception:
            pass

        # Score formule avec détail étape par étape (mêmes seuils que score_regle)
        score_details = []
        score_formule = 0

        if   montant >= 100_000:
            pts = 40; score_formule += pts
            score_details.append(f"Montant très élevé ({montant:,.0f} TND = {montant/MOYENNE:.1f}× la moyenne) → +{pts} pts")
        elif montant >=  50_000:
            pts = 30; score_formule += pts
            score_details.append(f"Montant élevé ({montant:,.0f} TND = {montant/MOYENNE:.1f}× la moyenne) → +{pts} pts")
        elif montant >=  20_000:
            pts = 20; score_formule += pts
            score_details.append(f"Montant modéré-élevé ({montant:,.0f} TND) → +{pts} pts")
        elif montant >=  10_000:
            pts = 10; score_formule += pts
            score_details.append(f"Montant légèrement élevé ({montant:,.0f} TND) → +{pts} pts")
        else:
            score_details.append(f"Montant normal ({montant:,.0f} TND ≈ moyenne {MOYENNE:,.0f} TND) → +0 pts")

        if deces > 0:
            pts = 30; score_formule += pts
            score_details.append(f"{deces} décès déclaré(s) → +{pts} pts")
        else:
            score_details.append("Aucun décès → +0 pts")

        if blesses > 1:
            pts = 15; score_formule += pts
            score_details.append(f"{blesses} blessés (> 1) → +{pts} pts")
        elif blesses == 1:
            score_details.append("1 blessé → +0 pts")
        else:
            score_details.append("Aucun blessé → +0 pts")

        if resp in ("T", "TOTALE", "100"):
            pts = 15; score_formule += pts
            score_details.append(f"Responsabilité totale ({resp}) → +{pts} pts")
        else:
            score_details.append(f"Responsabilité '{resp}' → +0 pts")

        if delai_suspect:
            score_details.append(f"⚠️ Délai déclaration : {delai_jours} jours (> 30) — signal d'alerte")
        elif delai_jours is not None:
            score_details.append(f"Délai déclaration : {delai_jours} jours (dans les délais) → +0 pts")

        score_formule = min(score_formule, 100)
        niv = "CRITIQUE" if score_formule >= 75 else "RISQUE MODÉRÉ" if score_formule >= 40 else "CONFORME"

        # Flags avec explication causale (les POURQUOI)
        flags_expliques = []

        if montant >= 50_000 and deces > 0:
            flags_expliques.append(
                f"🚨 COMBINAISON CRITIQUE : Montant {montant:,.0f} TND + {deces} décès → profil classique "
                f"de fraude corporelle gonflée. Les dossiers avec décès ET montant élevé sont 3× plus souvent frauduleux."
            )
        elif montant >= 100_000:
            flags_expliques.append(
                f"💰 MONTANT ANORMAL : {montant:,.0f} TND = {montant/MOYENNE:.0f}× la moyenne nationale ({MOYENNE:,.0f} TND). "
                f"Moins de 2% des sinistres dépassent ce seuil."
            )
        elif montant >= 50_000:
            flags_expliques.append(
                f"💰 MONTANT ÉLEVÉ : {montant:,.0f} TND = {montant/MOYENNE:.1f}× la moyenne — facteur de risque."
            )

        if deces > 0 and blesses > 0:
            flags_expliques.append(
                f"⚠️ GRAVITÉ COMBINÉE : {deces} décès + {blesses} blessés dans le même accident → "
                f"accident de masse suspect, vérifier rapport de police et témoignages."
            )
        elif deces > 0:
            flags_expliques.append(
                f"⚠️ DÉCÈS DÉCLARÉ : {deces} décès → actes de décès et rapport médico-légal obligatoires."
            )

        if delai_suspect:
            flags_expliques.append(
                f"⏰ DÉCLARATION TARDIVE : {delai_jours} jours entre survenance et déclaration "
                f"(seuil : 30 jours). Retard souvent utilisé pour préparer des faux documents."
            )
            if montant >= 50_000:
                flags_expliques.append(
                    f"🔗 LIEN MONTANT + DÉLAI : Montant élevé ({montant:,.0f} TND) déclaré tardivement "
                    f"→ suggère une préparation frauduleuse du dossier."
                )

        if resp in ("T", "TOTALE", "100") and deces > 0:
            flags_expliques.append(
                f"🔗 RESPONSABILITÉ TOTALE + DÉCÈS : combinaison à très haut risque — "
                f"vérifier la cohérence avec le rapport de police."
            )

        if not flags_expliques:
            flags_expliques.append("✅ Aucun signal d'alerte critique — profil dans les normes.")

        # Recommandation contextuelle
        if score_formule >= 75:
            recommandation = (
                f"🚨 BLOCAGE RECOMMANDÉ — Score {score_formule}/100 ({niv}). "
                f"Demander : rapport de police original, certificats médicaux, photos du sinistre, vérification des témoins."
            )
        elif score_formule >= 40:
            recommandation = (
                f"⚠️ INVESTIGATION — Score {score_formule}/100 ({niv}). "
                f"Vérifier les pièces justificatives avant toute indemnisation."
            )
        else:
            recommandation = (
                f"✅ VALIDATION POSSIBLE — Score {score_formule}/100 ({niv}). "
                f"Dossier conforme aux critères habituels."
            )

        return {
            "score_formule"  : score_formule,
            "score_details"  : score_details,
            "flags_expliques": flags_expliques,
            "recommandation" : recommandation,
            "delai_jours"    : delai_jours,
            "ratio_montant"  : round(montant / MOYENNE, 1) if MOYENNE else 0,
            "montant"        : montant,
            "blesses"        : blesses,
            "deces"          : deces,
            "niveau"         : niv,
        }

    def chat(self, num_sinistre, message, historique, sinistre_data):
        _key_debug = os.getenv("MISTRAL_API_KEY", "").strip()
        print(f"[DEBUG chat()] api_key='{_key_debug[:8] if _key_debug else 'VIDE'}' | len={len(_key_debug)} | is_ready={self.is_ready}")
        import re
        # Detect sinistre number mentioned in the message → fetch from DB + pre-calculate analysis
        match = re.search(r'\b(\d{8,13})\b', message)
        if match:
            from database import get_sinistre_complet
            found = get_sinistre_complet(match.group(1))
            if found:
                sinistre_data = dict(sinistre_data)
                analyse       = self.analyze_sinistre_for_chat(found)
                sinistre_data["sinistre_mentionne"] = dict(found)
                sinistre_data["num_mentionne"]      = match.group(1)
                sinistre_data["analyse_calculee"]   = analyse
                print(f"[VeriAI] sinistre {match.group(1)} trouvé — score_formule={analyse['score_formule']}/100 ({analyse['niveau']})")

        api_key = os.getenv("MISTRAL_API_KEY", "").strip()
        print(f"[VeriAI] api_key présent: {bool(api_key)} | len={len(api_key)}")
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
        return f"{v:.0f}" if v and v > 0 else "Non renseigné"

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
            import requests
            print(f"[MISTRAL] Appel API — model=mistral-large-latest")
            print(f"[MISTRAL] API key (5 premiers chars): {api_key[:5]}...")

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
            usage_raw   = self._get(data, "usage", "USAGE", "LIB_USAGE")
            usage       = self._USAGE_MAP.get(usage_raw.upper(), usage_raw) if usage_raw != "—" else "—"
            code_type   = self._get(data, "CODE_TYPE_CONTRAT",    "code_type_contrat")
            annee       = self._get(data, "ANNEE_EXERCICE",        "annee_exercice")
            blesses     = _blesses(data)
            deces       = _deces(data)
            code_resp   = self._get(data, "CODE_RESPONSABILITE",  "code_responsabilite")
            cumul_reg   = self._get(data, "cumul_reglement",      "CUMUL_REGLEMENT")
            total_sap   = self._get(data, "Total_SAP_Final",      "total_sap_final", "TOTAL_SAP")

            print(f"[MISTRAL] usage_raw={usage_raw} | usage={usage} | contrat={contrat} | code_type={code_type}")

            score_ctx = data.get("score_risque")
            try:
                score = int(float(str(score_ctx))) if score_ctx is not None else score_regle(data)
            except (ValueError, TypeError):
                score = score_regle(data)

            niveau            = "CRITIQUE" if score >= 75 else "RISQUE_MODÉRÉ" if score >= 40 else "CONFORME"
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

            # ── Stats globales (mode GENERAL) ──────────────────────────────
            stats       = data.get("stats_globales") or {}
            total_sin   = stats.get("total_sinistres", "—")
            avg_montant = stats.get("moyenne_montant", "—")
            top5        = stats.get("top_montants",    [])
            min5        = stats.get("min_montants",    [])
            par_gov_st  = stats.get("par_gouvernorat", [])
            par_nat_st  = stats.get("par_nature",      [])
            nb_dec      = data.get("nb_decisions", 0)
            nb_conf     = data.get("nb_conformes",  0)
            nb_fraud    = data.get("nb_fraudes",    0)
            taux_fraud  = data.get("taux_fraude",   "—")
            actif_num   = data.get("num_sinistre_actif")
            top_gov_str = ", ".join([
                f"{g.get('GOUVERNORAT','?')}({g.get('count','?')})"
                for g in par_gov_st[:5]
            ]) if par_gov_st else "—"
            nat_str = ", ".join([
                f"{n.get('NATURE_SINISTRE','?')}({n.get('count','?')})"
                for n in par_nat_st
            ]) if par_nat_st else "—"
            top5_str = "\n".join([
                f"  - {s.get('NUM_SINISTRE')}: {s.get('MONTANT_EVALUATION')} TND ({s.get('GOUVERNORAT')})"
                for s in top5
            ]) if top5 else "  — données non disponibles"
            min5_str = "\n".join([
                f"  - {s.get('NUM_SINISTRE')}: {s.get('MONTANT_EVALUATION')} TND ({s.get('GOUVERNORAT')})"
                for s in min5
            ]) if min5 else "  — données non disponibles"

            is_general = (num == "GENERAL")

            # Sinistre mentionné dans le message — analyse pré-calculée par Python
            s_men    = data.get("sinistre_mentionne", {})
            num_men  = data.get("num_mentionne", "")
            analyse  = data.get("analyse_calculee", {})
            bloc_men = ""
            if s_men:
                def _sf(k): return str(s_men.get(k) or "—").strip()
                cumul_p = _sf("cumul_paiements")
                nb_p    = _sf("nb_paiements")
                if analyse:
                    score_details_str   = "\n   ".join(analyse.get("score_details", []))
                    flags_expliques_str = "\n\n   ".join(analyse.get("flags_expliques", []))
                    bloc_men = (
                        f"\n══ DOSSIER {num_men} — ANALYSE PRÉCALCULÉE (utilise EXACTEMENT ces données) ══\n\n"
                        f"📋 PROFIL :\n"
                        f"Gouvernorat  : {_sf('GOUVERNORAT')}\n"
                        f"Nature       : {_sf('NATURE_SINISTRE')}\n"
                        f"État         : {_sf('LIB_ETAT_SINISTRE')}\n"
                        f"Contrat      : {_sf('NUM_CONTRAT')}\n"
                        f"Responsab.   : {_sf('CODE_RESPONSABILITE')}\n\n"
                        f"💰 VOLET FINANCIER :\n"
                        f"Montant évalué  : {analyse.get('montant', 0):,.0f} TND\n"
                        f"Moyenne base    : 3 736 TND\n"
                        f"Ratio           : {analyse.get('ratio_montant', 0)}× la moyenne\n"
                        f"Cumul paiements : {cumul_p} TND\n"
                        f"Nb paiements    : {nb_p}\n\n"
                        f"📅 TEMPOREL :\n"
                        f"Date survenance  : {_sf('DATE_SURVENANCE')}\n"
                        f"Date déclaration : {_sf('DATE_DECLARATION')}\n"
                        f"Délai            : {analyse.get('delai_jours', '—')} jours\n\n"
                        f"👥 VICTIMES :\n"
                        f"Décès   : {analyse.get('deces', 0)}\n"
                        f"Blessés : {analyse.get('blesses', 0)}\n\n"
                        f"🧮 SCORE FORMULE CALCULÉ = {analyse.get('score_formule', 0)}/100 ({analyse.get('niveau', '—')}) :\n"
                        f"   {score_details_str}\n\n"
                        f"⚠️ SIGNAUX D'ALERTE AVEC LIENS CAUSAUX :\n"
                        f"   {flags_expliques_str}\n\n"
                        f"🎯 RECOMMANDATION : {analyse.get('recommandation', '—')}\n\n"
                        f"INSTRUCTION : Présente cette analyse de façon FLUIDE et NARRATIVE.\n"
                        f"Explique les LIENS entre les signaux — pourquoi COMBINÉS ils sont suspects.\n"
                        f"Contextualise chaque chiffre. JAMAIS de liste 'je peux faire...'.\n"
                        f"JAMAIS de 'allez dans l'onglet Analyse'. Analyse directement ici.\n"
                    )
                else:
                    sc_fb = score_regle(s_men)
                    bloc_men = (
                        f"\n══ SINISTRE MENTIONNÉ ({num_men}) ══\n"
                        f"Gouvernorat : {_sf('GOUVERNORAT')} | Nature : {_sf('NATURE_SINISTRE')}\n"
                        f"Montant : {_sf('MONTANT_EVALUATION')} TND | Score formule : {sc_fb}/100\n"
                        f"Cumul paiements : {cumul_p} TND ({nb_p} paiement(s))\n"
                        f"Victimes : {_sf('NOMBRE_BLESSES')} blessés / {_sf('NOMBRE_DECES')} décès\n"
                        f"INSTRUCTION : Analyse avec structure 📋 PROFIL | 💰 FINANCIER | ⚠️ SIGNAUX | 🧮 SCORE | 🎯 RECO\n"
                    )

            REGLES_ANTI_HALLUCINATION = (
                "══ RÈGLES ABSOLUES — RESPECTER STRICTEMENT ══\n"
                "- Tu n'as accès QU'AUX données fournies explicitement dans ce contexte.\n"
                "- Tu NE DOIS JAMAIS inventer de noms de personnes, numéros de dossiers, montants, villes, dates "
                "ou toute autre donnée absente du contexte fourni.\n"
                "- Si une information demandée n'est pas disponible dans les données fournies, réponds : "
                "'Cette information n'est pas disponible dans les données actuelles.'\n"
                "- Ne complète JAMAIS un exemple fictif sauf si l'utilisateur le demande EXPLICITEMENT "
                "en précisant qu'il veut un exemple fictif/hypothétique.\n"
                "- Base TOUTES tes réponses uniquement sur les données présentes dans ce prompt. "
                "Aucune extrapolation, aucune invention.\n"
                "- Si le contexte est vide ou incomplet, dis-le à l'utilisateur au lieu d'halluciner.\n"
                "══════════════════════════════════════════════\n\n"
            )

            if is_general:
                system = (
                    REGLES_ANTI_HALLUCINATION +
                    f"Tu es VeriAI, l'Assistant IA Anti-Fraude de BH Assurance Tunisie.\n"
                    f"Tu es en MODE ASSISTANT GÉNÉRAL — tu peux répondre sur n'importe quel dossier ou statistique.\n\n"
                    f"══ STATISTIQUES GLOBALES BASE DE DONNÉES ══\n"
                    f"Total sinistres en base : {total_sin}\n"
                    f"Montant moyen évaluation: {avg_montant} TND\n"
                    f"Taux de fraude suspectée: {taux_fraud}%\n"
                    f"Top gouvernorats        : {top_gov_str}\n"
                    f"Natures sinistres       : {nat_str}\n\n"
                    f"TOP 5 MONTANTS LES PLUS ÉLEVÉS :\n{top5_str}\n\n"
                    f"TOP 5 MONTANTS LES PLUS BAS :\n{min5_str}\n\n"
                    f"══ SESSION AGENT ══\n"
                    f"Décisions prises : {nb_dec}  |  Validés : {nb_conf}  |  Bloqués : {nb_fraud}\n"
                    f"{'Dossier actif en analyse : ' + str(actif_num) if actif_num else 'Aucun dossier actif'}\n"
                    f"{bloc_men}\n"
                    f"══ INSTRUCTIONS STRICTES ══\n"
                    f"1. Réponds TOUJOURS en français professionnel.\n"
                    f"2. JAMAIS de liste 'je peux faire...' — réponds DIRECTEMENT.\n"
                    f"3. JAMAIS de bullet points génériques — analyse concrète uniquement.\n"
                    f"4. Si on te demande un sinistre et que tu as ses données → analyse-le DIRECTEMENT\n"
                    f"   avec cette structure : 📋 PROFIL | 💰 FINANCIER | ⚠️ SIGNAUX | 🧮 SCORE | 🎯 RECO\n"
                    f"5. Données financières : donne montant exact + comparaison moyenne 3 736 TND + ratio %\n"
                    f"6. Connecte TOUJOURS les signaux entre eux (montant + décès + délai = analyse croisée).\n"
                    f"7. Calcul score : détaille Score Formule + Score ML + (2×F + ML)/3 = Score Global\n"
                    f"8. La décision finale appartient toujours à l'agent humain.\n"
                    f"9. Réponds de manière COMPLÈTE sans jamais t'arrêter à mi-chemin. Si on demande plusieurs dossiers, TOUS doivent être analysés entièrement. Emojis avec modération.\n"
                    f"10. Si l'agent écrit 'zid', 'elaborate', 'fassarli', 'plus de détails', 'approfondis' → "
                    f"développe l'analyse PRÉCÉDENTE avec plus de profondeur et de liens causaux. "
                    f"Ne répète pas — ajoute de nouvelles perspectives et connexions."
                )
            else:
                system = (
                    REGLES_ANTI_HALLUCINATION +
                    f"Tu es VeriAI, l'Assistant IA Anti-Fraude de BH Assurance Tunisie.\n"
                    f"Tu as accès aux données COMPLÈTES et VÉRIFIÉES du sinistre {num}.\n"
                    f"RÈGLE ABSOLUE : Tu dois utiliser EXACTEMENT les valeurs fournies ci-dessous. Zéro invention.\n"
                    f"INTERDIT de dire 'information non disponible' ou 'je ne sais pas' si la valeur est présente.\n\n"
                    f"══ IDENTIFICATION ══\n"
                    f"N° Sinistre       : {num}\n"
                    f"N° Contrat        : {d(contrat)}\n"
                    f"Code Type Contrat : {d(code_type)}\n"
                    f"Année Exercice    : {d(annee)}\n\n"
                    f"══ VÉHICULE & USAGE ══\n"
                    f"Usage du véhicule : {d(usage)}\n"
                    f"Code usage brut   : {usage_raw}\n"
                    f"Type Sinistre     : {d(type_sin)}\n"
                    f"Nature Sinistre   : {d(nature)}\n"
                    f"État dossier      : {d(etat)}\n\n"
                    f"══ LOCALISATION ══\n"
                    f"Gouvernorat       : {d(gouvernorat)}\n"
                    f"Lieu accident     : {d(lieu)}\n\n"
                    f"══ DATES ══\n"
                    f"Date survenance   : {d(date_surv)}\n"
                    f"Date déclaration  : {d(date_decl)}\n"
                    f"Date ouverture    : {d(date_ouv)}\n"
                    f"Délai déclaration : {delai_str}\n\n"
                    f"══ FINANCIER ══\n"
                    f"Montant évaluation: {self._fmt_montant(montant)} TND\n"
                    f"Cumul règlement   : {d(cumul_reg)} TND\n"
                    f"Total SAP Final   : {d(total_sap)} TND\n"
                    f"Responsabilité    : {d(code_resp)}\n\n"
                    f"══ VICTIMES ══\n"
                    f"Nombre blessés    : {blesses}\n"
                    f"Nombre décès      : {deces}\n\n"
                    f"══ ANALYSE IA ══\n"
                    f"Score risque ML   : {score}%\n"
                    f"Niveau            : {niveau}\n"
                    f"Signaux détectés  : {flags_str}\n"
                    f"Explication       : {d(explication)}\n\n"
                    f"══ DÉCISION AGENT ══\n"
                    f"Décision          : {d(decision)}\n"
                    f"Commentaire       : {d(commentaire_agent)}\n\n"
                    f"══ STATS GLOBALES (référence) ══\n"
                    f"Total base        : {total_sin} sinistres | Montant moyen : {avg_montant} TND\n\n"
                    f"══ INSTRUCTIONS VERIFAI ══\n"
                    f"1. Réponds TOUJOURS en français professionnel et structuré.\n"
                    f"2. Relie TOUJOURS les signaux : montant + décès + délai + responsabilité = analyse croisée.\n"
                    f"3. Cite TOUJOURS les chiffres exacts du dossier.\n"
                    f"4. Si score >= 75 → commence par '⚠️ DOSSIER CRITIQUE —'\n"
                    f"5. Si score >= 40 → commence par '⚡ SURVEILLANCE REQUISE —'\n"
                    f"6. Si score < 40  → commence par '✅ PROFIL CONFORME —'\n"
                    f"7. Structure avec bullet points. Termine par **Recommandation :** + action concrète.\n"
                    f"8. Réponds de manière COMPLÈTE, sans jamais t'arrêter à mi-phrase. INTERDIT de dire 'je ne sais pas' si la valeur est fournie.\n"
                    f"9. Si l'agent écrit 'zid', 'elaborate', 'fassarli', 'plus de détails', 'approfondis' → "
                    f"développe l'analyse précédente avec plus de profondeur. Ne répète pas — ajoute de nouvelles connexions."
                )

            messages = [{"role": "system", "content": system}]
            for h in hist[-10:]:
                messages.append({"role": h.get("role", "user"), "content": h.get("content", "")})
            messages.append({"role": "user", "content": msg})

            response = requests.post(
                "https://api.mistral.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model"      : "mistral-large-latest",
                    "messages"   : messages,
                    "max_tokens" : 4000,
                    "temperature": 0.2
                },
                timeout=90
            )
            print(f"[MISTRAL] Status code: {response.status_code}")
            print(f"[MISTRAL] Response: {response.text[:300]}")
            result = response.json()
            return result["choices"][0]["message"]["content"]

        except Exception as exc:
            print(f"[Mistral] Erreur détaillée: {type(exc).__name__}: {exc}")
            return None

    def _chat_regle(self, num, msg, data) -> str:
        print(f"[REGLE] Fallback règles — num={num} | keys_sample={list(data.keys())[:10]}")

        ml = msg.lower().strip()

        # ── Mode GENERAL : assistant sans dossier spécifique ──────────────────
        if num == "GENERAL":
            stats      = data.get("stats_globales") or {}
            total      = stats.get("total_sinistres", "—")
            avg        = stats.get("moyenne_montant", "—")
            par_gov    = stats.get("par_gouvernorat", [])
            par_nat    = stats.get("par_nature", [])
            top5       = stats.get("top_montants", [])
            nb_dec     = data.get("nb_decisions", 0)
            nb_conf    = data.get("nb_conformes",  0)
            nb_fraud   = data.get("nb_fraudes",    0)
            taux       = data.get("taux_fraude",   "—")

            if any(w in ml for w in ["combien", "total", "nombre", "sinistres", "9adech", "kam"]):
                top_gov_str = ", ".join([f"{g.get('GOUVERNORAT','?')} ({g.get('count','?')})" for g in par_gov[:5]]) if par_gov else "—"
                return (
                    f"📊 **Statistiques globales BH Assurance :**\n\n"
                    f"• **Total sinistres en base :** {total}\n"
                    f"• **Montant moyen évaluation :** {avg} TND\n"
                    f"• **Taux de fraude suspectée :** {taux}%\n"
                    f"• **Top gouvernorats :** {top_gov_str}\n\n"
                    f"**Session agent :** {nb_dec} décisions ({nb_conf} validés, {nb_fraud} bloqués)"
                )
            if any(w in ml for w in ["gouvernorat", "région", "zone", "ville", "localisation"]):
                gov_lines = "\n".join([f"• {g.get('GOUVERNORAT','?')} : {g.get('count','?')} sinistres" for g in par_gov[:10]]) if par_gov else "— données non disponibles"
                return f"🗺️ **Répartition par gouvernorat :**\n\n{gov_lines}"
            if any(w in ml for w in ["nature", "type", "corporel", "matériel", "incendie"]):
                nat_lines = "\n".join([f"• {n.get('NATURE_SINISTRE','?')} : {n.get('count','?')}" for n in par_nat]) if par_nat else "— données non disponibles"
                return f"📋 **Répartition par nature de sinistre :**\n\n{nat_lines}"
            if any(w in ml for w in ["montant", "élevé", "max", "minimum", "top"]):
                top_lines = "\n".join([f"• {s.get('NUM_SINISTRE')}: {s.get('MONTANT_EVALUATION')} TND ({s.get('GOUVERNORAT')})" for s in top5]) if top5 else "— données non disponibles"
                return f"💰 **Top 5 montants les plus élevés :**\n\n{top_lines}"
            if any(w in ml for w in ["suspect", "fraude", "alerte", "critique",
                                       "plus suspect", "dangereux", "haut risque",
                                       "les plus", "top sinistre"]):
                from database import get_top_suspects
                suspects = get_top_suspects(limit=8)
                if suspects:
                    lines = []
                    for s in suspects:
                        sc   = int(s.get("score_formule") or 0)
                        m    = float(s.get("MONTANT_EVALUATION") or 0)
                        d    = int(s.get("NOMBRE_DECES")   or 0)
                        b    = int(s.get("NOMBRE_BLESSES") or 0)
                        niv  = "🚨 CRITIQUE" if sc >= 75 else "⚡ MODÉRÉ" if sc >= 40 else "⚠️"
                        det  = f"{m:,.0f} TND"
                        if d > 0: det += f" | {d} décès"
                        if b > 0: det += f" | {b} blessés"
                        lines.append(
                            f"• **{s.get('NUM_SINISTRE')}** — {niv} **{sc}/100**\n"
                            f"  {s.get('GOUVERNORAT','—')} | {s.get('NATURE_SINISTRE','—')} | {det}"
                        )
                    top_str = "\n\n".join(lines)
                    return (
                        f"🚨 **Top sinistres les plus suspects (score formule métier) :**\n\n"
                        f"{top_str}\n\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━\n"
                        f"📊 Base : **{taux}%** taux fraude | Session : **{nb_fraud}** bloqué(s) / {nb_dec} décision(s)\n"
                        f"*Tapez un numéro de sinistre pour une analyse approfondie.*"
                    )
                return (
                    f"🚨 **Taux de fraude actuel : {taux}%**\n"
                    f"Session : **{nb_fraud}** dossier(s) bloqué(s) sur {nb_dec} décision(s).\n"
                    f"Aucune donnée suspect disponible."
                )
            if any(w in ml for w in ["résumé", "activité", "aujourd", "session", "bilan"]):
                return (
                    f"📋 **Résumé de votre session :**\n\n"
                    f"• Décisions prises : **{nb_dec}**\n"
                    f"• Dossiers validés : **{nb_conf}** ✅\n"
                    f"• Dossiers bloqués : **{nb_fraud}** 🚨\n\n"
                    f"📊 Base de données : **{total}** sinistres | Taux fraude : **{taux}%**"
                )
            if any(w in ml for w in ["calculé", "calcul", "score", "comment", "algorithme", "formule"]):
                return (
                    "📊 **Méthode de calcul du score de risque VeriAI :**\n\n"
                    "Le score global = **(2 × Score Formule + Score ML) / 3**\n\n"
                    "**Score Formule (règles métier) :**\n"
                    "• Montant ≥ 100 000 TND → +40 pts\n"
                    "• Montant ≥  50 000 TND → +30 pts\n"
                    "• Montant ≥  20 000 TND → +20 pts\n"
                    "• Montant ≥  10 000 TND → +10 pts\n"
                    "• Décès déclaré(s)       → +30 pts\n"
                    "• Blessés > 1            → +15 pts\n"
                    "• Responsabilité totale  → +15 pts\n"
                    "• *(Score formule plafonné à 100 pts)*\n\n"
                    "**Score ML (Random Forest) :**\n"
                    "Entraîné sur les données réelles de BH Assurance.\n\n"
                    "**Niveaux :** ✅ Conforme < 40% | ⚡ Modéré 40-74% | ⚠️ Critique ≥ 75%"
                )
            # Sinistre mentionné dans le message ?
            s_men   = data.get("sinistre_mentionne", {})
            num_men = data.get("num_mentionne", "")
            analyse = data.get("analyse_calculee", {})
            if s_men:
                def _sf2(k): return str(s_men.get(k) or "—").strip()
                cumul_p = _sf2("cumul_paiements")
                nb_p    = _sf2("nb_paiements")
                if analyse:
                    sc  = analyse.get("score_formule", 0)
                    niv = analyse.get("niveau", "—")
                    score_details_lines   = "\n  ".join(analyse.get("score_details", []))
                    flags_lines           = "\n\n  ".join(analyse.get("flags_expliques", []))
                    return (
                        f"🔍 **ANALYSE DOSSIER {num_men}**\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
                        f"**📋 PROFIL**\n"
                        f"• Nature : {_sf2('NATURE_SINISTRE')} | Gouvernorat : {_sf2('GOUVERNORAT')}\n"
                        f"• État : {_sf2('LIB_ETAT_SINISTRE')} | Responsabilité : {_sf2('CODE_RESPONSABILITE')}\n\n"
                        f"**💰 VOLET FINANCIER**\n"
                        f"• Montant évalué : **{analyse.get('montant', 0):,.0f} TND**\n"
                        f"• Moyenne base   : 3 736 TND\n"
                        f"• Ratio          : **{analyse.get('ratio_montant', 0)}×** la moyenne\n"
                        f"• Cumul paiements: {cumul_p} TND ({nb_p} paiement(s))\n\n"
                        f"**📅 TEMPOREL**\n"
                        f"• Date survenance : {_sf2('DATE_SURVENANCE')}\n"
                        f"• Date déclaration: {_sf2('DATE_DECLARATION')}\n"
                        f"• Délai           : {analyse.get('delai_jours', '—')} jours\n\n"
                        f"**👥 VICTIMES**\n"
                        f"• Blessés : {analyse.get('blesses', 0)} | Décès : {analyse.get('deces', 0)}\n\n"
                        f"**🧮 SCORE FORMULE : {sc}/100 — {niv}**\n"
                        f"  {score_details_lines}\n\n"
                        f"**⚠️ SIGNAUX D'ALERTE**\n"
                        f"  {flags_lines}\n\n"
                        f"**🎯 RECOMMANDATION**\n"
                        f"{analyse.get('recommandation', '—')}\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━\n"
                        f"*Score ML complet (Random Forest) → onglet Analyse.*"
                    )
                else:
                    m_val    = float(s_men.get("MONTANT_EVALUATION") or 0)
                    moyenne  = 3736.0
                    ecart    = round(((m_val - moyenne) / moyenne) * 100, 1) if moyenne else 0
                    ecart_str= f"+{ecart}%" if ecart >= 0 else f"{ecart}%"
                    sc       = score_regle(s_men)
                    niv      = "CRITIQUE" if sc >= 75 else "RISQUE MODÉRÉ" if sc >= 40 else "CONFORME"
                    return (
                        f"🔍 **ANALYSE DOSSIER {num_men}**\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━\n\n"
                        f"**📋 PROFIL**\n"
                        f"• Nature : {_sf2('NATURE_SINISTRE')} | Gouvernorat : {_sf2('GOUVERNORAT')}\n"
                        f"• État : {_sf2('LIB_ETAT_SINISTRE')} | Responsabilité : {_sf2('CODE_RESPONSABILITE')}\n\n"
                        f"**💰 VOLET FINANCIER**\n"
                        f"• Montant évalué : **{m_val:,.0f} TND**\n"
                        f"• Moyenne base   : 3 736 TND\n"
                        f"• Écart          : **{ecart_str}** par rapport à la moyenne\n"
                        f"• Cumul paiements: {cumul_p} TND ({nb_p} paiement(s))\n\n"
                        f"**⚠️ VICTIMES**\n"
                        f"• Blessés : {_sf2('NOMBRE_BLESSES')} | Décès : {_sf2('NOMBRE_DECES')}\n"
                        f"• Date survenance : {_sf2('DATE_SURVENANCE')}\n"
                        f"• Date déclaration: {_sf2('DATE_DECLARATION')}\n\n"
                        f"**🧮 SCORE FORMULE : {sc}/100 — {niv}**\n\n"
                        f"**🎯 RECOMMANDATION**\n"
                        f"{'⚠️ Investigation requise.' if sc >= 75 else '⚡ Surveillance requise.' if sc >= 40 else '✅ Profil dans les normes.'}\n"
                        f"━━━━━━━━━━━━━━━━━━━━━━\n"
                        f"*Score ML complet → onglet Analyse.*"
                    )

            # Réponse générique GENERAL
            return (
                f"🤖 **VeriAI — Assistant Anti-Fraude BH Assurance**\n\n"
                f"📊 Base : **{total}** sinistres | Montant moyen : **{avg} TND** | Fraude : **{taux}%**\n\n"
                f"Je peux vous aider avec :\n"
                f"• 🔍 Données d'un sinistre : tapez son numéro directement\n"
                f"• 📊 Explication du score de risque\n"
                f"• 🗺️ Analyse par gouvernorat ou nature\n"
                f"• 📋 Résumé de votre activité session"
            )

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

        niveau = "CRITIQUE" if score >= 75 else "RISQUE_MODÉRÉ" if score >= 40 else "CONFORME"

        date_surv   = self._fmt_date(self._get(data, "DATE_SURVENANCE",     "date_survenance"))
        date_decl   = self._fmt_date(self._get(data, "DATE_DECLARATION",    "date_declaration"))
        gouvernorat = self._get(data, "GOUVERNORAT",         "gouvernorat")
        type_sin    = self._get(data, "TYPE_SINISTRE",       "type_sinistre")
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

        if any(w in ml for w in ["pourquoi", "why", "w 3leh", "3leh", "3lah",
                                   "expliquer", "explication", "fassarli", "fasser",
                                   "zid", "elaborate", "détailler"]):
            reasons = []
            if montant < 10_000:   reasons.append(f"montant faible ({montant:.0f} TND)")
            elif montant < 20_000: reasons.append(f"montant modéré ({montant:.0f} TND — +10 pts)")
            elif montant < 50_000: reasons.append(f"montant significatif ({montant:.0f} TND — +20 pts)")
            elif montant < 100_000:reasons.append(f"montant élevé ({montant:.0f} TND — +30 pts)")
            else:                  reasons.append(f"montant très élevé ({montant:.0f} TND — +40 pts)")
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

        if any(w in ml for w in ["calculé", "calcul", "comment", "algorithme",
                                   "modèle", "model", "random forest", "rf", "ia", "intelligence"]):
            return (
                "**Méthode de calcul du score de risque VeriAI :**\n\n"
                "Le score global = **(2 × Score Formule + Score ML) / 3**\n\n"
                "**Score Formule (règles métier) :**\n"
                "• Montant ≥ 100 000 TND → +40 pts\n"
                "• Montant ≥  50 000 TND → +30 pts\n"
                "• Montant ≥  20 000 TND → +20 pts\n"
                "• Montant ≥  10 000 TND → +10 pts\n"
                "• Décès déclaré(s)       → +30 pts\n"
                "• Blessés > 1            → +15 pts\n"
                "• Responsabilité totale  → +15 pts\n"
                "• *(Score formule plafonné à 100 pts)*\n\n"
                "**Score ML (Random Forest) :**\n"
                "Entraîné sur les données réelles de BH Assurance.\n\n"
                "**Niveaux :** ✅ Conforme < 40% | ⚡ Modéré 40-74% | ⚠️ Critique ≥ 75%\n\n"
                f"**Résultat dossier {num} : {score}/100 — {niveau}**"
            )

        if any(w in ml for w in ["rapport", "audit", "report", "génère", "genere",
                                   "générer", "generer", "genera"]):
            flags = self._flags(data)
            return (
                f"**═══ RAPPORT D'AUDIT — Sinistre {num} ═══**\n\n"
                f"• **Nature**       : {nature}\n"
                f"• **Usage**        : {usage if usage != '—' else 'Non renseigné'}\n"
                f"• **Contrat**      : {contrat}\n"
                f"• **Montant**      : {montant:.0f} TND\n"
                f"• **Blessés**      : {blesses}  |  **Décès** : {deces}\n"
                f"• **Responsab.**   : {'Totale' if resp else 'Non totale'}\n"
                f"• **État dossier** : {etat}\n"
                f"• **Score risque** : {score}/100 — {niveau}\n"
                f"• **Signaux**      : {', '.join(flags) if flags else 'Aucun'}\n\n"
                f"**► Recommandation :** {self._recommandation(score)}"
            )

        if any(w in ml for w in ["résume", "resume", "résumé", "points clés", "points cles",
                                   "clé", "summary", "synthèse", "synthese", "résumer"]):
            return (
                f"**Résumé — Sinistre {num}**\n\n"
                f"Sinistre de nature **{nature}** (contrat {contrat}), "
                f"montant évalué **{montant:.0f} TND**. "
                + (f"**{deces} décès** et " if deces > 0 else "")
                + (f"**{blesses} blessé(s)**. " if blesses > 0 else "")
                + f"Usage véhicule : **{usage if usage != '—' else 'Non renseigné'}**. "
                f"État : **{etat}**. Score : **{score}/100 ({niveau})**.\n\n"
                f"**Action :** {self._recommandation(score)}"
            )

        if any(w in ml for w in ["vérifier", "verifier", "priorité", "priorite",
                                   "éléments", "elements", "contrôler", "controle",
                                   "checker", "check"]):
            items = []
            if montant >= 20_000: items.append(f"Justificatifs du montant ({montant:.0f} TND)")
            if deces > 0:         items.append(f"Actes de décès ({deces} décès)")
            if blesses > 0:       items.append(f"Rapports médicaux ({blesses} blessé(s))")
            if resp:              items.append("Rapport de police (responsabilité totale)")
            items += [
                "Cohérence entre date de survenance et date de déclaration",
                "Antécédents sinistres du titulaire du contrat",
                "Validité et ancienneté du contrat"
            ]
            return "**Éléments à vérifier en priorité :**\n" + "\n".join(f"• {i}" for i in items)

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

        if any(w in ml for w in ["remorquage", "frais", "rembours", "règlement",
                                   "reglement", "cumul", "total", "sap", "payé"]):
            parts = []
            if remorquage != "—": parts.append(f"Montant remorquage : **{remorquage} TND**")
            if cumul_reg  != "—": parts.append(f"Cumul règlement    : **{cumul_reg} TND**")
            if total_sap  != "—": parts.append(f"Total SAP final    : **{total_sap} TND**")
            if parts: return "**Montants réglés :**\n" + "\n".join(f"• {p}" for p in parts)
            return "Les données de règlement ne sont pas disponibles pour ce sinistre."

        if any(w in ml for w in ["type", "code", "catégorie", "categorie",
                                   "corporel", "matériel", "mixte"]):
            parts = []
            if type_sin  != "—": parts.append(f"Type de sinistre    : **{type_sin}**")
            if nature    != "—": parts.append(f"Nature              : **{nature}**")
            if code_resp != "—": parts.append(f"Code responsabilité : **{code_resp}**")
            if parts: return "\n".join(f"• {p}" for p in parts)

        if any(w in ml for w in ["tout", "all", "kol", "koll", "liste", "info",
                                   "données", "donnees", "disponible", "connais", "sait"]):
            available = []
            if contrat     != "—": available.append(f"Contrat : {contrat}")
            if usage       != "—": available.append(f"Usage véhicule : {usage}")
            if code_type   != "—": available.append(f"Type contrat : {code_type}")
            if nature      != "—": available.append(f"Nature : {nature}")
            if type_sin    != "—": available.append(f"Type : {type_sin}")
            if montant     >   0 : available.append(f"Montant : {montant:.0f} TND")
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

        if any(w in ml for w in ["score", "risque", "fraude", "suspect", "niveau",
                                   "faible", "bas", "élevé"]):
            return (
                f"Le sinistre **{num}** obtient un score de **{score}/100 — {niveau}**. "
                + ("Une investigation approfondie est requise." if score >= 65
                   else "Ce profil est dans les normes habituelles.")
            )

        if any(w in ml for w in ["montant", "somme", "évaluation", "argent",
                                   "prix", "coût", "cout", "tnd", "dinars"]):
            return (
                f"Le montant évalué pour le sinistre **{num}** est de **{montant:.0f} TND**. "
                + ("Montant très élevé — facteur de risque majeur." if montant >= 50_000
                   else f"Montant {'modéré' if montant >= 10_000 else 'faible'}.")
            )

        if any(w in ml for w in ["nature", "corporel", "assistance", "matériel", "vol"]):
            return f"La nature de ce sinistre est **{nature}** (contrat n° {contrat})."

        if any(w in ml for w in ["état", "etat", "statut", "situation", "clos", "ouvert"]):
            return f"L'état actuel du sinistre **{num}** est : **{etat}**."

        if any(w in ml for w in ["décision", "decision", "action", "faire",
                                   "recommandation", "recommande", "procéder"]):
            return self._recommandation(score)

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

        if any(w in ml for w in ["win", "où", "lieu", "location", "adresse",
                                   "gouvernorat", "ville", "région", "region"]):
            if gouvernorat != "—":
                return f"Le sinistre **{num}** est localisé dans le gouvernorat : **{gouvernorat}**."
            return f"Le gouvernorat n'est pas disponible pour le sinistre **{num}**."

        if any(w in ml for w in ["décès", "deces", "mort", "victime", "tué"]):
            return (f"**{deces} décès déclaré(s)** pour ce sinistre." if deces > 0
                    else "Aucun décès déclaré pour ce sinistre.")

        if any(w in ml for w in ["blessé", "blesse", "blessure", "blessés"]):
            return (f"**{blesses} blessé(s)** déclaré(s) pour ce sinistre." if blesses > 0
                    else "Aucun blessé déclaré pour ce sinistre.")

        return (
            f"Pour le sinistre **{num}** (nature: {nature}, montant: {montant:.0f} TND, "
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

        if   montant > 500_000: flags.append(f"Montant exceptionnel ({montant:.0f} TND)")
        elif montant > 200_000: flags.append(f"Montant très élevé ({montant:.0f} TND)")
        elif montant > 100_000: flags.append(f"Montant élevé ({montant:.0f} TND)")
        elif montant >  50_000: flags.append(f"Montant suspect ({montant:.0f} TND)")
        elif montant >  20_000: flags.append(f"Montant significatif ({montant:.0f} TND)")

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
                        flags.append(f"Règlement très suspect ({cumul:.0f} TND vs {montant:.0f} TND évalué)")
                    elif ratio > 1.5:
                        flags.append(f"Règlement suspect ({cumul:.0f} TND vs {montant:.0f} TND évalué)")
                    elif ratio < 0.3:
                        flags.append(f"Sous-règlement anormal ({cumul:.0f} TND vs {montant:.0f} TND évalué)")
            except (ValueError, TypeError):
                pass

        return flags

    def _explication(self, data, score, flags, niveau):
        num     = data.get("NUM_SINISTRE") or data.get("num_sinistre") or "?"
        nature  = data.get("NATURE_SINISTRE") or "Non précisé"
        montant = _montant(data)
        return (
            f"Analyse du sinistre {num} — Score {score}/100 ({niveau}). "
            f"Nature: {nature} | Montant: {montant:.0f} TND. "
            f"Facteurs: {'; '.join(flags) if flags else 'aucun signal majeur'}. "
            f"{'Forte probabilité de fraude.' if score >= 65 else 'Profil dans les normes.'}"
        )

    def _recommandation(self, score: int) -> str:
        if   score >= 75: return "INVESTIGATION REQUISE — Dossier suspect, demander pièces justificatives."
        elif score >= 40: return "SURVEILLANCE — Vérification rigoureuse des documents."
        else:             return "TRAITEMENT NORMAL — Aucune anomalie majeure."