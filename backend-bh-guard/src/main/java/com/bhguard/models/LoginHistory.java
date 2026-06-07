package com.bhguard.models;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
public class LoginHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String username;
    private LocalDateTime loginDate;
    private String status;

    // Champs ajoutés pour le dashboard
    private String utilisateur;
    private String date;
    private String heure;
    private String adresseIp;
    private String statut;

    // Constructeurs
    public LoginHistory() {}
    public LoginHistory(String username, LocalDateTime loginDate, String status) {
        this.username = username;
        this.loginDate = loginDate;
        this.status = status;
    }

    // Getters & Setters existants
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public LocalDateTime getLoginDate() { return loginDate; }
    public void setLoginDate(LocalDateTime loginDate) { this.loginDate = loginDate; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    // Getters & Setters ajoutés
    public String getUtilisateur() { return utilisateur; }
    public void setUtilisateur(String utilisateur) { this.utilisateur = utilisateur; }

    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }

    public String getHeure() { return heure; }
    public void setHeure(String heure) { this.heure = heure; }

    public String getAdresseIp() { return adresseIp; }
    public void setAdresseIp(String adresseIp) { this.adresseIp = adresseIp; }

    public String getStatut() { return statut; }
    public void setStatut(String statut) { this.statut = statut; }
}