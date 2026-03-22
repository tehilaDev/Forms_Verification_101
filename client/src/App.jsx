import React from 'react';
import VerificationForm from './components/VerificationForm.jsx';

export default function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <VerificationForm />
    </div>
  );
}
