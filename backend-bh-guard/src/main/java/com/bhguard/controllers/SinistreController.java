package com.bhguard.controllers;

import com.bhguard.models.Sinistre;
import com.bhguard.repositories.SinistreRepository;
import com.bhguard.services.SinistreService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import javax.sql.DataSource;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

@RestController
@RequestMapping("/api/sinistres")
public class SinistreController {

    @Autowired
    private SinistreRepository sinistreRepository;

    @Autowired
    private SinistreService sinistreService;

    @Autowired
    @Qualifier("sinistreDataSource")
    private DataSource sinistreDataSource;

    @Autowired
    @Qualifier("primaryDataSource")
    private DataSource primaryDataSource;

    @Value("${fastapi.url:http://localhost:8000}")
    private String fastapiUrl;

    @Autowired
    private RestTemplate restTemplate;

    // ── GET tous les sinistres ─────────────────────────────────────────────────
    @GetMapping
    public ResponseEntity<?> getAllSinistres(
            @RequestParam(defaultValue = "0")  int    page,
            @RequestParam(defaultValue = "20") int    size,
            @RequestParam(required = false, defaultValue = "") String niveau,
            @RequestParam(required = false, defaultValue = "") String gouvernorat,
            @RequestParam(required = false, defaultValue = "") String nature
    ) {
        try {
            return ResponseEntity.ok(
                sinistreService.getSinistres(page, size, gouvernorat, nature, niveau, null)
            );
        } catch (Exception e) {
            System.err.println("[BHGuard] /api/sinistres ERREUR: " + e.getMessage());
            e.printStackTrace();
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("error",         e.getMessage());
            err.put("sinistres",     List.of());
            err.put("totalPages",    1);
            err.put("totalElements", 0);
            err.put("currentPage",   page);
            return ResponseEntity.ok(err);
        }
    }

    // ── GET natures distinctes ─────────────────────────────────────────────────
    @GetMapping("/natures")
    public ResponseEntity<List<String>> getNatures() {
        JdbcTemplate jdbc = new JdbcTemplate(sinistreDataSource);
        try {
            List<String> natures = jdbc.queryForList(
                "SELECT DISTINCT LTRIM(RTRIM(NATURE_SINISTRE)) AS n FROM sinistres " +
                "WHERE NATURE_SINISTRE IS NOT NULL AND LEN(LTRIM(RTRIM(NATURE_SINISTRE))) > 0 " +
                "ORDER BY n", String.class);
            return ResponseEntity.ok(natures);
        } catch (Exception e) {
            return ResponseEntity.ok(List.of());
        }
    }

    // ── GET gouvernorats distincts ─────────────────────────────────────────────
    @GetMapping("/gouvernorats")
    public ResponseEntity<List<String>> getGouvernorats() {
        JdbcTemplate jdbc = new JdbcTemplate(sinistreDataSource);
        try {
            List<String> govs = jdbc.queryForList(
                "SELECT DISTINCT LTRIM(RTRIM(GOUVERNORAT)) AS g FROM sinistres " +
                "WHERE GOUVERNORAT IS NOT NULL AND LEN(LTRIM(RTRIM(GOUVERNORAT))) > 0 " +
                "ORDER BY g", String.class);
            return ResponseEntity.ok(govs);
        } catch (Exception e) {
            return ResponseEntity.ok(List.of());
        }
    }

    // ── GET diagnostic DB ──────────────────────────────────────────────────────
    @GetMapping("/debug")
    public ResponseEntity<?> debug() {
        JdbcTemplate jdbc = new JdbcTemplate(sinistreDataSource);
        Map<String, Object> info = new LinkedHashMap<>();
        try {
            Long count = jdbc.queryForObject("SELECT COUNT_BIG(*) FROM sinistres", Long.class);
            info.put("status", "OK");
            info.put("count",  count);
        } catch (Exception e) {
            info.put("status",  "ERREUR");
            info.put("message", e.getMessage());
        }
        return ResponseEntity.ok(info);
    }

