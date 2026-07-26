const DATE_PATTERN =
  /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/;

function compactText(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickFirst(...values) {
  return values.find((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return value !== undefined && value !== null && value !== "";
  });
}

function getNestedText(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(getNestedText).filter(Boolean).join("\n");
  }

  if (typeof value === "object") {
    return compactText(
      pickFirst(
        value.text,
        value.content,
        value.sentence,
        value.paragraph,
        value.tokens?.join?.(" "),
        value.words?.join?.(" ")
      )
    );
  }

  return "";
}

function parseJsonMaybe(value) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue.startsWith("[") && !trimmedValue.startsWith("{")) {
    return value;
  }

  try {
    return JSON.parse(trimmedValue);
  } catch {
    return value;
  }
}

export function extractDatasetDocumentText(record) {
  const doceeTitle = record["0"] || record[0] || "";
  const doceeBody = record["1"] || record[1] || "";

  if (doceeTitle || doceeBody) {
    return compactText([doceeTitle, doceeBody].filter(Boolean).join("\n"));
  }

  return compactText(
    pickFirst(
      record.text,
      record.document,
      record.content,
      record.article,
      record.doc,
      getNestedText(record.sentences),
      getNestedText(record.paragraphs),
      getNestedText(record.tokens)
    )
  );
}

function normalizeArgument(argument) {
  if (!argument) {
    return null;
  }

  if (typeof argument === "string") {
    return {
      role: "argument",
      text: argument,
    };
  }

  const role = pickFirst(
    argument.role,
    argument.argument_role,
    argument.type,
    argument.name,
    "argument"
  );
  const text = compactText(
    pickFirst(
      argument.text,
      argument.mention,
      argument.value,
      argument.entity,
      argument.span,
      argument.word,
      argument.tokens?.join?.(" ")
    )
  );

  if (!text) {
    return null;
  }

  return {
    role: String(role),
    text,
  };
}

function normalizeEvent(event, index) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const eventType = String(
    pickFirst(
      event.event_type,
      event.eventType,
      event.type,
      event.subtype,
      event.label,
      "EVENT"
    )
  );
  const mentionList = Array.isArray(event.mention)
    ? event.mention
    : Array.isArray(event.mentions)
    ? event.mentions
    : [];
  const firstMention = mentionList.find((mention) => mention?.text);
  const trigger = compactText(
    pickFirst(
      event.trigger?.text,
      event.trigger,
      event.event_trigger,
      firstMention?.text,
      event.mention,
      event.text,
      event.anchor,
      eventType
    )
  );
  const rawArguments = pickFirst(
    event.arguments,
    event.args,
    event.argument_list,
    event.participants,
    event.roles,
    []
  );
  const argumentsList = Array.isArray(rawArguments)
    ? rawArguments.map(normalizeArgument).filter(Boolean)
    : [];

  return {
    id: String(pickFirst(event.id, event.event_id, `event-${index + 1}`)),
    eventType,
    trigger,
    arguments: argumentsList,
  };
}

export function extractDatasetEvents(record) {
  const rawEvents = pickFirst(
    parseJsonMaybe(record["3"] || record[3]),
    record.events,
    record.event_mentions,
    record.event_list,
    record.labels,
    []
  );

  if (!Array.isArray(rawEvents)) {
    return [];
  }

  return rawEvents
    .map(normalizeEvent)
    .filter(Boolean);
}

function inferDeadlineFromText(text) {
  const match = compactText(text).match(DATE_PATTERN);
  return match?.[0] || "";
}

function inferDeadlineFromArguments(args) {
  const timeArgument = args.find((argument) =>
    /time|date|deadline|ngay|han/i.test(argument.role)
  );

  return timeArgument?.text || "";
}

function eventToTask(event, documentText, index) {
  const deadline =
    inferDeadlineFromArguments(event.arguments) ||
    inferDeadlineFromText(event.trigger) ||
    inferDeadlineFromText(documentText);
  const title = compactText(
    event.trigger && event.trigger !== event.eventType
      ? `${event.trigger}`
      : `${event.eventType}`
  );

  return {
    title: title || `Task from event ${index + 1}`,
    description: [
      `Event type: ${event.eventType}`,
      event.arguments.length > 0
        ? `Arguments: ${event.arguments
            .map((argument) => `${argument.role}=${argument.text}`)
            .join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    deadline,
    priority: deadline ? "High" : "Medium",
    sourceEventId: event.id,
  };
}

function normalizeTamCamTask(task, index) {
  if (!task || typeof task !== "object") {
    return null;
  }

  const title = compactText(
    pickFirst(
      task.title,
      task.name,
      task.task,
      task.description,
      `Task ${index + 1}`
    )
  );

  if (!title) {
    return null;
  }

  return {
    title,
    description: compactText(
      pickFirst(task.description, task.detail, task.note, title)
    ),
    deadline: compactText(pickFirst(task.deadline, task.dueDate, "")),
    startTime: compactText(pickFirst(task.startTime, task.time, "")),
    priority: compactText(pickFirst(task.priority, "medium")),
    taskType: compactText(pickFirst(task.taskType, task.type, "task")),
    source: compactText(pickFirst(task.source, "document")),
    status: compactText(pickFirst(task.status, "pending")),
  };
}

function extractTamCamAssistant(record) {
  const assistant = record.assistant;

  if (!assistant || typeof assistant !== "object") {
    return null;
  }

  const tasks = Array.isArray(assistant.tasks)
    ? assistant.tasks.map(normalizeTamCamTask).filter(Boolean)
    : [];

  return {
    summary: compactText(assistant.summary),
    tasks,
  };
}

export function normalizeDatasetRecord(record, index = 0) {
  const documentText = extractDatasetDocumentText(record);
  const tamCamAssistant = extractTamCamAssistant(record);

  if (tamCamAssistant) {
    return {
      id: String(
        pickFirst(
          record.id,
          record.doc_id,
          record.document_id,
          record.guid,
          `record-${index + 1}`
        )
      ),
      source: "tamcam-vietnamese",
      language: record.metadata?.language || record.language || "vi",
      documentText,
      user: compactText(record.user),
      summary: tamCamAssistant.summary,
      events: [],
      tasks: tamCamAssistant.tasks,
      metadata: record.metadata || {},
      trainingExample: {
        input: {
          documentText,
          user: compactText(record.user),
          instruction:
            "Read the Vietnamese document, answer the user's request, summarize the content, and extract tasks with deadline/time when available.",
        },
        expectedOutput: {
          summary: tamCamAssistant.summary,
          tasks: tamCamAssistant.tasks,
          metadata: record.metadata || {},
        },
      },
    };
  }

  const events = extractDatasetEvents(record);
  const tasks = events.map((event, eventIndex) =>
    eventToTask(event, documentText, eventIndex)
  );

  return {
    id: String(
      pickFirst(
        record.id,
        record.doc_id,
        record.document_id,
        record.guid,
        `record-${index + 1}`
      )
    ),
    source: "dataset",
    language: record.language || record.lang || "unknown",
    documentText,
    events,
    tasks,
    trainingExample: {
      input: {
        documentText,
        instruction:
          "Extract events, action items, deadlines, and suggested tasks from this document.",
      },
      expectedOutput: {
        events,
        tasks,
      },
    },
  };
}

export function normalizeDataset(records) {
  const items = Array.isArray(records)
    ? records
    : Array.isArray(records?.data)
    ? records.data
    : Array.isArray(records?.documents)
    ? records.documents
    : [];

  return items.map(normalizeDatasetRecord);
}

export function toJsonl(records) {
  return records
    .map((record) => JSON.stringify(record))
    .join("\n");
}
