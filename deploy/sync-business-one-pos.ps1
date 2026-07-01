# Deprecated — POS UI no longer deploys beside HM Herbs.
# Use business-one-pos/deploy/sync-pos-linode.ps1 for the dedicated POS platform server.
Write-Host "Use: ..\business-one-pos\deploy\sync-pos-linode.ps1" -ForegroundColor Yellow
Write-Host "POS lives at https://pos.businessonecomprehensive.com (separate Linode), not /var/www/business-one-pos on the store server."
exit 1
