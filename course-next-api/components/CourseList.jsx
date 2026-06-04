"use client";

import CourseCard from "@/components/CourseCard";
import { CourseCardSkeletonGrid } from "@/components/CourseCardSkeleton";
import EmptyResult from "@/components/EmptyResult";

export default function CourseList({
	visibleCourses,
	activeId,
	onCardClick,
	courses,
	processedCourses,
	hasMore,
	visibleCount,
	onLoadMore,
	isLoading,
	onResetFilters,
	query,
	favoriteIds,
	onToggleFavorite,
}) {
	// ── 초기 로딩: 카드가 한 번도 안 채워졌을 때 스켈레톤 ──
	if (isLoading && courses.length === 0) {
		return <CourseCardSkeletonGrid count={8} />;
	}

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
											query={query}
											isFavorite={favoriteIds?.has(String(course.id))}
											onToggleFavorite={onToggleFavorite}
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
									query={query}
									isFavorite={favoriteIds?.has(String(course.id))}
									onToggleFavorite={onToggleFavorite}
								/>
							))}
						</ul>
					</>
				);
			})()}

			{/* ── 결과 없음 (필터 0건) ── */}
			{courses.length > 0 && processedCourses.length === 0 && (
				<EmptyResult
					title="조건에 맞는 강의가 없습니다"
					description="검색어나 필터를 조정해 보세요."
					icon="🔍"
					onResetFilters={onResetFilters}
				/>
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
