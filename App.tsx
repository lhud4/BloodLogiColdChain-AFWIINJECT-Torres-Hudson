import { useEffect, useMemo, useState } from "react";
import "./style.css";

type RoundId = 1 | 2 | 3;
type CoaId = "baseline" | "decision_support" | "recommended";
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
  maxTurns: number;
};

type Patient = {
  id: number;
  bloodRequired: boolean;
  evacuationRequired: boolean;
  bloodReceived: boolean;
  evacuationStatus: "Not requested" | "Pending" | "Evacuated";
  resourceStatus: "Awaiting resources" | "Partially supported" | "Modeled requirements met";
  location: "Forward" | "Collection point" | "Receiving facility";
  note: string;
  injuryMinute: number;
  transfusionMinute: number | null;
};

type DecisionRecord = {
  round: RoundId;
  turn: number;
  scenarioTitle: string;
  decision: PlayerDecision | "timeout";
  decisionLabel: string;
  elapsedAtDecision: number;
  secondsToDecide: number;
  event: string;
  result: string;
  affectedPatients: number;
};

const scenarios: Scenario[] = [
  { id: 1, title: "Round 1 · Baseline", casualties: 1, disruption: 0, description: "One casualty; establish baseline blood and transport requirements.", timeLimit: 60, maxTurns: 2 },
  { id: 2, title: "Round 2 · Increased demand", casualties: 5, disruption: 1, description: "Five casualties; competing medical and transportation demands.", timeLimit: 90, maxTurns: 4 },
  { id: 3, title: "Round 3 · Contested logistics", casualties: 15, disruption: 2, description: "Fifteen casualties with disrupted logistics and constrained delivery.", timeLimit: 120, maxTurns: 6 },
];

const coaDetails: Record<CoaId, { name: string; description: string; capacityBonus: number }> = {
  baseline: { name: "COA 1 · Baseline", description: "Commander-led allocation using the scenario's existing information.", capacityBonus: 0 },
  decision_support: { name: "COA 2 · AI decision support", description: "A transparent decision-support layer consolidates constraints; the commander retains authority.", capacityBonus: 1 },
  recommended: { name: "COA 3 · Recommended approach", description: "Decision support plus deliberate cold-chain checks and additional approved strategy options.", capacityBonus: 2 },
};

const decisionDetails: Record<PlayerDecision, { label: string; description: string }> = {
  conventional_medevac: { label: "Request conventional MEDEVAC", description: "Prioritize modeled evacuation capacity for eligible casualties." },
  unmanned_medevac: { label: "Use unmanned evacuation option", description: "Model an evacuation option only when scenario payload, range, weather, and communications assumptions permit." },
  blood_transport: { label: "Prioritize blood transport", description: "Allocate modeled transport capacity to casualties with an unmet blood-resource requirement." },
  walking_blood_bank: { label: "Request walking blood bank activation", description: "Model a delayed potential supply increase after synthetic donor and clinical eligibility checks." },
  communications_resilience: { label: "Prioritize communications resilience", description: "Improve modeled reporting and coordination for subsequent decisions." },
  hold_reassess: { label: "Hold resources and reassess", description: "Preserve current allocation while waiting for information; the scenario clock still advances." },
};

const initialInventory = { wholeBlood: 12, redCells: 24, plasma: 18, platelets: 12 };

function makePatients(count: number): Patient[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const bloodRequired = id % 4 !== 0;
    const evacuationRequired = id % 3 !== 0;
    return {
      id, bloodRequired, evacuationRequired, bloodReceived: false,
      evacuationStatus: "Not requested",
      resourceStatus: "Awaiting resources",
      location: "Forward",
      note: "Initial scenario state",
      injuryMinute: 0,
      transfusionMinute: null,
    };
  });
}

function patientStatus(patient: Patient): Patient["resourceStatus"] {
  const bloodOk = !patient.bloodRequired || patient.bloodReceived;
  const evacOk = !patient.evacuationRequired || patient.evacuationStatus === "Evacuated";
  if (bloodOk && evacOk) return "Modeled requirements met";
  if (patient.bloodReceived || patient.evacuationStatus === "Evacuated") return "Partially supported";
  return "Awaiting resources";
}

