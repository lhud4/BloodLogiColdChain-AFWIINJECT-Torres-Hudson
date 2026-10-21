import { useEffect, useMemo, useState } from "react";
import "./style.css";

type RoundId = 1 | 2 | 3;
type CoaId = "baseline" | "decision_support" | "recommended";
type Allocation = "blood" | "evacuation" | "reposition";
type PlayerDecision =
  | "conventional_medevac"
  | "unmanned_medevac"
  | "blood_transport"
  | "walking_blood_bank"
  | "communications_resilience"
  | "hold_reassess";

type Scenario = {
  id: RoundId;
  title: string;
  casualties: number;
  disruption: number;
  description: string;
  timeLimit: number;
};

type DecisionRecord = {
  round: RoundId;
  scenarioTitle: string;
  decision: PlayerDecision | "timeout";
  decisionLabel: string;
  seconds: number;
  timedOut: boolean;
};

const scenarios: Scenario[] = [
  {
    id: 1,
    title: "Round 1 · Baseline",
    casualties: 1,
    disruption: 0,
    description: "One casualty; establish baseline blood and transport requirements.",
    timeLimit: 60,
  },
  {
    id: 2,
    title: "Round 2 · Increased demand",
    casualties: 5,
    disruption: 1,
    description: "Five casualties; competing medical and transportation demands.",
    timeLimit: 90,
  },
  {
    id: 3,
    title: "Round 3 · Contested logistics",
    casualties: 15,
    disruption: 2,
    description: "Fifteen casualties with disrupted logistics and constrained delivery.",
    timeLimit: 120,
  },
];

const coaDetails: Record<CoaId, { name: string; description: string }> = {
  baseline: {
    name: "COA 1 · Baseline",
    description: "Commander allocates resources without the added decision-support model.",
  },
  decision_support: {
    name: "COA 2 · AI decision support",
    description: "A transparent rules-based aid summarizes constraints and estimated consequences.",
  },
  recommended: {
    name: "COA 3 · Recommended approach",
    description: "Decision support is combined with deliberate cold-chain checks and prioritized coordination.",
  },
};

const decisionDetails: Record<
  PlayerDecision,
  { label: string; description: string; allocation: Allocation }
> = {
  conventional_medevac: {
    label: "Request conventional MEDEVAC",
    description: "Prioritize conventional casualty evacuation capacity.",
    allocation: "evacuation",
  },
  unmanned_medevac: {
    label: "Use unmanned evacuation option",
    description: "Consider an unmanned platform only when casualty, payload, range, weather, and communications assumptions permit.",
    allocation: "evacuation",
  },
  blood_transport: {
    label: "Prioritize blood transport",
    description: "Allocate modeled transport capacity to blood products.",
    allocation: "blood",
  },
  walking_blood_bank: {
    label: "Request walking blood bank activation",
    description: "Potential local whole-blood supply after a modeled delay and donor / clinical eligibility checks.",
    allocation: "blood",
  },
  communications_resilience: {
    label: "Prioritize communications resilience",
    description: "Allocate effort to redundant communications, distributed decisions, or offline reporting.",
    allocation: "reposition",
  },
  hold_reassess: {
    label: "Hold resources and reassess",
    description: "Conserve resources while seeking better information; this may increase delay.",
    allocation: "reposition",
  },
};

const initialInventory = {
  wholeBloodUnits: 12,
  redCellUnits: 24,
  plasmaUnits: 18,
  plateletsUnits: 12,
};

