package httpapi

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"time"

	"postcode/backend/internal/domain"
)

var (
	ErrInvalidToken = errors.New("invalid or expired token")
	tokenSecretKey  = []byte(getEnvOrDefault("AUTH_SECRET", "postcode-suo-secret-key-2026-prod-secure"))
)

func getEnvOrDefault(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

type AuthClaims struct {
	UserID     string          `json:"uid"`
	Email      string          `json:"email"`
	Role       domain.UserRole `json:"role"`
	BranchID   *string         `json:"bid,omitempty"`
	IsTerminal bool            `json:"term"`
	ExpiresAt  int64           `json:"exp"`
}

func GenerateToken(claims AuthClaims) (string, error) {
	if claims.ExpiresAt == 0 {
		claims.ExpiresAt = time.Now().Add(7 * 24 * time.Hour).Unix()
	}

	payloadBytes, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}

	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadBytes)

	mac := hmac.New(sha256.New, tokenSecretKey)
	mac.Write([]byte(payloadB64))
	sigB64 := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return payloadB64 + "." + sigB64, nil
}

func ParseToken(tokenStr string) (AuthClaims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 2 {
		return AuthClaims{}, ErrInvalidToken
	}

	payloadB64 := parts[0]
	sigB64 := parts[1]

	mac := hmac.New(sha256.New, tokenSecretKey)
	mac.Write([]byte(payloadB64))
	expectedSig := mac.Sum(nil)

	actualSig, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil || !hmac.Equal(expectedSig, actualSig) {
		return AuthClaims{}, ErrInvalidToken
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return AuthClaims{}, ErrInvalidToken
	}

	var claims AuthClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return AuthClaims{}, ErrInvalidToken
	}

	if claims.ExpiresAt > 0 && time.Now().Unix() > claims.ExpiresAt {
		return AuthClaims{}, ErrInvalidToken
	}

	return claims, nil
}
