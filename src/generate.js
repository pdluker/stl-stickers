// Daily sticker pipeline: plan -> Haiku copy -> FLUX art -> SVG -> R2 + D1.
// Runs once a day from the cron (or on demand from POST /admin/generate).
// Visitors can never trigger this path.

import { compose, ART_SIZE, SAFETY_HEADERS } from './styles.js';
import { toAscii, clip, stripQuoted } from './text.js';

export const TOPICS = {
  helpdesk: { label: 'Help Desk & End Users', hint: 'tickets, "have you tried turning it off and on", printers, password resets, the user who says it is urgent, sticky notes with passwords, "I did not touch anything"' },
  network: { label: 'Networking & DNS', hint: 'it is always DNS, TTLs, BGP, the one cable nobody labeled, VLANs, packet loss, wifi dead zones, the firewall rule from 2011' },
  security: { label: 'Security & Phishing', hint: 'phishing tests, MFA fatigue, password rotation, the CISO, zero trust, compliance checklists, clicking the link anyway, patch Tuesday' },
  cloud: { label: 'Cloud & FinOps', hint: 'the surprise bill, idle instances, egress fees, someone left a GPU running, us-east-1 outages, tagging policies, "serverless" that still has servers, multi-cloud' },
  devops: { label: 'DevOps & On-Call', hint: 'pager at 3 AM, works on my machine, YAML, flaky tests, deploy on Friday, postmortems, Kubernetes complexity, rollback, the green build that lies' },
  ai: { label: 'AI Hype', hint: 'every product is now AI, prompt engineering as a job title, chatbots confidently wrong, the board asking for an AI strategy, GPUs, agents, "just add AI"' },
  legacy: { label: 'Legacy & Mainframe', hint: 'COBOL, the server nobody dares reboot, uptime of 9 years, the one guy who knows how it works, Windows XP in production, fax machines, green screens' },
  meetings: { label: 'Meetings & Management', hint: 'this meeting could have been an email, synergy, circle back, the reorg, story points, the roadmap, quick sync that takes an hour, camera on' },
  privacy: { label: 'Privacy & Compliance', hint: 'GDPR, cookie banners nobody reads, consent fatigue, data subject access requests, pseudonymization, anonymization that is not, retention schedules, the DPO, SOC 2 and ISO audits, breach notifications, biometrics, data minimization, the vendor questionnaire' },
  code: { label: 'Code & Debugging', hint: 'off-by-one errors, null pointers, the regex nobody can read, merge conflicts, force push, the missing semicolon, copy-paste from Stack Overflow, tabs vs spaces, code review nitpicks, the TODO from 2019, commented-out code nobody deletes, rubber duck debugging, AI-generated code that almost works, the variable named temp2' },
};
export const STYLES = ['terminal', 'win95', 'diecut', 'poster', 'minimal', 'y2k', 'holo', 'botanical', 'kawaii', 'qr', 'comic', 'popart', 'masterpiece', 'sign', 'objectchar', 'typo', 'badge'];
// The 13-style set that ran until STYLE_CUTOVER (see styleForDay).
const STYLES_V1 = STYLES.slice(0, 13);
// Styles with no picture: no image-model call, no cost.
const TEXT_ONLY = new Set(['typo']);
export const STYLE_LABELS = {
  terminal: 'Retro Terminal', win95: "'95 Dialog", diecut: 'Laptop Die-Cut', poster: 'Motivational Poster',
  minimal: 'Swiss Minimal', y2k: 'Y2K Chrome', holo: 'Holographic', botanical: 'Botanical Specimen', kawaii: 'Kawaii Collectible', qr: 'Scan-to-Reveal',
  comic: 'Two-Panel Comic', popart: 'Pop Art', masterpiece: 'Masterpiece Parody',
  sign: 'Hazard Sign', objectchar: 'Talking Object', typo: 'Stacked Type', badge: 'Vintage Badge',
};

// Weighted toward the devices that make great conference stickers land
// (reviewed Sep 26, 2026): pun, snowclone, literalized jargon. Repeats = weight.
const PUN = 'pun or wordplay hidden inside an IT term - split it, re-read it, or hear it differently (quality bar: ransomware -> "He ran som ware")';
const SNOWCLONE = 'snowclone - the recognizable shape of a famous movie line, idiom or saying with one IT term swapped in (quality bar: "You had me at pseudonymization", "There is no crying in compliance")';
const LITERAL = 'literalized jargon - apply an IT phrase to the physical world as if it were true (quality bar: "Your face has been breached. Please update.")';
const DEVICES = [
  PUN, SNOWCLONE, LITERAL, PUN, SNOWCLONE, LITERAL, PUN, SNOWCLONE, LITERAL,
  'overly honest corporate speak',
  'the error message says what everyone is thinking',
  'fake product warning label',
  'escalation from small problem to absurd scale',
  'a mundane office object treated as critical infrastructure',
];

// Devices from the BulbaCraft "Computer Science" sheet review (2026-09-28).
// Each one only fits some formats, so deviceFor() adds it to the pool of the
// styles listed. The "shape" examples show the structure; they are listed in
// REFERENCE_JOKES so they are never reused word for word.
const CODE_PUN = 'code-syntax pun - a real, valid-looking code fragment or command that also reads as an English phrase or a feeling; must still make sense to a non-coder who glances at it (shape: "O(no)", "while(!coffee) sleep();")';
const TITLE_PUN = 'portmanteau job title - an identity badge the owner would proudly put on their own laptop, made by fusing a job title with a pun (shape: "Full Snack Developer", "Open Sourcerer"); it describes the wearer, not someone else';
const DIALOG = 'dialog parody - a system prompt or confirmation box where the BUTTON labels are the punchline (shape: "Push to main on Friday? [ YES ] [ OH NO ]")';
const SIGN = 'hazard or road-sign parody - a WARNING, CAUTION, YIELD or STOP sign for an everyday IT danger, in terse sign language (shape: "CAUTION: Legacy Code Ahead", "YIELD to change freeze")';
const STATUS = 'status as mood - an HTTP status code, progress bar, battery level or build status used to describe a human state (shape: "404 Sleep Not Found", "Motivation 3% [charging]")';
const OBJECT_VOICE = 'object voice - a piece of hardware or an IT object speaks one line in first person, deadpan (shape: a floppy disk saying "Back me up!"); the scene draws that object as the character with a simple face';
const FIT_DEVICES = [
  { d: CODE_PUN, styles: { terminal: 3, minimal: 2, diecut: 2, holo: 1, qr: 1, win95: 1, typo: 2 } },
  { d: TITLE_PUN, styles: { diecut: 3, minimal: 2, holo: 2, kawaii: 2, y2k: 1, typo: 3, badge: 5 } },
  { d: DIALOG, styles: { win95: 5, terminal: 2 } },
  { d: SIGN, styles: { diecut: 2, minimal: 2, poster: 1, y2k: 1, holo: 1 } },
  { d: STATUS, styles: { win95: 2, terminal: 2, y2k: 2, minimal: 1, holo: 1, diecut: 1, typo: 2 } },
  { d: OBJECT_VOICE, styles: { kawaii: 3, diecut: 2, qr: 1, minimal: 1 } },
];
// Twist a well-known IT saying with exactly one change (shape: "It worked on my
// machine" -> "It worked on my container"). Fits any open format.
const CANON_REMIX = 'canon remix - take one famous IT saying (it works on my machine, it is not a bug it is a feature, have you tried turning it off and on, there is no place like 127.0.0.1, nothing is as permanent as a temporary fix) and change exactly one word or ending so it becomes new; the original must be instantly recognizable and the change must be the joke';

