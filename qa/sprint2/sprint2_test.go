package sprint2qa

import (
	"context"
	"os"
	"testing"
)

func runAllScenarios(t *testing.T, ctx context.Context, client *Client) {
	t.Run("Scenario_A_AppointmentCreateAndIdempotency", func(t *testing.T) {
		if err := RunScenarioA(ctx, client, t); err != nil {
			t.Fatalf("Scenario A failed: %v", err)
		}
	})

	t.Run("Scenario_B_FutureAppointmentNotEligible", func(t *testing.T) {
		if err := RunScenarioB(ctx, client, t); err != nil {
			t.Fatalf("Scenario B failed: %v", err)
		}
	})

	t.Run("Scenario_C_DueAppointmentPriority", func(t *testing.T) {
		if err := RunScenarioC(ctx, client, t); err != nil {
			t.Fatalf("Scenario C failed: %v", err)
		}
	})

	t.Run("Scenario_D_ServiceRouting", func(t *testing.T) {
		if err := RunScenarioD(ctx, client, t); err != nil {
			t.Fatalf("Scenario D failed: %v", err)
		}
	})

	t.Run("Scenario_E_Cancel", func(t *testing.T) {
		if err := RunScenarioE(ctx, client, t); err != nil {
			t.Fatalf("Scenario E failed: %v", err)
		}
	})

	t.Run("Scenario_F_CancelVsCallConcurrency", func(t *testing.T) {
		if err := RunScenarioF(ctx, client, t); err != nil {
			t.Fatalf("Scenario F failed: %v", err)
		}
	})

	t.Run("Scenario_G_AppointmentDoubleClaim", func(t *testing.T) {
		if err := RunScenarioG(ctx, client, t); err != nil {
			t.Fatalf("Scenario G failed: %v", err)
		}
	})

	t.Run("Scenario_H_PolicyVersioning", func(t *testing.T) {
		if err := RunScenarioH(ctx, client, t); err != nil {
			t.Fatalf("Scenario H failed: %v", err)
		}
	})

	t.Run("Scenario_I_EventLog", func(t *testing.T) {
		if err := RunScenarioI(ctx, client, t); err != nil {
			t.Fatalf("Scenario I failed: %v", err)
		}
	})
}

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

	// 2. Main Verification Run (Run 1)
	t.Run("Run1", func(t *testing.T) {
		runAllScenarios(t, ctx, client)
	})

	// 3. Repeatability Run 2 without DB reset
	t.Run("Repeatability_Run2_Without_DB_Reset", func(t *testing.T) {
		runAllScenarios(t, ctx, client)
	})

	// 4. Repeatability Run 3 without DB reset
	t.Run("Repeatability_Run3_Without_DB_Reset", func(t *testing.T) {
		runAllScenarios(t, ctx, client)
	})

	// 5. Foundation Regression Check (After Suite)
	t.Run("Foundation_Regression_After", func(t *testing.T) {
		if err := VerifyFoundation(ctx, client); err != nil {
			t.Fatalf("Foundation check failed after suite: %v", err)
		}
	})
}
