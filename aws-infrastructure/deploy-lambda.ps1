# Deploy Lambda - PowerShell script for Windows
$ErrorActionPreference = "Stop"

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$TfDir      = Join-Path $ScriptDir "terraform"
$AppDir     = Resolve-Path (Join-Path $ScriptDir "..\EbayLister")
$BuildDir   = Join-Path $env:TEMP "ebay-lister-lambda-build"
$ZipFile    = Join-Path $env:TEMP "ebay-lister-lambda.zip"

# Find terraform
$TerraformPath = Get-Command terraform -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty Source
if (-not $TerraformPath) {
    $TerraformPath = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Hashicorp.Terraform_*\terraform.exe" |
        Select-Object -First 1 -ExpandProperty FullName
}

Write-Host "Building Lambda package..." -ForegroundColor Cyan

Push-Location $TfDir
$FunctionName = & $TerraformPath output -raw lambda_function_name
$Region       = (& $TerraformPath output -raw api_gateway_url) -replace '.*execute-api\.([^.]+)\..*','$1'
Pop-Location

Write-Host "  Function : $FunctionName"
Write-Host "  Region   : $Region"

# Clean build dir
if (Test-Path $BuildDir) { Remove-Item $BuildDir -Recurse -Force }
New-Item -ItemType Directory -Path $BuildDir | Out-Null

# Copy server code
Write-Host "  Copying server code..."
Copy-Item (Join-Path $AppDir "server") $BuildDir -Recurse

# Create a minimal package.json with only server-side dependencies
Write-Host "  Installing server dependencies..."
$serverPackageJson = @{
    name    = "ebaylister-lambda"
    version = "1.0.0"
    dependencies = @{
        "express"             = "^5.1.0"
        "cors"                = "^2.8.5"
        "dotenv"              = "^17.2.3"
        "axios"               = "^1.13.2"
        "serverless-http"     = "^3.2.0"
        "@aws-sdk/client-dynamodb" = "^3.0.0"
    }
} | ConvertTo-Json -Depth 3

$serverPackageJson | Out-File -FilePath (Join-Path $BuildDir "package.json") -Encoding utf8

Push-Location $BuildDir
& npm install --omit=dev 2>&1 | ForEach-Object { Write-Host "    $_" }
Pop-Location

# Zip using .NET (faster than Compress-Archive for large dirs)
Write-Host "  Zipping..."
if (Test-Path $ZipFile) { Remove-Item $ZipFile -Force }
Add-Type -Assembly "System.IO.Compression.FileSystem"
[System.IO.Compression.ZipFile]::CreateFromDirectory($BuildDir, $ZipFile)

$SizeMB = [math]::Round((Get-Item $ZipFile).Length / 1MB, 2)
Write-Host "  Package  : $SizeMB MB"

# Deploy
Write-Host "Deploying to Lambda..." -ForegroundColor Cyan
$AwsCli = "C:\Program Files\Amazon\AWSCLIV2\aws.exe"
$result = & $AwsCli lambda update-function-code `
    --function-name $FunctionName `
    --zip-file "fileb://$ZipFile" `
    --region $Region `
    --output json | ConvertFrom-Json

Write-Host "  FunctionName : $($result.FunctionName)"
Write-Host "  CodeSize     : $([math]::Round($result.CodeSize/1MB,2)) MB"
Write-Host "  LastModified : $($result.LastModified)"

Write-Host ""
Write-Host "Deploy complete!" -ForegroundColor Green
Write-Host "  https://api.ebay.who-is-tou.com/health"

# Cleanup
Remove-Item $BuildDir -Recurse -Force