// Deterministic per day: the same date always gets the same device.
function deviceFor(style, d) {
  if (STYLE_DEVICE[style]) return STYLE_DEVICE[style];
  const pool = [...DEVICES, CANON_REMIX, CANON_REMIX];
  for (const f of FIT_DEVICES) for (let i = 0; i < (f.styles[style] || 0); i++) pool.push(f.d);
  return pool[Math.floor(mulberry32(0xdeb1ce + d * 131)() * pool.length)];
}

// Some formats have a device built in.
const STYLE_DEVICE = {
  comic: 'two-beat setup and punchline where the punchline is a pun (quality bar: "How did the hacker get away?" / "He ran som ware")',
  popart: SNOWCLONE,
  masterpiece: 'classic art parody - a pun on the painting title plus IT subjects in the famous composition (quality bar: "AI GOTHIC")',
  sign: SIGN,
  objectchar: OBJECT_VOICE,
};

// Public-domain works only (created before 1929; artists long deceased).
export const MASTERPIECES = {
  scream: { name: 'The Scream', artist: 'Edvard Munch', year: '1893' },
  monalisa: { name: 'Mona Lisa', artist: 'Leonardo da Vinci', year: 'c. 1503' },
  starry: { name: 'The Starry Night', artist: 'Vincent van Gogh', year: '1889' },
  pearl: { name: 'Girl with a Pearl Earring', artist: 'Johannes Vermeer', year: 'c. 1665' },
  wave: { name: 'The Great Wave off Kanagawa', artist: 'Katsushika Hokusai', year: 'c. 1831' },
  adam: { name: 'The Creation of Adam', artist: 'Michelangelo', year: 'c. 1512' },
  venus: { name: 'The Birth of Venus', artist: 'Sandro Botticelli', year: 'c. 1485' },
  thinker: { name: 'The Thinker', artist: 'Auguste Rodin', year: '1904' },
  wanderer: { name: 'Wanderer above the Sea of Fog', artist: 'Caspar David Friedrich', year: '1818' },
  sunflowers: { name: 'Sunflowers', artist: 'Vincent van Gogh', year: '1888' },
};

// The reference stickers, so Haiku never recycles them.
const REFERENCE_JOKES = [
  'Your face has been breached. Please update.',
  'How did the hacker get away? He ran som ware.',
  'There is no crying in compliance.',
  'You had me at pseudonymization.',
  'AI Gothic.',
  // BulbaCraft "Computer Science" pack (reviewed 2026-09-28): remix the shapes, never the lines.
  'It worked on my machine.',
  "It's not a bug, it's a feature.",
  'There is no place like 127.0.0.1.',
  'Nothing is as permanent as a temporary fix.',
  'Have you tried turning it off and on again?',
  'My code works. I have no idea why.',
  'Task failed successfully.',
  'Are you sure you want to push to main? YES / OH NO',
  '404 Sleep Not Found.',
  '503 brain unavailable.',
  'Procrastination 100% complete.',
  '0 tests passed, 0 failed.',
  'O(no)',
  'Full Snack Developer.',
  'Open Sourcerer.',
  'Purrgrammer.',
  'DEV OOPS.',
  'Talk data to me.',
  'Everything is under CTRL.',
  'Merge conflict (yield sign).',
  'No deploy Fridays.',
  'Back me up! (floppy disk)',
  'TODO: everything.',
  'It is in the backlog.',
  'Project vFinal Final 3.doc',
  'Motivation 3% [charging]',
  'Full Stack Overflow Developer.',
  // Our own shape examples in the device descriptions above.
  'while(!coffee) sleep();',
  'CAUTION: Legacy Code Ahead.',
  'YIELD to change freeze.',
  'Push to main on Friday? [ YES ] [ OH NO ]',
  'It worked on my container.',
];

const EPOCH = Date.UTC(2026, 0, 1);
const mod = (n, m) => ((n % m) + m) % m;

export function chicagoDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// Deterministic PRNG so a date always maps to the same plan (re-runs and
// backfills are reproducible).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, seed) {
  const out = list.slice();
  const rnd = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// "Shuffled bag": every style appears exactly once per cycle, in a different
// order each cycle, and never twice in a row across a cycle boundary.
// REPLACED 2026-09-26: the old (day + cycle) % 4 formula let '95 Dialog land
// 3 times in 7 days (Sep 19-26).
function bagFor(list, salt, cycle) {
  const bag = shuffled(list, salt + cycle * 7919);
  if (cycle > 0) {
    const prevLast = shuffled(list, salt + (cycle - 1) * 7919).at(-1);
    if (bag[0] === prevLast) [bag[0], bag[1]] = [bag[1], bag[0]];
  }
  return bag;
}

// 2026-10-01: the bag grew from 13 to 17 styles. Earlier dates keep the
// 13-style bag, so regenerating an old day still gets its published style.
// BAG2_SALT was picked so the first 17-day cycle does not reopen with any of
// the last four 13-bag styles and all four new styles land in its first 9 days.
export const STYLE_CUTOVER = Math.round((Date.UTC(2026, 9, 1) - EPOCH) / 86400000);
const BAG1_SALT = 0x51c4e7;
const BAG2_SALT = 0xb4b15;

