package com.banfico.hackathon.domain;

import java.math.BigDecimal;

public record AccountDto(
        String accountId,
        String nickname,
        String accountNumber,
        String accountCategory,
        String accountType,
        String status,
        String currency,
        BigDecimal balance
) {}
