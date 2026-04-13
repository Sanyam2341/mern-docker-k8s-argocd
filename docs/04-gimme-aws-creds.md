# gimme-aws-creds — Fetch Temporary AWS Credentials via Okta

## What is gimme-aws-creds?

A CLI tool that authenticates you via Okta SSO and writes temporary AWS credentials to `~/.aws/credentials`. Used in organizations (like Nielsen) where AWS access is managed through Okta.

---

## Prerequisites

- Python installed (≤ 3.9 on Windows, any version on Mac)
- AWS CLI installed

```bash
python3 --version
aws --version
```

---

## Step 1: Install gimme-aws-creds

```bash
pip install gimme-aws-creds
```

or

```bash
pip3 install gimme-aws-creds
```

---

## Step 2: Create Okta Config File

**Mac:** `~/.okta_aws_login_config`
**Windows:** `%USER_PROFILE%\.okta_aws_login_config`

```ini
[DEFAULT]
okta_org_url = https://nielsen.okta.com
okta_auth_server =
client_id =
gimme_creds_server = appurl
aws_appname =
aws_rolename =
write_aws_creds = True
cred_profile = acc-role
okta_username = <your-email@nielsen.com>
app_url = https://nielsen.okta.com/app/amazon_aws/exk1hnga4x0GIM0uk0h8/sso/saml
resolve_aws_alias = True
include_path = True
preferred_mfa_type =
remember_device = True
aws_default_duration = 43200
force_classic = True
device_token =
```

> Replace `okta_username` with your Nielsen email.

---

## Step 3: Fetch AWS Credentials

```bash
gimme-aws-creds
```

**What happens:**
1. Prompts for Okta password (saves to keyring after first time)
2. Asks for MFA — pick a factor:
   - `0` → Okta Verify TOTP (enter code from app)
   - `1` → SMS (code sent to phone)
   - `2` → Okta Verify push (approve on phone)

   > ⚠️ Enter the **factor number** (0, 1, or 2), NOT the OTP code!

3. Shows list of AWS accounts/roles — pick the one you need
4. Writes credentials to `~/.aws/credentials`

---

## Step 4: Set AWS Profile

The credentials are saved under a profile name (shown in the output). Set it:

**Mac:**
```bash
export AWS_PROFILE="watch-audiotools-nonprod-/DEVADMIN"    # replace with your profile name
```

**Windows (PowerShell):**
```powershell
$Env:AWS_PROFILE="watch-audiotools-nonprod-/DEVADMIN"      # replace with your profile name
```

---

## Step 5: Verify

```bash
aws sts get-caller-identity
```

Expected output:
```json
{
    "UserId": "AROAXXXXXXX:your.email@nielsen.com",
    "Account": "598917779747",
    "Arn": "arn:aws:sts::598917779747:assumed-role/DEVADMIN/your.email@nielsen.com"
}
```

---

## Troubleshooting

### "Stored password is invalid, clearing"
- Your saved Okta password expired or changed. Re-run `gimme-aws-creds` and enter the new password.

### "Selection XXXXXX out of range"
- You entered the OTP code at the factor selection prompt. Enter `0`, `1`, or `2` first, then enter the OTP when asked.

### "403 Forbidden" on MFA verify
- OTP expired or session got corrupted. Re-run `gimme-aws-creds` from scratch.

### "Unable to locate credentials"
- You forgot to set `AWS_PROFILE`. Run `export AWS_PROFILE="<profile-name>"`.

---

## Notes

- Credentials are **temporary** (default 12 hours / `aws_default_duration = 43200` seconds)
- Re-run `gimme-aws-creds` when they expire
- Profile name format: `<account-alias>-/<role-name>`