export function styleForDay(d) {
  if (d < STYLE_CUTOVER) return bagFor(STYLES_V1, BAG1_SALT, Math.floor(d / STYLES_V1.length))[mod(d, STYLES_V1.length)];
  const e = d - STYLE_CUTOVER, n = STYLES.length;
  return bagFor(STYLES, BAG2_SALT, Math.floor(e / n))[mod(e, n)];
}

export function planFor(date) {
  const d = Math.round((Date.parse(`${date}T00:00:00Z`) - EPOCH) / 86400000);
  const keys = Object.keys(TOPICS);
  // Topics cycle every 10 days, styles every 13 (shuffled bag), so pairings
  // keep drifting instead of locking into a fixed pattern. Adding the 10th
  // topic (code) on 2026-09-28 left every date through Oct 6 unchanged.
  const topic = keys[mod(d, keys.length)];
  const style = styleForDay(d);
  // Phase 2 (2026-09-28): about half of diecut and kawaii days use the warm
  // retro palette (orange, cream, teal, mustard) instead of neon/pastel.
  const warm = (style === 'diecut' || style === 'kawaii') && mulberry32(0x3a7e + d * 17)() < 0.5;
  return { date, dayIndex: d, topic, style, device: deviceFor(style, d), palette: mod(d, 6), warm };
}

// ------------------------------------------------------------------ copy
const STYLE_SCHEMA = {
  terminal: `"copy": {
    "title": "terminal window title, max 30 chars, e.g. 'bash - prod-db-01'",
    "user": "lowercase unix username, max 10 chars, e.g. oncall, helpdesk, intern",
    "command": "a plausible-looking but funny shell command, max 40 chars",
    "output": ["1 or 2 lines of terminal output, each max 40 chars; the punchline lands on the last line"]
  }`,
  win95: `"copy": {
    "window_title": "program name in the title bar, max 30 chars, e.g. 'Outlook.exe' or 'Change Advisory Board'",
    "icon": "one of: error, warning, info",
    "message": "the dialog message and punchline, max 80 chars; one sentence",
    "buttons": ["exactly two button labels, max 12 chars each; the second one is often the joke"]
  }`,
  diecut: `"copy": {
    "slogan": "punchy laptop-sticker slogan that works in ALL CAPS, max 22 chars",
    "tagline": "short banner line that completes or twists the slogan, max 28 chars"
  }`,
  poster: `"copy": {
    "title": "ONE word, max 11 letters, a mock corporate virtue, e.g. SYNERGY, RESILIENCE, ALIGNMENT",
    "caption": "the dry, demotivational caption, one sentence, max 90 chars"
  }`,
  minimal: `"copy": {
    "headline": "the whole joke in 1 to 5 words, max 24 chars, set huge in Swiss type; blunt and quotable, e.g. 'It was DNS.'",
    "caption": "one dry supporting line, max 50 chars (optional - an empty string is fine if the headline is complete)"
  }`,
  y2k: `"copy": {
    "headline": "chrome bubble-letter title, max 18 chars, reads like a 2001 product launch, e.g. 'Cloud Bill 2.0'",
    "sub": "loading-bar status text that delivers the punchline, max 38 chars, e.g. 'Loading your surprise invoice...'",
    "badge": "starburst badge word, max 7 chars, e.g. NEW!, BETA, HOT!, FREE*"
  }`,
  holo: `"copy": {
    "headline": "big holographic title, max 16 chars, 1 to 3 words, an IT buzzword or mantra",
    "footnote": "the punchline as a small-print footnote, max 50 chars",
    "tag": "collector tag, max 8 chars, e.g. LTD ED, 1 OF 1, RARE, v0.0.1"
  }`,
  botanical: `"copy": {
    "latin": "mock Latin binomial for an IT nuisance, Genus species, max 32 chars, e.g. 'Ticketus infinitus'",
    "common": "its common name, max 28 chars, e.g. 'Common Ticket Weed'",
    "note": "field-guide style note on its habits, dry and specific, max 70 chars"
  }`,
  kawaii: `"copy": {
    "name": "cute original character name for an IT thing, max 16 chars, e.g. Lil' Latency, Captain Cache",
    "type": "one-word element type, max 10 chars, e.g. NETWORK, CLOUD, LEGACY",
    "rarity": "integer 1 to 5",
    "ability_name": "signature move name, max 20 chars",
    "ability": "what the move does - this is the punchline, max 60 chars"
  }`,
  comic: `"copy": {
    "setup": "panel 1: the setup, usually a question, max 40 chars, e.g. 'How did the hacker get away?'",
    "punchline": "panel 2: the payoff, max 26 chars, MUST be a pun or double meaning on an IT term"
  }`,
  popart: `"copy": {
    "bubble": "what the dramatic 1960s comic character says, max 34 chars; one line ending on one gloriously nerdy IT term; a romance-comic cliche (swooning, heartbreak, jealousy, gasping) bent toward IT - NOT 'You had me at'"
  }`,
  masterpiece: `"copy": {
    "work": "ONE key from this list: ${Object.keys(MASTERPIECES).join(', ')}",
    "title": "parody title, max 18 chars, that SOUNDS like the original title with one word bent toward IT (The Scream -> The Screen, The Thinker -> The Tinkerer); a new unrelated title fails",
    "placard": "museum wall-label line, max 46 chars, dry, e.g. 'After Munch, 1893. Oil on server rack.'"
  }`,
  sign: `"copy": {
    "kind": "safety (a workplace safety sign with a colored header band) or road (a diamond road sign with a plaque underneath)",
    "header": "safety only: exactly one of ${Object.keys(SAFETY_HEADERS).join(', ')} - pick the severity that is funniest for this hazard",
    "message": "the sign text in terse official sign language (imperatives, no articles), max 44 chars for safety, max 30 for road; it is the punchline"
  }`,
  objectchar: `"copy": {
    "object": "what the character is, 1 to 3 words, max 20 chars, e.g. 'Floppy Disk', 'Ethernet Cable'",
    "says": "one first-person line the object says, deadpan, max 44 chars; this is the punchline"
  }`,
  typo: `"copy": {
    "words": "the whole joke in 1 to 4 words, max 24 chars, set huge in stacked type; it must work with no picture at all",
    "kicker": "optional tiny line under it, max 32 chars, or an empty string"
  }`,
  badge: `"copy": {
    "top": "arched text across the top: a mock club, society, league or department name, max 24 chars, e.g. 'LEGACY SYSTEMS SOCIETY'",
    "bottom": "arched text across the bottom: its motto, max 24 chars",
    "ribbon": "banner across the middle: a 1 to 3 word rank, title or merit, max 16 chars",
    "est": "founding line, max 10 chars, e.g. 'EST. 1998' or 'SINCE v0.1'"
  }`,
  qr: `"copy": {
    "teaser": "the setup as a question that makes people want to scan, max 44 chars, e.g. 'Who actually broke prod on Friday?'",
    "punchline": "the answer revealed after scanning, max 130 chars; it must pay off the teaser"
  }`,
};

