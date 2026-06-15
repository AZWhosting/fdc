/* Fond de caisse — app mobile de comptage. React (UMD) + Babel. */
const { useState, useEffect, useCallback, useMemo } = React;

/* ----------------------------------------------------------------- */
/* Données — valeurs en centimes                                      */
/* ----------------------------------------------------------------- */
const BILLETS = [
  { v: 2000, label: "20 €", tint: "blue" },
  { v: 1000, label: "10 €", tint: "red" },
  { v: 500,  label: "5 €",  tint: "grey" },
];
const PIECES = [
  { v: 200, label: "2 €",  tint: "gold" },
  { v: 100, label: "1 €",  tint: "gold" },
  { v: 50,  label: "50 c", tint: "gold" },
  { v: 20,  label: "20 c", tint: "gold" },
  { v: 10,  label: "10 c", tint: "gold" },
  { v: 5,   label: "5 c",  tint: "copper" },
  { v: 2,   label: "2 c",  tint: "copper" },
  { v: 1,   label: "1 c",  tint: "copper" },
];
const ALL = [...BILLETS, ...PIECES];

const TARGET = 30000; // 300,00 €
const LS_COUNTS = "fdc_counts_v1";
const LS_REMOVED = "fdc_removed_v1";
const LS_HISTORY = "fdc_history_v1";
const LS_SETTINGS = "fdc_settings_v1";
const LS_SHIFTS = "fdc_shifts_v1";

/* ----------------------------------------------------------------- */
/* Helpers                                                            */
/* ----------------------------------------------------------------- */
const eur = (c) =>
  (c / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const eurPlain = (c) =>
  (c / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (c) => (c > 0 ? "+ " : c < 0 ? "− " : "") + eur(Math.abs(c));
const clampQty = (n) => Math.max(0, Math.min(99999, Math.round(n) || 0));

function loadMap(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    const out = {};
    ALL.forEach((d) => (out[d.v] = Number(raw[d.v]) || 0));
    return out;
  } catch (e) {
    const out = {};
    ALL.forEach((d) => (out[d.v] = 0));
    return out;
  }
}
const loadHistory = () => {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY) || "[]"); } catch (e) { return []; }
};
const loadSettings = () => {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}");
    return { roundStep: s.roundStep === 10 ? 10 : 5, threshold: Number(s.threshold) || 20000 };
  } catch (e) { return { roundStep: 5, threshold: 20000 }; }
};
const loadShifts = () => {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SHIFTS) || "{}");
    return { start: Array.isArray(s.start) ? s.start : [], end: Array.isArray(s.end) ? s.end : [] };
  } catch (e) { return { start: [], end: [] }; }
};

const todayLabel = () =>
  new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const stampLabel = (iso) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
  " · " + new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

/* ----------------------------------------------------------------- */
/* Contrôle de comptage (stepper ou montant tapé)                     */
/* ----------------------------------------------------------------- */
function CountControl({ d, counted, onCount, mode, amountMode }) {
  const sub = counted * d.v;
  const [draft, setDraft] = useState(null);
  const set = (n) => onCount(d.v, clampQty(n));

  // champ central : montant en € (accepte point/virgule) OU quantité
  const field = amountMode ? (
    <div className="amtfield">
      <input
        className="amtinput"
        type="text"
        inputMode="decimal"
        value={draft !== null ? draft : sub === 0 ? "" : eurPlain(sub).replace(/\s/g, "")}
        placeholder="0,00"
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.,]/g, "");
          setDraft(raw);
          const num = parseFloat(raw.replace(",", "."));
          set(isNaN(num) ? 0 : (num * 100) / d.v);
        }}
        onFocus={(e) => { setDraft(sub === 0 ? "" : eurPlain(sub).replace(/\s/g, "")); requestAnimationFrame(() => e.target.select()); }}
        onBlur={() => setDraft(null)}
      />
      <span className="cur">€</span>
    </div>
  ) : (
    <input className={"qty" + (mode === "keyboard" ? " qty-wide" : "")} type="text" inputMode="numeric"
      value={counted === 0 ? "" : counted} placeholder="0"
      onChange={(e) => set(Number(e.target.value.replace(/[^0-9]/g, "")))} onFocus={(e) => e.target.select()} />
  );

  // mode +/− : on encadre le champ (quantité OU montant) par les boutons − / +
  if (mode === "stepper") {
    return (
      <div className={"stepgroup" + (amountMode ? " stepgroup-amt" : "")}>
        <button className="step" aria-label="moins" onClick={() => set(counted - 1)} disabled={counted <= 0}>−</button>
        {field}
        <button className="step" aria-label="plus" onClick={() => set(counted + 1)}>+</button>
      </div>
    );
  }
  return field;
}

