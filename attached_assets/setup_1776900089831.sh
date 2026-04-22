#!/usr/bin/env bash
# =============================================================================
#  setup.sh  –  Certxa Booking Platform full production VPS setup
#
#  Usage:
#    bash setup.sh                     # interactive whiptail GUI menu
#    bash setup.sh mydomain.com        # pre-fill domain, show menu
#    bash setup.sh mydomain.com --yes  # fully unattended, run all steps
#
#  Requirements:
#    - Ubuntu 22.04.5 LTS (Jammy Jellyfish)
#    - Node.js v20.x LTS
#    - PostgreSQL 15+
# =============================================================================

set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# ─── COLOUR HELPERS ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*" >&2; exit 1; }
hdr()     { echo -e "\n${BOLD}${CYAN}━━━  $*  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"; }

# ─── GLOBAL CONFIGURATION ─────────────────────────────────────────────────────
APP_PORT=5080
DB_USER="certxa_user"
DB_NAME="certxabooking_data"
SERVICE_NAME="certxa"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${APP_DIR}/.setup_config"
BACKTITLE="Certxa Booking Platform – VPS Setup"
CERT_EMAIL=""

# ─── WHIPTAIL HELPER ──────────────────────────────────────────────────────────
ensure_whiptail() {
    if ! command -v whiptail &>/dev/null; then
        info "Installing whiptail..."
        sudo apt-get install -y whiptail -qq 2>/dev/null || true
    fi
}

# ─── CONFIGURATION STORAGE ────────────────────────────────────────────────────
load_config() {
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
        info "Configuration loaded from $CONFIG_FILE"
    fi
}

save_config() {
    cat > "$CONFIG_FILE" <<CONFIGEOF
DOMAIN="${DOMAIN:-}"
APP_PORT="${APP_PORT}"
DB_NAME="${DB_NAME}"
CERT_EMAIL="${CERT_EMAIL:-}"
CONFIGEOF
    success "Configuration saved to $CONFIG_FILE"
}

# ─── ARGUMENT PARSING ─────────────────────────────────────────────────────────
AUTO_YES=false
DOMAIN=""
for ARG in "$@"; do
    case "$ARG" in
        --yes|-y) AUTO_YES=true ;;
        *)        [[ -z "$DOMAIN" ]] && DOMAIN="$ARG" ;;
    esac
done

# ─── DETECT POSTGRES VARS ─────────────────────────────────────────────────────
detect_pg() {
    PG_VERSION=$(dpkg -l 'postgresql-[0-9]*' 2>/dev/null \
        | awk '/^ii/{print $2}' \
        | grep -oP '(?<=postgresql-)\d+' \
        | sort -n | tail -1 || true)
    PG_SERVICE="postgresql"
    if [[ -n "${PG_VERSION:-}" ]] && sudo systemctl list-units --type=service --all 2>/dev/null \
            | grep -q "postgresql@${PG_VERSION}-main.service"; then
        PG_SERVICE="postgresql@${PG_VERSION}-main"
    fi
}

# ═══════════════════════════════════════════════════════════════════════════════
#  WHIPTAIL GUI SCREENS
# ═══════════════════════════════════════════════════════════════════════════════

# ── Disclaimer ────────────────────────────────────────────────────────────────
show_disclaimer() {
    ensure_whiptail
    set +e
    whiptail \
        --title "  DISCLAIMER  " \
        --backtitle "$BACKTITLE" \
        --msgbox "\
Auto application setup process for Certxa Booking Platform.
This setup tool is developed for Ubuntu 22.04.5 LTS Linux based systems.

Requirements: Node.js v20.x LTS and PostgreSQL 15+

This tool will:
  - Install system dependencies and packages
  - Configure PostgreSQL database and user
  - Set up SSL certificates via Let's Encrypt
  - Deploy the application with PM2 process management
  - Configure Nginx as a reverse proxy (booking.conf)
    with wildcard subdomain support for booking slugs

IMPORTANT - Please be aware:
  * All changes made are PERMANENT and cannot be automatically undone
  * This script does not create backups of existing config files
    unless explicitly stated
  * Running this script may overwrite existing settings
  * You are responsible for ensuring your system meets all
    prerequisites before proceeding

By continuing you accept full responsibility for any changes made." \
        26 72
    STATUS=$?
    set -e

    if [ $STATUS -ne 0 ]; then
        clear; echo "Setup cancelled."; exit 0
    fi

    set +e
    whiptail \
        --title "  DISCLAIMER  " \
        --backtitle "$BACKTITLE" \
        --yesno "\nDo you agree to proceed with the Certxa setup?" \
        9 50
    STATUS=$?
    set -e

    if [ $STATUS -ne 0 ]; then
        clear; echo "Setup cancelled by user."; exit 0
    fi
}

# ── Apache detection ──────────────────────────────────────────────────────────
check_apache() {
    if dpkg -l 2>/dev/null | grep -q "^ii.*apache2"; then
        if whiptail \
            --title "  Apache2 Detected  " \
            --backtitle "$BACKTITLE" \
            --yesno "\
WARNING: Apache2 web server detected on this system!

Certxa requires Nginx as its reverse proxy. Apache2 will
conflict with Nginx and must be removed before setup can continue.

This will:
  1) Backup your Apache2 configuration to /root/
  2) Uninstall Apache2 and its utilities

Do you want to backup and remove Apache2 now?" \
            16 64; then

            info "Backing up Apache2 configuration..."
            BACKUP_FILE="/root/Apache_backup_$(date +%Y%m%d_%H%M%S).zip"
            sudo zip -r "$BACKUP_FILE" /etc/apache2/ 2>/dev/null || true

            if [ -f "$BACKUP_FILE" ]; then
                success "Apache2 config backed up to $BACKUP_FILE"
            else
                warn "Could not create Apache2 backup — continuing anyway."
            fi

            info "Uninstalling Apache2..."
            sudo systemctl stop apache2 2>/dev/null || true
            sudo apt-get remove --purge apache2 apache2-utils -y -qq
            sudo apt-get autoremove -y -qq
            success "Apache2 removed successfully."

            whiptail \
                --title "  Apache2 Removed  " \
                --backtitle "$BACKTITLE" \
                --msgbox "\nApache2 has been removed.\nBackup saved to: ${BACKUP_FILE}" \
                10 56
        else
            clear
            echo "Setup cancelled — Apache2 must be removed before continuing."
            exit 0
        fi
    fi
}

# ── Domain prompt ─────────────────────────────────────────────────────────────
prompt_domain() {
    if [ -z "$DOMAIN" ]; then
        set +e
        DOMAIN=$(whiptail \
            --title "  Domain Name  " \
            --backtitle "$BACKTITLE" \
            --inputbox "\nEnter the domain name for this server:\n(e.g. example.com)\n\nNote: booking subdomains (e.g. salon.example.com)\nare handled automatically via wildcard SSL." \
            12 58 "" \
            3>&1 1>&2 2>&3)
        STATUS=$?
        set -e

        if [ $STATUS -ne 0 ]; then
            clear; echo "Setup cancelled."; exit 0
        fi
    fi

    DOMAIN="${DOMAIN#https://}"
    DOMAIN="${DOMAIN#http://}"
    DOMAIN="${DOMAIN%/}"

    [[ -z "$DOMAIN" ]] && error "Domain name cannot be empty."

    clear
    echo "Domain set to: $DOMAIN"
    sleep 1
}

# ── Port prompt ───────────────────────────────────────────────────────────────
prompt_port() {
    while true; do
        set +e
        PORT_IN=$(whiptail \
            --title "  Application Port  " \
            --backtitle "$BACKTITLE" \
            --inputbox "\nWhat port should the app run on?\n(1024-65535, default: ${APP_PORT})" \
            10 54 "$APP_PORT" \
            3>&1 1>&2 2>&3)
        STATUS=$?
        set -e

        if [ $STATUS -ne 0 ]; then
            clear; echo "Setup cancelled."; exit 0
        fi

        PORT_IN="${PORT_IN:-$APP_PORT}"

        if [[ "$PORT_IN" =~ ^[0-9]+$ ]] && (( PORT_IN >= 1024 && PORT_IN <= 65535 )); then
            if ss -tlnp 2>/dev/null | awk '{print $4}' | grep -q ":${PORT_IN}$"; then
                set +e
                whiptail \
                    --title "  Port In Use  " \
                    --backtitle "$BACKTITLE" \
                    --yesno "\nPort ${PORT_IN} is already in use.\n\nUse it anyway?" \
                    9 52
                STATUS=$?
                set -e

                if [ $STATUS -ne 0 ]; then
                    continue
                fi
            fi
            APP_PORT="$PORT_IN"
            break
        else
            whiptail \
                --title "  Invalid Port  " \
                --backtitle "$BACKTITLE" \
                --msgbox "\nPort must be between 1024 and 65535." \
                8 50
        fi
    done
}

