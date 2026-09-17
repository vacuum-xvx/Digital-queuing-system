package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	sprint3qa "sprint3qa"
)

type cliLogger struct{}

func (l cliLogger) Log(args ...any) {
	timestamp := time.Now().Format("15:04:05.000")
	fmt.Printf("[%s] %s\n", timestamp, fmt.Sprint(args...))
}

func (l cliLogger) Logf(format string, args ...any) {
	timestamp := time.Now().Format("15:04:05.000")
	fmt.Printf("[%s] %s\n", timestamp, fmt.Sprintf(format, args...))
}

func main() {
	baseURLFlag := flag.String("base-url", "", "Base URL of the service (default from BASE_URL or http://localhost:8080)")
	repeatCount := flag.Int("repeat", 3, "Number of full sequential repetitions to execute without DB reset")
	flag.Parse()

	baseURL := *baseURLFlag
	if baseURL == "" {
		baseURL = os.Getenv("BASE_URL")
	}
	if baseURL == "" {
		baseURL = "http://localhost:8080"
	}

	client := sprint3qa.NewClient(baseURL)
	logger := cliLogger{}
	ctx := context.Background()

	logger.Logf("=================================================================")
	logger.Logf("  SPRINT #3 BLACK-BOX VERIFICATION SUITE (DEVOPS / QA)")
	logger.Logf("  Target Base URL: %s", client.BaseURL())
	logger.Logf("  Repeat iterations: %d (against same PostgreSQL instance)", *repeatCount)
	logger.Logf("=================================================================")

	// 1. Initial Foundation Regression Check
	logger.Logf("[STEP 1] Foundation Regression Check (Before Suite)...")
	if err := sprint3qa.VerifyFoundation(ctx, client); err != nil {
		logger.Logf("❌ Foundation check FAILED: %v", err)
		os.Exit(1)
	}
	logger.Logf("✅ Foundation check PASSED (/health=200, /ready=200)")

	// 2. Main Iterations
	scenarios := []struct {
		name string
		fn   func(context.Context, *sprint3qa.Client, sprint3qa.Logger) error
	}{
		{"Scenario 1 — LIVE Creation & Idempotency", sprint3qa.RunScenario1_LiveCreation},
		{"Scenario 2 — LIVE Service Routing", sprint3qa.RunScenario2_LiveRouting},
		{"Scenario 3 — Mixed-Source Ordering", sprint3qa.RunScenario3_MixedSourceOrdering},
		{"Scenario 4 — Anti-Starvation", sprint3qa.RunScenario4_AntiStarvation},
		{"Scenario 5 — Appointment Grace Period", sprint3qa.RunScenario5_AppointmentGrace},
		{"Scenario 6 — Appointment Lateness", sprint3qa.RunScenario6_AppointmentLateness},
		{"Scenario 7 — Branch-Delay Semantics", sprint3qa.RunScenario7_BranchDelaySemantics},
		{"Scenario 8 — Legacy Appointment (No Arrival)", sprint3qa.RunScenario8_LegacyAppointment},
		{"Scenario 9 — NO_SHOW Transition & Idempotency", sprint3qa.RunScenario9_NoShow},
		{"Scenario 10 — NO_SHOW vs Start Concurrency", sprint3qa.RunScenario10_NoShowVsStart},
		{"Scenario 11 — QueuePosition (All Reasons)", sprint3qa.RunScenario11_QueuePosition},
		{"Scenario 12 — Position Consistency with CallNext", sprint3qa.RunScenario12_PositionConsistency},
		{"Scenario 13 — Multi-Window Reference Selection", sprint3qa.RunScenario13_MultiWindow},
		{"Scenario 14 — Event Audit Chain", sprint3qa.RunScenario14_EventAudit},
		{"Scenario 15 — Policy Compatibility & Versioning", sprint3qa.RunScenario15_PolicyCompatibility},
	}

	for iter := 1; iter <= *repeatCount; iter++ {
		logger.Logf("-----------------------------------------------------------------")
		logger.Logf(">>> STARTING ITERATION %d / %d (NO DB RESET)", iter, *repeatCount)
		logger.Logf("-----------------------------------------------------------------")

		for _, sc := range scenarios {
			logger.Logf("[Iter %d] Running %s...", iter, sc.name)
			if err := sc.fn(ctx, client, logger); err != nil {
				logger.Logf("❌ %s FAILED: %v", sc.name, err)
				os.Exit(1)
			}
			logger.Logf("✅ %s PASSED", sc.name)
		}
	}

	// 3. Foundation Regression Check (After Suite)
	logger.Logf("-----------------------------------------------------------------")
	logger.Logf("[STEP 3] Foundation Regression Check (After Suite)...")
	if err := sprint3qa.VerifyFoundation(ctx, client); err != nil {
		logger.Logf("❌ Post-suite foundation check FAILED: %v", err)
		os.Exit(1)
	}
	logger.Logf("✅ Post-suite foundation check PASSED")

	// 4. Queue Drain & Clean State
	logger.Logf("[STEP 4] Draining active windows to ensure 0 leaked tickets...")
	if err := sprint3qa.DrainAllDemoWindows(ctx, client); err != nil {
		logger.Logf("⚠️ Warning during final drain: %v", err)
	}
	_ = sprint3qa.RestoreDefaultPolicy(ctx, client)

	logger.Logf("=================================================================")
	logger.Logf("🎉 ALL SPRINT #3 QA SCENARIOS PASSED WITH %d REPETITIONS!", *repeatCount)
	logger.Logf("=================================================================")
}
