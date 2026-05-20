# BAC Alcohol Tracking

**Mode**: FA
**Complexity**: Medium FA
**Created**: 2026-05-19
**Status**: planning

## Description

Add timestamped alcohol tracking to drink logs and display a live BAC estimate on the dashboard. BAC is calculated from persisted alcoholic drink history, not the viewed dashboard day, so the value can carry across midnight and decay over time. The feature also tightens profile biological sex to `male | female`, backfilling existing `other` profiles to `male`.

## Accepted Contracts

- Alcohol details are explicit per alcoholic drink: `volume_ml`, `abv_percent`, computed `alcohol_grams`, and drink timestamp.
- BAC reads a rolling 72-hour alcohol window.
- Each drink uses a 30-minute linear absorption window.
- BAC elimination rate is `0.015` BAC/hour.
- BAC uses the user's current profile `current_weight_kg` and `bio_sex`.
- `profiles.bio_sex` becomes strict `male | female`; existing `other` rows backfill to `male`.
- New onboarding shows only Male/Female.
- Standard-drink presets use 14g ethanol as the US standard drink reference.

## Key Artifacts

- `plan.md`
- `progress.md`

## Execution Entry

After context clear, resume by loading this manifest and `plan.md`, then execute with subagents. Coding is not started yet.
