package com.bhguard.services;

import com.bhguard.models.DecisionFraude;
import com.bhguard.repositories.DecisionFraudeRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class DecisionFraudeService {

    @Autowired
    private DecisionFraudeRepository repository;

    private static final DateTimeFormatter DISPLAY_FMT =
            DateTimeFormatter.ofPattern("dd/MM/yyyy 'à' HH:mm");

    public Map<String, Object> saveDecision(String numSinistre, Map<String, Object> request) {
        // Validate decision field
        Object decisionObj = request.get("decision");
        if (decisionObj == null || decisionObj.toString().isBlank()) {
            throw new IllegalArgumentException("La décision est obligatoire");
        }
        String decision = decisionObj.toString().trim();

        // Validate commentaire for FRAUDE
        Object commentaireObj = request.get("commentaireAgent");
        String commentaire = (commentaireObj != null) ? commentaireObj.toString().trim() : "";
        if ("FRAUDE".equals(decision) && commentaire.isBlank()) {
            throw new IllegalArgumentException("Un commentaire est obligatoire pour bloquer un dossier");
        }

        // Build entity
        DecisionFraude entity = new DecisionFraude();
        entity.setNumSinistre(numSinistre);

        Object agentObj = request.get("agentUsername");
        entity.setAgentUsername(agentObj != null ? agentObj.toString() : "");

        entity.setDecision(decision);

        Object scoreObj = request.get("scoreRisque");
        if (scoreObj != null) {
            try {
                entity.setScoreRisque(((Number) scoreObj).intValue());
            } catch (ClassCastException e) {
                entity.setScoreRisque(Integer.parseInt(scoreObj.toString()));
            }
        }

        Object niveauObj = request.get("niveauRisque");
        entity.setNiveauRisque(niveauObj != null ? niveauObj.toString() : "");

        // Handle motifs — can be List<String> or a plain String
        Object motifsObj = request.get("motifs");
        if (motifsObj instanceof List<?>) {
            @SuppressWarnings("unchecked")
            List<String> motifsList = (List<String>) motifsObj;
            entity.setMotifs(String.join(",", motifsList));
        } else if (motifsObj != null) {
            entity.setMotifs(motifsObj.toString());
        }

        entity.setCommentaireAgent(commentaire);

        DecisionFraude saved = repository.save(entity);
        return toMap(saved);
    }

    public Optional<Map<String, Object>> getDecision(String numSinistre) {
        return repository.findTopByNumSinistreOrderByDateDecisionDesc(numSinistre)
                .map(this::toMap);
    }

    public List<Map<String, Object>> getDecisionsByAgent(String agentUsername) {
        List<DecisionFraude> list;
        if (agentUsername == null || agentUsername.isBlank()) {
            list = repository.findAllByOrderByDateDecisionDesc();
        } else {
            list = repository.findByAgentUsernameOrderByDateDecisionDesc(agentUsername);
        }
        return list.stream().map(this::toMap).collect(Collectors.toList());
    }

    private Map<String, Object> toMap(DecisionFraude d) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", d.getId());
        map.put("numSinistre", d.getNumSinistre());
        map.put("agentUsername", d.getAgentUsername());
        map.put("decision", d.getDecision());
        map.put("scoreRisque", d.getScoreRisque());
        map.put("niveauRisque", d.getNiveauRisque());

        // motifs: split by "," into List, or empty list if null/blank
        String motifsRaw = d.getMotifs();
        List<String> motifsList;
        if (motifsRaw != null && !motifsRaw.isBlank()) {
            motifsList = Arrays.stream(motifsRaw.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.toList());
        } else {
            motifsList = Collections.emptyList();
        }
        map.put("motifs", motifsList);

        map.put("commentaireAgent", d.getCommentaireAgent());
        map.put("dateDecision", d.getDateDecision() != null ? d.getDateDecision().toString() : null);
        map.put("dateFormatted", d.getDateDecision() != null ? d.getDateDecision().format(DISPLAY_FMT) : "");

        // Angular-compatibility aliases
        map.put("statut", d.getDecision());
        map.put("agentNom", d.getAgentUsername());

        return map;
    }
}
