package com.bhguard.repositories;

import com.bhguard.models.DecisionFraude;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface DecisionFraudeRepository extends JpaRepository<DecisionFraude, Long> {

    Optional<DecisionFraude> findTopByNumSinistreOrderByDateDecisionDesc(String numSinistre);

    List<DecisionFraude> findByAgentUsernameOrderByDateDecisionDesc(String agentUsername);

    List<DecisionFraude> findAllByOrderByDateDecisionDesc();

    List<DecisionFraude> findByNumSinistreOrderByDateDecisionDesc(String numSinistre);
}
