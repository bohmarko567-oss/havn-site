#!/usr/bin/env python3
"""
HAVN tweak scenarios vs current state. Prices untouched (founder-locked ladder).

Tweaks modeled:
  T1  gift cap        — 1 free Steady per delivery regardless of supply months
                        (variant T1b: Steady only in FIRST delivery, renewals none)
  T2  USD balance     — hold USD in Stripe, payout to USD account -> no 2% FX
  T3  threshold fix   — sub free-ship threshold $28xm instead of $30xm
                        (3mo single: customer pays 84.00 not 90.95; matches ladder intent)
  Copy fix (no math)  — "always ship free" only true for mains/trio; Steady-only keeps fee

Run: python havn_tweaks.py
"""

STRIPE_FIXED = 0.28
SUP_PROC     = 0.0299
F1, FA       = 1.99, 1.29

SKUS = {'rise': (11.65, 0.20), 'calm': (6.99, 0.16),
        'rest': (8.89, 0.25), 'steady': (5.35, 0.17)}

def tier(lb):
    if lb <= 0.50: return 4.50
    if lb <= 0.75: return 5.50
    if lb <= 1.00: return 7.00
    if lb <= 2.00: return 9.00
    if lb <= 3.00: return 12.00
    return 12.00 + 1.75 * (int(lb - 3.00) + 1)

def profit(rev, units, stripe_pct, is_trio=False):
    cogs = sum(SKUS[s][0] * q for s, q in units.items())
    ff   = sum(F1 + FA * (q - 1) for q in units.values() if q > 0)
    ship = tier(sum(SKUS[s][1] * q for s, q in units.items()))
    if is_trio: ship = max(ship, 9.00)
    proc = (cogs + ff + ship) * SUP_PROC
    stp  = rev * stripe_pct + STRIPE_FIXED
    return rev - cogs - ff - ship - proc - stp

SINGLE = {1: 31.00, 2: 30.00, 3: 28.00}
STEADY = {1: 15.00, 2: 14.00, 3: 13.00}
TRIO   = {1: 93.00, 2: 180.00, 3: 252.00}

SUB_NOW, SUB_TWK = 0.0325 + 0.020 + 0.007, 0.0325 + 0.007   # T2 kills the 2% FX
ONE_NOW, ONE_TWK = 0.0325 + 0.020,         0.0325

print(f"\n{'OPTION':<24} {'NOW $/mo':>9} {'TWEAKED $/mo':>13} {'GAIN':>7}   what changed")
print('-' * 88)

rows = []
for m in (1, 2, 3):
    # trio: T1 gift cap (steady=1) + T2
    now = profit(TRIO[m], {'rise': m, 'calm': m, 'rest': m, 'steady': m}, SUB_NOW, True) / m
    twk = profit(TRIO[m], {'rise': m, 'calm': m, 'rest': m, 'steady': 1}, SUB_TWK, True) / m
    rows.append((f'Trio sub {m}mo', now, twk, 'T1 gift cap + T2 FX'))
    # T1b variant: renewals carry no steady at all
    ren = profit(TRIO[m], {'rise': m, 'calm': m, 'rest': m}, SUB_TWK, True) / m
    rows.append((f'  renewal if T1b {m}mo', now, ren, 'gift 1st delivery only'))

for m in (1, 2, 3):
    subt = SINGLE[m] * m
    fee_now = 0.0 if subt >= 30.00 * m else 6.95
    fee_twk = 0.0 if subt >= 28.00 * m else 6.95        # T3
    now = profit(subt + fee_now, {'rise': m}, SUB_NOW) / m
    twk = profit(subt + fee_twk, {'rise': m}, SUB_TWK) / m
    note = 'T2' + (' + T3 free ship' if fee_now != fee_twk else '')
    rows.append((f'Main sub {m}mo', now, twk, note))

for m in (1, 2, 3):
    rev = STEADY[m] * m + 6.95                           # keeps fee; copy fix only
    now = profit(rev, {'steady': m}, SUB_NOW) / m
    twk = profit(rev, {'steady': m}, SUB_TWK) / m
    rows.append((f'Steady sub {m}mo', now, twk, 'T2 only'))

one = [('Calm one-time', 44.95, {'calm': 1}, False),
       ('Rise one-time', 44.95, {'rise': 1}, False),
       ('Rest one-time', 44.95, {'rest': 1}, False),
       ('Steady one-time', 24.95, {'steady': 1}, False),
       ('Trio one-time', 114.00, {'rise': 1, 'calm': 1, 'rest': 1, 'steady': 1}, True)]
for label, rev, units, t in one:
    rows.append((label, profit(rev, units, ONE_NOW, t),
                 profit(rev, units, ONE_TWK, t), 'T2 only'))

for label, now, twk, note in rows:
    print(f"{label:<24} {now:9.2f} {twk:13.2f} {twk-now:+7.2f}   {note}")
