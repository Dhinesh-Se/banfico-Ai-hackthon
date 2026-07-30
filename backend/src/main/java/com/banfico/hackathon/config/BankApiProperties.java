package com.banfico.hackathon.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "bank")
public class BankApiProperties {

    private String domain;
    private String tenant;
    private String clientId;
    private String clientSecret;
    private String username;
    private String password;
    private boolean mockEnabled = true;

    public String getAuthUrl() {
        return "https://auth." + domain + "/auth/realms/" + tenant + "/protocol/openid-connect/token";
    }

    public String getCoreApiBaseUrl() {
        return "https://core-api." + domain + "/api/obie-aisp/v4.0";
    }

    // Getters and setters
    public String getDomain() { return domain; }
    public void setDomain(String domain) { this.domain = domain; }

    public String getTenant() { return tenant; }
    public void setTenant(String tenant) { this.tenant = tenant; }

    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }

    public String getClientSecret() { return clientSecret; }
    public void setClientSecret(String clientSecret) { this.clientSecret = clientSecret; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public boolean isMockEnabled() { return mockEnabled; }
    public void setMockEnabled(boolean mockEnabled) { this.mockEnabled = mockEnabled; }
}
