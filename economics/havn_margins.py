#!/usr/bin/env python3
"""
HAVN contribution-margin model v2 — every purchasable permutation, verified inputs.

Sources:
  costs/weights : local catalog-base/products/*/record.md records dated 2026-07-15;
                  no live Supliful refresh was performed for this correction
  prices        : havn-site/api/_catalog.js:8-13 (singles) + :33-40 (Ritual)
                  (authoritative; checkout.js builds from it)
  Supliful fees : local supliful-brief/INTEL-FAQ.md snapshot, lines 33, 40, and 43;
                  no live fee refresh was performed for this correction
  Stripe        : assumptions already recorded in this local model; no live rate
                  refresh was performed for this correction

Fee model decisions (v1 errors fixed):
  * Supliful 2.99% "of the total transaction amount" = the transaction between YOU and
    Supliful (product cost + fulfillment + their shipping) — Supliful never sees your
    retail revenue on a custom storefront. v1 wrongly applied it to retail.
  * Stripe raised from 4.9% to 5.25% (+0.7% Billing on subs). v1 was low.
  * Fulfillment $1.29 confirmed same-product-only => Ritual (4 distinct products) pays 4x$1.99.

Product shape: the Ritual is a genuine FOUR-piece product — Rise + Calm + Rest + Steady in
EVERY active subscription delivery. The old "3 mains + free Steady on delivery 1" model was retired
2026-07-19; there is no gift flag anywhere in the code or in this model.

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
FREE_SHIP     = 50.00           # pre-discount merchandise subtotal, per delivery
CUSTOMER_SHIP = 6.95            # charged below FREE_SHIP

SKUS = {  # cost_pro_usd and gross lb from the local product records
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
    # UNKNOWN — fulfillment packaging weight is absent from the local records.
    # The $9 floor is a conservative model assumption, not a catalog fact.
    return max(cost, 9.00) if is_trio else cost

def fulfil(units):
    return sum(FULFIL_FIRST + FULFIL_ADDL * (q - 1) for q in units.values() if q > 0)

def customer_shipping(product_subtotal):
    """One universal storefront rule, evaluated before discounts per delivery."""
    return 0.0 if product_subtotal >= FREE_SHIP else CUSTOMER_SHIP

def invoice_revenue(product_subtotal, customer_ship, coupon):
    """Mirror the 10% Stripe coupon in integer cents, one recurring line at a time."""
    product_cents = int(round(product_subtotal * 100))
    shipping_cents = int(round(customer_ship * 100))
    if not coupon:
        return (product_cents + shipping_cents) / 100
    product_discount = (product_cents * 10 + 50) // 100
    shipping_discount = (shipping_cents * 10 + 50) // 100
    return (product_cents + shipping_cents - product_discount - shipping_discount) / 100

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

# ---- ONE-TIME: free at $50+ pre-discount per-delivery merchandise subtotal --
add('1x Rise     one-time',  38.00 + customer_shipping(38.00), {'rise': 1})
add('1x Calm     one-time',  38.00 + customer_shipping(38.00), {'calm': 1})
add('1x Rest     one-time',  38.00 + customer_shipping(38.00), {'rest': 1})
add('1x Steady   one-time',  18.00 + customer_shipping(18.00), {'steady': 1})
add('2x mains    one-time',  76.00 + customer_shipping(76.00), {'rise': 1, 'calm': 1})
add('Ritual      one-time', 132.00,        {'rise': 1, 'calm': 1, 'rest': 1, 'steady': 1}, trio=True)
add('Ritual x2   one-time', 264.00,        {'rise': 2, 'calm': 2, 'rest': 2, 'steady': 2}, trio=True)

# ---- SUBSCRIPTION: same $50 rule, once per multi-month delivery -------------
SINGLE = {1: 31.00, 2: 30.00, 3: 28.00}      # per month, _catalog.js:9-11
STEADY = {1: 15.00, 2: 14.00, 3: 13.00}      # _catalog.js:12
TRIO   = {1: 99.00, 2: 190.00, 3: 264.00}    # per delivery, _catalog.js:37

def sub_rows(coupon):
    tag = '  1st inv -10%' if coupon else ''
    for m in (1, 2, 3):
        subt = SINGLE[m] * m
        fee = customer_shipping(subt)                 # 31 pays; 60/84 ship free
        add(f'1x main     sub {m}mo{tag}', invoice_revenue(subt, fee, coupon), {'rise': m}, m, sub=True)
        subt = STEADY[m] * m
        fee = customer_shipping(subt)                 # 15/28/39 all pay $6.95
        add(f'1x Steady   sub {m}mo{tag}', invoice_revenue(subt, fee, coupon), {'steady': m}, m, sub=True)
        add(f'Ritual      sub {m}mo{tag}', invoice_revenue(TRIO[m], 0.0, coupon),
            {'rise': m, 'calm': m, 'rest': m, 'steady': m}, m, sub=True, trio=True)

sub_rows(False)
sub_rows(True)    # Stripe applies the first-invoice coupon to recurring product + shipping lines

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
