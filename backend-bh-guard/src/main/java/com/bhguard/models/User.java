package com.bhguard.models;

import jakarta.persistence.*;

@Entity
@Table(name = "app_users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String username;

    @Column(nullable = false)
    private String password;

    private String role;
    private String nom;
    private String prenom;

    @Column(columnDefinition = "bit not null default 1")
    private boolean actif = true;

    private String dateCreation;

    public User() {}

    public User(String username, String password, String role) {
        this.username = username;
        this.password = password;
        this.role = role;
    }

    // ── Getters ──────────────────────────────────────
    public Long getId()            { return id; }
    public String getUsername()    { return username; }
    public String getPassword()    { return password; }
    public String getRole()        { return role; }
    public String getNom()         { return nom; }
    public String getPrenom()      { return prenom; }
    public boolean isActif()       { return actif; }
    public String getDateCreation(){ return dateCreation; }

    // ── Setters ──────────────────────────────────────
    public void setId(Long id)                   { this.id = id; }
    public void setUsername(String username)     { this.username = username; }
    public void setPassword(String password)     { this.password = password; }
    public void setRole(String role)             { this.role = role; }
    public void setNom(String nom)               { this.nom = nom; }
    public void setPrenom(String prenom)         { this.prenom = prenom; }
    public void setActif(boolean actif)          { this.actif = actif; }
    public void setDateCreation(String d)        { this.dateCreation = d; }
}
