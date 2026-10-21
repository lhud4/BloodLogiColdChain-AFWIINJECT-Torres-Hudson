# Blood Logistics Cold Chain — AFWIP Concept Prototype

A standalone React + TypeScript concept prototype for exploring blood logistics decision-making during large-scale combat operations.

## Features
- Three scenario rounds (1, 5, and 15 casualties with increasing disruption)
- Editable synthetic starting inventory
- Commander priority selection: blood movement, casualty evacuation, or force repositioning
- Three COA options
- Illustrative cold-chain risk toggle
- Outcome metrics and after-action review

## Run locally
Requires Node.js and npm.

```bash
npm install
npm run dev
```

This folder is a Vite React + TypeScript project. If adapting into an existing repository, copy `src/App.tsx` and `src/style.css` into the matching app structure and ensure the host build imports the stylesheet.

## Important limitations
This is an illustrative prototype. The numeric formulas are placeholder rules used to demonstrate interaction, not clinical guidance, validated military medical doctrine, a validated predictive model, or operational recommendations. Product units are not interchangeable clinically; this prototype currently adds inventory counts for a simple illustrative total and should be refined with subject-matter review before any serious analysis. Cold-chain integrity is represented by a simplified scenario risk adjustment, not a real-time temperature or excursion model.