# ── Main menu ─────────────────────────────────────────────────────────────────
show_menu() {
    local INFO="Domain: ${DOMAIN}   |   Port: ${APP_PORT}   |   DB: ${DB_NAME}"

    local CHOICE
    set +e
    CHOICE=$(whiptail \
        --title "  Certxa – VPS Setup Wizard  " \
        --backtitle "${BACKTITLE}" \
        --menu "\n${INFO}\n\nWhat would you like to do?" \
        28 76 16 \
        "1"  "  Full Setup  (all 10 steps from the beginning)" \
        "2"  "  Configuration Variables Setup" \
        "D"  "  Diagnose / Fix 502 Bad Gateway" \
        ""   "  ─────────────────────────────────────────────────" \
        "3"  "  Resume from Step 1  –  Swap space" \
        "4"  "  Resume from Step 2  –  System packages & Node.js" \
        "5"  "  Resume from Step 3  –  Firewall (UFW + fail2ban)" \
        "6"  "  Resume from Step 4  –  npm install" \
        "7"  "  Resume from Step 5  –  PostgreSQL database & user" \
        "8"  "  Resume from Step 6  –  .env configuration" \
        "9"  "  Resume from Step 7  –  Uploads directory" \
        "10" "  Resume from Step 8  –  Database schema (Drizzle push)" \
        "11" "  Resume from Step 9  –  Production build" \
        "12" "  Resume from Step 10 –  PM2 + Nginx (booking.conf) + SSL" \
        "0"  "  Exit" \
        3>&1 1>&2 2>&3)
    STATUS=$?
    set -e

    if [ $STATUS -ne 0 ]; then
        clear; echo "Exiting."; exit 0
    fi

    clear

    case "$CHOICE" in
        0)   clear; echo "Exiting."; exit 0 ;;
        1)   run_from 1 ;;
        2)   do_step_0 ;;
        D|d) do_diagnose ;;
        3)   run_from 1 ;;
        4)   run_from 2 ;;
        5)   run_from 3 ;;
        6)   run_from 4 ;;
        7)   run_from 5 ;;
        8)   run_from 6 ;;
        9)   run_from 7 ;;
        10)  run_from 8 ;;
        11)  run_from 9 ;;
        12)  run_from 10 ;;
        "")  return 0 ;;
    esac

    set +e
    whiptail \
        --title "  Step Complete  " \
        --backtitle "$BACKTITLE" \
        --msgbox "\n  Done!  Press Enter to return to the menu." \
        9 50 \
        3>&1 1>&2 2>&3
    STATUS=$?
    set -e

    [ $STATUS -ne 0 ] && true
}

# ═══════════════════════════════════════════════════════════════════════════════
#  STEP FUNCTIONS
#  Each step is self-contained and safe to re-run.
# ═══════════════════════════════════════════════════════════════════════════════

# ── Step 0 – Configuration Variables Setup ────────────────────────────────────
do_step_0() {
    hdr "Configuration Variables Setup"
    load_config

    while true; do
        local CHOICE
        set +e
        CHOICE=$(whiptail \
            --title "  Configuration Variables  " \
            --backtitle "$BACKTITLE" \
            --menu "\nCurrent settings:\n  Domain : ${DOMAIN:-<not set>}\n  Port   : ${APP_PORT}\n  DB     : ${DB_NAME}\n  Email  : ${CERT_EMAIL:-<not set>}\n\nSelect a value to change:" \
            20 62 6 \
            "1" "Domain name      [${DOMAIN:-<not set>}]" \
            "2" "Application port [${APP_PORT}]" \
            "3" "Database name    [${DB_NAME}]" \
            "4" "SSL cert email   [${CERT_EMAIL:-<not set>}]" \
            "5" "Save and exit" \
            "6" "Exit without saving" \
            3>&1 1>&2 2>&3)
        STATUS=$?
        set -e

        [ $STATUS -ne 0 ] && break

        case "$CHOICE" in
            1)
                local NEW_DOMAIN
                set +e
                NEW_DOMAIN=$(whiptail \
                    --title "  Domain Name  " \
                    --backtitle "$BACKTITLE" \
                    --inputbox "\nEnter domain name:" \
                    9 52 "${DOMAIN:-}" \
                    3>&1 1>&2 2>&3)
                STATUS=$?
                set -e

                [ $STATUS -ne 0 ] && continue
                if [ -n "$NEW_DOMAIN" ]; then
                    DOMAIN="${NEW_DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%/}"
                    success "Domain updated to: $DOMAIN"
                fi
                ;;
            2)
                local NEW_PORT
                set +e
                NEW_PORT=$(whiptail \
                    --title "  Application Port  " \
                    --backtitle "$BACKTITLE" \
                    --inputbox "\nEnter port (1024-65535):" \
                    9 52 "${APP_PORT}" \
                    3>&1 1>&2 2>&3)
                STATUS=$?
                set -e

                [ $STATUS -ne 0 ] && continue
                if [[ "$NEW_PORT" =~ ^[0-9]+$ ]] && (( NEW_PORT >= 1024 && NEW_PORT <= 65535 )); then
                    APP_PORT="$NEW_PORT"
                    success "Port updated to: $APP_PORT"
                fi
                ;;
            3)
                local NEW_DB
                set +e
                NEW_DB=$(whiptail \
                    --title "  Database Name  " \
                    --backtitle "$BACKTITLE" \
                    --inputbox "\nEnter database name:" \
                    9 52 "${DB_NAME}" \
                    3>&1 1>&2 2>&3)
                STATUS=$?
                set -e

                [ $STATUS -ne 0 ] && continue
                if [[ "$NEW_DB" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ ]]; then
                    DB_NAME="$NEW_DB"
                    success "Database name updated to: $DB_NAME"
                fi
                ;;
            4)
                local NEW_EMAIL
                set +e
                NEW_EMAIL=$(whiptail \
                    --title "  SSL Certificate Email  " \
                    --backtitle "$BACKTITLE" \
                    --inputbox "\nEnter email for SSL certificate notices:" \
                    9 54 "${CERT_EMAIL:-admin@${DOMAIN:-example.com}}" \
                    3>&1 1>&2 2>&3)
                STATUS=$?
                set -e

                [ $STATUS -ne 0 ] && continue
                if [ -n "$NEW_EMAIL" ]; then
                    CERT_EMAIL="$NEW_EMAIL"
                    success "Email updated to: $CERT_EMAIL"
                fi
                ;;
            5)  save_config; break ;;
            6)  break ;;
        esac
    done
}

# ── Step 1 – Swap space ───────────────────────────────────────────────────────
do_step_1() {
    hdr "Step 1/10  Swap space"
    SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
    if (( SWAP_MB < 512 )); then
        info "Swap: ${SWAP_MB} MB — creating 2 GB swap file..."
        if [ -f /swapfile ]; then
            sudo swapoff /swapfile 2>/dev/null || true
            sudo rm -f /swapfile
        fi
        sudo fallocate -l 2G /swapfile 2>/dev/null \
            || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
        sudo chmod 600 /swapfile
        sudo mkswap /swapfile -q
        sudo swapon /swapfile
        grep -q '/swapfile' /etc/fstab \
            || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab > /dev/null
        echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf > /dev/null
        sudo sysctl -p /etc/sysctl.d/99-swappiness.conf -q
        success "2 GB swap file created and enabled."
    else
        info "Swap already configured (${SWAP_MB} MB) — skipping."
    fi
}

