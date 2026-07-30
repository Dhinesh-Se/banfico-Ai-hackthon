package com.banfico.hackathon.mapping;

import com.banfico.hackathon.domain.AccountDto;
import com.banfico.hackathon.domain.BalanceDto;
import com.banfico.hackathon.domain.TransactionDto;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Flattens OBIE v4 responses into the DTOs the UI actually wants.
 *
 * This layer was the gap in the original structure: BankController handed raw
 * JsonNode straight to React, which pushed OBIE's nesting, MCC decoding, date
 * parsing and signing of amounts into your components. Every chart then had to
 * re-derive the same things, and none of it was reusable by the AI layer.
 *
 * {@link #collection} probes several envelope shapes rather than assuming one,
 * because providers differ. Confirm the real shape via /api/debug/raw/accounts
 * and then delete the branches you don't need.
 */
@Component
public class ObieMapper {

    private final CategoryResolver categories;

    public ObieMapper(CategoryResolver categories) {
        this.categories = categories;
    }

    private List<JsonNode> collection(JsonNode root, String key) {
        List<JsonNode> out = new ArrayList<>();
        if (root == null || root.isNull() || root.isMissingNode()) return out;

        JsonNode candidate = null;
        if (root.isArray()) {
            candidate = root;
        } else if (root.has("Data") && root.get("Data").has(key)) {
            candidate = root.get("Data").get(key);
        } else if (root.has(key)) {
            candidate = root.get(key);
        } else if (root.has("data") && root.get("data").has(key)) {
            candidate = root.get("data").get(key);
        } else if (root.has("content")) {
            candidate = root.get("content");
        } else if (root.isObject() && root.has("AccountId")) {
            candidate = root;
        }

        if (candidate == null) return out;
        if (candidate.isArray()) {
            for (Iterator<JsonNode> it = candidate.elements(); it.hasNext(); ) out.add(it.next());
        } else {
            out.add(candidate);
        }
        return out;
    }

    private static String text(JsonNode n, String... path) {
        JsonNode cur = n;
        for (String p : path) {
            if (cur == null) return null;
            cur = cur.get(p);
        }
        return cur == null || cur.isNull() ? null : cur.asText();
    }

    private static BigDecimal money(String raw) {
        if (raw == null || raw.isBlank()) return BigDecimal.ZERO;
        try {
            return new BigDecimal(raw.replace(",", "").trim());
        } catch (NumberFormatException e) {
            return BigDecimal.ZERO;
        }
    }

    private static LocalDate date(String raw) {
        if (raw == null || raw.isBlank()) return LocalDate.now();
        try {
            return OffsetDateTime.parse(raw).toLocalDate();
        } catch (Exception ignored) { }
        try {
            return LocalDate.parse(raw.substring(0, 10));
        } catch (Exception ignored) { }
        return LocalDate.now();
    }

    private static String firstNonNull(String... vals) {
        for (String v : vals) if (v != null && !v.isBlank()) return v;
        return null;
    }

    public List<AccountDto> accounts(JsonNode root) {
        List<AccountDto> out = new ArrayList<>();
        for (JsonNode a : collection(root, "Account")) {
            JsonNode inner = a.get("Account");
            JsonNode first = (inner != null && inner.isArray() && !inner.isEmpty()) ? inner.get(0) : inner;

            out.add(new AccountDto(
                    firstNonNull(text(a, "AccountId"), text(a, "accountId")),
                    firstNonNull(text(a, "Nickname"), text(first, "Name"), "Account"),
                    text(first, "Identification"),
                    firstNonNull(text(a, "AccountCategory"), text(a, "accountCategory"), "Personal"),
                    text(a, "AccountTypeCode"),
                    text(a, "Status"),
                    firstNonNull(text(a, "Currency"), "GBP"),
                    money(text(a, "Balance"))
            ));
        }
        return out;
    }

    public List<BalanceDto> balances(JsonNode root) {
        List<BalanceDto> out = new ArrayList<>();
        for (JsonNode b : collection(root, "Balance")) {
            boolean debit = "Debit".equalsIgnoreCase(text(b, "CreditDebitIndicator"));
            BigDecimal amount = money(text(b, "Amount", "Amount"));
            out.add(new BalanceDto(
                    text(b, "AccountId"),
                    text(b, "Type"),
                    debit ? amount.negate() : amount,
                    firstNonNull(text(b, "Amount", "Currency"), "GBP"),
                    text(b, "DateTime")
            ));
        }
        return out;
    }

    public List<TransactionDto> transactions(JsonNode root, String accountId) {
        List<TransactionDto> out = new ArrayList<>();
        for (JsonNode t : collection(root, "Transaction")) {
            String merchant = firstNonNull(
                    text(t, "MerchantDetails", "MerchantName"),
                    text(t, "TransactionInformation"),
                    "Unknown");
            String description = firstNonNull(text(t, "TransactionInformation"), merchant);
            String mcc = text(t, "MerchantDetails", "MerchantCategoryCode");
            boolean credit = "Credit".equalsIgnoreCase(text(t, "CreditDebitIndicator"));

            out.add(new TransactionDto(
                    firstNonNull(text(t, "TransactionId"), text(t, "TransactionReference")),
                    firstNonNull(text(t, "AccountId"), accountId),
                    date(firstNonNull(text(t, "BookingDateTime"), text(t, "ValueDateTime"))),
                    merchant,
                    description,
                    mcc,
                    categories.resolve(mcc, merchant, description),
                    money(text(t, "Amount", "Amount")).abs(),
                    firstNonNull(text(t, "Amount", "Currency"), "GBP"),
                    credit,
                    text(t, "Status")
            ));
        }
        out.sort((x, y) -> y.bookedOn().compareTo(x.bookedOn()));
        return out;
    }
}
