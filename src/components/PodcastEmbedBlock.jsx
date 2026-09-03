export function PodcastEmbedBlock({ embeds, piece }) {
  if (!embeds?.length && !piece?.transcriptExcerpt && !piece?.audioSummary) return null

  return (
    <section className="podcast-block">
      <div className="podcast-block__eyebrow">broadcast / player / transcript</div>

      {embeds?.length ? (
        <div className="podcast-block__grid">
          {embeds.map((embed, index) => (
            <article key={`${embed.url}-${index}`} className="podcast-card">
              <div className="podcast-card__meta">
                <span>{embed.kind}</span>
                <a href={embed.url} target="_blank" rel="noreferrer">open source</a>
              </div>

              {embed.kind === 'youtube' || embed.kind === 'spotify' || embed.kind === 'soundcloud' ? (
                <div className="podcast-card__frame">
                  <iframe
                    src={embed.embedUrl}
                    title={`podcast-embed-${index}`}
                    loading="lazy"
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="podcast-card__fallback">
                  <p>External media source detected.</p>
                  <a className="button button--primary" href={embed.url} target="_blank" rel="noreferrer">
                    open media
                  </a>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : null}

      <div className="podcast-notes">
        {piece?.audioSummary ? (
          <div className="podcast-note">
            <h3>episode summary</h3>
            <p>{piece.audioSummary}</p>
          </div>
        ) : null}

        {piece?.transcriptExcerpt ? (
          <div className="podcast-note">
            <h3>transcript excerpt</h3>
            <p>{piece.transcriptExcerpt}</p>
          </div>
        ) : (
          <div className="podcast-note">
            <h3>transcript status</h3>
            <p>Transcript pending. Self hosted transcription pipeline will plug in here later.</p>
          </div>
        )}

        {piece?.sourceNotes ? (
          <div className="podcast-note">
            <h3>source notes</h3>
            <p>{piece.sourceNotes}</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
