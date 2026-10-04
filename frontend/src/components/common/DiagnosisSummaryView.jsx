// Read-only rendering of a SAVED clinical assessment session (no AI calls).
// Used by both the appointment "Summary" page and the Diagnosis History detail page.
export default function DiagnosisSummaryView({ session }) {
  const a = session.clinicalAssessment || {};
  const conditions = Array.isArray(a.possibleConditions) ? a.possibleConditions : [];
  const redFlags = Array.isArray(a.redFlags) ? a.redFlags.filter((r) => r.detected) : [];
  const answered = (session.questions || []).filter((q) => q.answer);
  const assessedAt = session.completedAt || session.createdAt;

  return (
    <div className="space-y-6">
      {assessedAt && (
        <p className="text-sm text-gray-500">Assessed on {new Date(assessedAt).toLocaleString()}</p>
      )}

      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Initial symptoms</h2>
        <p className="text-gray-800 whitespace-pre-wrap">{session.initialSymptoms}</p>
      </section>

      {answered.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Follow-up questions & answers</h2>
          <ul className="space-y-3">
            {answered.map((q) => (
              <li key={q.questionId} className="border-l-4 border-teal-200 pl-3">
                <p className="font-medium text-gray-900">{q.question}</p>
                <p className="text-gray-700">{q.answer}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Possible conditions</h2>
        {conditions.length ? (
          <ul className="space-y-3">
            {conditions.map((c, i) => (
              <li key={`${c.name}-${i}`} className="border-b border-gray-200 pb-3">
                <p className="font-medium text-gray-900">{c.name}</p>
                {c.reason && <p className="text-gray-700 mt-1">{c.reason}</p>}
                {c.confidence && <p className="text-sm text-gray-600 mt-1">Confidence: {c.confidence}</p>}
                {c.evidence?.length > 0 && (
                  <p className="text-sm text-gray-600 mt-1">Reported evidence: {c.evidence.join('; ')}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600">No possible conditions were returned.</p>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Triage</h2>
        <p className="font-medium text-gray-900 capitalize">{a.triage?.level || 'routine'}</p>
        {a.triage?.reason && <p className="text-gray-700 mt-1">{a.triage.reason}</p>}
      </section>

      {redFlags.length > 0 && (
        <section className="border-l-4 border-red-500 bg-red-50 p-4">
          <h2 className="text-xl font-semibold text-red-800 mb-2">Red flags</h2>
          <ul className="space-y-2">
            {redFlags.map((r, i) => (
              <li key={`${r.flag}-${i}`}>
                <p className="font-medium text-red-900">{r.flag}</p>
                <p className="text-red-800">{r.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Recommended specialist</h2>
        <p className="font-medium text-gray-900">{a.recommendedSpecialist?.specialty || 'Not specified'}</p>
        {a.recommendedSpecialist?.reason && <p className="text-gray-700 mt-1">{a.recommendedSpecialist.reason}</p>}
      </section>

      {a.followUpNeeded?.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Follow-up recommendations</h2>
          <ul className="list-disc pl-5 text-gray-700 space-y-1">
            {a.followUpNeeded.map((item, i) => <li key={`${item}-${i}`}>{item}</li>)}
          </ul>
        </section>
      )}

      <div className="bg-amber-100 text-amber-800 p-4 rounded-md">
        {a.disclaimer || 'This assessment is for informational and educational purposes only and does not replace evaluation by a qualified healthcare professional.'}
      </div>
    </div>
  );
}
