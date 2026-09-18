package persistence

import (
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAdminTodayIsMoscowAcrossDatabaseTimezones(t *testing.T) {
	ctx, p, _ := integration(t)
	ticket := create(t, ctx, p, parcels, "moscow-today")
	if _, err := p.CallNext(ctx, window1); err != nil {
		t.Fatal(err)
	}
	if _, err := p.StartService(ctx, ticket.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := p.CompleteService(ctx, ticket.ID); err != nil {
		t.Fatal(err)
	}
	// First minute of Moscow's current date, regardless of database session TZ.
	execSQL(t, ctx, p, `UPDATE tickets SET queue_entered_at=((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date + time '00:01') AT TIME ZONE 'Europe/Moscow' WHERE id=$1::uuid`, ticket.ID)
	for _, zone := range []string{"UTC", "America/New_York", "Asia/Tokyo"} {
		cfg := p.pool.Config()
		cfg.ConnConfig.RuntimeParams["timezone"] = zone
		pool, err := pgxpool.NewWithConfig(ctx, cfg)
		if err != nil {
			t.Fatal(err)
		}
		view, err := New(pool).GetAdminOverview(ctx, demoBranch)
		pool.Close()
		if err != nil || view.Metrics.ServedTodayCount != 1 {
			t.Fatalf("%s: %+v %v", zone, view.Metrics, err)
		}
	}
}
