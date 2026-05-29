package com.bhguard.services;

import com.bhguard.models.User;
import com.bhguard.repositories.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class UserService {

    @Autowired
    private UserRepository userRepository;

    public List<User> findAll() {
        return userRepository.findAll();
    }

    public long countAll() {
        return userRepository.count();
    }

    public long countByRole(String role) {
        return userRepository.countByRole(role);
    }

    public User createUser(User user) {
        if (user.getDateCreation() == null || user.getDateCreation().isBlank()) {
            user.setDateCreation(java.time.LocalDate.now().toString());
        }
        return userRepository.save(user);
    }

    public User updateUser(Long id, User updatedUser) {
        Optional<User> existing = userRepository.findById(id);
        if (existing.isPresent()) {
            User user = existing.get();
            user.setNom(updatedUser.getNom());
            user.setPrenom(updatedUser.getPrenom());
            user.setUsername(updatedUser.getUsername());
            user.setRole(updatedUser.getRole());
            if (updatedUser.getPassword() != null && !updatedUser.getPassword().isBlank()) {
                user.setPassword(updatedUser.getPassword());
            }
            return userRepository.save(user);
        }
        throw new RuntimeException("Utilisateur non trouvé avec l'id : " + id);
    }

    public User toggleStatus(Long id) {
        Optional<User> existing = userRepository.findById(id);
        if (existing.isPresent()) {
            User user = existing.get();
            user.setActif(!user.isActif());
            return userRepository.save(user);
        }
        throw new RuntimeException("Utilisateur non trouvé");
    }

    public void deleteById(Long id) {
        userRepository.deleteById(id);
    }

    public Optional<User> findById(Long id) {
        return userRepository.findById(id);
    }

    public Optional<User> findByUsername(String username) {
        return userRepository.findByUsername(username);
    }

}