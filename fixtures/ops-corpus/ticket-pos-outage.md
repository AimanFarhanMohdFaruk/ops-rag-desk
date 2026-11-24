# Ticket: POS outage (sample)

**Status:** resolved  
**Opened:** 2026-11-10  
**Summary:** Terminal frozen at lunch rush; card payments failed.

## Timeline

- 12:10 — Staff reported frozen POS; cash-only until fixed.
- 12:18 — Power-cycled terminal; still stuck on "Processing".
- 12:25 — Switched to backup tablet POS profile "Counter-B".
- 12:40 — Vendor remote reset of primary terminal; payments restored.

## Root cause

Network switch port flapped; POS lost lease and hung mid-auth.

## Fix / prevent

1. Prefer Counter-B profile when primary hangs more than 2 minutes.
2. Check switch lights before calling vendor.
3. Log outage start/end in the Ops Manual "Incidents" page.
