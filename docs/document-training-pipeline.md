# TamCam AI Document Training Pipeline

This pipeline prepares document datasets for TamCam AI document understanding.
It does not train a chatbot directly. It converts event/document datasets into a
stable JSONL format that can be used for evaluation, prompt testing, RAG checks,
or future fine-tuning.

## Target Capability

Input:

- Long document text
- Optional labeled events and arguments

Output:

- Events
- Action items
- Suggested tasks
- Deadlines when available

## JSONL Training Schema

Each line is one example:

```json
{
  "input": {
    "documentText": "Full document text...",
    "instruction": "Extract events, action items, deadlines, and suggested tasks from this document."
  },
  "expectedOutput": {
    "events": [
      {
        "id": "event-1",
        "eventType": "EVENT_TYPE",
        "trigger": "event trigger",
        "arguments": [
          {
            "role": "Time",
            "text": "2026-07-30"
          }
        ]
      }
    ],
    "tasks": [
      {
        "title": "event trigger",
        "description": "Event type and arguments",
        "deadline": "2026-07-30",
        "priority": "High",
        "sourceEventId": "event-1"
      }
    ]
  }
}
```

## Usage

From the `server` folder:

```bash
npm run prepare:dataset -- path/to/train.json server/data/tamcam-training.jsonl
```

For the downloaded DocEE-en folder from this project root:

```bash
node --max-old-space-size=4096 server/scripts/prepareDataset.js DocEE-en/normal_setting/train.json server/data/docee-normal-train.jsonl
node --max-old-space-size=4096 server/scripts/prepareDataset.js DocEE-en/normal_setting/dev.json server/data/docee-normal-dev.jsonl
node --max-old-space-size=4096 server/scripts/prepareDataset.js DocEE-en/normal_setting/test.json server/data/docee-normal-test.jsonl
```

Some DocEE files contain non-standard `NaN` values exported from Python/Pandas.
The prepare script converts those values to `null` before parsing.

For the TamCam Vietnamese V2 dataset:

```bash
node server/scripts/prepareDataset.js server/data/vietnamese/TamCam_V2_train.jsonl server/data/tamcam-vietnamese-train.jsonl
node server/scripts/prepareDataset.js server/data/vietnamese/TamCam_V2_valid.jsonl server/data/tamcam-vietnamese-valid.jsonl
node server/scripts/prepareDataset.js server/data/vietnamese/TamCam_V2_test.jsonl server/data/tamcam-vietnamese-test.jsonl
```

This dataset already contains the app-specific fields `document`, `user`,
`assistant.summary`, `assistant.tasks`, and Vietnamese metadata. The converter
preserves these fields in `expectedOutput`, so it is more suitable than DocEE
for testing TamCam AI's Vietnamese chat and upload-file behavior.

## Evaluation

Run the local analyzer against the Vietnamese test set:

```bash
npm --prefix server run evaluate:dataset -- --input server/data/tamcam-vietnamese-test.jsonl --output server/reports/tamcam-vietnamese-test-local.json
```

For a quick smoke test:

```bash
npm --prefix server run evaluate:dataset -- --input server/data/tamcam-vietnamese-test.jsonl --limit 20
```

The evaluator reports:

- `hasTaskAccuracy`: whether the analyzer agrees that the document has tasks
- `taskCountExactAccuracy`: whether it predicts the exact task count
- `summaryF1`: word-overlap score for the document summary
- `titleF1`: word-overlap score for matched task titles
- `deadlineAccuracy`: deadline match rate when expected deadlines exist
- `startTimeAccuracy`: start-time match rate when expected start times exist

Current local-analyzer baseline on `tamcam-vietnamese-test.jsonl`:

```json
{
  "total": 250,
  "hasTaskAccuracy": 0.96,
  "taskCountExactAccuracy": 0.96,
  "summaryF1": 0.4565,
  "titleF1": 0.96,
  "deadlineAccuracy": 1,
  "startTimeAccuracy": 1
}
```

The script accepts flexible dataset shapes:

- Array of records
- `{ "data": [...] }`
- `{ "documents": [...] }`

It looks for common fields such as:

- Document text: `text`, `document`, `content`, `article`, `sentences`,
  `paragraphs`, `tokens`
- Events: `events`, `event_mentions`, `event_list`, `labels`
- Event type: `event_type`, `eventType`, `type`, `subtype`, `label`
- Trigger: `trigger`, `event_trigger`, `mention`, `text`, `anchor`
- Arguments: `arguments`, `args`, `argument_list`, `participants`, `roles`

## Recommended Next Step

Create a small Vietnamese validation set for TamCam AI:

- 30 uploaded study documents
- 30 office documents
- 30 scheduling/reminder examples
- 10 spreadsheet examples

Each should include expected summary, tasks, deadlines, and the answer to common
chat questions such as "noi dung la gi" and "toi can lam gi".
