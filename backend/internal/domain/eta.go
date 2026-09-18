package domain

import "time"

type TicketETA struct {
	TicketID             string
	TicketStatus         TicketStatus
	Reason               QueuePositionReason
	EstimatedWaitSeconds *int
	EstimatedCallAt      *time.Time
	Position             *int
	ReferenceWindow      *WindowRef
	SampleSize           int
	UsedFallback         bool
	CalculatedAt         time.Time
}
