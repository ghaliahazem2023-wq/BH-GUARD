package com.bhguard.controllers;

import com.bhguard.services.DecisionFraudeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@CrossOrigin(origins = {"http://localhost:4200", "http://127.0.0.1:4200"})
public class DecisionFraudeController {

    @Autowired
    private DecisionFraudeService service;

    /**
     * POST /api/sinistres/{numSinistre}/decision
     * Save a fraud decision for a sinistre.
     */
    @PostMapping("/api/sinistres/{numSinistre}/decision")
    public ResponseEntity<Map<String, Object>> saveDecision(
            @PathVariable String numSinistre,
            @RequestBody Map<String, Object> request) {
        try {
            Map<String, Object> result = service.saveDecision(numSinistre, request);
            return ResponseEntity.ok(result);
        } catch (IllegalArgumentException e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    /**
     * GET /api/sinistres/{numSinistre}/decision
     * Get the latest decision for a sinistre.
     */
    @GetMapping("/api/sinistres/{numSinistre}/decision")
    public ResponseEntity<Map<String, Object>> getDecision(@PathVariable String numSinistre) {
        return service.getDecision(numSinistre)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().<Map<String, Object>>build());
    }

    /**
     * GET /api/agent/decisions?username=
     * Get decisions by agent username (or all if blank).
     */
    @GetMapping("/api/agent/decisions")
    public ResponseEntity<List<Map<String, Object>>> getDecisionsByAgent(
            @RequestParam(required = false, defaultValue = "") String username) {
        List<Map<String, Object>> result = service.getDecisionsByAgent(username);
        return ResponseEntity.ok(result);
    }

    /**
     * GET /api/agent/historique?username=
     * Alias for getDecisionsByAgent.
     */
    @GetMapping("/api/agent/historique")
    public ResponseEntity<List<Map<String, Object>>> getHistoriqueAgent(
            @RequestParam(required = false, defaultValue = "") String username) {
        List<Map<String, Object>> result = service.getDecisionsByAgent(username);
        return ResponseEntity.ok(result);
    }
}
