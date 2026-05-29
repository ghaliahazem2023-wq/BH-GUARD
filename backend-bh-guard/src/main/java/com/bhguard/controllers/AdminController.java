package com.bhguard.controllers;

import com.bhguard.models.Sinistre;
import com.bhguard.models.User;
import com.bhguard.models.LoginHistory;
import com.bhguard.repositories.SinistreRepository;
import com.bhguard.services.BatchMLService;
import com.bhguard.services.SinistreService;
import com.bhguard.services.UserService;
import com.bhguard.services.LoginHistoryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import javax.sql.DataSource;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    @Autowired private UserService userService;
    @Autowired private LoginHistoryService loginHistoryService;
    @Autowired private SinistreService sinistreService;
    @Autowired private BatchMLService batchMLService;
    @Autowired private SinistreRepository sinistreRepository;

    @Autowired
    @Qualifier("sinistreDataSource")
    private DataSource sinistreDataSource;

    @Autowired
    @Qualifier("primaryDataSource")
    private DataSource primaryDataSource;

    // ─── Statistiques globales ───────────────────────────────
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        Map<String, Object> stats = new HashMap<>();
        long totalUsers = userService.countAll();
        long admins     = userService.countByRole("ADMINISTRATEUR");
        long agents     = userService.countByRole("AGENT_ANTI_FRAUDE");
        List<Sinistre> tous = sinistreRepository.findAll();
        long totalSinistres = tous.size();
        long enCours  = tous.stream().filter(s -> "EN COURS".equalsIgnoreCase(s.getLibEtatSinistre())).count();
        long clos     = tous.stream().filter(s -> "CLOS".equalsIgnoreCase(s.getLibEtatSinistre())).count();
        long suspects = tous.stream().filter(s -> scoreRisque(s) >= 65).count();
        double tauxFraude = totalSinistres > 0 ? (suspects * 100.0 / totalSinistres) : 0.0;
        stats.put("totalUtilisateurs",  totalUsers);
        stats.put("administrateurs",    admins);
        stats.put("agentsAntiFraude",   agents);
        stats.put("totalSinistres",     totalSinistres);
        stats.put("sinistresEnCours",   enCours);
        stats.put("sinistresValides",   clos);
        stats.put("sinistresRejetes",   0);
        stats.put("tauxFraude",         Math.round(tauxFraude * 10.0) / 10.0);
        stats.put("alertesActives",     suspects);
        stats.put("contratsAnalyses",   totalSinistres);
        return ResponseEntity.ok(stats);
    }

    // ─── Utilisateurs ────────────────────────────────────────
    @GetMapping("/users")
    public ResponseEntity<List<User>> getAllUsers() {
        return ResponseEntity.ok(userService.findAll());
    }

    @PostMapping("/users")
    public ResponseEntity<User> createUser(@RequestBody User user) {
        return ResponseEntity.ok(userService.createUser(user));
    }

    @PutMapping("/users/{id}")
    public ResponseEntity<User> updateUser(@PathVariable Long id, @RequestBody User user) {
        return ResponseEntity.ok(userService.updateUser(id, user));
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        userService.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/users/{id}/toggle")
    public ResponseEntity<User> toggleUserStatus(@PathVariable Long id) {
        return ResponseEntity.ok(userService.toggleStatus(id));
    }

    // ─── Historique des connexions ────────────────────────────
    @GetMapping("/login-history")
    public ResponseEntity<List<Map<String, Object>>> getLoginHistory() {
        JdbcTemplate jdbc = new JdbcTemplate(primaryDataSource);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT id, username, status, loginDate, utilisateur, statut, date, heure, adresseIp " +
            "FROM LoginHistory ORDER BY id DESC"
        );
        List<Map<String, Object>> result = rows.stream().map(row -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id", row.get("id"));
            String user = row.get("utilisateur") != null && !row.get("utilisateur").toString().isBlank()
                        ? row.get("utilisateur").toString()
                        : row.get("username") != null ? row.get("username").toString() : "—";
            m.put("utilisateur", user);
            String statut = null;
            if (row.get("statut") != null && !row.get("statut").toString().isBlank()) {
                statut = row.get("statut").toString();
            } else if (row.get("status") != null) {
                statut = row.get("status").toString().equalsIgnoreCase("SUCCESS") ? "SUCCÈS" : "ÉCHEC";
            }
            m.put("statut", statut != null ? statut : "—");
            if (row.get("date") != null && !row.get("date").toString().isBlank()) {
                m.put("date",  row.get("date").toString());
                m.put("heure", row.get("heure") != null ? row.get("heure").toString() : "—");
            } else if (row.get("loginDate") != null) {
                String dt = row.get("loginDate").toString();
                String[] parts = dt.split("T|\\s");
                m.put("date",  parts.length > 0 ? parts[0] : "—");
                m.put("heure", parts.length > 1 ? parts[1].substring(0, Math.min(5, parts[1].length())) : "—");
            } else {
                m.put("date",  "—");
                m.put("heure", "—");
            }
            m.put("adresseIp", row.get("adresseIp") != null ? row.get("adresseIp").toString() : null);
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    // ─── Sinistres suspects ───────────────────────────────────
    @GetMapping("/sinistres/suspects")
    public ResponseEntity<List<Map<String, Object>>> getSinistresSuspects() {
        JdbcTemplate jdbcSinistres = new JdbcTemplate(sinistreDataSource);
        JdbcTemplate jdbcGuard    = new JdbcTemplate(primaryDataSource);

        List<Map<String, Object>> rows = jdbcSinistres.queryForList(
            "SELECT TOP 200 NUM_SINISTRE, NUM_CONTRAT, DATE_DECLARATION, DATE_SURVENANCE, DATE_OUVERTURE, " +
            "NATURE_SINISTRE, TYPE_SINISTRE, MONTANT_EVALUATION, Total_SAP_Final, cumul_reglement, " +
            "NOMBRE_BLESSES, NOMBRE_DECES, CODE_RESPONSABILITE, LIB_ETAT_SINISTRE, " +
            "GOUVERNORAT, LIEU_ACCIDENT, SCORE_RISQUE, CODE_TYPE_CONTRAT " +
            "FROM sinistres ORDER BY MONTANT_EVALUATION DESC"
        );

        Map<String, Map<String, Object>> decisions = new HashMap<>();
        try {
            List<Map<String, Object>> decisionRows = jdbcGuard.queryForList(
                "SELECT numSinistre, decision, commentaireAgent, dateDecision, " +
                "agentUsername, niveauRisque, scoreRisque, motifs " +
                "FROM decisions_fraude ORDER BY dateDecision DESC"
            );
            for (Map<String, Object> d : decisionRows) {
                String num = d.get("numSinistre") != null ? d.get("numSinistre").toString() : "";
                if (!decisions.containsKey(num)) decisions.put(num, d);
            }
        } catch (Exception e) {
            System.out.println("[AdminController] decisions_fraude error: " + e.getMessage());
        }

        List<Map<String, Object>> suspects = rows.stream().map(row -> {
            Double  montant = toDouble(row.get("MONTANT_EVALUATION"));
            Integer deces   = toInt(row.get("NOMBRE_DECES"));
            Integer blesses = toInt(row.get("NOMBRE_BLESSES"));
            String  resp    = toString(row.get("CODE_RESPONSABILITE"));
            Double  scoreDb = toDouble(row.get("SCORE_RISQUE"));
            String  numSin  = toString(row.get("NUM_SINISTRE"));

            int score;
            if (scoreDb != null && scoreDb > 0) {
                score = scoreDb.intValue();
            } else {
                score = 0;
                if (montant != null) {
                    if      (montant >= 100000) score += 40;
                    else if (montant >= 50000)  score += 30;
                    else if (montant >= 20000)  score += 20;
                    else if (montant >= 10000)  score += 10;
                }
                if (deces   != null && deces   > 0) score += 30;
                if (blesses != null && blesses > 1) score += 15;
                if ("T".equalsIgnoreCase(resp))      score += 15;
                score = Math.min(score, 100);
            }

            Map<String, Object> decision = decisions.get(numSin);
            Map<String, Object> m = new HashMap<>();
            m.put("id",              numSin);
            m.put("numeroContrat",   toString(row.get("NUM_CONTRAT")));
            m.put("assure",          toString(row.get("NUM_CONTRAT")));
            m.put("montant",         montant != null ? montant : 0.0);
            m.put("scoreRisque",     score);
            m.put("statut",          score >= 80 ? "SUSPECT" : "EN_ANALYSE");
            m.put("dateSignalement", row.get("DATE_DECLARATION") != null
                    ? row.get("DATE_DECLARATION").toString()
                    : row.get("DATE_SURVENANCE") != null ? row.get("DATE_SURVENANCE").toString() : "—");
            m.put("typeAssurance",   typeAssurance(toString(row.get("NATURE_SINISTRE"))));
            m.put("natureSinistre",  toString(row.get("NATURE_SINISTRE")));
            m.put("typeSinistre",    toString(row.get("TYPE_SINISTRE")));
            m.put("gouvernorat",     toString(row.get("GOUVERNORAT")));
            m.put("lieuAccident",    toString(row.get("LIEU_ACCIDENT")));
            m.put("dateSurvenance",  toString(row.get("DATE_SURVENANCE")));
            m.put("dateOuverture",   toString(row.get("DATE_OUVERTURE")));
            m.put("libEtatSinistre", toString(row.get("LIB_ETAT_SINISTRE")));
            m.put("nombreBlesses",   blesses != null ? blesses : 0);
            m.put("nombreDeces",     deces   != null ? deces   : 0);
            m.put("totalSapFinal",   toDouble(row.get("Total_SAP_Final")));
            m.put("cumulReglement",  toDouble(row.get("cumul_reglement")));
            m.put("codeTypeContrat", toString(row.get("CODE_TYPE_CONTRAT")));
            if (decision != null) {
                m.put("decisionAgent",    toString(decision.get("decision")));
                m.put("commentaireAgent", toString(decision.get("commentaireAgent")));
                m.put("dateDecision",     decision.get("dateDecision") != null ? decision.get("dateDecision").toString().substring(0, 10) : "—");
                m.put("agentUsername",    toString(decision.get("agentUsername")));
                m.put("motifs",           toString(decision.get("motifs")));
            } else {
                m.put("decisionAgent",    "EN_ATTENTE");
                m.put("commentaireAgent", "—");
                m.put("dateDecision",     "—");
                m.put("agentUsername",    "—");
                m.put("motifs",           "—");
            }
            return m;
        }).collect(Collectors.toList());

        return ResponseEntity.ok(suspects);
    }

    // ─── Toutes les décisions agents ─────────────────────────
    @GetMapping("/decisions")
    public ResponseEntity<List<Map<String, Object>>> getAllDecisions() {
        JdbcTemplate jdbc = new JdbcTemplate(primaryDataSource);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT id, agentUsername, commentaireAgent, dateDecision, " +
            "decision, motifs, niveauRisque, numSinistre, scoreRisque " +
            "FROM decisions_fraude ORDER BY dateDecision DESC"
        );
        return ResponseEntity.ok(rows.stream().map(row -> {
            Map<String, Object> m = new HashMap<>();
            m.put("id",               row.get("id"));
            m.put("agentUsername",    toString(row.get("agentUsername")));
            m.put("commentaireAgent", toString(row.get("commentaireAgent")));
            m.put("decision",         toString(row.get("decision")));
            m.put("motifs",           toString(row.get("motifs")));
            m.put("niveauRisque",     toString(row.get("niveauRisque")));
            m.put("numSinistre",      toString(row.get("numSinistre")));
            m.put("scoreRisque",      row.get("scoreRisque") != null ? row.get("scoreRisque") : 0);
            Object dt = row.get("dateDecision");
            m.put("dateDecision", dt != null
                ? dt.toString().substring(0, Math.min(16, dt.toString().length())).replace("T", " ")
                : "—");
            return m;
        }).collect(Collectors.toList()));
    }

    // ─── Stats décisions ─────────────────────────────────────
    @GetMapping("/decisions/stats")
    public ResponseEntity<Map<String, Object>> getDecisionsStats() {
        JdbcTemplate jdbc = new JdbcTemplate(primaryDataSource);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT decision, COUNT(*) as total FROM decisions_fraude GROUP BY decision"
        );
        long fraude = 0, conforme = 0, investigation = 0, total = 0;
        for (Map<String, Object> row : rows) {
            String dec   = toString(row.get("decision"));
            long   count = ((Number) row.get("total")).longValue();
            total += count;
            if ("FRAUDE".equalsIgnoreCase(dec))        fraude        = count;
            if ("CONFORME".equalsIgnoreCase(dec))      conforme      = count;
            if ("INVESTIGATION".equalsIgnoreCase(dec)) investigation = count;
        }
        Map<String, Object> stats = new HashMap<>();
        stats.put("total",         total);
        stats.put("fraude",        fraude);
        stats.put("conforme",      conforme);
        stats.put("investigation", investigation);
        return ResponseEntity.ok(stats);
    }

    // ─── Diagnostic ─────────────────────────────────────────
    @GetMapping("/db-tables")
    public ResponseEntity<List<String>> getDbTables() {
        JdbcTemplate jdbc = new JdbcTemplate(sinistreDataSource);
        return ResponseEntity.ok(jdbc.queryForList(
            "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME",
            String.class));
    }

    // ─── Helpers ─────────────────────────────────────────────
    private Double  toDouble(Object o) {
        if (o == null) return null;
        if (o instanceof Double)  return (Double) o;
        if (o instanceof Number)  return ((Number) o).doubleValue();
        try { return Double.parseDouble(o.toString()); } catch (Exception e) { return null; }
    }
    private Integer toInt(Object o) {
        if (o == null) return null;
        if (o instanceof Integer) return (Integer) o;
        if (o instanceof Number)  return ((Number) o).intValue();
        try { return Integer.parseInt(o.toString()); } catch (Exception e) { return null; }
    }
    private String toString(Object o) { return o != null ? o.toString().trim() : "—"; }

    private int scoreRisque(Sinistre s) {
        int score = 0;
        if (s.getMontantEvaluation() != null) {
            if      (s.getMontantEvaluation() >= 100000) score += 40;
            else if (s.getMontantEvaluation() >= 50000)  score += 30;
            else if (s.getMontantEvaluation() >= 20000)  score += 20;
            else if (s.getMontantEvaluation() >= 10000)  score += 10;
        }
        if (s.getNombreDeces()   != null && s.getNombreDeces()   > 0) score += 30;
        if (s.getNombreBlesses() != null && s.getNombreBlesses() > 1) score += 15;
        if ("T".equalsIgnoreCase(s.getCodeResponsabilite()))           score += 15;
        return Math.min(score, 100);
    }

    private String typeAssurance(String nature) {
        if (nature == null) return "Autre";
        String n = nature.toUpperCase();
        if (n.contains("CORPO"))                        return "Corporel";
        if (n.contains("MATER"))                        return "Matériel";
        if (n.contains("AUTO") || n.contains("VEHIC"))  return "Auto";
        if (n.contains("HAB")  || n.contains("IMMEU"))  return "Habitation";
        if (n.contains("SANT") || n.contains("MALAD"))  return "Santé";
        if (n.contains("VIE")  || n.contains("DECES"))  return "Vie";
        return nature;
    }


    // ─── Sinistres par mois ───────────────────────────────────
    @GetMapping("/stats/sinistres-par-mois")
    public ResponseEntity<Map<String, Object>> getSinistreParMois() {
        JdbcTemplate jdbc = new JdbcTemplate(sinistreDataSource);
        Map<String, Object> result = new HashMap<>();
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT LEFT(DATE_DECLARATION, 7) as mois_annee, COUNT(*) as nb " +
                "FROM sinistres " +
                "WHERE DATE_DECLARATION IS NOT NULL AND LEN(DATE_DECLARATION) >= 7 " +
                "AND LEFT(DATE_DECLARATION, 4) IN ('2023','2024','2025','2026') " +
                "GROUP BY LEFT(DATE_DECLARATION, 7) ORDER BY mois_annee"
            );
            List<String> labels = new ArrayList<>();
            List<Integer> data = new ArrayList<>();
            for (Map<String, Object> row : rows) {
                labels.add(row.get("mois_annee").toString());
                data.add(((Number) row.get("nb")).intValue());
            }
            result.put("labels", labels);
            result.put("data", data);
        } catch (Exception e) {
            result.put("labels", new ArrayList<>());
            result.put("data", new ArrayList<>());
        }
        return ResponseEntity.ok(result);
    }

    // ─── Top 10 gouvernorats ──────────────────────────────────
    @GetMapping("/stats/gouvernorats")
    public ResponseEntity<Map<String, Object>> getGouvernorats() {
        JdbcTemplate jdbc = new JdbcTemplate(sinistreDataSource);
        Map<String, Object> result = new HashMap<>();
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT TOP 10 GOUVERNORAT, COUNT(*) as nb FROM sinistres " +
                "WHERE GOUVERNORAT IS NOT NULL AND GOUVERNORAT != '' " +
                "AND GOUVERNORAT != 'INCONNU' AND GOUVERNORAT != 'NAN' " +
                "GROUP BY GOUVERNORAT ORDER BY nb DESC"
            );
            List<String> labels = new ArrayList<>();
            List<Integer> data = new ArrayList<>();
            for (Map<String, Object> row : rows) {
                labels.add(row.get("GOUVERNORAT").toString());
                data.add(((Number) row.get("nb")).intValue());
            }
            result.put("labels", labels);
            result.put("data", data);
        } catch (Exception e) {
            result.put("labels", new ArrayList<>());
            result.put("data", new ArrayList<>());
        }
        return ResponseEntity.ok(result);
    }

    // ─── Décisions par mois ───────────────────────────────────
    @GetMapping("/stats/decisions-par-mois")
    public ResponseEntity<Map<String, Object>> getDecisionsParMois() {
        JdbcTemplate jdbc = new JdbcTemplate(primaryDataSource);
        Map<String, Object> result = new HashMap<>();
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT FORMAT(dateDecision, 'yyyy-MM') as mois, decision, COUNT(*) as nb " +
                "FROM decisions_fraude GROUP BY FORMAT(dateDecision, 'yyyy-MM'), decision ORDER BY mois"
            );
            Map<String, Map<String, Integer>> byMois = new java.util.LinkedHashMap<>();
            for (Map<String, Object> row : rows) {
                String mois = row.get("mois").toString();
                String dec = row.get("decision").toString();
                int nb = ((Number) row.get("nb")).intValue();
                byMois.computeIfAbsent(mois, k -> new HashMap<>()).put(dec, nb);
            }
            List<String> labels = new ArrayList<>(byMois.keySet());
            List<Integer> conformes = new ArrayList<>();
            List<Integer> fraudes = new ArrayList<>();
            List<Integer> investigations = new ArrayList<>();
            for (String mois : labels) {
                Map<String, Integer> dec = byMois.get(mois);
                conformes.add(dec.getOrDefault("CONFORME", 0));
                fraudes.add(dec.getOrDefault("FRAUDE", 0));
                investigations.add(dec.getOrDefault("INVESTIGATION", 0));
            }
            result.put("labels", labels);
            result.put("conformes", conformes);
            result.put("fraudes", fraudes);
            result.put("investigations", investigations);
        } catch (Exception e) {
            result.put("labels", new ArrayList<>());
            result.put("conformes", new ArrayList<>());
            result.put("fraudes", new ArrayList<>());
            result.put("investigations", new ArrayList<>());
        }
        return ResponseEntity.ok(result);
    }

    // ─── Stats monthly sinistres (ancien endpoint) ────────────
    @GetMapping("/stats/monthly-sinistres")
    public ResponseEntity<Map<String, Object>> getMonthlySinistres() {
        return getSinistreParMois();
    }

    // ─── Stats fraude by type (ancien endpoint) ───────────────
    @GetMapping("/stats/fraude-by-type")
    public ResponseEntity<Map<String, Object>> getFraudeByType() {
        Map<String, Object> result = new HashMap<>();
        result.put("data", new ArrayList<>());
        result.put("total", 0);
        return ResponseEntity.ok(result);
    }





}
