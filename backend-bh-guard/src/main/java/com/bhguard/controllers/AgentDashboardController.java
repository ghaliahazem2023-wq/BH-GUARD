package com.bhguard.controllers;

import com.bhguard.repositories.DecisionFraudeRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import javax.sql.DataSource;
import java.util.*;
import java.util.Collections;

@RestController
@RequestMapping("/api/agent")
public class AgentDashboardController {

    @Autowired
    @Qualifier("sinistreDataSource")
    private DataSource sinistreDataSource;

    @Autowired
    private DecisionFraudeRepository decisionFraudeRepository;

    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getDashboard(
            @RequestParam(required = false, defaultValue = "") String username,
            @RequestParam(required = false, defaultValue = "") String annee) {
        JdbcTemplate jdbc = new JdbcTemplate(sinistreDataSource);
        Map<String, Object> result = new LinkedHashMap<>();

        try {
            Long total = jdbc.queryForObject("SELECT COUNT(*) FROM sinistres", Long.class);
            long totalSinistres = total != null ? total : 0;
            result.put("totalSinistres", totalSinistres);

            Double delai = null;
            try {
                delai = jdbc.queryForObject(
                    "SELECT AVG(CAST(DATEDIFF(day, DATE_SURVENANCE, DATE_DECLARATION) AS FLOAT)) " +
                    "FROM sinistres " +
                    "WHERE DATE_SURVENANCE IS NOT NULL AND DATE_DECLARATION IS NOT NULL " +
                    "  AND DATEDIFF(day, DATE_SURVENANCE, DATE_DECLARATION) BETWEEN 0 AND 365",
                    Double.class);
            } catch (Exception ignored) {}
            result.put("delaiMoyenJours", delai != null ? (long) Math.round(delai) : 0L);

            long critique = 0, investigation = 0, conforme = 0, totalScores = 0;
            List<Map<String, Object>> repartition = new ArrayList<>();
            try {
                Map<String, Object> dist = jdbc.queryForMap(
                    "SELECT " +
                    "  SUM(CASE WHEN SCORE_RISQUE >= 75 THEN 1 ELSE 0 END) AS critique, " +
                    "  SUM(CASE WHEN SCORE_RISQUE >= 40 AND SCORE_RISQUE < 75 THEN 1 ELSE 0 END) AS investigation, " +
                    "  SUM(CASE WHEN SCORE_RISQUE > 0  AND SCORE_RISQUE < 40 THEN 1 ELSE 0 END) AS conforme " +
                    "FROM sinistres WHERE SCORE_RISQUE IS NOT NULL AND SCORE_RISQUE > 0");

                critique      = toLong(dist.get("critique"));
                investigation = toLong(dist.get("investigation"));
                conforme      = toLong(dist.get("conforme"));
                totalScores   = critique + investigation + conforme;

                if (totalScores > 0) {
                    repartition.add(mapOf("niveau", "Critique (≥75%)",       "count", critique,
                            "pct", Math.max(1L, Math.round(critique * 100.0 / totalScores)),      "color", "#dc2626"));
                    repartition.add(mapOf("niveau", "Investigation (40-74%)", "count", investigation,
                            "pct", Math.max(1L, Math.round(investigation * 100.0 / totalScores)), "color", "#d97706"));
                    repartition.add(mapOf("niveau", "Conforme (<40%)",        "count", conforme,
                            "pct", Math.round(conforme * 100.0 / totalScores),                    "color", "#16a34a"));
                }
                result.put("tauxFraude", totalScores > 0
                        ? (Math.round(critique * 1000.0 / totalScores) / 10.0) : 0.0);

            } catch (Exception eDist) {
                System.err.println("[BHGuard] distSql ERREUR: " + eDist.getMessage());
                result.put("tauxFraude", 0.0);
            }

            result.put("dossiersCritiques",      critique);
            result.put("enInvestigation",        investigation);
            result.put("sinistresInvestigation", investigation);
            result.put("conformes",              conforme);
            result.put("sinistresConformes",     conforme);
            result.put("repartitionRisque",      repartition);

            List<Map<String, Object>> topGovs = new ArrayList<>();
            try {
                String govSql =
                    "SELECT TOP 6 LTRIM(RTRIM(GOUVERNORAT)) AS gov, COUNT(*) AS cnt " +
                    "FROM sinistres " +
                    "WHERE GOUVERNORAT IS NOT NULL " +
                    "  AND LEN(LTRIM(RTRIM(GOUVERNORAT))) > 0 " +
                    "  AND SCORE_RISQUE IS NOT NULL AND SCORE_RISQUE > 0 " +
                    (annee.isBlank() ? "" :
                    "  AND LEFT(DATE_DECLARATION, 4) = '" + annee + "' ") +
                    "GROUP BY LTRIM(RTRIM(GOUVERNORAT)) ORDER BY cnt DESC";

                List<Map<String, Object>> govRows = jdbc.queryForList(govSql);
                String[] govColors = {"#1a56db","#3b82f6","#f59e0b","#ea580c","#dc2626","#16a34a"};
                long maxGov = govRows.isEmpty() ? 1 : toLong(govRows.get(0).get("cnt"));
                for (int i = 0; i < govRows.size(); i++) {
                    long cnt = toLong(govRows.get(i).get("cnt"));
                    topGovs.add(mapOf(
                            "nom",   safeStr(govRows.get(i).get("gov")),
                            "count", cnt,
                            "pct",   maxGov > 0 ? Math.round(cnt * 100.0 / maxGov) : 0L,
                            "color", govColors[Math.min(i, govColors.length - 1)]
                    ));
                }
            } catch (Exception eGov) {
                System.err.println("[BHGuard] topGouvernorats ERREUR: " + eGov.getMessage());
            }
            result.put("topGouvernorats", topGovs);

            List<Map<String, Object>> topMotifs = new ArrayList<>();
            try {
                Map<String, Object> motifsRow = jdbc.queryForMap(
                    "SELECT " +
                    "  SUM(CASE WHEN ISNULL(MONTANT_EVALUATION,0) >= 20000 THEN 1 ELSE 0 END) AS montant_eleve, " +
                    "  SUM(CASE WHEN ISNULL(NOMBRE_DECES,0)   > 0 THEN 1 ELSE 0 END) AS deces, " +
                    "  SUM(CASE WHEN ISNULL(NOMBRE_BLESSES,0) > 1 THEN 1 ELSE 0 END) AS blesses_multi, " +
                    "  SUM(CASE WHEN LTRIM(RTRIM(ISNULL(CODE_RESPONSABILITE,''))) = 'T' THEN 1 ELSE 0 END) AS resp_totale, " +
                    "  SUM(CASE WHEN LTRIM(RTRIM(ISNULL(DATE_SURVENANCE,''))) <> '' " +
                    "           AND LTRIM(RTRIM(ISNULL(DATE_DECLARATION,''))) <> '' " +
                    "           AND DATEDIFF(day,TRY_CAST(DATE_SURVENANCE AS DATE),TRY_CAST(DATE_DECLARATION AS DATE)) > 5 " +
                    "      THEN 1 ELSE 0 END) AS tardive FROM sinistres");
                addMotif(topMotifs, "Montant élevé (≥ 20 000 TND)", toLong(motifsRow.get("montant_eleve")), totalSinistres, "#d97706");
                addMotif(topMotifs, "Déclaration tardive (> 5 j)",  toLong(motifsRow.get("tardive")),       totalSinistres, "#ea580c");
                addMotif(topMotifs, "Décès déclaré(s)",             toLong(motifsRow.get("deces")),         totalSinistres, "#dc2626");
                addMotif(topMotifs, "Blessés multiples (> 1)",      toLong(motifsRow.get("blesses_multi")), totalSinistres, "#f59e0b");
                addMotif(topMotifs, "Responsabilité totale",        toLong(motifsRow.get("resp_totale")),   totalSinistres, "#8b5cf6");
                topMotifs.sort((a, b) -> Long.compare(toLong(b.get("count")), toLong(a.get("count"))));
            } catch (Exception eMotifs) {
                System.err.println("[BHGuard] topMotifs ERREUR: " + eMotifs.getMessage());
            }
            result.put("topMotifs", topMotifs);

            List<Map<String, Object>> alertes = new ArrayList<>();
            try {
                List<Map<String, Object>> alerteRows = jdbc.queryForList(
                    "SELECT TOP 15 NUM_SINISTRE, LTRIM(RTRIM(NATURE_SINISTRE)) AS NATURE_SINISTRE, " +
                    "  MONTANT_EVALUATION, NOMBRE_DECES, NOMBRE_BLESSES, CODE_RESPONSABILITE, " +
                    "  LTRIM(RTRIM(GOUVERNORAT)) AS GOUVERNORAT, DATE_DECLARATION, " +
                    "  ISNULL(SCORE_RISQUE, 0) AS SCORE_RISQUE " +
                    "FROM sinistres WHERE SCORE_RISQUE >= 65 ORDER BY SCORE_RISQUE DESC");
                for (Map<String, Object> row : alerteRows) {
                    int score = (int) safeDouble(row.get("SCORE_RISQUE"));
                    Map<String, Object> a = new LinkedHashMap<>();
                    a.put("numSinistre", safeStr(row.get("NUM_SINISTRE")));
                    a.put("nature",      safeStr(row.get("NATURE_SINISTRE")));
                    a.put("montant",     safeDouble(row.get("MONTANT_EVALUATION")));
                    a.put("gouvernorat", safeStr(row.get("GOUVERNORAT")));
                    a.put("score",       score);
                    a.put("date",        row.get("DATE_DECLARATION") != null
                            ? row.get("DATE_DECLARATION").toString().split("T")[0].split(" ")[0] : "—");
                    alertes.add(a);
                }
            } catch (Exception eAlertes) {
                System.err.println("[BHGuard] alertesNonTraitees ERREUR: " + eAlertes.getMessage());
            }
            result.put("alertesNonTraitees", alertes);

            List<Map<String, Object>> dernieres = new ArrayList<>();
            try {
                List<Map<String, Object>> derRows = jdbc.queryForList(
                    "SELECT TOP 6 NUM_SINISTRE, LTRIM(RTRIM(NATURE_SINISTRE)) AS NATURE_SINISTRE, " +
                    "  MONTANT_EVALUATION, NOMBRE_DECES, NOMBRE_BLESSES, CODE_RESPONSABILITE, " +
                    "  ISNULL(SCORE_RISQUE, 0) AS SCORE_RISQUE " +
                    "FROM sinistres WHERE SCORE_RISQUE IS NOT NULL AND SCORE_RISQUE > 0 " +
                    "ORDER BY SCORE_RISQUE DESC");
                for (Map<String, Object> row : derRows) {
                    Map<String, Object> d = new LinkedHashMap<>();
                    d.put("numSinistre", safeStr(row.get("NUM_SINISTRE")));
                    d.put("nature",      safeStr(row.get("NATURE_SINISTRE")));
                    d.put("montant",     safeDouble(row.get("MONTANT_EVALUATION")));
                    d.put("score",       (int) safeDouble(row.get("SCORE_RISQUE")));
                    dernieres.add(d);
                }
            } catch (Exception eDer) {
                System.err.println("[BHGuard] dernieresSinistres ERREUR: " + eDer.getMessage());
            }
            result.put("dernieresSinistres", dernieres);

            long decisionsPrises = 0L;
            try {
                decisionsPrises = username.isBlank()
                        ? decisionFraudeRepository.count()
                        : decisionFraudeRepository.findByAgentUsernameOrderByDateDecisionDesc(username).size();
            } catch (Exception eDec) {
                System.err.println("[BHGuard] decisionsPrises ERREUR: " + eDec.getMessage());
            }
            result.put("decisionsPrises", decisionsPrises);
            result.put("analysesJour",    0L);

            List<Map<String, Object>> evolutionMensuelle = new ArrayList<>();
            try {
                List<Map<String, Object>> evoRows = jdbc.queryForList(
                    "SELECT TOP 24 " +
                    "  LEFT(DATE_DECLARATION, 7) AS mois, " +
                    "  COUNT(*) AS total, " +
                    "  SUM(CASE WHEN SCORE_RISQUE >= 75 THEN 1 ELSE 0 END) AS critiques, " +
                    "  SUM(CASE WHEN SCORE_RISQUE >= 40 AND SCORE_RISQUE < 75 THEN 1 ELSE 0 END) AS investigation, " +
                    "  SUM(CASE WHEN SCORE_RISQUE > 0 AND SCORE_RISQUE < 40 THEN 1 ELSE 0 END) AS conformes " +
                    "FROM sinistres " +
                    "WHERE DATE_DECLARATION IS NOT NULL " +
                    "  AND LEN(DATE_DECLARATION) >= 7 " +
                    "  AND SCORE_RISQUE IS NOT NULL AND SCORE_RISQUE > 0 " +
                    "GROUP BY LEFT(DATE_DECLARATION, 7) " +
                    "ORDER BY LEFT(DATE_DECLARATION, 7) DESC"
                );
                Collections.reverse(evoRows);
                for (Map<String, Object> row : evoRows) {
                    Map<String, Object> e = new LinkedHashMap<>();
                    e.put("mois",          safeStr(row.get("mois")));
                    e.put("total",         toLong(row.get("total")));
                    e.put("critiques",     toLong(row.get("critiques")));
                    e.put("investigation", toLong(row.get("investigation")));
                    e.put("conformes",     toLong(row.get("conformes")));
                    evolutionMensuelle.add(e);
                }
            } catch (Exception eEvo) {
                System.err.println("[BHGuard] evolutionMensuelle ERREUR: " + eEvo.getMessage());
            }
            result.put("evolutionMensuelle", evolutionMensuelle);

        } catch (Exception e) {
            System.err.println("[BHGuard] getDashboard ERREUR: " + e.getMessage());
            result.put("error", e.getMessage());
        }

        return ResponseEntity.ok(result);
    }

    private void addMotif(List<Map<String, Object>> list, String label, long count, long total, String color) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("motif", label);
        m.put("count", count);
        m.put("pct",   total > 0 ? (long) Math.round(count * 100.0 / total) : 0L);
        m.put("color", color);
        list.add(m);
    }

    private Map<String, Object> mapOf(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length - 1; i += 2) m.put(kv[i].toString(), kv[i + 1]);
        return m;
    }

    private long toLong(Object o) {
        if (o == null) return 0;
        if (o instanceof Number) return ((Number) o).longValue();
        try { return Long.parseLong(o.toString()); } catch (Exception e) { return 0; }
    }

    private double safeDouble(Object o) {
        if (o == null) return 0.0;
        if (o instanceof Number) return ((Number) o).doubleValue();
        try { return Double.parseDouble(o.toString()); } catch (Exception e) { return 0.0; }
    }

    private int safeInt(Object o) {
        if (o == null) return 0;
        if (o instanceof Number) return ((Number) o).intValue();
        try { return Integer.parseInt(o.toString()); } catch (Exception e) { return 0; }
    }

    private String safeStr(Object o) {
        return o != null ? o.toString().trim() : "—";
    }
}
