# IssueFlow interview questions and answers

These questions describe the implementation currently in this repository.

1. **How does a browser request travel through IssueFlow?**  
   The React app calls the Express API through one Axios instance configured with `withCredentials`. Express allows the configured frontend origin through credentialed CORS, parses JSON and cookies, then the route validates input, checks the session and authorization, and uses `mysql2` parameterized statements.

2. **Why is the frontend and backend split into workspace packages?**  
   `frontend` owns the Vite/React application and its build. `backend` owns the Express process, database pool, schema, seed command, and tests. Root npm scripts coordinate both in development and expose the build and test commands.

3. **How does login work, and where is the token stored?**  
   Login normalizes and validates the email, loads the user's password hash, compares it with bcrypt, signs a seven-day JWT, and returns the user profile. The JWT goes in an HttpOnly cookie, so frontend JavaScript cannot read it.

4. **What protections are used for passwords?**  
   Registration hashes passwords with bcryptjs at cost 12. Validation requires at least eight characters and rejects values over bcrypt's 72-byte input limit. Login returns the same generic error for an unknown email or incorrect password.

5. **How does the API avoid trusting stale JWT roles?**  
   JWT verification checks the signature and HS256 algorithm, but middleware then loads the current user row from MySQL and uses that database role. A role change or deleted account therefore takes effect on the next request.

6. **How are USER and ADMIN capabilities enforced?**  
   Public registration hardcodes role `USER`. Issue visibility is limited to admins, creators, and assignees. Creators or admins can edit issue details; only admins can change status or assignments. The admin user-list endpoint also uses `adminRequired`.

7. **Why does an unauthorized issue lookup return 404 instead of 403?**  
   `ensureVisible` returns the same not-found response when an issue does not exist or the caller cannot see it, which reduces issue-ID enumeration. Some explicit mutation permission failures return 403 after the issue has been found and is visible.

8. **How are SQL injection risks controlled?**  
   User values go through mysql2 placeholders. The few dynamic SQL fragments are made from fixed code-owned column names and known clauses; update field names come from a hard-coded allowlist, while their values remain parameters.

9. **How does PATCH prevent a user from changing protected fields?**  
   Zod rejects unknown keys and invalid values. The handler checks creator/admin status, rejects `status` and `assigneeId` for non-admins, validates the target assignee, and maps accepted field names to the SQL update columns.

10. **What does the relational schema model?**  
    `users` own or receive `issues`; `comments` and `issue_activity` reference an issue and an actor/author. Issue deletion cascades comments and activity, creator and comment-author references restrict user deletion, and deleting an assignee sets the assignment to null.

11. **Why does issue creation and editing use transactions?**  
    Issue creation and its CREATED event commit together. Issue field updates and their activity events also commit together, so an activity insert failure rolls back the corresponding issue change instead of leaving a partial history.

12. **How does issue listing work?**  
    The endpoint scopes regular users to issues they created or are assigned, applies optional title/status/priority filters, counts the matches, and returns a page ordered by most recently updated. Page size is capped at 50.

13. **How are dashboard counts scoped and represented for an empty result?**  
    Admins count all issues; regular users count only their created or assigned issues. SQL uses conditional sums with `COALESCE` so each status count is zero when there are no matching rows.

14. **How does error handling work?**  
    Zod errors return 400, duplicate-key errors return 409, foreign-key failures return a safe 400 message, and unknown errors are logged server-side but returned as a generic 500. Authentication failures return 401 and admin checks return 403.

15. **What is a deliberate limitation or trade-off in this version?**  
    Automated tests cover HTTP health/auth gates, validation, origin rejection, role middleware, and live-role loading, but not full database-backed CRUD. The project needs a running MySQL database for real end-to-end flows; the README documents setup and a manual walkthrough.
