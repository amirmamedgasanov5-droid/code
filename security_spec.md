# Security Specification - Nəsihetlər Mədrəsəsi

## Data Invariants
1. **User Identity**: A user cannot modify another user's profile. Admin can set roles.
2. **Chat Privacy**: Personal chats are only accessible (read/write) by the participants.
3. **Lesson Integrity**: Only teachers or admins can create/update/delete lessons in the timetable.
4. **Homework Flow**: Only teachers can create homework. Only students can submit homework.
5. **Score Integrity**: Game scores can only be updated by the user who achieved them, and only with a valid value.
6. **Interaction Safeguards**: Users cannot delete other users' messages in global chat.

## The "Dirty Dozen" Payloads (Red Team Test Cases)
1. **Identity Theft**: authenticated user `A` attempts to update user `B`'s profile.
2. **Privilege Escalation**: a student tries to set their role to `teacher`.
3. **Ghost Post**: an anonymous user tries to post to the global feed.
4. **Eavesdropping**: User `A` tries to read a personal chat between User `B` and User `C`.
5. **Orphaned Message**: User `A` tries to send a message to a chat they are not a part of.
6. **Shadow Update**: A student tries to modify the `daysOfWeek` in a lesson.
7. **Score Poisoning**: A user tries to set their `game_score` to a negative value or a non-numeric string.
8. **Feedback Injection**: A user tries to create a `Grade` entry for themselves.
9. **Timestamp Spoofing**: A user tries to set a `createdAt` date in the past.
10. **Shadow Key**: A user tries to inject a `isVerified: true` field into their profile.
11. **Admin Lookup Spoofing**: A user tries to read the `admins` collection.
12. **ID Poisoning**: A user tries to create a document with a 2KB string as an ID.

## Test Runner (firestore.rules.test.ts)
```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "nesihetler-medresesi",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });
});

test("authenticated user A cannot update user B's profile", async () => {
  const alice = testEnv.authenticatedContext("alice");
  await assertFails(alice.firestore().doc("users/bob").update({ name: "Hacked" }));
});

test("eavesdropping: Alice cannot read Bob's chat", async () => {
  const alice = testEnv.authenticatedContext("alice");
  await assertFails(alice.firestore().doc("chats/bob_chat").get());
});
```
