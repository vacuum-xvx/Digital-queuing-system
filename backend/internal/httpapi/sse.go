package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

type SSEEvent struct {
	Topic string      `json:"topic"`
	Type  string      `json:"type"`
	Data  interface{} `json:"data"`
}

type EventBroker struct {
	mu          sync.RWMutex
	subscribers map[string]map[chan SSEEvent]struct{}
}

func NewEventBroker() *EventBroker {
	return &EventBroker{
		subscribers: make(map[string]map[chan SSEEvent]struct{}),
	}
}

func (b *EventBroker) Subscribe(topics []string) (chan SSEEvent, func()) {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch := make(chan SSEEvent, 32)
	for _, t := range topics {
		t = strings.TrimSpace(t)
		if t == "" {
			continue
		}
		if _, ok := b.subscribers[t]; !ok {
			b.subscribers[t] = make(map[chan SSEEvent]struct{})
		}
		b.subscribers[t][ch] = struct{}{}
	}

	unsubscribe := func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		for _, t := range topics {
			t = strings.TrimSpace(t)
			if subs, ok := b.subscribers[t]; ok {
				delete(subs, ch)
				if len(subs) == 0 {
					delete(b.subscribers, t)
				}
			}
		}
		close(ch)
	}

	return ch, unsubscribe
}

func (b *EventBroker) Publish(topic, eventType string, data interface{}) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	subs, ok := b.subscribers[topic]
	if !ok || len(subs) == 0 {
		return
	}

	event := SSEEvent{
		Topic: topic,
		Type:  eventType,
		Data:  data,
	}

	for ch := range subs {
		select {
		case ch <- event:
		default:
			// Non-blocking write: drop if subscriber buffer is full
		}
	}
}

// SSE handles GET /api/v1/events?topic=...
func (a *API) SSE(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSONError(w, r, http.StatusInternalServerError, "SSE_UNSUPPORTED", "streaming unsupported")
		return
	}

	topics := r.URL.Query()["topic"]
	if len(topics) == 0 {
		if t := r.URL.Query().Get("topics"); t != "" {
			topics = strings.Split(t, ",")
		}
	}
	if len(topics) == 0 {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION", "at least one topic is required")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch, unsubscribe := a.broker.Subscribe(topics)
	defer unsubscribe()

	// Initial connected ping
	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"ok\"}\n\n")
	flusher.Flush()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case event, ok := <-ch:
			if !ok {
				return
			}
			dataBytes, err := json.Marshal(event)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, dataBytes)
			flusher.Flush()
		}
	}
}
