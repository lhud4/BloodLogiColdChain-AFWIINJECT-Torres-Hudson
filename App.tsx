import { useMemo, useState } from "react";
import "./style.css";

type RoundId = 1 | 2 | 3;
type CoaId = "baseline" | "decision_support" | "recommended";
type Allocation = "blood" | "evacuation" | "reposition";

type Scenario = {
  id: RoundId;
  title: string;
  casualties: number;
  disruption: number;
  description: string;
};

const scenarios: Scenario[] = [
  { id: 1, title: "Round 1 · Baseline", casualties: 1, disruption: 0, description: "One casualty; establish baseline blood and transport requirements." },
  { id: 2, title: "Round 2 · Increased demand", casualties: 5, disruption: 1, description: "Five casualties; competing medical and transportation demands." },
  { id: 3, title: "Round 3 · Contested logistics", casualties: 15, disruption: 2, description: "Fifteen casualties with disrupted logistics and constrained delivery." },
];

const coaDetails: Record<CoaId, { name: string; description: string }> = {
  baseline: { name: "COA 1 · Baseline", description: "Commander allocates resources without the added decision-support model." },
  decision_support: { name: "COA 2 · AI decision support", description: "A transparent rules-based aid summarizes constraints and estimated consequences." },
  recommended: { name: "COA 3 · Recommended approach", description: "Decision support is combined with deliberate cold-chain checks and prioritized coordination." },
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

  inventory: typeof initialInventory

) {

  // Illustrative training model only; not validated clinical or operational data.

  const demandFactor =

    scenario.id === 1 ? 1 :

    scenario.id === 2 ? 1.8 : 2.7;

  const unitsDemanded = Math.ceil(scenario.casualties * demandFactor);

  const availableUnits =

    inventory.wholeBloodUnits +

    inventory.redCellUnits +

    inventory.plasmaUnits +

    inventory.plateletsUnits;

  // Illustrative transport capacity, expressed as a percentage index.

  const disruptionPenalty = scenario.disruption * 20;

  const transportCapacity = Math.max(0, 100 - disruptionPenalty);

  // Illustrative maximum units transportable before disruption.

  const baseDeliveryCapacity =

    allocation === "blood" ? 12 :

    allocation === "evacuation" ? 7 : 4;

  // COA effects are explicit model assumptions, not proven advantages.

  const coaCapacityAdjustment =

    coa === "baseline" ? 0 :

    coa === "decision_support" ? 2 : 3;

  const coldChainRisk = Math.min(

    95,

    5 + scenario.disruption * 28 + (allocation === "blood" ? 0 : 10)

  );

  const deliveryCapacity = Math.max(

    0,

    Math.floor(

      (baseDeliveryCapacity + coaCapacityAdjustment) *

      transportCapacity / 100

    )

  );

  const effectiveDelivery = Math.min(

    availableUnits,

    unitsDemanded,

    deliveryCapacity

  );

  const unmet = Math.max(0, unitsDemanded - effectiveDelivery);

  const support = Math.max(

    0,

    Math.min(

      100,

      Math.round(

        (effectiveDelivery / Math.max(1, unitsDemanded)) * 100

      )

    )

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

        (allocation === "reposition" ? 12 :

         allocation === "evacuation" ? 5 : 0)

      )

    )

  );

  const forceRisk = Math.max(

    0,

    Math.min(

      100,

      Math.round(

        100 -

        (mission * 0.4 + support * 0.4) +

        coldChainRisk * 0.2

      )

    )

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

    transportCapacity

  };

}

