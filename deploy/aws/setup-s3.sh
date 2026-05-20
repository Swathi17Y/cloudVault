#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# CloudVault — AWS S3 Bucket Setup Script
# Prerequisites: AWS CLI configured with admin-level credentials
# Usage: chmod +x setup-s3.sh && ./setup-s3.sh
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

BUCKET_NAME="cloudvault-storage-prod"
REGION="${AWS_REGION:-us-east-1}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

CYAN='\033[0;36m'
GREEN='\033[0;32m'
NC='\033[0m'

log() { echo -e "${CYAN}[S3 Setup]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }

# ── Create Bucket ──────────────────────────────────────────────────────────────
log "Creating S3 bucket: ${BUCKET_NAME} in ${REGION}..."
if [ "$REGION" = "us-east-1" ]; then
  aws s3api create-bucket \
    --bucket "${BUCKET_NAME}" \
    --region "${REGION}"
else
  aws s3api create-bucket \
    --bucket "${BUCKET_NAME}" \
    --region "${REGION}" \
    --create-bucket-configuration LocationConstraint="${REGION}"
fi
success "Bucket created"

# ── Block All Public Access ──────────────────────────────────────────────────
log "Blocking all public access..."
aws s3api put-public-access-block \
  --bucket "${BUCKET_NAME}" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
success "Public access blocked"

# ── Enable Default Encryption (AES-256) ──────────────────────────────────────
log "Enabling server-side encryption..."
aws s3api put-bucket-encryption \
  --bucket "${BUCKET_NAME}" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      },
      "BucketKeyEnabled": true
    }]
  }'
success "SSE-S3 encryption enabled"

# ── Enable Versioning ────────────────────────────────────────────────────────
log "Enabling bucket versioning..."
aws s3api put-bucket-versioning \
  --bucket "${BUCKET_NAME}" \
  --versioning-configuration Status=Enabled
success "Versioning enabled"

# ── Lifecycle Rules (cleanup incomplete uploads + old versions) ───────────────
log "Setting lifecycle rules..."
aws s3api put-bucket-lifecycle-configuration \
  --bucket "${BUCKET_NAME}" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "AbortIncompleteMultipartUploads",
        "Status": "Enabled",
        "Filter": {},
        "AbortIncompleteMultipartUpload": {
          "DaysAfterInitiation": 3
        }
      },
      {
        "ID": "CleanupOldVersions",
        "Status": "Enabled",
        "Filter": {},
        "NoncurrentVersionExpiration": {
          "NoncurrentDays": 30
        }
      },
      {
        "ID": "TransitionToIA",
        "Status": "Enabled",
        "Filter": {
          "Prefix": ""
        },
        "Transitions": [
          {
            "Days": 90,
            "StorageClass": "STANDARD_IA"
          }
        ]
      }
    ]
  }'
success "Lifecycle rules configured"

# ── Apply Bucket Policy ──────────────────────────────────────────────────────
log "Applying bucket policy..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
POLICY_FILE="${SCRIPT_DIR}/s3-bucket-policy.json"

# Replace placeholder with actual account ID
sed "s/YOUR_AWS_ACCOUNT_ID/${ACCOUNT_ID}/g" "${POLICY_FILE}" > /tmp/cloudvault-bucket-policy.json

aws s3api put-bucket-policy \
  --bucket "${BUCKET_NAME}" \
  --policy file:///tmp/cloudvault-bucket-policy.json
rm /tmp/cloudvault-bucket-policy.json
success "Bucket policy applied"

# ── Enable CORS (for presigned URL downloads) ────────────────────────────────
log "Setting CORS configuration..."
aws s3api put-bucket-cors \
  --bucket "${BUCKET_NAME}" \
  --cors-configuration '{
    "CORSRules": [
      {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
        "AllowedOrigins": ["https://YOUR_DOMAIN.com"],
        "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
        "MaxAgeSeconds": 3600
      }
    ]
  }'
success "CORS configured"

# ── Create IAM User for App ──────────────────────────────────────────────────
IAM_USER="cloudvault-app"
log "Creating IAM user: ${IAM_USER}..."

aws iam create-user --user-name "${IAM_USER}" 2>/dev/null || log "User already exists"

aws iam put-user-policy \
  --user-name "${IAM_USER}" \
  --policy-name "CloudVaultS3Access" \
  --policy-document "file://${SCRIPT_DIR}/iam-policy.json"
success "IAM policy attached"

# Create access keys
log "Generating access keys..."
KEYS=$(aws iam create-access-key --user-name "${IAM_USER}" --output json)
ACCESS_KEY=$(echo "${KEYS}" | python3 -c "import sys,json; print(json.load(sys.stdin)['AccessKey']['AccessKeyId'])")
SECRET_KEY=$(echo "${KEYS}" | python3 -c "import sys,json; print(json.load(sys.stdin)['AccessKey']['SecretAccessKey'])")

echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN} S3 Setup Complete!${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  Bucket:     ${BUCKET_NAME}"
echo "  Region:     ${REGION}"
echo "  IAM User:   ${IAM_USER}"
echo ""
echo "  ⚠️  Save these credentials securely — they won't be shown again:"
echo ""
echo "  S3_ACCESS_KEY=${ACCESS_KEY}"
echo "  S3_SECRET_KEY=${SECRET_KEY}"
echo "  S3_BUCKET=${BUCKET_NAME}"
echo "  S3_REGION=${REGION}"
echo "  S3_ENDPOINT=https://s3.${REGION}.amazonaws.com"
echo ""
echo "  Add these to your .env file on the EC2 instance."
echo ""