const SCENE_GUIDE = {
  terminal: 'The scene will be tinted green like an old CRT, so describe one bold subject with a strong silhouette and clear shapes.',
  win95: 'The scene sits inside a wide 2:1 panel of a 1995 dialog box, so describe a wide composition with a clear focal subject.',
  diecut: 'The scene is cropped to a circle in the center of a laptop sticker, so describe ONE cute, expressive character, centered, on a plain white background. Often the best character is the IT object itself (a floppy disk, a mug, a router, a keyboard key) with a simple face.',
  poster: 'The scene is the photograph on an earnest 1990s motivational office poster, so describe a grand, cinematic, slightly ridiculous photo.',
  minimal: 'The scene is a small spot illustration inside a circle next to huge type, so describe ONE simple iconic object, no background clutter.',
  y2k: 'The scene fills a glossy wide screen on a 2001-era candy-colored sticker, so describe a playful object or gadget with chrome and translucent plastic.',
  holo: 'The scene sits in a circle on a holographic foil sticker, so describe ONE shiny, iridescent, floating object, centered.',
  botanical: 'The scene is the specimen on a vintage botanical plate, so describe a single plant whose leaves, flowers, roots or fruit are made of IT objects (cables, keys, sticky notes, server lights), on plain paper.',
  kawaii: 'The scene is the art window of a collectible character card, so describe ONE original cute chibi mascot personifying the IT thing, full body, centered, simple pastel background.',
  qr: 'The scene is a square picture beside a QR code, so describe ONE bold, simple object that hints at the setup without giving away the punchline.',
  comic: 'The scene is a black-and-white comic panel, so describe ONE simple cartoon character, centered, with a big clear facial expression that fits the setup, on plain white.',
  popart: 'The scene is a 1960s pop-art comic panel, so describe ONE original character, head and shoulders, with a big dramatic expression (swooning, shocked or smug) that matches what they say.',
  sign: 'The scene becomes a solid black pictogram on a safety sign, so describe ONE simple silhouette (a stick figure doing something, or one object) that shows the hazard literally, like a real safety-sign icon. No background, no scenery.',
  objectchar: 'The scene is the character itself, so describe ONE everyday IT object (name it) with a simple face and an expression that fits its line, centered, on plain white.',
  typo: 'This style has no picture; set the scene to the single word "none".',
  badge: 'The scene is the round emblem in the middle of a vintage club badge, so describe ONE central subject (an object, a small robot, or a mascot animal with IT gear) in a simple proud pose.',
  masterpiece: 'The scene recreates the chosen public-domain painting in its famous composition, with the people replaced by friendly robots or the key objects replaced by IT things. Name the painting in the scene.',
};

// How the joke works in each format (fed to Haiku with the schema).
const FORMAT_GUIDE = {
  minimal: 'The headline IS the joke; fewer words is better.',
  y2k: 'Treat an IT problem like a flashy early-2000s product launch.',
  holo: 'A mantra or buzzword, glorified, then undercut by the footnote.',
  botanical: 'Classify an IT nuisance as if it were a plant species; the Latin pun and the habits note carry the joke.',
  kawaii: 'Personify an IT thing as an adorable collectible character; the ability text is the punchline.',
  comic: 'Setup in panel 1, punchline in panel 2. The punchline MUST be wordplay on an IT term (a pun, a split word, a double meaning) - a plain answer or observation fails. Panel 2 shows a close-up of the same character reacting.',
  popart: 'One spoken line. It should sound like a romance-comic heroine or hero reacting to something deeply technical.',
  masterpiece: 'The parody title does the work and must still be recognizable as the original title when read aloud; pick the painting whose title bends best toward the topic.',
  sign: 'Treat a small IT annoyance as an official workplace or road hazard. Terse sign grammar is the joke; the pictogram shows the hazard literally.',
  objectchar: 'The object says what it would say if it could talk - self-aware and deadpan, about its own job or how it gets treated. It never explains the joke.',
  typo: 'No picture, so the words carry everything: a pun, a job-title badge, a remixed classic or a status-code mood. Something people would wear on a laptop.',
  badge: 'A fake club or merit badge for an IT habit or survival skill: earnest vintage style, undercut by the motto. The owner wears it proudly.',
  qr: 'The teaser must NOT contain the punchline - the sticker withholds it until someone scans. The headline and alt_text must not give the punchline away either; describe the setup only.',
};

