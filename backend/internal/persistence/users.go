package persistence

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

const sessionTTL = 7 * 24 * time.Hour

// ─────────────────────────────────────────────────────────────────────────────
// Register
// ─────────────────────────────────────────────────────────────────────────────

func (p *Postgres) Register(ctx context.Context, email, password string) (domain.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return domain.User{}, fmt.Errorf("hashing password: %w", err)
	}

	// Для MVP подтверждение автоматическое (confirmed=true, token=null).
	// Код можно найти в логах при confirmed=false (см. ConfirmEmail).
	var u domain.User
	err = p.pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, confirmed)
		VALUES ($1, $2, true)
		RETURNING id::text, email, password_hash, role, is_terminal, confirmed, confirm_token, created_at
	`, email, string(hash)).Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.Role,
		&u.IsTerminal, &u.Confirmed, &u.ConfirmToken, &u.CreatedAt,
	)
	if err != nil {
		// Уникальный email — вернуть понятную ошибку
		return domain.User{}, dbError(err)
	}
	return u, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// ConfirmEmail (заглушка MVP — токен не используется)
// ─────────────────────────────────────────────────────────────────────────────

func (p *Postgres) ConfirmEmail(ctx context.Context, token string) error {
	tag, err := p.pool.Exec(ctx, `
		UPDATE users SET confirmed = true, confirm_token = NULL
		WHERE confirm_token = $1 AND confirmed = false
	`, token)
	if err != nil {
		return dbError(err)
	}
	if tag.RowsAffected() == 0 {
		return application.ErrNotFound
	}
	return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────

func (p *Postgres) Login(ctx context.Context, email, password string) (domain.Session, error) {
	var u domain.User
	err := p.pool.QueryRow(ctx, `
		SELECT id::text, email, password_hash, role, is_terminal, confirmed
		FROM users WHERE email = $1
	`, email).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.IsTerminal, &u.Confirmed)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Session{}, application.ErrNotFound
	}
	if err != nil {
		return domain.Session{}, dbError(err)
	}
	if !u.Confirmed {
		return domain.Session{}, fmt.Errorf("email not confirmed: %w", application.ErrInvalidState)
	}
	if err = bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)); err != nil {
		return domain.Session{}, application.ErrNotFound // не раскрываем причину
	}

	token, err := randomToken()
	if err != nil {
		return domain.Session{}, err
	}
	expiresAt := time.Now().Add(sessionTTL)
	_, err = p.pool.Exec(ctx, `
		INSERT INTO sessions (token, user_id, expires_at)
		VALUES ($1, $2::uuid, $3)
	`, token, u.ID, expiresAt)
	if err != nil {
		return domain.Session{}, dbError(err)
	}
	return domain.Session{Token: token, UserID: u.ID, ExpiresAt: expiresAt}, nil
}

// ─────────────────────────────────────────────────────────────────────────────
// Logout
// ─────────────────────────────────────────────────────────────────────────────

func (p *Postgres) Logout(ctx context.Context, token string) error {
	_, err := p.pool.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	return dbError(err)
}

// ─────────────────────────────────────────────────────────────────────────────
// GetSessionUser
// ─────────────────────────────────────────────────────────────────────────────

func (p *Postgres) GetSessionUser(ctx context.Context, token string) (domain.User, error) {
	var u domain.User
	err := p.pool.QueryRow(ctx, `
		SELECT u.id::text, u.email, u.password_hash, u.role, u.is_terminal, u.confirmed
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token = $1 AND s.expires_at > clock_timestamp()
	`, token).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.IsTerminal, &u.Confirmed)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, application.ErrNotFound
	}
	return u, dbError(err)
}

// ─────────────────────────────────────────────────────────────────────────────
// ListUsers (только для opc_chief)
// ─────────────────────────────────────────────────────────────────────────────

func (p *Postgres) ListUsers(ctx context.Context) ([]domain.User, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT id::text, email, role, is_terminal, confirmed, created_at
		FROM users ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	var users []domain.User
	for rows.Next() {
		var u domain.User
		if err = rows.Scan(&u.ID, &u.Email, &u.Role, &u.IsTerminal, &u.Confirmed, &u.CreatedAt); err != nil {
			return nil, dbError(err)
		}
		users = append(users, u)
	}
	return users, dbError(rows.Err())
}

// ─────────────────────────────────────────────────────────────────────────────
// ChangeUserRole (только для opc_chief)
// ─────────────────────────────────────────────────────────────────────────────

func (p *Postgres) ChangeUserRole(ctx context.Context, userID string, role domain.UserRole) (domain.User, error) {
	var u domain.User
	err := p.pool.QueryRow(ctx, `
		UPDATE users SET role = $1 WHERE id = $2::uuid
		RETURNING id::text, email, role, is_terminal, confirmed, created_at
	`, string(role), userID).Scan(&u.ID, &u.Email, &u.Role, &u.IsTerminal, &u.Confirmed, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, application.ErrNotFound
	}
	return u, dbError(err)
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generating token: %w", err)
	}
	return hex.EncodeToString(b), nil
}
