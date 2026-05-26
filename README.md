# IWSDK AR Rocket Launch

A tabletop augmented-reality rocket launch scene built with IWSDK, Three.js, UIKitML, and IWER. The app places a miniature launch complex on a desk-height AR surface, exposes panel controls, and animates countdown, ignition, smoke, telemetry, and ascent.

## Requirements

- Node.js matching the range in `package.json`
- npm
- A browser/WebXR environment, or IWER through the IWSDK dev tooling

Install dependencies:

```sh
npm ci
```

## Development

Start the IWSDK-managed dev server:

```sh
npm run dev
```

For static validation before browser testing:

```sh
npx tsc --noEmit
npm run build
```

UIKitML source lives in `ui/` and is compiled to `public/ui/` by the Vite UIKitML plugin.

## Recording the AR Playthrough

Use the committed `vitexec` recorder:

```sh
npm run record:rocket -- .codex/artifacts/rocket-ar-playthrough.webm
```

This runs `vitexec` with `vite.vitexec.config.ts`. That config intentionally enables IWER injection but disables the IWSDK plugin's managed AI browser. This avoids the two-browser failure mode where one browser receives controls/logs while another stale browser is recorded.

The playthrough script:

- enters the IWER AR session,
- switches to controller input,
- points the right controller at the launch button,
- holds trigger long enough to arm countdown,
- rotates the viewer from the launch panel to the rocket,
- follows the rocket through liftoff and ascent.

## Asset Attribution

This repository does not include the full `kenney_space-kit/` source folder; that folder is local-only and gitignored. It does include selected runtime GLB files copied into `public/gltf/space-kit/`.

Attribution for those assets:

- "Space Kit 2.0" by Kenney, https://www.kenney.nl
- Used in modified form as selected, scaled, and spatially composed GLB assets in this IWSDK AR rocket launch scene.
- The local source pack license file says CC0 1.0. This attribution is included anyway and is intended to satisfy a CC-BY-style attribution requirement if one is assumed for distribution.
