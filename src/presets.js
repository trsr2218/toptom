// Text presets, fonts, transitions, export presets and templates.
import { newProject, newTextClip, uid } from './model.js';

export const FONTS = [
  { id: 'Inter', name: 'Inter', css: 'Inter:wght@400;600;800;900' },
  { id: 'Anton', name: 'Anton', css: 'Anton' },
  { id: 'Bebas Neue', name: 'Bebas Neue', css: 'Bebas+Neue' },
  { id: 'Oswald', name: 'Oswald', css: 'Oswald:wght@400;700' },
  { id: 'Montserrat', name: 'Montserrat', css: 'Montserrat:wght@400;700;900' },
  { id: 'Playfair Display', name: 'Playfair Display', css: 'Playfair+Display:wght@400;700;900' },
  { id: 'Pacifico', name: 'Pacifico', css: 'Pacifico' },
  { id: 'Michroma', name: 'Michroma', css: 'Michroma' },
  { id: 'Space Grotesk', name: 'Space Grotesk', css: 'Space+Grotesk:wght@400;700' },
  { id: 'Permanent Marker', name: 'Permanent Marker', css: 'Permanent+Marker' },
  { id: 'Lora', name: 'Lora', css: 'Lora:wght@400;700' },
  { id: 'Righteous', name: 'Righteous', css: 'Righteous' },
];
const loadedFonts = new Set();
export async function ensureFont(id) {
  const f = FONTS.find((x) => x.id === id);
  if (!f) return;
  if (!loadedFonts.has(id)) {
    loadedFonts.add(id);
    const link = document.createElement('link'); link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${f.css}&display=swap`;
    document.head.appendChild(link);
  }
  try { await Promise.all([document.fonts.load(`800 40px "${id}"`), document.fonts.load(`400 40px "${id}"`)]); } catch {}
}

export const TEXT_PRESETS = [
  { id: 'title', name: 'Big title', font: 'Anton', weight: 400, size: 0.11, color: '#ffffff', y: 0.3, anim: 'pop', text: 'YOUR TITLE' },
  { id: 'subtitle', name: 'Subtitle', font: 'Inter', weight: 600, size: 0.045, color: '#ffffff', y: 0.4, anim: 'fade', text: 'A line under the title' },
  { id: 'lower', name: 'Lower third', font: 'Inter', weight: 800, size: 0.045, color: '#111111', bg: '#FF7A1A', y: 0.82, x: 0.5, anim: 'slide-up', radius: 0.3, pad: 0.6, text: 'Name, what they do' },
  { id: 'handle', name: 'Handle pill', font: 'Inter', weight: 800, size: 0.04, color: '#111111', bg: '#ffffff', y: 0.9, anim: 'pop', radius: 1, pad: 0.7, text: '@yourhandle' },
  { id: 'outline', name: 'Outline', font: 'Bebas Neue', weight: 400, size: 0.14, color: '#ffffff', stroke: '#000000', y: 0.5, anim: 'zoom', text: 'BOLD' },
  { id: 'caption', name: 'Caption box', font: 'Inter', weight: 700, size: 0.05, color: '#ffffff', bg: 'rgba(0,0,0,0.6)', y: 0.75, anim: 'fade', radius: 0.2, pad: 0.5, text: 'Say it in one line' },
  { id: 'script', name: 'Script', font: 'Pacifico', weight: 400, size: 0.09, color: '#FFC25A', y: 0.5, anim: 'fade', text: 'Good vibes' },
  { id: 'serif', name: 'Editorial', font: 'Playfair Display', weight: 900, size: 0.09, color: '#ffffff', y: 0.5, anim: 'typewriter', text: 'Timeless' },
  { id: 'marker', name: 'Marker', font: 'Permanent Marker', weight: 400, size: 0.09, color: '#ffffff', y: 0.5, anim: 'pop', text: 'Hand made' },
  { id: 'date', name: 'Event and date', font: 'Oswald', weight: 700, size: 0.045, color: '#FF7A1A', y: 0.22, anim: 'slide-up', letter: 0.08, text: 'LIVE, 3 OCT 2026' },
];

export const ANIMS = [
  { id: 'none', name: 'None' }, { id: 'fade', name: 'Fade' }, { id: 'pop', name: 'Pop' }, { id: 'slide-up', name: 'Slide up' },
  { id: 'slide-left', name: 'Slide in' }, { id: 'zoom', name: 'Zoom' }, { id: 'typewriter', name: 'Typewriter' }, { id: 'bounce', name: 'Bounce' },
];

export const TRANSITIONS = [
  { id: 'none', name: 'Cut' }, { id: 'fade', name: 'Fade to black' }, { id: 'dissolve', name: 'Dissolve' }, { id: 'slide-left', name: 'Slide' },
  { id: 'slide-up', name: 'Push up' }, { id: 'zoom', name: 'Zoom' }, { id: 'wipe', name: 'Wipe' }, { id: 'blur', name: 'Blur' }, { id: 'flash', name: 'Flash' },
];

export const EXPORTS = [
  { id: 'reels', name: 'Instagram Reels', w: 1080, h: 1920, fps: 30, kbps: 8000 },
  { id: 'tiktok', name: 'TikTok', w: 1080, h: 1920, fps: 30, kbps: 8000 },
  { id: 'shorts', name: 'YouTube Shorts', w: 1080, h: 1920, fps: 30, kbps: 10000 },
  { id: 'status', name: 'WhatsApp Status', w: 720, h: 1280, fps: 30, kbps: 3500 },
  { id: 'feed', name: 'Instagram feed 4:5', w: 1080, h: 1350, fps: 30, kbps: 7000 },
  { id: 'square', name: 'Square 1:1', w: 1080, h: 1080, fps: 30, kbps: 6000 },
  { id: 'youtube', name: 'YouTube 1080p', w: 1920, h: 1080, fps: 30, kbps: 10000 },
  { id: 'x', name: 'X and Facebook', w: 1280, h: 720, fps: 30, kbps: 5000 },
  { id: 'fast', name: 'Fast draft 720p', w: 720, h: 1280, fps: 30, kbps: 3000 },
];

export const MUSIC = [
  // Royalty-free loops rendered in the browser (no download): simple synth beds so a project is never silent.
  { id: 'gen-chill', name: 'Chill beat (generated)', bpm: 88, kind: 'gen', style: 'chill' },
  { id: 'gen-hype', name: 'Hype beat (generated)', bpm: 128, kind: 'gen', style: 'hype' },
  { id: 'gen-amapiano', name: 'Log drum groove (generated)', bpm: 112, kind: 'gen', style: 'amapiano' },
  { id: 'gen-cinematic', name: 'Cinematic pad (generated)', bpm: 70, kind: 'gen', style: 'cinematic' },
];

// Starter templates: a project with text already placed. Media slots are filled by the user.
export const TEMPLATES = [
  { id: 'setclip', name: 'Set clip', size: 'reels', tags: ['music'], desc: 'Act name, event, handle. Made for live moments.',
    build: (p) => { add(p, 'date', 0, 30, { text: 'LIVE AT THE LODGE, 3 OCT' }); add(p, 'title', 0, 30, { text: 'YOUR NAME', y: 0.28 }); add(p, 'handle', 0, 30, { text: '@yourhandle', y: 0.9 }); } },
  { id: 'promo', name: 'Product promo', size: 'reels', tags: ['business'], desc: 'Three beats: hook, product, offer.',
    build: (p) => { add(p, 'outline', 0, 2.5, { text: 'NEW IN' }); add(p, 'subtitle', 2.5, 4, { text: 'Fresh this week, made for you', y: 0.8 }); add(p, 'lower', 6.5, 4, { text: 'Order today, delivery in Lusaka' }); } },
  { id: 'recap', name: 'Event recap', size: 'reels', tags: ['events'], desc: 'Title, date, highlights, thank you.',
    build: (p) => { add(p, 'title', 0, 3, { text: 'THANK YOU' }); add(p, 'date', 0, 3, { text: 'SATURDAY WAS UNREAL', y: 0.4 }); add(p, 'handle', 8, 4, { text: 'Next one: 24 Oct' }); } },
  { id: 'quote', name: 'Quote card', size: 'square', tags: ['creator'], desc: 'One line, big, with your name.',
    build: (p) => { add(p, 'serif', 0, 6, { text: 'Say the thing', size: 0.1 }); add(p, 'subtitle', 0, 6, { text: 'Your name', y: 0.7 }); } },
  { id: 'podcast', name: 'Podcast clip', size: 'portrait', tags: ['creator'], desc: 'Captions on, show name on top.',
    build: (p) => { add(p, 'lower', 0, 30, { text: 'THE SHOW, EP 12', y: 0.1 }); p.captions.position = 0.8; } },
  { id: 'menu', name: 'Food special', size: 'reels', tags: ['business'], desc: 'Dish, price, where to get it.',
    build: (p) => { add(p, 'title', 0, 5, { text: 'TODAY\'S SPECIAL', y: 0.2, size: 0.09 }); add(p, 'handle', 0, 5, { text: 'K85', y: 0.82, size: 0.07 }); add(p, 'lower', 5, 5, { text: 'Fenalt Foods, Kabulonga' }); } },
  { id: 'announce', name: 'Announcement', size: 'landscape', tags: ['business', 'events'], desc: 'Big news in one screen.',
    build: (p) => { add(p, 'outline', 0, 5, { text: 'BIG NEWS', size: 0.18 }); add(p, 'subtitle', 1, 4, { text: 'Doors open 1 November', y: 0.72 }); } },
  { id: 'blank', name: 'Blank', size: 'reels', tags: [], desc: 'Start from nothing.', build: () => {} },
];
function add(p, presetId, start, duration, over = {}) {
  const preset = TEXT_PRESETS.find((t) => t.id === presetId);
  const c = newTextClip(preset, start, over.text || preset.text);
  Object.assign(c, over, { duration, name: over.text || preset.text });
  p.tracks.find((t) => t.kind === 'text').clips.push(c);
}
export function fromTemplate(tpl, name) {
  const p = newProject({ name: name || tpl.name, size: tpl.size });
  tpl.build(p);
  return p;
}

export const ONBOARD = {
  makes: [
    { id: 'music', name: 'Music', emoji: '🎵' }, { id: 'events', name: 'Live events', emoji: '🎤' }, { id: 'business', name: 'Business and products', emoji: '🛍️' },
    { id: 'creator', name: 'Content creator', emoji: '📱' }, { id: 'teaching', name: 'Teaching', emoji: '📚' }, { id: 'other', name: 'Something else', emoji: '✨' },
  ],
  posts: [
    { id: 'instagram', name: 'Instagram', size: 'reels' }, { id: 'tiktok', name: 'TikTok', size: 'reels' }, { id: 'youtube', name: 'YouTube', size: 'landscape' },
    { id: 'x', name: 'X', size: 'landscape' }, { id: 'facebook', name: 'Facebook', size: 'square' }, { id: 'whatsapp', name: 'WhatsApp Status', size: 'reels' },
  ],
  levels: [
    { id: 'simple', name: "I'm new", desc: 'Simple mode, Topi guides every step.' },
    { id: 'standard', name: 'I know a bit', desc: 'Timeline, text, captions, looks, music.' },
    { id: 'pro', name: "I'm a pro", desc: 'All tracks, keyframes, Topi stays quiet.' },
  ],
};
