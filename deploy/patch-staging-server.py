#!/usr/bin/env python3
from pathlib import Path

p = Path("/var/www/hmherbs/backend/server.js")
text = p.read_text(encoding="utf-8")

if "trust proxy" not in text:
    text = text.replace(
        "const app = express();\nconst PORT",
        "const app = express();\napp.set('trust proxy', 1);\nconst PORT",
        1,
    )

old = "    'http://businessonecomprehensive.com'\n];"
new = """    'http://businessonecomprehensive.com',
    'http://172.238.208.164',
    'https://172.238.208.164',
    'http://172-238-208-164.sslip.io',
    'https://172-238-208-164.sslip.io',
    'http://go.hmherbs.com',
    'https://go.hmherbs.com'
];"""
if old in text:
    text = text.replace(old, new, 1)

if "validate: { trustProxy: true }" not in text:
    text = text.replace(
        "const limiter = rateLimit({",
        "const limiter = rateLimit({\n    validate: { trustProxy: true },",
        1,
    )
    text = text.replace(
        "const authLimiter = rateLimit({",
        "const authLimiter = rateLimit({\n    validate: { trustProxy: true },",
        1,
    )

p.write_text(text, encoding="utf-8")
print("ok")