/* ----------------------------------------------------------------- */
/* Ligne de coupure                                                   */
/* ----------------------------------------------------------------- */
function DenomRow({ d, counted, removed, onCount, onRemove, mode, kind, withRetrait, amountMode }) {
  const kept = Math.max(0, counted - removed);
  const keptSub = kept * d.v;

  return (
    <div className={"row" + (withRetrait ? " r4" : "")}>
      <div className={"chip chip-" + kind + " tint-" + d.tint}><span>{d.label}</span></div>

      <div className="qtyzone">
        <CountControl d={d} counted={counted} onCount={onCount} mode={mode} amountMode={amountMode} />
      </div>

      {withRetrait && (
        <div className="remzone">
          <input className="rem" type="text" inputMode="numeric"
            value={removed === 0 ? "" : removed} placeholder="0"
            onChange={(e) => onRemove(d.v, Math.min(counted, clampQty(Number(e.target.value.replace(/[^0-9]/g, "")))))}
            onFocus={(e) => e.target.select()} />
        </div>
      )}

      <div className="montant">
        <span className={"keptval" + (keptSub === 0 ? " zero" : "")}>{eur(keptSub)}</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Section Pièces (avec retrait + arrondi)                            */
/* ----------------------------------------------------------------- */
function PiecesCard({ counts, removed, onCount, onRemove, mode, amountMode, roundStep, setRoundStep, onSuggest }) {
  const counted = PIECES.reduce((s, d) => s + (counts[d.v] || 0) * d.v, 0);
  const kept = PIECES.reduce((s, d) => s + Math.max(0, (counts[d.v] || 0) - (removed[d.v] || 0)) * d.v, 0);
  const stepC = roundStep * 100;
  const toRemove = counted % stepC;                 // cible à retirer
  const cible = counted - toRemove;                 // total pièces conservé visé
  const actualRemoved = counted - kept;
  const reached = kept === cible && counted > 0;

  return (
    <section className="card">
      <header className="cardhead">
        <h2>Pièces</h2>
        <span className="cardsub">{eur(kept)}</span>
      </header>
      <div className="colhead r4">
        <span></span><span>{amountMode ? "Montant" : "Quantité"}</span><span className="c-rem">Retrait</span><span className="c-kept">Conservé</span>
      </div>
      <div className="rows">
        {PIECES.map((d) => (
          <DenomRow key={d.v} d={d} counted={counts[d.v] || 0} removed={removed[d.v] || 0}
            onCount={onCount} onRemove={onRemove} mode={mode} kind="coin" withRetrait amountMode={amountMode} />
        ))}
      </div>

      <div className="arrondi">
        <div className="arr-line">
          <span className="lbl">Arrondir le total à</span>
          <div className="seg">
            <button className={roundStep === 5 ? "on" : ""} onClick={() => setRoundStep(5)}>5 €</button>
            <button className={roundStep === 10 ? "on" : ""} onClick={() => setRoundStep(10)}>10 €</button>
          </div>
        </div>
        <div className="arr-stats">
          <div className="stat"><label>Compté</label><b>{eur(counted)}</b></div>
          <div className="stat"><label>À retirer</label><b className={toRemove === 0 ? "" : "rm"}>{eur(toRemove)}</b></div>
          <div className="stat"><label>Conservé</label><b className={reached ? "ok" : ""}>{eur(kept)}</b>
            {!reached && counted > 0 ? <span className="cible">cible {eur(cible)}</span> : null}</div>
        </div>
        <div className="arr-foot">
          <button className="suggestbtn" onClick={onSuggest} disabled={counted === 0}>Suggérer le retrait</button>
          {reached ? <span className="arr-ok">✓ Total arrondi</span>
            : actualRemoved > 0 ? <span className="arr-note">Retiré {eur(actualRemoved)} / {eur(toRemove)}</span> : null}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- */
/* Carte Billets                                                      */
/* ----------------------------------------------------------------- */
function BilletsCard({ counts, onCount, mode, amountMode }) {
  const sub = BILLETS.reduce((s, d) => s + (counts[d.v] || 0) * d.v, 0);
  return (
    <section className="card">
      <header className="cardhead">
        <h2>Billets</h2>
        <span className="cardsub">{eur(sub)}</span>
      </header>
      <div className="colhead">
        <span></span><span>{amountMode ? "Montant" : "Quantité"}</span><span style={{ textAlign: "right" }}>Total</span>
      </div>
      <div className="rows">
        {BILLETS.map((d) => (
          <DenomRow key={d.v} d={d} counted={counts[d.v] || 0} removed={0}
            onCount={onCount} onRemove={() => {}} mode={mode} kind="bill" withRetrait={false} amountMode={amountMode} />
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- */
/* Carte « Répartition billets » (comptage intelligent)               */
/* ----------------------------------------------------------------- */
function PlanCard({ keptCoins, threshold, setThreshold, bills, onBill, onSuggest }) {
  const gap = TARGET - keptCoins;
  const thr = Math.min(threshold, TARGET);

  // suggestion automatique : billets de 5 € jusqu'au palier, puis billets de 10 €
  const suggestion = useMemo(() => {
    if (gap < 0) return { 2000: 0, 1000: 0, 500: 0 };
    let fives = 0, tens = 0;
    if (keptCoins < thr) { fives = Math.round((thr - keptCoins) / 500); tens = Math.round((TARGET - thr) / 1000); }
    else { tens = Math.round((TARGET - keptCoins) / 1000); }
    return { 2000: 0, 1000: tens, 500: fives };
  }, [keptCoins, thr, gap]);

  const setBill = (v, n) => onBill(v, clampQty(n));

  const billsSum = 2000 * (bills[2000] || 0) + 1000 * (bills[1000] || 0) + 500 * (bills[500] || 0);
  const sum = billsSum + keptCoins;
  const planDiff = sum - TARGET;
  const clean = sum === TARGET && gap >= 0;
  const matchesSuggestion = [2000, 1000, 500].every((v) => (bills[v] || 0) === suggestion[v]);

  const ROWS = [
    { v: 2000, label: "20 €", tint: "blue" },
    { v: 1000, label: "10 €", tint: "red" },
    { v: 500,  label: "5 €",  tint: "grey" },
  ];

  return (
    <section className="plan">
      <div className="plan-head">
        <h2>Répartition billets</h2>
        <button className="plan-suggest" onClick={() => onSuggest(suggestion)} disabled={gap < 0 || matchesSuggestion}>↻ Suggérer</button>
      </div>
      {gap < 0 ? (
        <p className="plan-warn">Les pièces conservées dépassent déjà 300 €.</p>
      ) : (
        <React.Fragment>
          <p className="plan-hint">
            {matchesSuggestion
              ? "Suggestion appliquée — synchronisée avec la section Billets."
              : "Réparti manuellement. Suggestion : " + suggestion[500] + "×5 € + " + suggestion[1000] + "×10 €."}
          </p>
          <div className="plan-lines">
            {ROWS.map((b) => (
              <div className="plan-line" key={b.v}>
                <span className={"pchip tint-" + b.tint}>{b.label}</span>
                <div className="pstep">
                  <button className="step" aria-label="moins" onClick={() => setBill(b.v, (bills[b.v] || 0) - 1)} disabled={(bills[b.v] || 0) <= 0}>−</button>
                  <input className="qty" type="text" inputMode="numeric"
                    value={(bills[b.v] || 0) === 0 ? "" : bills[b.v]} placeholder="0"
                    onChange={(e) => setBill(b.v, Number(e.target.value.replace(/[^0-9]/g, "")))}
                    onFocus={(e) => e.target.select()} />
                  <button className="step" aria-label="plus" onClick={() => setBill(b.v, (bills[b.v] || 0) + 1)}>+</button>
                </div>
                <span className="val">{eur((bills[b.v] || 0) * b.v)}</span>
              </div>
            ))}
            <div className="plan-line muted">
              <span className="pchip ghostchip">pièces</span>
              <span className="desc">conservées</span>
              <span className="val">{eur(keptCoins)}</span>
            </div>
          </div>
          <div className="plan-total"><span>Total</span><span className={clean ? "ok" : ""}>{eur(sum)}</span></div>
          {clean
            ? <p className="plan-ok">✓ 300,00 € atteint</p>
            : <p className="plan-warn">{signed(planDiff)} — {planDiff < 0 ? "manque pour atteindre" : "au-dessus de"} 300 €</p>}
        </React.Fragment>
      )}
      <div className="plan-foot">
        <div className="plan-thresh">
          <span>Palier billets de 5 € jusqu'à</span>
          <input type="number" inputMode="numeric" min="0" max="300" step="5"
            value={threshold / 100}
            onChange={(e) => setThreshold(Math.max(0, Math.min(TARGET, Math.round(Number(e.target.value)) * 100)))} />
          <span>€</span>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- */
/* Historique                                                         */
/* ----------------------------------------------------------------- */
function HistorySheet({ open, onClose, shifts, onRestore, onDelete }) {
  const SH = { start: "Début de quart", end: "Fin de quart" };
  const entries = [
    ...(shifts.start || []).map((r) => ({ ...r, which: "start" })),
    ...(shifts.end || []).map((r) => ({ ...r, which: "end" })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));
  return (
    <div className={"sheet-wrap" + (open ? " show" : "")} onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <header className="sheet-head"><h2>Historique</h2><button className="ghost" onClick={onClose}>Fermer</button></header>
        {entries.length === 0 ? (
          <p className="empty">Aucun relevé de quart enregistré pour le moment.</p>
        ) : (
          <ul className="histlist">
            {entries.map((h) => {
              const diff = h.total - TARGET;
              return (
                <li key={h.which + h.id} className="histitem">
                  <div className="histmain">
                    <span className={"histkind " + h.which}>{SH[h.which]}</span>
                    <span className="histtotal">{eur(h.total)}</span>
                    <span className="histdate">{stampLabel(h.at)}{h.prevEmployee ? " · ⚠ " + h.prevEmployee : ""}</span>
                  </div>
                  <span className={"histdiff " + (diff === 0 ? "ok" : diff < 0 ? "under" : "over")}>{diff === 0 ? "Juste" : signed(diff)}</span>
                  <div className="histacts">
                    <button className="ghost sm" onClick={() => onRestore(h)}>Charger</button>
                    <button className="ghost sm danger" onClick={() => onDelete(h.which, h.id)}>Suppr.</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Encart Quart (début / fin + historique des relevés)                 */
/* ----------------------------------------------------------------- */
function ShiftCard({ shifts, onRestore, onDelete }) {
  const [openCol, setOpenCol] = useState(null); // 'start' | 'end' | null
  const cols = [
    { key: "start", label: "Début de quart" },
    { key: "end", label: "Fin de quart" },
  ];
  const last = (k) => (shifts[k] && shifts[k][0]) || null;
  const sDiff = last("start") && last("end") ? last("end").total - last("start").total : null;

  return (
    <section className="shift">
      <header className="cardhead"><h2>Quart</h2></header>
      <div className="shift-slots">
        {cols.map((c) => {
          const rec = last(c.key);
          const list = shifts[c.key] || [];
          const open = openCol === c.key;
          return (
            <div className={"slot" + (rec ? " filled" : "")} key={c.key}>
              <span className="slot-lbl">{c.label}</span>
              {rec ? (
                <React.Fragment>
                  <b className="slot-total">{eur(rec.total)}</b>
                  <span className="slot-date">{stampLabel(rec.at)}</span>
                  {rec.prevEmployee ? <span className="slot-emp">⚠ écart — {rec.prevEmployee}</span> : null}
                  {list.length > 1 ? (
                    <button className="slot-more" onClick={() => setOpenCol(open ? null : c.key)}>
                      {open ? "Masquer" : list.length + " relevés"}
                    </button>
                  ) : null}
                </React.Fragment>
              ) : (
                <span className="slot-empty">Non enregistré</span>
              )}
            </div>
          );
        })}
      </div>

      {sDiff !== null ? (
        <div className="shift-diff">
          <span>Écart fin − début</span>
          <strong className={sDiff === 0 ? "" : sDiff < 0 ? "neg" : "pos"}>{signed(sDiff)}</strong>
        </div>
      ) : null}

      {openCol ? (
        <ul className="shift-list">
          {(shifts[openCol] || []).map((r) => (
            <li key={r.id}>
              <span className="sl-total">{eur(r.total)}</span>
              <span className="sl-date">{stampLabel(r.at)}{r.prevEmployee ? " · ⚠ " + r.prevEmployee : ""}</span>
              <button className="ghost sm" onClick={() => onRestore(r)}>Charger</button>
              <button className="ghost sm danger" onClick={() => onDelete(openCol, r.id)}>Suppr.</button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ----------------------------------------------------------------- */
/* Modale de quart (validation + nom de l'employé précédent)            */
/* ----------------------------------------------------------------- */
function ShiftDialog({ data, last, total, diff, name, setName, onYes, onNo }) {
  if (!data) return null;
  const label = data.which === "start" ? "début de quart" : "fin de quart";
  const blocked = data.needName && !name.trim();
  return (
    <div className="modal-wrap" onClick={onNo}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {data.needName ? (
          <React.Fragment>
            <h3>Écart constaté</h3>
            <div className={"modal-ecart " + (diff < 0 ? "under" : "over")}>
              <span>Le fond n'est pas à 300 €</span>
              <strong>{signed(diff)}</strong>
            </div>
            <p className="modal-q">Qui a tenu la caisse précédemment ?</p>
            <label className="modal-field">
              <span>Nom de l'employé précédent</span>
              <input type="text" value={name} placeholder="Ex. Camille" autoFocus
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !blocked) onYes(); }} />
            </label>
            {data.hasExisting ? <p className="modal-note">Un {label} est déjà enregistré — celui-ci s'ajoutera à la suite.</p> : null}
          </React.Fragment>
        ) : (
          <React.Fragment>
            <h3>Enregistrement existant</h3>
            <p>Un <b>{label}</b> est déjà enregistré{last ? <React.Fragment> ({eur(last.total)} · {stampLabel(last.at)})</React.Fragment> : null}.</p>
            <p className="modal-q">Ajouter un nouvel enregistrement à la suite ?</p>
          </React.Fragment>
        )}
        <div className="modal-acts">
          <button className="btn secondary" onClick={onNo}>Annuler</button>
          <button className="btn primary" onClick={onYes} disabled={blocked}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* App                                                                */
/* ----------------------------------------------------------------- */
function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [counts, setCounts] = useState(() => loadMap(LS_COUNTS));
  const [removed, setRemoved] = useState(() => loadMap(LS_REMOVED));
  const [history, setHistory] = useState(loadHistory);
  const [settings, setSettings] = useState(loadSettings);
  const [shifts, setShifts] = useState(loadShifts);
  const [dialog, setDialog] = useState(null); // { which, hasExisting, needName }
  const [nameInput, setNameInput] = useState("");
  const [histOpen, setHistOpen] = useState(false);
  const [flash, setFlash] = useState("");

  useEffect(() => { localStorage.setItem(LS_COUNTS, JSON.stringify(counts)); }, [counts]);
  useEffect(() => { localStorage.setItem(LS_REMOVED, JSON.stringify(removed)); }, [removed]);
  useEffect(() => { localStorage.setItem(LS_HISTORY, JSON.stringify(history)); }, [history]);
  useEffect(() => { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem(LS_SHIFTS, JSON.stringify(shifts)); }, [shifts]);

  const onCount = useCallback((v, q) => setCounts((c) => ({ ...c, [v]: q })), []);
  const onRemove = useCallback((v, q) => setRemoved((r) => ({ ...r, [v]: q })), []);

  const keptCoins = PIECES.reduce((s, d) => s + Math.max(0, (counts[d.v] || 0) - (removed[d.v] || 0)) * d.v, 0);
  const billsTotal = BILLETS.reduce((s, d) => s + (counts[d.v] || 0) * d.v, 0);
  const total = keptCoins + billsTotal;
  const diff = total - TARGET;
  const pct = Math.max(0, Math.min(100, (total / TARGET) * 100));
  const keptPieces = PIECES.reduce((s, d) => s + Math.max(0, (counts[d.v] || 0) - (removed[d.v] || 0)), 0)
    + BILLETS.reduce((s, d) => s + (counts[d.v] || 0), 0);

  const status = total === 0 ? "idle" : diff === 0 ? "ok" : diff < 0 ? "under" : "over";
  const statusLabel = total === 0 ? "À compter" : diff === 0 ? "Compte juste" : diff < 0 ? "Manquant" : "Surplus";

  const flashMsg = (m) => { setFlash(m); setTimeout(() => setFlash(""), 1900); };
  const amountMode = t.entryUnit === "montant";

  const setRoundStep = (s) => setSettings((p) => ({ ...p, roundStep: s }));
  const setThreshold = (c) => setSettings((p) => ({ ...p, threshold: c }));

  // suggère les pièces à retirer pour arrondir le total vers le bas
  const suggestRetrait = () => {
    const counted = PIECES.reduce((s, d) => s + (counts[d.v] || 0) * d.v, 0);
    let R = counted % (settings.roundStep * 100);
    const next = { ...removed };
    PIECES.forEach((d) => (next[d.v] = 0));
    for (const d of PIECES) {
      const avail = counts[d.v] || 0;
      const take = Math.min(avail, Math.floor(R / d.v));
      next[d.v] = take;
      R -= take * d.v;
    }
    setRemoved(next);
    flashMsg(R > 0 ? "Retrait approché — ajustez si besoin" : "Retrait suggéré appliqué");
  };

  const applyPlan = (plan) => {
    setCounts((c) => ({ ...c, 500: plan[500] || 0, 1000: plan[1000] || 0, 2000: plan[2000] || 0 }));
    flashMsg("Suggestion appliquée");
  };

  const save = () => {
    if (total === 0) { flashMsg("Rien à enregistrer"); return; }
    const entry = { id: Date.now(), at: new Date().toISOString(), total, counts: { ...counts }, removed: { ...removed } };
    setHistory((h) => [entry, ...h].slice(0, 50));
    flashMsg("Comptage enregistré");
  };

  // --- enregistrements de quart (ajout à la suite, jamais d'écrasement) ---
  const SHIFT_LABELS = { start: "Début de quart", end: "Fin de quart" };
  const writeShift = (which, prevEmployee) => {
    const rec = { id: Date.now(), at: new Date().toISOString(), total, counts: { ...counts }, removed: { ...removed }, ecart: total - TARGET, prevEmployee: prevEmployee || null };
    setShifts((s) => ({ ...s, [which]: [rec, ...s[which]].slice(0, 50) }));
    flashMsg(SHIFT_LABELS[which] + " enregistré");
  };
  const requestShift = (which) => {
    if (total === 0) { flashMsg("Rien à enregistrer"); return; }
    const hasExisting = shifts[which] && shifts[which].length > 0;
    const needName = which === "start" && diff !== 0; // écart → nom de l'employé précédent obligatoire
    if (!hasExisting && !needName) { writeShift(which, null); return; }
    setNameInput("");
    setDialog({ which, hasExisting, needName });
  };
  const confirmYes = () => {
    if (!dialog) return;
    if (dialog.needName && !nameInput.trim()) return;
    writeShift(dialog.which, dialog.needName ? nameInput.trim() : null);
    setDialog(null);
  };
  const delShift = (which, id) => setShifts((s) => ({ ...s, [which]: s[which].filter((x) => x.id !== id) }));
  const reset = () => {
    const blank = {}; ALL.forEach((d) => (blank[d.v] = 0));
    setCounts(blank); setRemoved({ ...blank });
    flashMsg("Remis à zéro");
  };
  const restore = (h) => {
    const c = {}, r = {};
    ALL.forEach((d) => { c[d.v] = Number(h.counts[d.v]) || 0; r[d.v] = Number((h.removed || {})[d.v]) || 0; });
    setCounts(c); setRemoved(r); setHistOpen(false);
    flashMsg("Comptage chargé");
  };
  const del = (id) => setHistory((hs) => hs.filter((x) => x.id !== id));

  return (
    <div className="app" data-density={t.density} style={{ "--accent": t.accent }}>
      <div className="topbar">
        <div className="brandline"><span className="dot" /><span className="brand">Fond de caisse</span></div>
        <button className="histbtn" onClick={() => setHistOpen(true)}>Historique{(shifts.start.length + shifts.end.length) ? <em>{shifts.start.length + shifts.end.length}</em> : null}</button>
      </div>
      <p className="dateline">{todayLabel()}</p>

      <div className="toolbar">
        <div className="tb-group">
          <span className="tb-lbl">Mode</span>
          <div className="seg sm">
            <button className={t.inputMode === "stepper" ? "on" : ""} onClick={() => setTweak("inputMode", "stepper")}>+ / −</button>
            <button className={t.inputMode === "keyboard" ? "on" : ""} onClick={() => setTweak("inputMode", "keyboard")}>Clavier</button>
          </div>
        </div>
        <div className="tb-group">
          <span className="tb-lbl">Saisir par</span>
          <div className="seg sm">
            <button className={t.entryUnit === "quantite" ? "on" : ""} onClick={() => setTweak("entryUnit", "quantite")}>Quantité</button>
            <button className={t.entryUnit === "montant" ? "on" : ""} onClick={() => setTweak("entryUnit", "montant")}>Montant</button>
          </div>
        </div>
      </div>

      <div className={"summary " + status}>
        <div className="sumtop">
          <div><span className="sumlabel">Total compté</span><span className="sumtotal">{eur(total)}</span></div>
          <div className="targetbox"><span className="sumlabel">Objectif</span><span className="sumtarget">{eur(TARGET)}</span></div>
        </div>
        <div className="bar"><div className="barfill" style={{ width: pct + "%" }} /></div>
        <div className="sumbottom">
          <span className={"ecart " + status}><span className="ecartdot" />{statusLabel}
            {total !== 0 && diff !== 0 ? <strong>{signed(diff)}</strong> : null}</span>
          <span className="metacount">{keptPieces} unité{keptPieces > 1 ? "s" : ""}</span>
        </div>
      </div>

      <ShiftCard shifts={shifts} onRestore={restore} onDelete={delShift} />

      <PiecesCard counts={counts} removed={removed} onCount={onCount} onRemove={onRemove} mode={t.inputMode} amountMode={amountMode}
        roundStep={settings.roundStep} setRoundStep={setRoundStep} onSuggest={suggestRetrait} />

      <PlanCard keptCoins={keptCoins} threshold={settings.threshold} setThreshold={setThreshold}
        bills={{ 2000: counts[2000] || 0, 1000: counts[1000] || 0, 500: counts[500] || 0 }}
        onBill={onCount} onSuggest={applyPlan} />

      <BilletsCard counts={counts} onCount={onCount} mode={t.inputMode} amountMode={amountMode} />

      <div className="footnote">Comptage enregistré automatiquement sur cet appareil.</div>

      <div className="actionbar shift-bar">
        <button className="btn ghostbtn" onClick={reset}>RàZ</button>
        <button className="btn primary" onClick={() => requestShift("start")}>Début de quart</button>
        <button className="btn primary" onClick={() => requestShift("end")}>Fin de quart</button>
      </div>

      <ShiftDialog data={dialog} last={dialog ? (shifts[dialog.which] || [])[0] : null}
        total={total} diff={diff} name={nameInput} setName={setNameInput}
        onYes={confirmYes} onNo={() => setDialog(null)} />

      {flash ? <div className="toast">{flash}</div> : null}

      <HistorySheet open={histOpen} onClose={() => setHistOpen(false)} shifts={shifts} onRestore={restore} onDelete={delShift} />

      <TweaksPanel>
        <TweakSection label="Saisie" />
        <TweakRadio label="Mode" value={t.inputMode}
          options={[{ value: "stepper", label: "+ / −" }, { value: "keyboard", label: "Clavier" }]}
          onChange={(v) => setTweak("inputMode", v)} />
        <TweakRadio label="Saisir par" value={t.entryUnit}
          options={[{ value: "quantite", label: "Quantité" }, { value: "montant", label: "Montant €" }]}
          onChange={(v) => setTweak("entryUnit", v)} />
        <TweakSection label="Affichage" />
        <TweakRadio label="Densité" value={t.density} options={["compacte", "normale"]} onChange={(v) => setTweak("density", v)} />
        <TweakColor label="Accent" value={t.accent} options={["#1f6b4a", "#1f5a8a", "#2f3640"]} onChange={(v) => setTweak("accent", v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
