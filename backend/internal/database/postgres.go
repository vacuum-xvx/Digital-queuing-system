package database

import (
	"context"
	"fmt"
	"time"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Open(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	poolConfig, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("cannot configure PostgreSQL pool: %w", err)
	}

	// Explicit pool constraints: prevent connection exhaustion under high concurrency / k6 stress tests.
	poolConfig.MaxConns = 30
	poolConfig.MinConns = 5
	poolConfig.MaxConnIdleTime = 5 * time.Minute
	poolConfig.MaxConnLifetime = 30 * time.Minute
	poolConfig.HealthCheckPeriod = 1 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, poolConfig)
	if err != nil {
		return nil, fmt.Errorf("cannot configure PostgreSQL pool")
	}
	if err = pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("cannot reach PostgreSQL: database unavailable")
	}
	// Connections are established on demand: liveness remains available during DB outages.
	return pool, nil
}

func Migrate(dsn, action string) (uint, bool, error) {
	m, err := migrate.New("file://migrations", dsn)
	if err != nil {
		return 0, false, fmt.Errorf("cannot initialize migrations; check PostgreSQL connectivity and migration files")
	}
	defer m.Close()
	if action == "up" {
		if err := m.Up(); err != nil && err != migrate.ErrNoChange {
			return 0, false, fmt.Errorf("migration failed: %w", err)
		}
	}
	version, dirty, err := m.Version()
	if err != nil {
		return 0, false, fmt.Errorf("cannot read migration version; schema may be uninitialized")
	}
	return version, dirty, nil
}
