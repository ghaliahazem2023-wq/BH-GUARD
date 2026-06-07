package com.bhguard;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.*;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.util.HashMap;

// ── Base 1 : bh_guard_db (Users/Auth) ─────────────
@Configuration
@EnableJpaRepositories(
        basePackages = {"com.bhguard.repositories"},
        excludeFilters = @ComponentScan.Filter(
                type = FilterType.REGEX,
                pattern = "com.bhguard.repositories.SinistreRepository"
        ),
        entityManagerFactoryRef = "primaryEntityManager",
        transactionManagerRef   = "primaryTransactionManager"
)
class PrimaryDataSourceConfig {

    @Primary
    @Bean(name = "primaryDataSource")
    @ConfigurationProperties(prefix = "spring.datasource")
    public DataSource primaryDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Primary
    @Bean(name = "primaryEntityManager")
    public LocalContainerEntityManagerFactoryBean primaryEntityManager(
            @Qualifier("primaryDataSource") DataSource ds) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(ds);
        em.setPackagesToScan("com.bhguard.models");
        em.setPersistenceUnitName("primary");
        HibernateJpaVendorAdapter adapter = new HibernateJpaVendorAdapter();
        em.setJpaVendorAdapter(adapter);
        HashMap<String, Object> props = new HashMap<>();
        props.put("hibernate.dialect", "org.hibernate.dialect.SQLServerDialect");
        props.put("hibernate.hbm2ddl.auto", "update");
        em.setJpaPropertyMap(props);
        return em;
    }

    @Primary
    @Bean(name = "primaryTransactionManager")
    public PlatformTransactionManager primaryTransactionManager(
            @Qualifier("primaryEntityManager") LocalContainerEntityManagerFactoryBean em) {
        return new JpaTransactionManager(em.getObject());
    }
}

// ── Base 2 : bh_assurance (Sinistres) ─────────────
@Configuration
@EnableJpaRepositories(
        basePackages = {"com.bhguard.repositories"},
        includeFilters = @ComponentScan.Filter(
                type = FilterType.REGEX,
                pattern = "com.bhguard.repositories.SinistreRepository"
        ),
        entityManagerFactoryRef = "sinistreEntityManager",
        transactionManagerRef   = "sinistreTransactionManager"
)
class SinistreDataSourceConfig {

    @Bean(name = "sinistreDataSource")
    @ConfigurationProperties(prefix = "sinistres.datasource")
    public DataSource sinistreDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean(name = "sinistreEntityManager")
    public LocalContainerEntityManagerFactoryBean sinistreEntityManager(
            @Qualifier("sinistreDataSource") DataSource ds) {
        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(ds);
        em.setPackagesToScan("com.bhguard.models");
        em.setPersistenceUnitName("sinistres");
        HibernateJpaVendorAdapter adapter = new HibernateJpaVendorAdapter();
        em.setJpaVendorAdapter(adapter);
        HashMap<String, Object> props = new HashMap<>();
        props.put("hibernate.dialect", "org.hibernate.dialect.SQLServerDialect");
        props.put("hibernate.hbm2ddl.auto", "none");
        em.setJpaPropertyMap(props);
        return em;
    }

    @Bean(name = "sinistreTransactionManager")
    public PlatformTransactionManager sinistreTransactionManager(
            @Qualifier("sinistreEntityManager") LocalContainerEntityManagerFactoryBean em) {
        return new JpaTransactionManager(em.getObject());
    }
}