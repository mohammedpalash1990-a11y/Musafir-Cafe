# Musafir Cafe POS — Global Saudi VAT

The POS uses one global VAT configuration for all products. Product prices can be VAT-inclusive, so staff do not need to configure VAT separately on every menu item.

## Default Saudi setup

- VAT enabled: yes
- Rate: 15%
- Product prices include VAT: yes
- Default ZATCA line classification: Standard-rated (S), 15%
- Product-level ZATCA overrides remain optional for a genuinely different tax treatment; they are not required for ordinary standard-rated products.

## VAT-inclusive calculation

For a customer-facing price of SAR 9.90:

- Net amount before VAT: 9.90 / 1.15 = SAR 8.6087, rounded to SAR 8.61
- VAT portion: 9.90 × 15 / 115 = SAR 1.2913, rounded to SAR 1.29
- Amount charged to customer: SAR 9.90

The POS must not add another 15% on top of a VAT-inclusive menu price. Discounts reduce the VAT base proportionally. When the price-includes-VAT setting is turned off, the POS calculates VAT on top of the net price instead.

## Settings and compatibility

Open Settings → Shop, backup & login → Saudi VAT. The global setting can be enabled/disabled, the rate can be edited, and price-inclusive mode can be selected. The setting is saved with the existing POS settings object and syncs through the existing Firebase settings path.

Existing product records without a tax override automatically inherit the global VAT rate and Standard-rated classification at checkout. No product-by-product setup is needed for the standard 15% case.

## ZATCA reconciliation

Sales store the VAT-exclusive subtotal and discount, the VAT amount, the customer-facing gross total, and the VAT-inclusive flag. Invoice line prices remain the customer-facing gross product prices; the ZATCA sale assessment derives the net line extension from each line's stored category and rate and checks the extracted VAT against the POS total.

This change does not claim that the full EGS signing pipeline or production ZATCA certification is complete. Production remains gated until the official UBL, hash/PIH, signing, QR, SDK and sandbox verification work is completed.
