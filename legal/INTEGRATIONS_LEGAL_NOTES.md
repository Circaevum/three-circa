# Circaevum Integrations — Legal Notes

Working notes for third-party hardware, SDK, and data integrations. **Not legal advice.** Have counsel review before shipping a product that uses these integrations.

## Muse (Interaxon) SDK

If Circaevum or a derivative product integrates the **Muse** headband SDK, Muse device data, or Muse-branded sample code:

- **Primary terms:** [Muse Legal — SDK Terms and Conditions](https://choosemuse.com/pages/legal#sdk) (Interaxon Development Kit License Agreement).
- **Operator:** Interaxon Inc. / Muse (`choosemuse.com`, `interaxon.ca`).
- **Commercial use:** The standard SME/no-fee SDK path is limited to non-commercial use. Revenue, subscriptions, product integration, or contractor/commercial distribution generally requires a **Commercial SDK Agreement** with Interaxon (`business@interaxon.ca`).
- **Application constraints (summary):** Applications must not be used for neuromarketing, must not deceive users or reduce human agency, and must not exploit or harm users. Muse Data and SDK are Interaxon confidential information; redistribution of the SDK outside compiled/embedded use in your application is restricted.
- **Muse Data:** EEG and related biosignals collected via Muse devices are subject to the SDK agreement and applicable privacy law. Document consent, retention, and purpose limitation in your product privacy policy.
- **Before merge:** Confirm your integration path (SME vs commercial), preserve required notices, and do not commit SDK binaries or keys unless license allows.

When Muse is added to this repo, also list it in `THIRD_PARTY_NOTICES.md` with version, component path, and link to the license above.

## General integration checklist

1. Identify the integration’s **license / SDK agreement** URL and version.
2. Add an entry to `THIRD_PARTY_NOTICES.md` (or this file for SDK-only terms).
3. Confirm **attribution** requirements (`ATTRIBUTION_POLICY.md`).
4. Confirm **commercial** vs **research/SME** eligibility before public release.
5. Update product **privacy policy** if the integration collects user or biometric data.
