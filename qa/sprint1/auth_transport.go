package sprint1qa

import (
 "net/http"
 "os"
)

// The release runner supplies a real login session; guards remain authoritative.
type sessionTransport struct{}

func (sessionTransport) RoundTrip(req *http.Request) (*http.Response, error) {
 copy := req.Clone(req.Context())
 if token := os.Getenv("QA_SESSION_TOKEN"); token != "" {
  copy.AddCookie(&http.Cookie{Name: "session", Value: token})
 }
 return http.DefaultTransport.RoundTrip(copy)
}
