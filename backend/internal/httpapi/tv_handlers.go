package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"postcode/backend/internal/domain"
)

type TVWindowDTO struct {
	Number              int     `json:"number"`
	CurrentTicketNumber *string `json:"currentTicketNumber"`
	CurrentTicketStatus string  `json:"currentTicketStatus,omitempty"`
	Status              string  `json:"status"`
}

type TVQueueTicketDTO struct {
	PublicNumber string `json:"publicNumber"`
	Source       string `json:"source"`
	ServiceName  string `json:"serviceName"`
	Status       string `json:"status"`
}

type TVQueueResponse struct {
	Windows []TVWindowDTO      `json:"windows"`
	Queue   []TVQueueTicketDTO `json:"queue"`
}

func (a *API) GetTVQueue(w http.ResponseWriter, r *http.Request) {
	branchID := chi.URLParam(r, "branchId")

	// Reuse GetAdminOverview to avoid writing new complex SQL queries for MVP
	overview, err := a.usecases.GetAdminOverview(r.Context(), branchID)
	if err != nil {
		a.respondError(w, r, err)
		return
	}

	windows := make([]TVWindowDTO, 0, len(overview.Windows))
	statusByTicket := make(map[string]string, len(overview.Queue))
	for _, ticket := range overview.Queue {
		statusByTicket[ticket.PublicNumber] = string(ticket.Status)
	}
	for _, wnd := range overview.Windows {
		if wnd.Status != domain.WindowStatusClosed {
			currentStatus := ""
			if wnd.CurrentTicketNumber != nil {
				currentStatus = statusByTicket[*wnd.CurrentTicketNumber]
			}
			windows = append(windows, TVWindowDTO{
				Number:              wnd.Number,
				CurrentTicketNumber: wnd.CurrentTicketNumber,
				CurrentTicketStatus: currentStatus,
				Status:              string(wnd.Status),
			})
		}
	}

	// For the TV, we only need top waiting tickets
	queue := make([]TVQueueTicketDTO, 0, len(overview.Queue))
	for _, t := range overview.Queue {
		if t.Status != domain.TicketStatusWaiting && t.Status != domain.TicketStatusScheduled {
			continue
		}
		if len(queue) >= 15 {
			break
		}
		queue = append(queue, TVQueueTicketDTO{
			PublicNumber: t.PublicNumber,
			Source:       string(t.Source),
			ServiceName:  t.ServiceName,
			Status:       "WAITING",
		})
	}

	writeJSONResponse(w, http.StatusOK, TVQueueResponse{
		Windows: windows,
		Queue:   queue,
	})
}
