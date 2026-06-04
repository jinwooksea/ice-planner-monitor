"use client";

const PROVIDER_LABELS = {
  teacherville: "티처빌",
  hstudy:       "한국교원연수원",
  ybm:          "YBM",
};

const STATE_STYLE = {
  진행중: { bg: "#dcfce7", color: "#166534" },
  예정:   { bg: "#eff0f7", color: "#5b6af0" },
  종료:   { bg: "#f3f4f6", color: "#9ca3af" },
};

export default function EventCard({ event, isFavorite, onToggleFavorite }) {
  const style = STATE_STYLE[event.status] ?? STATE_STYLE["종료"];

  function handleClick() {
    if (event.detailUrl) window.open(event.detailUrl, "_blank", "noopener,noreferrer");
  }

  function handleFavClick(e) {
    e.stopPropagation();
    onToggleFavorite?.(event.id);
  }

  return (
    <li
      className="event-card"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
    >
      <div className="event-thumb-wrap">
        <button
          type="button"
          className={`fav-btn${isFavorite ? " is-active" : ""}`}
          aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          aria-pressed={isFavorite}
          onClick={handleFavClick}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {isFavorite ? "★" : "☆"}
        </button>
        {event.thumbnail ? (
          <img
            className="event-thumb"
            src={event.thumbnail}
            alt={event.title}
            loading="lazy"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="event-thumb-placeholder" />
        )}
      </div>

      <div className="event-body">
        <div className="event-badges">
          {event.provider && (
            <span className={`event-provider-badge event-provider-badge--${event.provider}`}>
              {PROVIDER_LABELS[event.provider] ?? event.provider}
            </span>
          )}
          <span
            className="event-state-badge"
            style={{ background: style.bg, color: style.color }}
          >
            {event.status || "-"}
          </span>
          {event.status === "진행중" && event.dday === 0 && (
            <span className="event-dday is-urgent">오늘 마감</span>
          )}
          {event.status === "진행중" && event.dday > 0 && (
            <span className={`event-dday${event.dday <= 3 ? " is-urgent" : ""}`}>
              D-{event.dday}
            </span>
          )}
        </div>

        <h3 className="event-title">{event.title}</h3>

        <p className="event-period">
          {event.startDate || "-"} ~ {event.endDate || "-"}
        </p>
      </div>
    </li>
  );
}
