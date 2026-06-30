from pathlib import Path

site = Path("/etc/nginx/sites-enabled/hmherbs")
text = site.read_text(encoding="utf-8")

if "listen 443 ssl default_server proxy_protocol" not in text:
    text = text.replace(
        "listen 443 ssl default_server;",
        "listen 443 ssl default_server proxy_protocol;",
        1,
    )
    text = text.replace(
        "listen [::]:443 ssl default_server;",
        "listen [::]:443 ssl default_server proxy_protocol;",
        1,
    )

if "real_ip_header proxy_protocol" not in text:
    text = text.replace(
        "real_ip_header X-Forwarded-For;",
        "real_ip_header proxy_protocol;",
        1,
    )

if "set_real_ip_from 10.0.0.0/24" not in text:
    text = text.replace(
        "set_real_ip_from 192.168.255.0/24;",
        "set_real_ip_from 192.168.255.0/24;\n    set_real_ip_from 10.0.0.0/24;",
        1,
    )

site.write_text(text, encoding="utf-8")
print("patched")