# ── Step 2 – System packages ──────────────────────────────────────────────────
do_step_2() {
    hdr "Step 2/10  System packages"
    sudo apt-get update -qq
    sudo apt-get install -y -qq \
        curl wget git openssl ca-certificates gnupg lsb-release \
        build-essential python3 \
        ufw fail2ban \
        unattended-upgrades apt-listchanges

    # Node.js 20.x LTS
    NODE_VER=$(node --version 2>/dev/null | grep -oP '(?<=v)\d+' || echo "0")
    if (( NODE_VER < 20 )); then
        info "Node.js ${NODE_VER} found — installing 20.x LTS..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -q
        sudo apt-get install -y nodejs -qq
        success "Node.js $(node --version) installed."
    else
        info "Node.js $(node --version) already present — skipping."
    fi

    # PM2
    if ! command -v pm2 &>/dev/null; then
        info "Installing PM2..."
        sudo npm install -g pm2 -q
        success "PM2 installed."
    else
        info "PM2 $(pm2 --version) already present — skipping."
    fi

    # PostgreSQL
    PG_VERSION=$(dpkg -l 'postgresql-[0-9]*' 2>/dev/null \
        | awk '/^ii/{print $2}' \
        | grep -oP '(?<=postgresql-)\d+' \
        | sort -n | tail -1 || true)
    if [[ -z "$PG_VERSION" ]]; then
        info "PostgreSQL not found — installing..."
        sudo apt-get install -y postgresql postgresql-contrib -qq
        PG_VERSION=$(dpkg -l 'postgresql-[0-9]*' 2>/dev/null \
            | awk '/^ii/{print $2}' \
            | grep -oP '(?<=postgresql-)\d+' \
            | sort -n | tail -1 || true)
        [[ -z "$PG_VERSION" ]] && error "PostgreSQL installation failed."
        success "PostgreSQL ${PG_VERSION} installed."
    else
        info "PostgreSQL ${PG_VERSION} already installed."
    fi

    detect_pg
    if ! sudo systemctl is-active --quiet "${PG_SERVICE}" 2>/dev/null; then
        sudo systemctl enable "${PG_SERVICE}" --now
        sleep 2
    else
        info "PostgreSQL service (${PG_SERVICE}) already running."
    fi
    info "Waiting for PostgreSQL to accept connections..."
    PG_WAIT=0
    until sudo -u postgres pg_isready -q 2>/dev/null; do
        sleep 1; PG_WAIT=$((PG_WAIT+1))
        (( PG_WAIT >= 30 )) && error "PostgreSQL did not become ready within 30 s."
    done
    success "PostgreSQL ${PG_VERSION} ready."

    # pg_hba.conf — ensure TCP md5 auth
    PG_HBA="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"
    if [[ -f "$PG_HBA" ]]; then
        PATCHED=false
        if sudo grep -qP '^host\s+all\s+all\s+(127\.0\.0\.1/32|::1/128)\s+trust' "$PG_HBA" 2>/dev/null; then
            sudo sed -i -E \
                's/^(host\s+all\s+all\s+(127\.0\.0\.1\/32|::1\/128)\s+)trust$/\1md5/' "$PG_HBA"
            PATCHED=true
        fi
        if ! sudo grep -qP '^host\s+all\s+all\s+127\.0\.0\.1/32' "$PG_HBA" 2>/dev/null; then
            echo "host    all             all             127.0.0.1/32            md5" \
                | sudo tee -a "$PG_HBA" > /dev/null
            PATCHED=true
        fi
        if [ "$PATCHED" = true ]; then
            sudo systemctl reload "${PG_SERVICE}" 2>/dev/null \
                || sudo systemctl restart "${PG_SERVICE}"
            until sudo -u postgres pg_isready -q 2>/dev/null; do sleep 1; done
            success "pg_hba.conf patched — md5 TCP auth enabled."
        else
            info "pg_hba.conf already configured correctly."
        fi
    fi

    # Nginx
    if ! command -v nginx &>/dev/null; then
        info "Installing Nginx..."
        sudo apt-get install -y nginx -qq
        sudo systemctl enable nginx --now
        success "Nginx installed."
    else
        info "Nginx $(nginx -v 2>&1 | grep -oP '[\d.]+') already present — skipping."
    fi

    # Certbot
    if ! command -v certbot &>/dev/null; then
        info "Installing Certbot..."
        sudo apt-get install -y certbot python3-certbot-nginx -qq
        success "Certbot installed."
    else
        info "Certbot already present — skipping."
    fi

    success "All system packages ready."
}

# ── Step 3 – Firewall ─────────────────────────────────────────────────────────
do_step_3() {
    hdr "Step 3/10  Firewall (UFW + fail2ban)"
    sudo ufw allow OpenSSH  > /dev/null
    sudo ufw allow 80/tcp   > /dev/null
    sudo ufw allow 443/tcp  > /dev/null
    if sudo ufw status | grep -q "inactive"; then
        echo "y" | sudo ufw enable > /dev/null
        success "UFW enabled — SSH (22), HTTP (80), HTTPS (443) allowed."
    else
        sudo ufw reload > /dev/null
        success "UFW rules updated."
    fi

    if ! sudo systemctl is-active --quiet fail2ban 2>/dev/null; then
        sudo systemctl enable fail2ban --now
    fi
    F2B_JAIL="/etc/fail2ban/jail.d/certxa.conf"
    sudo tee "$F2B_JAIL" > /dev/null <<F2BEOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
F2BEOF
    sudo systemctl reload fail2ban 2>/dev/null || sudo systemctl restart fail2ban
    success "fail2ban active — SSH brute-force protection enabled."

    if [ ! -f /etc/apt/apt.conf.d/50unattended-upgrades ]; then
        sudo dpkg-reconfigure -plow unattended-upgrades 2>/dev/null || true
    fi
    success "Automatic security updates configured."
}

# ── Step 4 – npm install ──────────────────────────────────────────────────────
do_step_4() {
    hdr "Step 4/10  Node.js dependencies"
    cd "${APP_DIR}"
    info "Installing npm packages (this may take a minute)..."
    # Only wipe node_modules if package.json is newer than the modules directory
    # or if node_modules is missing entirely — avoids a slow full reinstall on re-runs.
    if [ ! -d "${APP_DIR}/node_modules" ] \
        || [ "${APP_DIR}/package.json" -nt "${APP_DIR}/node_modules/.package-lock.json" ]; then
        rm -rf node_modules
        npm install
    else
        info "node_modules is up to date — skipping full reinstall."
        npm install --prefer-offline --silent 2>/dev/null || npm install
    fi
    success "npm install complete."
}

# ── Step 5 – PostgreSQL database + user ──────────────────────────────────────
do_step_5() {
    hdr "Step 5/10  PostgreSQL – user, database, permissions"

    # Prompt for database name via whiptail
    while true; do
        local INPUT_DB_NAME
        set +e
        INPUT_DB_NAME=$(whiptail \
            --title "  Database Name  " \
            --backtitle "$BACKTITLE" \
            --inputbox "\nWhat should the database be called?\n(letters, numbers and underscores only)" \
            10 58 "${DB_NAME}" \
            3>&1 1>&2 2>&3)
        STATUS=$?
        set -e

        if [ $STATUS -ne 0 ]; then
            warn "Using default DB name."; break
        fi
        INPUT_DB_NAME="${INPUT_DB_NAME:-$DB_NAME}"
        if [[ "$INPUT_DB_NAME" =~ ^[a-zA-Z][a-zA-Z0-9_]*$ ]]; then
            DB_NAME="$INPUT_DB_NAME"
            info "Database will be named '${DB_NAME}'."
            break
        else
            whiptail \
                --title "  Invalid Name  " \
                --backtitle "$BACKTITLE" \
                --msgbox "\nInvalid name — use only letters, numbers, and underscores,\nstarting with a letter." \
                9 58
        fi
    done

    detect_pg
    [[ -z "${PG_VERSION:-}" ]] && error "PostgreSQL is not installed. Please run Step 2 first."
    if ! sudo -u postgres pg_isready -q 2>/dev/null; then
        sudo systemctl start "${PG_SERVICE}"
        sleep 3
    fi

    # DB password — reuse from .env or generate fresh
    DB_PASSWORD=""
    if [ -f "${APP_DIR}/.env" ] && grep -q "^DATABASE_URL=" "${APP_DIR}/.env"; then
        EXISTING_URL=$(grep "^DATABASE_URL=" "${APP_DIR}/.env" | cut -d= -f2-)
        DB_PASSWORD=$(echo "${EXISTING_URL}" | sed -nE 's|^[^:]+://[^:@]+:([^@/]+)@[^/].*|\1|p' || true)
        if echo "${DB_PASSWORD}" | grep -qP '[:/]'; then
            DB_PASSWORD=""
        fi
    fi
    if [ -z "${DB_PASSWORD:-}" ]; then
        DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)
    fi

    sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
        | grep -q 1 \
        || sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';"
    sudo -u postgres psql -c "ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

    DB_EXISTS=$(sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | tr -d '[:space:]')
    if [ "${DB_EXISTS}" = "1" ]; then
        info "Database '${DB_NAME}' already exists — keeping existing data."
    else
        info "Creating database '${DB_NAME}'..."
        sudo -u postgres psql -v ON_ERROR_STOP=1 \
            -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"
    fi

    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
    sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO ${DB_USER};"
    sudo -u postgres psql -d "${DB_NAME}" -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};"
    success "Database '${DB_NAME}' and user '${DB_USER}' are ready."

    # Write DATABASE_URL to .env
    local NEW_DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1/${DB_NAME}?sslmode=disable"
    if [ -f "${APP_DIR}/.env" ]; then
        if grep -q "^DATABASE_URL=" "${APP_DIR}/.env"; then
            sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${NEW_DB_URL}|" "${APP_DIR}/.env"
            info "DATABASE_URL updated in .env."
        else
            echo "DATABASE_URL=${NEW_DB_URL}" >> "${APP_DIR}/.env"
            info "DATABASE_URL added to .env."
        fi
    else
        echo "DATABASE_URL=${NEW_DB_URL}" > "${APP_DIR}/.env"
        chmod 600 "${APP_DIR}/.env"
        info "Created .env with DATABASE_URL."
    fi

    success "DATABASE_URL written: ${NEW_DB_URL}"
}

