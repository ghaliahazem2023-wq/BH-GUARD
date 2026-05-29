package com.bhguard.models;

import jakarta.persistence.*;
import java.time.LocalDate;

@Entity
@Table(name = "sinistres")
public class Sinistre {

    @Id
    @Column(name = "NUM_SINISTRE")
    private String numSinistre;

    @Column(name = "NUM_CONTRAT")
    private String numContrat;

    @Column(name = "ANNEE_EXERCICE")
    private Integer anneeExercice;

    @Column(name = "DATE_SURVENANCE")
    private String dateSurvenance;

    @Column(name = "DATE_DECLARATION")
    private String dateDeclaration;

    @Column(name = "DATE_OUVERTURE")
    private String dateOuverture;

    @Column(name = "NATURE_SINISTRE")
    private String natureSinistre;

    @Column(name = "TYPE_SINISTRE")
    private String typeSinistre;

    @Column(name = "LIB_ETAT_SINISTRE")
    private String libEtatSinistre;

    @Column(name = "GOUVERNORAT")
    private String gouvernorat;

    @Column(name = "LIEU_ACCIDENT")
    private String lieuAccident;

    @Column(name = "usage")
    private String usage;

    @Column(name = "NOMBRE_BLESSES")
    private Integer nombreBlesses;

    @Column(name = "NOMBRE_DECES")
    private Integer nombreDeces;

    @Column(name = "MONTANT_EVALUATION")
    private Double montantEvaluation;

    @Column(name = "cumul_reglement")
    private Double cumulReglement;

    @Column(name = "Total_SAP_Final")
    private Double totalSapFinal;

    @Column(name = "CODE_TYPE_CONTRAT")
    private String codeTypeContrat;

    @Column(name = "CODE_RESPONSABILITE")
    private String codeResponsabilite;

    @Column(name = "SCORE_RISQUE")
    private Double scoreRisque;

    // ── Getters & Setters ──────────────────────

    public String getNumSinistre() { return numSinistre; }
    public void setNumSinistre(String numSinistre) { this.numSinistre = numSinistre; }

    public String getNumContrat() { return numContrat; }
    public void setNumContrat(String numContrat) { this.numContrat = numContrat; }

    public Integer getAnneeExercice() { return anneeExercice; }
    public void setAnneeExercice(Integer anneeExercice) { this.anneeExercice = anneeExercice; }

    public String getDateSurvenance() { return dateSurvenance; }
    public void setDateSurvenance(String dateSurvenance) { this.dateSurvenance = dateSurvenance; }

    public String getDateDeclaration() { return dateDeclaration; }
    public void setDateDeclaration(String dateDeclaration) { this.dateDeclaration = dateDeclaration; }

    public String getDateOuverture() { return dateOuverture; }
    public void setDateOuverture(String dateOuverture) { this.dateOuverture = dateOuverture; }

    public String getNatureSinistre() { return natureSinistre; }
    public void setNatureSinistre(String natureSinistre) { this.natureSinistre = natureSinistre; }

    public String getTypeSinistre() { return typeSinistre; }
    public void setTypeSinistre(String typeSinistre) { this.typeSinistre = typeSinistre; }

    public String getLibEtatSinistre() { return libEtatSinistre; }
    public void setLibEtatSinistre(String libEtatSinistre) { this.libEtatSinistre = libEtatSinistre; }

    public String getGouvernorat() { return gouvernorat; }
    public void setGouvernorat(String gouvernorat) { this.gouvernorat = gouvernorat; }

    public String getLieuAccident() { return lieuAccident; }
    public void setLieuAccident(String lieuAccident) { this.lieuAccident = lieuAccident; }

    public String getUsage() { return usage; }
    public void setUsage(String usage) { this.usage = usage; }

    public Integer getNombreBlesses() { return nombreBlesses; }
    public void setNombreBlesses(Integer nombreBlesses) { this.nombreBlesses = nombreBlesses; }

    public Integer getNombreDeces() { return nombreDeces; }
    public void setNombreDeces(Integer nombreDeces) { this.nombreDeces = nombreDeces; }

    public Double getMontantEvaluation() { return montantEvaluation; }
    public void setMontantEvaluation(Double montantEvaluation) { this.montantEvaluation = montantEvaluation; }

    public Double getCumulReglement() { return cumulReglement; }
    public void setCumulReglement(Double cumulReglement) { this.cumulReglement = cumulReglement; }

    public Double getTotalSapFinal() { return totalSapFinal; }
    public void setTotalSapFinal(Double totalSapFinal) { this.totalSapFinal = totalSapFinal; }

    public String getCodeTypeContrat() { return codeTypeContrat; }
    public void setCodeTypeContrat(String codeTypeContrat) { this.codeTypeContrat = codeTypeContrat; }

    public String getCodeResponsabilite() { return codeResponsabilite; }
    public void setCodeResponsabilite(String codeResponsabilite) { this.codeResponsabilite = codeResponsabilite; }

    public Double getScoreRisque() { return scoreRisque; }
    public void setScoreRisque(Double scoreRisque) { this.scoreRisque = scoreRisque; }
}