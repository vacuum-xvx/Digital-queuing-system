package httpapi

import (
	"net/http"
	"time"
)

type TicketETADTO struct {
	TicketID             string        `json:"ticketId"`
	TicketStatus         string        `json:"ticketStatus"`
	Reason               string        `json:"reason"`
	EstimatedWaitSeconds *int          `json:"estimatedWaitSeconds"`
	EstimatedCallAt      *time.Time    `json:"estimatedCallAt"`
	Position             *int          `json:"position"`
	ReferenceWindow      *WindowRefDTO `json:"referenceWindow"`
	SampleSize           int           `json:"sampleSize"`
	UsedFallback         bool          `json:"usedFallback"`
	CalculatedAt         time.Time     `json:"calculatedAt"`
}

func (a *API) GetTicketETA(w http.ResponseWriter, r *http.Request) {
	id, ok := ticketPath(w, r)
	if !ok {
		return
	}
	eta, err := a.usecases.GetTicketETA(r.Context(), id)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	var window *WindowRefDTO
	if eta.ReferenceWindow != nil {
		window = &WindowRefDTO{ID: eta.ReferenceWindow.ID, Number: eta.ReferenceWindow.Number}
	}
	writeJSONResponse(w, http.StatusOK, TicketETADTO{TicketID: eta.TicketID, TicketStatus: string(eta.TicketStatus), Reason: string(eta.Reason), EstimatedWaitSeconds: eta.EstimatedWaitSeconds, EstimatedCallAt: eta.EstimatedCallAt, Position: eta.Position, ReferenceWindow: window, SampleSize: eta.SampleSize, UsedFallback: eta.UsedFallback, CalculatedAt: eta.CalculatedAt})
}