# ── Step 6 – .env file ────────────────────────────────────────────────────────
do_step_6() {
    hdr "Step 6/10  .env file"

    # Ensure DB_PASSWORD is set
    DB_PASSWORD=""
    if [ -f "${APP_DIR}/.env" ] && grep -q "^DATABASE_URL=" "${APP_DIR}/.env"; then
        EXISTING_URL=$(grep "^DATABASE_URL=" "${APP_DIR}/.env" | cut -d= -f2-)
        DB_PASSWORD=$(echo "${EXISTING_URL}" | sed -nE 's|^[^:]+://[^:@]+:([^@/]+)@[^/].*|\1|p' || true)
        if echo "${DB_PASSWORD}" | grep -qP '[:/]'; then DB_PASSWORD=""; fi
    fi
    if [ -z "${DB_PASSWORD:-}" ]; then
        DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)
    fi

    local NEW_DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1/${DB_NAME}?sslmode=disable"

    upsert_env() {
        local key="$1" val="$2" file="${APP_DIR}/.env"
        python3 - <<PYEOF
import re
key = """${key}"""
val = """${val}"""
path = """${file}"""
with open(path, "r") as f:
    content = f.read()
pattern = re.compile(r"^" + re.escape(key) + r"=.*$", re.MULTILINE)
new_line = key + "=" + val
if pattern.search(content):
    content = pattern.sub(new_line, content)
else:
    content = content.rstrip("\n") + "\n" + new_line + "\n"
with open(path, "w") as f:
    f.write(content)
PYEOF
    }

    if [ -f "${APP_DIR}/.env" ]; then
        info ".env exists — updating DATABASE_URL, PORT, NODE_ENV, CORS_ORIGINS, APP_URL, GOOGLE_REDIRECT_URI, GOOGLE_AUTH_CALLBACK_URL."
        upsert_env "DATABASE_URL"             "${NEW_DB_URL}"
        upsert_env "PORT"                     "${APP_PORT}"
        upsert_env "NODE_ENV"                 "production"
        upsert_env "CORS_ALLOW_ALL"           "false"
        upsert_env "CORS_ORIGINS"             "https://${DOMAIN},https://www.${DOMAIN}"
        upsert_env "APP_URL"                  "https://${DOMAIN}"
        upsert_env "GOOGLE_REDIRECT_URI"      "https://${DOMAIN}/google-business"
        upsert_env "GOOGLE_AUTH_CALLBACK_URL" "https://${DOMAIN}/api/auth/google/callback"
        if ! grep -q "^SESSION_SECRET=" "${APP_DIR}/.env"; then
            local SESSION_SECRET
            SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "change-me-$(date +%s)")
            upsert_env "SESSION_SECRET" "${SESSION_SECRET}"
            info "SESSION_SECRET generated and added."
        fi
        success ".env updated."
    else
        local SESSION_SECRET
        SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "change-me-$(date +%s)")
        cat > "${APP_DIR}/.env" <<EOF
# ─── Database ────────────────────────────────────────────────────────────────
DATABASE_URL=${NEW_DB_URL}

# ─── App ─────────────────────────────────────────────────────────────────────
NODE_ENV=production
PORT=${APP_PORT}

# ─── Session ─────────────────────────────────────────────────────────────────
SESSION_SECRET=${SESSION_SECRET}

# ─── CORS ────────────────────────────────────────────────────────────────────
CORS_ALLOW_ALL=false
CORS_ORIGINS=https://${DOMAIN},https://www.${DOMAIN}

# ─── Trial ───────────────────────────────────────────────────────────────────
TRIAL_PERIOD_DAYS=60

# ─── Google OAuth ─────────────────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://${DOMAIN}/google-business
APP_URL=https://${DOMAIN}
GOOGLE_AUTH_CALLBACK_URL=https://${DOMAIN}/api/auth/google/callback

# ─── Mailgun ─────────────────────────────────────────────────────────────────
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_FROM_EMAIL=
MAILGUN_FROM_NAME=Certxa
MAILGUN_SENDER_EMAIL=

# ─── Twilio ──────────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# ─── TextBelt ────────────────────────────────────────────────────────────────
TEXTBELT_API_KEY=

# ─── Stripe ──────────────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
EOF
        success ".env created."
    fi
    chmod 600 "${APP_DIR}/.env"
    info ".env permissions set to 600."
}

# ── Step 7 – Uploads directory ────────────────────────────────────────────────
do_step_7() {
    hdr "Step 7/10  Uploads directory"
    for DIR in \
        "${APP_DIR}/uploads" \
        "${APP_DIR}/uploads/avatars" \
        "${APP_DIR}/uploads/logos" \
        "${APP_DIR}/uploads/products"; do
        [ -d "$DIR" ] || mkdir -p "$DIR"
        info "Verified: $DIR"
    done
    chmod -R 755 "${APP_DIR}/uploads"
    success "uploads/ directory structure ready."
}

