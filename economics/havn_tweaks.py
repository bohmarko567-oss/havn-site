#!/usr/bin/env python3
"""
HAVN tweak scenarios vs what actually ships today. Prices are the founder-locked
ladder (api/_catalog.js, re-verified 2026-07-19): one-time anchor $132; Ritual sub
$99/$190/$264 per delivery ($99/$95/$88 per month); singles $38 one-time and
$31/$30/$28 per month; Steady $18 one-time and $15/$14/$13 per month. Shipping
is free at a $50 pre-discount product subtotal per delivery.

BASELINE RE-CUT 2026-07-19 — the old baseline was stale in both directions:

  T3  threshold fix   — SHIPPED. The universal $50 free-shipping threshold is the
                        live rule for both subscription and one-time deliveries.
  T1  gift cap        — RETIRED, NOT AN OPTION. This modelled capping or dropping
                        the "free Steady" on renewals. The gift structure it
                        depended on was retired 2026-07-19: the Ritual is a genuine
                        four-piece product, Steady ships in EVERY delivery, and
                        there is no gift flag anywhere in the code. Give-then-remove
                        reads as bait-and-switch at delivery 2, and the profit
                        difference was under $1/month. Rows deleted so nobody can
                        mistake gift logic for something still on the table.

Still open, and all this file now models:

  T2  USD balance     — hold USD in Stripe, payout to a USD account -> no 2% FX
  Copy fix (no math)  — one-month mains and every Steady-only tier pay $6.95;
                        multi-month mains and every Ritual tier ship free.

Rows are full-price deliveries. The 10% welcome code (subscriptions only, first
invoice only) is not modelled here — see havn_margins.py and havn_final.py.

Run: python havn_tweaks.py
"""

STRIPE_FIXED = 0.28
SUP_PROC     = 0.0299
F1, FA       = 1.99, 1.29
FREE_SHIP    = 50.00

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
TRIO   = {1: 99.00, 2: 190.00, 3: 264.00}    # per delivery, _catalog.js:37

SUB_NOW, SUB_TWK = 0.0325 + 0.020 + 0.007, 0.0325 + 0.007   # T2 kills the 2% FX
ONE_NOW, ONE_TWK = 0.0325 + 0.020,         0.0325

print(f"\n{'OPTION':<24} {'SHIPS NOW':>9} {'WITH T2 FX':>13} {'GAIN':>7}   what changed")
print("(per month for subs; absolute for one-times. T1 gift rows deleted — retired structure.)")
print('-' * 88)

rows = []
for m in (1, 2, 3):
    # all four pieces every delivery — no gift variant to model any more
    units = {'rise': m, 'calm': m, 'rest': m, 'steady': m}
    now = profit(TRIO[m], units, SUB_NOW, True) / m
    twk = profit(TRIO[m], units, SUB_TWK, True) / m
    rows.append((f'Ritual sub {m}mo', now, twk, 'T2 FX'))

for m in (1, 2, 3):
    subt = SINGLE[m] * m
    fee = 0.0 if subt >= FREE_SHIP else 6.95
    now = profit(subt + fee, {'rise': m}, SUB_NOW) / m
    twk = profit(subt + fee, {'rise': m}, SUB_TWK) / m
    note = 'T2 only · ships free' if fee == 0 else 'T2 only · pays $6.95'
    rows.append((f'Main sub {m}mo', now, twk, note))

for m in (1, 2, 3):
    subt = STEADY[m] * m
    fee = 0.0 if subt >= FREE_SHIP else 6.95
    now = profit(subt + fee, {'steady': m}, SUB_NOW) / m
    twk = profit(subt + fee, {'steady': m}, SUB_TWK) / m
    note = 'T2 only · ships free' if fee == 0 else 'T2 only · pays $6.95'
    rows.append((f'Steady sub {m}mo', now, twk, note))

one = [('Calm one-time', 44.95, {'calm': 1}, False),
       ('Rise one-time', 44.95, {'rise': 1}, False),
       ('Rest one-time', 44.95, {'rest': 1}, False),
       ('Steady one-time', 24.95, {'steady': 1}, False),
       ('Ritual one-time', 132.00, {'rise': 1, 'calm': 1, 'rest': 1, 'steady': 1}, True)]
for label, rev, units, t in one:
    rows.append((label, profit(rev, units, ONE_NOW, t),
                 profit(rev, units, ONE_TWK, t), 'T2 only'))

for label, now, twk, note in rows:
    print(f"{label:<24} {now:9.2f} {twk:13.2f} {twk-now:+7.2f}   {note}")
