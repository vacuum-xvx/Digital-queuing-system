#!/bin/sh
set -e

if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
  echo "Telegram alerting configured for chat ID: $TELEGRAM_CHAT_ID"
  sed -e "s|__TELEGRAM_BOT_TOKEN__|$TELEGRAM_BOT_TOKEN|g" \
      -e "s|__TELEGRAM_CHAT_ID__|$TELEGRAM_CHAT_ID|g" \
      /etc/alertmanager/alertmanager.template.yml > /tmp/alertmanager.yml
else
  echo "Telegram credentials not set in .env. Alertmanager running with default null receiver."
  cat << 'EOF' > /tmp/alertmanager.yml
global:
  resolve_timeout: 5m

route:
  receiver: 'default'

receivers:
  - name: 'default'
EOF
fi

exec /bin/alertmanager --config.file=/tmp/alertmanager.yml --storage.path=/alertmanager
