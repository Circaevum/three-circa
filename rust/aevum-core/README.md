# Aevum calculation foundation — bounded Rust spike

This crate lives inside the existing three-circa checkout, under rust/aevum-core. It is not a new repository or the Observatory's domain model. The existing JS renderer remains the runtime. No browser binding or renderer cutover is installed.

Implemented: Y-up point projection, unwrapped clockwise cycle phase, scene-height-to-phase conversion, inclusive helix sampling. Caller-supplied periods and scales avoid hardcoded Earth cycles. f64 is used for calculation; adapters can later convert to GPU precision. Uniform phase is not an ephemeris. No UTC/TAI/TT/leap-second, timezone, Gregorian calendar or planetary-frame migration is claimed.

The numeric oracle is the existing circaevum/js/aevum/helical-projection.js. The crate follows this repository's AGPL-3.0 license and is publish=false. Do not copy its implementation into the separate Locus license boundary without an explicit licensing decision.

```sh
cargo test --offline --locked --manifest-path rust/aevum-core/Cargo.toml
node rust/aevum-core/test-js-parity.cjs
```

Run from the three-circa root. No new dependencies. Four Rust tests cover axes, signed spans, cycle parameters and invalid inputs. The parity harness compares the actual JS module with Rust over 53 fixed/deterministic fixtures using an explicit numerical tolerance.

Next: specify a versioned numeric contract, generate web bindings and compare compiled WASM results, then opt a single helix path into it. Preserve static hosting, offline embedding, postMessage, existing renderer and fallback. Native platform adapters come later. The WASM target is not installed on this Mac and no native/Unity/Swift binding has been built. Cargo native tests do not prove those targets.
