import { fmt, orDash } from "@/lib/format";

export default function DetailPanel({ detail, isLoading, error, onClose }) {
  if (!detail && !isLoading && !error) return null;

  return (
    <aside className="detail-panel">
      <button className="detail-close" onClick={onClose} title="닫기">✕</button>

      {isLoading && <div className="detail-loading">상세 정보 불러오는 중...</div>}
      {error && !isLoading && <div className="detail-error">⚠️ {error}</div>}

      {detail && !isLoading && (
        <>
          {detail.provider === "neti" ? (
            <>
              <a
                href={detail.detailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="detail-external-link"
              >
                중앙교육연수원에서 보기 ↗
              </a>

              {detail.thumbnail && (
                <img className="detail-thumb" src={detail.thumbnail} alt={detail.title} />
              )}

              <p className="detail-category">{orDash(detail.category)}</p>
              <h2 className="detail-title">{detail.title}</h2>

              <dl className="detail-meta">
                {[
                  ["기관명",     detail.organization],
                  ["신청기간",   detail.applyPeriod],
                  ["교육기간",   detail.educationPeriod],
                  ["차시/인정",  detail.credit],
                  ["교육대상",   detail.target],
                  ["만족도",     detail.rating],
                  ["신청수",     detail.applyCount ? String(detail.applyCount) : null],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} className="detail-meta-row">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <>
              <a
                href={`https://www.teacherville.co.kr${detail.detailUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="detail-external-link"
              >
                티처빌에서 보기 ↗
              </a>

              {detail.image && (
                <img className="detail-thumb" src={detail.image} alt={detail.title} />
              )}

              <span className={`cache-badge ${detail.cached ? "cached" : "fresh"}`}>
                {detail.cached ? "캐시" : "새로 조회"}
                {detail.inFlightUsed && " (In-Flight 공유)"}
              </span>

              <p className="detail-category">{orDash(detail.largeCategory)}</p>
              <h2 className="detail-title">{detail.title}</h2>

              <dl className="detail-meta">
                {[
                  ["카테고리", detail.category],
                  ["학점",     detail.credit],
                  ["연수 유형", detail.type],
                  ["가격",     fmt(detail.price)],
                  ["강사",     detail.tutorName   || null],
                  ["수강 대상", detail.target      || null],
                  ["후기 수",  detail.reviewCount > 0 ? String(detail.reviewCount) : null],
                  ["찜 수",    detail.wishCount   > 0 ? String(detail.wishCount)   : null],
                ].filter(([, v]) => v !== null).map(([label, value]) => (
                  <div key={label} className="detail-meta-row">
                    <dt>{label}</dt>
                    <dd className={label === "가격" ? "detail-price" : ""}>{orDash(value)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}

          {detail.schedules?.length > 0 && (
            <section className="detail-section">
              <h3 className="detail-section-title">운영 일정</h3>
              <ul className="detail-schedule-list">
                {detail.schedules.map((s, i) => (
                  <li key={i} className={`detail-schedule-item${s.available ? " available" : ""}`}>
                    <span className={`sched-badge ${s.available ? "open" : "closed"}`}>
                      {s.available ? "신청 가능" : "마감"}
                    </span>
                    <strong>{s.name}</strong>
                    <span className="sched-dates">
                      연수: {s.schedule || "-"}<br />
                      이수 기한: {s.completionDate || "-"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail.lessons?.length > 0 && (
            <section className="detail-section">
              <h3 className="detail-section-title">
                차시 목록 ({detail.lessons.length}차시)
              </h3>
              <ul className="detail-lesson-list">
                {detail.lessons.map((l, i) => (
                  <li key={i} className="detail-lesson-item">
                    <span className="lesson-num">{l.order}차시</span>
                    <span className="lesson-title">{l.title}</span>
                    <span className="lesson-meta">
                      {l.time ? `${l.time}분` : ""}
                      {l.pageCount ? ` · ${l.pageCount}p` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail.reviews?.length > 0 && (
            <section className="detail-section">
              <h3 className="detail-section-title">수강 후기</h3>
              <ul className="detail-review-list">
                {detail.reviews.map((r, i) => (
                  <li key={i} className="detail-review-item">
                    <p className="review-title">{r.title}</p>
                    <p className="review-body">{r.body}</p>
                    <p className="review-footer">{r.writer} · {r.date}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="detail-section">
            <details>
              <summary className="raw-summary">원본 JSON</summary>
              <pre className="raw-json">{JSON.stringify(detail, null, 2)}</pre>
            </details>
          </section>
        </>
      )}
    </aside>
  );
}
