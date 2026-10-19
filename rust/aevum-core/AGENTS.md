# Aevum Rust calculation spike

Read CIR/AGENTS.md, CIR/HANDOFF.md and this crate's README. This is one additive migration unit in the existing three-circa repository. It does not authorize a repository consolidation or production deployment.

Own pure numeric computation here: phase, projection and sampling. Inputs explicitly carry units/reference/period/scale. No browser, renderer, clock, network, account, filesystem or vendor dependency in the core. Preserve current GL Y-up XZ orbit and clockwise phase. Zoom is a viewer property, not an event coordinate. Do not claim this uniform-cycle projection is an ephemeris or calendar engine.

Adapters translate data types, axes and buffers; they do not fork the calculation. Bindings belong outside src/lib.rs. Keep this AGPL implementation within its existing license boundary. Never import BONSAI source or private CIR material into this crate.

Before changing calculation, run the native tests and the actual-JS parity harness; add meaningful boundary fixtures and declare tolerance. Preserve existing JS as the independent reference while migrating. A native build is not proof of WASM/Unity/Swift compatibility. Report which bindings were actually tested. Runtime adoption requires an explicit integration change and parity/behavior checks; this spike does not adopt Rust automatically.
