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


def get_sinistre_complet(num: str) -> Optional[Dict[str, Any]]:
    """Sinistre + cumul paiements si table paiements disponible."""
    try:
        conn   = _connect()
        cursor = conn.cursor()
        # Essai avec JOIN paiements
        try:
            cursor.execute("""
                SELECT s.*,
                       COUNT(p.ID_PAIEMENT)              AS nb_paiements,
                       COALESCE(SUM(p.MONTANT_PAIEMENT), 0) AS cumul_paiements
                FROM sinistres s
                LEFT JOIN paiements p ON s.NUM_SINISTRE = p.NUM_SINISTRE
                WHERE s.NUM_SINISTRE = ?
                GROUP BY s.NUM_SINISTRE
            """, num)
        except Exception:
            # Table paiements absente → fallback simple
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
        print(f"[DB] get_sinistre_complet error: {exc}")
        return None


def get_all_stats() -> Dict[str, Any]:
    """Stats globales pour VeriAI assistant général."""
    try:
        conn   = _connect()
        cursor = conn.cursor()

        cursor.execute("SELECT COUNT(*) FROM sinistres")
        total = cursor.fetchone()[0]

        cursor.execute("""
            SELECT TOP 5 NUM_SINISTRE, MONTANT_EVALUATION, GOUVERNORAT, NATURE_SINISTRE
            FROM sinistres ORDER BY MONTANT_EVALUATION DESC
        """)
        cols = [c[0] for c in cursor.description]
        top_montants = [dict(zip(cols, r)) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT TOP 5 NUM_SINISTRE, MONTANT_EVALUATION, GOUVERNORAT, NATURE_SINISTRE
            FROM sinistres WHERE MONTANT_EVALUATION > 0 ORDER BY MONTANT_EVALUATION ASC
        """)
        min_montants = [dict(zip(cols, r)) for r in cursor.fetchall()]

        cursor.execute("""
            SELECT GOUVERNORAT, COUNT(*) as count
            FROM sinistres GROUP BY GOUVERNORAT ORDER BY count DESC
        """)
        par_gov = [{"GOUVERNORAT": r[0], "count": r[1]} for r in cursor.fetchall()]

        cursor.execute("""
            SELECT NATURE_SINISTRE, COUNT(*) as count
            FROM sinistres GROUP BY NATURE_SINISTRE ORDER BY count DESC
        """)
        par_nature = [{"NATURE_SINISTRE": r[0], "count": r[1]} for r in cursor.fetchall()]

        cursor.execute("SELECT AVG(CAST(MONTANT_EVALUATION AS FLOAT)) FROM sinistres WHERE MONTANT_EVALUATION > 0")
        avg_row = cursor.fetchone()[0]
        avg_montant = round(float(avg_row), 2) if avg_row else 0.0

        conn.close()
        return {
            "total_sinistres" : total,
            "top_montants"    : top_montants,
            "min_montants"    : min_montants,
            "par_gouvernorat" : par_gov,
            "par_nature"      : par_nature,
            "moyenne_montant" : avg_montant,
        }
    except Exception as exc:
        print(f"[DB] get_all_stats error: {exc}")
        return {}


def get_top_suspects(limit: int = 8) -> List[Dict[str, Any]]:
    """Top sinistres ordonnés par score formule métier (SQL-side)."""
    try:
        conn   = _connect()
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT TOP {limit}
                NUM_SINISTRE, GOUVERNORAT, NATURE_SINISTRE,
                MONTANT_EVALUATION, NOMBRE_DECES, NOMBRE_BLESSES,
                CODE_RESPONSABILITE, LIB_ETAT_SINISTRE,
                DATE_SURVENANCE, DATE_DECLARATION,
                (
                  CASE WHEN MONTANT_EVALUATION >= 100000 THEN 40
                       WHEN MONTANT_EVALUATION >=  50000 THEN 30
                       WHEN MONTANT_EVALUATION >=  20000 THEN 20
                       WHEN MONTANT_EVALUATION >=  10000 THEN 10
                       ELSE 0 END
                + CASE WHEN NOMBRE_DECES   > 0 THEN 30 ELSE 0 END
                + CASE WHEN NOMBRE_BLESSES > 1 THEN 15 ELSE 0 END
                ) AS score_formule
            FROM sinistres
            WHERE MONTANT_EVALUATION >= 10000
               OR NOMBRE_DECES > 0
               OR NOMBRE_BLESSES > 1
            ORDER BY score_formule DESC
        """)
        cols = [c[0] for c in cursor.description]
        rows = [dict(zip(cols, r)) for r in cursor.fetchall()]
        conn.close()
        return rows
    except Exception as exc:
        print(f"[DB] get_top_suspects error: {exc}")
        return []


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
