#!/usr/bin/env python3
"""
HAVN contribution-margin model v2 — every purchasable permutation, verified inputs.

Sources:
  costs/weights : catalog-base/products/*/record.md, RE-VERIFIED 2026-07-18 against live
                  Supliful Sanity API (all 4 unchanged, docs _updatedAt 2026-07-17)
  prices        : havn-site/api/_catalog.js:9-35 (authoritative; checkout.js builds from it)
  Supliful fees : help.supliful.com articles 11628956 (fulfillment) + 11549933 (processing),
                  fetched 2026-07-19; cross-checked supliful-brief/INTEL-FAQ.md:33,40,43
  Stripe        : stripe.com Denmark rates via fee-calculator sources, 2026-07-19:
                  intl (US) cards 3.25% + 1.80 DKK, +2% currency conversion USD->DKK,
                  Stripe Billing 0.7% on recurring (subscription) invoices.
                  Consistent with GO_LIVE.md:122 derived numbers (5.29 on $96 = 5.25%+fixed).

Fee model decisions (v1 errors fixed):
  * Supliful 2.99% "of the total transaction amount" = the transaction between YOU and
    Supliful (product cost + fulfillment + their shipping) — Supliful never sees your
    retail revenue on a custom storefront. v1 wrongly applied it to retail.
  * Stripe raised from 4.9% to 5.25% (+0.7% Billing on subs). v1 was low.
  * Fulfillment $1.29 confirmed same-product-only => trio (4 distinct products) pays 4x$1.99.

Run: python havn_margins.py
"""

DKK_PER_USD   = 6.40           # knob; only affects the $0.28 fixed fee
STRIPE_FIXED  = 1.80 / DKK_PER_USD          # ~$0.28
STRIPE_ONE    = 0.0325 + 0.020              # intl card + FX = 5.25%
STRIPE_SUB    = STRIPE_ONE + 0.007          # + Billing 0.7% = 5.95%

SUPLIFUL_PROC = 0.0299         # on (COGS + fulfillment + Supliful shipping)
FULFIL_FIRST  = 1.99           # first unit of each product
FULFIL_ADDL   = 1.29           # each additional unit of the SAME product
PRO_MONTHLY   = 49.00          # required to fulfil at all
PACKAGING_LB  = 0.0            # billable weight unknown for all SKUs (record.md gap)

SKUS = {  # cost_pro_usd (live-verified), gross lb
    'rise':   {'cost': 11.65, 'lb': 0.20},
    'calm':   {'cost':  6.99, 'lb': 0.16},
    'rest':   {'cost':  8.89, 'lb': 0.25},
    'steady': {'cost':  5.35, 'lb': 0.17},
}

def ship_tier(lb):
    """INTEL-FAQ.md:33 US regular rate card."""
    if lb <= 0.50: return 4.50
    if lb <= 0.75: return 5.50
    if lb <= 1.00: return 7.00
    if lb <= 2.00: return 9.00
    if lb <= 3.00: return 12.00
    return 12.00 + 1.75 * (int(lb - 3.00) + 1)

def supliful_ship(units, is_trio):
    lb = sum(SKUS[s]['lb'] * q for s, q in units.items()) + PACKAGING_LB
    cost = ship_tier(lb)
    # GO_LIVE.md:113 asserts trio box = $9.00 (1-2 lb) though gross sum says $7.00 —
    # packaging almost certainly pushes it over 1 lb. Conservative floor.
    return max(cost, 9.00) if is_trio else cost

def fulfil(units):
    return sum(FULFIL_FIRST + FULFIL_ADDL * (q - 1) for q in units.values() if q > 0)

def model(label, revenue, units, m=0, sub=False, trio=False):
    cogs  = sum(SKUS[s]['cost'] * q for s, q in units.items())
    ff    = fulfil(units)
    ship  = supliful_ship(units, trio)
    proc  = (cogs + ff + ship) * SUPLIFUL_PROC          # merchant-charge base
    spct  = STRIPE_SUB if sub else STRIPE_ONE
    stripe = revenue * spct + STRIPE_FIXED
    var   = cogs + ff + ship + proc + stripe
    c     = revenue - var
    return {'label': label, 'rev': revenue, 'cogs': cogs, 'ff': ff, 'ship': ship,
            'proc': proc, 'stripe': stripe, 'c': c,
            'pct': c / revenue * 100 if revenue else 0,
            'pm': c / m if m else None}

