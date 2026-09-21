package config

import (
	"net/url"
	"strings"
	"testing"
)

func TestLoad(t *testing.T) {
	values := map[string]string{"APP_ENV": "development", "LOG_LEVEL": "INFO", "HTTP_PORT": "8080", "POSTGRES_HOST": "postgres", "POSTGRES_PORT": "5432", "POSTGRES_DB": "postcode", "POSTGRES_USER": "postcode", "POSTGRES_PASSWORD": "p@ss:/?#", "CORS_ALLOWED_ORIGIN": "http://localhost:5173"}
	for k, v := range values {
		t.Setenv(k, v)
	}
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(cfg.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	password, _ := u.User.Password()
	if password != values["POSTGRES_PASSWORD"] {
		t.Fatal("password not safely encoded")
	}
	t.Setenv("CORS_ALLOWED_ORIGIN", "https://pointers-team.tech, http://pointers-team.tech, http://144.31.181.192")
	if _, err := Load(); err != nil {
		t.Fatalf("expected multiple CORS origins to load, got: %v", err)
	}
	for _, tc := range []struct{ key, value string }{{"POSTGRES_PASSWORD", ""}, {"HTTP_PORT", "invalid-secret"}, {"LOG_LEVEL", "invalid-secret"}, {"CORS_ALLOWED_ORIGIN", "*"}} {
		t.Run(tc.key, func(t *testing.T) {
			t.Setenv(tc.key, tc.value)
			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), tc.key) || strings.Contains(err.Error(), "invalid-secret") {
				t.Fatalf("expected safe configuration error, got %v", err)
			}
		})
	}
}
