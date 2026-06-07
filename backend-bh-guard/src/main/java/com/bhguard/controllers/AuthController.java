package com.bhguard.controllers;

import com.bhguard.JwtUtil;
import com.bhguard.models.User;
import com.bhguard.services.LoginHistoryService;
import com.bhguard.services.MailService;
import com.bhguard.services.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import jakarta.servlet.http.HttpServletRequest;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired private UserService userService;
    @Autowired private LoginHistoryService loginHistoryService;
    @Autowired private MailService mailService;
    @Autowired private JwtUtil jwtUtil;
    @Autowired private org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {

        String username = body.get("username");
        String password = body.get("password");
        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            Map<String, Object> error = new HashMap<>();
            error.put("message", "Nom d'utilisateur et mot de passe requis.");
            return ResponseEntity.badRequest().body(error);
        }

        String clientIp = request.getHeader("X-Forwarded-For");
        if (clientIp == null || clientIp.isBlank()) clientIp = request.getRemoteAddr();

        Optional<User> userOpt = userService.findByUsername(username);

        if (userOpt.isEmpty()) {
            loginHistoryService.record(username, "ÉCHEC", clientIp);
            Map<String, Object> error = new HashMap<>();
            error.put("message", "Identifiants invalides.");
            return ResponseEntity.status(401).body(error);
        }

        User user = userOpt.get();

        // Détection auto : hash BCrypt ou mot de passe plain-text (migration transparente)
        String stored = user.getPassword();
        boolean passwordOk;
        if (stored != null && (stored.startsWith("$2a$") || stored.startsWith("$2b$") || stored.startsWith("$2y$"))) {
            passwordOk = passwordEncoder.matches(password, stored);
        } else {
            // Plain-text legacy → compare puis upgrade automatique
            passwordOk = password.equals(stored);
            if (passwordOk) {
                user.setPassword(passwordEncoder.encode(password));
                userService.save(user);
                System.out.println("[BHGuard] Mot de passe migré vers BCrypt pour : " + user.getUsername());
            }
        }

        if (!passwordOk) {
            loginHistoryService.record(user.getUsername(), "ÉCHEC", clientIp);
            Map<String, Object> error = new HashMap<>();
            error.put("message", "Identifiants invalides.");
            return ResponseEntity.status(401).body(error);
        }

        if (!user.isActif()) {
            loginHistoryService.record(user.getUsername(), "ÉCHEC", clientIp);
            Map<String, Object> error = new HashMap<>();
            error.put("message", "Compte désactivé. Contactez l'administrateur.");
            return ResponseEntity.status(403).body(error);
        }

        loginHistoryService.record(user.getUsername(), "SUCCÈS", clientIp);

        String token = jwtUtil.generateToken(user.getUsername(), user.getRole());
Map<String, Object> success = new HashMap<>();
success.put("token",    token);
success.put("username", user.getUsername());
success.put("role",     user.getRole());
success.put("nom",      user.getNom());
success.put("prenom",   user.getPrenom());
        return ResponseEntity.ok(success);
    }

    @PostMapping("/reset-password")
    public ResponseEntity<Map<String, Object>> resetPassword(
            @RequestBody Map<String, String> body) {
        String username    = body.get("username");
        String fonction    = body.get("fonction");
        String newPassword = body.get("newPassword");

        Map<String, Object> response = new HashMap<>();

        Optional<User> userOpt = userService.findByUsername(username);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            if (user.getRole().trim().equalsIgnoreCase(fonction)) {
                user.setPassword(passwordEncoder.encode(newPassword));
                userService.save(user);
                response.put("message", "Mot de passe mis à jour !");
                return ResponseEntity.ok(response);
            }
        }
        response.put("message", "Username ou Fonction incorrecte.");
        return ResponseEntity.status(401).body(response);
    }


   

    @PostMapping("/forgot-password")
    public ResponseEntity<Map<String, Object>> forgotPassword(
            @RequestBody Map<String, String> body) {
        String email = body.get("email");
        Map<String, Object> response = new HashMap<>();
        try {
            mailService.sendResetEmail(email, "http://localhost:4200/reset-password");
            response.put("message", "Un lien de réinitialisation a été envoyé à " + email);
            response.put("success", true);
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            response.put("message", "Erreur envoi email : " + e.getMessage());
            return ResponseEntity.status(500).body(response);
        }
    }

    @GetMapping("/hash/{pwd}")
    public String hash(@PathVariable String pwd) {
        return passwordEncoder.encode(pwd);
    }



    
}