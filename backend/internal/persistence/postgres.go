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
 t.called_at, t.service_started_at, t.completed_at, t.scheduled_at, t.arrived_at, t.no_show_at`
const ticketSelect = `SELECT ` + ticketColumns + ` FROM tickets t LEFT JOIN windows w ON w.id=t.window_id `

func scanTicket(row pgx.Row) (domain.Ticket, error) {
	var t domain.Ticket
	var wid *string
	var number *int
	err := row.Scan(&t.ID, &t.PublicNumber, &t.BranchID, &t.ServiceID, &t.Source, &t.Status, &wid, &number, &t.CreatedAt, &t.QueueEnteredAt, &t.CalledAt, &t.ServiceStartedAt, &t.CompletedAt, &t.ScheduledAt, &t.ArrivedAt, &t.NoShowAt)
	if err != nil {
		return domain.Ticket{}, dbError(err)
	}
	if wid != nil {
		t.Window = &domain.WindowRef{ID: *wid, Number: *number}
	}
	t.CreatedAt = t.CreatedAt.UTC()
	t.QueueEnteredAt = t.QueueEnteredAt.UTC()
	for _, v := range []*time.Time{t.CalledAt, t.ServiceStartedAt, t.CompletedAt, t.ScheduledAt, t.ArrivedAt, t.NoShowAt} {
		if v != nil {
			*v = v.UTC()
		}
	}
	return t, nil
}
func (p *Postgres) ListBranches(ctx context.Context) ([]domain.Branch, error) {
	rows, err := p.pool.Query(ctx, `SELECT id::text, name, address, work_hours, timezone_offset FROM branches ORDER BY name, id`)
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	out := []domain.Branch{}
	for rows.Next() {
		var b domain.Branch
		if err = rows.Scan(&b.ID, &b.Name, &b.Address, &b.WorkHours, &b.TimezoneOffset); err != nil {
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
		clean := strings.TrimSpace(ticketID)
		return scanTicket(p.pool.QueryRow(ctx, ticketSelect+`WHERE (UPPER(t.public_number)=UPPER($1) OR UPPER(t.public_number)=UPPER('A-' || $1) OR UPPER(t.public_number)=UPPER('A-' || LPAD($1, 6, '0')))`, clean))
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
	var decisionTime time.Time
	if err = tx.QueryRow(ctx, `SELECT transaction_timestamp()`).Scan(&decisionTime); err != nil {
		return empty, dbError(err)
	}
	var tid string
	var from domain.TicketStatus
	var priority int64
	err = tx.QueryRow(ctx, `WITH candidate AS (`+rankedCandidates+canonicalOrder+`
 FOR UPDATE OF t SKIP LOCKED LIMIT 1
 ) UPDATE tickets t SET status='CALLED',window_id=$1::uuid,called_at=$3::timestamptz,arrived_at=COALESCE(t.arrived_at,$3::timestamptz)
 FROM candidate c WHERE t.id=c.id RETURNING t.id::text,c.status,c.effective_priority`,
		rankingArgs(windowID, branch, decisionTime, policy)...).Scan(&tid, &from, &priority)
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

// UpdateWindowServices replaces the capability set of a window.
//
// Capabilities are not a cosmetic detail: call-next eligibility is decided by a join
// over window_services, so a capability set that only lives in the browser makes the
// window "live its own life" — the API keeps serving by the stale set and the next
// overview poll reverts the operator's change. The set is therefore replaced
// atomically and the persisted window is returned to the caller.
func (p *Postgres) UpdateWindowServices(ctx context.Context, cmd application.UpdateWindowServicesCommand) (domain.Window, error) {
	var empty domain.Window
	windowID, err := uuid(cmd.WindowID)
	if err != nil {
		return empty, err
	}
	if len(cmd.ServiceIDs) == 0 {
		return empty, application.ErrInvalidState
	}
	serviceIDs := make([]pgtype.UUID, 0, len(cmd.ServiceIDs))
	seen := make(map[[16]byte]struct{}, len(cmd.ServiceIDs))
	for _, raw := range cmd.ServiceIDs {
		id, convErr := uuid(raw)
		if convErr != nil {
			return empty, convErr
		}
		key := [16]byte(id.Bytes)
		if _, dup := seen[key]; dup {
			continue
		}
		seen[key] = struct{}{}
		serviceIDs = append(serviceIDs, id)
	}

	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return empty, dbError(err)
	}
	defer tx.Rollback(context.Background())

	// Lock the window row so two operator screens cannot interleave their updates.
	var branchID string
	if err = tx.QueryRow(ctx, `SELECT branch_id::text FROM windows WHERE id=$1 FOR UPDATE`, windowID).Scan(&branchID); err != nil {
		return empty, dbError(err)
	}
	branch, err := uuid(branchID)
	if err != nil {
		return empty, err
	}

	// A capability may only reference a service enabled for the branch.
	var enabled int
	if err = tx.QueryRow(ctx,
		`SELECT COUNT(*) FROM branch_services WHERE branch_id=$1 AND service_id=ANY($2::uuid[])`,
		branch, serviceIDs).Scan(&enabled); err != nil {
		return empty, dbError(err)
	}
	if enabled != len(serviceIDs) {
		return empty, application.ErrNotFound
	}

	// Only the capabilities that actually disappear are dropped; retained rows are
	// never rewritten. Since 000012 tickets no longer reference window_services, a
	// capability can be dropped even when the window already served the service.
	if _, err = tx.Exec(ctx,
		`DELETE FROM window_services WHERE window_id=$1 AND service_id <> ALL($2::uuid[])`,
		windowID, serviceIDs); err != nil {
		return empty, windowServicesError(err)
	}
	if _, err = tx.Exec(ctx,
		`INSERT INTO window_services(window_id, branch_id, service_id)
		 SELECT $1, $2, sid FROM unnest($3::uuid[]) AS sid
		 ON CONFLICT (window_id, service_id) DO NOTHING`,
		windowID, branch, serviceIDs); err != nil {
		return empty, windowServicesError(err)
	}
	if err = tx.Commit(ctx); err != nil {
		return empty, dbError(err)
	}

	windows, err := p.ListBranchWindows(ctx, branchID)
	if err != nil {
		return empty, err
	}
	for _, w := range windows {
		if w.ID == cmd.WindowID {
			return w, nil
		}
	}
	return empty, application.ErrNotFound
}

// windowServicesError maps capability foreign-key violations to the boundary state
// error. Since 000012 tickets no longer reference window_services, capability
// removal cannot fail on ticket history; the mapping only remains as a defensive
// guard against concurrent reference removals — callers get 409 instead of a
// sanitized 500.
func windowServicesError(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" {
		return application.ErrInvalidState
	}
	return dbError(err)
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
	before, err := scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.id=$1 FOR UPDATE OF t`, id))
	if errors.Is(err, application.ErrNotFound) { return domain.Ticket{}, application.ErrInvalidState }
	if err != nil {
		return domain.Ticket{}, err
	}
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
	if err = insertEvent(ctx, tx, t, domain.TicketEventReturned, &before.Status, nil, nil); err != nil {
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
	before, err := scanTicket(tx.QueryRow(ctx, ticketSelect+`WHERE t.id=$1 FOR UPDATE OF t`, id))
	if errors.Is(err, application.ErrNotFound) { return domain.Ticket{}, application.ErrInvalidState }
	if err != nil {
		return domain.Ticket{}, err
	}

	var ns pgtype.UUID
	if cmd.NewServiceID != "" {
		ns, err = uuid(cmd.NewServiceID)
		if err != nil {
			return domain.Ticket{}, err
		}
	} else {
		ns, err = uuid(before.ServiceID)
		if err != nil {
			return domain.Ticket{}, err
		}
	}

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
	if err = insertEvent(ctx, tx, t, domain.TicketEventRedirected, &before.Status, nil, nil); err != nil {
		return domain.Ticket{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return domain.Ticket{}, dbError(err)
	}
	return t, nil
}
