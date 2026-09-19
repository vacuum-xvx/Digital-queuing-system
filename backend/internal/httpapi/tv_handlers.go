package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"postcode/backend/internal/domain"
)

type TVWindowDTO struct {
	Number              int     `json:"number"`
	CurrentTicketNumber *string `json:"currentTicketNumber"`
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
	for _, wnd := range overview.Windows {
		if wnd.Status != domain.WindowStatusClosed {
			windows = append(windows, TVWindowDTO{
				Number:              wnd.Number,
				CurrentTicketNumber: wnd.CurrentTicketNumber,
				Status:              string(wnd.Status),
			})
		}
	}

	// For the TV, we only need top waiting tickets
	queue := make([]TVQueueTicketDTO, 0, len(overview.Queue))
	for i, t := range overview.Queue {
		if i >= 15 {
			break
		}
		queue = append(queue, TVQueueTicketDTO{
			PublicNumber: t.PublicNumber,
			Source:       string(t.Source),
			ServiceName:  t.ServiceName,
			Status:       string(t.Status),
		})
	}

	writeJSONResponse(w, http.StatusOK, TVQueueResponse{
		Windows: windows,
		Queue:   queue,
	})
}
