import * as THREE from 'three';
import type { Agent, Life } from './life';

/**
 * Street conversations and animal calls (PROMPT §3.4, §9.7). Near the player, two passers-by sometimes stop,
 * face each other and chat — speech bubbles in Gujarati (with an English gloss) and a babbling voice.
 * Cows moo and dogs bark now and then (dogs more at night).
 */
const LINES: [string, string][] = [
  ['કેમ છો?', 'How are you?'], ['મજામાં!', 'All good!'], ['ચા પીવી છે?', 'Tea?'], ['હા, ચાલો!', 'Yes, let\'s go!'],
  ['આજે બહુ ગરમી છે', 'So hot today'], ['ગાંઠિયા લીધા?', 'Got ganthiya?'], ['જય શ્રી કૃષ્ણ', 'Jai Shri Krishna'],
  ['ક્યાં જાઓ છો?', 'Where are you off to?'], ['રેસકોર્સ', 'Race Course'], ['સારું, આવજો!', 'Okay, bye!'],
  ['ટ્રાફિક બહુ છે', 'So much traffic'], ['મેચ જોઈ?', 'Did you watch the match?'], ['હા ભાઈ!', 'Yes, bhai!'],
  ['વરસાદ આવશે', 'It\'s going to rain'], ['નવરાત્રિ આવે છે!', 'Navratri is coming!'], ['બરાબર', 'Right'],
];

interface Chat { a: Agent; b: Agent; left: number; turn: number; next: number; el: HTMLDivElement; line: number; pitch: [number, number] }

export class StreetTalk {
  private chats: Chat[] = [];
  private seek = 2;
  private animal = 3;
  private layer: HTMLDivElement;
  private v = new THREE.Vector3();

  constructor(private life: Life, private camera: THREE.Camera,
    private sound: { speak(d: number, pitch: number, syl: number): void; moo(d: number): void; bark(d: number): void }) {
    this.layer = document.createElement('div');
    this.layer.id = 'talk';
    document.body.appendChild(this.layer);
  }

  update(dt: number, player: THREE.Vector3, night: number) {
    const px = player.x, pn = -player.z;
    const agents = this.life.agents;
    // Start a new conversation now and then: two people walking near each other, close to the player.
    if ((this.seek -= dt) <= 0) {
      this.seek = 3 + Math.random() * 4;
      if (this.chats.length < 3) {
        const busy = new Set(this.chats.flatMap((c) => [c.a, c.b]));
        const peds = agents.filter((a) => a.kind === 'ped' && !busy.has(a) && Math.hypot(a.x - px, a.n - pn) < 70);
        // Someone near you, and whoever is nearest them (or a friend who walks up).
        const A = peds.sort((p, q) => Math.hypot(p.x - px, p.n - pn) - Math.hypot(q.x - px, q.n - pn))[Math.floor(Math.random() * Math.min(3, peds.length))]
          ?? this.life.pedestrianNear(px, pn) ?? undefined;
        let B = A ? peds.filter((q) => q !== A && Math.hypot(q.x - A.x, q.n - A.n) < 6)[0] : undefined;
        if (A && !B) B = this.life.companion(A) ?? undefined;
        if (A && B) {
          const el = document.createElement('div');
          el.className = 'bubble';
          this.layer.appendChild(el);
          const len = 8 + Math.random() * 8;
          A.talk = B.talk = len;
          this.chats.push({ a: A, b: B, left: len, turn: 0, next: 0.6, el, line: Math.floor(Math.random() * LINES.length),
            pitch: [120 + Math.random() * 120, 120 + Math.random() * 120] });
        }
      }
    }
    // Run conversations: alternate speakers; the bubble follows the speaker on screen.
    for (let k = this.chats.length - 1; k >= 0; k--) {
      const c = this.chats[k];
      const A = c.a, B = c.b;
      c.left -= dt;
      if (A.gone || B.gone || c.left <= 0) {
        A.talk = 0;
        B.talk = 0;
        c.el.remove();
        this.chats.splice(k, 1);
        continue;
      }
      // Face each other.
      A.faceYaw = Math.atan2(B.x - A.x, B.n - A.n);
      B.faceYaw = Math.atan2(A.x - B.x, A.n - B.n);
      c.next -= dt;
      const speaker = c.turn % 2 === 0 ? A : B;
      const d = Math.hypot(speaker.x - px, speaker.n - pn);
      if (c.next <= 0) {
        c.next = 2 + Math.random() * 1.2;
        c.turn++;
        c.line = (c.line + 1 + Math.floor(Math.random() * 3)) % LINES.length;
        const [gu, en] = LINES[c.line];
        c.el.innerHTML = `<b lang="gu">${gu}</b><small>${en}</small>`;
        this.sound.speak(d, c.pitch[c.turn % 2], 3 + Math.floor(Math.random() * 5));
      }
      const who = c.turn % 2 === 1 ? A : B; // the one who just spoke
      this.v.set(who.x, who.y + 2.1, -who.n).project(this.camera);
      const visible = this.v.z < 1 && Math.abs(this.v.x) < 1.1 && Math.abs(this.v.y) < 1.1 && d < 45;
      c.el.style.display = visible ? 'block' : 'none';
      if (visible) c.el.style.transform = `translate(${(this.v.x * 0.5 + 0.5) * innerWidth}px, ${(-this.v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
    }
    // Animals: an occasional moo or bark from those nearby.
    if ((this.animal -= dt) <= 0) {
      this.animal = 2 + Math.random() * 4;
      for (const a of agents) {
        if (a.kind !== 'cow') continue;
        const d = Math.hypot(a.x - px, a.n - pn);
        if (d > 60) continue;
        const dog = a.dog;
        if (dog && Math.random() < 0.12 + 0.3 * night) { this.sound.bark(d); break; }
        if (!dog && Math.random() < 0.08) { this.sound.moo(d); break; }
      }
    }
  }
}
