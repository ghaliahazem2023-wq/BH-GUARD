package com.bhguard.models;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "decisions_fraude")
public class DecisionFraude {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String numSinistre;

    @Column(nullable = false)
    private String agentUsername;

    @Column(nullable = false)
    private String decision;

    private Integer scoreRisque;

    private String niveauRisque;

    @Column(length = 1000)
    private String motifs;

    @Column(length = 2000)
    private String commentaireAgent;

    private LocalDateTime dateDecision;

    @PrePersist
    public void prePersist() {
        if (this.dateDecision == null) {
            this.dateDecision = LocalDateTime.now();
        }
    }

    // Getters and Setters

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getNumSinistre() {
        return numSinistre;
    }

    public void setNumSinistre(String numSinistre) {
        this.numSinistre = numSinistre;
    }

    public String getAgentUsername() {
        return agentUsername;
    }

    public void setAgentUsername(String agentUsername) {
        this.agentUsername = agentUsername;
    }

    public String getDecision() {
        return decision;
    }

    public void setDecision(String decision) {
        this.decision = decision;
    }

    public Integer getScoreRisque() {
        return scoreRisque;
    }

    public void setScoreRisque(Integer scoreRisque) {
        this.scoreRisque = scoreRisque;
    }

    public String getNiveauRisque() {
        return niveauRisque;
    }

    public void setNiveauRisque(String niveauRisque) {
        this.niveauRisque = niveauRisque;
    }

    public String getMotifs() {
        return motifs;
    }

    public void setMotifs(String motifs) {
        this.motifs = motifs;
    }

    public String getCommentaireAgent() {
        return commentaireAgent;
    }

    public void setCommentaireAgent(String commentaireAgent) {
        this.commentaireAgent = commentaireAgent;
    }

    public LocalDateTime getDateDecision() {
        return dateDecision;
    }

    public void setDateDecision(LocalDateTime dateDecision) {
        this.dateDecision = dateDecision;
    }
}
