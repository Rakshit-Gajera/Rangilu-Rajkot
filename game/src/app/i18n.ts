/**
 * English / ગુજરાતી UI text (PROMPT §9.8). `t(key)` returns the current language's string; the choice is
 * kept in settings. Place names stay as mapped (bilingual where the map has Gujarati names).
 */
export type Lang = 'en' | 'gu';

const STRINGS = {
  title: { en: 'Rangilu Rajkot', gu: 'રંગીલું રાજકોટ' },
  tagline: { en: 'Ride, explore and live a day in Rajkot', gu: 'રાજકોટમાં ફરો, શોધો અને એક દિવસ જીવો' },
  play: { en: 'Play', gu: 'રમો' },
  name: { en: 'Your name', gu: 'તમારું નામ' },
  skin: { en: 'Skin tone', gu: 'ત્વચાનો રંગ' },
  outfit: { en: 'Outfit', gu: 'પોશાક' },
  shirtColour: { en: 'Shirt colour', gu: 'શર્ટનો રંગ' },
  language: { en: 'ગુજરાતી', gu: 'English' },
  help: {
    en: 'E get on/off · H horn · M map · J activities · L discoveries · Tab sandbox · P photo · Esc menu',
    gu: 'E ચઢો/ઉતરો · H હોર્ન · M નકશો · J પ્રવૃત્તિઓ · L શોધો · Tab સેન્ડબોક્સ · P ફોટો · Esc મેનુ',
  },
  ride: { en: 'E — ride the', gu: 'E — ચલાવો:' },
  drive: { en: 'E — drive the', gu: 'E — ચલાવો:' },
  take: { en: 'E — take this vehicle', gu: 'E — આ વાહન લો' },
  welcomeBack: { en: 'Welcome back', gu: 'ફરી સ્વાગત છે' },
  welcome: { en: 'Kem cho', gu: 'કેમ છો' },
  arrived: { en: 'You have arrived', gu: 'તમે પહોંચી ગયા' },
  travelling: { en: 'Travelling…', gu: 'મુસાફરી…' },
  loading: { en: 'Loading', gu: 'લોડ થાય છે' },
  paused: { en: 'Paused', gu: 'થોભાવ્યું' },
  resume: { en: 'Resume', gu: 'ચાલુ રાખો' },
  edge: { en: "You've reached the edge of Rajkot", gu: 'તમે રાજકોટની સીમા પર પહોંચ્યા' },
} as const;

export type Key = keyof typeof STRINGS;
let lang: Lang = 'en';

export function setLang(l: Lang) {
  lang = l;
  document.documentElement.lang = l;
}

export function getLang(): Lang { return lang; }

export function t(key: Key): string {
  return STRINGS[key][lang];
}
