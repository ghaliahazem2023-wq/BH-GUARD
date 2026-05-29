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

    // ── GET tous les sinistres (paginé + filtres niveau / gouvernorat / nature) ─
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
            // Retourner 200 avec error visible pour debug Angular
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
            System.err.println("[BHGuard] /natures ERREUR: " + e.getMessage());
            e.printStackTrace();
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
            System.err.println("[BHGuard] /gouvernorats ERREUR: " + e.getMessage());
            e.printStackTrace();
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
            info.put("status",    "OK");
            info.put("count",     count);
        } catch (Exception e) {
            info.put("status",    "ERREUR");
            info.put("message",   e.getMessage());
            info.put("cause",     e.getCause() != null ? e.getCause().getMessage() : null);
            System.err.println("[BHGuard] /debug ERREUR: " + e.getMessage());
            e.printStackTrace();
        }
        try {
            jdbc.queryForList("SELECT TOP 0 SCORE_RISQUE FROM sinistres");
            info.put("scoreRisqueCol", true);
        } catch (Exception e2) {
            info.put("scoreRisqueCol", false);
        }

        // Lister les bases disponibles via la base primaire (bh_guard_db fonctionne)
        JdbcTemplate jdbcPrimary = new JdbcTemplate(primaryDataSource);
        try {
            List<String> dbs = jdbcPrimary.queryForList(
                "SELECT name FROM sys.databases WHERE name NOT IN ('master','tempdb','model','msdb') ORDER BY name",
                String.class);
            info.put("bases_disponibles", dbs);
        } catch (Exception e3) {
            info.put("bases_disponibles", "impossible de lister: " + e3.getMessage());
        }

        return ResponseEntity.ok(info);
    }

    // ── GET un sinistre par numéro ─────────────────────────
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
                "  ISNULL(SCORE_RISQUE,0)                  AS scoreRisque " +
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
        // CORRECTION 4 — log pour confirmer que SCORE_RISQUE est bien lu depuis BD
        System.out.println("[BHGuard] GET /" + numSinistre.trim() +
                " → scoreRisque=" + dbScore);
        row.put("scoreEstime",  dbScore <= 0);
        row.put("niveauRisque", sinistreService.calculerNiveau((int) dbScore));
        row.put("estSuspect",   dbScore >= 65);
        return ResponseEntity.ok(row);
    }

    // ── GET recherche ──────────────────────────────────────
    @GetMapping("/search")
    public ResponseEntity<?> search(@RequestParam String q) {
        List<Sinistre> results = sinistreRepository.search(q);
        return ResponseEntity.ok(results);
    }

    // ── GET stats dashboard ────────────────────────────────
    @GetMapping("/stats")
    public ResponseEntity<?> getStats() {
        long total = sinistreRepository.count();
        long elevés = sinistreRepository.findSinistresElevés(10000.0).size();
        return ResponseEntity.ok(Map.of(
                "total_sinistres", total,
                "sinistres_montant_eleve", elevés
        ));
    }

    // ── POST calculer scores heuristiques en masse ─────────
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
        response.put("traites",      traites);
        response.put("critiques",    recap.get("critiques"));
        response.put("investigation",recap.get("investigation"));
        response.put("conformes",    recap.get("conformes"));
        response.put("nonAnalyses",  recap.get("nonAnalyses"));
        response.put("totalBase",    recap.get("total"));
        response.put("dureeMs",      duree);
        return ResponseEntity.ok(response);
    }

    // ── POST analyser un sinistre via FastAPI ──────────────
    @PostMapping("/{numSinistre}/analyser")
    public ResponseEntity<?> analyserSinistre(
            @PathVariable String numSinistre,
            @RequestBody(required = false) Map<String, Object> extra
    ) {
        Optional<Sinistre> opt = sinistreRepository.findByNumSinistre(numSinistre);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("NUM_SINISTRE", numSinistre);

        Sinistre sinistre = null;
        // Score batch en base = source de vérité unique
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

            // Déterminer le score final : base BD prime sur FastAPI
            int scoreFinal;
            if (scoreBase > 0) {
                scoreFinal = scoreBase;
                System.out.println("[BHGuard] Score base BD utilisé: " + scoreFinal + " (FastAPI ignoré: " + scoreFastApi + ")");
            } else if (scoreFastApi > 0) {
                scoreFinal = scoreFastApi;
                sauvegarderScore(numSinistre, scoreFinal, true);
                System.out.println("[BHGuard] Score FastAPI fallback: " + scoreFinal + " (base vide)");
            } else {
                int heuristic = sinistre != null ? scoreHeuristique(sinistre) : 0;
                scoreFinal = heuristic;
                if (heuristic > 0) sauvegarderScore(numSinistre, heuristic, false);
                System.out.println("[BHGuard] Score heuristique fallback: " + scoreFinal);
            }

            if (scoreFinal <= 0 && sinistre != null)
                return ResponseEntity.ok(buildFallback(numSinistre, sinistre));

            // Construire la réponse depuis FastAPI (flags + explication) + score BD
            Map<String, Object> body = new LinkedHashMap<>();
            if (rawBody != null) rawBody.forEach((k, v) -> body.put(String.valueOf(k), v));

            Object flagsObj = body.get("flags_detectes");
            if (!(flagsObj instanceof List) || ((List<?>) flagsObj).isEmpty()) {
                if (sinistre != null) body.put("flags_detectes", buildFlags(sinistre));
            }

            // Écraser le score FastAPI par le score source de vérité
            String niveauFinal = sinistreService.calculerNiveau(scoreFinal);
            body.put("score_risque",  scoreFinal);
            body.put("niveau_risque", niveauFinal);
            body.put("est_suspect",   scoreFinal >= 65);
            body.put("num_sinistre",  numSinistre);
            System.out.println("[BHGuard] Réponse finale score_risque=" + scoreFinal + " niveau=" + niveauFinal);

            return ResponseEntity.ok(body);

        } catch (Exception e) {
            // FastAPI hors ligne → fallback avec score BD si dispo, sinon heuristique
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

    /** Persiste SCORE_RISQUE via JdbcTemplate — fiable même quand JPA rate bh_assurance. */
    private void sauvegarderScore(String numSinistre, int score, boolean mlScore) {
        try {
            JdbcTemplate jdbc = new JdbcTemplate(sinistreDataSource);

            // CORRECTION 1 — vérifier d'abord que la ligne existe (debug espaces/casse)
            List<Map<String, Object>> check = jdbc.queryForList(
                "SELECT LTRIM(RTRIM(NUM_SINISTRE)) AS num, SCORE_RISQUE FROM sinistres " +
                "WHERE LTRIM(RTRIM(NUM_SINISTRE)) = ?",
                numSinistre.trim());
            System.out.println("[BHGuard] Sinistre trouvé: " + check.size() + " → " + check);

            // UPDATE avec LTRIM/RTRIM (couvre les espaces trailing classiques SQL Server)
            String cond = mlScore
                ? "WHERE LTRIM(RTRIM(NUM_SINISTRE)) = ?"
                : "WHERE LTRIM(RTRIM(NUM_SINISTRE)) = ? AND (SCORE_RISQUE IS NULL OR SCORE_RISQUE <= 0)";
            int updated = jdbc.update(
                "UPDATE sinistres SET SCORE_RISQUE = ? " + cond,
                (double) score, numSinistre.trim());
            System.out.println("[BHGuard] sauvegarderScore: " + numSinistre +
                " score=" + score + " → " + updated + " ligne(s) mise(s) à jour");

            // Fallback exact match si LTRIM/RTRIM n'a pas suffi
            if (updated == 0) {
                String fallbackCond = mlScore
                    ? "WHERE NUM_SINISTRE = ?"
                    : "WHERE NUM_SINISTRE = ? AND (SCORE_RISQUE IS NULL OR SCORE_RISQUE <= 0)";
                updated = jdbc.update(
                    "UPDATE sinistres SET SCORE_RISQUE = ? " + fallbackCond,
                    (double) score, numSinistre);
                System.out.println("[BHGuard] 2ème tentative (exact match): " + updated + " ligne(s)");
            }
        } catch (Exception ex) {
            System.err.println("[BHGuard] sauvegarderScore ERREUR: " + ex.getMessage());
            ex.printStackTrace();
        }
    }

    // ── POST chat ARIA ─────────────────────────────────────
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

    // ── Helpers privés ────────────────────────────────────────────────────────

    private void persistScore(Sinistre sinistre, Map<String, Object> result) {
        try {
            Object sc = result.get("score_risque");
            if (sc instanceof Number) {
                double score = ((Number) sc).doubleValue();
                if (score > 0) {
                    sinistre.setScoreRisque(score);
                    sinistreRepository.save(sinistre);
                }
            }
        } catch (Exception ignored) {}
    }

    private int scoreHeuristique(Sinistre s) {
        return sinistreService.calculerScoreHeuristique(s);
    }

    private List<String> buildFlags(Sinistre s) {
        List<String> flags = new ArrayList<>();

        // ── Montant ───────────────────────────────────────────────────────────
        if (s.getMontantEvaluation() != null) {
            double m = s.getMontantEvaluation();
            if      (m > 500_000) flags.add(String.format(Locale.US, "Montant exceptionnel (%,.0f TND)", m));
            else if (m > 200_000) flags.add(String.format(Locale.US, "Montant très élevé (%,.0f TND)", m));
            else if (m > 100_000) flags.add(String.format(Locale.US, "Montant élevé (%,.0f TND)", m));
            else if (m >  50_000) flags.add(String.format(Locale.US, "Montant suspect (%,.0f TND)", m));
            else if (m >  20_000) flags.add(String.format(Locale.US, "Montant significatif (%,.0f TND)", m));
        }

        // ── Décès ─────────────────────────────────────────────────────────────
        if (s.getNombreDeces() != null) {
            int d = s.getNombreDeces();
            if      (d >= 3) flags.add(String.format("%d décès déclarés", d));
            else if (d >= 1) flags.add(String.format("%d décès déclaré(s)", d));
        }

        // ── Blessés ───────────────────────────────────────────────────────────
        if (s.getNombreBlesses() != null) {
            int b = s.getNombreBlesses();
            if      (b >= 5) flags.add(String.format("%d blessés déclarés (nombre élevé)", b));
            else if (b >= 3) flags.add(String.format("%d blessés déclarés", b));
            else if (b >= 1) flags.add(String.format("%d blessé(s) déclaré(s)", b));
        }

        // ── Responsabilité ────────────────────────────────────────────────────
        String resp = s.getCodeResponsabilite() != null
                      ? s.getCodeResponsabilite().trim().toUpperCase() : "";
        if (resp.equals("T") || resp.equals("TOTALE") || resp.equals("100"))
            flags.add("Responsabilité totale déclarée (100%)");
        else if (resp.equals("P") || resp.equals("PARTIELLE") || resp.equals("50"))
            flags.add("Responsabilité partielle déclarée");

        // ── Déclaration tardive ───────────────────────────────────────────────
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

        // ── Règlement suspect ─────────────────────────────────────────────────
        if (s.getCumulReglement() != null && s.getMontantEvaluation() != null
                && s.getMontantEvaluation() > 0 && s.getCumulReglement() > 0) {
            double cumul   = s.getCumulReglement();
            double montant = s.getMontantEvaluation();
            double ratio   = cumul / montant;
            if (ratio > 2.0)
                flags.add(String.format(Locale.US,
                    "Règlement très suspect (%,.0f TND réglé vs %,.0f TND évalué)", cumul, montant));
            else if (ratio > 1.5)
                flags.add(String.format(Locale.US,
                    "Règlement suspect (%,.0f TND réglé vs %,.0f TND évalué)", cumul, montant));
            else if (ratio < 0.3)
                flags.add(String.format(Locale.US,
                    "Sous-règlement anormal (%,.0f TND réglé vs %,.0f TND évalué)", cumul, montant));
        }

        return flags;
    }

    private Map<String, Object> buildFallback(String numSinistre, Sinistre s) {
        int score    = scoreHeuristique(s);
        boolean susp = score >= 75;
        String niveau = score >= 75 ? "CRITIQUE" : score >= 40 ? "INVESTIGATION" : "CONFORME";

        List<String> flags = buildFlags(s);

        String explication = String.format(
                "### Analyse Heuristique — Sinistre %s\n\n" +
                "**Score : %d/100 (%s)**\n\n" +
                "Nature : **%s** | Montant : **%.0f TND** | Blessés : **%d** | Décès : **%d**\n\n%s",
                numSinistre, score, niveau,
                s.getNatureSinistre()    != null ? s.getNatureSinistre()    : "Non précisé",
                s.getMontantEvaluation() != null ? s.getMontantEvaluation() : 0.0,
                s.getNombreBlesses()     != null ? s.getNombreBlesses()     : 0,
                s.getNombreDeces()       != null ? s.getNombreDeces()       : 0,
                susp ? "**Profil suspect — investigation recommandée.**"
                      : "Profil dans les normes. Traitement habituel."
        );

        String reco = score >= 75 ? "INVESTIGATION REQUISE — Dossier suspect, demander pièces justificatives." :
                      score >= 40 ? "SURVEILLANCE — Vérification rigoureuse des documents." :
                                    "TRAITEMENT NORMAL — Aucune anomalie majeure.";

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("num_sinistre",   numSinistre);
        result.put("score_risque",   score);
        result.put("est_suspect",    susp);
        result.put("niveau_risque",  niveau);
        result.put("flags_detectes", flags);
        result.put("explication_ia", explication);
        result.put("recommandation", reco);
        return result;
    }

}