# ── Step 8 – Database schema ──────────────────────────────────────────────────
do_step_8() {
    hdr "Step 8/10  Database schema"
    cd "${APP_DIR}"

    if [ ! -f "${APP_DIR}/.env" ]; then
        warn ".env not found — running Step 6 to create it first."
        do_step_6
    fi

    info "Reading DATABASE_URL from .env..."
    local DB_URL
    DB_URL=$(grep "^DATABASE_URL=" "${APP_DIR}/.env" | head -1 | cut -d= -f2-)
    if [ -z "${DB_URL}" ]; then
        error "DATABASE_URL is empty in .env — cannot push schema. Run Step 6 first."
    fi
    export DATABASE_URL="${DB_URL}"

    run_sql() {
        psql "${DB_URL}" -v ON_ERROR_STOP=0 -c "$1" 2>/dev/null || true
    }

    info "Running pre-migration data fixes..."

    # Rename password_hash → password if the old column exists and the new one doesn't
    local HAS_PW_HASH
    HAS_PW_HASH=$(psql "${DB_URL}" -tAc \
        "SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name='users' AND column_name='password_hash';" 2>/dev/null || echo "0")
    local HAS_PW
    HAS_PW=$(psql "${DB_URL}" -tAc \
        "SELECT COUNT(*) FROM information_schema.columns
         WHERE table_name='users' AND column_name='password';" 2>/dev/null || echo "0")

    if [[ "${HAS_PW_HASH:-0}" == "1" && "${HAS_PW:-0}" == "0" ]]; then
        info "Renaming 'password_hash' column to 'password' in users table..."
        run_sql "ALTER TABLE users RENAME COLUMN password_hash TO password;"
        success "Column renamed."
    elif [[ "${HAS_PW_HASH:-0}" == "1" && "${HAS_PW:-0}" == "1" ]]; then
        info "Both 'password_hash' and 'password' columns exist — merging..."
        run_sql "UPDATE users SET password = password_hash WHERE password IS NULL OR password = '';"
        run_sql "ALTER TABLE users DROP COLUMN password_hash;"
        success "Merged and dropped old column."
    else
        info "Password column already in correct state — skipping."
    fi

    # Remove users with null or empty emails
    local NULL_EMAIL_COUNT
    NULL_EMAIL_COUNT=$(psql "${DB_URL}" -tAc \
        "SELECT COUNT(*) FROM users WHERE email IS NULL OR email = '';" 2>/dev/null || echo "0")
    if [[ "${NULL_EMAIL_COUNT:-0}" -gt "0" ]]; then
        warn "Removing ${NULL_EMAIL_COUNT} user(s) with missing email addresses..."
        run_sql "DELETE FROM users WHERE email IS NULL OR email = '';"
        success "Invalid users removed."
    fi

    # Remove duplicate emails, keeping the most recently created account
    local DUP_COUNT
    DUP_COUNT=$(psql "${DB_URL}" -tAc \
        "SELECT COUNT(*) FROM (
            SELECT email FROM users GROUP BY email HAVING COUNT(*) > 1
         ) t;" 2>/dev/null || echo "0")
    if [[ "${DUP_COUNT:-0}" -gt "0" ]]; then
        warn "Removing ${DUP_COUNT} duplicate email(s) from users table..."
        run_sql "DELETE FROM users WHERE id NOT IN (
                     SELECT DISTINCT ON (email) id FROM users ORDER BY email, created_at DESC NULLS LAST
                 );"
        success "Duplicate users removed."
    fi

    info "Pre-migration fixes complete. Pushing Drizzle schema..."
    echo ""

    if ! ./node_modules/.bin/drizzle-kit push; then
        warn "Schema push reported issues — retrying with --force to apply safe changes..."
        if ! ./node_modules/.bin/drizzle-kit push --force; then
            error "Schema push failed — check the error above and re-run Step 8."
        fi
    fi

    # ── Create sessions table (connect-pg-simple — not managed by Drizzle) ───
    # connect-pg-simple has createTableIfMissing:true but that only fires at
    # runtime. Creating it here guarantees it exists before PM2 starts the app
    # so the first login never fails with "relation sessions does not exist".
    info "Ensuring sessions table exists (express-session store)..."
    psql "${DB_URL}" -v ON_ERROR_STOP=0 <<SESSIONSQL 2>/dev/null || true
CREATE TABLE IF NOT EXISTS "sessions" (
  "sid"    varchar      NOT NULL COLLATE "default",
  "sess"   json         NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "sessions_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
) WITH (OIDS=FALSE);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");
SESSIONSQL
    success "Sessions table ready."

    # ── Full table verification + auto-repair ────────────────────────────────
    # db:check --fix confirms all 48 required tables exist and repairs any that
    # are still missing (runs drizzle-kit push again + sessions DDL as needed).
    info "Running full database integrity check..."
    if ! ./node_modules/.bin/tsx "${APP_DIR}/scripts/check-db.ts" --fix; then
        error "Database check failed — one or more tables could not be created. Check the output above and re-run Step 8."
    fi

    success "Schema pushed and all tables verified."
}

# ── Step 9 – Production build ─────────────────────────────────────────────────
do_step_9() {
    hdr "Step 9/10  Production build"
    cd "${APP_DIR}"

    info "Cleaning old build artifacts..."
    rm -rf "${APP_DIR}/dist"

    info "Running production build (this may take 2-3 minutes)..."
    if ! npm run build; then
        error "Build failed — check the output above for errors."
    fi

    # Verify the critical output files exist
    local BUILD_OK=true

    if [ ! -f "${APP_DIR}/dist/index.cjs" ]; then
        warn "MISSING: dist/index.cjs (server bundle)"
        BUILD_OK=false
    else
        success "dist/index.cjs created ($(du -sh "${APP_DIR}/dist/index.cjs" | cut -f1))"
    fi

    if [ ! -f "${APP_DIR}/dist/public/index.html" ]; then
        warn "MISSING: dist/public/index.html (frontend entry)"
        BUILD_OK=false
    else
        success "dist/public/index.html created"
    fi

    local ASSET_COUNT
    ASSET_COUNT=$(find "${APP_DIR}/dist/public/assets" -type f 2>/dev/null | wc -l)
    if [ "${ASSET_COUNT:-0}" -eq 0 ]; then
        warn "MISSING: dist/public/assets/ is empty — CSS/JS files not built"
        BUILD_OK=false
    else
        success "dist/public/assets/ contains ${ASSET_COUNT} file(s)"
    fi

    if [ "${BUILD_OK}" = false ]; then
        error "Build completed but output files are missing. Check for errors above."
    fi

    success "Build complete and verified → ${APP_DIR}/dist/"
}

# ── Step 10 – PM2 + Nginx (booking.conf) + SSL ───────────────────────────────
do_step_10() {
    hdr "Step 10a/10  PM2 process management (${SERVICE_NAME})"

    # Ensure DB_PASSWORD is available
    DB_PASSWORD=""
    if [ -f "${APP_DIR}/.env" ] && grep -q "^DATABASE_URL=" "${APP_DIR}/.env"; then
        EXISTING_URL=$(grep "^DATABASE_URL=" "${APP_DIR}/.env" | cut -d= -f2-)
        DB_PASSWORD=$(echo "${EXISTING_URL}" | sed -nE 's|^[^:]+://[^:@]+:([^@/]+)@[^/].*|\1|p' || true)
        if echo "${DB_PASSWORD}" | grep -qP '[:/]'; then DB_PASSWORD=""; fi
    fi
    if [ -z "${DB_PASSWORD:-}" ]; then
        DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)
    fi

    mkdir -p "${APP_DIR}/logs"

    # Read SESSION_SECRET and other values from .env so they're baked into PM2
    local ENV_SESSION_SECRET ENV_CORS_ORIGINS ENV_TRIAL_DAYS
    ENV_SESSION_SECRET=$(grep "^SESSION_SECRET=" "${APP_DIR}/.env" 2>/dev/null | cut -d= -f2- || echo "")
    ENV_CORS_ORIGINS=$(grep "^CORS_ORIGINS=" "${APP_DIR}/.env" 2>/dev/null | cut -d= -f2- || echo "https://${DOMAIN},https://www.${DOMAIN}")
    ENV_TRIAL_DAYS=$(grep "^TRIAL_PERIOD_DAYS=" "${APP_DIR}/.env" 2>/dev/null | cut -d= -f2- || echo "60")

    cat > "${APP_DIR}/ecosystem.config.cjs" <<ECOEOF
