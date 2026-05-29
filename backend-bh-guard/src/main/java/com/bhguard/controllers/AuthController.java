package com.bhguard.controllers;

import com.bhguard.models.User;
import com.bhguard.services.LoginHistoryService;
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

        if (!password.equals(user.getPassword())) {
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

        Map<String, Object> success = new HashMap<>();
        success.put("username", user.getUsername());
        success.put("role",     user.getRole());
        success.put("nom",      user.getNom());
        success.put("prenom",   user.getPrenom());
        return ResponseEntity.ok(success);
    }
}