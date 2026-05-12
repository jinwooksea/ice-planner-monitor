"use client";

import CourseCard from "@/components/CourseCard";

export default function CourseList({
  visibleCourses,
  activeId,
  onCardClick,
  courses,
  processedCourses,
  hasMore,
  visibleCount,
  onLoadMore,
}) {
  return (
    <>
      {/* ── 강의 카드 그리드 ── */}
      {visibleCourses.length > 0 && (() => {
        const newCourses = visibleCourses.filter((c) => c.isNew);
        const oldCourses = visibleCourses.filter((c) => !c.isNew);
        return (
          <>
            {newCourses.length > 0 && (
              <>
                <div className="section-title">신규 등록 강의</div>
                <ul className="course-grid">
                  {newCourses.map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      isActive={activeId === course.id}
                      onClick={() => onCardClick(course)}
                    />
                  ))}
                </ul>
                <div className="section-divider" />
              </>
            )}
            <ul className="course-grid">
              {oldCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  isActive={activeId === course.id}
                  onClick={() => onCardClick(course)}
                />
              ))}
            </ul>
          </>
        );
      })()}

      {/* ── 결과 없음 ── */}
      {courses.length > 0 && processedCourses.length === 0 && (
        <p className="empty-result">조건에 맞는 강의가 없습니다.</p>
      )}

      {/* ── 더보기 버튼 ── */}
      {hasMore && (
        <div className="load-more-wrap">
          <button className="btn-load-more" onClick={onLoadMore}>
            더보기 ({visibleCount.toLocaleString()} / {processedCourses.length.toLocaleString()}개)
          </button>
        </div>
      )}
    </>
  );
}
