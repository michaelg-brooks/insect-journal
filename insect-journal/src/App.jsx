import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";

const ORDERS = [
  "Coleoptera", "Lepidoptera", "Diptera", "Hymenoptera", "Hemiptera",
  "Orthoptera", "Odonata", "Neuroptera", "Blattodea", "Mantodea",
  "Phasmatodea", "Dermaptera", "Ephemeroptera", "Plecoptera", "Trichoptera",
  "Siphonaptera", "Thysanoptera", "Psocoptera", "Unknown"
];

const METHODS = [
  "Net", "Malaise trap", "Light trap", "Pitfall trap", "Berlese funnel",
  "Beating sheet", "Aspirator", "Hand collection", "Rearing", "Other"
];

const ALLOWED_FIELDS = [
  "date", "voucher_number", "order", "family", "genus", "species",
  "common_name", "method", "city", "state", "country", "habitat", "notes"
];

function sanitize(formData) {
  return Object.fromEntries(
    Object.entries(formData).filter(([k]) => ALLOWED_FIELDS.includes(k))
  );
}

const emptyForm = {
  date: new Date().toISOString().split("T")[0],
  order: "", family: "", genus: "", species: "", common_name: "",
  city: "", state: "", country: "", habitat: "", method: "",
  notes: "", voucher_number: "",
};

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function nextVoucherNumber(entries) {
  if (!entries.length) return "001";
  const nums = entries
    .map(e => parseInt(e.voucher_number, 10))
    .filter(n => !isNaN(n));
  if (!nums.length) return "001";
  const next = Math.max(...nums) + 1;
  return String(next).padStart(3, "0");
}

const LOCATION_KEY = "insect-journal-last-location";
const LOCATION_FIELDS = ["city", "state", "country"];

function saveLastLocation(formData) {
  const loc = Object.fromEntries(LOCATION_FIELDS.map(k => [k, formData[k] || ""]));
  try { localStorage.setItem(LOCATION_KEY, JSON.stringify(loc)); } catch {}
}

function loadLastLocation() {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function toCSV(entries) {
  const headers = [
    "Specimen #", "Date", "Order", "Family", "Genus", "Species", "Common Name",
    "City", "State", "Country", "Habitat", "Collection Method", "Notes"
  ];
  const rows = entries.map(e => [
    e.voucher_number, e.date, e.order, e.family, e.genus, e.species,
    e.common_name, e.city, e.state, e.country, e.habitat, e.method,
    `"${(e.notes || "").replace(/"/g, '""')}"`
  ].map(v => v ?? "").join(","));
  return [headers.join(","), ...rows].join("\n");
}

const inputStyle = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(138,170,110,0.25)",
  borderRadius: 6,
  padding: "10px 12px",
  color: "#e8ead4",
  fontSize: 15,
  outline: "none",
  fontFamily: "'DM Mono', monospace",
  width: "100%",
};

function Field({ label, name, type = "text", options, required, readOnly, form, setForm }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, letterSpacing: "0.08em", color: "#8aaa6e", fontWeight: 600, textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: "#c6815a" }}> *</span>}
      </label>
      {options ? (
        <select value={form[name] || ""} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} style={inputStyle}>
          <option value="">— select —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea value={form[name] || ""} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} rows={4} style={{ ...inputStyle, resize: "vertical" }} />
      ) : (
        <input
          type={type}
          value={form[name] || ""}
          onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
          readOnly={readOnly}
          style={{ ...inputStyle, ...(readOnly ? { opacity: 0.6, cursor: "default" } : {}) }}
        />
      )}
    </div>
  );
}

