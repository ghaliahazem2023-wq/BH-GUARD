"""
BH Guard — FastAPI Backend  (port 8000)
Endpoints : /health  /predict  /chat-sinistre
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from database import get_sinistre_by_num
from model import FraudModel

# ─────────────────────────── App & CORS ─────────────────────────────────────

app = FastAPI(
    title      = "BH Guard — API Détection Fraude",
    description= "Random Forest + ARIA (Mistral AI) pour BH Assurance Tunisie",
    version    = "1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ─────────────────────────── Chargement modèle ──────────────────────────────

print("=" * 60)
print("  BH Guard FastAPI - demarrage")
print("=" * 60)
fraud_model = FraudModel()
print("=" * 60)

# ─────────────────────────── Schemas Pydantic ───────────────────────────────

class SinistreInput(BaseModel):
    NUM_SINISTRE         : Optional[str]   = None
    num_sinistre         : Optional[str]   = None   # alias minuscule
    NUM_CONTRAT          : Optional[str]   = None
    MONTANT_EVALUATION   : Optional[float] = None
    NOMBRE_DECES         : Optional[int]   = None
    NOMBRE_BLESSES       : Optional[int]   = None
    CODE_RESPONSABILITE  : Optional[str]   = None
    NATURE_SINISTRE      : Optional[str]   = None
    LIB_ETAT_SINISTRE    : Optional[str]   = None
    DATE_DECLARATION     : Optional[str]   = None
    DATE_SURVENANCE      : Optional[str]   = None

    model_config = {"extra": "allow"}   # accepte tout champ supplémentaire


class ChatInput(BaseModel):
    num_sinistre     : str
    message          : str
    historique       : List[Dict[str, str]] = Field(default_factory=list)
    donnees_sinistre : Optional[Dict[str, Any]] = None


# ─────────────────────────── Endpoints ──────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status"      : "ok",
        "model_loaded": fraud_model.is_ready,
        "service"     : "BH Guard Fraud Detection API",
    }


@app.post("/predict")
def predict(data: SinistreInput):
    payload = data.model_dump()

    # Résoudre alias minuscule/majuscule
    num = payload.get("NUM_SINISTRE") or payload.get("num_sinistre")

    if num:
        db_row = get_sinistre_by_num(str(num))
        if db_row:
            # La DB est la source de vérité pour toutes les colonnes DB.
            # On commence avec les données DB complètes, puis on ajoute
            # les champs du payload qui ne sont PAS dans la DB
            # (ex: champs calculés par Angular, métadonnées).
            # Cela évite que les "0" forcés par le frontend masquent
            # les vraies valeurs DB (ex: NOMBRE_DECES réel = 1 mais Angular envoyait 0).
            base = dict(db_row)
            base["NUM_SINISTRE"] = str(num)
            for k, v in payload.items():
                if k not in base and v is not None:
                    base[k] = v
            payload = base
        else:
            payload["NUM_SINISTRE"] = str(num)

    result = fraud_model.predict(payload)
    return result


@app.post("/chat-sinistre")
def chat_sinistre(data: ChatInput):
    try:
        sinistre_data: Dict[str, Any] = data.donnees_sinistre or {}
        print(f"[VeriAI] /chat-sinistre num={data.num_sinistre}")
        print(f"[VeriAI] donnees_sinistre keys={list(sinistre_data.keys())}")

        # Stratégie de merge :
        # 1. Base = données DB (colonnes de la table sinistres)
        # 2. Champs IA/décision = Angular gagne toujours
        # 3. Champs absents de la DB (usage, type_contrat…) = Angular comble les trous
        if data.num_sinistre:
            db_row = get_sinistre_by_num(data.num_sinistre)
            if db_row:
                print(f"[VeriAI] DB keys={list(db_row.keys())}")
                merged = dict(db_row)
                ia_fields = {
                    "score_risque", "est_suspect", "niveau_risque",
                    "flags_detectes", "explication_ia", "recommandation",
                    "decision_agent", "commentaire_agent",
                }
                for k, v in sinistre_data.items():
                    if v is None:
                        continue
                    if k in ia_fields:
                        merged[k] = v          # IA/agent : Angular gagne
                    elif k not in merged or merged[k] is None or str(merged[k]).strip() in ("", "—"):
                        merged[k] = v          # champ absent ou vide en DB : Angular comble
                sinistre_data = merged
                print(f"[VeriAI] merged keys={list(sinistre_data.keys())}")
            else:
                print(f"[VeriAI] sinistre {data.num_sinistre} non trouvé en DB, utilisation données Angular")

        reponse = fraud_model.chat(
            num_sinistre  = data.num_sinistre,
            message       = data.message,
            historique    = data.historique,
            sinistre_data = sinistre_data,
        )
        return {"reponse": reponse, "num_sinistre": data.num_sinistre}
    except Exception as exc:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))


# ─────────────────────────── Dev runner ─────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
