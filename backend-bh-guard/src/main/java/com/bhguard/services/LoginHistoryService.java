package com.bhguard.services;

import com.bhguard.models.LoginHistory;
import com.bhguard.repositories.LoginHistoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class LoginHistoryService {

    @Autowired
    private LoginHistoryRepository loginHistoryRepository;

    /**
     * Retourne toutes les connexions triées par date DESC puis heure DESC
     * → la connexion la plus récente apparaît en premier
     */
    public List<LoginHistory> findAllOrderByDateDesc() {
        return loginHistoryRepository.findAllByOrderByDateDescHeureDesc();
    }

    /**
     * Enregistre une nouvelle connexion (appeler depuis AuthController)
     */
    public LoginHistory record(String username, String statut, String adresseIp) {
        LoginHistory h = new LoginHistory();

        // Système ancien
        h.setUsername(username);
        h.setLoginDate(java.time.LocalDateTime.now());
        h.setStatus(statut.equals("SUCCÈS") ? "SUCCESS" : "FAILURE");

        // Système nouveau
        h.setUtilisateur(username);
        h.setStatut(statut);
        h.setAdresseIp(adresseIp);

        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        h.setDate(now.toLocalDate().toString());
        h.setHeure(now.toLocalTime().format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")));

        return loginHistoryRepository.save(h);
    }
}