package sprint3qa

import (
	"context"
	"os"
	"testing"
)

func runAllScenarios(t *testing.T, ctx context.Context, client *Client) {
	t.Run("Scenario_1_LiveCreation", func(t *testing.T) {
		if err := RunScenario1_LiveCreation(ctx, client, t); err != nil {
			t.Fatalf("Scenario 1 failed: %v", err)
		}
	})

	t.Run("Scenario_2_LiveRouting", func(t *testing.T) {
		if err := RunScenario2_LiveRouting(ctx, client, t); err != nil {
			t.Fatalf("Scenario 2 failed: %v", err)
		}
	})

	t.Run("Scenario_3_MixedSourceOrdering", func(t *testing.T) {
		if err := RunScenario3_MixedSourceOrdering(ctx, client, t); err != nil {
			t.Fatalf("Scenario 3 failed: %v", err)
		}
	})

	t.Run("Scenario_4_AntiStarvation", func(t *testing.T) {
		if err := RunScenario4_AntiStarvation(ctx, client, t); err != nil {
			t.Fatalf("Scenario 4 failed: %v", err)
		}
	})

	t.Run("Scenario_5_AppointmentGrace", func(t *testing.T) {
		if err := RunScenario5_AppointmentGrace(ctx, client, t); err != nil {
			t.Fatalf("Scenario 5 failed: %v", err)
		}
	})

	t.Run("Scenario_6_AppointmentLateness", func(t *testing.T) {
		if err := RunScenario6_AppointmentLateness(ctx, client, t); err != nil {
			t.Fatalf("Scenario 6 failed: %v", err)
		}
	})

	t.Run("Scenario_7_BranchDelaySemantics", func(t *testing.T) {
		if err := RunScenario7_BranchDelaySemantics(ctx, client, t); err != nil {
			t.Fatalf("Scenario 7 failed: %v", err)
		}
	})

	t.Run("Scenario_8_LegacyAppointment", func(t *testing.T) {
		if err := RunScenario8_LegacyAppointment(ctx, client, t); err != nil {
			t.Fatalf("Scenario 8 failed: %v", err)
		}
	})

	t.Run("Scenario_9_NoShow", func(t *testing.T) {
		if err := RunScenario9_NoShow(ctx, client, t); err != nil {
			t.Fatalf("Scenario 9 failed: %v", err)
		}
	})

	t.Run("Scenario_10_NoShowVsStart", func(t *testing.T) {
		if err := RunScenario10_NoShowVsStart(ctx, client, t); err != nil {
			t.Fatalf("Scenario 10 failed: %v", err)
		}
	})

	t.Run("Scenario_11_QueuePosition", func(t *testing.T) {
		if err := RunScenario11_QueuePosition(ctx, client, t); err != nil {
			t.Fatalf("Scenario 11 failed: %v", err)
		}
	})

	t.Run("Scenario_12_PositionConsistency", func(t *testing.T) {
		if err := RunScenario12_PositionConsistency(ctx, client, t); err != nil {
			t.Fatalf("Scenario 12 failed: %v", err)
		}
	})

	t.Run("Scenario_13_MultiWindow", func(t *testing.T) {
		if err := RunScenario13_MultiWindow(ctx, client, t); err != nil {
			t.Fatalf("Scenario 13 failed: %v", err)
		}
	})

	t.Run("Scenario_14_EventAudit", func(t *testing.T) {
		if err := RunScenario14_EventAudit(ctx, client, t); err != nil {
			t.Fatalf("Scenario 14 failed: %v", err)
		}
	})

	t.Run("Scenario_15_PolicyCompatibility", func(t *testing.T) {
		if err := RunScenario15_PolicyCompatibility(ctx, client, t); err != nil {
			t.Fatalf("Scenario 15 failed: %v", err)
		}
	})
}

func TestSprint3BlackBoxSuite(t *testing.T) {
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
