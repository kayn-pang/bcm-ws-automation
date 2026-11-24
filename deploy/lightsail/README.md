# Deploy updates to Lightsail

The workflow runs the existing tests on pull requests. A tested commit pushed to the protected `production` branch is deployed to the existing Lightsail instance. The deployment replaces the app image and keeps the host Compose configuration, reverse proxy, `.env`, and scheduler volume. The previous app image is restored if the new container or its HTTPS health check fails.

## Repository setup

A repository administrator creates and protects the `production` branch. Require pull requests and approvals and restrict direct pushes and bypasses. Set these Actions repository variables under **Settings → Secrets and variables → Actions**:

- `LIGHTSAIL_INSTANCE` is the existing instance name.
- `LIGHTSAIL_STATIC_IP` is its static public IPv4.
- `LIGHTSAIL_DEPLOY_ROLE_ARN` is the dedicated AWS IAM role ARN.

## AWS setup

Use the GitHub OIDC provider `https://token.actions.githubusercontent.com` with the audience `sts.amazonaws.com`. The role trust policy must use `sts:AssumeRoleWithWebIdentity` and require these exact claims using `StringEquals`:

- `token.actions.githubusercontent.com:aud` is `sts.amazonaws.com`.
- `token.actions.githubusercontent.com:sub` is `repo:kayn-pang@69616791/bcm-ws-automation@1465161855:ref:refs/heads/production`.

This repository uses GitHub's immutable owner and repository IDs in its OIDC subject. Do not broaden the branch to a wildcard.

Grant `lightsail:GetInstanceAccessDetails`, `lightsail:OpenInstancePublicPorts`, and `lightsail:CloseInstancePublicPorts` on the one target instance ARN. Grant `lightsail:GetInstancePortStates` with resource `*` and the condition `aws:RequestedRegion = ap-east-1`. The runner verifies the AWS-provided SSH host keys and removes the runner's temporary IPv4 rule at the end of the job. If GitHub interrupts the runner before it can clean up, remove that one CIDR in the instance's Lightsail **Networking** tab.

The installation expects the current Ubuntu and Docker Compose layout at `/opt/bcm-wa-scheduler`, with the app and HTTPS services already running. GitHub needs no persistent AWS access keys, server passwords, or WhatsApp credentials.
