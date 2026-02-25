# EbayLister — AWS Infrastructure

Deploys the Express.js OAuth backend to **ECS Fargate** using Terraform.

## What Gets Created

| Resource | Purpose |
|---|---|
| VPC + subnets | Isolated network (public ALB, private ECS + Redis) |
| Application Load Balancer | Public HTTPS entry point |
| ACM Certificate | TLS for your domain (DNS-validated) |
| ECS Cluster + Service | Runs the containerized Express backend |
| ECR Repository | Stores Docker images |
| ElastiCache Redis | Token storage (replaces in-memory variables) |
| Secrets Manager | Stores eBay credentials securely |
| CloudWatch Log Group | Backend logs (30-day retention) |
| IAM Roles | Least-privilege task execution and task roles |

---

## Prerequisites

- [Terraform >= 1.5](https://developer.hashicorp.com/terraform/install)
- [AWS CLI](https://aws.amazon.com/cli/) configured with credentials
- [Docker](https://www.docker.com/) (for building and pushing the image)
- A domain name you control (required for HTTPS — eBay OAuth won't work without it)

---

## One-Time Setup

### 1. Create Terraform state storage

```bash
aws s3 mb s3://ebay-lister-terraform-state --region us-east-1
aws dynamodb create-table \
  --table-name ebay-lister-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

Update the bucket name in [terraform/main.tf](terraform/main.tf) if you used a different name.

### 2. Create a `terraform.tfvars` file

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values:

```hcl
environment    = "production"
domain_name    = "api.yourdomain.com"
ebay_environment = "production"

ebay_sandbox_client_id        = "your-sandbox-client-id"
ebay_sandbox_client_secret    = "your-sandbox-client-secret"
ebay_production_client_id     = "your-production-client-id"
ebay_production_client_secret = "your-production-client-secret"
```

> **Note:** `terraform.tfvars` is gitignored. Never commit credentials.

---

## Deploy

```bash
cd terraform

terraform init
terraform plan
terraform apply
```

After `apply`, Terraform will output:

- `redirect_uri` — register this in your eBay Developer Portal
- `alb_dns_name` — set up a CNAME record pointing your domain here
- `ecr_push_commands` — commands to push your Docker image
- `acm_validation_records` — DNS records to add for certificate validation

### 3. Validate the ACM certificate

Add the CNAME records from `acm_validation_records` to your DNS provider. This must complete before the HTTPS listener can serve traffic.

### 4. Build and push the Docker image

Run the commands from the `ecr_push_commands` output, or manually:

```bash
# From the EbayLister/ directory
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <ecr-repo-url>

docker build -f ../aws-infrastructure/docker/Dockerfile -t ebay-lister-backend .
docker tag ebay-lister-backend:latest <ecr-repo-url>:latest
docker push <ecr-repo-url>:latest
```

### 5. Update the eBay Developer Portal

Set your app's OAuth redirect URI to the value of `redirect_uri` from Terraform outputs:

```
https://api.yourdomain.com/auth/ebay/callback
```

---

## Updating the Backend

To deploy a new version of the server:

```bash
# Build and push new image (from EbayLister/ directory)
docker build -f ../aws-infrastructure/docker/Dockerfile -t ebay-lister-backend .
docker tag ebay-lister-backend:latest <ecr-repo-url>:latest
docker push <ecr-repo-url>:latest

# Force ECS to pull and run the new image
aws ecs update-service \
  --cluster ebay-lister-production \
  --service ebay-lister-backend-production \
  --force-new-deployment \
  --region us-east-1
```

---

## TODO: Backend Code Changes Required

Before deploying, the Express server needs two updates:

1. **Replace in-memory token storage with Redis**
   - Install `ioredis`: `npm install ioredis`
   - Replace the `userAccessToken`, `refreshToken`, `tokenExpiry` variables in `server/index.js` with Redis reads/writes using `process.env.REDIS_URL`

2. **Replace hardcoded `localhost:3001`** in `App.tsx` with your production domain (via an environment variable like `EXPO_PUBLIC_API_URL`)

---

## Tear Down

```bash
cd terraform
terraform destroy
```

> This will delete all resources including the ECR repo and its images.
