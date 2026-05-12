"use client";

import EventCard from "@/components/EventCard";

export default function EventList({ events, loading, error }) {
  if (loading) {
    return (
      <div className="loading-message">
        <span className="loading-spinner">⏳</span>
        <span>이벤트 정보를 불러오는 중입니다...</span>
        <span className="loading-sub">잠시만 기다려주세요</span>
      </div>
    );
  }

  if (error) {
    return <div className="error-banner">⚠️ {error}</div>;
  }

  if (!events || events.length === 0) {
    return (
      <div className="event-empty">
        <p>이벤트 정보가 없습니다.</p>
      </div>
    );
  }

  return (
    <ul className="event-grid">
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </ul>
  );
}
