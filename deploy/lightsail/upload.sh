#!/usr/bin/env bash
set -euo pipefail
umask 077

ipv4() {
  python3 -c 'import ipaddress,sys; assert ipaddress.IPv4Address(sys.argv[1]).is_global' "$1"
}

ipv4 "$LIGHTSAIL_STATIC_IP"
runner_ip=$(curl -4fsS --max-time 15 https://checkip.amazonaws.com)
ipv4 "$runner_ip"
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ && "$GITHUB_RUN_ID" =~ ^[0-9]+$ ]]

aws_cli=(aws lightsail --region "$AWS_REGION" --no-cli-pager --cli-connect-timeout 10 --cli-read-timeout 20)
port_info="fromPort=22,toPort=22,protocol=tcp,cidrs=$runner_ip/32"
scratch=$(mktemp -d)
opened_port=false

cleanup() {
  local status=$?
  if [[ "$opened_port" == true ]]; then
    if ! "${aws_cli[@]}" close-instance-public-ports --instance-name "$LIGHTSAIL_INSTANCE" --port-info "$port_info"       --query 'operation.status' --output json > /dev/null; then
      echo "::error::Could not remove the temporary SSH rule for $runner_ip/32."
      status=1
    fi
  fi
  rm -rf -- "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"${aws_cli[@]}" get-instance-access-details --instance-name "$LIGHTSAIL_INSTANCE" --protocol ssh >"$scratch/access.json"
jq -e --arg ip "$LIGHTSAIL_STATIC_IP" '.accessDetails | .ipAddress == $ip and .username == "ubuntu"' "$scratch/access.json" >/dev/null
jq -er '.accessDetails.privateKey' "$scratch/access.json" >"$scratch/lightsail"
jq -er '.accessDetails.certKey' "$scratch/access.json" >"$scratch/lightsail-cert.pub"
jq -er --arg ip "$LIGHTSAIL_STATIC_IP" '
  .accessDetails.hostKeys[] | select(.publicKey and .algorithm) |
  $ip + " " + (if (.publicKey | contains(" ")) then .publicKey else .algorithm + " " + .publicKey end)
' "$scratch/access.json" >"$scratch/known_hosts"
rm -- "$scratch/access.json"

# Deploy only committed build inputs. Leave server configuration and data in place.
git archive --format=tar.gz --output="$scratch/source.tar.gz" "$GITHUB_SHA" --   .dockerignore Dockerfile package.json package-lock.json src public

allowed=$("${aws_cli[@]}" get-instance-port-states --instance-name "$LIGHTSAIL_INSTANCE"   --query 'portStates[?fromPort==`22` && toPort==`22` && protocol==`tcp`].cidrs[]' --output json)
if ! jq -e --arg cidr "$runner_ip/32" 'index($cidr) != null' <<<"$allowed" >/dev/null; then
  opened_port=true
  "${aws_cli[@]}" open-instance-public-ports --instance-name "$LIGHTSAIL_INSTANCE" --port-info "$port_info"     --query 'operation.status' --output json > /dev/null
fi

target="ubuntu@$LIGHTSAIL_STATIC_IP"
ssh_opts=(-o BatchMode=yes -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$scratch/known_hosts" -i "$scratch/lightsail"
  -o ConnectTimeout=12 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)

remote_dir=$(ssh "${ssh_opts[@]}" "$target" 'mktemp -d /tmp/bcm-release.XXXXXXXX')
[[ "$remote_dir" =~ ^/tmp/bcm-release\.[A-Za-z0-9]{8}$ ]]
scp "${ssh_opts[@]}" "$scratch/source.tar.gz" deploy/lightsail/release.sh "$target:$remote_dir/"
unit="bcm-release-$GITHUB_RUN_ID-${GITHUB_RUN_ATTEMPT:-1}"
[[ "$unit" =~ ^bcm-release-[0-9]+-[0-9]+$ ]]

# Run the release independently of the SSH connection so a dropped session
# cannot interrupt a container replacement or rollback.
ssh "${ssh_opts[@]}" "$target"   "sudo systemd-run --wait --collect --unit='$unit' /bin/bash '$remote_dir/release.sh' '$remote_dir' '$GITHUB_SHA' '$LIGHTSAIL_STATIC_IP'; status=\$?; sudo journalctl --no-pager --unit='$unit' -n 80; exit \$status"

curl -4fsS --max-time 15 "https://$LIGHTSAIL_STATIC_IP/api/health" | jq -e '.ok == true'