function systemPrompt() {
  return `You are the head writer for stickers.stluker.com, which publishes ONE funny information-technology sticker per day. You write like a veteran sysadmin with 20 years of on-call scars and a good heart.

Audience and guardrails:
- Safe for work and for the whole family. No profanity, no innuendo, no politics, no religion, no violence.
- Office-safe snark is welcome: jabs at vendors and products by name (Microsoft, AWS, Oracle, Cisco, Google, Salesforce, Jira, etc.) and gentle teasing of end users, managers, and IT staff themselves.
- Never target real named private individuals or protected groups. Punch at situations, products, and job roles.
- The joke must be understandable by anyone who has worked near an IT department, and land in under five seconds of reading.

Quality bar - these published conference stickers are the standard (never reuse them):
- "YOUR FACE HAS BEEN BREACHED. PLEASE UPDATE." (literalized jargon)
- "How did the hacker get away?" / "He ran som ware." (two-beat pun)
- "There is no crying in compliance." (snowclone of a famous line)
- "You had me at pseudonymization." (snowclone ending on one gloriously nerdy word)
- "AI GOTHIC" over a robot version of a famous painting (art parody; the title pun does all the work)
Never reuse their TEMPLATES either: no "You had me at...", "There is no crying in...", "Your ___ has been breached", "How did the ___ get away", or "AI ___" titles. Find a different famous line or a fresh construction.
The best commercial laptop-sticker packs add three more lessons: (1) the FORMAT can be the joke - a dialog box, a road sign, a line of code or a status code tells the reader how to read it before they read it; (2) the best stickers are identity badges people want on their OWN laptop, so IT people laughing at their own habits beats mocking someone else; (3) 0 to 6 words is normal, and a sticker that needs a paragraph has lost.
What they share: ONE idea; 3 to 8 words carry the whole joke and read from across a room; one precise insider term does the heavy lifting; the picture sets the stage instead of repeating the words. Never explain the joke. If a line needs a second sentence to be funny, it is not the line - cut it.

Writing rules:
- Plain ASCII only: straight quotes, hyphens (never em dashes), no emoji, no curly quotes.
- Be specific, not generic. A concrete detail (a port number, a ticket number, a real-sounding filename) beats a vague one.
- Respect every character limit exactly; shorter is funnier. Limits are ceilings, not targets.
- Snowclones may borrow the recognizable shape of a famous short line (under 10 words). Never quote song lyrics, poems, or longer passages.

Image scene rules (the "scene" field):
- Describe only what is visible: subject, action, setting, lighting. 20 to 45 words.
- Absolutely no text, letters, numbers, signs, screens with writing, logos, brand marks, real people, or copyrighted characters in the scene. Vendor names may appear in the copy, never in the image. (Exception: the masterpiece format may name its public-domain painting; its figures become robots or objects.)
- The picture should set up or amplify the joke on its own.

Respond with a single JSON object and nothing else.`;
}

function userPrompt(plan, recent) {
  const t = TOPICS[plan.topic];
  const avoid = [...recent, ...REFERENCE_JOKES].map((h) => `- ${h}`).join('\n');
  const works = plan.style === 'masterpiece'
    ? `\n- Public-domain paintings available: ${Object.entries(MASTERPIECES).map(([k, m]) => `${k} = ${m.name} (${m.artist}, ${m.year})`).join('; ')}.`
    : '';
  return `Today's sticker (${plan.date}):
- Topic: ${t.label}. Territory to mine: ${t.hint}.
- Visual style: ${plan.style}. ${SCENE_GUIDE[plan.style]}${FORMAT_GUIDE[plan.style] ? ' ' + FORMAT_GUIDE[plan.style] : ''}
- Comedic device to use: ${plan.device}.${works}

Do not repeat or closely echo any of these earlier stickers:
${avoid}

Return JSON with exactly these keys:
{
  "headline": "the joke restated in plain words for the archive listing, max 80 chars",
  ${STYLE_SCHEMA[plan.style]},
  "scene": "image scene description following the scene rules",
  "alt_text": "accessible description of the finished sticker including its text, max 200 chars",
  "tags": ["2 to 4 short lowercase tags"]
}`;
}

function extractJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no JSON object in model output');
  return JSON.parse(text.slice(a, b + 1));
}

function normalize(style, raw) {
  const c = raw.copy || {};
  let copy;
  if (style === 'terminal') {
    const output = (Array.isArray(c.output) ? c.output : [c.output]).map((s) => clip(s, 60)).filter(Boolean).slice(0, 3);
    copy = { title: clip(c.title || 'bash', 34), user: toAscii(c.user || 'root'), command: clip(c.command, 60), output };
    if (!copy.command || !output.length) throw new Error('terminal copy incomplete');
  } else if (style === 'win95') {
    const buttons = (Array.isArray(c.buttons) ? c.buttons : ['OK']).map((s) => clip(s, 16)).filter(Boolean).slice(0, 2);
    copy = { window_title: clip(c.window_title || 'System', 34), icon: ['error', 'warning', 'info'].includes(c.icon) ? c.icon : 'error', message: clip(c.message, 130), buttons: buttons.length ? buttons : ['OK'] };
    if (!copy.message) throw new Error('win95 copy incomplete');
  } else if (style === 'diecut') {
    copy = { slogan: clip(c.slogan, 24), tagline: clip(c.tagline, 30) };
    if (!copy.slogan || !copy.tagline) throw new Error('diecut copy incomplete');
  } else if (style === 'poster') {
    copy = { title: clip(String(c.title || '').split(/\s+/)[0], 12), caption: clip(c.caption, 130) };
    if (!copy.title || !copy.caption) throw new Error('poster copy incomplete');
  } else if (style === 'minimal') {
    copy = { headline: clip(c.headline, 26), caption: clip(c.caption, 80) };
    if (!copy.headline) throw new Error('minimal copy incomplete');
  } else if (style === 'y2k') {
    copy = { headline: clip(c.headline, 20), sub: clip(c.sub, 40), badge: clip(c.badge || 'NEW!', 8) };
    if (!copy.headline || !copy.sub) throw new Error('y2k copy incomplete');
  } else if (style === 'holo') {
    copy = { headline: clip(c.headline, 16), footnote: clip(c.footnote, 52), tag: clip(c.tag || 'LTD ED', 10) };
    if (!copy.headline || !copy.footnote) throw new Error('holo copy incomplete');
  } else if (style === 'botanical') {
    copy = { latin: clip(c.latin, 34), common: clip(c.common, 30), note: clip(c.note, 110) };
    if (!copy.latin || !copy.common) throw new Error('botanical copy incomplete');
  } else if (style === 'kawaii') {
    const rarity = Math.max(1, Math.min(5, parseInt(c.rarity, 10) || 3));
    copy = { name: clip(c.name, 18), type: clip(c.type, 12), rarity, ability_name: clip(c.ability_name, 22), ability: clip(c.ability, 90) };
    if (!copy.name || !copy.ability) throw new Error('kawaii copy incomplete');
  } else if (style === 'comic') {
    copy = { setup: clip(c.setup, 44), punchline: clip(c.punchline, 30) };
    if (!copy.setup || !copy.punchline) throw new Error('comic copy incomplete');
  } else if (style === 'popart') {
    copy = { bubble: clip(c.bubble, 40) };
    if (!copy.bubble) throw new Error('popart copy incomplete');
  } else if (style === 'masterpiece') {
    const work = MASTERPIECES[c.work] ? c.work : 'scream';
    const m = MASTERPIECES[work];
    copy = { work, title: clip(c.title, 20), placard: clip(c.placard || `After ${m.artist.split(' ').pop()}, ${m.year}.`, 50) };
    if (!copy.title) throw new Error('masterpiece copy incomplete');
  } else if (style === 'sign') {
    const kind = c.kind === 'road' ? 'road' : 'safety';
    const header = String(c.header || '').toUpperCase();
    copy = { kind, header: SAFETY_HEADERS[header] ? header : 'CAUTION', message: clip(c.message, kind === 'road' ? 34 : 48) };
    if (!copy.message) throw new Error('sign copy incomplete');
  } else if (style === 'objectchar') {
    copy = { object: clip(c.object, 22), says: clip(c.says, 48) };
    if (!copy.object || !copy.says) throw new Error('objectchar copy incomplete');
  } else if (style === 'typo') {
    copy = { words: clip(c.words, 30), kicker: clip(c.kicker || '', 36) };
    if (!copy.words) throw new Error('typo copy incomplete');
  } else if (style === 'badge') {
    copy = { top: clip(c.top, 26), bottom: clip(c.bottom, 26), ribbon: clip(c.ribbon, 18), est: clip(c.est || 'EST. 1999', 12) };
    if (!copy.top || !copy.ribbon) throw new Error('badge copy incomplete');
  } else if (style === 'qr') {
    copy = { teaser: clip(c.teaser, 48), punchline: clip(c.punchline, 140) };
    if (!copy.teaser || !copy.punchline) throw new Error('qr copy incomplete');
  } else {
    throw new Error(`no copy normalizer for style ${style}`);
  }
  const headline = clip(raw.headline, 90);
  if (!headline) throw new Error('missing headline');
  const tags = (Array.isArray(raw.tags) ? raw.tags : []).map((s) => clip(s, 20).toLowerCase()).filter(Boolean).slice(0, 4);
  return { headline, copy, scene: stripQuoted(raw.scene || ''), alt_text: clip(raw.alt_text || headline, 220), tags };
}

