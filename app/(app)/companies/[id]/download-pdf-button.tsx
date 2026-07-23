"use client";

import { useRef } from "react";

// Download PDF with the review gate attached. With nothing pending it's the
// same plain download anchor as before. While suggested sources await review
// it becomes a button that opens a native <dialog> explaining the dependency
// — mirroring pdf/route.ts, which refuses generation (409) in that state.
export default function DownloadPdfButton({
  companyId,
  companyName,
  pendingReview,
}: {
  companyId: string;
  companyName: string;
  pendingReview: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  if (pendingReview === 0) {
    return (
      <a className="btn primary" href={`/companies/${companyId}/pdf`} download={`${companyName}.pdf`}>
        Download PDF
      </a>
    );
  }

  const s = pendingReview === 1 ? "" : "s";
  return (
    <>
      <button type="button" className="btn primary" onClick={() => dialogRef.current?.showModal()}>
        Download PDF
      </button>
      <dialog ref={dialogRef} className="gate-dialog">
        <h3>Review suggested sources first</h3>
        <p>
          Research found {pendingReview} suggested source{s} that {pendingReview === 1 ? "hasn't" : "haven't"} been
          reviewed yet. Approve or deny each one in the Source view — the PDF can be generated once every
          suggestion is handled.
        </p>
        <div className="gate-actions">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
            Close
          </button>
          <a className="btn primary" href={`/companies/${companyId}?view=source`}>
            Review sources
          </a>
        </div>
      </dialog>
    </>
  );
}
