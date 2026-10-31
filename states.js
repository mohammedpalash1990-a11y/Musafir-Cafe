'use strict';
const STATES = ['Draft', 'Generated', 'Validated', 'Submitted', 'Reported', 'Cleared', 'Rejected', 'Failed'];
const NEXT = {
  Draft: ['Generated', 'Failed'],
  Generated: ['Validated', 'Submitted', 'Failed'],   // Validated = passed official SDK/compliance check
  Validated: ['Submitted', 'Failed'],
  Submitted: ['Reported', 'Cleared', 'Rejected', 'Failed'],
  Failed: ['Submitted', 'Failed'],                    // retry
  Reported: [], Cleared: [], Rejected: [],            // terminal
};
function canMove(from, to) { return (NEXT[from] || []).includes(to); }
function assertMove(from, to) { if (!canMove(from, to)) throw new Error(`Illegal invoice state change ${from} -> ${to}`); }
module.exports = { STATES, canMove, assertMove };
