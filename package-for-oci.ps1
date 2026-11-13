<#
.SYNOPSIS
    Packages Watch Together for Oracle Cloud Infrastructure (OCI) Deployment.
.DESCRIPTION
    Creates a clean watch-together-oci.tar.gz bundle excluding build artifacts,
    databases, media, and node_modules.
#>

param (
    [string]$OciHost = "" # e.g. "ubuntu@129.153.xx.xx"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host "🍿 Watch Together - OCI Packaging Utility" -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta

$archiveName = "watch-together-oci.tar.gz"

if (Test-Path $archiveName) {
    Remove-Item $archiveName -Force
}

Write-Host "[+] Creating clean bundle: $archiveName..." -ForegroundColor Cyan

# Use tar with exclusions
tar -czvf $archiveName `
    --exclude="node_modules" `
    --exclude="client/node_modules" `
    --exclude="client/dist" `
    --exclude="client/android" `
    --exclude="mobile" `
    --exclude=".dart_tool" `
    --exclude=".git" `
    --exclude=".gitnexus" `
    --exclude=".agents" `
    --exclude=".agent" `
    --exclude=".claude" `
    --exclude=".impeccable" `
    --exclude="client/.impeccable" `
    --exclude="downloads" `
    --exclude="downloads/**" `
    --exclude="downloads-local-test" `
    --exclude="data" `
    --exclude="data/**" `
    --exclude="data-local-test" `
    --exclude="*.apk" `
    --exclude="*.tar.gz" `
    --exclude="*.pem" `
    --exclude=".env" `
    .

$fileSizeMb = [math]::Round((Get-Item $archiveName).Length / 1MB, 2)
Write-Host "[+] Bundle created successfully: $archiveName ($fileSizeMb MB)" -ForegroundColor Green

if ($OciHost -ne "") {
    Write-Host "[+] Transferring to $OciHost..." -ForegroundColor Yellow
    scp -C $archiveName "${OciHost}:~/"
    Write-Host "[+] Transferred! Next, run on your OCI server:" -ForegroundColor Green
    Write-Host "    ssh $OciHost" -ForegroundColor White
    Write-Host "    mkdir -p watch-together && tar -xzvf watch-together-oci.tar.gz -C watch-together" -ForegroundColor White
    Write-Host "    cd watch-together && sudo ./deploy-oci.sh" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "Next Steps to Deploy to Oracle Cloud:" -ForegroundColor Yellow
    Write-Host "1. Transfer to your OCI instance:" -ForegroundColor White
    Write-Host "   scp -C watch-together-oci.tar.gz ubuntu@YOUR_OCI_IP:~/" -ForegroundColor Gray
    Write-Host "2. SSH into your instance:" -ForegroundColor White
    Write-Host "   ssh ubuntu@YOUR_OCI_IP" -ForegroundColor Gray
    Write-Host "3. Extract and launch:" -ForegroundColor White
    Write-Host "   mkdir -p watch-together && tar -xzvf watch-together-oci.tar.gz -C watch-together" -ForegroundColor Gray
    Write-Host "   cd watch-together && sudo ./deploy-oci.sh" -ForegroundColor Gray
    Write-Host "==========================================================" -ForegroundColor Magenta
}
