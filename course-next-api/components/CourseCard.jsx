"use client";

const fmt = (v) =>
  !v && v !== 0 ? "-" : v === 0 ? "무료" : Number(v).toLocaleString("ko-KR") + "원";

const orDash = (v) => v || "-";

const PROVIDER_LABELS = {
  teacherville: "티처빌",
  hstudy:       "한국교원연수원",
  neti:         "중앙교육연수원",
};

function handleClick(course, onClick) {
  if (course.provider === "hstudy") {
    if (course.detailUrl) window.open(course.detailUrl, "_blank", "noopener,noreferrer");
    return;
  }
  onClick();
}

export default function CourseCard({ course, isActive, onClick }) {
  return (
    <li
      className={`course-card${isActive ? " is-active" : ""}`}
      onClick={() => handleClick(course, onClick)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && handleClick(course, onClick)}
    >
      <div className="card-thumb-wrap">
        {course.thumbnail ? (
          <img
            className="card-thumb"
            src={course.thumbnail}
            alt={course.title}
            loading="lazy"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        ) : (
          <div className="card-thumb-placeholder" />
        )}
        {course.isNew && <div className="course-new-badge">NEW</div>}
      </div>

      {(course.isRecommended || course.provider === "teacherville" || course.provider === "hstudy" || course.provider === "neti" || course.badges?.length > 0) && (
        <div className="card-badges">
          {course.isRecommended && (
            <span className="badge recommend-badge">AI 추천</span>
          )}
          {PROVIDER_LABELS[course.provider] && (
            <span className={`badge provider-badge provider-badge--${course.provider}`}>
              {PROVIDER_LABELS[course.provider]}
            </span>
          )}
          {course.badges?.filter((b) => b !== "NEW").map((b) => (
            <span key={b} className="badge">{b}</span>
          ))}
        </div>
      )}

      <div className="card-body">
        <p className="card-category">{orDash(course.category)}</p>
        <h3 className="card-title">{course.title}</h3>
        {course.tutorName && <p className="card-tutor">{course.tutorName}</p>}

        <dl className="card-info">
          {course.provider === "neti" ? (
            <>
              <div className="card-info-row"><dt>과정</dt><dd>{orDash(course.trainingType)}</dd></div>
              <div className="card-info-row"><dt>차시</dt><dd>{orDash(course.credit)}</dd></div>
              <div className="card-info-row"><dt>대상</dt><dd>{orDash(course.target)}</dd></div>
            </>
          ) : (
            <>
              <div className="card-info-row"><dt>학점</dt><dd>{orDash(course.credit)}</dd></div>
              <div className="card-info-row"><dt>유형</dt><dd>{orDash(course.trainingType)}</dd></div>
            </>
          )}
        </dl>

        <div className="card-footer">
          <span className="card-price">{fmt(course.price)}</span>
          <span className="card-stats">♥ {course.wishCount ?? 0} &nbsp; ★ {course.reviewCount ?? 0}</span>
        </div>
        <p className="card-id">ID: {course.id}</p>
      </div>
    </li>
  );
}
