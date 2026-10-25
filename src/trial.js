// BETA TESTING MODE: every feature is unlocked for everyone until OPEN_UNTIL. Switched on 25 October
// 2026 when Topier moved to static hosting (GitHub Pages) while its server was offline. Set OPEN_UNTIL
// to '' to end it early.
export const OPEN_UNTIL = '2026-11-30';
export const OPEN_UNTIL_TEXT = '30 November';
export const BETA_LINE = 'BETA TESTING MODE: free for all until ' + OPEN_UNTIL_TEXT + '.';
export const openTrial = () => !!OPEN_UNTIL && Date.now() < Date.parse(OPEN_UNTIL + 'T23:59:59+02:00');
// The static host has no /api. While this is true Topi answers on the device and never sends a
// question anywhere, so the privacy page can promise that nothing leaves the device.
export const NO_SERVER = true;
