package com.banfico.hackathon.controller;

import com.banfico.hackathon.domain.AccountDto;
import com.banfico.hackathon.domain.BalanceDto;
import com.banfico.hackathon.domain.TransactionDto;
import com.banfico.hackathon.service.AggregationService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Endpoints the React app calls. These now return NORMALISED DTOs rather than
 * raw OBIE JsonNode — see ObieMapper for why that matters.
 *
 * @CrossOrigin was removed from here; CORS lives in WebMvcConfig.
 */
@RestController
@RequestMapping("/api")
public class BankController {

    private final AggregationService aggregation;

    public BankController(AggregationService aggregation) {
        this.aggregation = aggregation;
    }

    /**
     * Returns all accounts, optionally filtered by category (e.g. ?category=Personal).
     * AccountCategory comes directly from the OBIE AccountCategory field.
     */
    @GetMapping("/accounts")
    public List<AccountDto> getAccounts(@RequestParam(required = false) String category) {
        List<AccountDto> all = aggregation.accounts();
        if (category == null || category.isBlank()) return all;
        return all.stream()
                .filter(a -> category.equalsIgnoreCase(a.accountCategory()))
                .collect(Collectors.toList());
    }

    @GetMapping("/accounts/{accountId}")
    public AccountDto getAccount(@PathVariable String accountId) {
        return aggregation.account(accountId);
    }

    @GetMapping("/accounts/{accountId}/balances")
    public List<BalanceDto> getBalances(@PathVariable String accountId) {
        return aggregation.balances(accountId);
    }

    /** Across all accounts — stops React from refetching /accounts to derive balances. */
    @GetMapping("/balances")
    public List<BalanceDto> getAllBalances() {
        return aggregation.allBalances();
    }

    @GetMapping("/accounts/{accountId}/transactions")
    public List<TransactionDto> getTransactions(@PathVariable String accountId) {
        return aggregation.transactions(accountId);
    }

    /** Across all accounts — stops React from doing N+1 fetches. */
    @GetMapping("/transactions")
    public List<TransactionDto> getAllTransactions() {
        return aggregation.allTransactions();
    }

    /**
     * Force-clears every cache. Call this right after a real account-connect
     * or a new transaction so the dashboard reflects it immediately instead
     * of waiting out the 5-minute TTL.
     */
    @PostMapping("/refresh")
    public Map<String, String> refresh() {
        aggregation.clearCache();
        return Map.of("status", "cache cleared");
    }
}
