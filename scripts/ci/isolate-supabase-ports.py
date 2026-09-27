#!/usr/bin/env python3
"""Give a CI run its own Supabase project id and a free block of host ports.

Shared by the GA and Stripe test-mode workflows. Moved verbatim from
ga-real-e2e.yml, where it ran inline.
"""
import os
import socket
from pathlib import Path

path = Path("supabase/config.toml")
text = path.read_text()

# GA runs must not depend on Supabase's fixed localhost defaults. A
# hosted runner can occasionally inherit an occupied default port
# (for example 54322), which is infrastructure contention rather than
# an application failure. Reserve a free contiguous block and give
# this run a unique local project identity before `supabase start`.
required_sections = ("[api]", "[db]", "[studio]", "[inbucket]", "[analytics]", "[edge_runtime]")
present = [section for section in required_sections if section in text]
if present:
    raise SystemExit(f"GA port isolation expects no root local-service sections; found: {present}")

sockets = []
base = None
for candidate in range(55000, 64000, 20):
    trial = []
    try:
        for port in range(candidate, candidate + 10):
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
            sock.bind(("127.0.0.1", port))
            trial.append(sock)
        base = candidate
        sockets = trial
        break
    except OSError:
        for sock in trial:
            sock.close()

if base is None:
    raise SystemExit("Unable to reserve an isolated local Supabase port block")

for sock in sockets:
    sock.close()

run_id = os.environ["GITHUB_RUN_ID"]
attempt = os.environ.get("GITHUB_RUN_ATTEMPT", "1")
project_id = f"scrolllibrary-ga-{run_id}-{attempt}"

lines = text.splitlines()
if not lines or not lines[0].startswith("project_id ="):
    raise SystemExit("Unexpected supabase/config.toml: project_id must be the first line")
lines[0] = f'project_id = "{project_id}"'

local_config = f'''\n\n# Ephemeral GA-only local service ports; injected by CI and never committed.\n[api]\nport = {base}\n\n[db]\nport = {base + 1}\nshadow_port = {base + 2}\n\n[studio]\nport = {base + 3}\n\n[inbucket]\nport = {base + 4}\nsmtp_port = {base + 5}\npop3_port = {base + 6}\n\n[analytics]\nport = {base + 7}\nvector_port = {base + 8}\n\n[edge_runtime]\ninspector_port = {base + 9}\n'''
path.write_text("\n".join(lines) + local_config)
print(f"Configured isolated Supabase project {project_id} on ports {base}-{base + 9}")
