package com.banfico.hackathon.controller;

import com.banfico.hackathon.service.AiCoachService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class ChatController {

    private final AiCoachService ai;

    public ChatController(AiCoachService ai) {
        this.ai = ai;
    }

    public record ChatRequest(String message, List<Map<String, Object>> history) {}

    /** Conversational financial assistant. */
    @PostMapping("/chat")
    public Map<String, Object> chat(@RequestBody ChatRequest request) {
        return ai.chat(request.message(), request.history() == null ? List.of() : request.history());
    }

    /** Proactive AI coaching for the dashboard. */
    @GetMapping("/insights/coach")
    public Map<String, Object> coach() {
        return ai.coach();
    }
}
