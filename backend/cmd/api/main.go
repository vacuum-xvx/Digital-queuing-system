package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"postcode/backend/internal/config"
	"postcode/backend/internal/database"
	"postcode/backend/internal/httpapi"
	"postcode/backend/internal/observability"
)

func main() { os.Exit(run()) }

func run() int {
	logger := observability.New(slog.LevelInfo)
	cfg, err := config.Load()
	if err != nil {
		logger.Error("Invalid configuration", "error", err.Error())
		return 1
	}
	logger = observability.New(cfg.LogLevel)
	if len(os.Args) > 1 {
		if len(os.Args) != 3 || os.Args[1] != "migrate" || (os.Args[2] != "up" && os.Args[2] != "version") {
			logger.Error("Usage: api [migrate up|version]")
			return 1
		}
		version, dirty, err := database.Migrate(cfg.DatabaseURL, os.Args[2])
		if err != nil {
			logger.Error("Migration error", "error", err.Error())
			return 1
		}
		logger.Info("Migration version", "version", version, "dirty", dirty)
		if dirty {
			return 1
		}
		return 0
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	pool, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("Database setup failed", "error", err.Error())
		return 1
	}
	defer pool.Close()
	server := &http.Server{Addr: ":" + cfg.HTTPPort, Handler: httpapi.NewRouter(pool, nil, logger, cfg.AllowedOrigin), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 60 * time.Second}
	serverErr := make(chan error, 1)
	go func() { serverErr <- server.ListenAndServe() }()
	logger.Info("HTTP server starting", "port", cfg.HTTPPort, "environment", cfg.AppEnv)
	select {
	case err := <-serverErr:
		if !errors.Is(err, http.ErrServerClosed) {
			logger.Error("HTTP server failed", "error", fmt.Sprint(err))
			return 1
		}
	case <-ctx.Done():
		logger.Info("HTTP server shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			logger.Error("Graceful shutdown timed out")
			_ = server.Close()
		}
	}
	return 0
}
