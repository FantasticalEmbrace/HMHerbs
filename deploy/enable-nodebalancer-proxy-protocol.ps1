# Enable PROXY protocol on Miami NodeBalancer HTTPS (TCP) port so nginx sees real client IPs.
param(
    [int]$NodeBalancerId = 2342813,
    [int]$ConfigId = 3533683,
    [string]$TokenFile = "$PSScriptRoot\.linode-token"
)

$token = $env:LINODE_TOKEN
if (-not $token -and (Test-Path $TokenFile)) {
    $token = (Get-Content $TokenFile -Raw).Trim()
}
if (-not $token) {
    throw "Set LINODE_TOKEN or create deploy/.linode-token"
}

$body = '{"proxy_protocol":"v1"}'
$url = "https://api.linode.com/v4/nodebalancers/$NodeBalancerId/configs/$ConfigId"

Write-Host "Updating NodeBalancer config $ConfigId (port 443) -> proxy_protocol v1 ..."
$response = curl.exe -s -X PUT $url `
    -H "Authorization: Bearer $token" `
    -H "Content-Type: application/json" `
    -d $body

Write-Host $response
if ($response -notmatch '"proxy_protocol"\s*:\s*"v1"') {
    throw "NodeBalancer update may have failed. Check response above."
}
Write-Host "OK. Real client IPs should flow after nginx reload and pm2 restart."
