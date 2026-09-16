package database

import (
	"context"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jackc/pgx/v5/pgxpool"
)

func Open(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("cannot configure PostgreSQL pool")
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
			return 0, false, fmt.Errorf("migration failed; inspect schema version and migration SQL")
		}
	}
	version, dirty, err := m.Version()
	if err != nil {
		return 0, false, fmt.Errorf("cannot read migration version; schema may be uninitialized")
	}
	return version, dirty, nil
}