module.exports = {
  apps: [
    {
      name: '${SERVICE_NAME}',
      script: 'dist/index.cjs',
      cwd: '${APP_DIR}',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: ${APP_PORT},
        DATABASE_URL: 'postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1/${DB_NAME}?sslmode=disable',
        SESSION_SECRET: '${ENV_SESSION_SECRET}',
        CORS_ALLOW_ALL: 'false',
        CORS_ORIGINS: '${ENV_CORS_ORIGINS}',
        TRIAL_PERIOD_DAYS: '${ENV_TRIAL_DAYS}',
        APP_URL: 'https://${DOMAIN}',
        GOOGLE_REDIRECT_URI: 'https://${DOMAIN}/google-business',
        GOOGLE_AUTH_CALLBACK_URL: 'https://${DOMAIN}/api/auth/google/callback'
      },
      error_file: '${APP_DIR}/logs/pm2-error.log',
      out_file: '${APP_DIR}/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    }
  ]
};
ECOEOF

    # Stop existing instance if running
    pm2 stop "${SERVICE_NAME}" 2>/dev/null || true
    pm2 delete "${SERVICE_NAME}" 2>/dev/null || true

    info "Starting application with PM2..."
    pm2 start "${APP_DIR}/ecosystem.config.cjs"

    info "Waiting for application to start..."
    for i in $(seq 1 15); do
        sleep 1
        if pm2 list | grep -q "${SERVICE_NAME}.*online"; then
            success "Application '${SERVICE_NAME}' is running."
            break
        fi
        if [ "$i" -eq 15 ]; then
            warn "Application did not come up within 15 seconds. Last log lines:"
            pm2 logs "${SERVICE_NAME}" --lines 20 2>/dev/null || true
            error "Application '${SERVICE_NAME}' failed to start — see logs above."
        fi
    done
    pm2 save
    pm2 startup 2>/dev/null || true

    # ── Nginx + SSL ──────────────────────────────────────────────────────────
    hdr "Step 10b/10  Nginx booking.conf + SSL"

    info "Checking for existing certificates for '${DOMAIN}'..."

    # Find the most recent valid cert for this domain (valid = not expired within 24h)
    local CERT_BASE=""
    for CANDIDATE in \
        "/etc/letsencrypt/live/${DOMAIN}" \
        "/etc/letsencrypt/live/${DOMAIN}-0001" \
        "/etc/letsencrypt/live/${DOMAIN}-0002" \
        "/etc/letsencrypt/live/${DOMAIN}-0003"; do
        if [ -f "${CANDIDATE}/fullchain.pem" ] && [ -f "${CANDIDATE}/privkey.pem" ]; then
            if sudo openssl x509 -checkend 86400 -noout \
                    -in "${CANDIDATE}/fullchain.pem" 2>/dev/null; then
                CERT_BASE="$CANDIDATE"
                info "Found valid existing certificate at ${CERT_BASE} — will reuse it."
                break
            else
                warn "Certificate at ${CANDIDATE} is expired or expiring within 24h."
            fi
        fi
    done

    # Only delete and re-issue if no valid cert exists
    if [ -z "$CERT_BASE" ]; then
        EXISTING_CERTS=()
        for CANDIDATE in \
            "/etc/letsencrypt/live/${DOMAIN}" \
            "/etc/letsencrypt/live/${DOMAIN}-0001" \
            "/etc/letsencrypt/live/${DOMAIN}-0002" \
            "/etc/letsencrypt/live/${DOMAIN}-0003"; do
            [ -d "${CANDIDATE}" ] && EXISTING_CERTS+=("$(basename "${CANDIDATE}")")
        done

        if [ ${#EXISTING_CERTS[@]} -gt 0 ]; then
            warn "Removing expired/invalid certificate(s) before re-issue..."
            for CERT_NAME in "${EXISTING_CERTS[@]}"; do
                info "Deleting certificate: ${CERT_NAME}"
                sudo certbot delete --cert-name "${CERT_NAME}" --non-interactive 2>/dev/null \
                    || sudo rm -rf \
                        "/etc/letsencrypt/live/${CERT_NAME}" \
                        "/etc/letsencrypt/archive/${CERT_NAME}" \
                        "/etc/letsencrypt/renewal/${CERT_NAME}.conf"
            done
            success "Expired certificate(s) removed."
        fi
    fi

    # Clean up default site and broken symlinks
    [ -L /etc/nginx/sites-enabled/default ] \
        && sudo rm -f /etc/nginx/sites-enabled/default \
        && info "Removed default nginx site."

    for LINK in /etc/nginx/sites-enabled/*; do
        [ -L "${LINK}" ] && [ ! -e "${LINK}" ] && sudo rm -f "${LINK}" \
            && warn "Removed broken symlink: ${LINK}"
    done

    # Clean up any old nginx configs from previous runs
    sudo rm -f \
        /etc/nginx/sites-enabled/booking.conf \
        /etc/nginx/sites-available/booking.conf \
        /etc/nginx/conf.d/certxa_global.conf \
        /etc/nginx/sites-enabled/certxa \
        /etc/nginx/sites-available/certxa \
        2>/dev/null || true

    if [ -z "$CERT_BASE" ]; then
        local CERT_EMAIL_INPUT
        set +e
        CERT_EMAIL_INPUT=$(whiptail \
            --title "  SSL Certificate Email  " \
            --backtitle "$BACKTITLE" \
            --inputbox "\nEnter email for Let's Encrypt SSL certificate notices:\n\nNote: A wildcard cert (*.${DOMAIN}) requires DNS\nchallenge. If your DNS provider supports it, certbot\nwill prompt you through the process." \
            13 64 "${CERT_EMAIL:-admin@${DOMAIN}}" \
            3>&1 1>&2 2>&3)
        STATUS=$?
        set -e

        if [ $STATUS -ne 0 ]; then
            CERT_EMAIL_INPUT="admin@${DOMAIN}"
        fi
        CERT_EMAIL="${CERT_EMAIL_INPUT:-admin@${DOMAIN}}"

        info "Stopping Nginx briefly so certbot can use port 80..."
        sudo systemctl stop nginx

        # Issue cert for root domain and www — wildcard subdomains use the same cert
        # if your DNS provider supports ACME DNS-01; otherwise a separate wildcard
        # cert can be issued via: certbot certonly --manual --preferred-challenges dns
        info "Running certbot for ${DOMAIN} and www.${DOMAIN}..."
        sudo certbot certonly --standalone \
            -d "${DOMAIN}" -d "www.${DOMAIN}" \
            --non-interactive --agree-tos -m "${CERT_EMAIL}" || true

        sudo systemctl start nginx
        info "Nginx restarted."

        for CANDIDATE in \
            "/etc/letsencrypt/live/${DOMAIN}" \
            "/etc/letsencrypt/live/${DOMAIN}-0001" \
            "/etc/letsencrypt/live/${DOMAIN}-0002" \
            "/etc/letsencrypt/live/${DOMAIN}-0003"; do
            if [ -f "${CANDIDATE}/fullchain.pem" ] && [ -s "${CANDIDATE}/fullchain.pem" ] \
                && [ -f "${CANDIDATE}/privkey.pem" ] && [ -s "${CANDIDATE}/privkey.pem" ]; then
                CERT_BASE="$CANDIDATE"
                success "SSL certificate validated: ${CANDIDATE}"
                break
            fi
        done
        [ -z "$CERT_BASE" ] && error "SSL certificate validation failed for ${DOMAIN}."
        success "SSL certificate obtained at ${CERT_BASE}/"
    else
        info "Reusing existing certificate at ${CERT_BASE}/"
    fi

    # ── Ensure ssl-dhparams.pem exists (needed by Nginx config) ─────────────
    if [ ! -f /etc/letsencrypt/ssl-dhparams.pem ]; then
        info "Generating Diffie-Hellman parameters (ssl-dhparams.pem)..."
        sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048 2>/dev/null
        success "ssl-dhparams.pem generated."
    else
        info "ssl-dhparams.pem already exists — skipping."
    fi

    # ── Ensure options-ssl-nginx.conf exists (written by certbot-nginx pkg) ──
    if [ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]; then
        info "Creating options-ssl-nginx.conf (certbot-nginx package file missing)..."
        sudo tee /etc/letsencrypt/options-ssl-nginx.conf > /dev/null <<SSLOPT
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384";
SSLOPT
        success "options-ssl-nginx.conf created."
    fi

    # ── Write booking.conf ───────────────────────────────────────────────────
    local NGINX_SITE="/etc/nginx/sites-available/booking.conf"
    # Remove existing config before writing so no stale blocks survive.
    sudo rm -f "${NGINX_SITE}" "/etc/nginx/sites-enabled/booking.conf"
    sudo tee "${NGINX_SITE}" > /dev/null <<NGINXEOF
# =============================================================================
#  booking.conf  –  Certxa Booking Platform  –  auto-generated by setup.sh
#
#  www.${DOMAIN} is redirected to ${DOMAIN} (non-www canonical).
#  CORS is handled entirely by the Express app — do NOT add
#  Access-Control-Allow-* headers here.
# =============================================================================

# ── HTTP → HTTPS redirect ─────────────────────────────────────────────────────
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    return 301 https://\$host\$request_uri;
}

# ── Redirect www → non-www HTTPS ─────────────────────────────────────────────
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name www.${DOMAIN};

    ssl_certificate     ${CERT_BASE}/fullchain.pem;
    ssl_certificate_key ${CERT_BASE}/privkey.pem;
    ssl_trusted_certificate ${CERT_BASE}/chain.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    # OCSP stapling — resolver needed to look up OCSP endpoint
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    return 301 https://${DOMAIN}\$request_uri;
}

# ── Main HTTPS server ─────────────────────────────────────────────────────────
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;

    # Root domain only — www is permanently redirected above
    server_name ${DOMAIN};

    client_max_body_size 50M;

    # ── SSL ──────────────────────────────────────────────────────────────────
    ssl_certificate     ${CERT_BASE}/fullchain.pem;
    ssl_certificate_key ${CERT_BASE}/privkey.pem;
    ssl_trusted_certificate ${CERT_BASE}/chain.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # OCSP stapling — resolver needed to look up OCSP endpoint
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # ── Security headers ─────────────────────────────────────────────────────
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    # ── Auth routes (regex — takes priority over /api/ prefix below) ──────────
    # Must be listed as a regex so it wins over the /api/ prefix block.
    # Ensures Google OAuth callbacks receive full cookie passthrough and
    # correct forwarded headers for session handling.
    location ~ ^/api/auth/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host  \$host;

        proxy_read_timeout 30s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;

        proxy_buffering off;
        proxy_pass_header Set-Cookie;
    }

    # ── API routes ───────────────────────────────────────────────────────────
    # proxy_buffering off keeps streaming/SSE responses flowing.
    # proxy_pass_header Set-Cookie passes session cookies to the client.
    location /api/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host  \$host;

        proxy_read_timeout 60s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;

        proxy_buffering off;
        proxy_pass_header Set-Cookie;
    }

    # ── WebSocket ────────────────────────────────────────────────────────────
    location /ws {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host  \$host;

        proxy_read_timeout 86400s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 86400s;
    }

    # ── Static uploaded assets ────────────────────────────────────────────────
    # Served by the Express app; Cache-Control tells browsers to cache for 7d.
    location /uploads/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        add_header Cache-Control "public, max-age=604800";
    }

    # ── Catch-all — SPA + booking pages ──────────────────────────────────────
    # Passes all other requests (React SPA, booking widget, etc.) to the app.
    # WebSocket upgrade headers included so any stray WS upgrade is handled.
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;

        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # Lets Express read the original hostname (e.g. salon.${DOMAIN})
        # and resolve the booking store slug via the subdomain middleware.
        proxy_set_header X-Forwarded-Host  \$host;

        proxy_read_timeout 30s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 30s;

        proxy_pass_header Set-Cookie;
    }

    # ── Logs ─────────────────────────────────────────────────────────────────
    access_log /var/log/nginx/booking_access.log;
    error_log  /var/log/nginx/booking_error.log warn;
}
NGINXEOF

    sudo ln -sf "${NGINX_SITE}" "/etc/nginx/sites-enabled/booking.conf"

    info "Testing nginx configuration..."
    sudo nginx -t || error "Nginx config test failed — check output above and re-run Step 10."

    if ! sudo systemctl is-active --quiet nginx; then
        sudo systemctl start nginx
    fi
    sudo systemctl reload nginx
    sudo systemctl enable certbot.timer 2>/dev/null || true
    success "Nginx configured and reloaded — booking.conf active."
}

# ── Diagnose / Fix 502 Bad Gateway ───────────────────────────────────────────
do_diagnose() {
    hdr "Diagnosing 502 / static-asset errors"

    local ISSUES=()
    local FIXES=()

    # ── 1. Check dist/index.cjs (server bundle) ──────────────────────────────
    if [ ! -f "${APP_DIR}/dist/index.cjs" ]; then
        ISSUES+=("✗ dist/index.cjs NOT FOUND — production build is missing")
        FIXES+=("Run Step 9 (Production build) to create it")
    else
        success "dist/index.cjs exists"
    fi

    # ── 2. Check dist/public/index.html (frontend build) ─────────────────────
    if [ ! -f "${APP_DIR}/dist/public/index.html" ]; then
        ISSUES+=("✗ dist/public/index.html NOT FOUND — frontend build is missing")
        FIXES+=("Run Step 9 (Production build) to create it")
    else
        success "dist/public/index.html exists"
    fi

    # ── 3. Check dist/public/assets/ (CSS/JS assets) ─────────────────────────
    local ASSET_COUNT
    ASSET_COUNT=$(find "${APP_DIR}/dist/public/assets" -type f 2>/dev/null | wc -l)
    if [ "${ASSET_COUNT:-0}" -eq 0 ]; then
        ISSUES+=("✗ dist/public/assets/ is empty or missing — CSS/JS assets not built")
        FIXES+=("Run Step 9 (Production build) to rebuild the frontend")
    else
        success "dist/public/assets/ has ${ASSET_COUNT} file(s)"
    fi

    # ── 4. Check PM2 status ───────────────────────────────────────────────────
    if ! command -v pm2 &>/dev/null; then
        ISSUES+=("✗ PM2 not installed")
        FIXES+=("Run Step 2 (System packages) to install PM2")
    else
        local PM2_STATUS
        PM2_STATUS=$(pm2 list 2>/dev/null | grep "${SERVICE_NAME}" | awk '{print $10}' || echo "not found")
        if echo "$PM2_STATUS" | grep -q "online"; then
            success "PM2 process '${SERVICE_NAME}' is online"
        elif pm2 list 2>/dev/null | grep -q "${SERVICE_NAME}"; then
            ISSUES+=("✗ PM2 process '${SERVICE_NAME}' is NOT online (status: ${PM2_STATUS})")
            FIXES+=("Check PM2 logs: pm2 logs ${SERVICE_NAME} --lines 50")
            FIXES+=("Then re-run Step 10 to restart PM2")
        else
            ISSUES+=("✗ PM2 process '${SERVICE_NAME}' does not exist")
            FIXES+=("Run Step 10 to start it with PM2")
        fi
    fi

    # ── 5. Detect what port the app is actually listening on ──────────────────
    local ACTUAL_PORT=""
    if command -v ss &>/dev/null; then
        ACTUAL_PORT=$(ss -tlnp 2>/dev/null | awk '/node/{print $4}' | grep -oP ':\d+$' | tr -d ':' | head -1 || true)
    fi
    if [ -n "${ACTUAL_PORT:-}" ]; then
        success "App appears to be listening on port ${ACTUAL_PORT}"
        if [ "${ACTUAL_PORT}" != "${APP_PORT}" ]; then
            ISSUES+=("✗ App is on port ${ACTUAL_PORT} but this script is configured for port ${APP_PORT}")
            FIXES+=("Use option 2 (Configuration Variables) to update APP_PORT to ${ACTUAL_PORT}, then re-run Step 10")
        fi
    else
        warn "Could not detect which port the app is listening on (it may not be running)"
    fi

    # ── 6. Check Nginx config port vs APP_PORT ────────────────────────────────
    local NGINX_CONF="/etc/nginx/sites-available/booking.conf"
    if [ -f "${NGINX_CONF}" ]; then
        local NGINX_PORT
        NGINX_PORT=$(grep -oP '(?<=proxy_pass http://127\.0\.0\.1:)\d+' "${NGINX_CONF}" | head -1 || echo "")
        if [ -n "${NGINX_PORT:-}" ]; then
            success "Nginx booking.conf proxies to port ${NGINX_PORT}"
            if [ "${NGINX_PORT}" != "${APP_PORT}" ]; then
                ISSUES+=("✗ PORT MISMATCH: Nginx proxies to ${NGINX_PORT} but APP_PORT is ${APP_PORT}")
                FIXES+=("Re-run Step 10 to regenerate booking.conf with the correct port (${APP_PORT})")
            fi
        fi
        
        # Check for www to non-www redirect
        if ! grep -q "server_name www\.${DOMAIN}" "${NGINX_CONF}"; then
            ISSUES+=("✗ Nginx config missing www.${DOMAIN} server block")
            FIXES+=("Re-run Step 10 to regenerate booking.conf with www redirect")
        elif ! grep -q "return 301 https://${DOMAIN}" "${NGINX_CONF}"; then
            ISSUES+=("✗ Nginx config missing www to non-www redirect")
            FIXES+=("Re-run Step 10 to regenerate booking.conf with www redirect")
        else
            success "www to non-www redirect is configured"
        fi
        
        # Check HTTP redirect covers wildcard subdomains
        if ! grep -qE "server_name.*\*\.${DOMAIN}" "${NGINX_CONF}"; then
            ISSUES+=("✗ HTTP→HTTPS redirect does not cover *.${DOMAIN} — booking subdomain HTTP requests won't redirect")
            FIXES+=("Re-run Step 10 to regenerate booking.conf with wildcard HTTP redirect")
        else
            success "HTTP redirect covers *.${DOMAIN} (booking subdomains)"
        fi
    else
        ISSUES+=("✗ /etc/nginx/sites-available/booking.conf not found")
        FIXES+=("Run Step 10 to generate and install the Nginx config")
    fi

    # ── 7. Check .env has required keys ──────────────────────────────────────
    if [ ! -f "${APP_DIR}/.env" ]; then
        ISSUES+=("✗ .env file not found")
        FIXES+=("Run Step 6 (.env configuration) to create it")
    else
        for KEY in DATABASE_URL NODE_ENV PORT SESSION_SECRET; do
            if ! grep -q "^${KEY}=" "${APP_DIR}/.env" 2>/dev/null; then
                ISSUES+=("✗ .env is missing: ${KEY}")
                FIXES+=("Run Step 6 (.env configuration) to set ${KEY}")
            fi
        done
        local ENV_NODE
        ENV_NODE=$(grep "^NODE_ENV=" "${APP_DIR}/.env" | cut -d= -f2-)
        if [ "${ENV_NODE}" != "production" ]; then
            ISSUES+=("✗ NODE_ENV in .env is '${ENV_NODE}' — must be 'production'")
            FIXES+=("Run Step 6 to set NODE_ENV=production")
        fi
        
        # Check CORS_ORIGINS includes both domain and www.domain
        local CORS_ORIGINS
        CORS_ORIGINS=$(grep "^CORS_ORIGINS=" "${APP_DIR}/.env" | cut -d= -f2-)
        if [ -n "${CORS_ORIGINS:-}" ]; then
            if [[ "${CORS_ORIGINS}" != *"https://${DOMAIN}"* ]]; then
                ISSUES+=("✗ CORS_ORIGINS missing https://${DOMAIN}")
                FIXES+=("Run Step 6 to update CORS_ORIGINS")
            fi
            if [[ "${CORS_ORIGINS}" != *"https://www.${DOMAIN}"* ]]; then
                ISSUES+=("✗ CORS_ORIGINS missing https://www.${DOMAIN}")
                FIXES+=("Run Step 6 to update CORS_ORIGINS")
            fi
        else
            ISSUES+=("✗ .env is missing: CORS_ORIGINS")
            FIXES+=("Run Step 6 (.env configuration) to set CORS_ORIGINS")
        fi
    fi

    # ── 8. Check sessions table exists ───────────────────────────────────────
    if [ -f "${APP_DIR}/.env" ] && grep -q "^DATABASE_URL=" "${APP_DIR}/.env"; then
        local DIAG_DB_URL
        DIAG_DB_URL=$(grep "^DATABASE_URL=" "${APP_DIR}/.env" | head -1 | cut -d= -f2-)
        local SESS_CHECK
        SESS_CHECK=$(psql "${DIAG_DB_URL}" -tAc \
            "SELECT COUNT(*) FROM information_schema.tables
             WHERE table_schema='public' AND table_name='sessions';" 2>/dev/null || echo "0")
        if [[ "${SESS_CHECK:-0}" == "0" ]]; then
            ISSUES+=("✗ 'sessions' table missing — all logins will fail (relation does not exist)")
            FIXES+=("Re-run Step 8 (Database schema) to create the sessions table")
        else
            success "sessions table exists (express-session store)"
        fi
    fi

    # ── 9. Check Nginx is running ─────────────────────────────────────────────
    if ! sudo systemctl is-active --quiet nginx 2>/dev/null; then
        ISSUES+=("✗ Nginx is NOT running")
        FIXES+=("sudo systemctl start nginx && sudo systemctl enable nginx")
    else
        success "Nginx is running"
    fi

    # ── Print summary ─────────────────────────────────────────────────────────
    echo ""
    if [ ${#ISSUES[@]} -eq 0 ]; then
        echo -e "${GREEN}${BOLD}All checks passed!${RESET}"
        echo ""
        echo "If you still see 502 or missing assets, try:"
        echo "  1. Pull the latest code and re-run Step 9 (rebuild)"
        echo "  2. Re-run Step 10 (restart PM2 + Nginx)"
        echo "  3. Check PM2 logs: pm2 logs ${SERVICE_NAME} --lines 50"
        echo "  4. Check Nginx error log: sudo tail -40 /var/log/nginx/booking_error.log"
    else
        echo -e "${RED}${BOLD}Found ${#ISSUES[@]} issue(s):${RESET}"
        echo ""
        for ISSUE in "${ISSUES[@]}"; do
            echo -e "  ${RED}${ISSUE}${RESET}"
        done
        echo ""
        echo -e "${YELLOW}${BOLD}Suggested fixes:${RESET}"
        for FIX in "${FIXES[@]}"; do
            echo -e "  → ${FIX}"
        done
        echo ""
        echo -e "${YELLOW}Useful debug commands:${RESET}"
        echo "  pm2 logs ${SERVICE_NAME} --lines 50"
        echo "  pm2 list"
        echo "  sudo tail -40 /var/log/nginx/booking_error.log"
        echo "  sudo nginx -t"
        echo "  ls -la ${APP_DIR}/dist/public/assets/ 2>/dev/null | head -20"
    fi

    echo ""
    read -r -p "Press Enter to return to the menu..."
}

# ─── RUN FROM A GIVEN STEP ────────────────────────────────────────────────────
run_from() {
    local FROM="$1"
    (( FROM <= 1  )) && do_step_1
    (( FROM <= 2  )) && do_step_2
    (( FROM <= 3  )) && do_step_3
    (( FROM <= 4  )) && do_step_4
    (( FROM <= 5  )) && do_step_5
    (( FROM <= 6  )) && do_step_6
    (( FROM <= 7  )) && do_step_7
    (( FROM <= 8  )) && do_step_8
    (( FROM <= 9  )) && do_step_9
    (( FROM <= 10 )) && do_step_10

    echo ""
    echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${RESET}"
    echo -e "${BOLD}${GREEN}  Setup complete!${RESET}"
    echo ""
    echo -e "  ${BOLD}Site      :${RESET} ${CYAN}https://${DOMAIN}${RESET}"
    echo -e "  ${BOLD}Login     :${RESET} https://${DOMAIN}/login"
    echo -e "  ${BOLD}Admin     :${RESET} https://${DOMAIN}/isadmin"
    echo -e "  ${BOLD}Database  :${RESET} ${DB_NAME}  (user: ${DB_USER})"
    echo -e "  ${BOLD}Service   :${RESET} ${SERVICE_NAME}  (PM2)"
    echo -e "  ${BOLD}Nginx     :${RESET} /etc/nginx/sites-available/booking.conf"
    echo ""
    echo -e "  ${BOLD}Useful commands:${RESET}"
    echo -e "    App logs  : pm2 logs ${SERVICE_NAME} -f"
    echo -e "    Restart   : pm2 restart ${SERVICE_NAME}"
    echo -e "    PM2 list  : pm2 list"
    echo -e "    Nginx log : sudo tail -f /var/log/nginx/booking_error.log"
    echo -e "    Firewall  : sudo ufw status"
    echo ""
    echo -e "  ${BOLD}${YELLOW}Fill in your API keys in .env then restart:${RESET}"
    echo -e "    nano ${APP_DIR}/.env"
    echo ""
    echo -e "    GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET"
    echo -e "    MAILGUN_API_KEY / MAILGUN_DOMAIN / MAILGUN_FROM_EMAIL"
    echo -e "    TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER"
    echo -e "    TEXTBELT_API_KEY"
    echo -e "    STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET"
    echo ""
    echo -e "    pm2 restart ${SERVICE_NAME}"
    echo -e "${BOLD}${GREEN}════════════════════════════════════════════════${RESET}"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN EXECUTION
# ═══════════════════════════════════════════════════════════════════════════════

ensure_whiptail
load_config
show_disclaimer
check_apache
prompt_domain
prompt_port

# Unattended mode — skip menu and run everything
if [ "$AUTO_YES" = true ]; then
    info "Running all steps unattended (--yes flag set)."
    run_from 1
    exit 0
fi

# Interactive whiptail menu loop
while true; do
    show_menu
done
