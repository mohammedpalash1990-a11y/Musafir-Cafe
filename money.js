'use strict';
// Money helpers: all VAT maths in integer halalas (1/100 SAR) to avoid float drift.
const toHalala = (n) => Math.round((Number(n) + Number.EPSILON) * 100);
const fmt = (h) => (h / 100).toFixed(2);
const fmtQty = (q) => Number(q).toFixed(6).replace(/0+$/, '').replace(/\.$/, '.0') ;
module.exports = { toHalala, fmt, fmtQty };
