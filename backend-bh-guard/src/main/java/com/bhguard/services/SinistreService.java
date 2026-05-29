package com.bhguard.services;

import com.bhguard.models.Sinistre;
import com.bhguard.repositories.SinistreRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class SinistreService {

    @Autowired
    @Qualifier("sinistreDataSource")
    private DataSource sinistreDataSource;

    @Autowired
    private SinistreRepository sinistreRepository;

    // ── Score canonique (liste + détail + fallback) ──────────────────────────

    public int calculerScoreHeuristique(Sinistre s) {
        return calculerScore(
            s.getMontantEvaluation()  != null ? s.getMontantEvaluation()  : 0,
            s.getNombreDeces()        != null ? s.getNombreDeces()        : 0,
            s.getNombreBlesses()      != null ? s.getNombreBlesses()      : 0,
            s.getNatureSinistre()     != null ? s.getNatureSinistre().trim().toUpperCase() : "",
            s.getCodeResponsabilite() != null ? s.getCodeResponsabilite().trim().toUpperCase() : "",
            s.getCumulReglement()     != null ? s.getCumulReglement()     : 0
        );
    }

    private int calculerScore(double montant, int deces, int blesses,
                              String nature, String resp, double cumul) {
        int score = 0;

        switch (nature) {
            case "CORPOREL":
                if      (montant >= 500_000) score += 40;
                else if (montant >= 200_000) score += 30;
                else if (montant >= 100_000) score += 20;
                else if (montant >=  50_000) score += 10;
                break;
            case "MATERIEL":
                if      (montant >= 100_000) score += 30;
                else if (montant >=  50_000) score += 20;
                else if (montant >=  20_000) score += 10;
                break;
            default: // ASSISTANCE + autres
                if      (montant >= 10_000) score += 15;
                else if (montant >=  5_000) score += 8;
                else if (montant >=  1_000) score += 3;
        }

        if      (deces  >= 3) score += 35;
        else if (deces  >= 1) score += 25;
        if      (blesses >= 5) score += 20;
        else if (blesses >= 3) score += 12;
        else if (blesses >= 1) score +=  5;

        if (resp.equals("TOTALE") || resp.equals("100") || resp.equals("T")) score += 15;
        else if (resp.equals("PARTIELLE") || resp.equals("50") || resp.equals("P")) score += 5;

        if (montant > 0 && cumul > 0) {
            double ratio = cumul / montant;
            if      (ratio > 2.0) score += 20;
            else if (ratio > 1.5) score += 10;
        }

        score = (int) Math.round(score * 0.85);
        return Math.min(score, 100);
    }

    public String calculerNiveau(int score) {
        if (score >= 75) return "CRITIQUE";
        if (score >= 40) return "INVESTIGATION";
        return "CONFORME";
    }

    // ── Pagination principale ─────────────────────────────────────────────────

    public Map<String, Object> getSinistres(int page, int size,
                                            String gouvernorat, String nature,
                                            String niveau, String search) {
        JdbcTemplate jdbc = new JdbcTemplate(sinistreDataSource);
        int offset = page * size;

        StringBuilder where = new StringBuilder("1=1");
        List<Object> argsList = new ArrayList<>();

        // Filtre niveau (basé sur SCORE_RISQUE persisté en base)
        switch (niveau == null ? "" : niveau) {
            case "critique":
                where.append(" AND ISNULL(SCORE_RISQUE, 0) >= 75");
                break;
            case "investigation":
                where.append(" AND ISNULL(SCORE_RISQUE, 0) >= 40 AND ISNULL(SCORE_RISQUE, 0) < 75");
                break;
            case "conforme":
                where.append(" AND ISNULL(SCORE_RISQUE, 0) < 40");
                break;
            case "non-analyse":
                where.append(" AND (SCORE_RISQUE IS NULL OR SCORE_RISQUE <= 0)");
                break;
        }

        // Filtre gouvernorat
        if (gouvernorat != null && !gouvernorat.trim().isEmpty()) {
            where.append(" AND LTRIM(RTRIM(GOUVERNORAT)) = ?");
            argsList.add(gouvernorat.trim());
        }

        // Filtre nature
        if (nature != null && !nature.trim().isEmpty()) {
            where.append(" AND UPPER(LTRIM(RTRIM(NATURE_SINISTRE))) = ?");
            argsList.add(nature.trim().toUpperCase());
        }

        // Vérifier si SCORE_RISQUE existe (colonne ajoutée via ALTER TABLE — peut être absente)
        boolean hasScoreCol = true;
        try {
            jdbc.queryForList("SELECT TOP 0 SCORE_RISQUE FROM sinistres");
        } catch (Exception ex) {
            hasScoreCol = false;
            System.err.println("[BHGuard] SCORE_RISQUE colonne absente: " + ex.getMessage());
        }

        // Si SCORE_RISQUE n'existe pas, neutraliser les filtres niveau qui la référencent
        String whereStr = where.toString();
        if (!hasScoreCol) {
            whereStr = whereStr.replaceAll("AND SCORE_RISQUE[^A]*(\\sAND|$)", "");
            if (whereStr.trim().isEmpty()) whereStr = "1=1";
        }

        String orderBy = hasScoreCol
            ? " ORDER BY ISNULL(SCORE_RISQUE, 0) DESC, NUM_SINISTRE DESC "
            : " ORDER BY NUM_SINISTRE DESC ";

        String scoreSelect = hasScoreCol ? ", SCORE_RISQUE " : ", NULL AS SCORE_RISQUE ";

        String countSql = "SELECT COUNT_BIG(*) FROM sinistres WHERE " + whereStr;
        String dataSql  =
            "SELECT NUM_SINISTRE, NUM_CONTRAT, " +
            "  LTRIM(RTRIM(ISNULL(GOUVERNORAT,'')))         AS GOUVERNORAT, " +
            "  LTRIM(RTRIM(ISNULL(NATURE_SINISTRE,'')))     AS NATURE_SINISTRE, " +
            "  ISNULL(TYPE_SINISTRE,'')                     AS TYPE_SINISTRE, " +
            "  ISNULL(MONTANT_EVALUATION, 0)                AS MONTANT_EVALUATION, " +
            "  LTRIM(RTRIM(ISNULL(LIB_ETAT_SINISTRE,'')))  AS LIB_ETAT_SINISTRE, " +
            "  ISNULL(NOMBRE_BLESSES, 0)                   AS NOMBRE_BLESSES, " +
            "  ISNULL(NOMBRE_DECES, 0)                     AS NOMBRE_DECES, " +
            "  LTRIM(RTRIM(ISNULL(CODE_RESPONSABILITE,''))) AS CODE_RESPONSABILITE, " +
            "  DATE_SURVENANCE, DATE_DECLARATION, " +
            "  ISNULL(cumul_reglement, 0)  AS cumul_reglement " +
            scoreSelect +
            "FROM sinistres WHERE " + whereStr +
            orderBy +
            " OFFSET " + offset + " ROWS FETCH NEXT " + size + " ROWS ONLY";

        Object[] args = argsList.toArray();
        Long total;
        List<Map<String, Object>> rows;
        try {
            if (args.length == 0) {
                total = jdbc.queryForObject(countSql, Long.class);
                rows  = jdbc.queryForList(dataSql);
            } else {
                total = jdbc.queryForObject(countSql, Long.class, args);
                rows  = jdbc.queryForList(dataSql, args);
            }
        } catch (Exception sqlEx) {
            System.err.println("[BHGuard] getSinistres() ERREUR SQL: " + sqlEx.getMessage());
            sqlEx.printStackTrace();
            throw sqlEx;
        }
        if (total == null) total = 0L;

        List<Map<String, Object>> dtos = rows.stream().map(row -> {
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("numSinistre",        rowStr(row, "NUM_SINISTRE"));
            dto.put("numContrat",         rowStr(row, "NUM_CONTRAT"));
            dto.put("gouvernorat",        rowStr(row, "GOUVERNORAT"));
            dto.put("natureSinistre",     rowStr(row, "NATURE_SINISTRE"));
            dto.put("typeSinistre",       rowStr(row, "TYPE_SINISTRE"));
            dto.put("montantEvaluation",  rowNum(row, "MONTANT_EVALUATION"));
            dto.put("libEtatSinistre",    rowStr(row, "LIB_ETAT_SINISTRE"));
            dto.put("nombreBlesses",      rowInt(row, "NOMBRE_BLESSES"));
            dto.put("nombreDeces",        rowInt(row, "NOMBRE_DECES"));
            dto.put("codeResponsabilite", rowStr(row, "CODE_RESPONSABILITE"));
            dto.put("dateSurvenance",     rowStr(row, "DATE_SURVENANCE"));
            dto.put("dateDeclaration",    rowStr(row, "DATE_DECLARATION"));
            dto.put("cumulReglement",     rowNum(row, "cumul_reglement"));

            // Score effectif : ML persisté en BD si dispo, sinon heuristique Java
            double dbScore = rowNum(row, "SCORE_RISQUE");
            boolean estimated;
            double effectiveScore;
            if (dbScore > 0) {
                effectiveScore = dbScore;
                estimated = false;
            } else {
                effectiveScore = calculerScore(
                    rowNum(row, "MONTANT_EVALUATION"),
                    rowInt(row, "NOMBRE_DECES"),
                    rowInt(row, "NOMBRE_BLESSES"),
                    rowStr(row, "NATURE_SINISTRE").toUpperCase(),
                    rowStr(row, "CODE_RESPONSABILITE").toUpperCase(),
                    rowNum(row, "cumul_reglement")
                );
                estimated = true;
            }
            dto.put("scoreRisque",  effectiveScore);
            dto.put("scoreEstime",  estimated);
            dto.put("niveauRisque", calculerNiveau((int) effectiveScore));
            dto.put("estSuspect",   effectiveScore >= 65);
            return dto;
        }).collect(Collectors.toList());

        int totalPages = Math.max(1, (int) Math.ceil(total / (double) size));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sinistres",     dtos);
        result.put("totalElements", total);
        result.put("totalPages",    totalPages);
        result.put("currentPage",   page);
        return result;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String rowStr(Map<String, Object> row, String key) {
        Object v = row.get(key);
        return v != null ? v.toString().trim() : "";
    }

    private double rowNum(Map<String, Object> row, String key) {
        Object v = row.get(key);
        if (v == null) return 0.0;
        if (v instanceof Number) return ((Number) v).doubleValue();
        try { return Double.parseDouble(v.toString()); } catch (Exception e) { return 0.0; }
    }

    private int rowInt(Map<String, Object> row, String key) {
        return (int) Math.round(rowNum(row, key));
    }

    // ── Batch : calcule et persiste le score heuristique pour tous les sinistres non scorés ──

    public Map<String, Object> calculerTousLesScores() {
        int traites = 0, critiques = 0, investigation = 0, conformes = 0;
        long t0 = System.currentTimeMillis();
        Page<Sinistre> lot;

        // Toujours page 0 : après saveAll() les lignes traitées sortent du résultat IS NULL
        do {
            Pageable pageable = PageRequest.of(0, 500);
            lot = sinistreRepository.findByScoreRisqueIsNull(pageable);

            List<Sinistre> aMettre = new ArrayList<>();
            for (Sinistre s : lot.getContent()) {
                int score = calculerScoreHeuristique(s);
                s.setScoreRisque((double) score);
                aMettre.add(s);
                traites++;
                if      (score >= 75) critiques++;
                else if (score >= 40) investigation++;
                else                  conformes++;
            }
            if (!aMettre.isEmpty()) sinistreRepository.saveAll(aMettre);

        } while (lot.hasNext());

        long duree = System.currentTimeMillis() - t0;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("traites",      traites);
        result.put("critiques",    critiques);
        result.put("investigation",investigation);
        result.put("conformes",    conformes);
        result.put("nonAnalyses",  0);
        result.put("totalBase",    traites);
        result.put("dureeMs",      duree);
        return result;
    }
}
