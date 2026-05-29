package com.bhguard;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.CommandLineRunner;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.web.client.RestTemplate;
import com.bhguard.repositories.UserRepository;
import com.bhguard.models.User;

@SpringBootApplication(exclude = {UserDetailsServiceAutoConfiguration.class})
@EnableAsync
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }

    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    @Bean
    CommandLineRunner start(UserRepository userRepository) {
        return args -> {
            if (userRepository.count() == 0) {
                userRepository.save(new User("Ilhem", "123", "ADMINISTRATEUR"));
                userRepository.save(new User("Ismail", "456", "ADMINISTRATEUR"));
                userRepository.save(new User("Ghalia", "789", "AGENT_ANTI_FRAUDE"));
                userRepository.save(new User("Zaineb", "000", "AGENT_ANTI_FRAUDE"));
                System.out.println("✅ Base initialisée avec succès !");
            } else {
                // ✅ Correction : activer tous les users désactivés (actif = 0)
                userRepository.findAll().forEach(u -> {
                    if (!u.isActif()) {
                        u.setActif(true);
                        userRepository.save(u);
                        System.out.println("✅ User activé : " + u.getUsername());
                    }
                });
                System.out.println("ℹ️ Les users existent déjà — vérification actif terminée.");
            }
        };
    }
}