function estimate(
  scenario: Scenario,
  coa: CoaId,
  allocation: Allocation,
  inventory: typeof initialInventory,
  decision: PlayerDecision | null,
) {
  // Illustrative training model only; not validated clinical or operational data.
  const demandFactor = scenario.id === 1 ? 1 : scenario.id === 2 ? 1.8 : 2.7;
  const unitsDemanded = Math.ceil(scenario.casualties * demandFactor);
  let availableUnits =
    inventory.wholeBloodUnits +
    inventory.redCellUnits +
    inventory.plasmaUnits +
    inventory.plateletsUnits;

  // Walking blood bank adds potential supply only after a simplified activation delay.
  // This is a synthetic game mechanic, not a clinical estimate.
  const walkingBankPotential =
    decision === "walking_blood_bank"
      ? scenario.id === 1
        ? 2
        : scenario.id === 2
          ? 4
          : 6
      : 0;
  availableUnits += walkingBankPotential;

  const disruptionPenalty = scenario.disruption * 20;
  let transportCapacity = Math.max(0, 100 - disruptionPenalty);

  // Illustrative transport capacity, not a real-world performance estimate.
  let baseDeliveryCapacity =
    allocation === "blood" ? 12 : allocation === "evacuation" ? 7 : 4;

  const coaCapacityAdjustment =
    coa === "baseline" ? 0 : coa === "decision_support" ? 2 : 3;

  let coldChainRisk = Math.min(
    95,
    5 + scenario.disruption * 28 + (allocation === "blood" ? 0 : 10),
  );

  // Distinct, transparent assumptions for the player-selected capability.
  if (decision === "unmanned_medevac") {
    // A small abstract evacuation-capacity adjustment, conditional on eligibility.
    baseDeliveryCapacity += scenario.disruption === 2 ? 1 : 2;
  } else if (decision === "communications_resilience") {
    transportCapacity = Math.min(100, transportCapacity + 15);
  } else if (decision === "hold_reassess") {
    transportCapacity = Math.max(0, transportCapacity - 10);
  } else if (decision === "walking_blood_bank") {
    coldChainRisk = Math.min(95, coldChainRisk + 5);
  }

  const deliveryCapacity = Math.max(
    0,
    Math.floor(
      (baseDeliveryCapacity + coaCapacityAdjustment) * transportCapacity / 100,
    ),
  );

  const effectiveDelivery = Math.min(availableUnits, unitsDemanded, deliveryCapacity);
  const unmet = Math.max(0, unitsDemanded - effectiveDelivery);
  const support = Math.max(
    0,
    Math.min(100, Math.round((effectiveDelivery / Math.max(1, unitsDemanded)) * 100)),
  );

  const mission = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        50 +
          transportCapacity * 0.2 +
          coaCapacityAdjustment * 2 -
          unmet * 3 -
          (allocation === "reposition" ? 12 : allocation === "evacuation" ? 5 : 0),
      ),
    ),
  );

  const forceRisk = Math.max(
    0,
    Math.min(100, Math.round(100 - (mission * 0.4 + support * 0.4) + coldChainRisk * 0.2)),
  );

  return {
    unitsDemanded,
    availableUnits,
    deliveryCapacity,
    effectiveDelivery,
    unmet,
    support,
    mission,
    forceRisk,
    coldChainRisk,
    transportCapacity,
    walkingBankPotential,
  };
}

