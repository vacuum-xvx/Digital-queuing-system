package httpapi

import (
	"github.com/go-chi/chi/v5"
	"net/http"
)

func (a *API) GetOperatorQueue(w http.ResponseWriter, r *http.Request) {
	queue, err := a.usecases.GetOperatorQueue(r.Context(), chi.URLParam(r, "branchId"))
	if err != nil {
		a.respondError(w, r, err)
		return
	}
	writeJSONResponse(w, http.StatusOK, queue)
}
