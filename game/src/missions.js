// The story of Solara Bay: Dee Marlowe, a driver-for-hire who swore she was out, gets
// pulled back in by the Harbor Crew. Five chained missions; each one is a list of steps
// (go somewhere, drive a car somewhere, take out a target, escape the heat) with dialogue.

import { PLACES } from './city.js';

export const STORY_INTRO = [
  'Dee Marlowe came home to Solara Bay to drive a taxi.',
  'The Harbor Crew had other plans.',
];

export const MISSIONS = [
  {
    id: 1,
    title: 'First Fare',
    pay: 250,
    briefing: 'Rook: "Dee! One job, love. Pick up Mr. Vane at the Marina and bring him to the Casino. No funny business."',
    steps: [
      { type: 'goto', place: 'marina', text: 'Pick up Mr. Vane at the Marina' },
      { type: 'driveTo', place: 'casino', text: 'Drive Mr. Vane to Casino Solara', needCar: true },
    ],
    done: 'Vane: "Smooth driving. Rook owes you one, kid."',
  },
  {
    id: 2,
    title: 'Hot Wheels',
    pay: 400,
    briefing: 'Rook: "A Comet GT is parked at Old Town Plaza. Borrow it. Permanently. Bring it to the Garage."',
    steps: [
      { type: 'stealCar', place: 'plaza', text: 'Steal the Comet GT at Old Town Plaza' },
      { type: 'driveTo', place: 'garage', text: 'Deliver the Comet GT to the Garage', needCar: true },
    ],
    done: 'Rook: "She purrs like a kitten. You\'re in, Dee."',
  },
  {
    id: 3,
    title: 'The Drop',
    pay: 600,
    briefing: 'Rook: "A package is waiting at the Beach. Take it to the Docks. The cops are jumpy tonight — keep it clean."',
    steps: [
      { type: 'goto', place: 'beach', text: 'Pick up the package at Solara Beach' },
      { type: 'driveTo', place: 'docks', text: 'Deliver the package to the Docks', needCar: true },
    ],
    done: 'Rook: "Clean drop. The crew is starting to talk about you."',
  },
  {
    id: 4,
    title: 'Heat Wave',
    pay: 900,
    briefing: 'Rook: "They made us. Lose the heat — three stars — and get to the Safehouse. Do NOT get busted."',
    steps: [
      { type: 'escape', text: 'Lose the wanted level, then reach the Safehouse' },
      { type: 'goto', place: 'safehouse', text: 'Reach the Safehouse', needCalm: true },
    ],
    done: 'Rook: "They never even saw your plates. Beautiful."',
  },
  {
    id: 5,
    title: 'The Big Score',
    pay: 1500,
    briefing: 'Rook: "Last one. A vault truck is parked at the Casino. Take it, lose the cops, bring it to the Hideout. Then we\'re rich."',
    steps: [
      { type: 'stealCar', place: 'casino', text: 'Steal the vault truck at Casino Solara' },
      { type: 'driveTo', place: 'hideout', text: 'Deliver the vault truck to the Crew Hideout', needCar: true },
    ],
    done: 'Rook: "SOLARA IS OURS, DEE! You did it!"',
  },
];

/** The place object for a step, or null for steps with no fixed place. */
export function stepPlace(step) {
  return step.place ? PLACES[step.place] : null;
}

/** Human-readable objective line for the HUD. `mission` is 0-based, as the world keeps it. */
export function stepText(mission, stepIndex) {
  const missionDef = MISSIONS[mission];
  if (!missionDef) return 'Free roam — Solara Bay is yours';
  return `${missionDef.title}: ${missionDef.steps[stepIndex].text}`;
}
