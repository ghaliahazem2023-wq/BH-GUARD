package com.bhguard.repositories;

import com.bhguard.models.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByUsername(String username);
    long countByRole(String role);

    @Modifying
    @Transactional
    @Query("UPDATE User u SET u.actif = true WHERE u.actif = false")
    int activateAllInactiveUsers();
}