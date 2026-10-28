#!/usr/bin/env bash
# Deploy (or update) the training log backend to YOUR personal AWS account, then
# write the app's config file. Run from the repo root:  ./infra/deploy.sh
#
# Uses the AWS CLI profile "training" (override with PROFILE=name ./infra/deploy.sh).
set -euo pipefail

PROFILE="${PROFILE:-training}"
REGION="us-east-1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS="$ROOT/infra/.deploy-settings"

command -v aws >/dev/null || { echo "Install the AWS CLI first: https://aws.amazon.com/cli/"; exit 1; }
command -v node >/dev/null || { echo "Install Node.js 22+ first: https://nodejs.org"; exit 1; }

echo "Checking which AWS account profile '$PROFILE' points at…"
IDENTITY="$(aws sts get-caller-identity --profile "$PROFILE" --output text --query '[Account,Arn]')" || {
  echo "Couldn't use profile '$PROFILE'. Set it up with: aws configure --profile $PROFILE"
  exit 1
}
ACCOUNT="$(echo "$IDENTITY" | cut -f1)"
echo
echo "  Account: $ACCOUNT"
echo "  As:      $(echo "$IDENTITY" | cut -f2)"
echo "  Region:  $REGION"
echo
read -r -p "Deploy the training log to THIS account? Type yes to continue: " OK
[ "$OK" = "yes" ] || { echo "Stopped. Nothing was changed."; exit 1; }

# First run: ask for the owner email and remember it.
if [ -f "$SETTINGS" ]; then
  # shellcheck disable=SC1090
  source "$SETTINGS"
fi
if [ -z "${OWNER_EMAIL:-}" ]; then
  read -r -p "Your email (the only account allowed; sign up in the app with this exact email): " OWNER_EMAIL
fi
printf 'OWNER_EMAIL=%q\n' "$OWNER_EMAIL" >"$SETTINGS"
# Every CDK step loads the app (bootstrap included), so hand this over as an environment variable.
export TRAINING_OWNER_EMAIL="$OWNER_EMAIL"

cd "$ROOT/infra"
echo "Installing deploy tools…"
npm ci --silent

export AWS_PROFILE="$PROFILE" AWS_REGION="$REGION" CDK_DEFAULT_ACCOUNT="$ACCOUNT" CDK_DEFAULT_REGION="$REGION"
echo "Preparing the account for deploys (one-time, safe to repeat)…"
npx cdk bootstrap "aws://$ACCOUNT/$REGION" --profile "$PROFILE"

echo "Deploying…"
npx cdk deploy TrainingLog --profile "$PROFILE" \
  --outputs-file "$ROOT/infra/outputs.json"

# The app reads its server addresses from src/aws-config.json (IDs and URLs only, no secrets).
node -e '
const o = require(process.argv[1]).TrainingLog;
const cfg = { region: o.Region, apiUrl: o.ApiUrl, userPoolId: o.UserPoolId, userPoolClientId: o.UserPoolClientId };
require("fs").writeFileSync(process.argv[2], JSON.stringify(cfg, null, 2) + "\n");
console.log(cfg);
' "$ROOT/infra/outputs.json" "$ROOT/src/aws-config.json"

cat <<EOF

Done! Next:
  1. Commit and push the config so the live site uses your server:
       git add src/aws-config.json && git commit -m "Point app at AWS" && git push
  2. Open the site → Settings → Sign in → "First time? Create the account" with $OWNER_EMAIL.
  3. Anything you logged before the server existed: Settings → Backup on the old copy, then Import backup.
EOF
