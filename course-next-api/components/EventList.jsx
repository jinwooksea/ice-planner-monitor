"use client";

import EventCard from "@/components/EventCard";
import { EventCardSkeletonGrid } from "@/components/EventCardSkeleton";
import EmptyResult from "@/components/EmptyResult";

export default function EventList({ events, loading, error, favoriteIds, onToggleFavorite }) {
	// ── 초기 로딩: 스켈레톤 ──
	if (loading && (!events || events.length === 0)) {
		return <EventCardSkeletonGrid count={8} />;
	}

	if (error) {
		return <div className="error-banner">⚠️ {error}</div>;
	}

	if (!events || events.length === 0) {
		return (
			<EmptyResult
				title="이벤트 정보가 없습니다"
				description="잠시 후 다시 확인해 주세요."
				icon="📭"
			/>
		);
	}

	return (
		<ul className="event-grid">
			{events.map((event) => (
				<EventCard
					key={event.id}
					event={event}
					isFavorite={favoriteIds?.has(String(event.id))}
					onToggleFavorite={onToggleFavorite}
				/>
			))}
		</ul>
	);
}
