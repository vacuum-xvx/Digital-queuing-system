// Package persistence implements the application boundary using PostgreSQL.
package persistence

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

type Postgres struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

var _ application.UseCases = (*Postgres)(nil)

// UUID parsing stays private to persistence. Invalid resource IDs are not found.
func uuid(s string) (pgtype.UUID, error) {
	var id pgtype.UUID
	if err := id.Scan(s); err != nil || !id.Valid {
		return id, application.ErrNotFound
	}
	return id, nil
}
func dbError(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return application.ErrNotFound
	}
	if errors.Is(err, context.Canceled) {
		return context.Canceled
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return context.DeadlineExceeded
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "tickets_one_active_per_window" {
		return application.ErrWindowBusy
	}
	// Do not expose driver messages, SQL or connection details across the boundary.
	return errors.New("queue persistence operation failed")
}

const ticketColumns = `t.id::text, t.public_number, t.branch_id::text, t.service_id::text,
 t.source, t.status, w.id::text, w.number, t.created_at, t.queue_entered_at,
 t.called_at, t.service_started_at, t.completed_at, t.scheduled_at`
const ticketSelect = `SELECT ` + ticketColumns + ` FROM tickets t LEFT JOIN windows w ON w.id=t.window_id `

func scanTicket(row pgx.Row) (domain.Ticket, error) {
	var t domain.Ticket
	var wid *string
	var number *int
	err := row.Scan(&t.ID, &t.PublicNumber, &t.BranchID, &t.ServiceID, &t.Source, &t.Status, &wid, &number, &t.CreatedAt, &t.QueueEnteredAt, &t.CalledAt, &t.ServiceStartedAt, &t.CompletedAt, &t.ScheduledAt)
	if err != nil {
		return domain.Ticket{}, dbError(err)
	}
	if wid != nil {
		t.Window = &domain.WindowRef{ID: *wid, Number: *number}
	}
	t.CreatedAt = t.CreatedAt.UTC()
	t.QueueEnteredAt = t.QueueEnteredAt.UTC()
	for _, v := range []*time.Time{t.CalledAt, t.ServiceStartedAt, t.CompletedAt, t.ScheduledAt} {
		if v != nil {
			*v = v.UTC()
		}
	}
	return t, nil
}
func (p *Postgres) ListBranches(ctx context.Context) ([]domain.Branch, error) {
	rows, err := p.pool.Query(ctx, `SELECT id::text,name FROM branches ORDER BY name,id`)
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	out := []domain.Branch{}
	for rows.Next() {
		var b domain.Branch
		if err = rows.Scan(&b.ID, &b.Name); err != nil {
			return nil, dbError(err)
		}
		out = append(out, b)
	}
	return out, dbError(rows.Err())
}
func (p *Postgres) branch(ctx context.Context, branchID string) (pgtype.UUID, error) {
	id, err := uuid(branchID)
	if err != nil {
		return id, err
	}
	var exists bool
	err = p.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM branches WHERE id=$1)`, id).Scan(&exists)
	if err != nil {
		return id, dbError(err)
	}
	if !exists {
		return id, application.ErrNotFound
	}
	return id, nil
}
func (p *Postgres) ListBranchServices(ctx context.Context, branchID string) ([]domain.Service, error) {
	id, err := p.branch(ctx, branchID)
	if err != nil {
		return nil, err
	}
	rows, err := p.pool.Query(ctx, `SELECT s.id::text,s.code,s.name FROM services s JOIN branch_services bs ON bs.service_id=s.id WHERE bs.branch_id=$1 ORDER BY s.code,s.id`, id)
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	out := []domain.Service{}
	for rows.Next() {
		var s domain.Service
		if err = rows.Scan(&s.ID, &s.Code, &s.Name); err != nil {
			return nil, dbError(err)
		}
		out = append(out, s)
	}
	return out, dbError(rows.Err())
}
func (p *Postgres) ListBranchWindows(ctx context.Context, branchID string) ([]domain.Window, error) {
	id, err := p.branch(ctx, branchID)
	if err != nil {
		return nil, err
	}
	rows, err := p.pool.Query(ctx, `SELECT w.id::text,w.branch_id::text,w.number,w.status,s.id::text,s.code,s.name
 FROM windows w LEFT JOIN window_services ws ON ws.window_id=w.id LEFT JOIN services s ON s.id=ws.service_id
 WHERE w.branch_id=$1 ORDER BY w.number,w.id,s.code`, id)
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	out := []domain.Window{}
	for rows.Next() {
		var w domain.Window
		var sid, code, name *string
		if err = rows.Scan(&w.ID, &w.BranchID, &w.Number, &w.Status, &sid, &code, &name); err != nil {
			return nil, dbError(err)
		}
		if len(out) == 0 || out[len(out)-1].ID != w.ID {
			w.Services = []domain.Service{}
			out = append(out, w)
		}
		if sid != nil {
			i := len(out) - 1
			out[i].Services = append(out[i].Services, domain.Service{ID: *sid, Code: *code, Name: *name})
		}
	}
	return out, dbError(rows.Err())
}
func (p *Postgres) GetTicket(ctx context.Context, ticketID string) (domain.Ticket, error) {
	id, err := uuid(ticketID)
	if err != nil {
		return domain.Ticket{}, err
	}
	return scanTicket(p.pool.QueryRow(ctx, ticketSelect+`WHERE t.id=$1`, id))
}
func (p *Postgres) GetCurrentTicket(ctx context.Context, windowID string) (*domain.Ticket, error) {
	id, err := uuid(windowID)
	if err != nil {
		return nil, err
	}
	// Keep window existence and the returned ticket in one consistent snapshot.
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return nil, dbError(err)
	}
	defer tx.Rollback(context.Background())
	var exists bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM windows WHERE id=$1)`, id).Scan(&exists)
	if err != nil {
		return nil, dbError(err)
	}
	if !exists {
		return nil, application.ErrNotFound
	}
	t, err := scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.window_id=$1 AND t.status IN ('CALLED','SERVING')`, id))
	if errors.Is(err, application.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func replay(t domain.Ticket, branchID, serviceID pgtype.UUID) (application.CreateQRTicketResult, error) {
	b, _ := uuid(t.BranchID)
	s, _ := uuid(t.ServiceID)
	if b != branchID || s != serviceID || t.Source != domain.TicketSourceQR {
		return application.CreateQRTicketResult{}, application.ErrIdempotencyConflict
	}
	return application.CreateQRTicketResult{Ticket: t, Replayed: true}, nil
}
func (p *Postgres) CreateQRTicket(ctx context.Context, cmd application.CreateQRTicketCommand) (application.CreateQRTicketResult, error) {
	var empty application.CreateQRTicketResult
	b, err := uuid(cmd.BranchID)
	if err != nil {
		return empty, err
	}
	s, err := uuid(cmd.ServiceID)
	if err != nil {
		return empty, err
	}
	if strings.TrimSpace(cmd.IdempotencyKey) == "" {
		return empty, fmt.Errorf("idempotency key required: %w", application.ErrInvalidState)
	}
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return empty, dbError(err)
	}
	defer tx.Rollback(context.Background())
	existing, err := scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.idempotency_key=$1`, cmd.IdempotencyKey))
	if err == nil {
		return replay(existing, b, s)
	}
	if !errors.Is(err, application.ErrNotFound) {
		return empty, err
	}
	var enabled bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM branch_services WHERE branch_id=$1 AND service_id=$2)`, b, s).Scan(&enabled)
	if err != nil {
		return empty, dbError(err)
	}
	if !enabled {
		return empty, application.ErrNotFound
	}
	var tid string
	err = tx.QueryRow(ctx, `INSERT INTO tickets(branch_id,service_id,source,status,idempotency_key) VALUES($1,$2,'QR','WAITING',$3)
 ON CONFLICT(idempotency_key) DO NOTHING RETURNING id::text`, b, s, cmd.IdempotencyKey).Scan(&tid)
	if errors.Is(err, pgx.ErrNoRows) {
		// READ COMMITTED gives this statement a fresh snapshot after the conflicting insert commits.
		existing, err = scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.idempotency_key=$1`, cmd.IdempotencyKey))
		if err != nil {
			return empty, err
		}
		return replay(existing, b, s)
	}
	if err != nil {
		return empty, dbError(err)
	}
	t, err := scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.id=$1::uuid`, tid))
	if err != nil {
		return empty, err
	}
	if err = insertEvent(ctx, tx, t, domain.TicketEventCreated, nil, nil, nil); err != nil {
		return empty, err
	}
	if err = tx.Commit(ctx); err != nil {
		return empty, dbError(err)
	}
	return application.CreateQRTicketResult{Ticket: t}, nil
}
func (p *Postgres) CallNext(ctx context.Context, windowID string) (domain.Ticket, error) {
	var empty domain.Ticket
	id, err := uuid(windowID)
	if err != nil {
		return empty, err
	}
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return empty, dbError(err)
	}
	defer tx.Rollback(context.Background())
	var branch string
	var status domain.WindowStatus
	err = tx.QueryRow(ctx, `SELECT branch_id::text,status FROM windows WHERE id=$1 FOR UPDATE`, id).Scan(&branch, &status)
	if err != nil {
		return empty, dbError(err)
	}
	if status != domain.WindowStatusOpen {
		return empty, application.ErrWindowClosed
	}
	var busy bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM tickets WHERE window_id=$1 AND status IN ('CALLED','SERVING'))`, id).Scan(&busy)
	if err != nil {
		return empty, dbError(err)
	}
	if busy {
		return empty, application.ErrWindowBusy
	}

	policy, err := scanPolicy(tx.QueryRow(ctx, policySelect+` WHERE branch_id=$1::uuid`, branch))
	if errors.Is(err, application.ErrNotFound) {
		return empty, errors.New("queue policy missing for branch")
	}
	if err != nil {
		return empty, err
	}
	// Legacy LIVE shares the QR tier/FIFO for compatibility, not a separate policy.
	var tid string
	var from domain.TicketStatus
	err = tx.QueryRow(ctx, `WITH candidate AS (
 SELECT t.id,t.status FROM tickets t WHERE t.branch_id=$2::uuid
 AND ((t.source IN ('QR','LIVE') AND t.status='WAITING') OR
 (t.source='APPOINTMENT' AND t.status='SCHEDULED' AND t.scheduled_at <= transaction_timestamp()))
 AND EXISTS(SELECT 1 FROM window_services ws WHERE ws.window_id=$1 AND ws.service_id=t.service_id)
 ORDER BY CASE WHEN t.source='APPOINTMENT' THEN $3::integer ELSE $4::integer END DESC,
 CASE WHEN t.source='APPOINTMENT' THEN t.scheduled_at ELSE t.queue_entered_at END, t.id
 FOR UPDATE OF t SKIP LOCKED LIMIT 1
 ) UPDATE tickets t SET status='CALLED',window_id=$1,called_at=clock_timestamp()
 FROM candidate c WHERE t.id=c.id RETURNING t.id::text,c.status`, id, branch, policy.AppointmentDuePriority, policy.QRPriority).Scan(&tid, &from)
	if errors.Is(err, pgx.ErrNoRows) {
		return empty, application.ErrNoEligibleTickets
	}
	if err != nil {
		return empty, dbError(err)
	}
	t, err := scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.id=$1::uuid`, tid))
	if err != nil {
		return empty, err
	}
	priority := policy.QRPriority
	if t.Source == domain.TicketSourceAppointment {
		priority = policy.AppointmentDuePriority
	}
	if err = insertEvent(ctx, tx, t, domain.TicketEventCalled, &from, &policy.Version, &priority); err != nil {
		return empty, err
	}
	if err = tx.Commit(ctx); err != nil {
		return empty, dbError(err)
	}
	return t, nil
}
func (p *Postgres) StartService(ctx context.Context, ticketID string) (domain.Ticket, error) {
	return p.transition(ctx, ticketID, domain.TicketStatusCalled, domain.TicketStatusServing, "service_started_at")
}
func (p *Postgres) CompleteService(ctx context.Context, ticketID string) (domain.Ticket, error) {
	return p.transition(ctx, ticketID, domain.TicketStatusServing, domain.TicketStatusCompleted, "completed_at")
}
func (p *Postgres) transition(ctx context.Context, ticketID string, from, to domain.TicketStatus, column string) (domain.Ticket, error) {
	var empty domain.Ticket
	id, err := uuid(ticketID)
	if err != nil {
		return empty, err
	}
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return empty, dbError(err)
	}
	defer tx.Rollback(context.Background())
	var status domain.TicketStatus
	err = tx.QueryRow(ctx, `SELECT status FROM tickets WHERE id=$1 FOR UPDATE`, id).Scan(&status)
	if err != nil {
		return empty, dbError(err)
	}
	if status != from {
		return empty, application.ErrInvalidState
	}
	// column is a private constant supplied only by StartService/CompleteService.
	_, err = tx.Exec(ctx, `UPDATE tickets SET status=$2,`+column+`=clock_timestamp() WHERE id=$1 AND status=$3`, id, to, from)
	if err != nil {
		return empty, dbError(err)
	}
	t, err := scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.id=$1`, id))
	if err != nil {
		return empty, err
	}
	eventType := domain.TicketEventServiceStarted
	if to == domain.TicketStatusCompleted {
		eventType = domain.TicketEventCompleted
	}
	if err = insertEvent(ctx, tx, t, eventType, &from, nil, nil); err != nil {
		return empty, err
	}
	if err = tx.Commit(ctx); err != nil {
		return empty, dbError(err)
	}
	return t, nil
}

