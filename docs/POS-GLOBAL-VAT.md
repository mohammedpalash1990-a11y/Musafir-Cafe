# Musafir Cafe POS — Global Saudi VAT

## Default behavior

The POS uses a single global VAT setting for all menu items. The Saudi standard rate defaults to **15%**, enabled, with menu prices treated as **VAT-inclusive**. Existing product records do not need individual VAT configuration.

- Global VAT enabled/disabled.
- One configurable global VAT rate.
- Price includes VAT toggle.
- Checkout extracts VAT from the entered menu price; it does not add VAT again when prices are inclusive.
- A product with an explicit tax classification can override the default classification; otherwise the Saudi standard-rated 15% default is applied automatically to the sale line.

## Example

For a menu price of SAR 9.90:

- Customer pays: SAR 9.90
- Taxable value before VAT: SAR 8.61
- Embedded VAT: SAR 1.29

Formula: VAT = gross price × 15 / 115. Calculations are rounded to two decimal places for POS display and sale records.

## Settings

Open **Settings → Shop, backup & login → Saudi VAT**. Configure the global switch, rate, and whether prices include VAT. The setting is saved in the existing POS settings object and uses the existing settings sync path.

## ZATCA boundary

This global POS VAT setting is tax arithmetic and data capture, not ZATCA certification. The current EGS pipeline still requires official SDK validation, complete signed UBL 2.1 documents, correct invoice hash/PIH chain, QR TLV, and successful sandbox tests before any production use. Never enable production filing based only on the POS VAT calculation.
