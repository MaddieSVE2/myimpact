import { test, expect } from "@playwright/test";
import { TestApi } from "../helpers/api";
import { signInAsPersona } from "../helpers/auth";

const UNIVERSITY_MANAGER = "university@university.org";
const UNIVERSITY_STUDENT = "student@student.org";
const UNIVERSITY_STUDENT_ID = "uni-student-0000000000";

type ChallengeProgress = {
  total: number;
  contributingRecordIds: string[];
};

test.describe("Spec 22 — University consented challenge activity", () => {
  let api: TestApi;
  let challengeId: string | null = null;
  let recordId: string | null = null;

  test.beforeAll(async ({ baseURL }) => {
    api = await TestApi.create({ baseURL: baseURL! });
  });

  test.afterEach(async ({ page }) => {
    try {
      if (recordId) {
        const response = await page.request.delete(`/api/impact/${recordId}`);
        expect(response.ok()).toBe(true);
      }
    } finally {
      recordId = null;
      if (challengeId) {
        await api.deleteChallenge(challengeId);
        challengeId = null;
      }
    }
  });

  test.afterAll(async () => {
    await api.dispose();
  });

  test("a newly logged personal student activity counts once in an active university challenge", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const endOfWeek = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    const managerContext = await browser.newContext({ baseURL });

    try {
      const managerPage = await managerContext.newPage();
      await signInAsPersona(managerContext, managerPage, UNIVERSITY_MANAGER);

      const createChallenge = await managerPage.request.post("/api/challenges", {
        data: {
          name: `E2E University consent ${Date.now()}`,
          goalType: "hours",
          target: 100,
          startDate: startOfToday.toISOString(),
          endDate: endOfWeek.toISOString(),
          scope: "org",
        },
      });
      expect(createChallenge.ok()).toBe(true);
      challengeId = ((await createChallenge.json()) as { challenge: { id: string } }).challenge.id;

      await signInAsPersona(context, page, UNIVERSITY_STUDENT);

      const beforeResponse = await page.request.get(`/api/challenges/${challengeId}`);
      expect(beforeResponse.ok()).toBe(true);
      const before = (await beforeResponse.json()) as { progress: ChallengeProgress };

      const saveResponse = await page.request.post("/api/impact/save", {
        data: {
          userId: UNIVERSITY_STUDENT_ID,
          name: `E2E personal university activity ${Date.now()}`,
          entryDate: startOfToday.toISOString().slice(0, 10),
          kind: "quick_log",
          activities: [{ activityId: "food_bank", quantity: 3, hoursPerYear: 3 }],
          donationsGBP: 0,
          additionalVolunteerHours: 0,
        },
      });
      expect(saveResponse.ok()).toBe(true);
      const saved = (await saveResponse.json()) as {
        id: string;
        impactResult: { totalHours: number };
      };
      recordId = saved.id;

      const afterResponse = await page.request.get(`/api/challenges/${challengeId}`);
      expect(afterResponse.ok()).toBe(true);
      const after = (await afterResponse.json()) as { progress: ChallengeProgress };

      expect(after.progress.contributingRecordIds.filter((id) => id === recordId)).toHaveLength(1);
      expect(after.progress.total - before.progress.total).toBe(saved.impactResult.totalHours);
    } finally {
      await managerContext.close();
    }
  });
});