func (p *Postgres) createAnyTicket(ctx context.Context, branchID, serviceID, source, idempotencyKey string) (domain.Ticket, error) {
	var empty domain.Ticket
	b, err := uuid(branchID)
	if err != nil {
		return empty, err
	}
	s, err := uuid(serviceID)
	if err != nil {
		return empty, err
	}
	if strings.TrimSpace(idempotencyKey) == "" {
		return empty, fmt.Errorf("idempotency key required: %w", application.ErrInvalidState)
	}
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return empty, dbError(err)
	}
	defer tx.Rollback(context.Background())

	existing, err := scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.idempotency_key=$1`, idempotencyKey))
	if err == nil {
		if string(existing.Source) != source {
			return empty, application.ErrIdempotencyConflict
		}
		return existing, nil
	}
	if !errors.Is(err, application.ErrNotFound) {
		return empty, err
	}

	var enabled bool
	err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM branch_services WHERE branch_id=$1 AND service_id=$2)`, b, s).Scan(&enabled)
	if err != nil {
		return empty, dbError(err)
	}
	if !enabled {
		return empty, application.ErrNotFound
	}

	var tid string
	err = tx.QueryRow(ctx, `INSERT INTO tickets(branch_id,service_id,source,status,idempotency_key) VALUES($1,$2,$3,'WAITING',$4)
 ON CONFLICT(idempotency_key) DO NOTHING RETURNING id::text`, b, s, source, idempotencyKey).Scan(&tid)
	if errors.Is(err, pgx.ErrNoRows) {
		existing, err = scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.idempotency_key=$1`, idempotencyKey))
		if err != nil {
			return empty, err
		}
		if string(existing.Source) != source {
			return empty, application.ErrIdempotencyConflict
		}
		return existing, nil
	}
	if err != nil {
		return empty, dbError(err)
	}
	t, err := scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.id=$1::uuid`, tid))
	if err != nil {
		return empty, err
	}
	if err = tx.Commit(ctx); err != nil {
		return empty, dbError(err)
	}
	return t, nil
}

