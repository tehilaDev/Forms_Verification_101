import React, { useState } from 'react';
import axios from 'axios';

// ── Shared styles ─────────────────────────────────────────────────────────────
const card = {
  background: '#fff',
  borderRadius: '18px',
  padding: '40px 36px',
  width: '100%',
  maxWidth: '480px',
  boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
  direction: 'rtl',
};

const label = {
  display: 'block',
  fontSize: '13px',
  fontWeight: '700',
  color: '#374151',
  marginTop: '16px',
  marginBottom: '5px',
};

const input = {
  width: '100%',
  padding: '10px 14px',
  border: '1.5px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '15px',
  direction: 'rtl',
  fontFamily: 'inherit',
  outline: 'none',
  transition: 'border-color 0.2s',
};

const btn = (color = '#5c67f2') => ({
  width: '100%',
  padding: '13px',
  background: color,
  color: '#fff',
  border: 'none',
  borderRadius: '9px',
  fontSize: '16px',
  fontWeight: '700',
  cursor: 'pointer',
  marginTop: '20px',
  fontFamily: 'inherit',
  transition: 'opacity 0.2s',
});

const errorBox = {
  background: '#fef2f2',
  border: '1.5px solid #fca5a5',
  borderRadius: '8px',
  padding: '10px 14px',
  color: '#b91c1c',
  fontSize: '14px',
  marginBottom: '4px',
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function VerificationForm() {
  const [step, setStep] = useState(1); // 1 = enter ID, 2 = full form, 'admin' = admin password

  // Step-1 state
  const [idNumber, setIdNumber] = useState('');

  // Step-2 state (populated after /init)
  const [token, setToken] = useState('');
  const [fields, setFields] = useState([]); // 3 random extra fields
  const [remainingAttempts, setRemainingAttempts] = useState(2);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
  const [extraValues, setExtraValues] = useState({});

  // Admin state
  const [adminPassword, setAdminPassword] = useState('');

  // Global state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [wrongFields, setWrongFields] = useState([]);
  const [blocked, setBlocked] = useState(false);
  const [success, setSuccess] = useState(false);

  // ── Step 1: look up employee ───────────────────────────────────────────────
  const handleInit = async (e, asEmployee = false) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await axios.post('/api/verify/init', {
        id_number: idNumber,
        ...(asEmployee && { as_employee: true }),
      });
      if (data.isAdmin) {
        setStep('admin');
        return;
      }
      setToken(data.token);
      setFields(data.fields);
      setRemainingAttempts(data.remainingAttempts);
      setStep(2);
    } catch (err) {
      const serverError = err.response?.data?.error || 'שגיאה בחיבור לשרת';
      if (err.response?.data?.blocked) setBlocked(true);
      setError(serverError);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: submit verification ───────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setWrongFields([]);
    setLoading(true);
    try {
      await axios.post('/api/verify/submit', {
        token,
        ...formData,
        extraFields: extraValues,
      });
      setSuccess(true);
    } catch (err) {
      const res = err.response?.data;
      if (res?.blocked || err.response?.status === 403) setBlocked(true);
      setRemainingAttempts(res?.remainingAttempts ?? remainingAttempts - 1);
      setError(res?.error || 'שגיאה בחיבור לשרת');
      setWrongFields(res?.wrongFields || []);
    } finally {
      setLoading(false);
    }
  };

  // ── Admin: download today's export ────────────────────────────────────────
  const handleAdminDownload = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await axios.post(
        '/api/export/admin/daily',
        { admin_id: idNumber, admin_password: adminPassword },
        { responseType: 'blob' }
      );
      const today = new Date().toISOString().split('T')[0];
      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `verifications_admin_${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try { setError(JSON.parse(text).error); } catch { setError('שגיאה בייצוא הנתונים'); }
      } else {
        setError(err.response?.data?.error || 'שגיאה בייצוא הנתונים');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Blocked screen ────────────────────────────────────────────────────────
  if (blocked) {
    return (
      <div style={card}>
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ fontSize: '52px', marginBottom: '14px' }}>🔒</div>
          <h2 style={{ color: '#dc2626', fontSize: '22px', marginBottom: '10px' }}>
            חשבון חסום
          </h2>
          <p style={{ color: '#6b7280', lineHeight: '1.7', fontSize: '15px' }}>
            חשבונך חסום לצמיתות לאחר שני ניסיונות כושלים.
            <br />
            אנא פנה למחלקת משאבי אנוש לסיוע.
          </p>
        </div>
      </div>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={card}>
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ fontSize: '52px', marginBottom: '14px' }}>✅</div>
          <h2 style={{ color: '#16a34a', fontSize: '22px', marginBottom: '10px' }}>
            האימות הצליח!
          </h2>
          <p style={{ color: '#6b7280', fontSize: '15px' }}>
            פרטיך נקלטו בהצלחה במערכת. תודה.
          </p>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div style={card}>
      {/* Header */}
      <h1 style={{ fontSize: '21px', fontWeight: '800', color: '#1f2937' }}>
        אימות עובד – טופס 101
      </h1>
      <p style={{ color: '#9ca3af', fontSize: '13px', marginTop: '4px', marginBottom: '20px' }}>
        {step === 1
          ? 'הזן את תעודת הזהות שלך כדי להמשיך'
          : step === 'admin'
          ? 'הזן סיסמת מנהל להורדת קובץ האימותים'
          : 'נא למלא את הפרטים הבאים לאימות זהותך'}
      </p>

      {/* Error banner */}
      {error && (
        <div style={errorBox}>
          {error}
          {wrongFields.length > 0 && (
            <div style={{ marginTop: '6px' }}>
              <span style={{ fontWeight: '700' }}>שדות שגויים:</span>
              <ul style={{ margin: '4px 0 0 0', paddingRight: '18px' }}>
                {wrongFields.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          {step === 2 && !blocked && remainingAttempts > 0 && (
            <span style={{ display: 'block', marginTop: '4px', fontWeight: '600' }}>
              ניסיונות שנותרו: {remainingAttempts}
            </span>
          )}
        </div>
      )}

      {/* ── Step 1 ── */}
      {step === 1 && (
        <form onSubmit={handleInit}>
          <label style={label}>תעודת זהות</label>
          <input
            style={input}
            type="text"
            inputMode="numeric"
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder="הזן תעודת זהות"
            maxLength={9}
            required
          />
          <button style={btn()} type="submit" disabled={loading}>
            {loading ? 'טוען…' : 'המשך'}
          </button>
        </form>
      )}

      {/* ── Admin step ── */}
      {step === 'admin' && (
        <form onSubmit={handleAdminDownload}>
          <label style={label}>סיסמת מנהל</label>
          <input
            style={input}
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            placeholder="הזן סיסמה"
            required
          />
          <button style={btn()} type="submit" disabled={loading}>
            {loading ? 'מייצא…' : 'הורד קובץ אקסל'}
          </button>
          <button
            type="button"
            style={{ ...btn('#10b981'), marginTop: '8px' }}
            disabled={loading}
            onClick={() => { setError(''); setAdminPassword(''); handleInit(null, true); }}
          >
            עבור לטופס אימות עובד
          </button>
          <button
            type="button"
            style={{ ...btn('#9ca3af'), marginTop: '8px' }}
            onClick={() => { setStep(1); setError(''); setAdminPassword(''); }}
          >
            חזרה
          </button>
        </form>
      )}

      {/* ── Step 2 ── */}
      {step === 2 && (
        <form onSubmit={handleSubmit}>
          {/* Base fields */}
          <label style={label}>שם מלא</label>
          <input
            style={input}
            type="text"
            value={formData.name}
            onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
            placeholder="שם פרטי ושם משפחה"
            required
          />

          <label style={label}>כתובת מייל</label>
          <input
            style={input}
            type="email"
            value={formData.email}
            onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
            placeholder="example@company.com"
            required
          />

          <label style={label}>טלפון נייד</label>
          <input
            style={input}
            type="tel"
            inputMode="numeric"
            value={formData.phone}
            onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
            placeholder="05X-XXXXXXX"
            required
          />

          {/* 3 random extra fields */}
          {fields.map((field) => (
            <div key={field.key}>
              <label style={label}>{field.label}</label>
              {field.type === 'select' ? (
                <select
                  style={input}
                  value={extraValues[field.key] || ''}
                  onChange={(e) =>
                    setExtraValues((p) => ({ ...p, [field.key]: e.target.value }))
                  }
                  required
                >
                  <option value="">בחר…</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  style={input}
                  type="text"
                  value={extraValues[field.key] || ''}
                  onChange={(e) =>
                    setExtraValues((p) => ({ ...p, [field.key]: e.target.value }))
                  }
                  required
                />
              )}
            </div>
          ))}

          <button style={btn()} type="submit" disabled={loading}>
            {loading ? 'מאמת…' : 'שלח לאימות'}
          </button>

          <button
            type="button"
            style={{ ...btn('#9ca3af'), marginTop: '8px' }}
            onClick={() => {
              setStep(1);
              setError('');
              setToken('');
              setFields([]);
              setExtraValues({});
              setFormData({ name: '', email: '', phone: '' });
            }}
          >
            חזרה
          </button>
        </form>
      )}
    </div>
  );
}
