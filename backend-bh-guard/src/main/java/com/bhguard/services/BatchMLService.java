package com.bhguard.services;

import com.bhguard.models.Sinistre;
import com.bhguard.repositories.SinistreRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class BatchMLService {

    @Autowired
    private SinistreRepository sinistreRepository;

    @Autowired
    private RestTemplate restTemplate;

    @Autowired
    private SinistreService sinistreService;

    @Value("${fastapi.url:http://localhost:8000}")
    private String fastapiUrl;

    private final AtomicInteger traites    = new AtomicInteger(0);
    private final AtomicInteger erreurs    = new AtomicInteger(0);
    private final AtomicInteger critiques  = new AtomicInteger(0);
    private final AtomicInteger investigation = new AtomicInteger(0);
    private final AtomicInteger conformes  = new AtomicInteger(0);
    private volatile int    total   = 0;
    private volatile boolean running = false;
    private volatile String  status  = "IDLE";

    @Async
    public void lancerBatchAsync() {
        if (running) return;
        running = true;
        status  = "RUNNING";
        traites.set(0); erreurs.set(0);
        critiques.set(0); investigation.set(0); conformes.set(0);

        try {
            total = (int) sinistreRepository.count();
            int page = 0;
            Page<Sinistre> lot;

            do {
                Pageable pageable = PageRequest.of(page, 100);
                lot = sinistreRepository.findAll(pageable);
                List<Sinistre> aMettre = new ArrayList<>();

                for (Sinistre s : lot.getContent()) {
                    double scoreML = 0;
                    try {
                        Map<String, Object> payload = buildPayload(s);
                        ResponseEntity<Map> response = restTemplate.postForEntity(
                                fastapiUrl + "/predict", payload, Map.class);

                        if (response.getBody() != null) {
                            Object scoreObj = response.getBody().get("score_risque");
                            scoreML = scoreObj != null
                                    ? Double.parseDouble(scoreObj.toString()) : 0;
                        }
                    } catch (Exception e) {
                        scoreML = sinistreService.calculerScoreHeuristique(s);
                        erreurs.incrementAndGet();
                    }

                    s.setScoreRisque(scoreML);
                    if      (scoreML >= 75) critiques.incrementAndGet();
                    else if (scoreML >= 40) investigation.incrementAndGet();
                    else                    conformes.incrementAndGet();

                    aMettre.add(s);
                    traites.incrementAndGet();
                }
                sinistreRepository.saveAll(aMettre);
                page++;
            } while (lot.hasNext());

            status = "DONE";
        } catch (Exception e) {
            System.err.println("[BatchML] Erreur fatale: " + e.getMessage());
            status = "ERROR";
        } finally {
            running = false;
        }
    }

    public Map<String, Object> getProgress() {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("total",        total);
        p.put("traites",      traites.get());
        p.put("erreurs",      erreurs.get());
        p.put("pourcentage",  total > 0 ? (traites.get() * 100 / total) : 0);
        p.put("status",       status);
        p.put("running",      running);
        p.put("critiques",    critiques.get());
        p.put("investigation",investigation.get());
        p.put("conformes",    conformes.get());
        return p;
    }

    public boolean isRunning() { return running; }

    private Map<String, Object> buildPayload(Sinistre s) {
        Map<String, Object> p = new HashMap<>();
        p.put("NUM_SINISTRE",       s.getNumSinistre() != null ? s.getNumSinistre() : "");
        p.put("MONTANT_EVALUATION", s.getMontantEvaluation()  != null ? s.getMontantEvaluation()  : 0);
        p.put("NOMBRE_BLESSES",     s.getNombreBlesses()      != null ? s.getNombreBlesses()      : 0);
        p.put("NOMBRE_DECES",       s.getNombreDeces()        != null ? s.getNombreDeces()        : 0);
        p.put("CODE_RESPONSABILITE",s.getCodeResponsabilite() != null ? s.getCodeResponsabilite() : "");
        p.put("NATURE_SINISTRE",    s.getNatureSinistre()     != null ? s.getNatureSinistre()     : "");
        p.put("GOUVERNORAT",        s.getGouvernorat()        != null ? s.getGouvernorat()        : "");
        p.put("ANNEE_EXERCICE",     s.getAnneeExercice()      != null ? s.getAnneeExercice()      : 0);
        p.put("cumul_reglement",    s.getCumulReglement()     != null ? s.getCumulReglement()     : 0);
        p.put("Total_SAP_Final",    s.getTotalSapFinal()      != null ? s.getTotalSapFinal()      : 0);
        return p;
    }
}
