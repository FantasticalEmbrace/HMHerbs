"""Redirect /pos on store servers to the dedicated POS platform domain."""
import re
from pathlib import Path

REDIRECT = """
    # Business One Web POS — dedicated platform (not hosted on store servers)
    location = /pos {
        return 301 https://pos.businessonecomprehensive.com/;
    }

    location ^~ /pos/ {
        return 301 https://pos.businessonecomprehensive.com/;
    }
"""

site = Path("/etc/nginx/sites-enabled/hmherbs")
text = site.read_text(encoding="utf-8")

# Remove old proxy or 404 block
text = re.sub(
    r"\n\s*# Business One POS[^\n]*\n(?:\s*location[^\n]+\n(?:\s*[^\n]+\n)*?)+",
    "\n",
    text,
    count=1,
)

if "pos.businessonecomprehensive.com" in text and "location = /pos" in text:
    print("already patched")
else:
    marker = "    location / {"
    if marker not in text:
        raise SystemExit("could not find location / block")
    text = text.replace(marker, REDIRECT + "\n" + marker, 1)
    site.write_text(text, encoding="utf-8")
    print("patched")
