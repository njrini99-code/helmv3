# Headless Mac mini runbook

How the home Mac mini is kept reachable, and what to do when it is not.

## Current design

- The mini never sleeps. Power settings are applied by
  `scripts/ops/mac-mini-headless-hardening.sh`.
- It restarts by itself after a power loss, and on macOS 26.5 or later it
  also powers on whenever power is reconnected (`autorestartatconnect`).
- Tailscale runs as a root system daemon installed through Homebrew, with
  Tailscale SSH enabled. It comes up at boot before anyone logs in and
  does not depend on the user session.
- Remote Login (SSH) and Screen Sharing are on as a second path.

## If the mini goes dark

A Wi-Fi Mac that is asleep cannot be woken from outside the house unless
an Apple TV or HomePod is on the same network to relay the wake. A Mac
that is fully off cannot be woken over Wi-Fi at all. Do not spend time on
Wake-on-LAN from the internet; it does not reach a sleeping Wi-Fi Mac.

In order:

1. Tailscale admin console: is the node online? If yes, SSH over
   Tailscale and you are done.
2. Smart plug: power off, wait ten seconds, power on. With
   `autorestartatconnect` enabled the mini boots.
3. Anyone within Wi-Fi range: join the home Wi-Fi and send a Wake-on-LAN
   packet to the mini's MAC at the broadcast address `192.168.1.255`.
4. Someone at the house: press the power button on the back.

## When you are next at the keyboard

```bash
sudo -v && bash scripts/ops/mac-mini-headless-hardening.sh
```

Then do the manual follow-ups the script prints at the end. The most
important two are turning off Private Wi-Fi Address for the home network
and enabling automatic login (which requires FileVault off).

## What not to do

- Do not leave SSH port forwards open on the router after an incident.
  Remove them and turn Security Shield back on.
- Do not run Tailscale from the App Store or standalone app on this
  machine. Those variants stop when the user session sleeps or logs out.
- Do not rely on `Wake for network access` over Wi-Fi without a sleep
  proxy device on the network. It looks enabled and does nothing.
