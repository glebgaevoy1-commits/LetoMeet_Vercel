/* Upcoming published events ranked by registrations. */
function trendingEvents(items, today) {
  return items.filter(e => e.status === 'approved' && (e.regular || e.date >= today))
    .sort((a,b) => (Number(b.count)||0)-(Number(a.count)||0) ||
      (a.date+a.time).localeCompare(b.date+b.time) || a.id-b.id).slice(0,6);
}
