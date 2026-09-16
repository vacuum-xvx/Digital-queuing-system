package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"time"

	sprint1qa "qa/sprint1"
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

	client := sprint1qa.NewClient(baseURL)
	logger := cliLogger{}
	ctx := context.Background()

	logger.Logf("=================================================================")
	logger.Logf("  SPRINT #1 BLACK-BOX VERIFICATION SUITE (DEVOPS / QA)")
	logger.Logf("  Target Base URL: %s", client.BaseURL)
	logger.Logf("  Repeat iterations: %d (against same PostgreSQL volume)", *repeatCount)
	logger.Logf("=================================================================")

	// 1. Initial Foundation Regression Check
	logger.Logf("[STEP 1] Foundation Regression Check (Before Suite)...")
	if err := sprint1qa.VerifyFoundation(ctx, client); err != nil {
		logger.Logf("❌ Foundation check FAILED: %v", err)
		os.Exit(1)
	}
	logger.Logf("✅ Foundation check PASSED (/health=200, /ready=200)")

	// 2. Iterations
	for iter := 1; iter <= *repeatCount; iter++ {
		logger.Logf("-----------------------------------------------------------------")
		logger.Logf(">>> STARTING ITERATION %d / %d (NO DB RESET)", iter, *repeatCount)
		logger.Logf("-----------------------------------------------------------------")

		// Scenario A: Happy Path
		logger.Logf("[Iter %d] Running Scenario A — Happy Path...", iter)
		if err := sprint1qa.RunScenarioA(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario A FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario A PASSED")

		// Scenario B: Idempotency
		logger.Logf("[Iter %d] Running Scenario B — Idempotency...", iter)
		if err := sprint1qa.RunScenarioB(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario B FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario B PASSED")

		// Scenario C: Service Routing
		logger.Logf("[Iter %d] Running Scenario C — Service Routing...", iter)
		if err := sprint1qa.RunScenarioC(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario C FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario C PASSED")

		// Scenario D: Concurrent Claim
		logger.Logf("[Iter %d] Running Scenario D — Concurrent Claim...", iter)
		if err := sprint1qa.RunScenarioD(ctx, client, logger); err != nil {
			logger.Logf("❌ Scenario D FAILED: %v", err)
			os.Exit(1)
		}
		logger.Logf("✅ Scenario D PASSED")
	}

	// 3. Final Foundation Regression Check
	logger.Logf("-----------------------------------------------------------------")
	logger.Logf("[STEP 3] Foundation Regression Check (After Suite)...")
	if err := sprint1qa.VerifyFoundation(ctx, client); err != nil {
		logger.Logf("❌ Final Foundation check FAILED: %v", err)
		os.Exit(1)
	}
	logger.Logf("✅ Final Foundation check PASSED (/health=200, /ready=200)")

	logger.Logf("=================================================================")
	logger.Logf("  ALL VERIFICATION SCENARIOS PASSED SUCCESSFULLY (%d/%d RUNS)", *repeatCount, *repeatCount)
	logger.Logf("=================================================================")
}