export default function App() {
  const [scenarioId, setScenarioId] = useState<RoundId>(1);
  const [coa, setCoa] = useState<CoaId>("baseline");
  const [allocation, setAllocation] = useState<Allocation>("blood");
  const [coldChainVerified, setColdChainVerified] = useState(true);
  const [inventory, setInventory] = useState(initialInventory);
  const [hasRun, setHasRun] = useState(false);

  const [selectedDecision, setSelectedDecision] = useState<PlayerDecision | "">("");
  const [committedDecision, setCommittedDecision] = useState<PlayerDecision | null>(null);
  const [decisionRecords, setDecisionRecords] = useState<DecisionRecord[]>([]);
  const [timerStarted, setTimerStarted] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [timedOut, setTimedOut] = useState(false);

  const scenario = scenarios.find((item) => item.id === scenarioId)!;
  const remainingSeconds =
    deadline === null ? scenario.timeLimit : Math.max(0, Math.ceil((deadline - now) / 1000));
  const decisionLocked = committedDecision !== null || timedOut;

  useEffect(() => {
    if (!timerStarted || deadline === null || decisionLocked) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [timerStarted, deadline, decisionLocked]);

  useEffect(() => {
    if (!timerStarted || deadline === null || decisionLocked || now < deadline) return;
    setTimedOut(true);
    setDecisionRecords((records) => {
      if (records.some((record) => record.round === scenarioId)) return records;
      return [
        ...records,
        {
          round: scenarioId,
          scenarioTitle: scenario.title,
          decision: "timeout",
          decisionLabel: "No decision committed before timeout",
          seconds: scenario.timeLimit,
          timedOut: true,
        },
      ];
    });
  }, [now, timerStarted, deadline, decisionLocked, scenarioId, scenario.title, scenario.timeLimit]);

  const result = useMemo(() => {
    const adjusted = coldChainVerified
      ? scenario
      : { ...scenario, disruption: Math.min(2, scenario.disruption + 1) };
    return estimate(adjusted, coa, allocation, inventory, committedDecision);
  }, [scenario, coa, allocation, inventory, coldChainVerified, committedDecision]);

  function resetDecisionWindow(nextScenarioId: RoundId = scenarioId) {
    setScenarioId(nextScenarioId);
    setSelectedDecision("");
    setCommittedDecision(null);
    setTimerStarted(false);
    setDeadline(null);
    setTimedOut(false);
    setHasRun(false);
    setNow(Date.now());
  }

  function startDecisionWindow() {
    if (decisionLocked) return;
    const end = Date.now() + scenario.timeLimit * 1000;
    setDeadline(end);
    setNow(Date.now());
    setTimerStarted(true);
  }

  function commitDecision() {
    if (!timerStarted || decisionLocked || !selectedDecision) return;
    const seconds = Math.min(
      scenario.timeLimit,
      Math.max(0, Math.floor((scenario.timeLimit * 1000 - Math.max(0, (deadline ?? Date.now()) - Date.now())) / 1000)),
    );
    const decision = selectedDecision as PlayerDecision;
    setCommittedDecision(decision);
    setAllocation(decisionDetails[decision].allocation);
    setHasRun(false);
    setDecisionRecords((records) => {
      const withoutCurrent = records.filter((record) => record.round !== scenarioId);
      return [
        ...withoutCurrent,
        {
          round: scenarioId,
          scenarioTitle: scenario.title,
          decision,
          decisionLabel: decisionDetails[decision].label,
          seconds,
          timedOut: false,
        },
      ].sort((a, b) => a.round - b.round);
    });
  }

  function updateInventory(key: keyof typeof initialInventory, value: number) {
    setInventory((current) => ({ ...current, [key]: Math.max(0, Math.min(999, value)) }));
    setHasRun(false);
  }

  const currentRecord = decisionRecords.find((record) => record.round === scenarioId);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">AFWIP · MEDICAL LOGISTICS EXPERIMENT</div>
          <h1>Blood Logistics <span>Cold Chain</span></h1>
        </div>
        <div className="status-pill"><span className="pulse" /> PROTOTYPE · SYNTHETIC DATA</div>
      </header>

      <main>
        <section className="hero panel">
          <div>
            <div className="eyebrow">LARGE-SCALE COMBAT OPERATIONS</div>
            <h2>Decision-making under blood scarcity</h2>
            <p>Players choose a response under time pressure. The prototype records the decision and elapsed time, then displays illustrative consequences.</p>
          </div>
          <div className="hero-stat"><strong>03</strong><span>SCENARIO ROUNDS</span></div>
        </section>

        <div className="workspace">
          <section className="panel controls">
            <div className="section-head"><span className="step">01</span><h2>Configure scenario</h2></div>
            <div className="scenario-list">
              {scenarios.map((item) => (
                <button
                  key={item.id}
                  className={`scenario-card ${scenarioId === item.id ? "selected" : ""}`}
                  onClick={() => resetDecisionWindow(item.id)}
                >
                  <div className="scenario-top"><span>ROUND {item.id}</span><span className="casualty-count">{item.casualties} {item.casualties === 1 ? "CASUALTY" : "CASUALTIES"}</span></div>
                  <h3>{item.title.split(" · ")[1]}</h3>
                  <p>{item.description}</p>
                  <small className="hint">Decision window: {item.timeLimit} seconds</small>
                </button>
              ))}
            </div>

            <div className="section-head spaced"><span className="step">02</span><h2>Commander decision</h2></div>
            <p className="hint">Start the clock, review the options, and commit one decision before time expires. Outcomes remain hidden until you run the simulation.</p>
            <div className="metric-grid">
              <Metric label="Time remaining" value={timerStarted ? `${remainingSeconds}s` : `${scenario.timeLimit}s`} unit={timerStarted ? (decisionLocked ? "DECISION CLOSED" : "COUNTDOWN ACTIVE") : "READY TO START"} risk={timerStarted && remainingSeconds <= 15 && !decisionLocked} />
              <Metric label="Committed decision" value={committedDecision ? "YES" : timedOut ? "TIMEOUT" : "NO"} unit="PLAYER ACTION" risk={timedOut} />
            </div>

            <div className="field">
              <label htmlFor="decision">Select your decision</label>
              <select id="decision" value={selectedDecision} disabled={!timerStarted || decisionLocked} onChange={(e) => setSelectedDecision(e.target.value as PlayerDecision | "")}>
                <option value="">Choose an action…</option>
                {(Object.keys(decisionDetails) as PlayerDecision[]).map((id) => (
                  <option key={id} value={id}>{decisionDetails[id].label}</option>
                ))}
              </select>
              {selectedDecision && <p className="hint">{decisionDetails[selectedDecision].description}</p>}
            </div>

            <div className="button-row">
              {!timerStarted && <button className="primary-button" onClick={startDecisionWindow}>Start decision timer <span>▶</span></button>}
              {timerStarted && !decisionLocked && <button className="primary-button" disabled={!selectedDecision} onClick={commitDecision}>Commit decision <span>✓</span></button>}
              {decisionLocked && <button className="primary-button" onClick={() => setHasRun(true)} disabled={!committedDecision}>Resolve decision / run simulation <span>↗</span></button>}
              <button className="secondary-button" onClick={() => resetDecisionWindow()} >Reset this round</button>
            </div>
            {timedOut && <div className="result-note risk"><strong>Time expired.</strong> No decision was committed. Reset the round to try again.</div>}
            {committedDecision && <div className="result-note"><strong>Decision recorded:</strong> {decisionDetails[committedDecision].label}. Run the simulation to reveal illustrative outcomes.</div>}

            <div className="section-head spaced"><span className="step">03</span><h2>Choose course of action</h2></div>
            <div className="field">
              <label htmlFor="coa">COA comparison</label>
              <select id="coa" value={coa} onChange={(e) => { setCoa(e.target.value as CoaId); setHasRun(false); }}>
                {Object.entries(coaDetails).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}
              </select>
              <p className="hint">{coaDetails[coa].description}</p>
            </div>

            <div className="field inventory-field">
              <div className="field-title">Starting inventory <span>EDITABLE · UNITS</span></div>
              {(Object.keys(inventory) as (keyof typeof initialInventory)[]).map((key) => (
                <label className="inventory-row" key={key}>
                  <span>{key === "wholeBloodUnits" ? "Whole blood" : key === "redCellUnits" ? "Red cells" : key === "plasmaUnits" ? "Plasma" : "Platelets"}</span>
                  <input type="number" min="0" max="999" value={inventory[key]} onChange={(e) => updateInventory(key, Number(e.target.value))} />
                </label>
              ))}
            </div>

            <label className="check-row">
              <input type="checkbox" checked={coldChainVerified} onChange={(e) => { setColdChainVerified(e.target.checked); setHasRun(false); }} />
              <span><strong>Cold-chain integrity verified</strong><small>Uncheck to model an additional cold-chain risk penalty.</small></span>
            </label>
            <p className="disclaimer">Training prototype only. Values are synthetic, illustrative assumptions—not clinical guidance, validated doctrine, or operational recommendations.</p>
          </section>

          <section className="results-column">
            <div className="panel snapshot">
              <div className="section-head"><span className="step">04</span><h2>Operational picture</h2></div>
              <div className="metric-grid">
                <Metric label="Casualty demand" value={scenario.casualties.toString().padStart(2, "0")} unit="CASUALTIES" />
                <Metric label="Starting inventory" value={result.availableUnits.toString()} unit="TOTAL / POTENTIAL UNITS" />
                <Metric label="Transport capacity" value={`${result.transportCapacity}%`} unit="MODEL INDEX" />
                <Metric label="Cold-chain risk" value={`${result.coldChainRisk}%`} unit="MODEL INDEX" risk />
              </div>
              {result.walkingBankPotential > 0 && committedDecision === "walking_blood_bank" && (
                <p className="result-note">Walking blood bank adds {result.walkingBankPotential} potential units in this illustrative model after an abstract activation delay. This is not a real-world availability estimate.</p>
              )}
            </div>

            <div className="panel decisions">
              <div className="section-head"><span className="step">05</span><h2>Simulation outcomes</h2><span className="live-tag">{hasRun ? "RUN COMPLETE" : "AWAITING RESOLUTION"}</span></div>
              <div className="outcome-grid">
                <Outcome label="Estimated units delivered" value={hasRun ? result.effectiveDelivery : "—"} note="Illustrative model output" />
                <Outcome label="Unmet modeled demand" value={hasRun ? result.unmet : "—"} note="Units, not patient counts" danger />
                <Outcome label="Medical support" value={hasRun ? `${result.support}%` : "—"} note="Model score" />
              </div>
              <div className="bar-list">
                <Bar label="Mission effectiveness" value={hasRun ? result.mission : 0} show={hasRun} />
                <Bar label="Medical support effectiveness" value={hasRun ? result.support : 0} show={hasRun} />
                <Bar label="Risk to force" value={hasRun ? result.forceRisk : 0} show={hasRun} inverse />
              </div>
              {!hasRun && <div className="empty-state">Commit a decision, then choose <strong>Resolve decision / run simulation</strong> to reveal the illustrative outcome.</div>}
              {hasRun && <div className="result-note"><strong>Interpretation:</strong> The outcome reflects simple synthetic rules. Compare decisions under the same scenario assumptions; do not interpret the scores as real-world predictions.</div>}
            </div>

            <div className="panel delivery-breakdown">
              <div className="section-head"><span className="step">06</span><h2>Blood delivery breakdown</h2></div>
              <div className="metric-grid">
                <Metric label="Blood at source" value={result.availableUnits.toString()} unit="AVAILABLE / POTENTIAL UNITS" />
                <Metric label="Transport limit" value={result.deliveryCapacity.toString()} unit="MODEL CAPACITY" />
                <Metric label="Blood delivered" value={hasRun ? result.effectiveDelivery.toString() : "—"} unit="DELIVERED UNITS" />
                <Metric label="Demand remaining" value={hasRun ? result.unmet.toString() : "—"} unit="UNMET MODELED UNITS" risk />
              </div>
              {hasRun && <div className="result-note"><strong>Constraint diagnosis:</strong>{" "}
                {result.availableUnits < result.unitsDemanded && result.availableUnits <= result.deliveryCapacity
                  ? "Inventory is the primary modeled constraint."
                  : result.deliveryCapacity < result.unitsDemanded && result.deliveryCapacity < result.availableUnits
                    ? "Transportation capacity is the primary modeled constraint."
                    : result.unmet === 0
                      ? "All modeled demand was met under the current assumptions."
                      : "Multiple constraints may contribute to unmet modeled demand."}
                {" "}These are illustrative model findings, not validated operational predictions.
              </div>}
            </div>

            <div className="panel aar">
              <div className="section-head"><span className="step">07</span><h2>After-action review</h2></div>
              {hasRun ? (
                <>
                  <div className="aar-row"><span>Player decision</span><strong>{committedDecision ? decisionDetails[committedDecision].label : "No decision committed"}</strong></div>
                  <div className="aar-row"><span>Decision time</span><strong>{currentRecord ? `${currentRecord.seconds} seconds` : "Not recorded"}</strong></div>
                  <div className="aar-row"><span>Primary resource priority</span><strong>{allocation === "blood" ? "Blood product movement" : allocation === "evacuation" ? "Casualty evacuation" : "Communications / force repositioning"}</strong></div>
                  <div className="aar-row"><span>COA tested</span><strong>{coaDetails[coa].name}</strong></div>
                  <div className="aar-row"><span>Potential limiting factor</span><strong>{result.unmet > 0 ? "Modeled supply / delivery shortfall" : "No modeled shortfall"}</strong></div>
                  <div className="aar-row"><span>Cold-chain check</span><strong className={coldChainVerified ? "good" : "risk"}>{coldChainVerified ? "Verified in scenario" : "Additional risk applied"}</strong></div>
                  <p className="aar-summary">{result.unmet > 0 ? "The model indicates unmet demand under the current assumptions. Compare another decision or COA in the same round." : "The model indicates all modeled demand was met. Increase demand or introduce disruption to test resilience."}</p>
                </>
              ) : <p className="muted">After resolving a decision, this section summarizes the choice, decision time, and modeled constraints.</p>}
              <div className="section-head spaced"><span className="step">08</span><h2>Decision log</h2></div>
              {decisionRecords.length === 0
                ? <p className="muted">No decisions recorded yet.</p>
                : decisionRecords.slice().sort((a, b) => a.round - b.round).map((record) => (
                  <div className="aar-row" key={record.round}>
                    <span>{record.scenarioTitle}</span>
                    <strong>{record.decisionLabel} · {record.seconds}s{record.timedOut ? " · TIMEOUT" : ""}</strong>
                  </div>
                ))}
            </div>
          </section>
        </div>
      </main>
      <footer>AFWIP CONCEPT PROTOTYPE <span>·</span> BLOOD LOGISTICS COLD CHAIN <span>·</span> SYNTHETIC DATA ONLY</footer>
    </div>
  );
}

function Metric({ label, value, unit, risk = false }: { label: string; value: string; unit: string; risk?: boolean }) {
  return <div className="metric"><span>{label}</span><strong className={risk ? "risk" : ""}>{value}</strong><small>{unit}</small></div>;
}
function Outcome({ label, value, note, danger = false }: { label: string; value: string | number; note: string; danger?: boolean }) {
  return <div className="outcome"><span>{label}</span><strong className={danger ? "risk" : ""}>{value}</strong><small>{note}</small></div>;
}
function Bar({ label, value, show, inverse = false }: { label: string; value: number; show: boolean; inverse?: boolean }) {
  return <div className="bar-row"><div><span>{label}</span><strong>{show ? `${value}%` : "—"}</strong></div><div className="bar-track"><div className={`bar-fill ${inverse ? "inverse" : ""}`} style={{ width: `${show ? value : 0}%` }} /></div></div>;
}