ROWS = []
def add(*a, **k): ROWS.append(model(*a, **k))

# ---- ONE-TIME: customer pays $6.95 ship unless subtotal >= $79 --------------
add('1x Rise     one-time',  38.00 + 6.95, {'rise': 1})
add('1x Calm     one-time',  38.00 + 6.95, {'calm': 1})
add('1x Rest     one-time',  38.00 + 6.95, {'rest': 1})
add('1x Steady   one-time',  18.00 + 6.95, {'steady': 1})          # NEVER free ship
add('2x mains    one-time',  76.00 + 6.95, {'rise': 1, 'calm': 1})
add('Trio        one-time', 114.00,        {'rise': 1, 'calm': 1, 'rest': 1, 'steady': 1}, trio=True)
add('Trio x2     one-time', 228.00,        {'rise': 2, 'calm': 2, 'rest': 2, 'steady': 1}, trio=True)  # _catalog.js:155: 1 steady, not 2

# ---- SUBSCRIPTION: free ship iff subtotal >= $30 x m ------------------------
SINGLE = {1: 31.00, 2: 30.00, 3: 28.00}      # per month, _catalog.js:9-11
STEADY = {1: 15.00, 2: 14.00, 3: 13.00}      # _catalog.js:12
TRIO   = {1: 93.00, 2: 180.00, 3: 252.00}    # per delivery, _catalog.js:26

def sub_rows(coupon):
    tag = '  1st inv -15%' if coupon else ''
    k = 0.85 if coupon else 1.0
    for m in (1, 2, 3):
        subt = SINGLE[m] * m
        fee = 0.0 if subt >= 30.00 * m else 6.95     # m=3: 84 < 90 -> pays
        add(f'1x main     sub {m}mo{tag}', round((subt + fee) * k, 2), {'rise': m}, m, sub=True)
        subt = STEADY[m] * m
        fee = 6.95                                    # 15/28/39 < 30/60/90 -> ALWAYS pays
        add(f'1x Steady   sub {m}mo{tag}', round((subt + fee) * k, 2), {'steady': m}, m, sub=True)
        add(f'Trio        sub {m}mo{tag}', round(TRIO[m] * k, 2),
            {'rise': m, 'calm': m, 'rest': m, 'steady': m}, m, sub=True, trio=True)

sub_rows(False)
sub_rows(True)    # 15% welcome code: subs only, first invoice only, discounts ship line too

# ---------------------------------------------------------------- output
W = 30
print(f"\nStripe: one-time {STRIPE_ONE*100:.2f}% / sub {STRIPE_SUB*100:.2f}% + ${STRIPE_FIXED:.2f}"
      f"  |  Supliful 2.99% on merchant charge  |  fulfil 1.99/1.29-same-product\n")
print(f"{'OPTION':<{W}} {'REV':>8} {'COGS':>7} {'FULF':>6} {'SHIP':>6} "
      f"{'PROC':>5} {'STRIPE':>7} {'PROFIT':>8} {'MARGIN':>7} {'$/MO':>7}")
print('-' * 106)
for r in ROWS:
    pm = f"{r['pm']:7.2f}" if r['pm'] is not None else '      -'
    print(f"{r['label']:<{W}} {r['rev']:8.2f} {r['cogs']:7.2f} {r['ff']:6.2f} "
          f"{r['ship']:6.2f} {r['proc']:5.2f} {r['stripe']:7.2f} "
          f"{r['c']:8.2f} {r['pct']:6.1f}% {pm}")

print(f"\n--- Pro plan ${PRO_MONTHLY:.0f}/mo break-even ---")
for r in ROWS:
    if r['c'] > 0 and '1st inv' not in r['label']:
        print(f"  {r['label']:<{W}} {PRO_MONTHLY / (r['pm'] or r['c']):5.1f} orders/mo")
