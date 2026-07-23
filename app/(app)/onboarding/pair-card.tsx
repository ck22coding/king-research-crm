"use client";

import { useState, useTransition } from "react";
import { createPairingCode } from "./actions";

export default function PairCard() {
  const [code, setCode] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="card">
      <h3>Connect this computer</h3>
      <p style={{ marginBottom: 8 }}>
        Generates a one-time code (valid 10 minutes). Paste it into the runner
        when it asks — that links the runner to your account, once.
      </p>
      {code ? (
        <div className="chips">
          <span className="chip">
            <code data-testid="pairing-code">{code}</code>
          </span>
        </div>
      ) : (
        <button className="btn" disabled={pending} onClick={() => start(async () => setCode(await createPairingCode()))}>
          Connect this computer
        </button>
      )}
    </div>
  );
}
