package sprint1qa

import (
	"context"
	"os"
	"testing"
)

func TestSprint1BlackBoxSuite(t *testing.T) {
	// Top-level suite must run sequentially - do NOT use t.Parallel()
	baseURL := os.Getenv("BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}
	client := NewClient(baseURL)
	ctx := context.Background()

	// 1. Foundation Regression Check (Before Suite)
	t.Run("Foundation_Regression_Before", func(t *testing.T) {
		if err := VerifyFoundation(ctx, client); err != nil {
			t.Fatalf("Foundation check failed before suite: %v", err)
		}
	})

	// 2. Sequential Scenarios
	t.Run("Scenario_A_HappyPath", func(t *testing.T) {
		t.Cleanup(func() {
			_ = PreflightCleanEnvironment(context.Background(), client)
		})
		if err := RunScenarioA(ctx, client, t); err != nil {
			t.Fatalf("Scenario A failed: %v", err)
		}
	})

	t.Run("Scenario_B_Idempotency", func(t *testing.T) {
		t.Cleanup(func() {
			_ = PreflightCleanEnvironment(context.Background(), client)
		})
		if err := RunScenarioB(ctx, client, t); err != nil {
			t.Fatalf("Scenario B failed: %v", err)
		}
	})

	t.Run("Scenario_C_ServiceRouting", func(t *testing.T) {
		t.Cleanup(func() {
			_ = PreflightCleanEnvironment(context.Background(), client)
		})
		if err := RunScenarioC(ctx, client, t); err != nil {
			t.Fatalf("Scenario C failed: %v", err)
		}
	})

	t.Run("Scenario_D_ConcurrentClaim", func(t *testing.T) {
		t.Cleanup(func() {
			_ = PreflightCleanEnvironment(context.Background(), client)
		})
		if err := RunScenarioD(ctx, client, t); err != nil {
			t.Fatalf("Scenario D failed: %v", err)
		}
	})

	// 3. Repeatability Requirement: Run full suite multiple times against same persistent DB
	t.Run("Repeatability_Run2_Without_DB_Reset", func(t *testing.T) {
		if err := RunScenarioA(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 2 Scenario A failed: %v", err)
		}
		if err := RunScenarioB(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 2 Scenario B failed: %v", err)
		}
		if err := RunScenarioC(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 2 Scenario C failed: %v", err)
		}
		if err := RunScenarioD(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 2 Scenario D failed: %v", err)
		}
	})

	t.Run("Repeatability_Run3_Without_DB_Reset", func(t *testing.T) {
		if err := RunScenarioA(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 3 Scenario A failed: %v", err)
		}
		if err := RunScenarioB(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 3 Scenario B failed: %v", err)
		}
		if err := RunScenarioC(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 3 Scenario C failed: %v", err)
		}
		if err := RunScenarioD(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 3 Scenario D failed: %v", err)
		}
	})

	// 4. Foundation Regression Check (After Suite)
	t.Run("Foundation_Regression_After", func(t *testing.T) {
		if err := VerifyFoundation(ctx, client); err != nil {
			t.Fatalf("Foundation check failed after suite: %v", err)
		}
	})
}
