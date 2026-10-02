# Describe the project accurately

Suggested title: **QuizFlow — AI-assisted real-time classroom quiz platform**

After you run, understand and deploy it, adapt these bullets:

- Built a React and Express quiz platform with authenticated teacher accounts, PostgreSQL persistence, and Socket.IO classroom updates.
- Integrated server-side Gemini generation with JSON Schema output, Zod validation, bounded retries, and editable teacher review.
- Implemented transactional answer submission, deadline enforcement, duplicate-answer protection, speed-based scoring, and CSV results export.
- Packaged the app with Docker and CI checks for behavioral API/WebSocket tests and the production frontend build.

Add the actual deployed demo URL and repository URL. Do not claim "100 concurrent users tested" merely because a room permits 100 participants. Do not claim live Gemini validation until you have successfully generated questions with your own key.

Interview discussion prompts:

1. Why is the AI key server-side, and why validate structured output again?
2. What race does the session row lock prevent?
3. How are answers and scores hidden before reveal?
4. What happens when a browser disconnects or the server restarts?
5. Why does the application support one backend replica initially?
6. What would you normalize or measure before supporting thousands of participants?
7. How would you implement JWT revocation, password reset and organizational access?

Next useful work: add email verification/reset, shared Redis event/rate-limit stores, normalized answer tables, load testing and operational monitoring. Extend only after you can explain and verify the current flow.
