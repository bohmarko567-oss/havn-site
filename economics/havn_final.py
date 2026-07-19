#!/usr/bin/env python3
"""
Ritual profit table — first order and renewal, every fee.

Prices mirror the shipped catalogue (api/_catalog.js, re-verified 2026-07-19):
one-time anchor $132; Ritual sub per delivery $99 / $190 / $264 ($99/$95/$88 per
month); 10% welcome code, subscriptions only, first invoice only. Four pieces —
Rise + Calm + Rest + Steady — in EVERY delivery; there is no gift flag.

SCOPE — this file does NOT cover every live cart, despite what it used to claim:
it models the Ritual (sub 1/2/3-mo at full price and with the welcome code, plus
the one-time anchor) and the three-loose-mains subscription. Single subs, Steady
subs and one-time singles are NOT here — see havn_margins.py, which enumerates
every purchasable permutation. Shared rows agree with havn_margins.py to the cent.

Note on the loose-mains row: three mains do NOT collapse into the Ritual (that
would hand over a Steady nobody paid for). Only all FOUR loose formulas collapse,
and that collapse is a $9/mo discount, not price-neutral.
"""
C = {'rise': 11.65, 'calm': 6.99, 'rest': 8.89, 'steady': 5.35}
W = {'rise': 0.20, 'calm': 0.16, 'rest': 0.25, 'steady': 0.17}
PROC, F1, FA = 0.0299, 1.99, 1.29
SUB_PCT, ONE_PCT, FIX = 0.0325 + 0.020 + 0.007, 0.0325 + 0.020, 0.28
PRO = 49.00

def tier(lb):
    if lb <= 0.50: return 4.50
    if lb <= 0.75: return 5.50
    if lb <= 1.00: return 7.00
    if lb <= 2.00: return 9.00
    if lb <= 3.00: return 12.00
    return 12.00 + 1.75 * (int(lb - 3.00) + 1)

def calc(rev, skus, m, sub=True, ritual=False, ship_charged=0.0):
    """rev = what the customer's card is charged, incl. any shipping they pay."""
    cogs = sum(C[s] * m for s in skus)
    ff   = sum(F1 + FA * (m - 1) for s in skus)
    ship = tier(sum(W[s] * m for s in skus))
    if ritual: ship = max(ship, 9.00)          # packaging pushes the 4-box over 1 lb
    proc = (cogs + ff + ship) * PROC
    stp  = rev * (SUB_PCT if sub else ONE_PCT) + FIX
    p    = rev - cogs - ff - ship - proc - stp
    return dict(rev=rev, cogs=cogs, ff=ff, ship=ship, proc=proc, stripe=stp,
                cost=cogs + ff + ship + proc + stp, p=p, pct=p / rev * 100, pm=p / m)

FOUR  = ['rise', 'calm', 'rest', 'steady']
THREE = ['rise', 'calm', 'rest']

ROWS = [
    ('Ritual 1-mo',              calc(99.00,  FOUR, 1, ritual=True)),
    ('Ritual 1-mo · 10% code',   calc(89.10,  FOUR, 1, ritual=True)),
    ('Ritual 2-mo',              calc(190.00, FOUR, 2, ritual=True)),
    ('Ritual 2-mo · 10% code',   calc(171.00, FOUR, 2, ritual=True)),
    ('Ritual 3-mo',              calc(264.00, FOUR, 3, ritual=True)),
    ('Ritual 3-mo · 10% code',   calc(237.60, FOUR, 3, ritual=True)),
    ('Ritual one-time',          calc(132.00, FOUR, 1, sub=False, ritual=True)),
    ('3 loose mains sub',        calc(93.00,  THREE, 1)),
    ('3 loose mains · 10% code', calc(83.70,  THREE, 1)),
]

W1 = 24
print(f"\n{'CART':<{W1}} {'CHARGED':>8} {'PRODUCT':>8} {'PACK':>6} {'SHIP':>6} "
      f"{'2.99%':>6} {'STRIPE':>7} {'TOTAL COST':>11} {'YOU KEEP':>9} {'MARGIN':>7} {'PER MO':>7}")
print('-' * 112)
for label, d in ROWS:
    print(f"{label:<{W1}} {d['rev']:8.2f} {d['cogs']:8.2f} {d['ff']:6.2f} {d['ship']:6.2f} "
          f"{d['proc']:6.2f} {d['stripe']:7.2f} {d['cost']:11.2f} {d['p']:9.2f} "
          f"{d['pct']:6.1f}% {d['pm']:7.2f}")

print("\n--- YEAR ONE per subscriber (first delivery uses the 10% code, then full price) ---")
for name, first, rest, per_yr in [
    ('Ritual 1-mo', ROWS[1][1], ROWS[0][1], 12),
    ('Ritual 2-mo', ROWS[3][1], ROWS[2][1], 6),
    ('Ritual 3-mo', ROWS[5][1], ROWS[4][1], 4),
]:
    total = first['p'] + rest['p'] * (per_yr - 1)
    print(f"  {name:<14} {per_yr:2d} deliveries/yr  ->  ${total:7.2f}/yr   (${total/12:5.2f}/mo avg)")

print("\n--- AFTER the $49/mo Pro plan (true bottom line) ---")
for n in (5, 10, 25, 50, 100):
    gp = ROWS[0][1]['p'] * n
    print(f"  {n:3d} ritual subs/mo  ->  ${gp:8.2f} gross  −$49 plan  =  ${gp - PRO:8.2f}/mo net")

print("\n--- If you hold a USD balance in Stripe (kills the 2% FX) ---")
def nofx(rev, skus, m, sub=True, ritual=False):
    d = calc(rev, skus, m, sub, ritual)
    return d['p'] + rev * 0.020
print(f"  Ritual 1-mo      ${ROWS[0][1]['p']:.2f}  ->  ${nofx(99.00, FOUR, 1, ritual=True):.2f}   (+$1.98)")
print(f"  Ritual 3-mo      ${ROWS[4][1]['p']:.2f}  ->  ${nofx(264.00, FOUR, 3, ritual=True):.2f}   (+$5.28)")
print(f"  Ritual one-time  ${ROWS[6][1]['p']:.2f}  ->  ${nofx(132.00, FOUR, 1, False, True):.2f}   (+$2.64)")

