# Android and iOS apps

Sova's web path writes Playwright tests from Trailblaze recordings. Playwright cannot drive a phone,
so on a phone the recording is the test: Trailblaze records each step's tool calls into
`trails/<id>/trail.yaml`, and the gate replays them with

    trailblaze run <trail> -d android --llm none --no-save-recording

`--llm none` is Trailblaze's recordings-only mode: no model is called, so the gate is free and
repeatable. A step with no recording would need a model, so sova refuses such a trail instead of
letting the gate quietly spend money or guess.

## Set up

    sova init --platform android --app-id com.example.app     # or --platform ios --app-id com.example.App
    sova doctor

`sova doctor` checks Java 17+, `adb` (Android) or Xcode (iOS, Mac only), Trailblaze, and that a
device or emulator is connected. Trailblaze only lists iOS simulators on macOS.

## Drive, save, gate

    sova open                       # launches appId
    sova look                       # the screen, with a ref per element
    sova act tap ref=<ref> -s "Tap Sign in"
    sova act type text="a@b.co" -s "Enter the email"
    sova save login-valid           # the recording becomes trails/login-valid/trail.yaml
    sova check                      # trails ready? lint clean? run each once on the device
    sova check --repeat 5           # vet new trails
    sova mutate                     # break the app's source on purpose (see below)
    sova summary                    # sova/summary/index.html

`sova act <any trailblaze tool> ... -s "..."` passes through; `sova act <tool> --help` prints that
tool's arguments. Asserting something is a recorded `assertVisibleBySelector` (or
`assertNotVisibleBySelector`), not a `verify:` step: a bare `verify:` is judged by a model from a
screenshot and cannot be replayed without one.

## What `sova emit`, `lint` and `check` do on a phone

- `emit` writes nothing. It reports each trail as ready or blocked.
- A trail is **blocked** when a step has no recording for the platform, a `verify:` has no recorded
  assertion, or a step taps a screen coordinate (`tapOnPoint`).
- Warnings: no trailhead (nothing says how the app starts), a selector that matches by list index
  only, a trail that asserts nothing.
- `check` runs each ready trail. A missing device, a busy device or a daemon problem stops the run
  and says so; it is never counted as a test failure. (Trailblaze v2026.11.12 exits 1 for "No
  connected device", the same code as a failed assertion, so sova reads the output too.)
- `mutate` works as on the web: `mutationRebuild` must rebuild **and reinstall** the app on the
  device (for Android, for example `./gradlew installDebug`), `mutationReset` puts app data back.
- `sova summary` shows the same page as on the web, minus the Playwright report link. Per-run
  screenshots, video and device logs are in `~/.trailblaze/logs`; `trailblaze app` opens the viewer.
- Not available on a phone: `sova assertions` (it grades web recordings), `sova plan` source
  discovery is the same as on the web but the cases it proposes were written for web forms.

## Status

Proven on a Linux box with no emulator: reading real Block-recorded Android trails, the
ready/blocked verdicts, lint rules, `sova init --platform`, `sova doctor`, and the real Trailblaze CLI's
behaviour when no device is connected. Not proven: any run against a device or emulator, `sova save`
on a phone, `sova mutate` on a phone, and everything iOS. See the PR for the exact commands to run.
