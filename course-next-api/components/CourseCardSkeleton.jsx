"use client";

export default function CourseCardSkeleton() {
	return (
		<li className="course-card skeleton-card">
			<div className="skeleton-thumb shimmer" />
			<div className="skeleton-body">
				<div className="skeleton-line shimmer skeleton-line-title" />
				<div className="skeleton-line shimmer skeleton-line-meta" />
				<div className="skeleton-line shimmer skeleton-line-price" />
			</div>
		</li>
	);
}

export function CourseCardSkeletonGrid({ count = 8 }) {
	return (
		<ul className="course-grid">
			{Array.from({ length: count }, (_, i) => (
				<CourseCardSkeleton key={i} />
			))}
		</ul>
	);
}
