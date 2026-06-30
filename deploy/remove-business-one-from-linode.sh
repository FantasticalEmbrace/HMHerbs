#!/bin/bash
# Remove Business One platform/marketing files from HM Herbs Linode (merchant site only).
set -euo pipefail
APP=/var/www/hmherbs
cd "$APP"

rm -f business-one-menu.html business-one-menu.css business-one-menu.js
rm -f business-one-privacy-policy.html
rm -f signup.html platform-support.html support-viewer.html
rm -f css/pos-signup.css css/business-one-support-desk.css
rm -f js/pos-signup.js
rm -rf support-desk business-one-support-agent images/business-one
rm -f BUSINESS_ONE_MENU_README.md

echo "Removed Business One files from $APP"
ls -1 *.html 2>/dev/null | wc -l
echo "html files remaining"
