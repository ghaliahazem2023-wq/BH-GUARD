package com.bhguard.repositories;

import com.bhguard.models.LoginHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LoginHistoryRepository extends JpaRepository<LoginHistory, Long> {

    /**
     * Tri par date DESC puis heure DESC
     * → connexion la plus récente en premier
     */
    List<LoginHistory> findAllByOrderByDateDescHeureDesc();

    /**
     * Alternative avec @Query si le tri String sur "heure" ne marche pas bien
     * (car "heure" est stockée en String "HH:mm")
     */
    @Query("SELECT h FROM LoginHistory h ORDER BY h.date DESC, h.heure DESC")
    List<LoginHistory> findAllSortedByDateDesc();
}