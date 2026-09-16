FROM golang:1.25-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -o /api ./cmd/api

FROM alpine:3.22
WORKDIR /app
RUN adduser -D app
COPY --from=builder /api /app/api
COPY migrations /app/migrations
USER app
ENTRYPOINT ["/app/api"]
