import { fmtDate } from "@/lib/format";

export default function CacheStatusPanel({ meta }) {
  if (!meta) return null;

  return (
    <div className="cache-panel">
      <div className="cache-panel-row">
        <span className={`cache-badge ${meta.cached ? "cached" : "fresh"}`}>
          {meta.cached ? "캐시 사용 중" : "새로 조회"}
        </span>
        <span className="cache-panel-label">수집</span>
        <strong>{meta.fetchedCount?.toLocaleString()}개</strong>
        <span className="cache-panel-label">/ 외부요청</span>
        <strong>{meta.externalRequestCount}회</strong>
        {meta.inFlightUsed && (
          <span className="inflight-badge">In-Flight 공유</span>
        )}
      </div>
      <div className="cache-panel-times">
        <span>마지막 갱신: {fmtDate(meta.lastFetchedAt)}</span>
        <span className="cache-separator">|</span>
        <span>다음 갱신 가능: {fmtDate(meta.nextRefreshAvailableAt)}</span>
        <span className="cache-separator">|</span>
        <span>캐시 유지: {meta.cacheTtlHours}시간</span>
      </div>
      {meta.note && <p className="cache-note">{meta.note}</p>}
    </div>
  );
}
