# REST and realtime API

All endpoints begin with `/api`. Send JSON for POST requests. Teacher and participant authentication use cookies. Errors have `{ "error": "message" }` with an appropriate HTTP status. No browser API key or bearer token is required.

| Method | Path | Authorization | Behavior |
| --- | --- | --- | --- |
| GET | /health | Public | Database readiness and configured provider |
| POST | /auth/register | Public | Create teacher with name, email, password |
| POST | /auth/login | Public | Sign in using email/password |
| GET | /auth/me | Public | Current teacher or null |
| POST | /auth/logout | Teacher cookie if present | Clear teacher cookie |
| POST | /ai/questions | Teacher | Generate validated question draft |
| GET | /quizzes | Teacher | List last 100 owned quizzes |
| POST | /quizzes | Teacher | Save reviewed question set |
| GET | /sessions | Teacher | Last 50 owned sessions |
| POST | /sessions | Teacher | Create session from owned quizId |
| POST | /sessions/:code/join | Public | Join lobby using display name; sets participant cookie |
| GET | /sessions/:code | Host or joined participant | Sanitized state and own answer status |
| POST | /sessions/:code/action | Host | next/reveal/finish with current version |
| POST | /sessions/:code/answers | Joined participant | Submit index and answer once before deadline |
| GET | /sessions/:code/results.csv | Host | Export ranked scores |

## Generate a question draft

```json
{"topic":"JavaScript","type":"multiple-choice","difficulty":"beginner","count":5}
```

`type` is `multiple-choice` or `true-false`. Difficulty is `beginner`, `intermediate` or `advanced`. Count is an integer 1–20 (demo has a smaller bank).

Response:

```json
{"source":"gemini","questions":[{"question":"Which keyword declares a reassignable block-scoped variable?","options":["var","let","const","static"],"correctAnswer":1,"explanation":"let creates a block-scoped binding that can be reassigned."}]}
```

## Save reviewed quiz / create session

```json
{"title":"JavaScript foundations","duration":30,"source":"gemini","questions":["Use actual question objects here"]}
```

Then `POST /sessions` with `{"quizId":"the-returned-uuid"}`. Duration must be 10–120 seconds.

## Socket.IO events

Client emits `session:watch` with the six-digit code and acknowledgment callback. The server authenticates room membership and acknowledges `{ok:true}` or `{error:"…"}`. Server emits `session:changed` without private data. Fetch the authorized snapshot to refresh.

The server does not trust a client-provided score, correct-answer flag, elapsed time or owner ID.
