"use client";

export default function EventCardSkeleton() {
	return (
		<li className="event-card skeleton-card">
			<div className="skeleton-thumb shimmer" />
			<div className="skeleton-body">
				<div className="skeleton-line shimmer skeleton-line-title" />
				<div className="skeleton-line shimmer skeleton-line-meta" />
			</div>
		</li>
	);
}

export function EventCardSkeletonGrid({ count = 8 }) {
	return (
		<ul className="event-grid">
			{Array.from({ length: count }, (_, i) => (
				<EventCardSkeleton key={i} />
			))}
		</ul>
	);
}
