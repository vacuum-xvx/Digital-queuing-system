package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func decodeRequest(r *http.Request, dst any) error {
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(dst); err != nil {
		return err
	}
	if err := d.Decode(new(any)); err != io.EOF {
		return errors.New("expected one JSON object")
	}
	return nil
}

func validUUID(value string) bool {
	var id pgtype.UUID
	return id.Scan(value) == nil && id.Valid
}

func validPublicNumber(value string) bool {
	v := strings.TrimSpace(value)
	if strings.HasPrefix(v, "A-") || strings.HasPrefix(v, "Q-") || strings.HasPrefix(v, "L-") {
		return len(v) >= 3 && len(v) <= 32
	}
	if len(v) >= 1 && len(v) <= 16 {
		for _, c := range v {
			if c < '0' || c > '9' {
				return false
			}
		}
		return true
	}
	return false
}

func ticketPath(w http.ResponseWriter, r *http.Request) (string, bool) {
	id := chi.URLParam(r, "ticketId")
	if !validUUID(id) && !validPublicNumber(id) {
		writeJSONError(w, r, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid ticketId")
		return "", false
	}
	return id, true
}

func (a *API) ArriveAppointment(w http.ResponseWriter, r *http.Request) {
	id, ok := ticketPath(w, r)
	if !ok {
		return
	}
	view, err := a.usecases.ArriveAppointment(r.Context(), id)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, AppointmentResponse{Ticket: mapTicket(view.Ticket), ScheduledAt: view.ScheduledAt})
}

func (a *API) MarkNoShow(w http.ResponseWriter, r *http.Request) {
	id, ok := ticketPath(w, r)
	if !ok {
		return
	}
	ticket, err := a.usecases.MarkNoShow(r.Context(), id)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, mapTicket(ticket))
}

type QueuePositionDTO struct {
	TicketID           string        `json:"ticketId"`
	TicketStatus       string        `json:"ticketStatus"`
	Reason             string        `json:"reason"`
	Position           *int          `json:"position"`
	ReferenceWindow    *WindowRefDTO `json:"referenceWindow"`
	CalculatedAt       time.Time     `json:"calculatedAt"`
	EffectivePriority  *int64        `json:"effectivePriority"`
	EffectiveQueueTime *time.Time    `json:"effectiveQueueTime"`
}

func (a *API) GetQueuePosition(w http.ResponseWriter, r *http.Request) {
	id, ok := ticketPath(w, r)
	if !ok {
		return
	}
	p, err := a.usecases.GetQueuePosition(r.Context(), id)
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	var window *WindowRefDTO
	if p.ReferenceWindow != nil {
		window = &WindowRefDTO{ID: p.ReferenceWindow.ID, Number: p.ReferenceWindow.Number}
	}
	writeJSONResponse(w, http.StatusOK, QueuePositionDTO{
		TicketID: p.TicketID, TicketStatus: string(p.TicketStatus), Reason: string(p.Reason),
		Position: p.Position, ReferenceWindow: window, CalculatedAt: p.CalculatedAt,
		EffectivePriority: p.EffectivePriority, EffectiveQueueTime: p.EffectiveQueueTime,
	})
}