export default function App() {
  const [scenarioId, setScenarioId] = useState<RoundId>(1);
  const [coa, setCoa] = useState<CoaId>("baseline");
  const [patients, setPatients] = useState<Patient[]>(() => makePatients(1));
  const [inventory, setInventory] = useState(initialInventory);
  const [coldChainVerified, setColdChainVerified] = useState(true);
  const [selectedDecision, setSelectedDecision] = useState<PlayerDecision | "">("");
  const [selectedPatient, setSelectedPatient] = useState<number | "all">("all");
  const [timerStarted, setTimerStarted] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [decisionLocked, setDecisionLocked] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [turn, setTurn] = useState(1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [resolved, setResolved] = useState(false);
  const [communicationsReady, setCommunicationsReady] = useState(true);
  const [extraBloodUnits, setExtraBloodUnits] = useState(0);
  const [records, setRecords] = useState<DecisionRecord[]>([]);
  const [lastEvent, setLastEvent] = useState("Initial situation report: establish priorities and identify constraints.");
  const [lastResult, setLastResult] = useState("No decision resolved yet.");
  const [scenarioEnded, setScenarioEnded] = useState(false);

  const scenario = scenarios.find((item) => item.id === scenarioId)!;
  const remainingSeconds = deadline === null ? scenario.timeLimit : Math.max(0, Math.ceil((deadline - now) / 1000));
  const totalBlood = inventory.wholeBlood + inventory.redCells + inventory.plasma + inventory.platelets + extraBloodUnits;
  const bloodRequiredCount = patients.filter((p) => p.bloodRequired).length;
  const bloodMetCount = patients.filter((p) => !p.bloodRequired || p.bloodReceived).length;
  const evacuationRequiredCount = patients.filter((p) => p.evacuationRequired).length;
  const evacuatedCount = patients.filter((p) => p.evacuationStatus === "Evacuated").length;
  const requirementsMet = patients.filter((p) => patientStatus(p) === "Modeled requirements met").length;
  const unmetBloodCount = patients.filter((p) => p.bloodRequired && !p.bloodReceived).length;
  const pendingEvacCount = patients.filter((p) => p.evacuationRequired && p.evacuationStatus !== "Evacuated").length;
  const roundRecords = records.filter((r) => r.round === scenarioId);

  useEffect(() => {
    if (!timerStarted || deadline === null || decisionLocked || timedOut) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [timerStarted, deadline, decisionLocked, timedOut]);

  useEffect(() => {
    if (!timerStarted || deadline === null || decisionLocked || timedOut || now < deadline) return;
    setTimedOut(true);
    setDecisionLocked(true);
    setRecords((current) => [...current, {
      round: scenarioId, turn, scenarioTitle: scenario.title, decision: "timeout",
      decisionLabel: "No decision committed before timeout", elapsedAtDecision: elapsedSeconds + scenario.timeLimit,
      secondsToDecide: scenario.timeLimit, event: lastEvent, result: "Decision window expired; no resource action was applied.", affectedPatients: 0,
    }]);
  }, [now, timerStarted, deadline, decisionLocked, timedOut, scenarioId, turn, scenario.title, scenario.timeLimit, elapsedSeconds, lastEvent]);

  function resetRound(nextScenarioId: RoundId = scenarioId) {
    const nextScenario = scenarios.find((item) => item.id === nextScenarioId)!;
    setScenarioId(nextScenarioId);
    setPatients(makePatients(nextScenario.casualties));
    setInventory(initialInventory);
    setColdChainVerified(true);
    setSelectedDecision("");
    setSelectedPatient("all");
    setTimerStarted(false);
    setDeadline(null);
    setNow(Date.now());
    setDecisionLocked(false);
    setTimedOut(false);
    setTurn(1);
    setElapsedSeconds(0);
    setResolved(false);
    setCommunicationsReady(true);
    setExtraBloodUnits(0);
    setLastEvent("Initial situation report: establish priorities and identify constraints.");
    setLastResult("No decision resolved yet.");
    setScenarioEnded(false);
    setRecords((current) => current.filter((record) => record.round !== nextScenarioId));
  }

  function startDecisionWindow() {
    if (decisionLocked || scenarioEnded) return;
    setDeadline(Date.now() + scenario.timeLimit * 1000);
    setNow(Date.now());
    setTimerStarted(true);
    setResolved(false);
  }

  function commitDecision() {
    if (!timerStarted || decisionLocked || timedOut || !selectedDecision) return;
    setDecisionLocked(true);
    setResolved(false);
  }

  function resolveDecision() {
    if (!selectedDecision || !decisionLocked || timedOut || scenarioEnded) return;
    const secondsToDecide = Math.min(scenario.timeLimit, Math.max(0, scenario.timeLimit - remainingSeconds));
    // Scenario clock is accelerated: each real decision second represents one simulated minute.
    // This is a configurable training mechanic, not a real-world time prediction.
    const nextElapsed = elapsedSeconds + Math.max(1, secondsToDecide);
    let affected = 0;
    let event = lastEvent;
    let resultText = "";
    let nextPatients = patients.map((p) => ({ ...p }));
    let nextInventory = { ...inventory };
    let nextExtraBlood = extraBloodUnits;
    let nextComms = communicationsReady;
    const coaBonus = coaDetails[coa].capacityBonus;
    const targetIds = selectedPatient === "all" ? null : new Set([selectedPatient]);
    const canReach = (p: Patient) => !targetIds || targetIds.has(p.id);
    const disruptionPenalty = scenario.disruption + (nextElapsed >= 240 ? 1 : 0) + (!nextComms ? 1 : 0);
    const transportSlots = Math.max(1, (scenario.id === 1 ? 1 : scenario.id === 2 ? 2 : 3) + coaBonus - disruptionPenalty);

    switch (selectedDecision) {
      case "blood_transport": {
        const candidates = nextPatients.filter((p) => canReach(p) && p.bloodRequired && !p.bloodReceived);
        const availableUnits = nextInventory.wholeBlood + nextInventory.redCells + nextInventory.plasma + nextInventory.platelets;
        const plannedDelivery = Math.min(candidates.length, transportSlots, availableUnits);
        if (!coldChainVerified) {
          for (const p of candidates.slice(0, plannedDelivery)) p.note = "Delivery held for cold-chain verification";
          resultText = "No modeled blood delivery was counted because cold-chain integrity is unverified. Inventory was not consumed.";
        } else {
          let remaining = plannedDelivery;
          for (const p of nextPatients) {
            if (remaining <= 0) break;
            if (canReach(p) && p.bloodRequired && !p.bloodReceived) {
              p.bloodReceived = true;
              p.transfusionMinute = Math.max(1, nextElapsed);
              p.note = `Modeled transfusion at T+${Math.max(1, nextElapsed)} min`;
              affected++;
              remaining--;
            }
          }
          let consume = affected;
          for (const key of ["wholeBlood", "redCells", "plasma", "platelets"] as const) {
            const take = Math.min(nextInventory[key], consume);
            nextInventory[key] -= take;
            consume -= take;
          }
          resultText = `${affected} casualty record(s) updated for modeled blood delivery. Remaining blood-required records: ${nextPatients.filter((p) => p.bloodRequired && !p.bloodReceived).length}.`;
        }
        break;
      }
      case "conventional_medevac":
      case "unmanned_medevac": {
        const candidates = nextPatients.filter((p) => canReach(p) && p.evacuationRequired && p.evacuationStatus !== "Evacuated");
        const allowed = selectedDecision === "unmanned_medevac" && (!nextComms || scenario.disruption >= 2) ? 0 : transportSlots;
        for (const p of candidates.slice(0, allowed)) {
          p.evacuationStatus = "Evacuated";
          p.location = "Receiving facility";
          p.note = "Evacuation completed in the illustrative scenario";
          affected++;
        }
        for (const p of nextPatients) if (p.evacuationRequired && p.evacuationStatus === "Not requested") p.evacuationStatus = "Pending";
        resultText = affected > 0 ? `${affected} casualty record(s) moved to receiving facility in the model.` : "No evacuation completed; capacity or scenario constraints prevented modeled movement.";
        break;
      }
      case "walking_blood_bank": {
        const gain = scenario.id === 1 ? 2 : scenario.id === 2 ? 4 : 6;
        nextExtraBlood += gain;
        resultText = `${gain} potential units added to the scenario pool after a modeled activation delay. This is not a real-world supply estimate.`;
        affected = 0;
        break;
      }
      case "communications_resilience": {
        nextComms = true;
        resultText = "Communications/reporting resilience improved for subsequent turns in this illustrative model.";
        affected = patients.length;
        break;
      }
      case "hold_reassess": {
        resultText = "No resources moved. Scenario time advanced; unresolved resource requirements remain active.";
        affected = 0;
        break;
      }
    }

    const turnAfter = turn + 1;
    if (turnAfter === 2) event = "Inject: reporting is delayed. Confirm the age and reliability of logistics data.";
    else if (turnAfter === 3) event = "Inject: resupply timeline slips. Reassess inventory and competing transport requirements.";
    else if (turnAfter === 4) event = "Inject: transport capacity is reduced by disruption. Consider whether priorities need to change.";
    else if (turnAfter === 5) event = "Inject: a cold-chain alert is reported. Verify product condition before counting delivery as available.";
    else if (turnAfter > scenario.maxTurns) event = "Scenario complete. Review the decision timeline and unresolved resource requirements.";

    nextPatients = nextPatients.map((p) => ({ ...p, resourceStatus: patientStatus(p) }));
    setPatients(nextPatients);
    setInventory(nextInventory);
    setExtraBloodUnits(nextExtraBlood);
    setCommunicationsReady(nextComms);
    setElapsedSeconds(nextElapsed);
    setLastEvent(event);
    setLastResult(resultText);
    setRecords((current) => [...current, {
      round: scenarioId, turn, scenarioTitle: scenario.title, decision: selectedDecision,
      decisionLabel: decisionDetails[selectedDecision].label, elapsedAtDecision: nextElapsed,
      secondsToDecide, event: lastEvent, result: resultText, affectedPatients: affected,
    }]);
    setResolved(true);
    setTimerStarted(false);
    setDeadline(null);
    setSelectedDecision("");
    setSelectedPatient("all");
    if (turn >= scenario.maxTurns) {
      setScenarioEnded(true);
    } else {
      setTurn((current) => current + 1);
      setDecisionLocked(false);
      setTimedOut(false);
    }
  }

  const startInventoryTotal = inventory.wholeBlood + inventory.redCells + inventory.plasma + inventory.platelets + extraBloodUnits;
  const isDecisionReady = timerStarted && !!selectedDecision && !decisionLocked && !timedOut;
  const canResolve = !!selectedDecision && decisionLocked && !timedOut && !scenarioEnded;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><div className="eyebrow">AFWIP · MEDICAL LOGISTICS EXPERIMENT</div><h1>Blood Logistics <span>Cold Chain</span></h1></div>
        <div className="status-pill"><span className="pulse" /> MULTI-DECISION PROTOTYPE · SYNTHETIC DATA</div>
      </header>
      <main>
        <section className="hero panel">
          <div><div className="eyebrow">LARGE-SCALE COMBAT OPERATIONS</div><h2>Decision-making under blood scarcity</h2><p>Make repeated command decisions as the situation changes. Each resolution advances the scenario and updates individual casualty resource records. All outcomes are synthetic training mechanics, not clinical predictions.</p></div>
          <div className="hero-stat"><strong>{String(scenario.maxTurns).padStart(2, "0")}</strong><span>DECISION CYCLES</span></div>
        </section>
        <div className="workspace">
          <section className="panel controls">
            <div className="section-head"><span className="step">01</span><h2>Configure scenario</h2></div>
            <div className="scenario-list">
              {scenarios.map((item) => <button key={item.id} className={`scenario-card ${scenarioId === item.id ? "selected" : ""}`} onClick={() => resetRound(item.id)}>
                <div className="scenario-top"><span>ROUND {item.id}</span><span className="casualty-count">{item.casualties} {item.casualties === 1 ? "CASUALTY" : "CASUALTIES"}</span></div>
                <h3>{item.title.split(" · ")[1]}</h3><p>{item.description}</p><small className="hint">{item.maxTurns} decision cycles · {item.timeLimit}s each</small>
              </button>)}
            </div>

            <div className="section-head spaced"><span className="step">02</span><h2>Commander decision cycle</h2></div>
            <div className="metric-grid">
              <Metric label="Decision window" value={timerStarted ? `${remainingSeconds}s` : `${scenario.timeLimit}s`} unit={timerStarted ? (decisionLocked ? "DECISION COMMITTED" : "COUNTDOWN ACTIVE") : "READY"} risk={timerStarted && remainingSeconds <= 15 && !decisionLocked} />
              <Metric label="Simulated elapsed time" value={`${elapsedSeconds} min`} unit={`TURN ${Math.min(turn, scenario.maxTurns)} OF ${scenario.maxTurns}`} />
            </div>
            <p className="hint">Each turn is a new decision opportunity. Resolve one action, review the update, then start the next decision window. A decision affects only the modeled patients/resources it applies to.</p>
            <div className="field">
              <label htmlFor="decision">Select operational action</label>
              <select id="decision" value={selectedDecision} disabled={!timerStarted || decisionLocked || timedOut || scenarioEnded} onChange={(e) => setSelectedDecision(e.target.value as PlayerDecision | "")}>
                <option value="">Choose an action…</option>
                {(Object.keys(decisionDetails) as PlayerDecision[]).map((id) => <option key={id} value={id}>{decisionDetails[id].label}</option>)}
              </select>
              {selectedDecision && <p className="hint">{decisionDetails[selectedDecision].description}</p>}
            </div>
            <div className="field">
              <label htmlFor="patient-priority">Apply action to</label>
              <select id="patient-priority" value={selectedPatient} disabled={!timerStarted || decisionLocked || timedOut || scenarioEnded} onChange={(e) => setSelectedPatient(e.target.value === "all" ? "all" : Number(e.target.value))}>
                <option value="all">All eligible casualties (capacity-limited)</option>
                {patients.map((patient) => <option key={patient.id} value={patient.id}>Patient {String(patient.id).padStart(2, "0")}</option>)}
              </select>
              <p className="hint">Individual prioritization is available, but action effects remain limited by modeled capacity and scenario constraints.</p>
            </div>
            <div className="button-row">
              {!timerStarted && !decisionLocked && !scenarioEnded && <button className="primary-button" onClick={startDecisionWindow}>Start decision timer <span>▶</span></button>}
              {timerStarted && !decisionLocked && <button className="primary-button" disabled={!selectedDecision} onClick={commitDecision}>Commit decision <span>✓</span></button>}
              {decisionLocked && !resolved && !timedOut && <button className="primary-button" onClick={resolveDecision} disabled={!selectedDecision}>Resolve action / advance scenario <span>↗</span></button>}
              {resolved && !scenarioEnded && <button className="primary-button" onClick={() => { setResolved(false); setTimerStarted(false); setDecisionLocked(false); setTimedOut(false); setLastEvent(lastEvent); }}>Next decision <span>▶</span></button>}
              <button className="secondary-button" onClick={() => resetRound()}>Reset this round</button>
            </div>
            {timedOut && <div className="result-note risk"><strong>Time expired.</strong> No action was applied. Reset the round to try again.</div>}
            {decisionLocked && !resolved && !timedOut && <div className="result-note"><strong>Decision committed.</strong> Select “Resolve action / advance scenario” to apply the modeled action and reveal its consequences.</div>}
            <div className="section-head spaced"><span className="step">03</span><h2>Course of action</h2></div>
            <div className="field"><label htmlFor="coa">COA comparison</label><select id="coa" value={coa} onChange={(e) => setCoa(e.target.value as CoaId)}>{Object.entries(coaDetails).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}</select><p className="hint">{coaDetails[coa].description}</p></div>
            <div className="field inventory-field">
              <div className="field-title">Available inventory <span>ILLUSTRATIVE UNITS</span></div>
              {(Object.keys(inventory) as (keyof typeof initialInventory)[]).map((key) => <label className="inventory-row" key={key}><span>{key === "wholeBlood" ? "Whole blood" : key === "redCells" ? "Red cells" : key === "plasma" ? "Plasma" : "Platelets"}</span><input type="number" min="0" max="999" value={inventory[key]} onChange={(e) => setInventory((current) => ({ ...current, [key]: Math.max(0, Math.min(999, Number(e.target.value))) }))} disabled={timerStarted || decisionLocked} /></label>)}
              {extraBloodUnits > 0 && <div className="aar-row"><span>Potential additional supply</span><strong>{extraBloodUnits} modeled units</strong></div>}
            </div>
            <label className="check-row"><input type="checkbox" checked={coldChainVerified} onChange={(e) => setColdChainVerified(e.target.checked)} disabled={timerStarted || decisionLocked} /><span><strong>Cold-chain integrity verified</strong><small>Scenario toggle; unverified status blocks counting a modeled delivery as received.</small></span></label>
            <p className="disclaimer">Synthetic training model only. Injury-to-transfusion timing is an illustrative scenario clock (one decision-window second = one simulated minute), not measured clinical performance. Patient records describe modeled resource status, not diagnosis, triage, survival, or clinical outcome. The 36-minute reference and &lt;30-minute target are user-provided evaluation benchmarks, not validated by this prototype.</p>
          </section>

          <section className="results-column">
            <div className="panel snapshot">
              <div className="section-head"><span className="step">04</span><h2>Updated operational picture</h2></div>
              <div className="metric-grid">
                <Metric label="Casualties tracked" value={String(patients.length)} unit="INDIVIDUAL RECORDS" />
                <Metric label="Blood resource met" value={`${bloodMetCount}/${patients.length}`} unit={`${unmetBloodCount} BLOOD REQUIREMENTS PENDING`} />
                <Metric label="Evacuated in model" value={`${evacuatedCount}/${evacuationRequiredCount}`} unit={`${pendingEvacCount} EVACUATION REQUIREMENTS PENDING`} />
                <Metric label="Requirements met" value={`${requirementsMet}/${patients.length}`} unit="SYNTHETIC STATUS" />
                <Metric label="Inventory pool" value={String(startInventoryTotal)} unit="AVAILABLE / POTENTIAL UNITS" />
                <Metric label="Communications" value={communicationsReady ? "AVAILABLE" : "DEGRADED"} unit="MODEL STATE" risk={!communicationsReady} />
              </div>
              <div className="result-note"><strong>Latest situation report:</strong> {lastEvent}</div>
              <div className="result-note"><strong>Last action result:</strong> {lastResult}</div>
            </div>

            <div className="panel casualty-board">
              <div className="section-head"><span className="step">05</span><h2>Casualty tracking board</h2><span className="live-tag">{patients.length} TRACKED</span></div>
              <p className="hint">Select a patient in the decision panel to prioritize an action. Statuses below describe resource availability only; they are not clinical triage categories.</p>
              <div className="casualty-table-wrap"><table className="casualty-table"><thead><tr><th>Patient</th><th>Blood requirement</th><th>Evacuation</th><th>Location</th><th>Injury time</th><th>Transfusion time</th><th>Resource status</th><th>Latest note</th></tr></thead>
                <tbody>{patients.map((patient) => <tr key={patient.id}><td>PT-{String(patient.id).padStart(2, "0")}</td><td>{!patient.bloodRequired ? "Not modeled" : patient.bloodReceived ? "Received" : "Pending"}</td><td>{!patient.evacuationRequired ? "Not modeled" : patient.evacuationStatus}</td><td>{patient.location}</td><td>T+0 min</td><td>{patient.transfusionMinute === null ? "Pending" : `T+${patient.transfusionMinute} min`}</td><td><span className={`status-chip ${patient.resourceStatus === "Modeled requirements met" ? "good" : patient.resourceStatus === "Partially supported" ? "partial" : "pending"}`}>{patient.resourceStatus}</span></td><td>{patient.note}</td></tr>)}</tbody></table></div>
            </div>

            <div className="panel decisions">
              <div className="section-head"><span className="step">06</span><h2>Decision consequences</h2><span className="live-tag">{scenarioEnded ? "ROUND COMPLETE" : `TURN ${Math.min(turn, scenario.maxTurns)} / ${scenario.maxTurns}`}</span></div>
              <div className="outcome-grid"><Outcome label="Blood requirements pending" value={unmetBloodCount} note="Synthetic resource requirements" danger={unmetBloodCount > 0} /><Outcome label="Evacuation requirements pending" value={pendingEvacCount} note="Not a patient outcome prediction" danger={pendingEvacCount > 0} /><Outcome label="Modeled requirements met" value={requirementsMet} note="Resource state only" /></div>
              <div className="bar-list"><Bar label="Blood-resource coverage" value={patients.length ? Math.round(bloodMetCount / patients.length * 100) : 0} show /><Bar label="Evacuation progress" value={evacuationRequiredCount ? Math.round(evacuatedCount / evacuationRequiredCount * 100) : 0} show /><Bar label="All modeled requirements met" value={patients.length ? Math.round(requirementsMet / patients.length * 100) : 0} show /></div>
              {scenarioEnded ? <div className="result-note"><strong>Round complete.</strong> Review the AAR below or reset the round to run another COA under the same starting scenario.</div> : <div className="empty-state">Resolve each committed action to advance the scenario. New information and constraints appear between decision cycles.</div>}
            </div>

            <div className="panel aar">
              <div className="section-head"><span className="step">07</span><h2>After-action review</h2></div>
              <div className="aar-row"><span>Baseline reference</span><strong>36 min injury-to-transfusion (user-provided reference)</strong></div>
              <div className="aar-row"><span>Desired threshold</span><strong>&lt; 30 min</strong></div>
              <div className="aar-row"><span>Mean simulated injury-to-transfusion</span><strong>{(() => { const times = patients.filter((p) => p.transfusionMinute !== null).map((p) => p.transfusionMinute as number); return times.length ? `${(times.reduce((sum, value) => sum + value, 0) / times.length).toFixed(1)} min` : "Not yet achieved"; })()}</strong></div>
              <div className="aar-row"><span>Patients transfused within 30 min</span><strong>{patients.filter((p) => p.transfusionMinute !== null && p.transfusionMinute < 30).length} / {patients.filter((p) => p.bloodRequired).length} blood-required casualties</strong></div>
              <div className="aar-row"><span>COA tested</span><strong>{coaDetails[coa].name}</strong></div>
              <div className="aar-row"><span>Simulated scenario time elapsed</span><strong>{elapsedSeconds} min</strong></div>
              <div className="aar-row"><span>Decisions resolved</span><strong>{roundRecords.filter((r) => r.decision !== "timeout").length}</strong></div>
              <div className="aar-row"><span>Blood requirements still pending</span><strong>{unmetBloodCount}</strong></div>
              <div className="aar-row"><span>Evacuation requirements still pending</span><strong>{pendingEvacCount}</strong></div>
              <div className="aar-row"><span>Modeled resource requirements met</span><strong>{requirementsMet} of {patients.length}</strong></div>
              <p className="aar-summary">{scenarioEnded ? "Scenario complete. Compare the final resource picture with the decision timeline. Results are generated from synthetic rules and should not be interpreted as clinical outcomes." : "The AAR updates throughout the round. Complete the decision cycles to review the final state and the sequence of choices."}</p>
              <div className="section-head spaced"><span className="step">08</span><h2>Decision timeline</h2></div>
              {roundRecords.length === 0 ? <p className="muted">No decisions recorded yet.</p> : roundRecords.map((record, index) => <div className="timeline-card" key={`${record.round}-${record.turn}-${index}`}><div className="timeline-top"><strong>Turn {record.turn} · {record.decisionLabel}</strong><span>T+{record.elapsedAtDecision} min</span></div><p><strong>Information available:</strong> {record.event}</p><p><strong>Resolution:</strong> {record.result}</p><small>{record.secondsToDecide}s to decide · {record.affectedPatients} patient record(s) changed</small></div>)}
              <div className="section-head spaced"><span className="step">09</span><h2>COA comparison reminder</h2></div>
              <p className="muted">For a fair comparison, reset the same round and replay it with each COA using equivalent starting inventory and event assumptions. The model does not automatically declare a COA superior.</p>
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
function Bar({ label, value, show }: { label: string; value: number; show: boolean }) {
  return <div className="bar-row"><div><span>{label}</span><strong>{show ? `${value}%` : "—"}</strong></div><div className="bar-track"><div className="bar-fill" style={{ width: `${show ? value : 0}%` }} /></div></div>;
}
