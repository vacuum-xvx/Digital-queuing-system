package sprint2qa

import (
	"context"
	"os"
	"testing"
)

func TestSprint2BlackBoxSuite(t *testing.T) {
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
	t.Run("Scenario_E_AppointmentAndCancel", func(t *testing.T) {
		t.Cleanup(func() {
			_ = PreflightCleanEnvironment(context.Background(), client)
		})
		if err := RunScenarioE(ctx, client, t); err != nil {
			t.Fatalf("Scenario E failed: %v", err)
		}
	})

	t.Run("Scenario_F_LiveQueue", func(t *testing.T) {
		t.Cleanup(func() {
			_ = PreflightCleanEnvironment(context.Background(), client)
		})
		if err := RunScenarioF(ctx, client, t); err != nil {
			t.Fatalf("Scenario F failed: %v", err)
		}
	})

	t.Run("Scenario_G_ReturnAndRedirect", func(t *testing.T) {
		t.Cleanup(func() {
			_ = PreflightCleanEnvironment(context.Background(), client)
		})
		if err := RunScenarioG(ctx, client, t); err != nil {
			t.Fatalf("Scenario G failed: %v", err)
		}
	})

	t.Run("Scenario_H_PriorityScheduling", func(t *testing.T) {
		t.Cleanup(func() {
			_ = PreflightCleanEnvironment(context.Background(), client)
		})
		if err := RunScenarioH(ctx, client, t); err != nil {
			t.Fatalf("Scenario H failed: %v", err)
		}
	})

	// 3. Repeatability Runs without DB reset
	t.Run("Repeatability_Run2_Without_DB_Reset", func(t *testing.T) {
		if err := RunScenarioE(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 2 Scenario E failed: %v", err)
		}
		if err := RunScenarioF(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 2 Scenario F failed: %v", err)
		}
		if err := RunScenarioG(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 2 Scenario G failed: %v", err)
		}
		if err := RunScenarioH(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 2 Scenario H failed: %v", err)
		}
	})

	t.Run("Repeatability_Run3_Without_DB_Reset", func(t *testing.T) {
		if err := RunScenarioE(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 3 Scenario E failed: %v", err)
		}
		if err := RunScenarioF(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 3 Scenario F failed: %v", err)
		}
		if err := RunScenarioG(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 3 Scenario G failed: %v", err)
		}
		if err := RunScenarioH(ctx, client, t); err != nil {
			t.Fatalf("Repeat Run 3 Scenario H failed: %v", err)
		}
	})

	// 4. Foundation Regression Check (After Suite)
	t.Run("Foundation_Regression_After", func(t *testing.T) {
		if err := VerifyFoundation(ctx, client); err != nil {
			t.Fatalf("Foundation check failed after suite: %v", err)
		}
	})
}
