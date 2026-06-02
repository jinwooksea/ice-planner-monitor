"use client";

export default function EmptyResult({
	title = "조건에 맞는 강의가 없습니다",
	description = "검색어나 필터를 조정해 보세요.",
	icon = "🔍",
	onResetFilters,
	resetLabel = "필터 초기화",
}) {
	return (
		<div className="empty-result">
			<div className="empty-icon" aria-hidden="true">{icon}</div>
			<p className="empty-title">{title}</p>
			{description && <p className="empty-desc">{description}</p>}
			{onResetFilters && (
				<button type="button" className="btn-reset-large" onClick={onResetFilters}>
					{resetLabel}
				</button>
			)}
		</div>
	);
}
