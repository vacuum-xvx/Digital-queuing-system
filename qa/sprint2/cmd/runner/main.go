package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	sprint2qa "sprint2qa"
)

type cliLogger struct{}

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

	client := sprint2qa.NewClient(baseURL)
	logger := cliLogger{}
	ctx := context.Background()

	logger.Logf("=================================================================")
	logger.Logf("  SPRINT #2 BLACK-BOX VERIFICATION SUITE (DEVOPS / QA)")
	logger.Logf("  Target Base URL: %s", client.BaseURL)
	logger.Logf("  Repeat iterations: %d (against same PostgreSQL volume)", *repeatCount)
	logger.Logf("=================================================================")

	// 1. Initial Foundation Regression Check
	logger.Logf("[STEP 1] Foundation Regression Check (Before Suite)...")
	if err := sprint2qa.VerifyFoundation(ctx, client); err != nil {
		logger.Logf("❌ Foundation check FAILED: %v", err)
		os.Exit(1)
	}
	logger.Logf("✅ Foundation check PASSED (/health=200, /ready=200)")

	// 2. Iterations
	for iter := 1; iter <= *repeatCount; iter++ {
		logger.Logf("-----------------------------------------------------------------")
		logger.Logf(">>> STARTING ITERATION %d / %d (NO DB RESET)", iter, *repeatCount)
		logger.Logf("-----------------------------------------------------------------")

		// Scenario A: Appointment Create + Idempotency
		logger.Logf("[Iter %d] Running Scenario A — Appointment Create + Idempotency...", iter)
		if err := sprint2qa.RunScenarioA(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario A FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario A PASSED")

		// Scenario B: Future Appointment Not Eligible
		logger.Logf("[Iter %d] Running Scenario B — Future Appointment Not Eligible...", iter)
		if err := sprint2qa.RunScenarioB(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario B FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario B PASSED")

		// Scenario C: Due Appointment Priority
		logger.Logf("[Iter %d] Running Scenario C — Due Appointment Priority...", iter)
		if err := sprint2qa.RunScenarioC(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario C FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario C PASSED")

		// Scenario D: Service Routing
		logger.Logf("[Iter %d] Running Scenario D — Service Routing...", iter)
		if err := sprint2qa.RunScenarioD(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario D FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario D PASSED")

		// Scenario E: Cancel
		logger.Logf("[Iter %d] Running Scenario E — Cancel...", iter)
		if err := sprint2qa.RunScenarioE(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario E FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario E PASSED")

		// Scenario F: Cancel vs Call Concurrency
		logger.Logf("[Iter %d] Running Scenario F — Cancel vs Call Concurrency...", iter)
		if err := sprint2qa.RunScenarioF(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario F FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario F PASSED")

		// Scenario G: Appointment Double Claim
		logger.Logf("[Iter %d] Running Scenario G — Appointment Double Claim...", iter)
		if err := sprint2qa.RunScenarioG(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario G FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario G PASSED")

		// Scenario H: Policy Versioning
		logger.Logf("[Iter %d] Running Scenario H — Policy Versioning...", iter)
		if err := sprint2qa.RunScenarioH(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario H FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario H PASSED")

		// Scenario I: Event Log
		logger.Logf("[Iter %d] Running Scenario I — Event Log...", iter)
		if err := sprint2qa.RunScenarioI(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario I FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario I PASSED")
	}

	// 3. Final Foundation Regression Check
	logger.Logf("-----------------------------------------------------------------")
	logger.Logf("[STEP 3] Foundation Regression Check (After Suite)...")
	if err := sprint2qa.VerifyFoundation(ctx, client); err != nil {
		logger.Logf("❌ Final Foundation check FAILED: %v", err)
		os.Exit(1)
	}
	logger.Logf("✅ Final Foundation check PASSED (/health=200, /ready=200)")

	logger.Logf("=================================================================")
	logger.Logf("  ALL SPRINT #2 SCENARIOS PASSED SUCCESSFULLY (%d/%d RUNS)", *repeatCount, *repeatCount)
	logger.Logf("=================================================================")
}
