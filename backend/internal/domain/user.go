package domain

import "time"

// UserRole определяет уровень доступа пользователя в системе.
type UserRole string

const (
	RoleClient    UserRole = "client"
	RoleEmployee  UserRole = "employee"
	RoleOPCChief  UserRole = "opc_chief"  // Начальник ОПС
	RoleTerminal  UserRole = "terminal"
)

// User — аккаунт в системе электронной очереди.
type User struct {
	ID           string
	Email        string
	PasswordHash string
	Role         UserRole
	IsTerminal   bool
	Confirmed    bool
	ConfirmToken *string
	CreatedAt    time.Time
}

// Session — аутентификационная сессия (cookie-based).
type Session struct {
	Token     string
	UserID    string
	ExpiresAt time.Time
	CreatedAt time.Time
}