export default function App() {
  const [scenarioId, setScenarioId] = useState<RoundId>(1);
  const [coa, setCoa] = useState<CoaId>("baseline");
  const [allocation, setAllocation] = useState<Allocation>("blood");
  const [coldChainVerified, setColdChainVerified] = useState(true);
  const [inventory, setInventory] = useState(initialInventory);
  const [hasRun, setHasRun] = useState(false);

  const scenario = scenarios.find((item) => item.id === scenarioId)!;
  const result = useMemo(() => {
    const adjusted = coldChainVerified ? scenario : { ...scenario, disruption: Math.min(2, scenario.disruption + 1) };
    return estimate(adjusted, coa, allocation, inventory);
  }, [scenario, coa, allocation, inventory, coldChainVerified]);

  function updateInventory(key: keyof typeof initialInventory, value: number) {
    setInventory((current) => ({ ...current, [key]: Math.max(0, Math.min(999, value)) }));
    setHasRun(false);
  }

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
            <p>Explore how casualty demand, transportation constraints, cold-chain integrity, and command choices interact in an illustrative wargame.</p>
          </div>
          <div className="hero-stat"><strong>03</strong><span>SCENARIO ROUNDS</span></div>
        </section>

        <div className="workspace">
          <section className="panel controls">
            <div className="section-head"><span className="step">01</span><h2>Configure scenario</h2></div>
            <div className="scenario-list">
              {scenarios.map((item) => (
                <button key={item.id} className={`scenario-card ${scenarioId === item.id ? "selected" : ""}`} onClick={() => { setScenarioId(item.id); setHasRun(false); }}>
                  <div className="scenario-top"><span>ROUND {item.id}</span><span className="casualty-count">{item.casualties} {item.casualties === 1 ? "CASUALTY" : "CASUALTIES"}</span></div>
                  <h3>{item.title.split(" · ")[1]}</h3>
                  <p>{item.description}</p>
                </button>
              ))}
            </div>

            <div className="section-head spaced"><span className="step">02</span><h2>Choose course of action</h2></div>
            <div className="field">
              <label htmlFor="coa">COA comparison</label>
              <select id="coa" value={coa} onChange={(e) => { setCoa(e.target.value as CoaId); setHasRun(false); }}>
                {Object.entries(coaDetails).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}
              </select>
              <p className="hint">{coaDetails[coa].description}</p>
            </div>

            <div className="field">
              <label htmlFor="allocation">Primary resource priority</label>
              <select id="allocation" value={allocation} onChange={(e) => { setAllocation(e.target.value as Allocation); setHasRun(false); }}>
                <option value="blood">Transport blood products</option>
                <option value="evacuation">Evacuate casualties</option>
                <option value="reposition">Reposition forces</option>
              </select>
              <p className="hint">The selected priority changes the illustrative resource trade-off.</p>
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

            <button className="primary-button" onClick={() => setHasRun(true)}>Run simulation <span>↗</span></button>
            <p className="disclaimer">Training prototype only. Values are illustrative, not clinical guidance, validated doctrine, or operational recommendations.</p>
          </section>

          <section className="results-column">
            <div className="panel snapshot">
              <div className="section-head"><span className="step">03</span><h2>Operational picture</h2></div>
              <div className="metric-grid">
                <Metric label="Casualty demand" value={scenario.casualties.toString().padStart(2, "0")} unit="CASUALTIES" />
                <Metric label="Starting inventory" value={result.availableUnits.toString()} unit="TOTAL UNITS" />
                <Metric label="Transport capacity" value={`${result.transportCapacity}%`} unit="MODEL INDEX" />
                <Metric label="Cold-chain risk" value={`${result.coldChainRisk}%`} unit="MODEL INDEX" risk />
              </div>
            </div>

            <div className="panel decisions">
              <div className="section-head"><span className="step">04</span><h2>Simulation outcomes</h2><span className="live-tag">{hasRun ? "RUN COMPLETE" : "READY TO RUN"}</span></div>
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
              {!hasRun && <div className="empty-state">Configure the scenario and select <strong>Run simulation</strong> to calculate illustrative outcomes.</div>}
              {hasRun && <div className="result-note"><strong>Interpretation:</strong> These scores are outputs of the prototype's simple rules, not validated estimates of real-world performance. Compare COAs under the same scenario and inventory assumptions.</div>}
            </div>
<div className="panel delivery-breakdown">
  <div className="section-head">
    <span className="step">05</span>
    <h2>Blood delivery breakdown</h2>
  </div>
  <div className="metric-grid">
    <Metric
      label="Blood at source"
      value={result.availableUnits.toString()}
      unit="AVAILABLE UNITS"
    />
    <Metric
      label="Transport limit"
      value={result.deliveryCapacity.toString()}
      unit="MODEL CAPACITY"
    />
    <Metric
      label="Blood delivered"
      value={hasRun ? result.effectiveDelivery.toString() : "—"}
      unit="DELIVERED UNITS"
    />
    <Metric
      label="Demand remaining"
      value={hasRun ? result.unmet.toString() : "—"}
      unit="UNMET MODELED UNITS"
      risk
    />
  </div>
  {hasRun && (
    <div className="result-note">
      <strong>Constraint diagnosis:</strong>{" "}
      {result.availableUnits < result.unitsDemanded &&
      result.availableUnits <= result.deliveryCapacity
        ? "Inventory is the primary modeled constraint."
        : result.deliveryCapacity < result.unitsDemanded &&
          result.deliveryCapacity < result.availableUnits
        ? "Transportation capacity is the primary modeled constraint."
        : result.unmet === 0
        ? "All modeled demand was met under the current assumptions."
        : "Multiple constraints may contribute to unmet modeled demand."}
      {" "}These are illustrative model findings, not validated operational predictions.
    </div>
  )}
</div>
            <div className="panel aar">
              <div className="section-head"><span className="step">05</span><h2>After-action review</h2></div>
              {hasRun ? (
                <>
                  <div className="aar-row"><span>Primary priority</span><strong>{allocation === "blood" ? "Blood product movement" : allocation === "evacuation" ? "Casualty evacuation" : "Force repositioning"}</strong></div>
                  <div className="aar-row"><span>COA tested</span><strong>{coaDetails[coa].name}</strong></div>
                  <div className="aar-row"><span>Potential limiting factor</span><strong>{result.unmet > 0 ? "Modeled supply / delivery shortfall" : "No modeled shortfall"}</strong></div>
                  <div className="aar-row"><span>Cold-chain check</span><strong className={coldChainVerified ? "good" : "risk"}>{coldChainVerified ? "Verified in scenario" : "Additional risk applied"}</strong></div>
                  <p className="aar-summary">{result.unmet > 0 ? "The model indicates unmet demand under the current assumptions. Test a different priority, COA, or starting inventory and compare results." : "The model indicates all modeled demand was met. Increase demand or introduce disruptions to test resilience."}</p>
                </>
              ) : <p className="muted">After running a scenario, this section summarizes the selected decisions and modeled constraints.</p>}
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