export default function App() {
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState("list");
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filterOrder, setFilterOrder] = useState("");
  const [toast, setToast] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchEntries(); }, []);

  async function fetchEntries() {
    setLoading(true);
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .order("date", { ascending: false });
    if (error) showToast("Failed to load entries.", "error");
    else setEntries(data || []);
    setLoading(false);
  }

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  }

  function openNewForm(allEntries) {
    setForm({ ...emptyForm, ...loadLastLocation(), voucher_number: nextVoucherNumber(allEntries) });
    setEditId(null);
    setView("form");
  }

  async function handleSubmit() {
    if (!form.order || !form.date) {
      showToast("Date and Order are required.", "error");
      return;
    }
    setSaving(true);
    if (editId !== null) {
      const { error } = await supabase.from("entries").update(sanitize(form)).eq("id", editId);
      if (error) { showToast("Failed to update.", "error"); setSaving(false); return; }
      showToast("Entry updated.");
    } else {
      const { error } = await supabase.from("entries").insert([sanitize(form)]);
      if (error) { showToast("Failed to save.", "error"); setSaving(false); return; }
      showToast("Entry added.");
      saveLastLocation(form);
    }
    setSaving(false);
    setForm(emptyForm);
    setEditId(null);
    setView("list");
    fetchEntries();
  }

  async function handleDelete(id) {
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) { showToast("Failed to delete.", "error"); return; }
    setDeleteConfirm(null);
    setView("list");
    showToast("Entry deleted.");
    fetchEntries();
  }

  function handleEdit(entry) {
    setForm({ ...entry });
    setEditId(entry.id);
    setView("form");
  }

  function handleExport() {
    const csv = toCSV(filtered);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `insect-collection-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filtered.length} entries.`);
  }

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q || [e.order, e.family, e.genus, e.species, e.common_name, e.city, e.state, e.country, e.notes, e.voucher_number]
      .some(f => (f || "").toLowerCase().includes(q));
    const matchOrder = !filterOrder || e.order === filterOrder;
    return matchSearch && matchOrder;
  });

  const fieldProps = { form, setForm };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#12150e",
      color: "#e8ead4",
      fontFamily: "'DM Mono', monospace",
      backgroundImage: "radial-gradient(ellipse at 20% 0%, rgba(76,90,50,0.3) 0%, transparent 60%), radial-gradient(ellipse at 80% 100%, rgba(40,60,30,0.25) 0%, transparent 60%)",
      paddingBottom: 80,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Playfair+Display:ital,wght@0,700;1,400&display=swap');
        * { box-sizing: border-box; }
        select, input, textarea { color-scheme: dark; }
        select:focus, input:focus, textarea:focus { border-color: rgba(138,170,110,0.7) !important; outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #3a4a28; border-radius: 4px; }
        .entry-row { transition: background 0.15s; }
        .entry-row:hover { background: rgba(138,170,110,0.07) !important; }
        .btn-primary { transition: all 0.15s; }
        .btn-primary:hover { filter: brightness(1.1); }
        .btn-ghost { transition: all 0.15s; }
        .btn-ghost:hover { background: rgba(138,170,110,0.12) !important; }
        @media (max-width: 600px) {
          .desktop-only { display: none !important; }
          .header-inner { flex-wrap: wrap; gap: 10px !important; }
          .list-grid { grid-template-columns: 44px 72px 1fr 90px !important; }
          .list-grid .col-hide { display: none; }
          .form-grid { grid-template-columns: 1fr !important; }
          .form-grid .full-width { grid-column: 1 !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(138,170,110,0.15)", padding: "16px 20px", position: "sticky", top: 0, background: "#12150e", zIndex: 100 }}>
        <div className="header-inner" style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
            <span style={{ fontSize: 20, fontFamily: "'Playfair Display', serif", fontStyle: "italic", color: "#c8d8a0", whiteSpace: "nowrap" }}>Entomological</span>
            <span className="desktop-only" style={{ fontSize: 10, letterSpacing: "0.2em", color: "#5a6e40", textTransform: "uppercase" }}>Collection Journal</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <span className="desktop-only" style={{ fontSize: 11, color: "#5a6e40" }}>{entries.length} specimen{entries.length !== 1 ? "s" : ""}</span>
            <button onClick={handleExport} disabled={filtered.length === 0} className="btn-ghost" style={{ background: "transparent", border: "1px solid rgba(138,170,110,0.3)", borderRadius: 6, padding: "7px 14px", color: "#8aaa6e", fontSize: 13, cursor: filtered.length ? "pointer" : "not-allowed", opacity: filtered.length ? 1 : 0.4, fontFamily: "inherit" }}>
              ↓ CSV
            </button>
            {view !== "form" && (
              <button onClick={() => openNewForm(entries)} className="btn-primary" style={{ background: "#8aaa6e", border: "none", borderRadius: 6, padding: "7px 18px", color: "#12150e", fontSize: 13, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>
                + New Entry
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>

        {/* FORM VIEW */}
        {view === "form" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
              <button onClick={() => { setView("list"); setEditId(null); setForm(emptyForm); }} className="btn-ghost" style={{ background: "transparent", border: "none", color: "#5a6e40", cursor: "pointer", fontSize: 14, padding: "4px 0", fontFamily: "inherit" }}>← back</button>
              <h2 style={{ margin: 0, fontSize: 16, color: "#a8c47e", fontWeight: 500 }}>{editId ? "Edit Entry" : "New Entry"}</h2>
            </div>
            <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Date" name="date" type="date" required {...fieldProps} />
              <Field label="Specimen #" name="voucher_number" readOnly={!editId} {...fieldProps} />
              <Field label="Order" name="order" options={ORDERS} required {...fieldProps} />
              <Field label="Family" name="family" {...fieldProps} />
              <Field label="Genus" name="genus" {...fieldProps} />
              <Field label="Species" name="species" {...fieldProps} />
              <Field label="Common Name" name="common_name" {...fieldProps} />
              <Field label="Collection Method" name="method" options={METHODS} {...fieldProps} />
              <Field label="City" name="city" {...fieldProps} />
              <Field label="State / Province" name="state" {...fieldProps} />
              <div className="full-width" style={{ gridColumn: "1 / -1" }}>
                <Field label="Country" name="country" {...fieldProps} />
              </div>
              <div className="full-width" style={{ gridColumn: "1 / -1" }}>
                <Field label="Habitat" name="habitat" {...fieldProps} />
              </div>
              <div className="full-width" style={{ gridColumn: "1 / -1" }}>
                <Field label="Notes" name="notes" type="textarea" {...fieldProps} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={handleSubmit} disabled={saving} className="btn-primary" style={{ background: "#8aaa6e", border: "none", borderRadius: 6, padding: "12px 28px", color: "#12150e", fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving…" : editId ? "Save Changes" : "Add to Collection"}
              </button>
              <button onClick={() => { setView("list"); setEditId(null); setForm(emptyForm); }} className="btn-ghost" style={{ background: "transparent", border: "1px solid rgba(138,170,110,0.2)", borderRadius: 6, padding: "12px 20px", color: "#5a6e40", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* DETAIL VIEW */}
        {view === "detail" && (() => {
          const e = entries.find(x => x.id === selected);
          if (!e) { setView("list"); return null; }
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={() => setView("list")} className="btn-ghost" style={{ background: "transparent", border: "none", color: "#5a6e40", cursor: "pointer", fontSize: 14, padding: "4px 0", fontFamily: "inherit" }}>← back</button>
                <h2 style={{ margin: 0, fontSize: 17, color: "#a8c47e", fontWeight: 500 }}>
                  {e.genus && e.species ? <em>{e.genus} {e.species}</em> : e.order || "Entry"}
                </h2>
                {e.voucher_number && <span style={{ fontSize: 11, color: "#5a6e40" }}>#{e.voucher_number}</span>}
              </div>
              <div style={{ border: "1px solid rgba(138,170,110,0.15)", borderRadius: 10, overflow: "hidden" }}>
                {[
                  ["Date", formatDate(e.date)],
                  ["Order", e.order],
                  ["Family", e.family],
                  ["Genus / Species", [e.genus, e.species].filter(Boolean).join(" ") || null],
                  ["Common Name", e.common_name],
                  ["Method", e.method],
                  ["City", e.city],
                  ["State", e.state],
                  ["Country", e.country],
                  ["Habitat", e.habitat],
                ].map(([k, v], i, arr) => (
                  <div key={k} style={{ display: "grid", gridTemplateColumns: "130px 1fr", padding: "11px 16px", borderBottom: i < arr.length - 1 ? "1px solid rgba(138,170,110,0.07)" : "none", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                    <span style={{ fontSize: 11, color: "#5a6e40", letterSpacing: "0.08em", textTransform: "uppercase", paddingTop: 1 }}>{k}</span>
                    <span style={{ fontSize: 14, color: v ? "#e8ead4" : "#3a4a28" }}>{v || "—"}</span>
                  </div>
                ))}
              </div>
              {e.notes && (
                <div style={{ marginTop: 16, padding: "14px 16px", border: "1px solid rgba(138,170,110,0.12)", borderRadius: 8, background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ fontSize: 10, color: "#5a6e40", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Notes</div>
                  <div style={{ fontSize: 14, lineHeight: 1.75, color: "#c8d8a0", whiteSpace: "pre-wrap" }}>{e.notes}</div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button onClick={() => handleEdit(e)} className="btn-primary" style={{ background: "#8aaa6e", border: "none", borderRadius: 6, padding: "10px 22px", color: "#12150e", fontSize: 13, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>Edit</button>
                <button onClick={() => setDeleteConfirm(e.id)} style={{ background: "transparent", border: "1px solid rgba(198,129,90,0.3)", borderRadius: 6, padding: "10px 20px", color: "#c6815a", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
              </div>
            </div>
          );
        })()}

        {/* LIST VIEW */}
        {view === "list" && (
          <div>
            <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
              <input placeholder="Search specimens…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160, width: "auto" }} />
              <select value={filterOrder} onChange={e => setFilterOrder(e.target.value)} style={{ ...inputStyle, width: "auto", minWidth: 140 }}>
                <option value="">All orders</option>
                {ORDERS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              {(search || filterOrder) && (
                <button onClick={() => { setSearch(""); setFilterOrder(""); }} className="btn-ghost" style={{ background: "transparent", border: "1px solid rgba(138,170,110,0.2)", borderRadius: 6, padding: "10px 14px", color: "#5a6e40", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#3a4a28", fontSize: 14 }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#3a4a28" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🪲</div>
                <div style={{ fontSize: 14 }}>{entries.length === 0 ? "No specimens yet — tap + New Entry to start." : "No entries match your filters."}</div>
              </div>
            ) : (
              <div style={{ border: "1px solid rgba(138,170,110,0.12)", borderRadius: 10, overflow: "hidden" }}>
                <div className="list-grid" style={{ display: "grid", gridTemplateColumns: "50px 90px 1fr 130px 90px 100px", padding: "8px 14px", background: "rgba(138,170,110,0.06)", fontSize: 10, color: "#5a6e40", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  <span>Spec #</span><span>Date</span><span>Taxon</span><span className="col-hide">City</span><span className="col-hide">Method</span><span style={{ textAlign: "right" }}>Actions</span>
                </div>
                {filtered.map(e => (
                  <div key={e.id} className="entry-row list-grid" style={{ display: "grid", gridTemplateColumns: "50px 90px 1fr 130px 90px 100px", padding: "10px 14px", borderTop: "1px solid rgba(138,170,110,0.07)", background: "transparent", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#3a5a28", cursor: "pointer" }} onClick={() => { setSelected(e.id); setView("detail"); }}>{e.voucher_number || "—"}</span>
                    <span style={{ fontSize: 12, color: "#5a7040", cursor: "pointer" }} onClick={() => { setSelected(e.id); setView("detail"); }}>{formatDate(e.date)}</span>
                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }} onClick={() => { setSelected(e.id); setView("detail"); }}>
                      {e.genus && e.species ? <em style={{ color: "#c8d8a0" }}>{e.genus} {e.species}</em> : e.family ? <span style={{ color: "#a0b880" }}>{e.family}</span> : <span style={{ color: "#a0b880" }}>{e.order}</span>}
                      {e.common_name && <span style={{ color: "#5a6e40", fontSize: 11, marginLeft: 6 }}>({e.common_name})</span>}
                    </span>
                    <span className="col-hide" style={{ fontSize: 11, color: "#5a6e40", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.city || e.state || "—"}</span>
                    <span className="col-hide" style={{ fontSize: 11, color: "#5a6e40" }}>{e.method || "—"}</span>
                    <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => handleEdit(e)} style={{ background: "rgba(138,170,110,0.12)", border: "1px solid rgba(138,170,110,0.2)", borderRadius: 5, padding: "4px 10px", color: "#8aaa6e", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>Edit</button>
                      <button onClick={() => setDeleteConfirm(e.id)} style={{ background: "rgba(198,129,90,0.08)", border: "1px solid rgba(198,129,90,0.2)", borderRadius: 5, padding: "4px 10px", color: "#c6815a", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {filtered.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: "#3a4a28", textAlign: "right" }}>
                {filtered.length} of {entries.length} entries
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? "#3a1a0e" : "#1e2d14", border: `1px solid ${toast.type === "error" ? "rgba(198,129,90,0.4)" : "rgba(138,170,110,0.3)"}`, borderRadius: 8, padding: "11px 22px", fontSize: 13, color: toast.type === "error" ? "#c6815a" : "#a8c47e", zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
          {toast.msg}
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ background: "#1a1f12", border: "1px solid rgba(198,129,90,0.3)", borderRadius: 12, padding: "28px 32px", maxWidth: 340, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 15, marginBottom: 10, color: "#c8d8a0" }}>Delete this entry?</div>
            <div style={{ fontSize: 12, color: "#5a6e40", marginBottom: 24 }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => handleDelete(deleteConfirm)} style={{ background: "#c6815a", border: "none", borderRadius: 6, padding: "10px 22px", color: "#12150e", fontSize: 13, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>Delete</button>
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost" style={{ background: "transparent", border: "1px solid rgba(138,170,110,0.2)", borderRadius: 6, padding: "10px 20px", color: "#5a6e40", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
