# Deploy Web Frontend - PowerShell script for Windows
# Builds the Expo web app and deploys it to S3 + CloudFront
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TfDir     = Join-Path $ScriptDir "terraform"
$AppDir    = Resolve-Path (Join-Path $ScriptDir "..\EbayLister")
$DistDir   = Join-Path $AppDir "dist"
$AwsCli    = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"

# Find terraform
$TerraformPath = Get-Command terraform -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Source
if (-not $TerraformPath) {
    $TerraformPath = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Hashicorp.Terraform_*\terraform.exe" |
        Select-Object -First 1 -ExpandProperty FullName
}

Write-Host "Reading Terraform outputs..." -ForegroundColor Cyan
Push-Location $TfDir
$Bucket         = & $TerraformPath output -raw frontend_bucket
$DistributionId = & $TerraformPath output -raw frontend_distribution_id
Pop-Location

if (-not $Bucket) {
    Write-Error "frontend_bucket output is empty — did you set frontend_domain in terraform.tfvars and run terraform apply?"
    exit 1
}

Write-Host "  Bucket          : $Bucket"
Write-Host "  Distribution ID : $DistributionId"

# Build Expo web app
Write-Host "Building Expo web app..." -ForegroundColor Cyan
Push-Location $AppDir
& npx expo export --platform web
$buildExit = $LASTEXITCODE
Pop-Location

if ($buildExit -ne 0) {
    Write-Error "expo export failed (exit $buildExit)"
    exit 1
}

if (-not (Test-Path $DistDir)) {
    Write-Error "dist/ not found after build — something went wrong with expo export"
    exit 1
}

# Sync to S3
Write-Host "Syncing to S3..." -ForegroundColor Cyan

# HTML files — short cache so deploys take effect quickly
& $AwsCli s3 sync $DistDir "s3://$Bucket" `
    --exclude "*" --include "*.html" `
    --cache-control "public, max-age=60, s-maxage=300" `
    --delete

# JS/CSS/images — long cache (Expo fingerprints filenames)
& $AwsCli s3 sync $DistDir "s3://$Bucket" `
    --exclude "*.html" `
    --cache-control "public, max-age=31536000, immutable" `
    --delete

Write-Host "  Sync complete."

# CloudFront invalidation
if ($DistributionId) {
    Write-Host "Invalidating CloudFront cache..." -ForegroundColor Cyan
    $inv = & $AwsCli cloudfront create-invalidation `
        --distribution-id $DistributionId `
        --paths "/*" `
        --output json | ConvertFrom-Json
    Write-Host "  Invalidation ID : $($inv.Invalidation.Id)"
    Write-Host "  Status          : $($inv.Invalidation.Status)"
}

Write-Host ""
Write-Host "Deploy complete!" -ForegroundColor Green
Write-Host "  https://app.ebaylister.who-is-tou.com"