func (p *Postgres) CreateLiveTicket(ctx context.Context, cmd application.CreateLiveTicketCommand) (domain.Ticket, error) {
	return p.createAnyTicket(ctx, cmd.BranchID, cmd.ServiceID, string(domain.TicketSourceLive), cmd.IdempotencyKey)
}

func (p *Postgres) ChangeWindowStatus(ctx context.Context, windowID string, status domain.WindowStatus) (domain.Window, error) {
	id, err := uuid(windowID)
	if err != nil {
		return domain.Window{}, err
	}
	var branchID string
	err = p.pool.QueryRow(ctx, `UPDATE windows SET status=$1 WHERE id=$2 RETURNING branch_id::text`, string(status), id).Scan(&branchID)
	if err != nil {
		return domain.Window{}, dbError(err)
	}
	windows, err := p.ListBranchWindows(ctx, branchID)
	if err != nil {
		return domain.Window{}, err
	}
	for _, w := range windows {
		if w.ID == windowID {
			return w, nil
		}
	}
	return domain.Window{}, application.ErrNotFound
}

func (p *Postgres) ReturnTicket(ctx context.Context, ticketID string) (domain.Ticket, error) {
	id, err := uuid(ticketID)
	if err != nil {
		return domain.Ticket{}, err
	}
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return domain.Ticket{}, dbError(err)
	}
	defer tx.Rollback(context.Background())
	tag, err := tx.Exec(ctx, `UPDATE tickets SET status='WAITING', window_id=NULL WHERE id=$1 AND source<>'APPOINTMENT' AND status IN ('CALLED', 'SERVING')`, id)
	if err != nil {
		return domain.Ticket{}, dbError(err)
	}
	if tag.RowsAffected() == 0 {
		return domain.Ticket{}, application.ErrInvalidState
	}
	t, err := scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.id=$1`, id))
	if err != nil {
		return domain.Ticket{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return domain.Ticket{}, dbError(err)
	}
	return t, nil
}

func (p *Postgres) RedirectTicket(ctx context.Context, cmd application.RedirectTicketCommand) (domain.Ticket, error) {
	id, err := uuid(cmd.TicketID)
	if err != nil {
		return domain.Ticket{}, err
	}
	ns, err := uuid(cmd.NewServiceID)
	if err != nil {
		return domain.Ticket{}, err
	}

	var nw *pgtype.UUID
	if cmd.NewWindowID != "" {
		parsed, err := uuid(cmd.NewWindowID)
		if err != nil {
			return domain.Ticket{}, err
		}
		nw = &parsed
	}

	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return domain.Ticket{}, dbError(err)
	}
	defer tx.Rollback(context.Background())

	var tag pgconn.CommandTag
	if nw != nil {
		tag, err = tx.Exec(ctx, `UPDATE tickets SET status='WAITING', window_id=$1, service_id=$2 WHERE id=$3 AND source<>'APPOINTMENT' AND status IN ('CALLED', 'SERVING')`, nw, ns, id)
	} else {
		tag, err = tx.Exec(ctx, `UPDATE tickets SET status='WAITING', window_id=NULL, service_id=$1 WHERE id=$2 AND source<>'APPOINTMENT' AND status IN ('CALLED', 'SERVING')`, ns, id)
	}
	if err != nil {
		return domain.Ticket{}, dbError(err)
	}
	if tag.RowsAffected() == 0 {
		return domain.Ticket{}, application.ErrInvalidState
	}
	t, err := scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.id=$1`, id))
	if err != nil {
		return domain.Ticket{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return domain.Ticket{}, dbError(err)
	}
	return t, nil
}
