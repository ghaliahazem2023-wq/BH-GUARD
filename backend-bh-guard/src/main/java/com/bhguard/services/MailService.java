package com.bhguard.services;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;


@Service
public class MailService {

    @Autowired
    private JavaMailSender mailSender;

    public void sendResetEmail(String to, String resetLink) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom("ghalia.hazem.2023@ihec.ucar.tn"); // Nafs el email mta3 el properties
            message.setTo(to);
            message.setSubject("Réinitialisation de mot de passe - BH GUARD");
            message.setText("Bonjour,\n\nPour réinitialiser votre mot de passe, cliquez sur le lien suivant :\n" + resetLink);

            mailSender.send(message);
            System.out.println("✅ DEBUG: Mail envoyé avec succès à " + to);
        } catch (Exception e) {
            System.out.println("❌ DEBUG: Erreur d'envoi mail: " + e.getMessage());
            e.printStackTrace();
        }
    }
}