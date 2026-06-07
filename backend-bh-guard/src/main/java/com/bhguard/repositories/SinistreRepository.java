package com.bhguard.repositories;

import com.bhguard.models.Sinistre;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SinistreRepository extends JpaRepository<Sinistre, String> {

    // Recherche par numéro sinistre
    Optional<Sinistre> findByNumSinistre(String numSinistre);

    // Recherche par gouvernorat
    List<Sinistre> findByGouvernorat(String gouvernorat);

    // Recherche par état
    List<Sinistre> findByLibEtatSinistre(String libEtatSinistre);

    // Recherche par nature sinistre
    List<Sinistre> findByNatureSinistre(String natureSinistre);

    // Recherche par année
    List<Sinistre> findByAnneeExercice(Integer anneeExercice);

    // Sinistres avec montant élevé
    @Query("SELECT s FROM Sinistre s WHERE s.montantEvaluation >= :seuil ORDER BY s.montantEvaluation DESC")
    List<Sinistre> findSinistresElevés(@Param("seuil") Double seuil);

    // Recherche full-text par num sinistre ou contrat
    @Query("SELECT s FROM Sinistre s WHERE s.numSinistre LIKE %:q% OR s.numContrat LIKE %:q%")
    List<Sinistre> search(@Param("q") String query);

    // ── Filtres par niveau de risque (score ML persisté en BD) ────────────────

    @Query("SELECT s FROM Sinistre s WHERE s.scoreRisque >= 75 ORDER BY s.scoreRisque DESC")
    Page<Sinistre> findCritiques(Pageable pageable);

    @Query("SELECT s FROM Sinistre s WHERE s.scoreRisque >= 40 AND s.scoreRisque < 75 ORDER BY s.scoreRisque DESC")
    Page<Sinistre> findInvestigations(Pageable pageable);

    @Query("SELECT s FROM Sinistre s WHERE s.scoreRisque > 0 AND s.scoreRisque < 40 ORDER BY s.scoreRisque DESC")
    Page<Sinistre> findConformes(Pageable pageable);

    @Query("SELECT s FROM Sinistre s WHERE s.scoreRisque IS NULL OR s.scoreRisque <= 0 ORDER BY s.numSinistre DESC")
    Page<Sinistre> findNonAnalyses(Pageable pageable);

    Page<Sinistre> findByScoreRisqueIsNull(Pageable pageable);

    // ── Comptages par niveau de score (pour dashboard) ────────────────────────

    long countByScoreRisqueGreaterThanEqual(Double score);

    long countByScoreRisqueBetween(Double min, Double max);

    long countByScoreRisqueLessThan(Double score);

    @Query("SELECT s.gouvernorat, COUNT(s) AS nb FROM Sinistre s " +
           "WHERE s.scoreRisque >= 75 AND s.gouvernorat IS NOT NULL " +
           "GROUP BY s.gouvernorat ORDER BY nb DESC")
    List<Object[]> findTopGouvernoratsSuspects();

    List<Sinistre> findTop5ByScoreRisqueGreaterThanEqualOrderByScoreRisqueDesc(Double score);
}