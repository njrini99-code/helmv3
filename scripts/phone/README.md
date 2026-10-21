# Phone motion tooling

Scripts that drive Clubhouse on a real iPhone (or an iOS Simulator) and record
Instruments "Animation Hitches" against each step. The workflow, and what each
measurement does and does not prove, is the `helm-safari-performance` skill
(`.claude/skills/helm-safari-performance/SKILL.md`).

| Script | Does |
| --- | --- |
| `wda-start.sh` | Starts WebDriverAgent on the device and forwards it to `127.0.0.1:8100`. |
| `wda.py` | One action: `shot`, `tap`, `swipe`, `type`, `size`, `safari`. |
| `run.py <plan>` | A fixed journey (`sections`, `calendar`, `messages`, `keyboard`, `bell`, `account`), logging each step's wall time to `steps.log`. |
| `chunk.sh <plan> [secs]` | Records Animation Hitches while `run.py` drives, prints hitches mapped to steps, deletes the trace. |
| `hitches.py <trace> [steps.log]` | Reads a trace on its own. |

Every script prints `--help`. Output (screenshots, `steps.log`, logs) goes to
`$HELM_PHONE_OUT`, default `$TMPDIR/helm-phone`; nothing is written to the repo.

## One-time setup

1. iPhone: Settings → Privacy & Security → Developer Mode on; Settings → Apps →
   Safari → Advanced → Web Inspector on. Cable it to the Mac and trust it.
2. Clone WebDriverAgent (appium) to `~/tools/WebDriverAgent`, then build it once
   with your team and a unique bundle id:

       xcodebuild build-for-testing -project WebDriverAgent.xcodeproj \
         -scheme WebDriverAgentRunner -destination "id=$HELM_PHONE_UDID" \
         -derivedDataPath "$TMPDIR/wda-dd" DEVELOPMENT_TEAM=<team> \
         PRODUCT_BUNDLE_IDENTIFIER=<reverse-dns>.WebDriverAgentRunner

   Trust the developer profile on the phone the first time it runs.
3. `brew install libimobiledevice` for `iproxy`.

`HELM_PHONE_UDID` comes from `xcrun devicectl list devices` (a device must
show `available`; `unavailable` means unplugged or locked).

## A run

    export HELM_PHONE_UDID=<udid>
    scripts/phone/wda-start.sh
    # open Clubhouse in Mobile Safari and sign in on the phone yourself
    scripts/phone/chunk.sh sections 40

## Traps

- Keep a recording at 45 seconds or less. A long or failed one can leave the
  phone's ktrace stuck ("Failed starting ktrace session") until the phone
  restarts.
- Traces are large: `chunk.sh` deletes each one after reading it. Check free
  disk between runs.
- Previews and production share the one production database. The `keyboard`
  plan types but never sends. Send only in a thread whose members are all test
  accounts.
- Tap coordinates are iPhone 16 Pro points (402 wide). Another model needs
  `TITLE`, `RIGHT` and `WIDTH` in `run.py` changed.