async function writeCopy(env, plan, recent) {
  if (env.MOCK_AI === '1') return normalize(plan.style, mockCopy(plan));
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: env.TEXT_MODEL || 'claude-haiku-4-5',
          max_tokens: 900,
          system: systemPrompt(),
          messages: [{ role: 'user', content: userPrompt(plan, recent) }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      return normalize(plan.style, extractJson(text));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// ------------------------------------------------------------------ art
// Style-specific art direction. The image model draws ONLY the picture; all
// lettering is set by the SVG template, because image models still mangle
// text. Per-style SVG filters (green phosphor, posterize, saturation) then
// pull every day's output toward a consistent look.
const ART_DIRECTION = {
  terminal: 'Retro 1980s computer-game illustration, high-contrast monochrome line art on a pure black background, bold clean outlines, subtle pixel-art texture, dramatic rim lighting, crisp detail.',
  win95: 'Mid-1990s CD-ROM clip-art and early 3D render aesthetic, glossy primitive shapes, saturated primary colors, soft studio lighting, plain light gradient background, playful and slightly absurd.',
  diecut: 'Premium vector sticker illustration, thick uniform black outlines, flat vibrant colors with simple cel shading, one cute expressive character with big eyes (a mascot, or an everyday object given a simple face), centered and fully in frame, isolated on a plain solid white background, polished and professional.',
  poster: 'Epic cinematic stock photograph, photorealistic, dramatic golden-hour natural light, shallow depth of field, 35mm lens, rich detail, earnest and majestic mood.',
  minimal: 'Minimalist flat vector spot illustration, one simple iconic object, bold geometric shapes, two or three flat colors, Swiss modernist design, crisp edges, plain white background, lots of negative space.',
  y2k: 'Y2K early-2000s 3D render, glossy chrome and translucent candy-colored plastic, bubbly rounded shapes, iridescent highlights, hot pink, electric blue and lime palette, soft studio lighting, playful retro-futuristic tech.',
  holo: 'Holographic iridescent 3D render, prismatic foil and chrome surfaces, rainbow light refraction, pastel holo palette of pink, lavender, mint and peach, floating centered object, glossy, dreamy, maximalist sparkle.',
  botanical: 'Vintage 19th-century botanical engraving, fine hand-drawn ink linework with delicate cross-hatching and a soft watercolor wash, scientific specimen plate style, single plant centered, plain off-white paper background, muted natural colors.',
  kawaii: 'Kawaii chibi character illustration, original mascot, big sparkly eyes, rosy cheeks, soft rounded proportions, thick clean outlines, pastel colors with gentle cel shading, full body, centered, simple pastel background, collectible vinyl toy charm.',
  qr: 'Bold flat graphic illustration, single object, high contrast, cobalt blue, bright yellow and white palette, clean vector poster style, strong silhouette, plain background.',
  comic: 'Minimal black ink cartoon line art, one simple round-bodied character with a big expressive face, thick uniform black outlines, solid black fills, pure white background, newspaper comic strip style, character centered in the frame.',
  popart: '1960s pop-art romance comic illustration, original character, head and shoulders on the LEFT half of the frame facing right, empty space on the right, bold black ink outlines, flat saturated primary colors, visible Ben-Day halftone dots, glossy lips and dramatic eyes, retro hairstyle, plain flat sky-blue background.',
  sign: 'Official safety-sign pictogram in ISO 7010 / ANSI style: one solid pure black silhouette on a pure white background, flat, no gray, no shading, no gradients, bold simple geometric shapes, centered with generous margin, instantly readable at small size.',
  objectchar: 'Retro 1990s sticker illustration of ONE everyday IT object drawn as a cute character with a simple face (dot eyes, small mouth, optional tiny arms and legs), thick uniform black outlines, flat warm retro colors of burnt orange, cream, teal and mustard, simple cel shading, centered and fully in frame, plain solid white background.',
  badge: 'Vintage mid-century screen-printed badge illustration, limited palette of four muted colors (navy, burnt orange, cream, mustard), bold simple shapes, subtle grain texture, one central emblem subject, centered, round composition, plain cream background, retro outdoors-patch style.',
  masterpiece: 'Flat vector illustration parody of a famous public-domain painting, faithful to the original composition, palette and mood, clean geometric shapes with subtle painterly texture, museum-quality, full bleed, figures replaced by friendly white robots or IT objects.',
};
// Phase 2 warm variant, appended when plan.warm is set (diecut, kawaii).
const WARM_ART = ' Color palette: warm retro burnt orange, cream, teal and mustard yellow, like a 1990s vinyl sticker.';
const ART_RULES = 'Single clear focal subject, strong silhouette, clean uncluttered composition with generous negative space. No text, no letters, no words, no numbers, no signage, no logos, no watermark, no signature, no frame, no border.';

export function buildImagePrompt(style, scene, warm = false) {
  return `${ART_DIRECTION[style]}${warm ? WARM_ART : ''} Scene: ${scene} ${ART_RULES}`;
}

function sniffMime(b64) {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

// Per-style model order. Short names resolve via MODEL_IDS; the schnell
// fallback is always appended last. Override without a code change by setting
// the STYLE_IMAGE_MODELS var in wrangler.jsonc to JSON, e.g.
//   {"diecut":["flux2"],"win95":["lucid","flux2"]}
const DEFAULT_STYLE_MODELS = {
  terminal: ['flux2'],          // photographic silhouettes survive the green tint best
  win95: ['lucid', 'flux2'],    // glossy clip-art / graphic look = Lucid's strength
  diecut: ['lucid', 'flux2'],   // bold outlined mascot illustration = Lucid's strength
  poster: ['flux2'],            // photoreal "stock photo" = FLUX.2's strength
  // 2026 trend styles: all illustration-led, where Lucid won both A/B tests.
  minimal: ['lucid', 'flux2'],
  y2k: ['lucid', 'flux2'],
  holo: ['lucid', 'flux2'],
  botanical: ['lucid', 'flux2'],
  kawaii: ['lucid', 'flux2'],
  qr: ['lucid', 'flux2'],
  comic: ['lucid', 'flux2'],
  popart: ['lucid', 'flux2'],
  masterpiece: ['lucid', 'flux2'],
  // Sticker-pack styles (2026-09-28). typo has no art.
  sign: ['lucid', 'flux2'],
  objectchar: ['lucid', 'flux2'],
  badge: ['lucid', 'flux2'],
};

function modelIds(env) {
  return {
    flux2: env.IMAGE_MODEL || '@cf/black-forest-labs/flux-2-dev',
    lucid: env.LUCID_MODEL || '@cf/leonardo/lucid-origin',
    schnell: env.IMAGE_FALLBACK_MODEL || '@cf/black-forest-labs/flux-1-schnell',
  };
}

export function modelChainFor(env, style) {
  let map = DEFAULT_STYLE_MODELS;
  if (env.STYLE_IMAGE_MODELS) {
    try { map = { ...DEFAULT_STYLE_MODELS, ...JSON.parse(env.STYLE_IMAGE_MODELS) }; }
    catch (e) { console.error('STYLE_IMAGE_MODELS is not valid JSON, using defaults'); }
  }
  const ids = modelIds(env);
  const chain = [...(map[style] || ['flux2']), 'schnell'].map((k) => ids[k] || k);
  return [...new Set(chain)];
}

export function resolveModel(env, nameOrId) {
  return modelIds(env)[nameOrId] || nameOrId;
}

function seedFor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 2147483647;
}

function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Workers AI image models do not all answer in the same shape (pod's code hit
// this too): base64 string in .image, a ReadableStream, or raw bytes.
async function imageToB64(out) {
  if (typeof out?.image === 'string') return out.image.replace(/^data:[^;]+;base64,/, '');
  if (out instanceof ReadableStream) return bytesToB64(new Uint8Array(await new Response(out).arrayBuffer()));
  if (out instanceof ArrayBuffer) return bytesToB64(new Uint8Array(out));
  if (out instanceof Uint8Array) return bytesToB64(out);
  throw new Error(`unrecognized image response shape: ${Object.prototype.toString.call(out)}`);
}

async function runImageModel(env, model, prompt, [w, h], seedKey) {
  let out;
  if (model.includes('flux-2')) {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('width', String(w));
    form.append('height', String(h));
    if (model.includes('flux-2-dev')) form.append('steps', '28');
    const packed = new Response(form);
    out = await env.AI.run(model, { multipart: { body: packed.body, contentType: packed.headers.get('content-type') } });
  } else if (model.includes('lucid-origin') || model.includes('phoenix')) {
    // Same parameter shape Creature Clash runs in production daily.
    out = await env.AI.run(model, { prompt: prompt.slice(0, 2000), width: w, height: h, guidance: 6, num_steps: 30, seed: seedFor(seedKey || prompt) });
  } else {
    out = await env.AI.run(model, { prompt, steps: 8 });
  }
  const b64 = await imageToB64(out);
  if (b64.length < 2000) throw new Error(`${model} returned no image`);
  return { b64, mime: sniffMime(b64), model };
}

async function makeArt(env, plan, scene, chain) {
  if (env.MOCK_AI === '1' || TEXT_ONLY.has(plan.style)) return null;
  const prompt = buildImagePrompt(plan.style, scene, plan.warm);
  const models = chain || modelChainFor(env, plan.style);
  const errors = [];
  for (const m of models) {
    try {
      return { ...(await runImageModel(env, m, prompt, ART_SIZE[plan.style], plan.date)), prompt };
    } catch (e) {
      errors.push(`${m}: ${String(e.message || e)}`);
    }
  }
  console.error('image generation failed', errors);
  return { failed: errors.join(' | '), prompt };
}

function b64ToBytes(b64) {
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(b64);
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

// ------------------------------------------------------------------ run
export async function runDaily(env, trigger, { date, force = false } = {}) {
  const id = date || chicagoDate();
  const started = new Date().toISOString();
  const log = (ok, detail) => env.DB.prepare('INSERT INTO runs (started_at, finished_at, sticker_id, trigger, ok, detail) VALUES (?,?,?,?,?,?)')
    .bind(started, new Date().toISOString(), id, trigger, ok ? 1 : 0, clip(detail, 900)).run();

  if (!force) {
    const exists = await env.DB.prepare('SELECT id FROM stickers WHERE id = ?').bind(id).first();
    if (exists) return { ok: true, skipped: true, id, reason: 'already generated' };
  }

  try {
    const plan = planFor(id);
    const { results } = await env.DB.prepare('SELECT headline FROM stickers WHERE id != ? ORDER BY id DESC LIMIT 40').bind(id).all();
    const content = await writeCopy(env, plan, results.map((r) => r.headline));
    const artResult = await makeArt(env, plan, content.scene);
    const art = artResult && artResult.b64 ? artResult : null;

    const meta = { date: id, dayIndex: plan.dayIndex, topicKey: plan.topic, topicLabel: TOPICS[plan.topic].label, palette: plan.palette, warm: !!plan.warm, title: content.headline, siteUrl: env.SITE_URL || 'https://stickers.stluker.com' };
    const svg = compose(plan.style, content.copy, art, meta);
    const printSvg = compose(plan.style, content.copy, art, meta, { print: true });

    const svgMeta = { httpMetadata: { contentType: 'image/svg+xml; charset=utf-8' } };
    await env.ART.put(`svg/${id}.svg`, svg, svgMeta);
    await env.ART.put(`svg/${id}-print.svg`, printSvg, svgMeta);
    if (art) await env.ART.put(`art/${id}`, b64ToBytes(art.b64), { httpMetadata: { contentType: art.mime } });
    else await env.ART.delete(`art/${id}`);

    const now = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO stickers (id, created_at, topic, style, headline, copy_json, tags, scene, image_prompt, alt_text, text_model, image_model, has_art, status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'published')
      ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at, topic=excluded.topic, style=excluded.style, headline=excluded.headline,
        copy_json=excluded.copy_json, tags=excluded.tags, scene=excluded.scene, image_prompt=excluded.image_prompt, alt_text=excluded.alt_text,
        text_model=excluded.text_model, image_model=excluded.image_model, has_art=excluded.has_art`)
      .bind(id, now, plan.topic, plan.style, content.headline, JSON.stringify(content.copy), content.tags.join(','), content.scene,
        artResult ? artResult.prompt : null, content.alt_text, env.MOCK_AI === '1' ? 'mock' : (env.TEXT_MODEL || 'claude-haiku-4-5'),
        art ? art.model : 'none', art ? 1 : 0)
      .run();

    const detail = art ? `ok ${plan.topic}/${plan.style} via ${art.model}`
      : TEXT_ONLY.has(plan.style) ? `ok ${plan.topic}/${plan.style} (type only, no art by design)`
        : `ok ${plan.topic}/${plan.style}, NO ART (${artResult?.failed || 'mock'})`;
    await log(true, detail);
    return { ok: true, id, topic: plan.topic, style: plan.style, headline: content.headline, imageModel: art ? art.model : 'none', artError: artResult?.failed };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    console.error('runDaily failed', msg);
    await log(false, msg).catch(() => {});
    return { ok: false, id, error: msg };
  }
}

// A/B helper for POST /admin/compare: one Haiku call, the same scene rendered
// by each requested model, nothing saved to R2 or D1.
export async function compareArt(env, date, modelNames) {
  const plan = planFor(date);
  const { results } = await env.DB.prepare('SELECT headline FROM stickers WHERE id != ? ORDER BY id DESC LIMIT 40').bind(date).all();
  const content = await writeCopy(env, plan, results.map((r) => r.headline));
  const meta = { date, dayIndex: plan.dayIndex, topicKey: plan.topic, topicLabel: TOPICS[plan.topic].label, palette: plan.palette, warm: !!plan.warm, title: content.headline, siteUrl: env.SITE_URL || 'https://stickers.stluker.com' };
  const out = [];
  for (const name of modelNames) {
    const id = resolveModel(env, name);
    const t0 = Date.now();
    const art = await makeArt(env, plan, content.scene, [id]);
    const ok = !!(art && art.b64);
    out.push({ model: id, ok, ms: Date.now() - t0, error: ok ? undefined : (art?.failed || 'no art (MOCK_AI?)'), svg: compose(plan.style, content.copy, ok ? art : null, meta) });
  }
  return { date, topic: plan.topic, style: plan.style, headline: content.headline, scene: content.scene, results: out };
}

// Canned copy for local testing (MOCK_AI=1 in .dev.vars). Never used in prod.
function mockCopy(plan) {
  const copy = {
    terminal: { title: 'bash - prod-dns-01', user: 'oncall', command: 'dig +short why-is-everything-down.corp', output: [';; ANSWER SECTION:', 'why-is-everything-down. 300 IN TXT', '"it was DNS. it is always DNS."'] },
    win95: { window_title: 'Outlook.exe', icon: 'error', message: 'Your mailbox is 99.9% full. Please delete the 40,000 emails you are definitely going to read later.', buttons: ['Archive', 'Pretend'] },
    diecut: { slogan: 'IT WORKS ON MY MACHINE', tagline: 'Ship the machine then' },
    poster: { title: 'SYNERGY', caption: 'Nine people, one Jira ticket, and a meeting to schedule the meeting about it.' },
    minimal: { headline: 'It was DNS.', caption: 'It is always DNS. Even when it is not DNS, it was DNS.' },
    y2k: { headline: 'Cloud Bill 2.0', sub: 'Loading your surprise invoice...', badge: 'NEW!' },
    holo: { headline: 'ZERO TRUST', footnote: 'Trust no one. Especially the intern with admin.', tag: 'LTD ED' },
    botanical: { latin: 'Ticketus infinitus', common: 'Common Ticket Weed', note: 'Blooms every Monday. Cannot be closed, only reassigned.' },
    kawaii: { name: "Lil' Latency", type: 'NETWORK', rarity: 4, ability_name: 'Fashionably Late', ability: 'Arrives 300ms after you needed it and acts like nothing happened.' },
    qr: { teaser: 'Who actually broke prod on Friday?', punchline: 'You did. The deploy was yours. The rollback was also yours.' },
    comic: { setup: 'Why did the DBA leave the party early?', punchline: 'Too many joins' },
    popart: { bubble: 'You had me at idempotent' },
    masterpiece: { work: 'scream', title: 'THE STREAM', placard: 'After Munch, 1893. Kafka on panic.' },
    sign: plan.dayIndex % 2
      ? { kind: 'road', message: 'Legacy code next 40 miles' }
      : { kind: 'safety', header: 'WARNING', message: 'Mandatory fun ahead. Hard hats required.' },
    objectchar: { object: 'Floppy Disk', says: 'I held 1.44 MB and I held it with pride.' },
    typo: { words: 'Ctrl Alt Defeat', kicker: 'three-finger salute to Monday' },
    badge: { top: 'Legacy Systems Society', bottom: 'We do not touch it', ribbon: 'Uptime Scout', est: 'EST. 1998' },
  }[plan.style];
  return { headline: `Mock ${plan.style} sticker about ${TOPICS[plan.topic].label}`, copy, scene: 'a small robot holding a coffee mug beside a tangle of network cables', alt_text: 'Mock sticker for local testing', tags: ['mock', plan.topic] };
}
