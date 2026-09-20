#!/bin/bash
# Environment variables validation script for Цифровая Очередь
# Validates .env file format and required variables before deployment

set -e

ENV_FILE="${1:-.env}"
ERRORS=0

echo "🔍 Validating environment file: $ENV_FILE"
echo ""

# Check if file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Error: $ENV_FILE not found"
    echo "   Run: cp .env.example .env"
    exit 1
fi

# Source the env file
set -a
source "$ENV_FILE"
set +a

# Validation functions
validate_required() {
    local var_name=$1
    local var_value=${!var_name}

    if [ -z "$var_value" ]; then
        echo "❌ $var_name is required but empty"
        ((ERRORS++))
        return 1
    else
        echo "✅ $var_name is set"
        return 0
    fi
}

validate_port() {
    local var_name=$1
    local var_value=${!var_name}

    if ! [[ "$var_value" =~ ^[0-9]+$ ]] || [ "$var_value" -lt 1 ] || [ "$var_value" -gt 65535 ]; then
        echo "❌ $var_name=$var_value is not a valid port (1-65535)"
        ((ERRORS++))
        return 1
    else
        echo "✅ $var_name=$var_value is valid"
        return 0
    fi
}

validate_url() {
    local var_name=$1
    local var_value=${!var_name}
    local allow_empty=${2:-false}

    if [ -z "$var_value" ] && [ "$allow_empty" = "true" ]; then
        echo "ℹ️  $var_name is empty (allowed)"
        return 0
    fi

    if [ -z "$var_value" ]; then
        echo "❌ $var_name is required but empty"
        ((ERRORS++))
        return 1
    fi

    if [[ "$var_value" =~ ^https?:// ]]; then
        # Check for trailing slash
        if [[ "$var_value" =~ /$ ]]; then
            echo "⚠️  $var_name has trailing slash: $var_value"
            echo "   Remove trailing slash for consistency"
        fi
        echo "✅ $var_name=$var_value is valid"
        return 0
    else
        echo "❌ $var_name=$var_value is not a valid URL (must start with http:// or https://)"
        ((ERRORS++))
        return 1
    fi
}

validate_log_level() {
    local var_value=$LOG_LEVEL
    local valid_levels=("DEBUG" "INFO" "WARN" "ERROR")

    if [[ " ${valid_levels[@]} " =~ " ${var_value} " ]]; then
        echo "✅ LOG_LEVEL=$var_value is valid"
        return 0
    else
        echo "❌ LOG_LEVEL=$var_value is invalid (must be: ${valid_levels[*]})"
        ((ERRORS++))
        return 1
    fi
}

# Run validations
echo "📝 Required Variables:"
validate_required "APP_ENV"
validate_required "POSTGRES_HOST"
validate_required "POSTGRES_DB"
validate_required "POSTGRES_USER"
validate_required "POSTGRES_PASSWORD"

echo ""
echo "🔌 Ports:"
validate_port "HTTP_PORT"
validate_port "POSTGRES_PORT"
validate_port "FRONTEND_PORT"

echo ""
echo "🌐 URLs:"
validate_url "CORS_ALLOWED_ORIGIN"
validate_url "VITE_API_BASE_URL" "true"  # Can be empty for reverse proxy setup

echo ""
echo "📊 Configuration:"
validate_log_level

# Password strength check
if [ ${#POSTGRES_PASSWORD} -lt 12 ] && [ "$APP_ENV" = "production" ]; then
    echo "⚠️  POSTGRES_PASSWORD is short (${#POSTGRES_PASSWORD} chars)"
    echo "   Consider using 16+ characters for production"
fi

# Check for development-only values in production
if [ "$APP_ENV" = "production" ]; then
    echo ""
    echo "🔒 Production Security Checks:"

    if [ "$POSTGRES_PASSWORD" = "local-development-only" ]; then
        echo "❌ Using development password in production!"
        ((ERRORS++))
    fi

    if [ "$GRAFANA_PASSWORD" = "admin" ]; then
        echo "⚠️  Using default Grafana password in production"
        echo "   Change GRAFANA_PASSWORD for security"
    fi

    if [[ "$CORS_ALLOWED_ORIGIN" =~ localhost ]]; then
        echo "⚠️  CORS_ALLOWED_ORIGIN contains localhost in production"
        echo "   Update to production domain"
    fi
fi

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $ERRORS -eq 0 ]; then
    echo "✅ Validation passed! Environment is configured correctly."
    echo ""
    echo "You can now run: docker compose up --build"
    exit 0
else
    echo "❌ Validation failed with $ERRORS error(s)"
    echo ""
    echo "Fix the errors above and run validation again."
    exit 1
fi
