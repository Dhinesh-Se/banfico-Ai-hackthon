package com.banfico.hackathon.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;

/**
 * Serves captured Banfico sandbox responses when live sandbox access is not
 * available. The payloads are copied from the apidetails folder and preserve
 * the OBIE response envelopes consumed by ObieMapper.
 */
@Service
public class MockBankApiService {

    private final ObjectMapper objectMapper;

    public MockBankApiService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public Mono<JsonNode> getAccounts() {
        return payload("accounts.json");
    }

    public Mono<JsonNode> getAccountById(String accountId) {
        return payload("account-by-id.json");
    }

    public Mono<JsonNode> getBalances(String accountId) {
        return payload("balances-by-account-id.json");
    }

    public Mono<JsonNode> getTransactions(String accountId) {
        return payload("transactions-by-account-id.json");
    }

    public Mono<JsonNode> createAccount(String requestBodyJson) {
        return payload("post-account.json");
    }

    public Mono<JsonNode> createTransaction(String accountId, String requestBodyJson) {
        return payload("post-account-transaction.json");
    }

    private Mono<JsonNode> payload(String fileName) {
        return Mono.fromCallable(() -> readPayload(fileName));
    }

    private JsonNode readPayload(String fileName) {
        ClassPathResource resource = new ClassPathResource("mock-bank/" + fileName);
        try (InputStream input = resource.getInputStream()) {
            return objectMapper.readTree(input);
        } catch (IOException e) {
            throw new UncheckedIOException("Unable to load mock bank payload " + fileName, e);
        }
    }
}
