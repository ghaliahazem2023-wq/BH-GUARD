"""
Connexion SQL Server → bh_assurance (Windows Auth)
"""
import pyodbc
from typing import Optional, Dict, Any, List

SERVER   = r"LAPTOP-08TRQOEP\SQLEXPRESS"
DATABASE = "bh_assurance"

_CONN_STR = (
    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
    f"SERVER={SERVER};"
    f"DATABASE={DATABASE};"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
    "Encrypt=yes;"
)

# Colonnes pour l'entraînement ML (fixes, nécessaires pour le score)
_COLS_ML = (
    "NUM_SINISTRE, NUM_CONTRAT, DATE_DECLARATION, DATE_SURVENANCE, "
    "NATURE_SINISTRE, MONTANT_EVALUATION, NOMBRE_BLESSES, NOMBRE_DECES, "
    "CODE_RESPONSABILITE, LIB_ETAT_SINISTRE"
)


def _connect():
    return pyodbc.connect(_CONN_STR, timeout=5)


def _safe(v) -> str:
    """Convertit une valeur DB en string lisible."""
    if v is None:
        return "—"
    s = str(v).strip()
    return s if s else "—"


def get_sinistre_by_num(num: str) -> Optional[Dict[str, Any]]:
    """Récupère TOUTES les colonnes d'un sinistre."""
    try:
        conn   = _connect()
        cursor = conn.cursor()
        cursor.execute("SELECT TOP 1 * FROM sinistres WHERE NUM_SINISTRE = ?", num)
        row = cursor.fetchone()
        if row:
            cols   = [c[0] for c in cursor.description]
            result = {col: row[i] for i, col in enumerate(cols)}
            conn.close()
            return result
        conn.close()
        return None
    except Exception as exc:
        print(f"[DB] get_sinistre_by_num error: {exc}")
        return None


def get_all_sinistres(limit: int = 2000) -> List[Dict[str, Any]]:
    """Colonnes ML fixes pour l'entraînement."""
    try:
        conn   = _connect()
        cursor = conn.cursor()
        cursor.execute(f"SELECT TOP {limit} {_COLS_ML} FROM sinistres")
        cols = [c[0] for c in cursor.description]
        rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
        conn.close()
        print(f"[DB] Charge {len(rows)} sinistres pour entrainement")
        return rows
    except Exception as exc:
        print(f"[DB] get_all_sinistres error: {exc}")
        return []
