package main

import (
	"fmt"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	hash := "$2a$12$VbT5a/nRCLstHpMjCqz0yuqANM3dKEOqFZ/IEy70JHD2DalRbSVwC"
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte("admin1234"))
	if err != nil {
		fmt.Println("Error comparing:", err)
	} else {
		fmt.Println("Match!")
	}
	
	newHash, _ := bcrypt.GenerateFromPassword([]byte("admin1234"), bcrypt.DefaultCost)
	fmt.Println("New hash:", string(newHash))
}
