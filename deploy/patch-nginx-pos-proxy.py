"""Route /pos to Node (serves sibling business-one-pos repo). Removes any prior /pos 404 block."""
import re
from pathlib import Path

PROXY = """
    location /pos/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /pos {
        return 301 /pos/;
    }
"""

site = Path("/etc/nginx/sites-enabled/hmherbs")
text = site.read_text(encoding="utf-8")

# Remove old 404 block if present
text = re.sub(
    r"\n\s*# Business One POS register UI is not hosted on this site\n\s*location \^~ /pos \{[^}]+\}\n?",
    "\n",
    text,
    count=1,
)

if "location /pos/" in text and "proxy_pass http://127.0.0.1:3001" in text:
    print("already patched")
else:
    marker = "    location / {"
    if marker not in text:
        raise SystemExit("could not find location / block in nginx config")
    text = text.replace(marker, PROXY + "\n" + marker, 1)
    site.write_text(text, encoding="utf-8")
    print("patched")
