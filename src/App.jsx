import { useState, useMemo, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";

// ============================================================
// SUPABASE CONFIG
// ============================================================
const SB_URL = "https://cleifbyyhpbdjbrgzrkv.supabase.co";
const SB_KEY = "sb_secret_kS6lUoP6vJeexEJ7ojAqgg_f0ooPUME";

const sb = async (path, options = {}) => {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SB_KEY,
      "Authorization": `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "return=representation",
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

const fmt = (n) => n == null || n === "" ? "" : Number(n).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = (n) => (n == null || n === "" || Number(n) === 0) ? "" : fmt(n);

function computeRow(row) {
  const nabidka = (Number(row.ps_i)||0)+(Number(row.snk_i)||0)+(Number(row.bo_i)||0)+(Number(row.ps_ii)||0)+(Number(row.bo_ii)||0)+(Number(row.poruch)||0);
  const rozdil = (Number(row.vyfakturovano)||0) - nabidka;
  return { ...row, nabidka, rozdil };
}

const COLUMNS = [
  { key: "id", label: "#", width: 40 },
  { key: "firma", label: "Firma", width: 90 },
  { key: "cislo_stavby", label: "Č. stavby", width: 130 },
  { key: "nazev_stavby", label: "Název stavby", width: 260 },
  { key: "ps_i", label: "Plán. stavby I", width: 120, type: "number" },
  { key: "snk_i", label: "SNK I", width: 110, type: "number" },
  { key: "bo_i", label: "Běžné opravy I", width: 120, type: "number" },
  { key: "ps_ii", label: "Plán. stavby II", width: 120, type: "number" },
  { key: "bo_ii", label: "Běžné opravy II", width: 120, type: "number" },
  { key: "poruch", label: "Poruchy", width: 110, type: "number" },
  { key: "nabidka", label: "Nabídka", width: 120, type: "number", computed: true },
  { key: "rozdil", label: "Rozdíl", width: 120, type: "number", computed: true },
  { key: "vyfakturovano", label: "Vyfakturováno", width: 130, type: "number" },
  { key: "ukonceni", label: "Ukončení", width: 110 },
  { key: "zrealizovano", label: "Zrealizováno", width: 130, type: "number" },
  { key: "sod", label: "SOD", width: 160 },
  { key: "ze_dne", label: "Ze dne", width: 100 },
  { key: "objednatel", label: "Objednatel", width: 110 },
  { key: "stavbyvedouci", label: "Stavbyvedoucí", width: 130 },
  { key: "nabidkova_cena", label: "Nab. cena", width: 120, type: "number" },
  { key: "cislo_faktury", label: "Č. faktury", width: 120 },
  { key: "castka_bez_dph", label: "Č. bez DPH", width: 120, type: "number" },
  { key: "splatna", label: "Splatná", width: 110 },
];

const inputSx = { width: "100%", padding: "9px 11px", background: "#0f172a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 7, color: "#fff", fontSize: 13, outline: "none", boxSizing: "border-box" };

function Lbl({ children }) {
  return <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 5, textTransform: "uppercase" }}>{children}</div>;
}

function SecHead({ color, children }) {
  return <div style={{ gridColumn: "1 / -1", borderLeft: `3px solid ${color}`, paddingLeft: 10, color, fontWeight: 700, fontSize: 12, letterSpacing: 0.5, marginTop: 8, marginBottom: 2 }}>{children}</div>;
}

function NativeSelect({ value, onChange, options, style }) {
  return (
    <div style={{ position: "relative" }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputSx, appearance: "none", WebkitAppearance: "none", cursor: "pointer", ...style }}
      >
        {options.map(o => (
          <option key={o} value={o} style={{ background: "#1e293b", color: "#fff", padding: 8 }}>{o}</option>
        ))}
      </select>
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.5)", pointerEvents: "none", fontSize: 11 }}>▼</span>
    </div>
  );
}

// ============================================================
// LOGIN
// ============================================================
function Login({ onLogin, users }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = () => {
    setLoading(true);
    setTimeout(() => {
      const u = users.find(u => u.email === email && u.password === pass);
      if (u) onLogin(u);
      else { setErr("Nesprávný email nebo heslo"); setLoading(false); }
    }, 600);
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0f172a 0%,#1e3a5f 50%,#0f2027 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "48px 40px", width: 380, boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ display: "block", margin: "0 auto 14px" }}>
            <defs>
              <radialGradient id="lgbg" cx="50%" cy="35%" r="70%">
                <stop offset="0%" stopColor="#2563eb" />
                <stop offset="100%" stopColor="#0f172a" />
              </radialGradient>
            </defs>
            <circle cx="40" cy="40" r="38" fill="url(#lgbg)" stroke="#2563eb" strokeWidth="1.5" strokeOpacity="0.5" />
            <polygon points="47,10 30,42 40,42 33,68 52,36 42,36" fill="#facc15" />
            <circle cx="18" cy="24" r="2.2" fill="#facc15" opacity="0.55" />
            <circle cx="62" cy="22" r="1.8" fill="#facc15" opacity="0.45" />
            <circle cx="65" cy="56" r="2" fill="#facc15" opacity="0.4" />
            <circle cx="15" cy="58" r="1.6" fill="#facc15" opacity="0.5" />
          </svg>
          <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 800, margin: 0 }}>Stavby Znojmo</h1>
          <p style={{ color: "rgba(255,255,255,0.35)", margin: "6px 0 0", fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>kategorie 1 & 2</p>
        </div>

        <div style={{ marginBottom: 14 }}><Lbl>Email</Lbl><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vas@email.cz" style={inputSx} onKeyDown={e => e.key === "Enter" && handle()} /></div>
        <div style={{ marginBottom: 22 }}><Lbl>Heslo</Lbl><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="••••••••" style={inputSx} onKeyDown={e => e.key === "Enter" && handle()} /></div>

        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 14, textAlign: "center" }}>{err}</div>}

        <button onClick={handle} disabled={loading} style={{ width: "100%", padding: 14, background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.7 : 1 }}>
          {loading ? "Přihlašuji..." : "Přihlásit se →"}
        </button>

        <div style={{ marginTop: 20, padding: 14, background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, margin: 0, textAlign: "center" }}>Demo: admin@durplus.cz / admin123<br />user@durplus.cz / user123</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SUMMARY CARDS
// ============================================================
const FIRMA_COLORS = ["#2563eb","#ca8a04","#16a34a","#7c3aed","#e11d48","#0891b2","#d97706","#059669","#9333ea","#dc2626"];

function SummaryCards({ data, firmy }) {
  const sum = (firma, fields) => data.filter(r => r.firma === firma).reduce((a, r) => { fields.forEach(f => a += Number(r[f])||0); return a; }, 0);

  return (
    <div style={{ overflowX: "auto", background: "#0f172a", padding: "14px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${firmy.length * 3}, minmax(140px, 1fr))`, gap: 10, minWidth: firmy.length * 3 * 150 }}>
        {firmy.map((firma, fi) => {
          const color = FIRMA_COLORS[fi % FIRMA_COLORS.length];
          const colorDark = FIRMA_COLORS[(fi * 2 + 1) % FIRMA_COLORS.length];
          const katI = sum(firma, ["ps_i","snk_i","bo_i"]);
          const katII = sum(firma, ["ps_ii","bo_ii","poruch"]);
          const celkem = katI + katII;
          return [
            <div key={`${firma}-I`} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${color}33`, borderLeft: `3px solid ${color}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 600, marginBottom: 5 }}>{firma} – Kat. I</div>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{fmt(katI)}</div>
            </div>,
            <div key={`${firma}-II`} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${colorDark}33`, borderLeft: `3px solid ${colorDark}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 600, marginBottom: 5 }}>{firma} – Kat. II</div>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{fmt(katII)}</div>
            </div>,
            <div key={`${firma}-C`} style={{ background: `linear-gradient(135deg,${color}22,${color}0a)`, border: `1px solid ${color}44`, borderLeft: `3px solid ${color}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, fontWeight: 600, marginBottom: 5 }}>Celkem {firma}</div>
              <div style={{ color: "#fff", fontSize: 15, fontWeight: 800 }}>{fmt(celkem)}</div>
            </div>,
          ];
        })}
      </div>
    </div>
  );
}

// ============================================================
// FORM MODAL (Add + Edit)
// ============================================================
function FormModal({ title, initial, onSave, onClose, firmy, objednatele, stavbyvedouci: svList }) {
  const [form, setForm] = useState({ ...initial });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const computed = computeRow(form);

  const Field = ({ k, label, full }) => (
    <div style={full ? { gridColumn: "1 / -1" } : {}}>
      <Lbl>{label}</Lbl>
      <input type="text" value={form[k] ?? ""} onChange={e => set(k, e.target.value)} style={inputSx} />
    </div>
  );

  const SelectField = ({ k, label, options }) => (
    <div>
      <Lbl>{label}</Lbl>
      <NativeSelect value={form[k] ?? options[0]} onChange={v => set(k, v)} options={options} />
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ background: "#1e293b", borderRadius: 16, width: 820, maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ color: "#fff", margin: 0, fontSize: 17 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: "20px 24px", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            <SecHead color="#60a5fa">Základní informace</SecHead>
            <Field k="cislo_stavby" label="Číslo stavby" />
            <Field k="nazev_stavby" label="Název stavby" />
            <SelectField k="firma" label="Firma" options={firmy} />

            <SecHead color="#818cf8">Kategorie I</SecHead>
            <Field k="ps_i" label="PS I" />
            <Field k="snk_i" label="SNK I" />
            <Field k="bo_i" label="BO I" />

            <SecHead color="#fb923c">Kategorie II</SecHead>
            <Field k="ps_ii" label="PS II" />
            <Field k="bo_ii" label="BO II" />
            <Field k="poruch" label="Poruchy" />

            <div style={{ gridColumn: "1 / -1", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.25)", borderRadius: 8, padding: "12px 16px", display: "flex", gap: 32 }}>
              <div><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Nabídka: </span><span style={{ color: "#60a5fa", fontWeight: 700 }}>{fmt(computed.nabidka)}</span></div>
              <div><span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Rozdíl: </span><span style={{ color: computed.rozdil >= 0 ? "#4ade80" : "#f87171", fontWeight: 700 }}>{fmt(computed.rozdil)}</span></div>
            </div>

            <SecHead color="#34d399">Fakturace & termíny</SecHead>
            <Field k="vyfakturovano" label="Vyfakturováno" />
            <Field k="ukonceni" label="Ukončení" />
            <Field k="zrealizovano" label="Zrealizováno" />
            <Field k="nabidkova_cena" label="Nabídková cena" />
            <Field k="cislo_faktury" label="Číslo faktury" />
            <Field k="castka_bez_dph" label="Částka bez DPH" />
            <Field k="splatna" label="Splatná" />

            <SecHead color="#f472b6">Ostatní</SecHead>
            <Field k="sod" label="SOD" />
            <Field k="ze_dne" label="Ze dne" />
            <SelectField k="objednatel" label="Objednatel" options={objednatele} />
            <SelectField k="stavbyvedouci" label="Stavbyvedoucí" options={svList} />
          </div>
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13 }}>Zrušit</button>
          <button onClick={() => onSave(computeRow(form))} style={{ padding: "9px 22px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Uložit</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SETTINGS MODAL
// ============================================================
function SettingsModal({ firmy, objednatele, stavbyvedouci, users, onChange, onChangeUsers, onClose }) {
  const [tab, setTab] = useState("ciselniky");
  const [f, setF] = useState([...firmy]);
  const [o, setO] = useState([...objednatele]);
  const [s, setS] = useState([...stavbyvedouci]);
  const [newF, setNewF] = useState("");
  const [newO, setNewO] = useState("");
  const [newS, setNewS] = useState("");

  // Users
  const [uList, setUList] = useState(users.map(u => ({ ...u })));
  const [newEmail, setNewEmail] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [newName, setNewName] = useState("");
  const [userErr, setUserErr] = useState("");

  const add = (list, setList, val, setVal) => { const v = val.trim(); if (v && !list.includes(v)) { setList([...list, v]); setVal(""); } };
  const rem = (list, setList, v) => setList(list.filter(x => x !== v));

  const addUser = () => {
    setUserErr("");
    if (!newEmail.trim() || !newPass.trim() || !newName.trim()) { setUserErr("Vyplň jméno, email a heslo."); return; }
    if (uList.find(u => u.email === newEmail.trim())) { setUserErr("Uživatel s tímto emailem již existuje."); return; }
    const nextId = uList.length > 0 ? Math.max(...uList.map(u => u.id)) + 1 : 1;
    setUList([...uList, { id: nextId, email: newEmail.trim(), password: newPass.trim(), role: newRole, name: newName.trim() }]);
    setNewEmail(""); setNewPass(""); setNewName(""); setNewRole("user");
  };

  const removeUser = (id) => setUList(uList.filter(u => u.id !== id));

  const ListEditor = ({ label, color, list, setList, nv, setNv }) => (
    <div style={{ flex: 1 }}>
      <div style={{ color, fontWeight: 700, fontSize: 12, letterSpacing: 0.5, marginBottom: 10, borderLeft: `3px solid ${color}`, paddingLeft: 8 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <input value={nv} onChange={e => setNv(e.target.value)} onKeyDown={e => e.key === "Enter" && add(list, setList, nv, setNv)}
          placeholder="Přidat..." style={{ ...inputSx, flex: 1, fontSize: 12 }} />
        <button onClick={() => add(list, setList, nv, setNv)} style={{ padding: "8px 12px", background: `${color}33`, border: `1px solid ${color}55`, borderRadius: 7, color, cursor: "pointer", fontWeight: 700 }}>+</button>
      </div>
      {list.map(v => (
        <div key={v} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", marginBottom: 5, background: "rgba(255,255,255,0.04)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ color: "#e2e8f0", fontSize: 13 }}>{v}</span>
          <button onClick={() => rem(list, setList, v)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      ))}
    </div>
  );

  const tabs = [
    { key: "ciselniky", label: "📋 Číselníky" },
    { key: "uzivatele", label: "👥 Uživatelé" },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ background: "#1e293b", borderRadius: 16, width: 780, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>

        {/* header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ color: "#fff", margin: 0, fontSize: 17 }}>⚙️ Nastavení</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 4, padding: "10px 24px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "8px 18px", background: tab === t.key ? "rgba(37,99,235,0.2)" : "transparent", border: "none", borderBottom: tab === t.key ? "2px solid #2563eb" : "2px solid transparent", borderRadius: "6px 6px 0 0", color: tab === t.key ? "#60a5fa" : "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13, fontWeight: tab === t.key ? 700 : 400 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* body */}
        <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
          {tab === "ciselniky" && (
            <div style={{ display: "flex", gap: 20 }}>
              <ListEditor label="Firmy" color="#60a5fa" list={f} setList={setF} nv={newF} setNv={setNewF} />
              <ListEditor label="Objednatelé" color="#34d399" list={o} setList={setO} nv={newO} setNv={setNewO} />
              <ListEditor label="Stavbyvedoucí" color="#f472b6" list={s} setList={setS} nv={newS} setNv={setNewS} />
            </div>
          )}

          {tab === "uzivatele" && (
            <div>
              {/* Přidat uživatele */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <div style={{ color: "#60a5fa", fontWeight: 700, fontSize: 12, letterSpacing: 0.5, marginBottom: 12, borderLeft: "3px solid #2563eb", paddingLeft: 8 }}>PŘIDAT UŽIVATELE</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 120px", gap: 10, marginBottom: 10 }}>
                  <div><Lbl>Jméno</Lbl><input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Jan Novák" style={inputSx} /></div>
                  <div><Lbl>Email</Lbl><input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="jan@firma.cz" style={inputSx} /></div>
                  <div><Lbl>Heslo</Lbl><input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="••••••••" style={inputSx} /></div>
                  <div>
                    <Lbl>Role</Lbl>
                    <div style={{ position: "relative" }}>
                      <select value={newRole} onChange={e => setNewRole(e.target.value)} style={{ ...inputSx, appearance: "none", cursor: "pointer" }}>
                        <option value="user" style={{ background: "#1e293b" }}>User</option>
                        <option value="admin" style={{ background: "#1e293b" }}>Admin</option>
                      </select>
                      <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: "rgba(255,255,255,0.4)", pointerEvents: "none", fontSize: 10 }}>▼</span>
                    </div>
                  </div>
                </div>
                {userErr && <div style={{ color: "#f87171", fontSize: 12, marginBottom: 8 }}>⚠ {userErr}</div>}
                <button onClick={addUser} style={{ padding: "8px 18px", background: "linear-gradient(135deg,#16a34a,#15803d)", border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>+ Přidat uživatele</button>
              </div>

              {/* Seznam uživatelů */}
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, marginBottom: 10 }}>SEZNAM UŽIVATELŮ ({uList.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {uList.map(u => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: u.role === "admin" ? "rgba(245,158,11,0.2)" : "rgba(100,116,139,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                      {u.role === "admin" ? "👑" : "👤"}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{u.name}</div>
                      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>{u.email}</div>
                    </div>
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: u.role === "admin" ? "rgba(245,158,11,0.2)" : "rgba(100,116,139,0.15)", color: u.role === "admin" ? "#fbbf24" : "#94a3b8" }}>{u.role === "admin" ? "ADMIN" : "USER"}</span>
                    <button onClick={() => removeUser(u.id)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 16, padding: "0 4px" }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 18px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13 }}>Zrušit</button>
          <button onClick={() => { onChange(f, o, s); onChangeUsers(uList); onClose(); }} style={{ padding: "9px 22px", background: "linear-gradient(135deg,#16a34a,#15803d)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Uložit vše</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [data, setData] = useState([]);
  const [firmy, setFirmy] = useState([]);
  const [objednatele, setObjednatele] = useState([]);
  const [stavbyvedouci, setStavbyvedouci] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [filterFirma, setFilterFirma] = useState("Všechny firmy");
  const [filterText, setFilterText] = useState("");
  const [filterObjed, setFilterObjed] = useState("Všichni objednatelé");
  const [editRow, setEditRow] = useState(null);
  const [adding, setAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editingCell, setEditingCell] = useState(null);
  const [cellValue, setCellValue] = useState("");
  const [showExport, setShowExport] = useState(false);

  const isAdmin = user?.role === "admin";

  // ── Načtení dat z Supabase ─────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    try {
      const [stavbyRes, ciselnikyRes, uzivRes] = await Promise.all([
        sb("stavby?order=id"),
        sb("ciselniky?order=poradi"),
        sb("uzivatele?order=id"),
      ]);
      setData(stavbyRes.map(computeRow));
      setFirmy(ciselnikyRes.filter(r => r.typ === "firma").map(r => r.hodnota));
      setObjednatele(ciselnikyRes.filter(r => r.typ === "objednatel").map(r => r.hodnota));
      setStavbyvedouci(ciselnikyRes.filter(r => r.typ === "stavbyvedouci").map(r => r.hodnota));
      setUsers(uzivRes.map(u => ({ id: u.id, email: u.email, password: u.heslo, role: u.role, name: u.jmeno })));
    } catch (e) {
      setDbError("Chyba připojení k databázi: " + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── CRUD stavby ────────────────────────────────────────────
  const handleSave = async (updated) => {
    const { id, nabidka, rozdil, ...fields } = updated;
    try {
      await sb(`stavby?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(fields) });
      await loadAll();
    } catch (e) { alert("Chyba uložení: " + e.message); }
    setEditRow(null);
  };

  const handleAdd = async (newRow) => {
    const { id, nabidka, rozdil, ...fields } = newRow;
    try {
      await sb("stavby", { method: "POST", body: JSON.stringify(fields) });
      await loadAll();
    } catch (e) { alert("Chyba přidání: " + e.message); }
    setAdding(false);
  };

  const handleDelete = async (id) => {
    try {
      await sb(`stavby?id=eq.${id}`, { method: "DELETE", prefer: "return=minimal" });
      await loadAll();
    } catch (e) { alert("Chyba mazání: " + e.message); }
    setDeleteConfirm(null);
  };

  // ── CRUD číselníky ─────────────────────────────────────────
  const saveSettings = async (nFirmy, nObjed, nSv) => {
    try {
      await sb("ciselniky", { method: "DELETE", prefer: "return=minimal", headers: { "Content-Type": "application/json" } });
      const items = [
        ...nFirmy.map((h, i) => ({ typ: "firma", hodnota: h, poradi: i })),
        ...nObjed.map((h, i) => ({ typ: "objednatel", hodnota: h, poradi: i })),
        ...nSv.map((h, i) => ({ typ: "stavbyvedouci", hodnota: h, poradi: i })),
      ];
      await sb("ciselniky", { method: "POST", body: JSON.stringify(items) });
      await loadAll();
    } catch (e) { alert("Chyba uložení číselníků: " + e.message); }
  };

  // ── CRUD uživatelé ─────────────────────────────────────────
  const saveUsers = async (uList) => {
    try {
      // Smaž všechny a vlož znovu
      await sb("uzivatele", { method: "DELETE", prefer: "return=minimal" });
      const items = uList.map(u => ({ jmeno: u.name, email: u.email, heslo: u.password, role: u.role }));
      await sb("uzivatele", { method: "POST", body: JSON.stringify(items) });
      await loadAll();
    } catch (e) { alert("Chyba uložení uživatelů: " + e.message); }
  };

  const filtered = useMemo(() => data.filter(r => {
    if (filterFirma !== "Všechny firmy" && r.firma !== filterFirma) return false;
    if (filterText && !r.nazev_stavby?.toLowerCase().includes(filterText.toLowerCase()) && !r.cislo_stavby?.toLowerCase().includes(filterText.toLowerCase())) return false;
    if (filterObjed !== "Všichni objednatelé" && filterObjed && r.objednatel !== filterObjed) return false;
    return true;
  }), [data, filterFirma, filterText, filterObjed]);

  const startCell = (row, col) => {
    if (!isAdmin || col.computed || col.key === "id") return;
    setEditingCell({ rowId: row.id, colKey: col.key });
    setCellValue(row[col.key] ?? "");
  };

  const commitCell = async () => {
    if (!editingCell) return;
    const { rowId, colKey } = editingCell;
    try {
      await sb(`stavby?id=eq.${rowId}`, { method: "PATCH", body: JSON.stringify({ [colKey]: cellValue }) });
      await loadAll();
    } catch (e) { alert("Chyba uložení: " + e.message); }
    setEditingCell(null);
  };

  const [exportPreview, setExportPreview] = useState(null); // { type, content }

  const exportCSV = () => {
    setExportPreview({ type: "csv" });
    setShowExport(false);
  };

  const exportXLS = () => {
    setExportPreview({ type: "xls" });
    setShowExport(false);
  };

  const exportPDF = () => {
    setExportPreview({ type: "pdf" });
    setShowExport(false);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, border: "3px solid rgba(37,99,235,0.3)", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Načítám data...</div>
      </div>
    </div>
  );

  if (dbError) return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
      <div style={{ background: "#1e293b", borderRadius: 16, padding: 32, maxWidth: 480, textAlign: "center", border: "1px solid rgba(239,68,68,0.3)" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <h3 style={{ color: "#f87171", margin: "0 0 8px" }}>Chyba připojení</h3>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "0 0 20px" }}>{dbError}</p>
        <button onClick={loadAll} style={{ padding: "10px 24px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontWeight: 600 }}>Zkusit znovu</button>
      </div>
    </div>
  );

  if (!user) return <Login onLogin={setUser} users={users} />;

  const nextId = data.length > 0 ? Math.max(...data.map(r => r.id)) + 1 : 1;
  const emptyRow = { id: nextId, firma: firmy[0]||"", ps_i: 0, snk_i: 0, bo_i: 0, ps_ii: 0, bo_ii: 0, poruch: 0, cislo_stavby: "", nazev_stavby: "", vyfakturovano: 0, ukonceni: "", zrealizovano: "", sod: "", ze_dne: "", objednatel: objednatele[0]||"", stavbyvedouci: stavbyvedouci[0]||"", nabidkova_cena: 0, cislo_faktury: "", castka_bez_dph: 0, splatna: "" };

  const firmaBadge = (firma) => ({
    display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
    background: firma === "DUR plus" ? "rgba(37,99,235,0.2)" : "rgba(202,138,4,0.25)",
    color: firma === "DUR plus" ? "#60a5fa" : "#fde047",
    border: `1px solid ${firma === "DUR plus" ? "rgba(37,99,235,0.35)" : "rgba(202,138,4,0.45)"}`,
  });

  const rowBg = (firma, i) => firma === "DUR plus"
    ? (i % 2 === 0 ? "rgba(37,99,235,0.05)" : "transparent")
    : (i % 2 === 0 ? "rgba(234,179,8,0.07)" : "rgba(234,179,8,0.03)");

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "'Segoe UI',Tahoma,sans-serif", color: "#fff" }}>

      {/* HEADER */}
      <div style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "11px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <svg width="32" height="32" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="38" fill="#1e3a8a" />
            <polygon points="47,10 30,42 40,42 33,68 52,36 42,36" fill="#facc15" />
          </svg>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Stavby Znojmo</div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>kategorie 1 & 2 <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.2)", fontSize: 10 }}>v1.0 | 1.3.2026</span></div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80" }} />
          <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>{user.name}</span>
          <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: isAdmin ? "rgba(245,158,11,0.2)" : "rgba(100,116,139,0.2)", color: isAdmin ? "#fbbf24" : "#94a3b8" }}>{isAdmin ? "ADMIN" : "USER"}</span>
          {isAdmin && <button onClick={() => setShowSettings(true)} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 12 }}>⚙️ Nastavení</button>}
          <button onClick={() => setUser(null)} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12 }}>Odhlásit</button>
        </div>
      </div>

      {/* SUMMARY */}
      <SummaryCards data={data} firmy={firmy} />

      {/* FILTERS */}
      <div style={{ padding: "10px 18px", display: "flex", gap: 10, alignItems: "center", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)", flexWrap: "wrap" }}>
        <input placeholder="🔍 Hledat stavbu / číslo..." value={filterText} onChange={e => setFilterText(e.target.value)} style={{ ...inputSx, width: 230 }} />
        <NativeSelect value={filterFirma} onChange={setFilterFirma} options={["Všechny firmy", ...firmy]} style={{ width: 170 }} />
        <NativeSelect value={filterObjed} onChange={setFilterObjed} options={["Všichni objednatelé", ...objednatele]} style={{ width: 190 }} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{filtered.length} záznamů</span>
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowExport(v => !v)} style={{ padding: "7px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", cursor: "pointer", fontSize: 12 }}>⬇ Export ▾</button>
            {showExport && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#1e293b", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: 6, zIndex: 200, minWidth: 160, boxShadow: "0 12px 32px rgba(0,0,0,0.5)" }}>
                <button onClick={exportCSV} style={{ display: "block", width: "100%", padding: "9px 14px", background: "none", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: 13, textAlign: "left", borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>📄 CSV (.csv)</button>
                <button onClick={exportXLS} style={{ display: "block", width: "100%", padding: "9px 14px", background: "none", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: 13, textAlign: "left", borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>📊 Excel (.xlsx)</button>
                <button onClick={exportPDF} style={{ display: "block", width: "100%", padding: "9px 14px", background: "none", border: "none", color: "#e2e8f0", cursor: "pointer", fontSize: 13, textAlign: "left", borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.07)"} onMouseLeave={e => e.currentTarget.style.background = "none"}>🖨️ PDF (HTML → tisk)</button>
              </div>
            )}
          </div>
          {isAdmin && <button onClick={() => setAdding(true)} style={{ padding: "7px 14px", background: "linear-gradient(135deg,#16a34a,#15803d)", border: "none", borderRadius: 7, color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>+ Přidat stavbu</button>}
        </div>
      </div>

      {/* TABLE */}
      <div style={{ overflowX: "auto", paddingBottom: 40 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 2100 }}>
          <thead>
            <tr style={{ background: "#1a2744" }}>
              {COLUMNS.map(col => (
                <th key={col.key} style={{ padding: "9px 11px", textAlign: "center", color: "rgba(255,255,255,0.65)", fontWeight: 700, fontSize: 10.5, letterSpacing: 0.4, whiteSpace: "nowrap", minWidth: col.width, position: "sticky", top: 0, background: "#1a2744", zIndex: 10, border: "1px solid rgba(255,255,255,0.13)" }}>
                  {col.label.toUpperCase()}
                </th>
              ))}
              {isAdmin && <th style={{ padding: "9px 11px", color: "rgba(255,255,255,0.65)", fontWeight: 700, fontSize: 10.5, position: "sticky", top: 0, background: "#1a2744", zIndex: 10, border: "1px solid rgba(255,255,255,0.13)", textAlign: "center" }}>AKCE</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const isFaktura = row.cislo_faktury && row.cislo_faktury.trim() !== "" && row.splatna && row.splatna.trim() !== "";
              const baseBg = isFaktura ? "rgba(22,163,74,0.15)" : rowBg(row.firma, i);
              return (
              <tr key={row.id}
                style={{ background: baseBg, transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = isFaktura ? "rgba(22,163,74,0.25)" : "rgba(255,255,255,0.07)"}
                onMouseLeave={e => e.currentTarget.style.background = baseBg}
              >
                {COLUMNS.map(col => {
                  const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === col.key;
                  const canEdit = isAdmin && !col.computed && col.key !== "id";
                  const align = col.key === "id" ? "center" : col.type === "number" ? "right" : "left";
                  const selectOptions = col.key === "firma" ? firmy : col.key === "objednatel" ? objednatele : col.key === "stavbyvedouci" ? stavbyvedouci : null;
                  const isSelectCol = selectOptions != null;
                  return (
                    <td key={col.key}
                      onClick={() => canEdit && !isEditing && startCell(row, col)}
                      style={{ padding: isEditing ? 0 : "7px 11px", whiteSpace: "nowrap", textAlign: align, border: "1px solid rgba(255,255,255,0.07)", cursor: canEdit ? "pointer" : "default", outline: isEditing ? "2px solid #2563eb" : "none", color: col.key === "rozdil" ? (Number(row[col.key]) >= 0 ? "#4ade80" : "#f87171") : col.type === "number" ? "#93c5fd" : "#e2e8f0" }}
                    >
                      {isEditing && isSelectCol
                        ? <select autoFocus value={cellValue} onChange={e => { setCellValue(e.target.value); }} onBlur={commitCell} onKeyDown={e => { if (e.key === "Enter") commitCell(); if (e.key === "Escape") setEditingCell(null); }} style={{ width: "100%", height: "100%", padding: "7px 11px", background: "#1e3a5f", border: "none", outline: "none", color: "#fff", fontSize: 12.5, boxSizing: "border-box", cursor: "pointer" }}>
                            {selectOptions.map(o => <option key={o} value={o} style={{ background: "#1e293b" }}>{o}</option>)}
                          </select>
                        : isEditing
                        ? <input autoFocus value={cellValue} onChange={e => setCellValue(e.target.value)} onBlur={commitCell} onKeyDown={e => { if (e.key === "Enter") commitCell(); if (e.key === "Escape") setEditingCell(null); }} style={{ width: "100%", height: "100%", padding: "7px 11px", background: "transparent", border: "none", outline: "none", color: "#fff", fontSize: 12.5, boxSizing: "border-box" }} />
                        : col.key === "id"
                        ? <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>{row[col.key]}</span>
                        : col.key === "firma" ? <span style={firmaBadge(row[col.key])}>{row[col.key]}</span>
                        : col.type === "number" ? fmtN(row[col.key])
                        : row[col.key] ?? ""}
                    </td>
                  );
                })}
                {isAdmin && (
                  <td style={{ padding: "7px 11px", whiteSpace: "nowrap", border: "1px solid rgba(255,255,255,0.07)", textAlign: "center" }}>
                    <button onClick={() => setEditRow(row)} style={{ padding: "3px 9px", background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: 5, color: "#60a5fa", cursor: "pointer", fontSize: 11, marginRight: 5 }}>✏️ Editovat</button>
                    <button onClick={() => setDeleteConfirm({ id: row.id, step: 1 })} style={{ padding: "3px 9px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 5, color: "#f87171", cursor: "pointer", fontSize: 11 }}>🗑️</button>
                  </td>
                )}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* EXPORT PREVIEW - sdílená tabulka pro CSV a XLS */}
      {(exportPreview?.type === "csv" || exportPreview?.type === "xls") && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
          <div style={{ background: "#1e293b", borderRadius: 16, width: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>
                {exportPreview.type === "csv" ? "📄 Export CSV" : "📊 Export Excel"}
              </h3>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>{filtered.length} řádků</span>
                <button
                  onClick={() => {
                    const ws_data = [COLUMNS.map(c => c.label), ...filtered.map(r => COLUMNS.map(c => r[c.key] ?? ""))];
                    if (exportPreview.type === "xls") {
                      const wb = XLSX.utils.book_new();
                      const ws = XLSX.utils.aoa_to_sheet(ws_data);
                      ws["!cols"] = COLUMNS.map(c => ({ wch: Math.max(c.label.length, 14) }));
                      XLSX.utils.book_append_sheet(wb, ws, "Stavby");
                      XLSX.writeFile(wb, "stavby.xlsx");
                    } else {
                      const BOM = "\uFEFF";
                      const h = COLUMNS.map(c => `"${c.label}"`).join(";");
                      const rows = filtered.map(r => COLUMNS.map(c => `"${String(r[c.key] ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
                      const blob = new Blob([BOM + h + "\n" + rows], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a"); a.href = url; a.download = "stavby.csv";
                      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                    }
                  }}
                  style={{ padding: "7px 16px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                  ⬇ Stáhnout {exportPreview.type === "xls" ? ".xlsx" : ".csv"}
                </button>
                <button onClick={() => setExportPreview(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, background: "#fff" }}>
              <div style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#111" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#1e3a5f" }}>Stavby Znojmo</div>
                  <div style={{ fontSize: 10, color: "#666" }}>kategorie 1 & 2 | Export: {new Date().toLocaleDateString("cs-CZ")} | Záznamů: {filtered.length}</div>
                </div>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 9 }}>
                  <thead>
                    <tr style={{ background: "#1e3a5f" }}>
                      {COLUMNS.map(c => <th key={c.key} style={{ color: "#fff", padding: "4px 6px", textAlign: c.key === "id" ? "center" : c.type === "number" ? "right" : "left", whiteSpace: "nowrap", border: "1px solid #2563eb", fontSize: 8 }}>{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, i) => (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? (row.firma === "DUR plus" ? "#eff6ff" : "#fefce8") : "#fff" }}>
                        {COLUMNS.map(c => {
                          const v = row[c.key] ?? "";
                          const isNum = c.type === "number" && v !== "" && Number(v) !== 0;
                          const display = isNum ? Number(v).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v;
                          const color = c.key === "rozdil" ? (Number(v) >= 0 ? "#166534" : "#991b1b") : "#111";
                          return <td key={c.key} style={{ padding: "3px 6px", border: "1px solid #e2e8f0", whiteSpace: "nowrap", textAlign: c.key === "id" ? "center" : c.type === "number" ? "right" : "left", color, fontSize: 9 }}>{display}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {exportPreview?.type === "pdf" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI',sans-serif" }}>
          <div style={{ background: "#1e293b", borderRadius: 16, width: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ color: "#fff", margin: 0, fontSize: 16 }}>🖨️ Náhled pro tisk / PDF</h3>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => window.print()} style={{ padding: "7px 16px", background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>🖨️ Tisk / Uložit jako PDF</button>
                <button onClick={() => setExportPreview(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer" }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, background: "#fff" }}>
              <div style={{ fontFamily: "Arial,sans-serif", fontSize: 10, color: "#111" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#1e3a5f" }}>Stavby Znojmo</div>
                  <div style={{ fontSize: 10, color: "#666" }}>kategorie 1 & 2 | Export: {new Date().toLocaleDateString("cs-CZ")} | Záznamů: {filtered.length}</div>
                </div>
                <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 9 }}>
                  <thead>
                    <tr style={{ background: "#1e3a5f" }}>
                      {COLUMNS.map(c => <th key={c.key} style={{ color: "#fff", padding: "4px 6px", textAlign: c.key === "id" ? "center" : c.type === "number" ? "right" : "left", whiteSpace: "nowrap", border: "1px solid #2563eb", fontSize: 8 }}>{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((row, i) => (
                      <tr key={row.id} style={{ background: i % 2 === 0 ? (row.firma === "DUR plus" ? "#eff6ff" : "#fefce8") : "#fff" }}>
                        {COLUMNS.map(c => {
                          const v = row[c.key] ?? "";
                          const isNum = c.type === "number" && v !== "" && Number(v) !== 0;
                          const display = isNum ? Number(v).toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v;
                          const color = c.key === "rozdil" ? (Number(v) >= 0 ? "#166534" : "#991b1b") : "#111";
                          return <td key={c.key} style={{ padding: "3px 6px", border: "1px solid #e2e8f0", whiteSpace: "nowrap", textAlign: c.key === "id" ? "center" : c.type === "number" ? "right" : "left", color, fontSize: 9 }}>{display}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {adding && <FormModal title="➕ Nová stavba" initial={emptyRow} onSave={r => { setData(d => [...d, r]); setAdding(false); }} onClose={() => setAdding(false)} firmy={firmy} objednatele={objednatele} stavbyvedouci={stavbyvedouci} />}
      {editRow && <FormModal title={`✏️ Editace stavby #${editRow.id}`} initial={editRow} onSave={r => { setData(d => d.map(x => x.id === r.id ? r : x)); setEditRow(null); }} onClose={() => setEditRow(null)} firmy={firmy} objednatele={objednatele} stavbyvedouci={stavbyvedouci} />}
      {showSettings && <SettingsModal firmy={firmy} objednatele={objednatele} stavbyvedouci={stavbyvedouci} users={users} onChange={saveSettings} onChangeUsers={saveUsers} onClose={() => setShowSettings(false)} />}

      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#1e293b", borderRadius: 14, padding: 28, width: 360, border: "1px solid rgba(255,255,255,0.1)", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>{deleteConfirm.step === 2 ? "🚨" : "⚠️"}</div>
            <h3 style={{ color: "#fff", margin: "0 0 8px" }}>{deleteConfirm.step === 2 ? "Opravdu smazat?" : "Smazat záznam?"}</h3>
            <p style={{ color: "rgba(255,255,255,0.4)", margin: "0 0 6px", fontSize: 13 }}>
              {deleteConfirm.step === 2
                ? <><span style={{ color: "#f87171", fontWeight: 700 }}>Toto je poslední varování.</span><br />Záznam bude trvale odstraněn.</>
                : "Chystáš se smazat tento záznam."}
            </p>
            <p style={{ color: "rgba(255,255,255,0.25)", margin: "0 0 22px", fontSize: 12 }}>
              {deleteConfirm.step === 2 ? "Krok 2 z 2 – akce je nevratná." : "Krok 1 z 2 – pokračuj pro potvrzení."}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ padding: "9px 18px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", cursor: "pointer" }}>Zrušit</button>
              {deleteConfirm.step === 1
                ? <button onClick={() => setDeleteConfirm({ id: deleteConfirm.id, step: 2 })} style={{ padding: "9px 18px", background: "linear-gradient(135deg,#d97706,#b45309)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontWeight: 600 }}>Ano, smazat</button>
                : <button onClick={() => handleDelete(deleteConfirm.id)} style={{ padding: "9px 18px", background: "linear-gradient(135deg,#dc2626,#b91c1c)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", fontWeight: 600 }}>Potvrdit smazání</button>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
