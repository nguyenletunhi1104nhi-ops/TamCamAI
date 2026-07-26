import TaskBlock from "./TaskBlock";

function getWeekEnd(currentWeek) {
  const weekEnd = new Date(currentWeek);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return weekEnd;
}

function getDayIndex(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  return date.getDay();
}

function addOneHour(time) {
  const [hour, minute] = time.split(":").map(Number);
  const nextHour = Math.min(hour + 1, 23);

  return `${String(nextHour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function getMinutes(time) {
  const [hour, minute] = String(time || "00:00").split(":").map(Number);
  return hour * 60 + minute;
}

function markOverlaps(events) {
  const groupedByDay = events.reduce((groups, event) => {
    const dayEvents = groups.get(event.day) || [];
    dayEvents.push(event);
    groups.set(event.day, dayEvents);
    return groups;
  }, new Map());

  const positionedEvents = [];

  groupedByDay.forEach((dayEvents) => {
    const sortedEvents = [...dayEvents].sort(
      (first, second) => getMinutes(first.start) - getMinutes(second.start)
    );
    const clusters = [];

    sortedEvents.forEach((event) => {
      const start = getMinutes(event.start);
      const end = getMinutes(event.end);
      let targetCluster = clusters.find((cluster) => start < cluster.end);

      if (!targetCluster) {
        targetCluster = {
          end,
          events: [],
        };
        clusters.push(targetCluster);
      }

      targetCluster.end = Math.max(targetCluster.end, end);
      targetCluster.events.push(event);
    });

    clusters.forEach((cluster) => {
      const columns = [];

      cluster.events.forEach((event) => {
        const start = getMinutes(event.start);
        const end = getMinutes(event.end);
        let columnIndex = columns.findIndex((columnEnd) => columnEnd <= start);

        if (columnIndex === -1) {
          columnIndex = columns.length;
          columns.push(end);
        } else {
          columns[columnIndex] = end;
        }

        positionedEvents.push({
          ...event,
          overlapCount: columns.length,
          overlapIndex: columnIndex,
          hasConflict: cluster.events.length > 1,
        });
      });
    });
  });

  return positionedEvents;
}

function TaskLayer({ tasks = [], currentWeek, highlightedTaskId }) {
  if (!currentWeek) {
    return null;
  }

  const weekStart = new Date(currentWeek);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = getWeekEnd(currentWeek);

  const events = tasks
    .filter((task) => {
      if (!task.startDate || !task.startTime) {
        return false;
      }

      const [year, month, day] = task.startDate
        .split("-")
        .map(Number);

      const taskDate = new Date(year, month - 1, day);
      taskDate.setHours(0, 0, 0, 0);

      return taskDate >= weekStart && taskDate <= weekEnd;
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      day: getDayIndex(task.startDate),
      start: task.startTime,
      end: task.endTime || addOneHour(task.startTime),
      priority: task.priority,
      status: task.status,
      category: task.category,
    }));
  const positionedEvents = markOverlaps(events);

  return (
    <div className="absolute inset-0">
      {positionedEvents.map((event) => (
        <TaskBlock
          key={event.id}
          event={event}
          highlighted={event.id === highlightedTaskId}
        />
      ))}
    </div>
  );
}

export default TaskLayer;
