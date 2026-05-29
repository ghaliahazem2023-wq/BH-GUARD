import pyodbc
import requests
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

FASTAPI_URL = "http://localhost:8000/predict"
SERVER = "LAPTOP-08TRQOEP\\SQLEXPRESS"
DATABASE = "bh_assurance"
MAX_WORKERS = 20

def get_connection():
    return pyodbc.connect(
        f'DRIVER={{ODBC Driver 17 for SQL Server}};'
        f'SERVER={SERVER};DATABASE={DATABASE};'
        f'Trusted_Connection=yes;'
    )

def traiter_sinistre(row):
    num_sinistre = str(row[0])
    try:
        payload = {
            "NUM_SINISTRE": num_sinistre,
            "num_sinistre": num_sinistre,
            "NUM_CONTRAT": str(row[1]),
            "MONTANT_EVALUATION": float(row[2]),
            "NOMBRE_DECES": float(row[3]),
            "NOMBRE_BLESSES": float(row[4]),
            "CODE_RESPONSABILITE": str(row[5]),
            "NATURE_SINISTRE": str(row[6]),
            "LIB_ETAT_SINISTRE": str(row[7]),
            "DATE_DECLARATION": str(row[8]),
            "DATE_SURVENANCE": str(row[9])
        }
        response = requests.post(
            FASTAPI_URL, json=payload, timeout=10)
        if response.status_code == 200:
            result = response.json()
            score = float(result.get("score_risque", 0))
            return (num_sinistre, score, None)
        else:
            return (num_sinistre, None, "HTTP Error")
    except Exception as e:
        return (num_sinistre, None, str(e))

# Charger sinistres sans score ML
print("Chargement des sinistres...")
conn = get_connection()
cursor = conn.cursor()
cursor.execute("""
    SELECT 
        NUM_SINISTRE,
        ISNULL(CAST(NUM_CONTRAT AS VARCHAR), '') as NUM_CONTRAT,
        ISNULL(MONTANT_EVALUATION, 0),
        ISNULL(NOMBRE_DECES, 0),
        ISNULL(NOMBRE_BLESSES, 0),
        ISNULL(CAST(CODE_RESPONSABILITE AS VARCHAR), ''),
        ISNULL(NATURE_SINISTRE, ''),
        ISNULL(LIB_ETAT_SINISTRE, ''),
        ISNULL(DATE_DECLARATION, ''),
        ISNULL(DATE_SURVENANCE, '')
    FROM dbo.sinistres
    WHERE SCORE_RISQUE IS NULL OR SCORE_RISQUE = 0
    ORDER BY NUM_SINISTRE
""")
rows = cursor.fetchall()
cursor.close()
conn.close()

total = len(rows)
print(f"Total à traiter: {total} sinistres")
print(f"Démarrage avec {MAX_WORKERS} threads parallèles...")

traites = 0
critiques = 0
investigation = 0
conformes = 0
erreurs = 0
start_time = time.time()
results_batch = []

with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
    futures = {executor.submit(traiter_sinistre, row): row 
               for row in rows}
    
    for future in as_completed(futures):
        num_sinistre, score, error = future.result()
        
        if score is not None:
            results_batch.append((score, num_sinistre))
            if score >= 75: critiques += 1
            elif score >= 40: investigation += 1
            else: conformes += 1
        else:
            erreurs += 1
        
        traites += 1
        
        # Sauvegarder en batch de 100
        if len(results_batch) >= 100:
            conn = get_connection()
            cursor = conn.cursor()
            cursor.executemany("""
                UPDATE dbo.sinistres 
                SET SCORE_RISQUE = ?
                WHERE NUM_SINISTRE = ?
            """, results_batch)
            conn.commit()
            cursor.close()
            conn.close()
            results_batch = []
        
        # Afficher progression
        if traites % 100 == 0:
            elapsed = time.time() - start_time
            pct = (traites / total) * 100
            remaining = (elapsed / traites) * (total - traites)
            print(f"✅ {traites}/{total} ({pct:.1f}%) — "
                  f"⏱ {remaining/60:.1f} min — "
                  f"🔴 {critiques} critiques")

# Sauvegarder les résultats restants
if results_batch:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.executemany("""
        UPDATE dbo.sinistres 
        SET SCORE_RISQUE = ?
        WHERE NUM_SINISTRE = ?
    """, results_batch)
    conn.commit()
    cursor.close()
    conn.close()

elapsed = time.time() - start_time
print(f"\n{'='*50}")
print(f"✅ BATCH TERMINÉ en {elapsed/60:.1f} minutes")
print(f"🔴 Critiques (>=75%): {critiques}")
print(f"🟡 Investigation (40-74%): {investigation}")
print(f"🟢 Conformes (<40%): {conformes}")
print(f"⚠️  Erreurs: {erreurs}")
print(f"{'='*50}")