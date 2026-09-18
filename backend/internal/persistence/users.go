package persistence

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/jackc/pgx/v5"
	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

func hashConfirmationCode(code string) string {
	sum := sha256.Sum256([]byte(code))
	return fmt.Sprintf("%x", sum)
}

func generateOTP() string {
	n, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "123456"
	}
	return fmt.Sprintf("%06d", n.Int64()+100000)
}

func (p *Postgres) RequestConfirmationCode(ctx context.Context, email string) (string, error) {
	normEmail := strings.ToLower(strings.TrimSpace(email))
	if !strings.Contains(normEmail, "@") || len(normEmail) < 5 {
		return "", fmt.Errorf("invalid email: %w", application.ErrInvalidState)
	}

	code := generateOTP()
	hash := hashConfirmationCode(code)

	query := `
		INSERT INTO users (email, role, confirmation_code_hash, code_expires_at)
		VALUES ($1, 'client', $2, clock_timestamp() + interval '15 minutes')
		ON CONFLICT (email) DO UPDATE
		SET confirmation_code_hash = EXCLUDED.confirmation_code_hash,
		    code_expires_at = EXCLUDED.code_expires_at
	`
	_, err := p.pool.Exec(ctx, query, normEmail, hash)
	if err != nil {
		return "", dbError(err)
	}

	return code, nil
}

func (p *Postgres) VerifyConfirmationCode(ctx context.Context, email, code string) (domain.User, error) {
	normEmail := strings.ToLower(strings.TrimSpace(email))
	cleanCode := strings.TrimSpace(code)
	if normEmail == "" || cleanCode == "" {
		return domain.User{}, application.ErrInvalidCode
	}

	hash := hashConfirmationCode(cleanCode)

	tx, err := p.pool.Begin(ctx)
	if err != nil {
		return domain.User{}, dbError(err)
	}
	defer tx.Rollback(context.Background())

	var u domain.User
	var roleStr string
	var branchID, devToken *string

	query := `
		SELECT id::text, email, role, branch_id::text, is_terminal, device_token, created_at
		FROM users
		WHERE email = $1
		  AND confirmation_code_hash = $2
		  AND code_expires_at > clock_timestamp()
		FOR UPDATE
	`
	err = tx.QueryRow(ctx, query, normEmail, hash).Scan(
		&u.ID, &u.Email, &roleStr, &branchID, &u.IsTerminal, &devToken, &u.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, application.ErrInvalidCode
	}
	if err != nil {
		return domain.User{}, dbError(err)
	}

	// Single-use: clear confirmation code
	_, err = tx.Exec(ctx, `UPDATE users SET confirmation_code_hash = NULL, code_expires_at = NULL WHERE id = $1::uuid`, u.ID)
	if err != nil {
		return domain.User{}, dbError(err)
	}

	if err = tx.Commit(ctx); err != nil {
		return domain.User{}, dbError(err)
	}

	u.Role = domain.UserRole(roleStr)
	u.BranchID = branchID
	u.DeviceToken = devToken
	u.CreatedAt = u.CreatedAt.UTC()

	return u, nil
}

func (p *Postgres) LoginTerminal(ctx context.Context, deviceToken string) (domain.User, error) {
	token := strings.TrimSpace(deviceToken)
	if token == "" {
		return domain.User{}, application.ErrUnauthorized
	}

	var u domain.User
	var roleStr string
	var branchID, devToken *string

	query := `
		SELECT id::text, email, role, branch_id::text, is_terminal, device_token, created_at
		FROM users
		WHERE is_terminal = TRUE AND device_token = $1
	`
	err := p.pool.QueryRow(ctx, query, token).Scan(
		&u.ID, &u.Email, &roleStr, &branchID, &u.IsTerminal, &devToken, &u.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, application.ErrUnauthorized
	}
	if err != nil {
		return domain.User{}, dbError(err)
	}

	u.Role = domain.UserRole(roleStr)
	u.BranchID = branchID
	u.DeviceToken = devToken
	u.CreatedAt = u.CreatedAt.UTC()

	return u, nil
}

func (p *Postgres) GetUserByID(ctx context.Context, userID string) (domain.User, error) {
	uid, err := uuid(userID)
	if err != nil {
		return domain.User{}, err
	}

	var u domain.User
	var roleStr string
	var branchID, devToken *string

	query := `
		SELECT id::text, email, role, branch_id::text, is_terminal, device_token, created_at
		FROM users
		WHERE id = $1
	`
	err = p.pool.QueryRow(ctx, query, uid).Scan(
		&u.ID, &u.Email, &roleStr, &branchID, &u.IsTerminal, &devToken, &u.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, application.ErrNotFound
	}
	if err != nil {
		return domain.User{}, dbError(err)
	}

	u.Role = domain.UserRole(roleStr)
	u.BranchID = branchID
	u.DeviceToken = devToken
	u.CreatedAt = u.CreatedAt.UTC()

	return u, nil
}

func (p *Postgres) ListUsers(ctx context.Context, branchID string) ([]domain.User, error) {
	var rows pgx.Rows
	var err error

	if branchID != "" {
		bid, parseErr := uuid(branchID)
		if parseErr != nil {
			return nil, parseErr
		}
		query := `
			SELECT id::text, email, role, branch_id::text, is_terminal, device_token, created_at
			FROM users
			WHERE branch_id = $1 OR branch_id IS NULL
			ORDER BY role, email
		`
		rows, err = p.pool.Query(ctx, query, bid)
	} else {
		query := `
			SELECT id::text, email, role, branch_id::text, is_terminal, device_token, created_at
			FROM users
			ORDER BY role, email
		`
		rows, err = p.pool.Query(ctx, query)
	}

	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()

	out := []domain.User{}
	for rows.Next() {
		var u domain.User
		var roleStr string
		var bid, devToken *string

		if err := rows.Scan(&u.ID, &u.Email, &roleStr, &bid, &u.IsTerminal, &devToken, &u.CreatedAt); err != nil {
			return nil, dbError(err)
		}
		u.Role = domain.UserRole(roleStr)
		u.BranchID = bid
		u.DeviceToken = devToken
		u.CreatedAt = u.CreatedAt.UTC()
		out = append(out, u)
	}

	return out, dbError(rows.Err())
}

func (p *Postgres) UpdateUserRole(ctx context.Context, userID string, role domain.UserRole) (domain.User, error) {
	uid, err := uuid(userID)
	if err != nil {
		return domain.User{}, err
	}

	switch role {
	case domain.RoleClient, domain.RoleEmployee, domain.RoleChief, domain.RoleTerminal:
	default:
		return domain.User{}, fmt.Errorf("invalid role: %w", application.ErrInvalidState)
	}

	var u domain.User
	var roleStr string
	var branchID, devToken *string

	query := `
		UPDATE users
		SET role = $1
		WHERE id = $2
		RETURNING id::text, email, role, branch_id::text, is_terminal, device_token, created_at
	`
	err = p.pool.QueryRow(ctx, query, string(role), uid).Scan(
		&u.ID, &u.Email, &roleStr, &branchID, &u.IsTerminal, &devToken, &u.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.User{}, application.ErrNotFound
	}
	if err != nil {
		return domain.User{}, dbError(err)
	}

	u.Role = domain.UserRole(roleStr)
	u.BranchID = branchID
	u.DeviceToken = devToken
	u.CreatedAt = u.CreatedAt.UTC()

	return u, nil
}
