// Open trial: every paid feature (Creator, Pro and Studio) is unlocked for everyone, with no payment,
// no wallet and no sign-up, until OPEN_UNTIL. Switched on 25 October 2026 when Topier moved to static
// hosting and sign-in and wallet payments were offline. Set OPEN_UNTIL to '' to end it early.
export const OPEN_UNTIL = '2026-11-30';
export const OPEN_UNTIL_TEXT = '30 November';
export const openTrial = () => !!OPEN_UNTIL && Date.now() < Date.parse(OPEN_UNTIL + 'T23:59:59+02:00');
