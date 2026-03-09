#!/bin/bash
# Scrapling skill post-load hook
# Installs/updates common web scraping dependencies when skill is loaded

if [ -d "/workspace/group" ]; then
    echo "Setting up web scraping tools..."

    # Install requests + BeautifulSoup4 (most reliable, recommended)
    echo "- Installing/updating requests + BeautifulSoup4..."
    python3 -m pip install -q requests beautifulsoup4 2>/dev/null || python3 -m pip install requests beautifulsoup4

    # Try installing Scrapling (optional, advanced)
    echo "- Installing Scrapling (optional)..."
    python3 -m pip install -q scrapling 2>/dev/null || true

    # Verify installation
    echo ""
    echo "=== Installation Summary ==="
    if python3 -c "import requests, bs4" 2>/dev/null; then
        echo "[OK] requests + BeautifulSoup4 installed (recommended)"
    else
        echo "[FAIL] requests + BeautifulSoup4 failed to install"
    fi

    if python3 -c "import scrapling" 2>/dev/null; then
        echo "[OK] Scrapling installed (advanced)"
    else
        echo "[SKIP] Scrapling not installed (optional)"
    fi
    echo "==========================="
fi
