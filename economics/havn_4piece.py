#!/usr/bin/env python3
"""
4-PIECE RITUAL scenarios — Steady included forever, no give-then-take.
Compares against the current 3+gift structure. Same verified fee model.
"""
C = {'rise': 11.65, 'calm': 6.99, 'rest': 8.89, 'steady': 5.35}
W = {'rise': 0.20, 'calm': 0.16, 'rest': 0.25, 'steady': 0.17}
SUP_PROC, F1, FA = 0.0299, 1.99, 1.29
ST_SUB, ST_ONE, FIX = 0.0325 + 0.020 + 0.007, 0.0325 + 0.020, 0.28

def tier(lb):
    if lb <= 0.50: return 4.50
    if lb <= 0.75: return 5.50
    if lb <= 1.00: return 7.00
    if lb <= 2.00: return 9.00
    if lb <= 3.00: return 12.00
    return 12.00 + 1.75 * (int(lb - 3.00) + 1)

def run(rev, skus, m, sub=True):
    cogs = sum(C[s] * m for s in skus)
    ff   = sum(F1 + FA * (m - 1) for s in skus)
    ship = max(tier(sum(W[s] * m for s in skus)), 9.00)
    proc = (cogs + ff + ship) * SUP_PROC
    stp  = rev * (ST_SUB if sub else ST_ONE) + FIX
    p    = rev - cogs - ff - ship - proc - stp
    return p, p / rev * 100, p / m

FOUR  = ['rise', 'calm', 'rest', 'steady']
THREE = ['rise', 'calm', 'rest']

print("\n=== TODAY: 3 mains + Steady as first-delivery gift ===")
p, pct, pm = run(93.00, FOUR, 1);  print(f"  month 1 (gift)    $93.00  profit {p:6.2f}  {pct:4.1f}%")
p, pct, pm = run(93.00, THREE, 1); print(f"  month 2+ (3 only) $93.00  profit {p:6.2f}  {pct:4.1f}%   <- the candy grab")

print("\n=== YOUR IDEA: $99/mo, all four, forever ===")
for m, rev in [(1, 99.00), (2, 192.00), (3, 276.00)]:
    p, pct, pm = run(rev, FOUR, m)
    print(f"  {m}-mo supply  ${rev:6.2f}/delivery  profit {p:7.2f}  {pct:4.1f}%   ${pm:5.2f}/month")

print("\n=== TIER SHAPES at 4 pieces (per-month price -> profit/month) ===")
for label, ladder in [
    ('A  99 / 96 / 92', {1: 99, 2: 96, 3: 92}),
    ('B  99 / 95 / 90', {1: 99, 2: 95, 3: 90}),
    ('C  99 / 94 / 89', {1: 99, 2: 94, 3: 89}),
]:
    row = []
    for m in (1, 2, 3):
        rev = ladder[m] * m
        _, pct, pm = run(rev, FOUR, m)
        row.append(f"{m}mo ${pm:5.2f} ({pct:4.1f}%)")
    print(f"  {label}:  " + "   ".join(row))

print("\n=== One-time 4-piece anchor options ===")
for rev in (126.00, 132.00, 138.00):
    p, pct, _ = run(rev, FOUR, 1, sub=False)
    print(f"  ${rev:6.2f} one-time  profit {p:6.2f}  {pct:4.1f}%   sub $99 = {(1-99/rev)*100:4.1f}% off")

print("\n=== Loose-vs-bundle (does the bundle still feel like a deal?) ===")
print(f"  4 bought separately, sub 1mo: 31+31+31+15 = $108.00/mo")
print(f"  Ritual at $99/mo saves the customer $9.00/mo")
print(f"  4 bought separately, one-time: 38+38+38+18 = $132.00")

print("\n=== Verdict line ===")
p1, _, _ = run(93.00, FOUR, 1)
p2, _, _ = run(93.00, THREE, 1)
p3, _, _ = run(99.00, FOUR, 1)
print(f"  today month1 {p1:.2f} | today month2+ {p2:.2f} | blended@6mo "
      f"{(p1 + 5 * p2) / 6:.2f}")
print(f"  $99 four-piece every month: {p3:.2f}  (flat, no cliff, no take-away)")
