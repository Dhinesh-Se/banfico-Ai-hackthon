package com.banfico.hackathon.service;

import com.banfico.hackathon.config.AnthropicProperties;
import com.banfico.hackathon.domain.TransactionDto;
import com.banfico.hackathon.dto.Insights;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The AI layer. Two capabilities: coaching (narrate the numbers) and a
 * conversational assistant (answer questions about the user's money).
 *
 * THE IMPORTANT DESIGN RULE: InsightsService does all arithmetic in plain Java,
 * deterministically. The model receives finished figures and is told never to
 * compute or invent one. Ask an LLM to add up your transactions and sooner or
 * later a judge will spot a total that does not reconcile — and then nothing
 * else you show them is trusted.
 *
 * Hackathon hardening: if a paid/model API key is missing or the upstream model
 * is down, this service now falls back to an embedded retrieval + rules coach.
 * That gives a real AI-style experience on stage without depending on a live
 * token, and it is the same RAG seam that can later be replaced by Spring AI's
 * ChatClient + VectorStore.
 */
@Service
public class AiCoachService {

    private static final Logger log = LoggerFactory.getLogger(AiCoachService.class);
    private static final Duration TIMEOUT = Duration.ofSeconds(60);
    private static final int MAX_TXNS_IN_CONTEXT = 60;

    private static final String SYSTEM_PROMPT = """
            You are a financial coach inside a UK personal banking app.

            You will be given a JSON payload containing the user's pre-computed
            financial figures and a sample of recent transactions.

            Rules you must follow:
            - Use ONLY figures present in the JSON. Never calculate a new total,
              average or projection, and never invent a number, merchant or date.
            - If the JSON does not contain what is needed to answer, say so plainly
              and name what is missing.
            - Amounts are GBP. Quote them as given, to two decimal places.
            - Be specific and concrete. "Your Dining spend rose 34% to 412.90"
              beats "consider reviewing discretionary spending".
            - Be warm and non-judgemental. Never shame the user about money.
            - Keep it short: at most three observations unless asked for more.
            """;

    private final WebClient webClient;
    private final AnthropicProperties props;
    private final AggregationService aggregation;
    private final ObjectMapper json;

    public AiCoachService(WebClient webClient, AnthropicProperties props,
                          AggregationService aggregation, ObjectMapper json) {
        this.webClient = webClient;
        this.props = props;
        this.aggregation = aggregation;
        this.json = json;
    }

    /** Proactive coaching for the dashboard. */
    public Map<String, Object> coach() {
        Insights.Overview overview = aggregation.overview();
        AiReply reply = ask(buildContext(overview, aggregation.allTransactions()),
                "Give me three specific observations about my finances right now, "
                        + "each with a concrete next step. Cite the exact figures.",
                List.of(), overview, aggregation.allTransactions());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("coaching", reply.text());
        out.put("mode", reply.mode());
        out.put("sources", reply.sources());
        out.put("healthScore", overview.health().score());
        out.put("grade", overview.health().grade());
        return out;
    }

    /** Conversational assistant. Pass prior turns to keep context. */
    public Map<String, Object> chat(String question, List<Map<String, String>> history) {
        Insights.Overview overview = aggregation.overview();
        AiReply reply = ask(buildContext(overview, aggregation.allTransactions()), question, history,
                overview, aggregation.allTransactions());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("answer", reply.text());
        out.put("mode", reply.mode());
        out.put("sources", reply.sources());
        return out;
    }

    private String buildContext(Insights.Overview overview, List<TransactionDto> txns) {
        try {
            Map<String, Object> ctx = new LinkedHashMap<>();
            ctx.put("summary", overview);
            ctx.put("recentTransactions", txns.size() > MAX_TXNS_IN_CONTEXT
                    ? txns.subList(0, MAX_TXNS_IN_CONTEXT) : txns);
            ctx.put("note", "All monetary values are GBP and already computed. Do not recalculate.");
            return json.writeValueAsString(ctx);
        } catch (Exception e) {
            throw new IllegalStateException("Could not serialise financial context", e);
        }
    }

    private AiReply ask(String context, String question, List<Map<String, String>> history,
                        Insights.Overview overview, List<TransactionDto> txns) {
        if (!props.isConfigured()) {
            return localRagAnswer(question, overview, txns, "local-rag:no-api-key");
        }

        List<Map<String, Object>> messages = new ArrayList<>();
        if (history != null) {
            for (Map<String, String> turn : history) {
                String role = turn.get("role");
                String content = turn.get("content");
                if (role == null || content == null) continue;
                messages.add(Map.<String, Object>of("role", role, "content", content));
            }
        }
        messages.add(Map.<String, Object>of("role", "user", "content",
                "Here is my financial data as JSON:\n" + context + "\n\nQuestion: " + question));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", props.getModel());
        body.put("max_tokens", props.getMaxTokens());
        body.put("system", SYSTEM_PROMPT);
        body.put("messages", messages);

        try {
            JsonNode response = webClient.post()
                    .uri(props.getBaseUrl())
                    .header("x-api-key", props.getApiKey())
                    .header("anthropic-version", props.getVersion())
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(JsonNode.class)
                    .block(TIMEOUT);

            return new AiReply(extractText(response), "hosted-llm", List.of("overview", "recentTransactions"));
        } catch (WebClientResponseException e) {
            log.warn("Anthropic API error [{}]. Falling back to local RAG coach.", e.getStatusCode());
            return localRagAnswer(question, overview, txns, "local-rag:provider-" + e.getStatusCode().value());
        } catch (RuntimeException e) {
            log.warn("Anthropic API unavailable. Falling back to local RAG coach: {}", e.toString());
            return localRagAnswer(question, overview, txns, "local-rag:provider-unavailable");
        }
    }

    private AiReply localRagAnswer(String question, Insights.Overview overview, List<TransactionDto> txns, String mode) {
        List<KnowledgeSnippet> corpus = buildKnowledgeBase(overview, txns);
        String q = question == null ? "" : question.toLowerCase(Locale.ROOT);
        List<KnowledgeSnippet> retrieved = corpus.stream()
                .sorted(Comparator.comparingInt((KnowledgeSnippet s) -> score(s, q)).reversed())
                .limit(4)
                .toList();

        StringBuilder answer = new StringBuilder();
        answer.append("I can answer without an external AI token using the built-in finance RAG coach. ");
        if (overview.transactionCount() == 0) {
            answer.append("There is no transaction history yet, so seed/connect accounts before judging insights.");
        } else if (q.contains("subscription") || q.contains("recurring")) {
            answer.append(subscriptionNarrative(overview));
        } else if (q.contains("anomal") || q.contains("unusual") || q.contains("fraud")) {
            answer.append(anomalyNarrative(overview));
        } else if (q.contains("category") || q.contains("spend") || q.contains("expense")) {
            answer.append(categoryNarrative(overview));
        } else if (q.contains("health") || q.contains("score") || q.contains("improve")) {
            answer.append(healthNarrative(overview));
        } else {
            answer.append(healthNarrative(overview)).append(" ").append(categoryNarrative(overview));
        }
        answer.append(" Retrieved context: ");
        answer.append(String.join("; ", retrieved.stream().map(KnowledgeSnippet::text).toList()));
        return new AiReply(answer.toString(), mode, retrieved.stream().map(KnowledgeSnippet::source).toList());
    }

    private List<KnowledgeSnippet> buildKnowledgeBase(Insights.Overview overview, List<TransactionDto> txns) {
        List<KnowledgeSnippet> snippets = new ArrayList<>();
        snippets.add(new KnowledgeSnippet("health", "Health score " + overview.health().score() + "/100 (" + overview.health().grade() + ")"));
        overview.health().observations().forEach(o -> snippets.add(new KnowledgeSnippet("health", o.title() + ": " + o.detail())));
        overview.categories().stream().limit(5).forEach(c -> snippets.add(new KnowledgeSnippet("category", c.category() + " spend is £" + money(c.total()) + " across " + c.transactionCount() + " transactions")));
        overview.subscriptions().stream().limit(5).forEach(s -> snippets.add(new KnowledgeSnippet("subscription", s.merchant() + " costs about £" + money(s.estimatedAnnualCost()) + " per year")));
        overview.anomalies().stream().limit(5).forEach(a -> snippets.add(new KnowledgeSnippet("anomaly", a.transaction().merchant() + " was flagged because " + a.reason())));
        txns.stream().filter(t -> !t.credit()).limit(8).forEach(t -> snippets.add(new KnowledgeSnippet("transaction", t.bookedOn() + " " + t.merchant() + " £" + money(t.amount()) + " in " + t.category())));
        return snippets;
    }

    private int score(KnowledgeSnippet snippet, String q) {
        int score = q.contains(snippet.source()) ? 5 : 0;
        for (String token : q.split("\\W+")) {
            if (token.length() > 3 && snippet.text().toLowerCase(Locale.ROOT).contains(token)) score++;
        }
        return score;
    }

    private String healthNarrative(Insights.Overview o) {
        String obs = o.health().observations().isEmpty() ? "No observations yet." : o.health().observations().get(0).detail();
        return "Your financial health is " + o.health().grade() + " at " + o.health().score() + "/100. " + obs;
    }

    private String categoryNarrative(Insights.Overview o) {
        if (o.categories().isEmpty()) return "I do not have enough category data yet.";
        var top = o.categories().get(0);
        return "Biggest spend area is " + top.category() + " at £" + money(top.total()) + " (" + money(top.sharePercent()) + "% of outgoings). Next step: set a weekly review for that category.";
    }

    private String subscriptionNarrative(Insights.Overview o) {
        if (o.subscriptions().isEmpty()) return "I did not find recurring subscriptions yet.";
        var top = o.subscriptions().get(0);
        return "Highest recurring commitment is " + top.merchant() + " at about £" + money(top.estimatedAnnualCost()) + " per year. Next step: confirm you still use it before renewal.";
    }

    private String anomalyNarrative(Insights.Overview o) {
        if (o.anomalies().isEmpty()) return "No unusual transactions are currently flagged.";
        var a = o.anomalies().get(0);
        return "Most recent unusual item is " + a.transaction().merchant() + " for £" + money(a.transaction().amount()) + ": " + a.reason() + ". Next step: verify the receipt or dispute it.";
    }

    private String extractText(JsonNode response) {
        if (response == null || !response.has("content")) {
            throw new AiUnavailableException("Empty response from AI provider");
        }
        StringBuilder sb = new StringBuilder();
        for (JsonNode block : response.get("content")) {
            if ("text".equals(block.path("type").asText())) {
                sb.append(block.path("text").asText());
            }
        }
        return sb.toString().trim();
    }

    private static String money(BigDecimal v) {
        return (v == null ? BigDecimal.ZERO : v).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private record AiReply(String text, String mode, List<String> sources) {}
    private record KnowledgeSnippet(String source, String text) {}

    public static class AiUnavailableException extends RuntimeException {
        public AiUnavailableException(String msg) { super(msg); }
    }
}
