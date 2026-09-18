package persistence

import (
	"crypto/rand"
	"testing"

	"postcode/backend/internal/application"
	"postcode/backend/internal/domain"
)

func TestExistingAuthPersistenceRevocationAndExpiry(t *testing.T) {
	ctx,p,_:=integration(t)
	password:=rand.Text()
	user,err:=p.Register(ctx,"auth-test@example.invalid",password)
	if err!=nil{t.Fatal(err)}
	if _,err=p.ChangeUserRole(ctx,user.ID,domain.RoleEmployee);err!=nil{t.Fatal(err)}
	_,err=p.Login(ctx,user.Email,rand.Text())
	wantError(t,err,application.ErrNotFound)
	session,err:=p.Login(ctx,user.Email,password)
	if err!=nil{t.Fatal(err)}
	restored,err:=New(p.pool).GetSessionUser(ctx,session.Token)
	if err!=nil || restored.ID!=user.ID || restored.Role!=domain.RoleEmployee {t.Fatal("session restore failed",err)}
	if err=p.Logout(ctx,session.Token);err!=nil{t.Fatal(err)}
	_,err=p.GetSessionUser(ctx,session.Token)
	wantError(t,err,application.ErrNotFound)
	session,err=p.Login(ctx,user.Email,password)
	if err!=nil{t.Fatal(err)}
	execSQL(t,ctx,p,`UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token=$1`,session.Token)
	_,err=p.GetSessionUser(ctx,session.Token)
	wantError(t,err,application.ErrNotFound)
}
