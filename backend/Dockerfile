FROM alpine:3.22
WORKDIR /app
RUN adduser -D app
COPY api /app/api
COPY migrations /app/migrations
USER app
ENTRYPOINT ["/app/api"]
