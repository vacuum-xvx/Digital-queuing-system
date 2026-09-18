package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

func TestETAHTTPContract(t *testing.T) {
	for _, reason := range []domain.QueuePositionReason{domain.QueuePositionAvailable, domain.QueuePositionNotEligibleYet, domain.QueuePositionNoOpenCompatibleWindow, domain.QueuePositionNotQueued} {
		eta := domain.TicketETA{TicketID: apiTicket, TicketStatus: domain.TicketStatusWaiting, Reason: reason, CalculatedAt: time.Date(2026, 9, 18, 12, 0, 0, 0, time.UTC)}
		if reason == domain.QueuePositionAvailable {
			wait, position := 600, 3
			call := eta.CalculatedAt.Add(600 * time.Second)
			eta.EstimatedWaitSeconds = &wait
			eta.EstimatedCallAt = &call
			eta.Position = &position
			eta.ReferenceWindow = &domain.WindowRef{ID: apiTicket, Number: 1}
			eta.UsedFallback = true
			eta.SampleSize = 2
		}
		h := setupTest(&FakeUseCases{GetTicketETAFunc: func(_ context.Context, id string) (domain.TicketETA, error) {
			if id != apiTicket {
				t.Fatal(id)
			}
			return eta, nil
		}})
		w := request3(t, h, "GET", "/api/v1/tickets/"+apiTicket+"/eta", "", "", 200)
		var fields map[string]json.RawMessage
		if err := json.Unmarshal(w.Body.Bytes(), &fields); err != nil {
			t.Fatal(err)
		}
		if len(fields) != 10 {
			t.Fatal(w.Body.String())
		}
		for _, key := range []string{"estimatedWaitSeconds", "estimatedCallAt", "position", "referenceWindow"} {
			if reason != domain.QueuePositionAvailable && string(fields[key]) != "null" {
				t.Fatal(key, w.Body.String())
			}
		}
	}
	h := setupTest(&FakeUseCases{GetTicketETAFunc: func(context.Context, string) (domain.TicketETA, error) {
		return domain.TicketETA{}, application.ErrNotFound
	}})
	request3(t, h, "GET", "/api/v1/tickets/"+apiTicket+"/eta", "", "", http.StatusNotFound)
	request3(t, h, "GET", "/api/v1/tickets/not-uuid/eta", "", "", http.StatusBadRequest)
}
