# Circaevum Zhong Changelog

**The Center Contract** - Administrative hub for managing Circaevum

This changelog tracks all changes across Yin (backend), Yang (frontend), and Zhong (administration) projects. Updates are reflected in the DAO quarterly reviews.

**DAO Link**: [circaevum-dao-phase-1](https://github.com/Circaevum/circaevum-dao-phase-1)

---

## [Q1 2025] - March 2025 (Zhong Architecture & Token Structure)

### Zhong (Administration) - The Center Contract

**✅ Completed**:
- **Zhong Architecture**: Established `circaevum-zhong` as central administrative hub
- **Token Structure**: Balanced YIN and YANG tokens (perfect reflection)
- **Wu Wei Investment**: Tier-based milestone system (Seed/Growth/Scale)
- **Quarterly Review System**: Process defined for contribution tracking
- **Repository Tracking**: `repositories.json` configured for all projects
- **Git Commit Visualization**: Design for sprint arcs and commit dots

**🔄 In Progress**:
- Repository restructure (yin/yang/zhong folders)
- CHANGELOG.md implementation
- Quarterly review automation

### Yin (Backend)

**✅ Completed** (from TimeBox):
- **PROBLEM-YIN-001 [yin-nakama]**: Nakama Device Authentication System (v0.4.03-v0.4.04)
- **PROBLEM-YIN-002 [yin-nakama]**: Google Calendar Integration (v0.4.02-v0.4.05)
- **PROBLEM-YIN-003 [yin-nakama]**: Sleep Data Visualization (v0.4.06)

**🔄 In Progress**:
- **PROBLEM-YIN-004 [yin-nakama]**: Mobile Device Optimization (v0.4.07)

### Yang (Frontend)

**✅ Completed** (from TimeBox):
- **PROBLEM-YANG-001 [yang-avp]**: Zhong (中) UI - The Center Contract interface (v0.4.03-v0.4.04)

**✅ Completed** (recent – yang-web GL):
- **Viewer / wrapper localhost**: On localhost, GL defaults "Open full app" to `http://localhost:5173` (Yin-portal) when `CIRCAEVUM_FULL_APP_URL` is not set, so the event list link works without config.
- **Viewer mode**: GL already uses viewer mode by default on localhost (or with `?viewer=1` / iframe); no change.
- **Docs**: `docs/VIEWER-AND-WRAPPER.md` updated for Yin-portal (`account-wrapper`), local dev (GL on port 8080, wrapper on 5173), and CORS/deploy notes.
- **Time marker / flattening UX**:
  - Added full-year time marker mode (Year, Month, Week, Day) with HUD toggle and wiring through `TimeMarkers` for an entire selected year.
  - Added flatten-height slider tied to the existing `F` flatten toggle, with intuitive “height” mapping.
  - Default zoom set to 5 (Month), with zoom HUD kept in sync.
  - Added camera focus toggle (Sun/Earth) with HUD icon and keyboard shortcut, and updated camera focus math so the scene truly centers on the selected body.
  - Standardized scene keyboard shortcuts: C (camera focus), L (light mode), T (time marker text), M (mute/sound), X (XR mode).

**📋 Planned**:
- **PROBLEM-YANG-002 [yang-avp]**: ISS Data Pod Visualization (Q2 2025)
- **PROBLEM-YANG-003 [yang-avp]**: User Login Flow Enhancement (Q2 2025)
- **PROBLEM-YANG-004 [yang-web]**: Three.js event renderer (Q2 2025)

### Token Awards (Q1 2025)

**YIN Tokens**:
- YIN-001: Nakama Device Authentication ✅
- YIN-002: Google Calendar Integration ✅
- YIN-003: Sleep Data Visualization ✅
- YIN-004: Mobile Optimization 🔄 (in progress)

**YANG Tokens**:
- YANG-001: Zhong (中) UI ✅

**ZHONG Tokens**:
- ZHONG-001: Zhong Architecture ✅

**Wu Wei Tokens**:
- None yet (awaiting first investment milestone)

### Investment Milestones

**Seed Tier** (Active):
- WW-001: $25,000 📋 (available)
- WW-002: $50,000 📋 (available)
- WW-003: $75,000 📋 (available)
- WW-004: $100,000 📋 (available)
- WW-005: $150,000 📋 (available)
- WW-006: $200,000 📋 (available)

**Growth Tier** (Reserved - unlocks at $200k+ or $5M valuation):
- WW-007 through WW-012: Reserved

**Scale Tier** (Reserved - unlocks at $1.5M+ or $20M valuation):
- WW-013 through WW-018: Reserved

### Architecture Changes

**Repository Structure**:
- Established `circaevum-zhong` as main administrative hub
- Defined `yin/`, `yang/`, `zhong/` folder structure
- Created platform categories: `yang-web`, `yang-avp`, `yin-nakama`, `yin-timescale`, `yin-rest`

**Naming Conventions**:
- Repository: `circaevum-zhong`
- Platforms: `yang-web`, `yang-avp`, `yin-nakama`, etc.
- Problem tags: `PROBLEM-YANG-001 [yang-web]`

**Documentation**:
- Created `TAIJI_PHILOSOPHY.md` - Complete Taiji concepts
- Created `ADAPTER_ARCHITECTURE.md` - Pluggable adapter system
- Created `YINYANG_BALANCE.md` - Perfect reflection system
- Created `WU_WEI_INVESTMENT_STRUCTURE.md` - Investment milestones
- Created `DECAY_MECHANICS.md` - Active participation system
- Created `QUARTERLY_REVIEW_SCENARIOS.md` - Review process
- Created `GIT_COMMIT_VISUALIZATION.md` - Commit visualization
- Created `INVESTMENT_MILESTONE_SYSTEM.md` - Flexible scaling

---

## Format Guidelines

### Entry Structure

```markdown
## [Quarter] [Year] - [Quarter Name]

### Zhong (Administration)
- ✅ [Status] [PROBLEM-ID] [Platform]: Description
- 🔄 [Status] [PROBLEM-ID] [Platform]: Description

### Yin (Backend)
- ✅ [Status] [PROBLEM-ID] [Platform]: Description

### Yang (Frontend)
- ✅ [Status] [PROBLEM-ID] [Platform]: Description

### Token Awards
- YIN-XXX: Contributor Name
- YANG-XXX: Contributor Name
- ZHONG-XXX: Contributor Name

### Investment Milestones
- WW-XXX: $Amount [Status]
```

### Status Symbols

- ✅ **Completed**: Problem solved, token awarded
- 🔄 **In Progress**: Currently being worked on
- 📋 **Planned**: Scheduled for future quarter
- 🚫 **Blocked**: Blocked by dependencies
- ⏸️ **Paused**: Temporarily paused

### Platform Categories

- `yang-web` - Three.js / Web
- `yang-avp` - Unity / Apple Vision Pro
- `yang-quest` - Unity / Meta Quest
- `yin-nakama` - Nakama backend
- `yin-timescale` - TimescaleDB backend
- `yin-rest` - REST API backend
- `zhong-architecture` - Architecture/coordination

---

## Quarterly Reconciliation

**Process**:
1. Review all changes in this CHANGELOG
2. Update DAO README.md with completed problems
3. Award tokens for completed problems
4. Update investment milestone status
5. Plan next quarter's problems
6. Rotate Yin-Yang 90°

**Next Review**: Q2 2025 (June 2025)

---

**Last Updated**: March 2026 (Q1 2025 section; recent yang-web GL updates added)
**Maintained By**: Circaevum Zhong (中) - The Center Contract

