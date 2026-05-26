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

This project includes selected models from Kenney's Space Kit asset pack:

- Title: Space Kit 2.0
- Creator/distributor: Kenney
- Source: https://www.kenney.nl
- Bundled local license file: `kenney_space-kit/License.txt`
- Local license text: Creative Commons Zero, CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/
- Project usage/modifications: selected GLB assets were copied into `public/gltf/space-kit/`, scaled, positioned, and composed into the AR launch site at runtime.

Kenney attribution is not required by the bundled CC0 license, but is gratefully provided here.

If you are treating the asset pack as CC-BY for distribution purposes, use this conservative attribution:

> "Space Kit 2.0" by Kenney, from https://www.kenney.nl, used in modified form as selected, scaled, and spatially composed GLB assets in this IWSDK AR rocket launch scene. Licensed under the applicable Creative Commons Attribution license from the asset source.

That attribution identifies the title, creator, source, license basis, and project-side changes. Keep `kenney_space-kit/License.txt` with redistributed copies of the source asset pack.

No endorsement by Kenney is implied.
