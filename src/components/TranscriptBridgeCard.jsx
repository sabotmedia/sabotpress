export function TranscriptBridgeCard({ draft, setDraft }) {
  return (
    <section className="review-summary-card">
      <div className="review-summary-card__eyebrow">transcript bridge</div>
      <p className="review-card__excerpt">
        This is the pragmatic transcript lane. It stores transcript text and job metadata now, so automated transcription can slot in later without pretending the app already has a worker fleet and a moon base.
      </p>

      <div className="native-content-editor__grid">
        <label className="archive-control">
          <span>transcription status</span>
          <select
            value={draft.transcriptionStatus || 'none'}
            onChange={(e) => setDraft((d) => ({ ...d, transcriptionStatus: e.target.value }))}
          >
            <option value="none">none</option>
            <option value="queued">queued</option>
            <option value="processing">processing</option>
            <option value="completed">completed</option>
            <option value="failed">failed</option>
          </select>
        </label>

        <label className="archive-control">
          <span>audio source url</span>
          <input
            type="text"
            value={draft.audioSourceUrl || ''}
            onChange={(e) => setDraft((d) => ({ ...d, audioSourceUrl: e.target.value }))}
          />
        </label>
      </div>

      <label className="archive-control">
        <span>full transcript</span>
        <textarea
          className="native-content-editor__textarea"
          value={draft.fullTranscript || ''}
          onChange={(e) => setDraft((d) => ({ ...d, fullTranscript: e.target.value }))}
          placeholder="paste transcript text here, or leave empty until an automated pipeline exists"
        />
      </label>

      <label className="archive-control">
        <span>transcript notes</span>
        <textarea
          className="native-content-editor__textarea native-content-editor__textarea--sm"
          value={draft.transcriptNotes || ''}
          onChange={(e) => setDraft((d) => ({ ...d, transcriptNotes: e.target.value }))}
          placeholder="speaker quality, source issues, cleanup notes, etc."
        />
      </label>
    </section>
  )
}