    // ── GET config_scoring ─────────────────────────────────────────────────────
    @GetMapping("/config-scoring")
    public ResponseEntity<?> getConfigScoring() {
        JdbcTemplate jdbc = new JdbcTemplate(primaryDataSource);
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT id, cle, valeur, description FROM config_scoring ORDER BY id");
            return ResponseEntity.ok(rows);
        } catch (Exception e) {
            System.err.println("[BHGuard] config-scoring ERREUR: " + e.getMessage());
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ── PUT config_scoring ─────────────────────────────────────────────────────
    @PutMapping("/config-scoring/{id}")
    public ResponseEntity<?> updateConfigScoring(
            @PathVariable int id,
            @RequestBody Map<String, Object> body) {
        JdbcTemplate jdbc = new JdbcTemplate(primaryDataSource);
        try {
            double valeur = ((Number) body.get("valeur")).doubleValue();
            jdbc.update("UPDATE config_scoring SET valeur = ? WHERE id = ?", valeur, id);
            return ResponseEntity.ok(Map.of("success", true, "id", id, "valeur", valeur));
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ── GET un sinistre par numéro ─────────────────────────────────────────────
    @GetMapping("/{numSinistre}")
    public ResponseEntity<?> getSinistre(@PathVariable String numSinistre) {
        JdbcTemplate jdbc = new JdbcTemplate(sinistreDataSource);
        List<Map<String, Object>> rows;
        try {
            rows = jdbc.queryForList(
                "SELECT TOP 1 " +
                "  LTRIM(RTRIM(NUM_SINISTRE))              AS numSinistre, " +
                "  LTRIM(RTRIM(ISNULL(NUM_CONTRAT,'')))    AS numContrat, " +
                "  ANNEE_EXERCICE                          AS anneeExercice, " +
                "  CONVERT(VARCHAR(10),DATE_SURVENANCE,120)  AS dateSurvenance, " +
                "  CONVERT(VARCHAR(10),DATE_DECLARATION,120) AS dateDeclaration, " +
                "  CONVERT(VARCHAR(10),DATE_OUVERTURE,120)   AS dateOuverture, " +
                "  LTRIM(RTRIM(ISNULL(NATURE_SINISTRE,''))) AS natureSinistre, " +
                "  LTRIM(RTRIM(ISNULL(TYPE_SINISTRE,'')))   AS typeSinistre, " +
                "  LTRIM(RTRIM(ISNULL(LIB_ETAT_SINISTRE,''))) AS libEtatSinistre, " +
                "  LTRIM(RTRIM(ISNULL(GOUVERNORAT,'')))     AS gouvernorat, " +
                "  LTRIM(RTRIM(ISNULL(LIEU_ACCIDENT,'')))   AS lieuAccident, " +
                "  LTRIM(RTRIM(ISNULL(usage,'')))           AS usage, " +
                "  ISNULL(NOMBRE_BLESSES,0)                AS nombreBlesses, " +
                "  ISNULL(NOMBRE_DECES,0)                  AS nombreDeces, " +
                "  ISNULL(MONTANT_EVALUATION,0)            AS montantEvaluation, " +
                "  ISNULL(cumul_reglement,0)               AS cumulReglement, " +
                "  ISNULL(Total_SAP_Final,0)               AS totalSapFinal, " +
                "  LTRIM(RTRIM(ISNULL(CODE_TYPE_CONTRAT,'')))    AS codeTypeContrat, " +
                "  LTRIM(RTRIM(ISNULL(CODE_RESPONSABILITE,'')))  AS codeResponsabilite, " +
                "  ISNULL(SCORE_RISQUE,0)                       AS scoreRisque, " +
                "  ISNULL(SCORE_HEURISTIQUE,0)                  AS scoreHeuristique, " +
                "  ISNULL(SCORE_GLOBAL, ISNULL(SCORE_RISQUE,0)) AS scoreGlobal " +
                "FROM sinistres WHERE LTRIM(RTRIM(NUM_SINISTRE)) = ?",
                numSinistre.trim());
        } catch (Exception e) {
            System.err.println("[BHGuard] GET /{num} erreur JDBC: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
        if (rows.isEmpty()) return ResponseEntity.notFound().build();

        Map<String, Object> row = new LinkedHashMap<>(rows.get(0));
        double dbScore = row.get("scoreRisque") instanceof Number
                         ? ((Number) row.get("scoreRisque")).doubleValue() : 0;
        System.out.println("[BHGuard] GET /" + numSinistre.trim() + " → scoreRisque=" + dbScore);
        row.put("scoreEstime",  dbScore <= 0);
        row.put("niveauRisque", sinistreService.calculerNiveau((int) dbScore));
        row.put("estSuspect",   dbScore >= 65);
        return ResponseEntity.ok(row);
    }

    // ── GET recherche ──────────────────────────────────────────────────────────
    @GetMapping("/search")
    public ResponseEntity<?> search(@RequestParam String q) {
        List<Sinistre> results = sinistreRepository.search(q);
        return ResponseEntity.ok(results);
    }

    // ── GET stats dashboard ────────────────────────────────────────────────────
    @GetMapping("/stats")
    public ResponseEntity<?> getStats() {
        long total = sinistreRepository.count();
        long elevés = sinistreRepository.findSinistresElevés(10000.0).size();
        return ResponseEntity.ok(Map.of(
                "total_sinistres", total,
                "sinistres_montant_eleve", elevés
        ));
    }

    // ── POST recalculer SCORE_HEURISTIQUE + SCORE_GLOBAL pour tous ─────────────
    @PostMapping("/recalculer-scores-global")
    public ResponseEntity<?> recalculerScoresGlobal() {
        JdbcTemplate jdbcPrimary  = new JdbcTemplate(primaryDataSource);
        JdbcTemplate jdbcSinistre = new JdbcTemplate(sinistreDataSource);

        try {
            // 1. Lire config_scoring
            List<Map<String, Object>> configs = jdbcPrimary.queryForList(
                "SELECT cle, valeur FROM config_scoring");
            Map<String, Double> cfg = new HashMap<>();
            for (Map<String, Object> c : configs) {
                cfg.put(c.get("cle").toString(), ((Number) c.get("valeur")).doubleValue());
            }

            double m500k = cfg.getOrDefault("montant_500k_pts", 35.0);
            double m200k = cfg.getOrDefault("montant_200k_pts", 25.0);
            double m100k = cfg.getOrDefault("montant_100k_pts", 40.0);
            double m50k  = cfg.getOrDefault("montant_50k_pts",  30.0);
            double m20k  = cfg.getOrDefault("montant_20k_pts",  20.0);
            double m10k  = cfg.getOrDefault("montant_10k_pts",  10.0);
            double dPts  = cfg.getOrDefault("deces_pts",        30.0);
            double bPts  = cfg.getOrDefault("blesses_pts",      15.0);
            double rPts  = cfg.getOrDefault("responsabilite_pts", 15.0);

            // 2. Calculer SCORE_HEURISTIQUE pour tous les sinistres
            String sqlHeuristique =
                "WITH scored AS ( " +
                "  SELECT NUM_SINISTRE, " +
                "    CASE WHEN raw_sc > 100 THEN 100 ELSE raw_sc END AS sc " +
                "  FROM ( " +
                "    SELECT NUM_SINISTRE, " +
                "      ISNULL(CASE WHEN ISNULL(MONTANT_EVALUATION,0) >= 500000 THEN " + (int)m500k +
                "                  WHEN ISNULL(MONTANT_EVALUATION,0) >= 200000 THEN " + (int)m200k +
                "                  WHEN ISNULL(MONTANT_EVALUATION,0) >= 100000 THEN " + (int)m100k +
                "                  WHEN ISNULL(MONTANT_EVALUATION,0) >= 50000  THEN " + (int)m50k +
                "                  WHEN ISNULL(MONTANT_EVALUATION,0) >= 20000  THEN " + (int)m20k +
                "                  WHEN ISNULL(MONTANT_EVALUATION,0) >= 10000  THEN " + (int)m10k +
                "                  ELSE 0 END, 0) " +
                "    + ISNULL(CASE WHEN ISNULL(NOMBRE_DECES,0) > 0 THEN " + (int)dPts + " ELSE 0 END, 0) " +
                "    + ISNULL(CASE WHEN ISNULL(NOMBRE_BLESSES,0) > 1 THEN " + (int)bPts + " ELSE 0 END, 0) " +
                "    + CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(CODE_RESPONSABILITE,'')))) IN ('T','TOTALE','100') THEN " + (int)rPts + " ELSE 0 END " +
                "    AS raw_sc " +
                "    FROM sinistres " +
                "  ) t " +
                ") " +
                "UPDATE s SET s.SCORE_HEURISTIQUE = scored.sc " +
                "FROM sinistres s " +
                "JOIN scored ON s.NUM_SINISTRE = scored.NUM_SINISTRE";

            long t0      = System.currentTimeMillis();
            int  traites = jdbcSinistre.update(sqlHeuristique);

            // 3. Calculer SCORE_GLOBAL = (2×SCORE_HEURISTIQUE + 1×SCORE_RISQUE) / 3
            String sqlGlobal =
                "UPDATE sinistres " +
                "SET SCORE_GLOBAL = ROUND((2.0 * SCORE_HEURISTIQUE + 1.0 * ISNULL(SCORE_RISQUE,SCORE_HEURISTIQUE)) / 3.0, 0) " +
                "WHERE SCORE_HEURISTIQUE IS NOT NULL";

            jdbcSinistre.update(sqlGlobal);
            long duree = System.currentTimeMillis() - t0;

            System.out.println("[BHGuard] recalculerScoresGlobal: " + traites + " sinistres traités en " + duree + "ms");

            // 4. Stats
            Map<String, Object> recap = jdbcSinistre.queryForMap(
                "SELECT " +
                "  COUNT(*) AS total, " +
                "  SUM(CASE WHEN SCORE_GLOBAL >= 75 THEN 1 ELSE 0 END) AS critiques, " +
                "  SUM(CASE WHEN SCORE_GLOBAL >= 40 AND SCORE_GLOBAL < 75 THEN 1 ELSE 0 END) AS moderes, " +
                "  SUM(CASE WHEN SCORE_GLOBAL < 40 THEN 1 ELSE 0 END) AS conformes " +
                "FROM sinistres WHERE SCORE_GLOBAL IS NOT NULL"
            );

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("traites",   traites);
            response.put("critiques", recap.get("critiques"));
            response.put("moderes",   recap.get("moderes"));
            response.put("conformes", recap.get("conformes"));
            response.put("total",     recap.get("total"));
            response.put("dureeMs",   duree);
            return ResponseEntity.ok(response);

        } catch (Exception e) {
            System.err.println("[BHGuard] recalculerScoresGlobal ERREUR: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ── POST batch score global (SCORE_HEURISTIQUE + SCORE_GLOBAL) ────────────
    @PostMapping("/batch-score-global")
    public ResponseEntity<?> batchScoreGlobal() {
        JdbcTemplate jdbcSinistre = new JdbcTemplate(sinistreDataSource);
        try {
            System.out.println("[BHGuard] Démarrage batch score global...");
            long t0 = System.currentTimeMillis();
            List<Map<String, Object>> rows = jdbcSinistre.queryForList(
                "SELECT LTRIM(RTRIM(NUM_SINISTRE)) AS num, " +
                "ISNULL(MONTANT_EVALUATION,0) AS montant, ISNULL(NOMBRE_DECES,0) AS deces, " +
                "ISNULL(NOMBRE_BLESSES,0) AS blesses, ISNULL(SCORE_RISQUE,0) AS scoreML, " +
                "LTRIM(RTRIM(ISNULL(CODE_RESPONSABILITE,''))) AS resp, " +
                "LTRIM(RTRIM(ISNULL(NATURE_SINISTRE,''))) AS nature, " +
                "ISNULL(cumul_reglement,0) AS cumul, " +
                "CONVERT(VARCHAR(10),DATE_SURVENANCE,120) AS dateSurv, " +
                "CONVERT(VARCHAR(10),DATE_DECLARATION,120) AS dateDecl FROM sinistres");
            int traites=0, critiques=0, moderes=0, conformes=0;
            for (Map<String, Object> row : rows) {
                String num     = row.get("num").toString();
                double montant = ((Number) row.get("montant")).doubleValue();
                int deces      = ((Number) row.get("deces")).intValue();
                int blesses    = ((Number) row.get("blesses")).intValue();
                double scoreML = ((Number) row.get("scoreML")).doubleValue();
                String resp    = row.get("resp").toString().toUpperCase();
                String nature  = row.get("nature").toString().toUpperCase();
                double cumul   = ((Number) row.get("cumul")).doubleValue();
                String dateSurv = row.get("dateSurv") != null ? row.get("dateSurv").toString() : "";
                String dateDecl = row.get("dateDecl") != null ? row.get("dateDecl").toString() : "";
                int scoreH = 0;
                switch (nature) {
                    case "CORPOREL":
                        if      (montant >= 500_000) scoreH += 40;
                        else if (montant >= 200_000) scoreH += 30;
                        else if (montant >= 100_000) scoreH += 20;
                        else if (montant >=  50_000) scoreH += 10;
                        break;
                    case "MATERIEL":
                        if      (montant >= 100_000) scoreH += 30;
                        else if (montant >=  50_000) scoreH += 20;
                        else if (montant >=  20_000) scoreH += 10;
                        break;
                    default:
                        if      (montant >= 10_000) scoreH += 15;
                        else if (montant >=  5_000) scoreH += 8;
                        else if (montant >=  1_000) scoreH += 3;
                }
                if      (deces >= 3) scoreH += 35;
                else if (deces >= 1) scoreH += 25;
                if      (blesses >= 5) scoreH += 20;
                else if (blesses >= 3) scoreH += 12;
                else if (blesses >= 1) scoreH +=  5;
                if (resp.equals("TOTALE") || resp.equals("100") || resp.equals("T")) scoreH += 15;
                else if (resp.equals("PARTIELLE") || resp.equals("50") || resp.equals("P")) scoreH += 5;
                if (montant > 0 && cumul > 0) {
                    double ratio = cumul / montant;
                    if      (ratio > 2.0) scoreH += 20;
                    else if (ratio > 1.5) scoreH += 10;
                }
                if (!dateSurv.isEmpty() && !dateDecl.isEmpty()) {
                    try {
                        LocalDate d1 = LocalDate.parse(dateSurv.split("[T ]")[0]);
                        LocalDate d2 = LocalDate.parse(dateDecl.split("[T ]")[0]);
                        long days = ChronoUnit.DAYS.between(d1, d2);
                        if      (days > 90) scoreH += 15;
                        else if (days > 30) scoreH += 10;
                        else if (days > 15) scoreH +=  5;
                    } catch (Exception ignored) {}
                }
                scoreH = (int) Math.round(scoreH * 0.85);
                scoreH = Math.min(scoreH, 100);
                int scoreGlobal;
                if (scoreML > 0) {
                    scoreGlobal = (int) Math.round((2.0 * scoreH + 1.0 * scoreML) / 3.0);
                } else {
                    scoreGlobal = scoreH;
                }
                scoreGlobal = Math.min(100, Math.max(0, scoreGlobal));
                jdbcSinistre.update(
                    "UPDATE sinistres SET SCORE_HEURISTIQUE = ?, SCORE_GLOBAL = ? " +
                    "WHERE LTRIM(RTRIM(NUM_SINISTRE)) = ?",
                    (double) scoreH, (double) scoreGlobal, num);
                traites++;
                if      (scoreGlobal >= 75) critiques++;
                else if (scoreGlobal >= 40) moderes++;
                else                        conformes++;
                if (traites % 1000 == 0)
                    System.out.println("[BHGuard] batch: " + traites + "/" + rows.size());
            }
            long duree = System.currentTimeMillis() - t0;
            System.out.println("[BHGuard] batch terminé: " + traites + " en " + duree + "ms");
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("traites",   traites);
            response.put("critiques", critiques);
            response.put("moderes",   moderes);
            response.put("conformes", conformes);
            response.put("dureeMs",   duree);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            System.err.println("[BHGuard] batch ERREUR: " + e.getMessage());
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
    }

    // ── POST calculer scores heuristiques en masse (SCORE_RISQUE) ──────────────
    @PostMapping("/calculer-scores-batch")
    public ResponseEntity<?> calculerScoresBatch() {
        JdbcTemplate jdbc = new JdbcTemplate(sinistreDataSource);

        String sql =
            "WITH scored AS ( " +
            "  SELECT NUM_SINISTRE, " +
            "    CASE WHEN raw_sc > 100 THEN 100 ELSE raw_sc END AS sc " +
            "  FROM ( " +
            "    SELECT NUM_SINISTRE, " +
            "      ISNULL(CASE WHEN ISNULL(MONTANT_EVALUATION,0) > 100000 THEN 35 " +
            "                  WHEN ISNULL(MONTANT_EVALUATION,0) > 50000  THEN 20 " +
            "                  WHEN ISNULL(MONTANT_EVALUATION,0) > 20000  THEN 10 " +
            "                  ELSE 0 END, 0) " +
            "    + ISNULL(CASE WHEN ISNULL(NOMBRE_DECES,0)   > 0 THEN 25 ELSE 0 END, 0) " +
            "    + ISNULL(CASE WHEN ISNULL(NOMBRE_BLESSES,0) > 3 THEN 15 " +
            "                  WHEN ISNULL(NOMBRE_BLESSES,0) > 0 THEN  8 " +
            "                  ELSE 0 END, 0) " +
            "    + CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(CODE_RESPONSABILITE,'')))) IN ('TOTALE','100') THEN 20 ELSE 0 END " +
            "    + CASE WHEN ISNULL(cumul_reglement,0) > ISNULL(MONTANT_EVALUATION,0) * 1.3 " +
            "           AND  ISNULL(MONTANT_EVALUATION,0) > 0 THEN 15 ELSE 0 END " +
            "    + CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(NATURE_SINISTRE,'')))) = 'CORPOREL' THEN 10 ELSE 0 END " +
            "    AS raw_sc " +
            "    FROM sinistres " +
            "    WHERE SCORE_RISQUE IS NULL OR SCORE_RISQUE <= 0 " +
            "  ) t " +
            ") " +
            "UPDATE s SET s.SCORE_RISQUE = scored.sc " +
            "FROM sinistres s " +
            "JOIN scored ON s.NUM_SINISTRE = scored.NUM_SINISTRE";

        long t0      = System.currentTimeMillis();
        int  traites = jdbc.update(sql);
        long duree   = System.currentTimeMillis() - t0;

        Map<String, Object> recap = jdbc.queryForMap(
            "SELECT " +
            "  COUNT(*)                                                              AS total, " +
            "  SUM(CASE WHEN SCORE_RISQUE >= 75                       THEN 1 ELSE 0 END) AS critiques, " +
            "  SUM(CASE WHEN SCORE_RISQUE >= 40 AND SCORE_RISQUE < 75 THEN 1 ELSE 0 END) AS investigation, " +
            "  SUM(CASE WHEN SCORE_RISQUE >  0  AND SCORE_RISQUE < 40 THEN 1 ELSE 0 END) AS conformes, " +
            "  SUM(CASE WHEN ISNULL(SCORE_RISQUE,0) <= 0              THEN 1 ELSE 0 END) AS nonAnalyses " +
            "FROM sinistres"
        );

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("traites",       traites);
        response.put("critiques",     recap.get("critiques"));
        response.put("investigation", recap.get("investigation"));
        response.put("conformes",     recap.get("conformes"));
        response.put("nonAnalyses",   recap.get("nonAnalyses"));
        response.put("totalBase",     recap.get("total"));
        response.put("dureeMs",       duree);
        return ResponseEntity.ok(response);
    }

    // ── POST analyser un sinistre via FastAPI ──────────────────────────────────
    @PostMapping("/{numSinistre}/analyser")
    public ResponseEntity<?> analyserSinistre(
            @PathVariable String numSinistre,
            @RequestBody(required = false) Map<String, Object> extra
    ) {
        Optional<Sinistre> opt = sinistreRepository.findByNumSinistre(numSinistre);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("NUM_SINISTRE", numSinistre);

        Sinistre sinistre = null;
        int scoreBase = 0;

        if (opt.isPresent()) {
            sinistre = opt.get();
            if (sinistre.getScoreRisque() != null && sinistre.getScoreRisque() > 0)
                scoreBase = (int) Math.round(sinistre.getScoreRisque());

            if (sinistre.getMontantEvaluation()  != null) payload.put("MONTANT_EVALUATION",  sinistre.getMontantEvaluation());
            if (sinistre.getNombreBlesses()       != null) payload.put("NOMBRE_BLESSES",      sinistre.getNombreBlesses());
            if (sinistre.getNombreDeces()         != null) payload.put("NOMBRE_DECES",        sinistre.getNombreDeces());
            if (sinistre.getCodeResponsabilite()  != null) payload.put("CODE_RESPONSABILITE", sinistre.getCodeResponsabilite().trim().toUpperCase());
            if (sinistre.getNatureSinistre()      != null) payload.put("NATURE_SINISTRE",     sinistre.getNatureSinistre().trim());
            if (sinistre.getLibEtatSinistre()     != null) payload.put("LIB_ETAT_SINISTRE",   sinistre.getLibEtatSinistre().trim());
            if (sinistre.getNumContrat()          != null) payload.put("NUM_CONTRAT",         sinistre.getNumContrat().trim());
            if (sinistre.getGouvernorat()         != null) payload.put("GOUVERNORAT",         sinistre.getGouvernorat().trim());
            if (sinistre.getDateDeclaration()     != null) payload.put("DATE_DECLARATION",    sinistre.getDateDeclaration());
            if (sinistre.getDateSurvenance()      != null) payload.put("DATE_SURVENANCE",     sinistre.getDateSurvenance());
        }

        if (extra != null) {
            extra.forEach((k, v) -> {
                if (v != null && !k.equals("NUM_SINISTRE")) payload.putIfAbsent(k, v);
            });
        }

        System.out.println("[BHGuard] analyserSinistre " + numSinistre + " scoreBase=" + scoreBase);

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> request = new HttpEntity<>(payload, headers);

            ResponseEntity<Map> response = restTemplate.postForEntity(
                    fastapiUrl + "/predict", request, Map.class);
            Map<?, ?> rawBody = response.getBody();

            int scoreFastApi = 0;
            if (rawBody != null && rawBody.get("score_risque") instanceof Number)
                scoreFastApi = ((Number) rawBody.get("score_risque")).intValue();

            // Score heuristique Java
            int scoreFormule = sinistre != null ? scoreHeuristique(sinistre) : scoreBase;
            if (scoreFormule <= 0) scoreFormule = scoreBase;

            // Score ML FastAPI
            int scoreML = scoreFastApi > 0 ? scoreFastApi : 0;

            // Score global composite (2×Formule + 1×ML) / 3
            int scoreGlobal;
            if (scoreML > 0) {
                scoreGlobal = (int) Math.round((2.0 * scoreFormule + 1.0 * scoreML) / 3.0);
            } else {
                scoreGlobal = scoreFormule;
            }
            scoreGlobal = Math.min(100, Math.max(0, scoreGlobal));

            if (scoreGlobal <= 0 && sinistre != null)
                return ResponseEntity.ok(buildFallback(numSinistre, sinistre));

            System.out.println("[BHGuard] scoreFormule=" + scoreFormule
                + " scoreML=" + scoreML + " scoreGlobal=" + scoreGlobal);

            String niveauGlobal = sinistreService.calculerNiveau(scoreGlobal);

            Map<String, Object> body = new LinkedHashMap<>();
            if (rawBody != null) rawBody.forEach((k, v) -> body.put(String.valueOf(k), v));

            Object flagsObj = body.get("flags_detectes");
            if (!(flagsObj instanceof List) || ((List<?>) flagsObj).isEmpty()) {
                if (sinistre != null) body.put("flags_detectes", buildFlags(sinistre));
            }

            body.put("score_risque",  scoreGlobal);
            body.put("score_formule", scoreFormule);
            body.put("score_ml",      scoreML);
            body.put("niveau_risque", niveauGlobal);
            body.put("est_suspect",   scoreGlobal >= 65);
            body.put("num_sinistre",  numSinistre);

            // Sauvegarder SCORE_HEURISTIQUE + SCORE_GLOBAL en base
            sauvegarderScores(numSinistre, scoreFormule, scoreML, scoreGlobal);

            return ResponseEntity.ok(body);

        } catch (Exception e) {
            if (sinistre != null) {
                Map<String, Object> fallback = buildFallback(numSinistre, sinistre);
                if (scoreBase > 0) {
                    fallback.put("score_risque",  scoreBase);
                    fallback.put("niveau_risque", sinistreService.calculerNiveau(scoreBase));
                    fallback.put("est_suspect",   scoreBase >= 65);
                }
                return ResponseEntity.ok(fallback);
            }
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "FastAPI indisponible : " + e.getMessage(),
                                 "num_sinistre", numSinistre));
        }
    }

    private void sauvegarderScores(String numSinistre, int scoreHeuristique, int scoreML, int scoreGlobal) {
        JdbcTemplate jdbc = new JdbcTemplate(sinistreDataSource);
        try {
            // Tentative complète : SCORE_HEURISTIQUE + SCORE_GLOBAL
            int updated = jdbc.update(
                "UPDATE sinistres SET SCORE_HEURISTIQUE = ?, SCORE_GLOBAL = ? " +
                "WHERE LTRIM(RTRIM(NUM_SINISTRE)) = ?",
                (double) scoreHeuristique, (double) scoreGlobal, numSinistre.trim());
            if (updated == 0)
                jdbc.update(
                    "UPDATE sinistres SET SCORE_HEURISTIQUE = ?, SCORE_GLOBAL = ? WHERE NUM_SINISTRE = ?",
                    (double) scoreHeuristique, (double) scoreGlobal, numSinistre);
            System.out.println("[BHGuard] sauvegarderScores: " + numSinistre
                + " heuristique=" + scoreHeuristique + " global=" + scoreGlobal);
        } catch (Exception ex1) {
            // SCORE_HEURISTIQUE absent → fallback : SCORE_GLOBAL seulement
            System.err.println("[BHGuard] sauvegarderScores fallback (SCORE_GLOBAL only): " + ex1.getMessage());
            try {
                int updated = jdbc.update(
                    "UPDATE sinistres SET SCORE_GLOBAL = ? " +
                    "WHERE LTRIM(RTRIM(NUM_SINISTRE)) = ?",
                    (double) scoreGlobal, numSinistre.trim());
                if (updated == 0)
                    jdbc.update(
                        "UPDATE sinistres SET SCORE_GLOBAL = ? WHERE NUM_SINISTRE = ?",
                        (double) scoreGlobal, numSinistre);
                System.out.println("[BHGuard] sauvegarderScores fallback OK: " + numSinistre + " global=" + scoreGlobal);
            } catch (Exception ex2) {
                System.err.println("[BHGuard] sauvegarderScores ERREUR totale: " + ex2.getMessage());
            }
        }
    }

    // ── POST chat ──────────────────────────────────────────────────────────────
    @PostMapping("/chat")
    public ResponseEntity<?> chat(@RequestBody Map<String, Object> chatPayload) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> request = new HttpEntity<>(chatPayload, headers);
            ResponseEntity<Map> response = restTemplate.postForEntity(
                    fastapiUrl + "/chat-sinistre", request, Map.class);
            return ResponseEntity.ok(response.getBody());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "FastAPI indisponible"));
        }
    }

    private int scoreHeuristique(Sinistre s) {
        return sinistreService.calculerScoreHeuristique(s);
    }

    private List<String> buildFlags(Sinistre s) {
        List<String> flags = new ArrayList<>();
        if (s.getMontantEvaluation() != null) {
            double m = s.getMontantEvaluation();
            if      (m > 500_000) flags.add(String.format("Montant exceptionnel (%.0f TND)", m));
            else if (m > 200_000) flags.add(String.format("Montant très élevé (%.0f TND)", m));
            else if (m > 100_000) flags.add(String.format("Montant élevé (%.0f TND)", m));
            else if (m >  50_000) flags.add(String.format("Montant suspect (%.0f TND)", m));
            else if (m >  20_000) flags.add(String.format("Montant significatif (%.0f TND)", m));
        }
        if (s.getNombreDeces() != null) {
            int d = s.getNombreDeces();
            if      (d >= 3) flags.add(String.format("%d décès déclarés", d));
            else if (d >= 1) flags.add(String.format("%d décès déclaré(s)", d));
        }
        if (s.getNombreBlesses() != null) {
            int b = s.getNombreBlesses();
            if      (b >= 5) flags.add(String.format("%d blessés déclarés (nombre élevé)", b));
            else if (b >= 3) flags.add(String.format("%d blessés déclarés", b));
            else if (b >= 1) flags.add(String.format("%d blessé(s) déclaré(s)", b));
        }
        String resp = s.getCodeResponsabilite() != null ? s.getCodeResponsabilite().trim().toUpperCase() : "";
        if (resp.equals("T") || resp.equals("TOTALE") || resp.equals("100"))
            flags.add("Responsabilité totale déclarée (100%)");
        else if (resp.equals("P") || resp.equals("PARTIELLE") || resp.equals("50"))
            flags.add("Responsabilité partielle déclarée");
        if (s.getDateSurvenance() != null && s.getDateDeclaration() != null) {
            try {
                String s1 = s.getDateSurvenance().split("[T ]")[0];
                String s2 = s.getDateDeclaration().split("[T ]")[0];
                long days = ChronoUnit.DAYS.between(LocalDate.parse(s1), LocalDate.parse(s2));
                if      (days > 90) flags.add("Déclaration très tardive (" + days + " jours après survenance)");
                else if (days > 30) flags.add("Déclaration tardive ("      + days + " jours après survenance)");
                else if (days > 15) flags.add("Déclaration différée ("     + days + " jours après survenance)");
            } catch (Exception ignored) {}
        }
        if (s.getCumulReglement() != null && s.getMontantEvaluation() != null
                && s.getMontantEvaluation() > 0 && s.getCumulReglement() > 0) {
            double cumul = s.getCumulReglement(), montant = s.getMontantEvaluation();
            double ratio = cumul / montant;
            if (ratio > 2.0)
                flags.add(String.format("Règlement très suspect (%.0f TND réglé vs %.0f TND évalué)", cumul, montant));
            else if (ratio > 1.5)
                flags.add(String.format("Règlement suspect (%.0f TND réglé vs %.0f TND évalué)", cumul, montant));
            else if (ratio < 0.3)
                flags.add(String.format("Sous-règlement anormal (%.0f TND réglé vs %.0f TND évalué)", cumul, montant));
        }
        return flags;
    }

    private Map<String, Object> buildFallback(String numSinistre, Sinistre s) {
        int score = scoreHeuristique(s);
        boolean susp = score >= 75;
        String niveau = score >= 75 ? "CRITIQUE" : score >= 40 ? "RISQUE_MODÉRÉ" : "CONFORME";
        List<String> flags = buildFlags(s);
        String explication = String.format(
                "### Analyse Heuristique — Sinistre %s\n\n**Score : %d/100 (%s)**\n\n" +
                "Nature : **%s** | Montant : **%.0f TND** | Blessés : **%d** | Décès : **%d**\n\n%s",
                numSinistre, score, niveau,
                s.getNatureSinistre()    != null ? s.getNatureSinistre()    : "Non précisé",
                s.getMontantEvaluation() != null ? s.getMontantEvaluation() : 0.0,
                s.getNombreBlesses()     != null ? s.getNombreBlesses()     : 0,
                s.getNombreDeces()       != null ? s.getNombreDeces()       : 0,
                susp ? "**Profil suspect — investigation recommandée.**" : "Profil dans les normes.");
        String reco = score >= 75 ? "INVESTIGATION REQUISE — Dossier suspect, demander pièces justificatives." :
                      score >= 40 ? "SURVEILLANCE — Vérification rigoureuse des documents." :
                                    "TRAITEMENT NORMAL — Aucune anomalie majeure.";
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("num_sinistre",   numSinistre);
        result.put("score_risque",   score);
        result.put("score_formule",  score);
        result.put("score_ml",       0);
        result.put("est_suspect",    susp);
        result.put("niveau_risque",  niveau);
        result.put("flags_detectes", flags);
        result.put("explication_ia", explication);
        result.put("recommandation", reco);
        return result;
    }
}